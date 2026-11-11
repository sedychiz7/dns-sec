import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Localization from 'expo-localization';
import { api } from '../../src/api';
import { Button, Card, H1, P, Screen, handleError, type IconName } from '../../src/components/ui';
import { useSession } from '../../src/session';
import { useColors } from '../../src/theme';

function Choice({ icon, title, body, badge, onPress }: { icon: IconName; title: string; body: string; badge?: string; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable onPress={onPress}>
      <Card style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
        <View style={{ width: 52, height: 52, borderRadius: 14, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={icon} size={28} color={c.primary} />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <Text style={{ fontSize: 17, fontWeight: '700', color: c.text }}>{title}</Text>
            {badge && (
              <Text style={{ fontSize: 11, fontWeight: '800', color: c.good, backgroundColor: c.goodBg, paddingHorizontal: 6, borderRadius: 6 }}>
                {badge}
              </Text>
            )}
          </View>
          <Text style={{ fontSize: 14, color: c.muted }}>{body}</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={c.muted} />
      </Card>
    </Pressable>
  );
}

export default function SetupStart() {
  const { network, putNetwork, selectNetwork } = useSession();
  const { new: isNew } = useLocalSearchParams<{ new?: string }>();
  const [name, setName] = useState('Home');
  const [busy, setBusy] = useState(false);
  const c = useColors();

  if (!network || isNew) {
    const create = async () => {
      setBusy(true);
      try {
        const tz = Localization.getCalendars()[0]?.timeZone ?? 'UTC';
        const n = await api.createNetwork(name.trim() || 'Home', tz);
        putNetwork(n);
        selectNetwork(n.id);
        if (isNew) router.setParams({ new: '' });
      } catch (err) {
        handleError(err);
      } finally {
        setBusy(false);
      }
    };
    return (
      <Screen edges={['bottom']}>
        <H1>Name this place</H1>
        <P muted>You can protect more places (like grandma’s house) later.</P>
        <TextInput
          value={name}
          onChangeText={setName}
          style={{ backgroundColor: c.card, borderColor: c.border, borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 17, color: c.text }}
        />
        <Button title="Continue" onPress={create} loading={busy} />
      </Screen>
    );
  }

  return (
    <Screen edges={['bottom']}>
      <H1>How do you want to protect {network.name}?</H1>
      <P muted>Pick one - you can always add the other later.</P>
      <Choice
        icon="wifi"
        title="Every device on my Wi-Fi"
        badge="RECOMMENDED"
        body="Change one setting on your router and every phone, tablet, TV and console is covered. We walk you through it."
        onPress={() => router.push('/setup/router')}
      />
      <Choice
        icon="phone-portrait"
        title="Just one device"
        body="Protect a single phone, tablet or laptop - even on mobile data and other Wi-Fi."
        onPress={() => router.push('/setup/device')}
      />
      <Button title="I'll do this later" variant="secondary" onPress={() => router.replace('/(tabs)')} />
    </Screen>
  );
}
