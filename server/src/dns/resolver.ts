import dnsPacket from 'dns-packet';
import { type CategoryId, type PlanId, PLANS, clampPolicy, hasFeature } from '@kinshield/shared';
import type { ClientContext, Store } from '../db';
import type { BlocklistLookup } from './blocklists';
import { type Decision, decide } from './engine';
import type { Upstream } from './upstream';

const FLAGS = dnsPacket.RECURSION_DESIRED | dnsPacket.RECURSION_AVAILABLE;
const RCODE_SERVFAIL = 2;
const RCODE_REFUSED = 5;

export interface ClientHint {
  /** From the DoH path, DoT SNI hostname or Apple profile. */
  dnsId?: string;
  /** Source IP - used to find a whole-home network by its linked public IP. */
  ip: string;
}

/** Buffers per-network counters and (paid plans) per-query logs, flushing to the DB periodically. */
export class Recorder {
  private stats = new Map<
    string,
    { total: number; blocked: number; byCategory: Record<string, number>; domains: Map<string, number> }
  >();
  private log: Parameters<Store['insertQueryLog']>[0] = [];
  private seen = new Map<string, { networkId: string; profileId: string | null; at: string }>();

  constructor(private store: Store) {}

  /** `missedAd`: an ad/tracker we let through only because the plan lacks ad blocking (powers the upsell). */
  record(ctx: ClientContext, domain: string, decision: Decision, now: Date, missedAd = false) {
    const day = now.toISOString().slice(0, 10);
    const key = `${ctx.networkId}|${day}`;
    let s = this.stats.get(key);
    if (!s) {
      s = { total: 0, blocked: 0, byCategory: {}, domains: new Map() };
      this.stats.set(key, s);
    }
    s.total++;
    const blocked = decision.action === 'block';
    if (missedAd) s.byCategory.missedAds = (s.byCategory.missedAds ?? 0) + 1;
    if (blocked) {
      s.blocked++;
      s.byCategory[decision.reason] = (s.byCategory[decision.reason] ?? 0) + 1;
      s.domains.set(domain, (s.domains.get(domain) ?? 0) + 1);
    }
    if (PLANS[ctx.plan].limits.activityRetentionDays > 0) {
      this.log.push({
        networkId: ctx.networkId,
        profileId: ctx.profileId,
        at: now.toISOString(),
        domain,
        blocked,
        reason: decision.reason,
      });
    }
    this.seen.set(`${ctx.networkId}|${ctx.profileId}`, {
      networkId: ctx.networkId,
      profileId: ctx.profileId,
      at: now.toISOString(),
    });
  }

  flush() {
    const stats = this.stats;
    const log = this.log;
    const seen = this.seen;
    this.stats = new Map();
    this.log = [];
    this.seen = new Map();
    for (const [key, s] of stats) {
      const [networkId, day] = key.split('|') as [string, string];
      try {
        this.store.addDailyStats(networkId, day, s.total, s.blocked, s.byCategory, s.domains);
      } catch {
        // network may have been deleted in the meantime
      }
    }
    if (log.length) this.store.insertQueryLog(log);
    for (const v of seen.values()) this.store.touch(v.networkId, v.profileId, v.at);
  }
}

export class Resolver {
  /** Source IPs we refused recently (no network linked). Proves a router at that IP points at us. */
  private refused = new Map<string, number>();

  constructor(
    private store: Store,
    private lists: BlocklistLookup,
    private upstream: Upstream,
    private recorder: Recorder,
    private now: () => Date = () => new Date(),
  ) {}

  /** Handles one DNS message in wire format and returns the wire-format answer. */
  async handle(msg: Buffer, hint: ClientHint): Promise<Buffer> {
    let req: dnsPacket.DecodedPacket;
    try {
      req = dnsPacket.decode(msg);
    } catch {
      return Buffer.alloc(0);
    }
    const q = req.questions?.[0];
    if (!q) return reply(req, [], RCODE_SERVFAIL);

    const ctx = hint.dnsId
      ? this.store.resolveClient({ dnsId: hint.dnsId })
      : this.store.resolveClient({ ip: hint.ip });
    // Never act as an open resolver: unknown clients are refused (prevents amplification abuse).
    if (!ctx) {
      if (!hint.dnsId) {
        if (this.refused.size > 100_000) this.refused.clear();
        this.refused.set(hint.ip, Date.now());
      }
      return reply(req, [], RCODE_REFUSED);
    }

    const now = this.now();
    const policy = clampPolicy(ctx.policy, ctx.plan);
    const domain = q.name.toLowerCase().replace(/\.$/, '');
    let decision = decide(domain, { policy, timezone: ctx.timezone, now }, this.lists);

    try {
      if (decision.action === 'block') {
        this.recorder.record(ctx, domain, decision, now);
        return blockReply(req, q);
      }
      if (decision.action === 'rewrite') {
        this.recorder.record(ctx, domain, decision, now);
        return await this.rewriteReply(req, q, decision.target);
      }

      const res = await this.upstream.query(req);
      const uncloaked = this.checkCnameCloaking(res, ctx.plan, policy.categories);
      if (uncloaked) {
        decision = { action: 'block', reason: uncloaked };
        this.recorder.record(ctx, domain, decision, now);
        return blockReply(req, q);
      }
      const missedAd =
        !hasFeature(ctx.plan, 'adBlocking') && this.lists.match(domain, ['ads', 'trackers']) !== null;
      this.recorder.record(ctx, domain, decision, now, missedAd);
      return res;
    } catch {
      return reply(req, [], RCODE_SERVFAIL);
    }
  }

  /** Did DNS queries arrive from this IP (with no network linked) in the last `withinMs`? */
  sawUnlinkedTraffic(ip: string, withinMs = 30 * 60_000): boolean {
    const t = this.refused.get(ip);
    return t !== undefined && Date.now() - t < withinMs;
  }

  /**
   * CNAME cloaking: "metrics.shop.com" CNAMEs to a tracker so it looks
   * first-party and dodges normal blocklists. We inspect the chain the
   * upstream returned and block if any hop is a known ad/tracking domain.
   */
  private checkCnameCloaking(
    res: Buffer,
    plan: PlanId,
    categories: Record<CategoryId, boolean>,
  ): CategoryId | null {
    if (!hasFeature(plan, 'cnameUncloaking')) return null;
    const enabled = (['ads', 'trackers'] as CategoryId[]).filter((c) => categories[c]);
    if (!enabled.length) return null;
    const answers = dnsPacket.decode(res).answers ?? [];
    for (const a of answers) {
      if (a.type === 'CNAME') {
        const hit = this.lists.match(String(a.data).toLowerCase(), enabled);
        if (hit) return hit;
      }
    }
    return null;
  }

  private async rewriteReply(req: dnsPacket.DecodedPacket, q: dnsPacket.Question, target: string): Promise<Buffer> {
    const answers: dnsPacket.Answer[] = [{ type: 'CNAME', name: q.name, ttl: 300, class: 'IN', data: target }];
    if (q.type === 'A' || q.type === 'AAAA') {
      answers.push(...(await this.upstream.resolve(target, q.type)));
    }
    return reply(req, answers, 0);
  }
}

function reply(req: dnsPacket.DecodedPacket, answers: dnsPacket.Answer[], rcode: number): Buffer {
  return dnsPacket.encode({
    type: 'response',
    id: req.id,
    flags: FLAGS | rcode,
    questions: req.questions,
    answers,
  });
}

/** Blocked names resolve to 0.0.0.0 / :: so apps fail fast instead of hanging. */
function blockReply(req: dnsPacket.DecodedPacket, q: dnsPacket.Question): Buffer {
  const answers: dnsPacket.Answer[] = [];
  if (q.type === 'A') answers.push({ type: 'A', name: q.name, ttl: 60, class: 'IN', data: '0.0.0.0' });
  if (q.type === 'AAAA') answers.push({ type: 'AAAA', name: q.name, ttl: 60, class: 'IN', data: '::' });
  return reply(req, answers, 0);
}
