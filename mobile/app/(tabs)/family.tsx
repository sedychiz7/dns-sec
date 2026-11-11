import { useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { PLANS } from '@kinshield/shared';
import { api } from '../../src/api';
import { Button, Card, H1, H2, P, Screen, handleError, openPaywall } from '../../src/components/ui';
import { useSession } from '../../src/session';
import { useColors } from '../../src/theme';

const EMOJIS = ['🧒', '👧', '👦', '🧑', '🦖', '🦄', '🐱', '🚀', '⚽', '🎮'];

export default function Family() {
  const { network, can, refresh } = useSession();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState(EMOJIS[0]!);
  const [busy, setBusy] = useState(false);
  const c = useColors();
  if (!network) return <Redirect href="/setup" />;

  if (!can('profiles')) {
    return (
      <Screen>
        <H1>Family</H1>
        <Card style={{ gap: 12, alignItems: 'center', paddingVertical: 28 }}>
          <Ionicons name="people" size={56} color={c.pro} />
          <H2>Different rules for each child</H2>
          <P muted center>
            Give your 7-year-old strict rules and your teen more freedom. Set bedtimes, homework hours, and pause one child’s internet without affecting anyone else.
          </P>
          {PLANS.pro.highlights.slice(1, 5).map((h) => (
            <View key={h} style={{ flexDirection: 'row', gap: 8, alignSelf: 'stretch' }}>
              <Ionicons name="checkmark-circle" size={20} color={c.good} />
              <Text style={{ color: c.text, flex: 1 }}>{h}</Text>
            </View>
          ))}
          <View style={{ alignSelf: 'stretch' }}>
            <Button title="Try Pro free for 7 days" variant="pro" onPress={() => openPaywall('profiles', 'pro')} />
          </View>
        </Card>
      </Screen>
    );
  }

  const add = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const p = await api.createProfile(network.id, name.trim(), emoji);
      await refresh();
      setAdding(false);
      setName('');
      Alert.alert(`${p.name} added`, `Now set up ${p.name}'s phone or tablet so their rules apply.`, [
        { text: 'Later' },
        { text: 'Set up device', onPress: () => router.push({ pathname: '/setup/device', params: { profileId: p.id } }) },
      ]);
    } catch (err) {
      handleError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <H1>Family</H1>
      <P muted>Each child gets their own rules on their own devices - at home, at school and on mobile data.</P>

      {network.profiles.map((p) => {
        const paused = p.policy.pausedUntil && new Date(p.policy.pausedUntil) > new Date();
        return (
          <Pressable key={p.id} onPress={() => router.push({ pathname: '/profile/[id]', params: { id: p.id } })}>
            <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <Text style={{ fontSize: 36 }}>{p.emoji}</Text>
              <View style={{ flex: 1 }}>
                <H2>{p.name}</H2>
                <Text style={{ color: paused ? c.warn : p.lastSeenAt ? c.good : c.muted, fontWeight: '600' }}>
                  {paused ? 'Paused' : p.lastSeenAt ? 'Protected' : 'Device not set up yet'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={c.muted} />
            </Card>
          </Pressable>
        );
      })}

      {adding ? (
        <Card style={{ gap: 12 }}>
          <H2>Add a child</H2>
          <TextInput
            placeholder="Name"
            placeholderTextColor={c.muted}
            value={name}
            onChangeText={setName}
            autoFocus
            style={{ backgroundColor: c.bg, borderRadius: 12, padding: 14, fontSize: 16, color: c.text }}
          />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {EMOJIS.map((e) => (
              <Pressable
                key={e}
                onPress={() => setEmoji(e)}
                style={{ padding: 6, borderRadius: 10, borderWidth: 2, borderColor: emoji === e ? c.primary : 'transparent' }}
              >
                <Text style={{ fontSize: 28 }}>{e}</Text>
              </Pressable>
            ))}
          </View>
          <Button title="Add" onPress={add} loading={busy} />
          <Button title="Cancel" variant="secondary" onPress={() => setAdding(false)} />
        </Card>
      ) : (
        <Button title="Add a child" icon="person-add" onPress={() => setAdding(true)} />
      )}
    </Screen>
  );
}
