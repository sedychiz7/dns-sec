import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { StatsResponse } from '@kinshield/shared';
import { api } from '../../src/api';
import { Button, Card, H1, H2, P, PlanBadge, Screen, Stat, confirm, handleError, openPaywall } from '../../src/components/ui';
import { AccessBanner } from '../../src/components/AccessBanner';
import { useSession } from '../../src/session';
import { useColors } from '../../src/theme';

function useTick(ms: number) {
  const [, set] = useState(0);
  useEffect(() => {
    const t = setInterval(() => set((n) => n + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
}

export default function Home() {
  const { network, plan, can, putNetwork, refresh, status, refreshStatus } = useSession();
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [choosingPause, setChoosingPause] = useState(false);
  const c = useColors();
  useTick(30_000);

  const load = useCallback(async () => {
    if (!network) return;
    setLoading(true);
    try {
      const [, st] = await Promise.all([refreshStatus(), api.stats(network.id, 1)]);
      setStats(st);
    } catch (err) {
      handleError(err);
    } finally {
      setLoading(false);
    }
  }, [network?.id, refreshStatus]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (!network) return <Redirect href="/setup" />;

  const pausedUntil = network.policy.pausedUntil && new Date(network.policy.pausedUntil) > new Date() ? new Date(network.policy.pausedUntil) : null;
  const isProtected = status?.protected ?? false;
  // Most home internet IPs change now and then. If ours moved, the parent re-links from home in one tap.
  const ipMoved = Boolean(status && !status.protected && status.atHome === false);

  const relink = () =>
    confirm(
      `Use this connection for ${network.name}?`,
      `Only do this while this device is on your ${network.name} Wi-Fi - otherwise ${network.name} stops being filtered.`,
      'Use this connection',
      async () => {
        try {
          putNetwork(await api.linkNetwork(network.id));
          await load();
        } catch (err) {
          handleError(err);
        }
      },
    );

  const runPause = (minutes: number | null) => {
    setChoosingPause(false);
    api.pauseNetwork(network.id, minutes).then(putNetwork).catch(handleError);
  };

  const pause = () => {
    if (!can('pauseInternet')) return openPaywall('pauseInternet');
    if (pausedUntil) return runPause(null);
    setChoosingPause((v) => !v);
  };

  /** Minutes until the next 7:00 AM ("until morning"). */
  const untilMorning = () => {
    const next = new Date();
    next.setHours(7, 0, 0, 0);
    if (next.getTime() <= Date.now()) next.setDate(next.getDate() + 1);
    return Math.min(24 * 60, Math.ceil((next.getTime() - Date.now()) / 60_000));
  };

  return (
    <Screen refreshing={loading} onRefresh={() => { refresh(); load(); }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <H1>{network.name}</H1>
        <PlanBadge plan={plan} />
      </View>

      <Pressable onPress={() => !isProtected && router.push('/setup')}>
        <Card style={{ alignItems: 'center', gap: 10, paddingVertical: 28, backgroundColor: pausedUntil ? c.warnBg : isProtected ? c.goodBg : c.card }}>
          <Ionicons
            name={pausedUntil ? 'pause-circle' : isProtected ? 'shield-checkmark' : 'shield-outline'}
            size={72}
            color={pausedUntil ? c.warn : isProtected ? c.good : c.muted}
          />
          <Text style={{ fontSize: 22, fontWeight: '800', color: c.text }}>
            {pausedUntil ? 'Internet paused' : isProtected ? 'Protected' : status ? 'Not connected yet' : 'Checking…'}
          </Text>
          <P muted center>
            {pausedUntil
              ? `Until ${pausedUntil.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
              : isProtected
                ? 'Harmful sites are blocked on your network.'
                : 'Tap to finish setup - it takes 2 minutes.'}
          </P>
        </Card>
      </Pressable>

      <AccessBanner />

      {ipMoved && (
        <Card style={{ gap: 8 }}>
          <P muted>Not seeing traffic from home? If you’re on your home Wi-Fi right now, its address may have changed.</P>
          <Button title="I'm home - reconnect" icon="wifi" variant="secondary" onPress={relink} />
        </Card>
      )}

      <Card>
        <H2>Today</H2>
        <View style={{ flexDirection: 'row', marginTop: 12 }}>
          <Stat label="Sites checked" value={stats?.totals.total ?? 0} />
          <Stat label="Blocked" value={stats?.totals.blocked ?? 0} color={c.primary} />
          <Stat label="Threats stopped" value={stats?.totals.threatsBlocked ?? 0} color={c.bad} />
        </View>
        {can('adBlocking') && (
          <View style={{ flexDirection: 'row', marginTop: 16 }}>
            <Stat label="Ads & trackers blocked" value={stats?.totals.adsBlocked ?? 0} color={c.plus} />
          </View>
        )}
      </Card>

      {/* The free plan's main conversion lever: show what they're missing, in their own numbers. */}
      {!can('adBlocking') && (
        <Pressable onPress={() => openPaywall('adBlocking', 'plus')}>
          <Card style={{ borderColor: c.plus, borderWidth: 2, gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="megaphone" size={20} color={c.plus} />
              <H2>
                {stats && stats.totals.missedAds > 0
                  ? `${stats.totals.missedAds.toLocaleString()} ads & trackers got through today`
                  : 'Block ads on every device'}
              </H2>
            </View>
            <P muted>Plus blocks ads and the trackers that follow your family around - on phones, TVs, tablets and games.</P>
            <Text style={{ color: c.plus, fontWeight: '800', marginTop: 4 }}>Try Plus free for 7 days →</Text>
          </Card>
        </Pressable>
      )}

      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Button title={pausedUntil ? 'Resume' : 'Pause'} icon={pausedUntil ? 'play' : 'pause'} variant={pausedUntil ? 'primary' : 'secondary'} onPress={pause} />
        </View>
        <View style={{ flex: 1 }}>
          <Button title="Add device" icon="add" variant="secondary" onPress={() => router.push('/setup')} />
        </View>
      </View>

      {choosingPause && (
        <Card style={{ gap: 10 }}>
          <P>Block all websites on {network.name} Wi-Fi for…</P>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {[
              { label: '15 min', minutes: 15 },
              { label: '1 hour', minutes: 60 },
              { label: 'Until 7 AM', minutes: untilMorning() },
            ].map((o) => (
              <View key={o.label} style={{ flex: 1 }}>
                <Button title={o.label} variant="secondary" onPress={() => runPause(o.minutes)} />
              </View>
            ))}
          </View>
        </Card>
      )}

      {stats && stats.topBlocked.length > 0 && (
        <Card>
          <H2>Most blocked today</H2>
          {stats.topBlocked.slice(0, 5).map((t) => (
            <View key={t.domain} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 }}>
              <Text style={{ color: c.text, flex: 1 }} numberOfLines={1}>{t.domain}</Text>
              <Text style={{ color: c.muted, fontVariant: ['tabular-nums'] }}>{t.count}</Text>
            </View>
          ))}
        </Card>
      )}
    </Screen>
  );
}
