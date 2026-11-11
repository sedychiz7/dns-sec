import fs from 'node:fs';
import { PLANS } from '@kinshield/shared';
import { config } from './config';
import { Store } from './db';
import { buildApi } from './api';
import { Blocklists } from './dns/blocklists';
import { Recorder, Resolver } from './dns/resolver';
import { Upstream } from './dns/upstream';
import { startDot, startTcp, startUdp } from './dns/listeners';

const store = new Store(config.dbFile);
let lists = Blocklists.loadFromDisk(config.seedDir, config.blocklistDir);
const upstream = new Upstream(config.upstreams, config.upstreamTimeoutMs);
const recorder = new Recorder(store);
const lookup = { match: (...args: Parameters<Blocklists['match']>) => lists.match(...args) };
const resolver = new Resolver(store, lookup, upstream, recorder);

// Reload blocklists without downtime after `npm run update-blocklists`.
process.on('SIGHUP', () => {
  lists = Blocklists.loadFromDisk(config.seedDir, config.blocklistDir);
  console.log('Blocklists reloaded');
});

setInterval(() => recorder.flush(), 10_000).unref();
setInterval(
  () => store.pruneActivity({ free: 0, plus: PLANS.plus.limits.activityRetentionDays, pro: PLANS.pro.limits.activityRetentionDays }),
  60 * 60_000,
).unref();

startUdp(resolver, config.dnsPort);
startTcp(resolver, config.dnsPort);
if (config.dotCertFile && config.dotKeyFile && fs.existsSync(config.dotCertFile)) {
  startDot(resolver, config.dotPort, config.dotCertFile, config.dotKeyFile, config.dotDomain);
} else {
  console.log('DNS-over-TLS disabled (set DOT_CERT_FILE / DOT_KEY_FILE to enable Android Private DNS)');
}

const app = buildApi(store, resolver);
app.listen({ port: config.apiPort, host: '0.0.0.0' }).then(() => {
  console.log(`${config.brand} API listening on :${config.apiPort}`);
});

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, async () => {
    recorder.flush();
    await app.close();
    process.exit(0);
  });
}
