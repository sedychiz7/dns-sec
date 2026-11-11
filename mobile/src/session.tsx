import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { storage } from './storage';
import { type Feature, type Network, type PlanId, type User, hasFeature } from '@kinshield/shared';
import { api, setToken } from './api';
import { billing } from './billing';

const TOKEN_KEY = 'kinshield.token';
const NETWORK_KEY = 'kinshield.network';

interface Session {
  ready: boolean;
  user: User | null;
  plan: PlanId;
  networks: Network[];
  network: Network | null;
  can: (feature: Feature) => boolean;
  signIn: (mode: 'login' | 'signup', email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  selectNetwork: (id: string) => void;
  /** Replace a network in state after a mutation returned it. */
  putNetwork: (n: Network) => void;
}

const Ctx = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [networks, setNetworks] = useState<Network[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [{ user: u }, nets] = await Promise.all([api.me(), api.networks()]);
    setUser(u);
    setNetworks(nets);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [t, n] = await Promise.all([storage.get(TOKEN_KEY), storage.get(NETWORK_KEY)]);
        setSelectedId(n);
        if (t) {
          setToken(t);
          await refresh();
        }
      } catch {
        // invalid/expired token -> signed out
        setToken(null);
      } finally {
        setReady(true);
      }
    })();
  }, [refresh]);

  useEffect(() => {
    if (user) billing.identify(user.id).catch(() => undefined);
  }, [user?.id]);

  const signIn = useCallback(
    async (mode: 'login' | 'signup', email: string, password: string) => {
      const res = mode === 'login' ? await api.login(email, password) : await api.signup(email, password);
      setToken(res.token);
      await storage.set(TOKEN_KEY, res.token);
      await refresh();
    },
    [refresh],
  );

  const signOut = useCallback(async () => {
    setToken(null);
    await storage.remove(TOKEN_KEY);
    await billing.logout().catch(() => undefined);
    setUser(null);
    setNetworks([]);
  }, []);

  const value = useMemo<Session>(() => {
    const plan = user?.plan ?? 'free';
    const network = networks.find((n) => n.id === selectedId) ?? networks[0] ?? null;
    return {
      ready,
      user,
      plan,
      networks,
      network,
      can: (f) => hasFeature(plan, f),
      signIn,
      signOut,
      refresh,
      selectNetwork: (id) => {
        setSelectedId(id);
        storage.set(NETWORK_KEY, id).catch(() => undefined);
      },
      putNetwork: (n) => setNetworks((prev) => (prev.some((p) => p.id === n.id) ? prev.map((p) => (p.id === n.id ? n : p)) : [...prev, n])),
    };
  }, [ready, user, networks, selectedId, signIn, signOut, refresh]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): Session {
  const s = useContext(Ctx);
  if (!s) throw new Error('useSession outside SessionProvider');
  return s;
}
