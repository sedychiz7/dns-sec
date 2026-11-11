import {
  type CategoryId,
  type Policy,
  CATEGORY_IDS,
  isScheduleActive,
} from '@kinshield/shared';
import { type BlocklistLookup, suffixes } from './blocklists';

export type Decision =
  | { action: 'allow'; reason: null }
  | { action: 'block'; reason: CategoryId | 'custom' | 'schedule' | 'paused' }
  | { action: 'rewrite'; reason: 'safesearch' | 'youtube'; target: string };

export interface DecisionContext {
  policy: Policy;
  timezone: string;
  now: Date;
}

/** Domains that must keep working even while the internet is paused (so the app and OS stay healthy). */
const ALWAYS_ALLOWED = new Set<string>([
  'captive.apple.com',
  'connectivitycheck.gstatic.com',
  'clients3.google.com',
  'msftconnecttest.com',
  'apple.com',
  'icloud.com',
]);

const YOUTUBE_HOSTS = new Set([
  'www.youtube.com',
  'm.youtube.com',
  'youtubei.googleapis.com',
  'youtube.googleapis.com',
  'www.youtube-nocookie.com',
]);

/** SafeSearch is enforced by answering with the search engine's official "safe" hostname. */
export function safeSearchTarget(domain: string): string | null {
  if (/^(www\.)?google\.([a-z]{2,3}|com?\.[a-z]{2})$/.test(domain)) return 'forcesafesearch.google.com';
  if (domain === 'www.bing.com' || domain === 'bing.com') return 'strict.bing.com';
  if (domain === 'duckduckgo.com' || domain === 'www.duckduckgo.com') return 'safe.duckduckgo.com';
  return null;
}

function matchesList(domain: string, list: string[]): boolean {
  if (list.length === 0) return false;
  const set = new Set(list);
  for (const s of suffixes(domain)) if (set.has(s)) return true;
  return false;
}

/** Pure decision function: given a query and the enforced policy, what do we answer? */
export function decide(domainRaw: string, ctx: DecisionContext, lists: BlocklistLookup): Decision {
  const domain = domainRaw.toLowerCase().replace(/\.$/, '');
  const { policy } = ctx;

  if (matchesList(domain, policy.allowlist)) return { action: 'allow', reason: null };

  const essential = [...suffixes(domain)].some((s) => ALWAYS_ALLOWED.has(s));

  if (!essential && policy.pausedUntil && new Date(policy.pausedUntil) > ctx.now) {
    return { action: 'block', reason: 'paused' };
  }

  const extra = new Set<CategoryId>();
  for (const s of policy.schedules) {
    if (!isScheduleActive(s, ctx.now, ctx.timezone)) continue;
    if (s.mode === 'offline' && !essential) return { action: 'block', reason: 'schedule' };
    if (s.mode === 'focus') s.categories.forEach((c) => extra.add(c));
  }

  if (matchesList(domain, policy.blocklist)) return { action: 'block', reason: 'custom' };

  if (policy.safeSearch) {
    const target = safeSearchTarget(domain);
    if (target) return { action: 'rewrite', reason: 'safesearch', target };
  }
  if (policy.youtubeRestricted && YOUTUBE_HOSTS.has(domain)) {
    return { action: 'rewrite', reason: 'youtube', target: 'restrict.youtube.com' };
  }

  const enabled = CATEGORY_IDS.filter((c) => policy.categories[c]);
  const category = lists.match(domain, enabled);
  if (category) return { action: 'block', reason: category };

  if (extra.size > 0) {
    const scheduled = lists.match(domain, extra);
    if (scheduled) return { action: 'block', reason: 'schedule' };
  }

  return { action: 'allow', reason: null };
}
