import { type Feature, type PlanId, PLANS, hasFeature } from './plans';

export type CategoryId =
  | 'adult'
  | 'security'
  | 'ads'
  | 'trackers'
  | 'gambling'
  | 'social'
  | 'gaming'
  | 'dating';

export interface Category {
  id: CategoryId;
  name: string;
  description: string;
  icon: string;
  feature: Feature;
  /** Turned on for brand-new networks (when the plan allows it). */
  defaultOn: boolean;
}

export const CATEGORIES: Category[] = [
  {
    id: 'adult',
    name: 'Adult content',
    description: 'Pornography and explicit sites',
    icon: 'eye-off',
    feature: 'adultFilter',
    defaultOn: true,
  },
  {
    id: 'security',
    name: 'Malware & scams',
    description: 'Phishing, malware, scams and crypto-mining',
    icon: 'shield-checkmark',
    feature: 'securityFilter',
    defaultOn: true,
  },
  {
    id: 'ads',
    name: 'Ads',
    description: 'Ad networks on websites, apps, smart TVs and games',
    icon: 'megaphone',
    feature: 'adBlocking',
    defaultOn: true,
  },
  {
    id: 'trackers',
    name: 'Trackers',
    description: 'Ad-targeting trackers, analytics and device telemetry',
    icon: 'footsteps',
    feature: 'adBlocking',
    defaultOn: true,
  },
  {
    id: 'gambling',
    name: 'Gambling',
    description: 'Betting, casinos and lotteries',
    icon: 'dice',
    feature: 'gamblingFilter',
    defaultOn: true,
  },
  {
    id: 'social',
    name: 'Social media',
    description: 'TikTok, Instagram, Snapchat, Facebook and more',
    icon: 'people',
    feature: 'extraCategories',
    defaultOn: false,
  },
  {
    id: 'gaming',
    name: 'Online games',
    description: 'Online gaming platforms and game stores',
    icon: 'game-controller',
    feature: 'extraCategories',
    defaultOn: false,
  },
  {
    id: 'dating',
    name: 'Dating',
    description: 'Dating sites and apps',
    icon: 'heart',
    feature: 'extraCategories',
    defaultOn: false,
  },
];

export const CATEGORY_IDS = CATEGORIES.map((c) => c.id);

export function categoryById(id: CategoryId): Category {
  const c = CATEGORIES.find((x) => x.id === id);
  if (!c) throw new Error(`Unknown category ${id}`);
  return c;
}

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Sunday

export interface Schedule {
  id: string;
  name: string;
  enabled: boolean;
  days: Weekday[];
  /** Local time "HH:MM" (24h). If end <= start the window crosses midnight. */
  start: string;
  end: string;
  /** 'offline' blocks everything (bedtime); 'focus' blocks extra categories (homework). */
  mode: 'offline' | 'focus';
  /** Categories blocked while a 'focus' schedule is active. */
  categories: CategoryId[];
}

export interface Policy {
  categories: Record<CategoryId, boolean>;
  safeSearch: boolean;
  youtubeRestricted: boolean;
  /** Domains that are always allowed (wins over everything). */
  allowlist: string[];
  /** Domains that are always blocked. */
  blocklist: string[];
  schedules: Schedule[];
  /** ISO timestamp; internet is blocked until then. */
  pausedUntil: string | null;
}

export function defaultPolicy(plan: PlanId = 'free'): Policy {
  const categories = {} as Record<CategoryId, boolean>;
  for (const c of CATEGORIES) {
    categories[c.id] = c.defaultOn;
  }
  return clampPolicy(
    {
      categories,
      safeSearch: true,
      youtubeRestricted: false,
      allowlist: [],
      blocklist: [],
      schedules: [],
      pausedUntil: null,
    },
    plan,
  );
}

/**
 * Returns the policy that is actually enforced for a given plan.
 *
 * We never delete a user's settings when they downgrade - we just stop
 * enforcing paid features. If they re-subscribe everything comes back, which
 * is a strong win-back incentive.
 */
export function clampPolicy(policy: Policy, plan: PlanId): Policy {
  const categories = {} as Record<CategoryId, boolean>;
  for (const c of CATEGORIES) {
    categories[c.id] = Boolean(policy.categories[c.id]) && hasFeature(plan, c.feature);
  }
  const listCap = PLANS[plan].limits.customListEntries;
  const lists = hasFeature(plan, 'customLists');
  return {
    categories,
    safeSearch: policy.safeSearch && hasFeature(plan, 'safeSearch'),
    youtubeRestricted: policy.youtubeRestricted && hasFeature(plan, 'youtubeRestricted'),
    allowlist: lists ? policy.allowlist.slice(0, listCap) : [],
    blocklist: lists ? policy.blocklist.slice(0, listCap) : [],
    schedules: hasFeature(plan, 'schedules') ? policy.schedules : [],
    pausedUntil: hasFeature(plan, 'pauseInternet') ? policy.pausedUntil : null,
  };
}

/**
 * Lists the paid features a policy uses that the plan doesn't include, so the
 * API can reply "402 upgrade required" instead of silently ignoring a setting.
 */
export function lockedFeaturesUsed(policy: Partial<Policy>, plan: PlanId): Feature[] {
  const used = new Set<Feature>();
  if (policy.categories) {
    for (const c of CATEGORIES) {
      if (policy.categories[c.id] && !hasFeature(plan, c.feature)) used.add(c.feature);
    }
  }
  if (policy.youtubeRestricted && !hasFeature(plan, 'youtubeRestricted')) used.add('youtubeRestricted');
  if (
    ((policy.allowlist?.length ?? 0) > 0 || (policy.blocklist?.length ?? 0) > 0) &&
    !hasFeature(plan, 'customLists')
  ) {
    used.add('customLists');
  }
  if ((policy.schedules?.length ?? 0) > 0 && !hasFeature(plan, 'schedules')) used.add('schedules');
  if (policy.pausedUntil && !hasFeature(plan, 'pauseInternet')) used.add('pauseInternet');
  return [...used];
}

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function parseHHMM(value: string): number {
  const m = HHMM.exec(value);
  if (!m) throw new Error(`Invalid time "${value}"`);
  return Number(m[1]) * 60 + Number(m[2]);
}

export function isValidHHMM(value: string): boolean {
  return HHMM.test(value);
}

/** Local weekday and minute-of-day for an instant in an IANA timezone. */
export function localTime(now: Date, timeZone: string): { day: Weekday; minute: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return {
    day: days.indexOf(get('weekday')) as Weekday,
    minute: Number(get('hour')) * 60 + Number(get('minute')),
  };
}

/**
 * Is a schedule active right now? Overnight windows (21:00-07:00) belong to the
 * day they *start* on, so "school nights Sun-Thu 21:00-07:00" works as a parent
 * would expect on Friday morning.
 */
export function isScheduleActive(s: Schedule, now: Date, timeZone: string): boolean {
  if (!s.enabled || s.days.length === 0) return false;
  const { day, minute } = localTime(now, timeZone);
  const start = parseHHMM(s.start);
  const end = parseHHMM(s.end);
  if (start === end) return false;
  if (start < end) {
    return s.days.includes(day) && minute >= start && minute < end;
  }
  // crosses midnight
  if (minute >= start) return s.days.includes(day);
  if (minute < end) return s.days.includes(((day + 6) % 7) as Weekday);
  return false;
}

/** Normalises a user-typed domain: strips scheme, path, port, "www.", trailing dot. */
export function normalizeDomain(input: string): string | null {
  let d = input.trim().toLowerCase();
  d = d.replace(/^[a-z]+:\/\//, '');
  d = d.split(/[/?#]/)[0] ?? '';
  d = d.replace(/:\d+$/, '').replace(/\.$/, '').replace(/^\*\./, '');
  if (d.startsWith('www.')) d = d.slice(4);
  if (!/^(?=.{1,253}$)([a-z0-9_]([a-z0-9_-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,62}$/.test(d)) {
    return null;
  }
  return d;
}
