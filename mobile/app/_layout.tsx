import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SessionProvider } from '../src/session';
import { useColors } from '../src/theme';

function Nav() {
  const c = useColors();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: c.bg },
        headerTintColor: c.text,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: c.bg },
        headerBackTitle: 'Back',
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="welcome" options={{ headerShown: false }} />
      <Stack.Screen name="auth" options={{ title: '' }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="setup/index" options={{ title: 'Set up protection' }} />
      <Stack.Screen name="setup/router" options={{ title: 'Whole-home setup' }} />
      <Stack.Screen name="setup/device" options={{ title: 'Protect a device' }} />
      <Stack.Screen name="profile/[id]" options={{ title: 'Profile' }} />
      <Stack.Screen name="lists" options={{ title: 'Allow & block sites' }} />
      <Stack.Screen name="help" options={{ title: 'How it works', presentation: 'modal' }} />
      <Stack.Screen name="paywall" options={{ headerShown: false, presentation: 'modal' }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <StatusBar style="auto" />
        <Nav />
      </SessionProvider>
    </SafeAreaProvider>
  );
}
