import { View, Text } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, P, Screen } from '../src/components/ui';
import { useColors } from '../src/theme';

const POINTS: { icon: keyof typeof Ionicons.glyphMap; text: string }[] = [
  { icon: 'shield-checkmark', text: 'Blocks adult & dangerous sites on every device on your Wi-Fi' },
  { icon: 'flash', text: 'Set up in 2 minutes - no confusing router menus' },
  { icon: 'phone-portrait', text: 'Works on phones, tablets, TVs, consoles and laptops' },
  { icon: 'lock-closed', text: 'No software to install on kids’ devices' },
];

export default function Welcome() {
  const c = useColors();
  return (
    <Screen edges={['top', 'bottom']}>
      <View style={{ alignItems: 'center', marginTop: 48, marginBottom: 16, gap: 12 }}>
        <View style={{ width: 96, height: 96, borderRadius: 28, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="shield-half" size={56} color="#fff" />
        </View>
        <Text style={{ fontSize: 34, fontWeight: '900', color: c.text }}>KinShield</Text>
        <P muted center>
          A safer internet for your whole family, controlled from your phone.
        </P>
      </View>
      <View style={{ gap: 14, marginVertical: 16 }}>
        {POINTS.map((p) => (
          <View key={p.text} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
            <Ionicons name={p.icon} size={24} color={c.good} />
            <View style={{ flex: 1 }}>
              <P>{p.text}</P>
            </View>
          </View>
        ))}
      </View>
      <Button title="Get started - it's free" onPress={() => router.push({ pathname: '/auth', params: { mode: 'signup' } })} />
      <Button title="I already have an account" variant="secondary" onPress={() => router.push({ pathname: '/auth', params: { mode: 'login' } })} />
    </Screen>
  );
}
