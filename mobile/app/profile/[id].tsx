import { Alert, Pressable, Text, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { type Policy, type Schedule, type Weekday, parseHHMM } from '@kinshield/shared';
import { api, type PolicyPatch } from '../../src/api';
import { Button, Card, H2, P, Screen, ToggleRow, handleError } from '../../src/components/ui';
import { PolicyEditor } from '../../src/components/PolicyEditor';
import { useSession } from '../../src/session';
import { useColors } from '../../src/theme';

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** One-tap schedule templates - parents tweak times instead of building from scratch. */
const PRESETS: Omit<Schedule, 'id'>[] = [
  { name: 'School-night bedtime', enabled: true, days: [0, 1, 2, 3, 4], start: '21:00', end: '07:00', mode: 'offline', categories: [] },
  { name: 'Weekend bedtime', enabled: true, days: [5, 6], start: '22:30', end: '08:00', mode: 'offline', categories: [] },
  { name: 'Homework time', enabled: true, days: [1, 2, 3, 4, 5], start: '16:00', end: '18:00', mode: 'focus', categories: ['social', 'gaming'] },
  { name: 'Dinner time', enabled: true, days: [0, 1, 2, 3, 4, 5, 6], start: '18:00', end: '19:00', mode: 'offline', categories: [] },
];

function shift(hhmm: string, minutes: number): string {
  const t = (parseHHMM(hhmm) + minutes + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

function fmt(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function TimeStepper({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Pressable onPress={() => onChange(shift(value, -30))} hitSlop={8}>
        <Ionicons name="remove-circle" size={26} color={c.primary} />
      </Pressable>
      <Text style={{ color: c.text, fontWeight: '700', minWidth: 72, textAlign: 'center' }}>{fmt(value)}</Text>
      <Pressable onPress={() => onChange(shift(value, 30))} hitSlop={8}>
        <Ionicons name="add-circle" size={26} color={c.primary} />
      </Pressable>
    </View>
  );
}

export default function ProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { network, plan, can, refresh, putNetwork } = useSession();
  const c = useColors();
  const profile = network?.profiles.find((p) => p.id === id);
  if (!network || !profile) return <Screen edges={['bottom']}><P muted>Profile not found.</P></Screen>;

  const save = async (patch: PolicyPatch) => {
    const optimistic: Policy = { ...profile.policy, ...patch, categories: { ...profile.policy.categories, ...patch.categories } } as Policy;
    putNetwork({ ...network, profiles: network.profiles.map((p) => (p.id === profile.id ? { ...p, policy: optimistic } : p)) });
    try {
      const updated = await api.updateProfile(profile.id, { policy: patch });
      putNetwork({ ...network, profiles: network.profiles.map((p) => (p.id === updated.id ? updated : p)) });
    } catch (err) {
      await refresh();
      handleError(err);
    }
  };

  const schedules = profile.policy.schedules;
  const setSchedules = (next: Schedule[]) => save({ schedules: next });
  const updateSchedule = (sid: string, patch: Partial<Schedule>) =>
    setSchedules(schedules.map((s) => (s.id === sid ? { ...s, ...patch } : s)));

  const pausedUntil = profile.policy.pausedUntil && new Date(profile.policy.pausedUntil) > new Date() ? new Date(profile.policy.pausedUntil) : null;
  const pause = (minutes: number | null) =>
    api
      .pauseProfile(profile.id, minutes)
      .then((p) => putNetwork({ ...network, profiles: network.profiles.map((x) => (x.id === p.id ? p : x)) }))
      .catch(handleError);

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: `${profile.emoji} ${profile.name}` }} />

      <Card style={{ gap: 10 }}>
        <H2>{pausedUntil ? `Paused until ${pausedUntil.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'Pause internet'}</H2>
        {pausedUntil ? (
          <Button title={`Resume ${profile.name}'s internet`} icon="play" onPress={() => pause(null)} />
        ) : (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {[15, 60, 120].map((m) => (
              <View key={m} style={{ flex: 1 }}>
                <Button title={m < 60 ? `${m} min` : `${m / 60} hr`} variant="secondary" onPress={() => pause(m)} />
              </View>
            ))}
          </View>
        )}
      </Card>

      <Card style={{ gap: 6 }}>
        <H2>Schedules</H2>
        {schedules.length === 0 && <P muted>No schedules yet. Add a bedtime so devices go quiet at night.</P>}
        {schedules.map((s) => (
          <View key={s.id} style={{ borderTopWidth: 1, borderTopColor: c.border, paddingTop: 10, marginTop: 6, gap: 8 }}>
            <ToggleRow
              icon={s.mode === 'offline' ? 'moon' : 'book'}
              title={s.name}
              subtitle={s.mode === 'offline' ? 'Internet off' : 'Social media & games off'}
              value={s.enabled}
              onChange={(v) => updateSchedule(s.id, { enabled: v })}
            />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <TimeStepper value={s.start} onChange={(v) => updateSchedule(s.id, { start: v })} />
              <Text style={{ color: c.muted }}>to</Text>
              <TimeStepper value={s.end} onChange={(v) => updateSchedule(s.id, { end: v })} />
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              {DAY_LABELS.map((label, i) => {
                const on = s.days.includes(i as Weekday);
                return (
                  <Pressable
                    key={i}
                    onPress={() =>
                      updateSchedule(s.id, {
                        days: (on ? s.days.filter((d) => d !== i) : [...s.days, i as Weekday]).sort(),
                      })
                    }
                    style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? c.primary : c.bg }}
                  >
                    <Text style={{ color: on ? '#fff' : c.muted, fontWeight: '700' }}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Pressable onPress={() => setSchedules(schedules.filter((x) => x.id !== s.id))}>
              <Text style={{ color: c.bad, fontWeight: '600' }}>Remove</Text>
            </Pressable>
          </View>
        ))}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
          {PRESETS.filter((p) => !schedules.some((s) => s.name === p.name)).map((p) => (
            <Pressable
              key={p.name}
              onPress={() => setSchedules([...schedules, { ...p, id: `s${Date.now().toString(36)}` }])}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1.5, borderColor: c.primary }}
            >
              <Ionicons name="add" size={16} color={c.primary} />
              <Text style={{ color: c.primary, fontWeight: '600' }}>{p.name}</Text>
            </Pressable>
          ))}
        </View>
      </Card>

      <PolicyEditor policy={profile.policy} plan={plan} onChange={save} listsHref={`/lists?profileId=${profile.id}`} />

      <Button
        title={`Set up ${profile.name}'s device`}
        icon="phone-portrait"
        onPress={() => router.push({ pathname: '/setup/device', params: { profileId: profile.id } })}
      />
      <Button
        title="Remove profile"
        variant="danger"
        onPress={() =>
          Alert.alert(`Remove ${profile.name}?`, `${profile.name}'s devices will stop being filtered until set up again.`, [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Remove',
              style: 'destructive',
              onPress: async () => {
                try {
                  await api.deleteProfile(profile.id);
                  await refresh();
                  router.back();
                } catch (err) {
                  handleError(err);
                }
              },
            },
          ])
        }
      />
      {!can('profiles') && <P muted>Your plan no longer includes profiles, so this child follows the household rules.</P>}
    </Screen>
  );
}
