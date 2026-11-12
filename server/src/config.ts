import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function list(name: string, fallback: string): string[] {
  return (process.env[name] ?? fallback)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function int(name: string, fallback: number): number {
  const v = process.env[name];
  return v ? Number.parseInt(v, 10) : fallback;
}

const isProd = process.env.NODE_ENV === 'production';

export const config = {
  isProd,
  brand: process.env.BRAND_NAME ?? 'KinShield',
  /** Public base URL of the API, used to build setup links. */
  publicUrl: process.env.PUBLIC_URL ?? 'http://localhost:8080',
  apiPort: int('API_PORT', 8080),
  dnsPort: int('DNS_PORT', 5353),
  dotPort: int('DOT_PORT', 853),
  /** Wildcard TLS cert for *.<dotDomain> - enables DNS-over-TLS (Android Private DNS). */
  dotCertFile: process.env.DOT_CERT_FILE,
  dotKeyFile: process.env.DOT_KEY_FILE,
  /** Devices use "<dnsId>.<dotDomain>" as their Android Private DNS hostname. */
  dotDomain: process.env.DOT_DOMAIN ?? 'dns.kinshield.example',
  /** Anycast/public IPs of your resolver fleet that routers should point at. */
  resolverIpv4: list('RESOLVER_IPV4', '203.0.113.10,203.0.113.11'),
  resolverIpv6: list('RESOLVER_IPV6', ''),
  upstreams: list('UPSTREAM_DNS', '1.1.1.1,9.9.9.9'),
  upstreamTimeoutMs: int('UPSTREAM_TIMEOUT_MS', 2000),
  dbFile: process.env.DB_FILE ?? path.join(root, 'data', 'kinshield.db'),
  blocklistDir: process.env.BLOCKLIST_DIR ?? path.join(root, 'data', 'blocklists'),
  seedDir: path.join(root, 'data', 'seed'),
  /** Built web dashboard (`npm run dashboard:build`). Served at / when present. */
  dashboardDir: process.env.DASHBOARD_DIR ?? path.join(root, '..', 'mobile', 'dist'),
  /** HMAC secret for session tokens. MUST be set in production. */
  authSecret: process.env.AUTH_SECRET ?? (isProd ? '' : 'dev-only-insecure-secret'),
  /** Shared secret RevenueCat sends in the Authorization header of webhooks. */
  revenueCatWebhookSecret: process.env.REVENUECAT_WEBHOOK_SECRET ?? '',
  /** Trust X-Forwarded-For (set when running behind a load balancer). */
  trustProxy: process.env.TRUST_PROXY === 'true',
  /** Lets you flip plans from the app in development without a store purchase. */
  allowDevPlanSwitch: process.env.ALLOW_DEV_PLAN_SWITCH === 'true' || !isProd,
};

if (isProd && !config.authSecret) {
  throw new Error('AUTH_SECRET must be set in production');
}
