/** Request / response shapes shared by the server and the mobile app. */
import type { Feature, PlanId } from './plans';
import type { CategoryId, Policy } from './policy';

export interface User {
  id: string;
  email: string;
  plan: PlanId;
  /** ISO timestamp the paid plan runs until (null for free). */
  planExpiresAt: string | null;
  createdAt: string;
}

export interface Profile {
  id: string;
  networkId: string;
  name: string;
  emoji: string;
  /** Secret identifier used in this device's DNS address (DoH path / DoT hostname). */
  dnsId: string;
  policy: Policy;
  lastSeenAt: string | null;
}

export interface Network {
  id: string;
  name: string;
  timezone: string;
  linkedIp: string | null;
  dnsId: string;
  policy: Policy;
  profiles: Profile[];
  lastSeenAt: string | null;
  createdAt: string;
}

export interface SetupInfo {
  /** For routers: put these in the router's DNS fields. */
  dnsServers: { ipv4: string[]; ipv6: string[] };
  /** Encrypted DNS for a single device. */
  dohUrl: string;
  /** Android "Private DNS" hostname. */
  dotHostname: string;
  /** iPhone / iPad / Mac one-tap install. */
  appleProfileUrl: string;
  linkedIp: string | null;
}

export interface DayStats {
  day: string; // YYYY-MM-DD
  total: number;
  blocked: number;
  byCategory: Partial<Record<CategoryId | 'custom' | 'schedule' | 'paused' | 'missedAds', number>>;
}

export interface StatsResponse {
  days: DayStats[];
  totals: {
    total: number;
    blocked: number;
    adsBlocked: number;
    threatsBlocked: number;
    /** Free plan only: ads & trackers Plus would have blocked. Shown as an upsell. */
    missedAds: number;
  };
  topBlocked: { domain: string; count: number }[];
}

export interface ActivityEntry {
  at: string;
  domain: string;
  blocked: boolean;
  reason: string | null;
  profileId: string | null;
}

export interface ApiError {
  error: string;
  message: string;
  /** Present when error === 'upgrade_required'. */
  feature?: Feature;
  requiredPlan?: PlanId;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface StatusResponse {
  protected: boolean;
  lastSeenAt: string | null;
  linkedIp: string | null;
  /** The IP this request came from - if it differs from linkedIp the router IP changed. */
  yourIp: string;
  /** true = request came from the home network, false = away, null = no home network linked yet. */
  atHome: boolean | null;
  /** Whether settings can be changed from where the parent is right now. */
  canManage: boolean;
}
