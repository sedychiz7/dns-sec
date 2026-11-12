import { Platform } from 'react-native';
import Constants from 'expo-constants';
import type {
  ActivityEntry,
  ApiError as ApiErrorBody,
  AuthResponse,
  Feature,
  Network,
  Plan,
  PlanId,
  Policy,
  Profile,
  SetupInfo,
  StatsResponse,
  StatusResponse,
  User,
} from '@kinshield/shared';

/**
 * Native apps use extra.apiUrl. The web dashboard is served by the API server
 * itself, so it talks to its own origin (override with EXPO_PUBLIC_API_URL).
 */
export const API_URL: string =
  process.env.EXPO_PUBLIC_API_URL ||
  (Platform.OS === 'web' && typeof window !== 'undefined'
    ? window.location.origin
    : ((Constants.expoConfig?.extra?.apiUrl as string | undefined) ?? 'http://localhost:8080'));

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: ApiErrorBody,
  ) {
    super(body.message);
  }

  /** True when the server says "this needs a paid plan" - show the paywall. */
  get isUpgrade(): boolean {
    return this.status === 402;
  }

  get feature(): Feature | undefined {
    return this.body.feature;
  }

  get requiredPlan(): PlanId | undefined {
    return this.body.requiredPlan;
  }
}

let token: string | null = null;
export function setToken(t: string | null) {
  token = t;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, { error: 'offline', message: "Can't reach KinShield. Check your connection." });
  }
  if (res.status === 204) return undefined as T;
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, {
      error: json.error ?? 'error',
      message: json.message ?? 'Something went wrong.',
      feature: json.feature,
      requiredPlan: json.requiredPlan,
    });
  }
  return json as T;
}

export type PolicyPatch = Partial<Omit<Policy, 'categories'>> & { categories?: Partial<Policy['categories']> };

export const api = {
  signup: (email: string, password: string) => request<AuthResponse>('POST', '/v1/auth/signup', { email, password }),
  login: (email: string, password: string) => request<AuthResponse>('POST', '/v1/auth/login', { email, password }),
  me: () => request<{ user: User; plan: Plan }>('GET', '/v1/me'),
  deleteAccount: () => request<void>('DELETE', '/v1/me'),

  networks: () => request<Network[]>('GET', '/v1/networks'),
  createNetwork: (name: string, timezone: string) => request<Network>('POST', '/v1/networks', { name, timezone }),
  updateNetwork: (id: string, body: { name?: string; policy?: PolicyPatch }) =>
    request<Network>('PATCH', `/v1/networks/${id}`, body),
  deleteNetwork: (id: string) => request<void>('DELETE', `/v1/networks/${id}`),
  linkNetwork: (id: string) => request<Network>('POST', `/v1/networks/${id}/link`),
  networkSetup: (id: string) => request<SetupInfo>('GET', `/v1/networks/${id}/setup`),
  networkStatus: (id: string) => request<StatusResponse>('GET', `/v1/networks/${id}/status`),
  pauseNetwork: (id: string, minutes: number | null) =>
    request<Network>('POST', `/v1/networks/${id}/pause`, { minutes }),
  stats: (id: string, days: number) => request<StatsResponse>('GET', `/v1/networks/${id}/stats?days=${days}`),
  activity: (id: string, opts: { blockedOnly?: boolean; search?: string; profileId?: string } = {}) => {
    const q = new URLSearchParams({ limit: '200' });
    if (opts.blockedOnly) q.set('blocked', 'true');
    if (opts.search) q.set('search', opts.search);
    if (opts.profileId) q.set('profileId', opts.profileId);
    return request<ActivityEntry[]>('GET', `/v1/networks/${id}/activity?${q}`);
  },

  createProfile: (networkId: string, name: string, emoji: string) =>
    request<Profile>('POST', `/v1/networks/${networkId}/profiles`, { name, emoji }),
  updateProfile: (id: string, body: { name?: string; emoji?: string; policy?: PolicyPatch }) =>
    request<Profile>('PATCH', `/v1/profiles/${id}`, body),
  pauseProfile: (id: string, minutes: number | null) => request<Profile>('POST', `/v1/profiles/${id}/pause`, { minutes }),
  profileSetup: (id: string) => request<SetupInfo>('GET', `/v1/profiles/${id}/setup`),
  deleteProfile: (id: string) => request<void>('DELETE', `/v1/profiles/${id}`),

  syncPlan: (plan: PlanId) => request<{ user: User }>('POST', '/v1/billing/sync', { plan }),
};
