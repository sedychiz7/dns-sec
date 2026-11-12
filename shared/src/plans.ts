/**
 * Plans, features and limits.
 *
 * This file is the single source of truth for what each subscription tier gets.
 * The server uses it to *enforce* entitlements (a downgraded user's policy is
 * clamped at resolve time) and the mobile app uses it to render the paywall and
 * lock badges, so the two can never drift apart.
 */

export type PlanId = 'free' | 'plus' | 'pro';

export type Feature =
  /** Adult / pornography blocking. */
  | 'adultFilter'
  /** Malware, phishing, scam and crypto-jacking domains. */
  | 'securityFilter'
  /** Force SafeSearch on Google, Bing, DuckDuckGo. */
  | 'safeSearch'
  /** Block ad networks, trackers and telemetry at the DNS level. */
  | 'adBlocking'
  /** Detect trackers disguised as first-party subdomains (CNAME cloaking). */
  | 'cnameUncloaking'
  /** YouTube Restricted Mode. */
  | 'youtubeRestricted'
  /** Gambling category. */
  | 'gamblingFilter'
  /** Per-domain allow / block lists. */
  | 'customLists'
  /** Searchable log of recent DNS activity. */
  | 'activityLog'
  /** Separate rules per child / device. */
  | 'profiles'
  /** Bedtime & homework schedules. */
  | 'schedules'
  /** One-tap "pause the internet". */
  | 'pauseInternet'
  /** Social media, gaming, dating categories. */
  | 'extraCategories'
  /** Weekly email summary for parents. */
  | 'weeklyReport'
  /**
   * Change settings and view activity from anywhere (work, travel) via the
   * app or the web dashboard. Without it, changes only work from home Wi-Fi.
   */
  | 'remoteManagement';

export interface PlanLimits {
  networks: number;
  profiles: number;
  customListEntries: number;
  /** How long per-query activity is kept. 0 = not kept at all (aggregate counters only). */
  activityRetentionDays: number;
  /** How far back the stats screen can look. */
  statsDays: number;
}

export interface Plan {
  id: PlanId;
  name: string;
  tagline: string;
  /** Fallback display prices; real prices come from the store via RevenueCat. */
  displayPrice: { monthly: string; yearly: string } | null;
  trialDays: number;
  features: Feature[];
  limits: PlanLimits;
  /** Marketing bullets for the paywall, in display order. */
  highlights: string[];
}

const FREE_FEATURES: Feature[] = ['adultFilter', 'securityFilter', 'safeSearch'];

const PLUS_FEATURES: Feature[] = [
  ...FREE_FEATURES,
  'adBlocking',
  'cnameUncloaking',
  'youtubeRestricted',
  'gamblingFilter',
  'customLists',
  'activityLog',
];

const PRO_FEATURES: Feature[] = [
  ...PLUS_FEATURES,
  'profiles',
  'schedules',
  'pauseInternet',
  'extraCategories',
  'weeklyReport',
  'remoteManagement',
];

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: 'free',
    name: 'Free',
    tagline: 'Essential protection for the whole home',
    displayPrice: null,
    trialDays: 0,
    features: FREE_FEATURES,
    limits: {
      networks: 1,
      profiles: 0,
      customListEntries: 0,
      activityRetentionDays: 0,
      statsDays: 1,
    },
    highlights: [
      'Block adult sites on every device',
      'Block malware, phishing & scam sites',
      'SafeSearch on Google, Bing & DuckDuckGo',
      'One home network',
      'Manage settings while you’re home',
    ],
  },
  plus: {
    id: 'plus',
    name: 'Plus',
    tagline: 'No more ads or creepy tracking',
    displayPrice: { monthly: '$3.99', yearly: '$29.99' },
    trialDays: 7,
    features: PLUS_FEATURES,
    limits: {
      networks: 1,
      profiles: 0,
      customListEntries: 100,
      activityRetentionDays: 7,
      statsDays: 7,
    },
    highlights: [
      'Everything in Free',
      'Block ads on every device - TVs, consoles & phones',
      'Stop ad-targeting trackers & hidden (CNAME-cloaked) trackers',
      'YouTube Restricted Mode & gambling blocking',
      'Your own allow / block list',
      '7-day activity history',
    ],
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    tagline: 'Full parental control, made simple',
    displayPrice: { monthly: '$7.99', yearly: '$59.99' },
    trialDays: 7,
    features: PRO_FEATURES,
    limits: {
      networks: 3,
      profiles: 10,
      customListEntries: 2000,
      activityRetentionDays: 30,
      statsDays: 30,
    },
    highlights: [
      'Everything in Plus',
      'Manage from anywhere - phone or web dashboard',
      'Separate rules for each child',
      'Bedtime & homework schedules',
      'Pause the internet with one tap',
      'Block social media, games & dating apps',
      'Up to 3 locations (e.g. grandparents)',
      'Weekly family report',
    ],
  },
};

export const PLAN_ORDER: PlanId[] = ['free', 'plus', 'pro'];

export function hasFeature(plan: PlanId, feature: Feature): boolean {
  return PLANS[plan].features.includes(feature);
}

/** The cheapest plan that unlocks a feature - used for "Upgrade to X" prompts. */
export function minimumPlanFor(feature: Feature): PlanId {
  for (const id of PLAN_ORDER) {
    if (hasFeature(id, feature)) return id;
  }
  throw new Error(`No plan includes feature ${feature}`);
}

export function isPlanId(value: unknown): value is PlanId {
  return value === 'free' || value === 'plus' || value === 'pro';
}
