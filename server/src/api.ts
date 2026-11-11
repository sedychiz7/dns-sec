import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { z } from 'zod';
import {
  type Feature,
  type Network,
  type PlanId,
  type Policy,
  type Profile,
  type SetupInfo,
  type StatsResponse,
  type User,
  CATEGORY_IDS,
  PLANS,
  PLAN_ORDER,
  hasFeature,
  isValidHHMM,
  lockedFeaturesUsed,
  minimumPlanFor,
  normalizeDomain,
} from '@kinshield/shared';
import { config } from './config';
import type { Store } from './db';
import { hashPassword, issueToken, verifyPassword, verifyToken } from './auth';
import { planFromEvent, type RevenueCatEvent } from './billing';
import { buildAppleProfile } from './appleProfile';
import type { Resolver } from './dns/resolver';

class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

function upgradeRequired(feature: Feature): HttpError {
  const requiredPlan = minimumPlanFor(feature);
  return new HttpError(402, 'upgrade_required', `This needs ${PLANS[requiredPlan].name}.`, { feature, requiredPlan });
}

function nextPlan(plan: PlanId): PlanId | null {
  return PLAN_ORDER[PLAN_ORDER.indexOf(plan) + 1] ?? null;
}

// ---------- validation ----------

const scheduleSchema = z.object({
  id: z.string().min(1).max(40),
  name: z.string().min(1).max(40),
  enabled: z.boolean(),
  days: z.array(z.number().int().min(0).max(6)).max(7) as z.ZodType<Policy['schedules'][number]['days']>,
  start: z.string().refine(isValidHHMM, 'Use HH:MM'),
  end: z.string().refine(isValidHHMM, 'Use HH:MM'),
  mode: z.enum(['offline', 'focus']),
  categories: z.array(z.enum(CATEGORY_IDS as [string, ...string[]])) as z.ZodType<
    Policy['schedules'][number]['categories']
  >,
});

const policyPatchSchema = z
  .object({
    categories: z.record(z.enum(CATEGORY_IDS as [string, ...string[]]), z.boolean()),
    safeSearch: z.boolean(),
    youtubeRestricted: z.boolean(),
    allowlist: z.array(z.string().max(253)),
    blocklist: z.array(z.string().max(253)),
    schedules: z.array(scheduleSchema).max(20),
    pausedUntil: z.string().datetime().nullable(),
  })
  .partial();

const credentialsSchema = z.object({
  email: z.string().email().max(254).transform((e) => e.toLowerCase().trim()),
  password: z.string().min(8).max(200),
});

function parse<S extends z.ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const r = schema.safeParse(data);
  if (!r.success) {
    throw new HttpError(400, 'invalid_request', r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
  }
  return r.data;
}

function cleanList(list: string[]): string[] {
  const out = new Set<string>();
  for (const raw of list) {
    const d = normalizeDomain(raw);
    if (!d) throw new HttpError(400, 'invalid_domain', `"${raw}" is not a valid website address.`);
    out.add(d);
  }
  return [...out];
}

/** Merges a partial policy into the stored one, enforcing what the plan allows. */
function applyPolicyPatch(current: Policy, patchRaw: unknown, plan: PlanId): Policy {
  const patch = parse(policyPatchSchema, patchRaw);
  const next: Policy = {
    ...current,
    ...patch,
    categories: { ...current.categories, ...(patch.categories as Partial<Policy['categories']>) },
  } as Policy;
  if (patch.allowlist) next.allowlist = cleanList(patch.allowlist);
  if (patch.blocklist) next.blocklist = cleanList(patch.blocklist);

  // Only complain about features the user is *turning on* in this request.
  const locked = lockedFeaturesUsed(
    {
      categories: patch.categories as Policy['categories'] | undefined,
      youtubeRestricted: patch.youtubeRestricted,
      allowlist: patch.allowlist,
      blocklist: patch.blocklist,
      schedules: patch.schedules,
      pausedUntil: patch.pausedUntil,
    },
    plan,
  );
  if (locked.length) throw upgradeRequired(locked[0]!);

  const cap = PLANS[plan].limits.customListEntries;
  if (next.allowlist.length + next.blocklist.length > cap) {
    const np = nextPlan(plan);
    if (np) {
      throw new HttpError(402, 'upgrade_required', `Your plan allows ${cap} custom sites.`, {
        feature: 'customLists',
        requiredPlan: np,
      });
    }
    throw new HttpError(400, 'limit_reached', `You can add up to ${cap} custom sites.`);
  }
  return next;
}

// ---------- app ----------

export function buildApi(store: Store, resolver: Resolver) {
  const app = Fastify({ logger: config.isProd, trustProxy: config.trustProxy, bodyLimit: 256 * 1024 });

  app.register(cors, { origin: true, methods: ['GET', 'HEAD', 'POST', 'PATCH', 'DELETE'] });
  app.register(rateLimit, { global: false });

  app.addContentTypeParser('application/dns-message', { parseAs: 'buffer' }, (_req, body, done) => done(null, body));

  app.setErrorHandler((err: Error & { statusCode?: number }, _req, reply) => {
    if (err instanceof HttpError) {
      return reply.status(err.status).send({ error: err.code, message: err.message, ...err.extra });
    }
    if (err.statusCode && err.statusCode < 500) {
      return reply.status(err.statusCode).send({ error: 'bad_request', message: err.message });
    }
    app.log.error(err);
    return reply.status(500).send({ error: 'internal', message: 'Something went wrong.' });
  });

  const authed = (req: FastifyRequest): User => {
    const header = req.headers.authorization ?? '';
    const userId = header.startsWith('Bearer ') ? verifyToken(header.slice(7)) : null;
    const user = userId ? store.getUser(userId) : null;
    if (!user) throw new HttpError(401, 'unauthorized', 'Please sign in again.');
    return user;
  };

  const ownNetwork = (req: FastifyRequest, user: User): Network => {
    const { id } = req.params as { id: string };
    const n = store.getNetwork(id, user.id);
    if (!n) throw new HttpError(404, 'not_found', 'Network not found.');
    return n;
  };

  const ownProfile = (req: FastifyRequest, user: User) => {
    const { id } = req.params as { id: string };
    const found = store.getProfile(id, user.id);
    if (!found) throw new HttpError(404, 'not_found', 'Profile not found.');
    return found;
  };

  const setupFor = (dnsId: string, linkedIp: string | null): SetupInfo => ({
    dnsServers: { ipv4: config.resolverIpv4, ipv6: config.resolverIpv6 },
    dohUrl: `${config.publicUrl}/dns-query/${dnsId}`,
    dotHostname: `${dnsId}.${config.dotDomain}`,
    appleProfileUrl: `${config.publicUrl}/v1/apple-profile/${dnsId}.mobileconfig`,
    linkedIp,
  });

  const authLimit = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } };

  // ----- health -----
  app.get('/healthz', async () => ({ ok: true }));

  // ----- auth -----
  app.post('/v1/auth/signup', authLimit, async (req) => {
    const { email, password } = parse(credentialsSchema, req.body);
    if (store.getUserWithHash(email)) throw new HttpError(409, 'email_taken', 'That email already has an account.');
    const user = store.createUser(email, hashPassword(password));
    return { token: issueToken(user.id), user };
  });

  app.post('/v1/auth/login', authLimit, async (req) => {
    const { email, password } = parse(credentialsSchema, req.body);
    const found = store.getUserWithHash(email);
    if (!found || !verifyPassword(password, found.hash)) {
      throw new HttpError(401, 'invalid_credentials', 'Wrong email or password.');
    }
    return { token: issueToken(found.user.id), user: found.user };
  });

  app.get('/v1/me', async (req) => {
    const user = authed(req);
    return { user, plan: PLANS[user.plan] };
  });

  // Required by App Store guideline 5.1.1(v): in-app account deletion.
  app.delete('/v1/me', async (req, reply) => {
    const user = authed(req);
    store.deleteUser(user.id);
    return reply.status(204).send();
  });

  // ----- networks -----
  app.get('/v1/networks', async (req) => store.listNetworks(authed(req).id));

  app.post('/v1/networks', async (req) => {
    const user = authed(req);
    const body = parse(
      z.object({ name: z.string().min(1).max(40), timezone: z.string().min(1).max(64).default('UTC') }),
      req.body,
    );
    if (store.countNetworks(user.id) >= PLANS[user.plan].limits.networks) {
      throw new HttpError(402, 'upgrade_required', 'Protect more locations with Pro.', {
        feature: 'multiNetwork',
        requiredPlan: 'pro',
      });
    }
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: body.timezone });
    } catch {
      throw new HttpError(400, 'invalid_timezone', 'Unknown timezone.');
    }
    return store.createNetwork(user.id, body.name, body.timezone, user.plan);
  });

  app.get('/v1/networks/:id', async (req) => ownNetwork(req, authed(req)));

  app.patch('/v1/networks/:id', async (req) => {
    const user = authed(req);
    const network = ownNetwork(req, user);
    const body = parse(
      z.object({ name: z.string().min(1).max(40).optional(), policy: z.unknown().optional() }),
      req.body,
    );
    const policy = body.policy !== undefined ? applyPolicyPatch(network.policy, body.policy, user.plan) : undefined;
    store.updateNetwork(network.id, { name: body.name, policy });
    return store.getNetwork(network.id, user.id);
  });

  app.delete('/v1/networks/:id', async (req, reply) => {
    const user = authed(req);
    store.deleteNetwork(ownNetwork(req, user).id);
    return reply.status(204).send();
  });

  /**
   * Whole-home protection: the app calls this while the phone is on the home
   * Wi-Fi. The request's source IP is the router's public IP, so DNS queries
   * from that IP get this network's rules. The app re-calls it whenever it
   * notices the IP changed (most home IPs are dynamic).
   */
  app.post('/v1/networks/:id/link', async (req) => {
    const user = authed(req);
    const network = ownNetwork(req, user);
    store.linkIp(network.id, req.ip.replace(/^::ffff:/, ''));
    return store.getNetwork(network.id, user.id);
  });

  app.get('/v1/networks/:id/setup', async (req) => {
    const n = ownNetwork(req, authed(req));
    return setupFor(n.dnsId, n.linkedIp);
  });

  app.get('/v1/networks/:id/status', async (req) => {
    const n = ownNetwork(req, authed(req));
    const recent = n.lastSeenAt && Date.now() - new Date(n.lastSeenAt).getTime() < 15 * 60_000;
    return { protected: Boolean(recent), lastSeenAt: n.lastSeenAt, linkedIp: n.linkedIp, yourIp: req.ip.replace(/^::ffff:/, '') };
  });

  app.post('/v1/networks/:id/pause', async (req) => {
    const user = authed(req);
    const network = ownNetwork(req, user);
    if (!hasFeature(user.plan, 'pauseInternet')) throw upgradeRequired('pauseInternet');
    const { minutes } = parse(z.object({ minutes: z.number().int().min(1).max(24 * 60).nullable() }), req.body);
    const pausedUntil = minutes ? new Date(Date.now() + minutes * 60_000).toISOString() : null;
    store.updateNetwork(network.id, { policy: { ...network.policy, pausedUntil } });
    return store.getNetwork(network.id, user.id);
  });

  app.get('/v1/networks/:id/stats', async (req): Promise<StatsResponse> => {
    const user = authed(req);
    const network = ownNetwork(req, user);
    const { days } = parse(z.object({ days: z.coerce.number().int().min(1).max(90).default(7) }), req.query);
    const allowed = Math.min(days, PLANS[user.plan].limits.statsDays);
    const since = new Date(Date.now() - (allowed - 1) * 86_400_000).toISOString().slice(0, 10);
    const { days: rows, top } = store.getStats(network.id, since);
    const totals = { total: 0, blocked: 0, adsBlocked: 0, threatsBlocked: 0, missedAds: 0 };
    for (const d of rows) {
      totals.total += d.total;
      totals.blocked += d.blocked;
      totals.adsBlocked += (d.byCategory.ads ?? 0) + (d.byCategory.trackers ?? 0);
      totals.threatsBlocked += d.byCategory.security ?? 0;
      totals.missedAds += d.byCategory.missedAds ?? 0;
    }
    return { days: rows, totals, topBlocked: top };
  });

  app.get('/v1/networks/:id/activity', async (req) => {
    const user = authed(req);
    const network = ownNetwork(req, user);
    if (!hasFeature(user.plan, 'activityLog')) throw upgradeRequired('activityLog');
    const q = parse(
      z.object({
        limit: z.coerce.number().int().min(1).max(500).default(100),
        blocked: z.enum(['true', 'false']).optional(),
        profileId: z.string().optional(),
        search: z.string().max(100).optional(),
      }),
      req.query,
    );
    return store.getActivity(network.id, {
      limit: q.limit,
      blockedOnly: q.blocked === 'true',
      profileId: q.profileId,
      search: q.search,
    });
  });

  // ----- profiles (Pro) -----
  app.post('/v1/networks/:id/profiles', async (req) => {
    const user = authed(req);
    const network = ownNetwork(req, user);
    if (!hasFeature(user.plan, 'profiles')) throw upgradeRequired('profiles');
    if (network.profiles.length >= PLANS[user.plan].limits.profiles) {
      throw new HttpError(400, 'limit_reached', `You can have up to ${PLANS[user.plan].limits.profiles} profiles.`);
    }
    const body = parse(
      z.object({ name: z.string().min(1).max(30), emoji: z.string().min(1).max(8).default('🧒') }),
      req.body,
    );
    // Kids start stricter than the household default.
    const policy: Policy = { ...network.policy, categories: { ...network.policy.categories, social: true, dating: true } };
    return store.createProfile(network.id, body.name, body.emoji, policy);
  });

  app.patch('/v1/profiles/:id', async (req): Promise<Profile> => {
    const user = authed(req);
    const { profile } = ownProfile(req, user);
    if (!hasFeature(user.plan, 'profiles')) throw upgradeRequired('profiles');
    const body = parse(
      z.object({
        name: z.string().min(1).max(30).optional(),
        emoji: z.string().min(1).max(8).optional(),
        policy: z.unknown().optional(),
      }),
      req.body,
    );
    const policy = body.policy !== undefined ? applyPolicyPatch(profile.policy, body.policy, user.plan) : undefined;
    store.updateProfile(profile.id, { name: body.name, emoji: body.emoji, policy });
    return store.getProfile(profile.id, user.id)!.profile;
  });

  app.post('/v1/profiles/:id/pause', async (req) => {
    const user = authed(req);
    const { profile } = ownProfile(req, user);
    if (!hasFeature(user.plan, 'pauseInternet')) throw upgradeRequired('pauseInternet');
    const { minutes } = parse(z.object({ minutes: z.number().int().min(1).max(24 * 60).nullable() }), req.body);
    const pausedUntil = minutes ? new Date(Date.now() + minutes * 60_000).toISOString() : null;
    store.updateProfile(profile.id, { policy: { ...profile.policy, pausedUntil } });
    return store.getProfile(profile.id, user.id)!.profile;
  });

  app.get('/v1/profiles/:id/setup', async (req) => {
    const { profile } = ownProfile(req, authed(req));
    return setupFor(profile.dnsId, null);
  });

  app.delete('/v1/profiles/:id', async (req, reply) => {
    const { profile } = ownProfile(req, authed(req));
    store.deleteProfile(profile.id);
    return reply.status(204).send();
  });

  // ----- device setup (public; the unguessable dnsId is the capability) -----
  app.get('/v1/apple-profile/:file', async (req, reply) => {
    const { file } = req.params as { file: string };
    const dnsId = file.replace(/\.mobileconfig$/, '');
    const found = store.findByDnsId(dnsId);
    if (!found) throw new HttpError(404, 'not_found', 'Unknown setup link.');
    const body = buildAppleProfile({
      brand: config.brand,
      dnsId,
      dohUrl: `${config.publicUrl}/dns-query/${dnsId}`,
      displayName: found.profile?.name ?? found.network.name,
      serverAddresses: config.resolverIpv4,
    });
    return reply
      .header('content-type', 'application/x-apple-aspen-config')
      .header('content-disposition', `attachment; filename="${config.brand}.mobileconfig"`)
      .send(body);
  });

  // ----- DNS-over-HTTPS (RFC 8484) -----
  const doh = async (req: FastifyRequest, reply: FastifyReply) => {
    const { dnsId } = (req.params ?? {}) as { dnsId?: string };
    let msg: Buffer | null = null;
    if (req.method === 'GET') {
      const { dns } = req.query as { dns?: string };
      if (dns) msg = Buffer.from(dns, 'base64url');
    } else if (Buffer.isBuffer(req.body)) {
      msg = req.body;
    }
    if (!msg || msg.length < 12) throw new HttpError(400, 'bad_dns_message', 'Missing DNS message.');
    const res = await resolver.handle(msg, { dnsId, ip: req.ip.replace(/^::ffff:/, '') });
    return reply.header('content-type', 'application/dns-message').header('cache-control', 'max-age=0').send(res);
  };
  app.get('/dns-query', doh);
  app.post('/dns-query', doh);
  app.get('/dns-query/:dnsId', doh);
  app.post('/dns-query/:dnsId', doh);

  // ----- billing -----
  app.post('/v1/billing/revenuecat', async (req, reply) => {
    if (!config.revenueCatWebhookSecret || req.headers.authorization !== config.revenueCatWebhookSecret) {
      throw new HttpError(401, 'unauthorized', 'Bad webhook secret.');
    }
    const { event } = req.body as { event: RevenueCatEvent };
    const change = event ? planFromEvent(event) : null;
    if (change) {
      const candidates = [event.app_user_id, event.original_app_user_id, ...(event.aliases ?? [])];
      const userId = candidates.find((id) => id && store.getUser(id));
      if (userId) store.setPlan(userId, change.plan, change.expiresAt);
    }
    return reply.status(200).send({ ok: true });
  });

  /**
   * Lets the app reflect a purchase instantly (before the webhook lands).
   * In dev it also lets you switch plans without a store purchase.
   * In production, verify against RevenueCat's REST API before trusting it.
   */
  app.post('/v1/billing/sync', async (req) => {
    const user = authed(req);
    const { plan } = parse(z.object({ plan: z.enum(['free', 'plus', 'pro']) }), req.body);
    if (!config.allowDevPlanSwitch) {
      // TODO(prod): GET https://api.revenuecat.com/v1/subscribers/{user.id} with your secret key
      // and derive the plan from its active entitlements instead of trusting the client.
      return { user };
    }
    store.setPlan(user.id, plan, plan === 'free' ? null : new Date(Date.now() + 30 * 86_400_000).toISOString());
    return { user: store.getUser(user.id) };
  });

  app.get('/v1/plans', async () => PLAN_ORDER.map((id) => PLANS[id]));

  return app;
}

