import { test } from 'node:test';
import assert from 'node:assert/strict';
import dnsPacket from 'dns-packet';
import { Store } from '../src/db';
import { buildApi } from '../src/api';
import { Blocklists } from '../src/dns/blocklists';
import { Recorder, Resolver } from '../src/dns/resolver';
import type { Upstream } from '../src/dns/upstream';

/** Fake upstream: everything resolves to 93.184.216.34; tracker.shop.example is CNAME-cloaked. */
const fakeUpstream = {
  async query(packet: dnsPacket.Packet) {
    const q = packet.questions![0]!;
    const answers: dnsPacket.Answer[] =
      q.name === 'metrics.shop.example'
        ? [
            { type: 'CNAME', name: q.name, ttl: 60, class: 'IN', data: 'shop.tracker.example' },
            { type: 'A', name: 'shop.tracker.example', ttl: 60, class: 'IN', data: '10.0.0.1' },
          ]
        : [{ type: 'A', name: q.name, ttl: 60, class: 'IN', data: '93.184.216.34' }];
    return dnsPacket.encode({ type: 'response', id: packet.id, flags: 0x8180, questions: packet.questions, answers });
  },
  async resolve(name: string) {
    return [{ type: 'A', name, ttl: 60, class: 'IN', data: '216.239.38.120' }] as dnsPacket.Answer[];
  },
} as unknown as Upstream;

function setup() {
  const store = new Store(':memory:');
  const lists = new Blocklists({ adult: ['adult.example'], ads: ['ads.example'], trackers: ['tracker.example'] });
  const recorder = new Recorder(store);
  const resolver = new Resolver(store, lists, fakeUpstream, recorder);
  const app = buildApi(store, resolver);
  return { store, app, recorder };
}

function query(name: string, type: dnsPacket.RecordType = 'A') {
  return dnsPacket.encode({ type: 'query', id: 42, flags: dnsPacket.RECURSION_DESIRED, questions: [{ type, name, class: 'IN' }] });
}

async function doh(app: ReturnType<typeof setup>['app'], dnsId: string, name: string) {
  const res = await app.inject({
    method: 'GET',
    url: `/dns-query/${dnsId}?dns=${query(name).toString('base64url')}`,
  });
  assert.equal(res.statusCode, 200);
  return dnsPacket.decode(res.rawPayload);
}

async function signup(app: ReturnType<typeof setup>['app']) {
  const res = await app.inject({
    method: 'POST',
    url: '/v1/auth/signup',
    payload: { email: 'Parent@Example.com', password: 'correct horse' },
  });
  assert.equal(res.statusCode, 200, res.body);
  const { token } = res.json();
  return { authorization: `Bearer ${token}` };
}

test('full flow: signup, network, filtering over DoH, paywall, upgrade', async () => {
  const { app, recorder, store } = setup();
  const headers = await signup(app);

  const login = await app.inject({
    method: 'POST',
    url: '/v1/auth/login',
    payload: { email: 'parent@example.com', password: 'wrong password' },
  });
  assert.equal(login.statusCode, 401);

  const net = (await app.inject({ method: 'POST', url: '/v1/networks', headers, payload: { name: 'Home', timezone: 'America/Chicago' } })).json();
  assert.equal(net.policy.categories.adult, true);
  assert.equal(net.policy.categories.ads, false);

  // Free: only one network
  const second = await app.inject({ method: 'POST', url: '/v1/networks', headers, payload: { name: 'Cabin' } });
  assert.equal(second.statusCode, 402);

  // Filtering
  let ans = await doh(app, net.dnsId, 'www.adult.example');
  assert.equal((ans.answers![0] as dnsPacket.StringAnswer).data, '0.0.0.0');
  ans = await doh(app, net.dnsId, 'ads.example');
  assert.equal((ans.answers![0] as dnsPacket.StringAnswer).data, '93.184.216.34', 'free plan does not block ads');
  recorder.flush();
  const freeStats = (await app.inject({ method: 'GET', url: `/v1/networks/${net.id}/stats`, headers })).json();
  assert.equal(freeStats.totals.missedAds, 1, 'free users see what Plus would have blocked');
  ans = await doh(app, net.dnsId, 'www.google.com');
  assert.equal(ans.answers![0]!.type, 'CNAME');
  assert.equal((ans.answers![0] as dnsPacket.StringAnswer).data, 'forcesafesearch.google.com');

  // Unknown dnsId is refused (no open resolver)
  ans = await doh(app, 'nope', 'example.com');
  assert.equal((ans as dnsPacket.DecodedPacket & { rcode: string }).rcode, 'REFUSED');

  // Paywall: enabling ads on free returns 402 with the plan to upsell
  const locked = await app.inject({
    method: 'PATCH',
    url: `/v1/networks/${net.id}`,
    headers,
    payload: { policy: { categories: { ads: true } } },
  });
  assert.equal(locked.statusCode, 402);
  assert.equal(locked.json().requiredPlan, 'plus');
  assert.equal((await app.inject({ method: 'GET', url: `/v1/networks/${net.id}/activity`, headers })).statusCode, 402);

  // Upgrade (dev sync) -> ads + CNAME-cloaked trackers blocked
  await app.inject({ method: 'POST', url: '/v1/billing/sync', headers, payload: { plan: 'plus' } });
  const upgraded = (await app.inject({ method: 'GET', url: `/v1/networks/${net.id}`, headers })).json();
  assert.equal(upgraded.policy.categories.ads, true, 'upgrading switches on ad blocking automatically');
  assert.equal(upgraded.policy.categories.gambling, true);
  assert.equal(upgraded.policy.categories.social, false, 'opt-in categories stay off');
  const ok = await app.inject({
    method: 'PATCH',
    url: `/v1/networks/${net.id}`,
    headers,
    payload: { policy: { categories: { ads: true, trackers: true }, blocklist: ['https://www.Games.example/x'] } },
  });
  assert.equal(ok.statusCode, 200, ok.body);
  assert.deepEqual(ok.json().policy.blocklist, ['games.example']);
  ans = await doh(app, net.dnsId, 'ads.example');
  assert.equal((ans.answers![0] as dnsPacket.StringAnswer).data, '0.0.0.0');
  ans = await doh(app, net.dnsId, 'metrics.shop.example');
  assert.equal((ans.answers![0] as dnsPacket.StringAnswer).data, '0.0.0.0', 'CNAME cloaked tracker blocked');

  // Stats + activity
  recorder.flush();
  const stats = (await app.inject({ method: 'GET', url: `/v1/networks/${net.id}/stats?days=7`, headers })).json();
  assert.ok(stats.totals.blocked >= 3);
  assert.ok(stats.totals.adsBlocked >= 2);
  const activity = (await app.inject({ method: 'GET', url: `/v1/networks/${net.id}/activity?blocked=true`, headers })).json();
  assert.ok(activity.some((a: { domain: string }) => a.domain === 'metrics.shop.example'));

  // Profiles are Pro
  assert.equal(
    (await app.inject({ method: 'POST', url: `/v1/networks/${net.id}/profiles`, headers, payload: { name: 'Sam' } })).statusCode,
    402,
  );
  await app.inject({ method: 'POST', url: '/v1/billing/sync', headers, payload: { plan: 'pro' } });
  const prof = (await app.inject({ method: 'POST', url: `/v1/networks/${net.id}/profiles`, headers, payload: { name: 'Sam', emoji: '🦖' } })).json();
  assert.equal(prof.policy.categories.social, true);

  // Pause the child's internet
  await app.inject({ method: 'POST', url: `/v1/profiles/${prof.id}/pause`, headers, payload: { minutes: 30 } });
  ans = await doh(app, prof.dnsId, 'wikipedia.org');
  assert.equal((ans.answers![0] as dnsPacket.StringAnswer).data, '0.0.0.0');
  // parent's whole-home network not paused
  ans = await doh(app, net.dnsId, 'wikipedia.org');
  assert.equal((ans.answers![0] as dnsPacket.StringAnswer).data, '93.184.216.34');

  // Downgrade: profile falls back to household rules, pause no longer enforced
  store.setPlan((await app.inject({ method: 'GET', url: '/v1/me', headers })).json().user.id, 'free', null);
  ans = await doh(app, prof.dnsId, 'wikipedia.org');
  assert.equal((ans.answers![0] as dnsPacket.StringAnswer).data, '93.184.216.34');

  // Apple profile
  const mc = await app.inject({ method: 'GET', url: `/v1/apple-profile/${net.dnsId}.mobileconfig` });
  assert.equal(mc.statusCode, 200);
  assert.match(mc.body, /com\.apple\.dnsSettings\.managed/);
  assert.match(mc.body, new RegExp(`/dns-query/${net.dnsId}`));
});

test('whole-home: linked public IP identifies the network', async () => {
  const { app, store } = setup();
  const headers = await signup(app);
  const net = (await app.inject({ method: 'POST', url: '/v1/networks', headers, payload: { name: 'Home' } })).json();
  const linked = (await app.inject({ method: 'POST', url: `/v1/networks/${net.id}/link`, headers, remoteAddress: '198.51.100.7' })).json();
  assert.equal(linked.linkedIp, '198.51.100.7');
  assert.equal(store.resolveClient({ ip: '198.51.100.7' })?.networkId, net.id);
  assert.equal(store.resolveClient({ ip: '198.51.100.8' }), null);
});

test('revenuecat webhook grants and expires plans', async () => {
  const { app, store } = setup();
  const headers = await signup(app);
  const userId = (await app.inject({ method: 'GET', url: '/v1/me', headers })).json().user.id;
  const send = (event: object, auth = '') =>
    app.inject({ method: 'POST', url: '/v1/billing/revenuecat', headers: { authorization: auth }, payload: { event } });
  // config secret is empty in tests -> webhook rejected
  assert.equal((await send({ type: 'INITIAL_PURCHASE', app_user_id: userId })).statusCode, 401);
  const { planFromEvent } = await import('../src/billing');
  const change = planFromEvent({
    type: 'INITIAL_PURCHASE',
    app_user_id: userId,
    entitlement_ids: ['plus', 'pro'],
    expiration_at_ms: Date.now() + 86_400_000,
  });
  assert.equal(change?.plan, 'pro');
  assert.equal(planFromEvent({ type: 'CANCELLATION', app_user_id: userId }), null);
  assert.equal(planFromEvent({ type: 'EXPIRATION', app_user_id: userId })?.plan, 'free');
  store.setPlan(userId, 'pro', new Date(Date.now() - 1000).toISOString());
  assert.equal(store.getUser(userId)?.plan, 'free', 'expired plans fall back to free');
});

test('remote management: Free/Plus manage from home only, Pro from anywhere', async () => {
  const { app, store } = setup();
  const headers = await signup(app);
  const HOME = '198.51.100.7';
  const WORK = '203.0.113.99';
  const net = (await app.inject({ method: 'POST', url: '/v1/networks', headers, payload: { name: 'Home' }, remoteAddress: HOME })).json();
  await app.inject({ method: 'POST', url: `/v1/networks/${net.id}/link`, headers, remoteAddress: HOME });
  await app.inject({ method: 'POST', url: '/v1/billing/sync', headers, payload: { plan: 'plus' } });

  const patch = (ip: string) =>
    app.inject({
      method: 'PATCH',
      url: `/v1/networks/${net.id}`,
      headers,
      remoteAddress: ip,
      payload: { policy: { youtubeRestricted: true } },
    });
  const status = async (ip: string) =>
    (await app.inject({ method: 'GET', url: `/v1/networks/${net.id}/status`, headers, remoteAddress: ip })).json();

  // At home: allowed
  assert.equal((await patch(HOME)).statusCode, 200);
  assert.deepEqual([(await status(HOME)).atHome, (await status(HOME)).canManage], [true, true]);

  // At work on Plus: viewing works, changing is an upsell to Pro
  const away = await status(WORK);
  assert.deepEqual([away.atHome, away.canManage], [false, false]);
  assert.equal((await app.inject({ method: 'GET', url: `/v1/networks/${net.id}/stats`, headers, remoteAddress: WORK })).statusCode, 200);
  const denied = await patch(WORK);
  assert.equal(denied.statusCode, 402);
  assert.equal(denied.json().feature, 'remoteManagement');
  assert.equal(denied.json().requiredPlan, 'pro');
  assert.equal(
    (await app.inject({ method: 'GET', url: `/v1/networks/${net.id}/activity`, headers, remoteAddress: WORK })).statusCode,
    402,
  );

  // Can't dodge the rule by re-linking "home" to the office...
  const relink = await app.inject({ method: 'POST', url: `/v1/networks/${net.id}/link`, headers, remoteAddress: WORK });
  assert.equal(relink.statusCode, 402);
  assert.equal(store.resolveClient({ ip: HOME })?.networkId, net.id, 'home stays linked');

  // ...but a genuine home IP change (router there already sends us DNS) re-links fine.
  const NEW_HOME = '198.51.100.8';
  const q = dnsPacket.encode({ type: 'query', id: 1, flags: dnsPacket.RECURSION_DESIRED, questions: [{ type: 'A', name: 'example.com', class: 'IN' }] });
  await app.inject({ method: 'GET', url: `/dns-query?dns=${q.toString('base64url')}`, remoteAddress: NEW_HOME });
  const moved = await app.inject({ method: 'POST', url: `/v1/networks/${net.id}/link`, headers, remoteAddress: NEW_HOME });
  assert.equal(moved.statusCode, 200);
  assert.equal(moved.json().linkedIp, NEW_HOME);

  // Pro: manage from anywhere
  await app.inject({ method: 'POST', url: '/v1/billing/sync', headers, payload: { plan: 'pro' } });
  assert.equal((await patch(WORK)).statusCode, 200);
  assert.equal((await status(WORK)).canManage, true);
  const pause = await app.inject({ method: 'POST', url: `/v1/networks/${net.id}/pause`, headers, remoteAddress: WORK, payload: { minutes: 30 } });
  assert.equal(pause.statusCode, 200);
});

test('device-only networks (no linked IP) are never restricted', async () => {
  const { app } = setup();
  const headers = await signup(app);
  const net = (await app.inject({ method: 'POST', url: '/v1/networks', headers, payload: { name: 'Phone' } })).json();
  const res = await app.inject({
    method: 'PATCH',
    url: `/v1/networks/${net.id}`,
    headers,
    remoteAddress: '203.0.113.50',
    payload: { policy: { safeSearch: false } },
  });
  assert.equal(res.statusCode, 200);
  const st = (await app.inject({ method: 'GET', url: `/v1/networks/${net.id}/status`, headers })).json();
  assert.equal(st.atHome, null);
});
