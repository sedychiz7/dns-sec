import type { ColorValue } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '../../src/theme';

export default function TabsLayout() {
  const c = useColors();
  const icon =
    (name: keyof typeof Ionicons.glyphMap) =>
    ({ color, size }: { color: ColorValue; size: number }) => <Ionicons name={name} color={color as string} size={size} />;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.primary,
        tabBarStyle: { backgroundColor: c.card, borderTopColor: c.border },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: icon('shield-checkmark') }} />
      <Tabs.Screen name="filters" options={{ title: 'Filters', tabBarIcon: icon('options') }} />
      <Tabs.Screen name="family" options={{ title: 'Family', tabBarIcon: icon('people') }} />
      <Tabs.Screen name="activity" options={{ title: 'Activity', tabBarIcon: icon('pulse') }} />
      <Tabs.Screen name="account" options={{ title: 'Account', tabBarIcon: icon('person-circle') }} />
    </Tabs>
  );
}
