import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import {
  type ActivityEntry,
  type DayStats,
  type Network,
  type PlanId,
  type Policy,
  type Profile,
  type User,
  CATEGORIES,
  defaultPolicy,
  hasFeature,
  isPlanId,
} from '@kinshield/shared';

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(9).toString('base64url')}`;
}

/**
 * DNS ids appear in hostnames ("<id>.dns.example.com") so they must be
 * lowercase alphanumerics. 16 chars of base32 = 80 bits: unguessable.
 */
export function newDnsId(): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz234567';
  const bytes = crypto.randomBytes(16);
  let out = '';
  for (const b of bytes) out += alphabet[b % 32];
  return out;
}

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  plan: string;
  plan_expires_at: string | null;
  created_at: string;
}

interface NetworkRow {
  id: string;
  owner_id: string;
  name: string;
  timezone: string;
  linked_ip: string | null;
  dns_id: string;
  policy: string;
  last_seen_at: string | null;
  created_at: string;
}

interface ProfileRow {
  id: string;
  network_id: string;
  name: string;
  emoji: string;
  dns_id: string;
  policy: string;
  last_seen_at: string | null;
}

/** What the resolver needs to know about whoever sent a query. */
export interface ClientContext {
  networkId: string;
  profileId: string | null;
  plan: PlanId;
  timezone: string;
  policy: Policy;
}

export class Store {
  readonly db: DatabaseSync;
  private clientCache = new Map<string, ClientContext | null>();

  constructor(file: string) {
    if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
    this.migrate();
  }

  private migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        plan TEXT NOT NULL DEFAULT 'free',
        plan_expires_at TEXT,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS networks (
        id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        timezone TEXT NOT NULL,
        linked_ip TEXT UNIQUE,
        dns_id TEXT NOT NULL UNIQUE,
        policy TEXT NOT NULL,
        last_seen_at TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS networks_owner ON networks(owner_id);
      CREATE TABLE IF NOT EXISTS profiles (
        id TEXT PRIMARY KEY,
        network_id TEXT NOT NULL REFERENCES networks(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        emoji TEXT NOT NULL,
        dns_id TEXT NOT NULL UNIQUE,
        policy TEXT NOT NULL,
        last_seen_at TEXT,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS daily_stats (
        network_id TEXT NOT NULL REFERENCES networks(id) ON DELETE CASCADE,
        day TEXT NOT NULL,
        total INTEGER NOT NULL DEFAULT 0,
        blocked INTEGER NOT NULL DEFAULT 0,
        by_category TEXT NOT NULL DEFAULT '{}',
        PRIMARY KEY (network_id, day)
      );
      CREATE TABLE IF NOT EXISTS blocked_domains (
        network_id TEXT NOT NULL REFERENCES networks(id) ON DELETE CASCADE,
        day TEXT NOT NULL,
        domain TEXT NOT NULL,
        count INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (network_id, day, domain)
      );
      CREATE TABLE IF NOT EXISTS query_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        network_id TEXT NOT NULL REFERENCES networks(id) ON DELETE CASCADE,
        profile_id TEXT,
        at TEXT NOT NULL,
        domain TEXT NOT NULL,
        blocked INTEGER NOT NULL,
        reason TEXT
      );
      CREATE INDEX IF NOT EXISTS query_log_net_at ON query_log(network_id, at);
    `);
  }

  private invalidate() {
    this.clientCache.clear();
  }

  // ---------- users ----------

  createUser(email: string, passwordHash: string): User {
    const id = newId('usr');
    const now = new Date().toISOString();
    this.db
      .prepare('INSERT INTO users (id, email, password_hash, plan, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(id, email, passwordHash, 'free', now);
    return this.getUser(id)!;
  }

  private toUser(r: UserRow): User {
    let plan: PlanId = isPlanId(r.plan) ? r.plan : 'free';
    if (plan !== 'free' && r.plan_expires_at && new Date(r.plan_expires_at) < new Date()) plan = 'free';
    return { id: r.id, email: r.email, plan, planExpiresAt: r.plan_expires_at, createdAt: r.created_at };
  }

  getUser(id: string): User | null {
    const r = this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
    return r ? this.toUser(r) : null;
  }

  getUserWithHash(email: string): { user: User; hash: string } | null {
    const r = this.db.prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRow | undefined;
    return r ? { user: this.toUser(r), hash: r.password_hash } : null;
  }

  setPlan(userId: string, plan: PlanId, expiresAt: string | null) {
    const before = this.getUser(userId)?.plan ?? 'free';
    this.db.prepare('UPDATE users SET plan = ?, plan_expires_at = ? WHERE id = ?').run(plan, expiresAt, userId);
    if (plan !== before) this.enableUnlockedDefaults(userId, before, plan);
    this.invalidate();
  }

  /**
   * After an upgrade, switch on the protections the customer just paid for
   * (e.g. ad blocking) so they see the benefit immediately - no hunting for
   * toggles. Settings the user explicitly changed stay as they were only if
   * the feature was already available before.
   */
  private enableUnlockedDefaults(userId: string, from: PlanId, to: PlanId) {
    const unlocked = CATEGORIES.filter((c) => c.defaultOn && hasFeature(to, c.feature) && !hasFeature(from, c.feature));
    if (!unlocked.length) return;
    const apply = (raw: string) => {
      const policy = JSON.parse(raw) as Policy;
      for (const c of unlocked) policy.categories[c.id] = true;
      return JSON.stringify(policy);
    };
    for (const n of this.db.prepare('SELECT id, policy FROM networks WHERE owner_id = ?').all(userId) as unknown as { id: string; policy: string }[]) {
      this.db.prepare('UPDATE networks SET policy = ? WHERE id = ?').run(apply(n.policy), n.id);
      for (const p of this.db.prepare('SELECT id, policy FROM profiles WHERE network_id = ?').all(n.id) as unknown as { id: string; policy: string }[]) {
        this.db.prepare('UPDATE profiles SET policy = ? WHERE id = ?').run(apply(p.policy), p.id);
      }
    }
  }

  deleteUser(id: string) {
    this.db.prepare('DELETE FROM users WHERE id = ?').run(id);
    this.invalidate();
  }

  // ---------- networks & profiles ----------

  private profilesFor(networkId: string): Profile[] {
    const rows = this.db
      .prepare('SELECT * FROM profiles WHERE network_id = ? ORDER BY created_at')
      .all(networkId) as unknown as ProfileRow[];
    return rows.map((r) => ({
      id: r.id,
      networkId: r.network_id,
      name: r.name,
      emoji: r.emoji,
      dnsId: r.dns_id,
      policy: JSON.parse(r.policy) as Policy,
      lastSeenAt: r.last_seen_at,
    }));
  }

  private toNetwork(r: NetworkRow): Network {
    return {
      id: r.id,
      name: r.name,
      timezone: r.timezone,
      linkedIp: r.linked_ip,
      dnsId: r.dns_id,
      policy: JSON.parse(r.policy) as Policy,
      profiles: this.profilesFor(r.id),
      lastSeenAt: r.last_seen_at,
      createdAt: r.created_at,
    };
  }

  listNetworks(ownerId: string): Network[] {
    const rows = this.db
      .prepare('SELECT * FROM networks WHERE owner_id = ? ORDER BY created_at')
      .all(ownerId) as unknown as NetworkRow[];
    return rows.map((r) => this.toNetwork(r));
  }

  getNetwork(id: string, ownerId: string): Network | null {
    const r = this.db.prepare('SELECT * FROM networks WHERE id = ? AND owner_id = ?').get(id, ownerId) as
      | NetworkRow
      | undefined;
    return r ? this.toNetwork(r) : null;
  }

  createNetwork(ownerId: string, name: string, timezone: string, plan: PlanId): Network {
    const id = newId('net');
    const now = new Date().toISOString();
    this.db
      .prepare(
        'INSERT INTO networks (id, owner_id, name, timezone, dns_id, policy, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .run(id, ownerId, name, timezone, newDnsId(), JSON.stringify(defaultPolicy(plan)), now);
    this.invalidate();
    return this.getNetwork(id, ownerId)!;
  }

  updateNetwork(id: string, fields: { name?: string; timezone?: string; policy?: Policy }) {
    if (fields.name !== undefined) this.db.prepare('UPDATE networks SET name = ? WHERE id = ?').run(fields.name, id);
    if (fields.timezone !== undefined)
      this.db.prepare('UPDATE networks SET timezone = ? WHERE id = ?').run(fields.timezone, id);
    if (fields.policy !== undefined)
      this.db.prepare('UPDATE networks SET policy = ? WHERE id = ?').run(JSON.stringify(fields.policy), id);
    this.invalidate();
  }

  /** Links a public IP to a network. An IP can only belong to one network, so it is moved if needed. */
  linkIp(networkId: string, ip: string) {
    this.db.prepare('UPDATE networks SET linked_ip = NULL WHERE linked_ip = ?').run(ip);
    this.db.prepare('UPDATE networks SET linked_ip = ? WHERE id = ?').run(ip, networkId);
    this.invalidate();
  }

  deleteNetwork(id: string) {
    this.db.prepare('DELETE FROM networks WHERE id = ?').run(id);
    this.invalidate();
  }

  countNetworks(ownerId: string): number {
    const r = this.db.prepare('SELECT COUNT(*) AS n FROM networks WHERE owner_id = ?').get(ownerId) as { n: number };
    return r.n;
  }

  createProfile(networkId: string, name: string, emoji: string, policy: Policy): Profile {
    const id = newId('prf');
    this.db
      .prepare(
        'INSERT INTO profiles (id, network_id, name, emoji, dns_id, policy, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .run(id, networkId, name, emoji, newDnsId(), JSON.stringify(policy), new Date().toISOString());
    this.invalidate();
    return this.profilesFor(networkId).find((p) => p.id === id)!;
  }

  /** Returns the profile and its network if the user owns it. */
  getProfile(id: string, ownerId: string): { profile: Profile; network: Network } | null {
    const r = this.db
      .prepare(
        'SELECT p.network_id FROM profiles p JOIN networks n ON n.id = p.network_id WHERE p.id = ? AND n.owner_id = ?',
      )
      .get(id, ownerId) as { network_id: string } | undefined;
    if (!r) return null;
    const network = this.getNetwork(r.network_id, ownerId)!;
    const profile = network.profiles.find((p) => p.id === id)!;
    return { profile, network };
  }

  updateProfile(id: string, fields: { name?: string; emoji?: string; policy?: Policy }) {
    if (fields.name !== undefined) this.db.prepare('UPDATE profiles SET name = ? WHERE id = ?').run(fields.name, id);
    if (fields.emoji !== undefined) this.db.prepare('UPDATE profiles SET emoji = ? WHERE id = ?').run(fields.emoji, id);
    if (fields.policy !== undefined)
      this.db.prepare('UPDATE profiles SET policy = ? WHERE id = ?').run(JSON.stringify(fields.policy), id);
    this.invalidate();
  }

  deleteProfile(id: string) {
    this.db.prepare('DELETE FROM profiles WHERE id = ?').run(id);
    this.invalidate();
  }

  /** Looks up network or profile by the dnsId used in DoH paths, DoT hostnames and Apple profiles. */
  findByDnsId(dnsId: string): { network: NetworkRow; profile: ProfileRow | null } | null {
    const p = this.db.prepare('SELECT * FROM profiles WHERE dns_id = ?').get(dnsId) as ProfileRow | undefined;
    if (p) {
      const network = this.db.prepare('SELECT * FROM networks WHERE id = ?').get(p.network_id) as unknown as NetworkRow;
      return { network, profile: p };
    }
    const n = this.db.prepare('SELECT * FROM networks WHERE dns_id = ?').get(dnsId) as NetworkRow | undefined;
    return n ? { network: n, profile: null } : null;
  }

  /**
   * Hot path for the resolver: who is asking? Cached in memory and invalidated
   * on any write, so policy changes in the app take effect on the next query.
   */
  resolveClient(by: { dnsId?: string; ip?: string }): ClientContext | null {
    const key = by.dnsId ? `d:${by.dnsId}` : `i:${by.ip}`;
    if (this.clientCache.has(key)) return this.clientCache.get(key)!;

    let network: NetworkRow | undefined;
    let profile: ProfileRow | null = null;
    if (by.dnsId) {
      const found = this.findByDnsId(by.dnsId);
      network = found?.network;
      profile = found?.profile ?? null;
    } else if (by.ip) {
      network = this.db.prepare('SELECT * FROM networks WHERE linked_ip = ?').get(by.ip) as NetworkRow | undefined;
    }
    let ctx: ClientContext | null = null;
    if (network) {
      const owner = this.getUser(network.owner_id);
      const plan = owner?.plan ?? 'free';
      // Profiles are a Pro feature; on lower plans a profile falls back to the network's rules.
      const useProfile = profile && plan === 'pro';
      ctx = {
        networkId: network.id,
        profileId: useProfile ? profile!.id : null,
        plan,
        timezone: network.timezone,
        policy: JSON.parse(useProfile ? profile!.policy : network.policy) as Policy,
      };
    }
    this.clientCache.set(key, ctx);
    return ctx;
  }

  touch(networkId: string, profileId: string | null, at: string) {
    this.db.prepare('UPDATE networks SET last_seen_at = ? WHERE id = ?').run(at, networkId);
    if (profileId) this.db.prepare('UPDATE profiles SET last_seen_at = ? WHERE id = ?').run(at, profileId);
  }

  // ---------- stats & activity ----------

  addDailyStats(
    networkId: string,
    day: string,
    total: number,
    blocked: number,
    byCategory: Record<string, number>,
    blockedDomains: Map<string, number>,
  ) {
    const existing = this.db
      .prepare('SELECT by_category FROM daily_stats WHERE network_id = ? AND day = ?')
      .get(networkId, day) as { by_category: string } | undefined;
    const merged: Record<string, number> = existing ? JSON.parse(existing.by_category) : {};
    for (const [k, v] of Object.entries(byCategory)) merged[k] = (merged[k] ?? 0) + v;
    this.db
      .prepare(
        `INSERT INTO daily_stats (network_id, day, total, blocked, by_category) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(network_id, day) DO UPDATE SET total = total + excluded.total,
           blocked = blocked + excluded.blocked, by_category = excluded.by_category`,
      )
      .run(networkId, day, total, blocked, JSON.stringify(merged));
    const upsert = this.db.prepare(
      `INSERT INTO blocked_domains (network_id, day, domain, count) VALUES (?, ?, ?, ?)
       ON CONFLICT(network_id, day, domain) DO UPDATE SET count = count + excluded.count`,
    );
    for (const [domain, count] of blockedDomains) upsert.run(networkId, day, domain, count);
  }

  getStats(networkId: string, sinceDay: string): { days: DayStats[]; top: { domain: string; count: number }[] } {
    const rows = this.db
      .prepare('SELECT * FROM daily_stats WHERE network_id = ? AND day >= ? ORDER BY day')
      .all(networkId, sinceDay) as unknown as { day: string; total: number; blocked: number; by_category: string }[];
    const top = this.db
      .prepare(
        `SELECT domain, SUM(count) AS count FROM blocked_domains WHERE network_id = ? AND day >= ?
         GROUP BY domain ORDER BY count DESC LIMIT 10`,
      )
      .all(networkId, sinceDay) as unknown as { domain: string; count: number }[];
    return {
      days: rows.map((r) => ({ day: r.day, total: r.total, blocked: r.blocked, byCategory: JSON.parse(r.by_category) })),
      top,
    };
  }

  insertQueryLog(entries: { networkId: string; profileId: string | null; at: string; domain: string; blocked: boolean; reason: string | null }[]) {
    const stmt = this.db.prepare(
      'INSERT INTO query_log (network_id, profile_id, at, domain, blocked, reason) VALUES (?, ?, ?, ?, ?, ?)',
    );
    for (const e of entries) stmt.run(e.networkId, e.profileId, e.at, e.domain, e.blocked ? 1 : 0, e.reason);
  }

  getActivity(networkId: string, opts: { limit: number; blockedOnly: boolean; profileId?: string; search?: string }): ActivityEntry[] {
    let sql = 'SELECT * FROM query_log WHERE network_id = ?';
    const args: (string | number)[] = [networkId];
    if (opts.blockedOnly) sql += ' AND blocked = 1';
    if (opts.profileId) {
      sql += ' AND profile_id = ?';
      args.push(opts.profileId);
    }
    if (opts.search) {
      sql += ' AND domain LIKE ?';
      args.push(`%${opts.search}%`);
    }
    sql += ' ORDER BY id DESC LIMIT ?';
    args.push(opts.limit);
    const rows = this.db.prepare(sql).all(...args) as unknown as {
      at: string;
      domain: string;
      blocked: number;
      reason: string | null;
      profile_id: string | null;
    }[];
    return rows.map((r) => ({ at: r.at, domain: r.domain, blocked: r.blocked === 1, reason: r.reason, profileId: r.profile_id }));
  }

  /** Deletes activity older than each owner's plan allows. Run periodically. */
  pruneActivity(retentionByPlan: Record<PlanId, number>) {
    const nets = this.db
      .prepare('SELECT n.id, u.plan, u.plan_expires_at FROM networks n JOIN users u ON u.id = n.owner_id')
      .all() as unknown as { id: string; plan: string; plan_expires_at: string | null }[];
    const del = this.db.prepare('DELETE FROM query_log WHERE network_id = ? AND at < ?');
    for (const n of nets) {
      const expired = n.plan_expires_at && new Date(n.plan_expires_at) < new Date();
      const plan: PlanId = !expired && isPlanId(n.plan) ? n.plan : 'free';
      const cutoff = new Date(Date.now() - retentionByPlan[plan] * 86_400_000).toISOString();
      del.run(n.id, cutoff);
    }
    const statsCutoff = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
    this.db.prepare('DELETE FROM daily_stats WHERE day < ?').run(statsCutoff);
    this.db.prepare('DELETE FROM blocked_domains WHERE day < ?').run(statsCutoff);
  }
}
