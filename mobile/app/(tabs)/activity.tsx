import { useCallback, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Redirect, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { type ActivityEntry, CATEGORIES, PLANS } from '@kinshield/shared';
import { api } from '../../src/api';
import { Button, Card, H1, P, Screen, handleError, openPaywall } from '../../src/components/ui';
import { useSession } from '../../src/session';
import { useColors } from '../../src/theme';

const REASONS: Record<string, string> = {
  ...Object.fromEntries(CATEGORIES.map((c) => [c.id, c.name])),
  custom: 'Your block list',
  schedule: 'Schedule',
  paused: 'Paused',
  safesearch: 'SafeSearch',
  youtube: 'YouTube Restricted',
};

const PREVIEW: ActivityEntry[] = [
  { at: new Date().toISOString(), domain: 'ads.example-network.com', blocked: true, reason: 'ads', profileId: null },
  { at: new Date().toISOString(), domain: 'www.wikipedia.org', blocked: false, reason: null, profileId: null },
  { at: new Date().toISOString(), domain: 'tracker.example-metrics.io', blocked: true, reason: 'trackers', profileId: null },
  { at: new Date().toISOString(), domain: 'login-secure-bank.example', blocked: true, reason: 'security', profileId: null },
];

export default function Activity() {
  const { network, can } = useSession();
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [blockedOnly, setBlockedOnly] = useState(true);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const c = useColors();
  const allowed = can('activityLog');

  const load = useCallback(async () => {
    if (!network || !allowed) return;
    setLoading(true);
    try {
      setEntries(await api.activity(network.id, { blockedOnly, search: search || undefined }));
    } catch (err) {
      handleError(err);
    } finally {
      setLoading(false);
    }
  }, [network?.id, allowed, blockedOnly, search]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!network) return <Redirect href="/setup" />;

  const list = allowed ? entries : PREVIEW;
  const profileName = (id: string | null) => network.profiles.find((p) => p.id === id)?.name;

  return (
    <Screen refreshing={loading} onRefresh={load}>
      <H1>Activity</H1>
      {allowed ? (
        <>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {[true, false].map((b) => (
              <Pressable
                key={String(b)}
                onPress={() => setBlockedOnly(b)}
                style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: blockedOnly === b ? c.primary : c.card }}
              >
                <Text style={{ color: blockedOnly === b ? '#fff' : c.text, fontWeight: '600' }}>{b ? 'Blocked' : 'Everything'}</Text>
              </Pressable>
            ))}
          </View>
          <TextInput
            placeholder="Search a website"
            placeholderTextColor={c.muted}
            value={search}
            onChangeText={setSearch}
            onSubmitEditing={load}
            autoCapitalize="none"
            style={{ backgroundColor: c.card, borderRadius: 12, padding: 12, color: c.text, borderWidth: 1, borderColor: c.border }}
          />
          <P muted>Kept for {PLANS[can('profiles') ? 'pro' : 'plus'].limits.activityRetentionDays} days, then deleted automatically.</P>
        </>
      ) : (
        <Card style={{ gap: 10, borderColor: c.plus, borderWidth: 2 }}>
          <P>See which sites were blocked - and why - on every device. Spot problems before they become problems.</P>
          <Button title="Unlock with Plus" variant="plus" onPress={() => openPaywall('activityLog', 'plus')} />
        </Card>
      )}

      <Card style={{ opacity: allowed ? 1 : 0.35 }}>
        {list.length === 0 && <P muted>Nothing yet. Activity shows up a few seconds after devices go online.</P>}
        {list.map((e, i) => (
          <View key={`${e.at}${i}`} style={{ flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 8 }}>
            <Ionicons name={e.blocked ? 'close-circle' : 'checkmark-circle'} size={20} color={e.blocked ? c.bad : c.good} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: c.text, fontWeight: '600' }} numberOfLines={1}>{e.domain}</Text>
              <Text style={{ color: c.muted, fontSize: 12 }}>
                {new Date(e.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                {e.reason ? ` · ${REASONS[e.reason] ?? e.reason}` : ''}
                {profileName(e.profileId) ? ` · ${profileName(e.profileId)}` : ''}
              </Text>
            </View>
          </View>
        ))}
      </Card>
    </Screen>
  );
}
