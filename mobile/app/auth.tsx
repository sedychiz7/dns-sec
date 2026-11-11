import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Button, H1, P, Screen, handleError } from '../src/components/ui';
import { useSession } from '../src/session';
import { useColors } from '../src/theme';

export default function Auth() {
  const { mode: initial } = useLocalSearchParams<{ mode?: 'login' | 'signup' }>();
  const [mode, setMode] = useState<'login' | 'signup'>(initial === 'login' ? 'login' : 'signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const { signIn } = useSession();
  const c = useColors();

  const input = {
    backgroundColor: c.card,
    borderColor: c.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: c.text,
  } as const;

  const submit = async () => {
    setBusy(true);
    try {
      await signIn(mode, email, password);
      router.replace('/');
    } catch (err) {
      handleError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen edges={['bottom']}>
      <H1>{mode === 'signup' ? 'Create your account' : 'Welcome back'}</H1>
      <P muted>{mode === 'signup' ? 'Free forever. No credit card needed.' : 'Sign in to manage your family’s Wi-Fi.'}</P>
      <View style={{ gap: 12 }}>
        <TextInput
          style={input}
          placeholder="Email"
          placeholderTextColor={c.muted}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={input}
          placeholder={mode === 'signup' ? 'Password (8+ characters)' : 'Password'}
          placeholderTextColor={c.muted}
          secureTextEntry
          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          value={password}
          onChangeText={setPassword}
          onSubmitEditing={submit}
        />
      </View>
      <Button title={mode === 'signup' ? 'Create account' : 'Sign in'} onPress={submit} loading={busy} />
      <Button
        variant="secondary"
        title={mode === 'signup' ? 'I already have an account' : 'Create a new account'}
        onPress={() => setMode(mode === 'signup' ? 'login' : 'signup')}
      />
    </Screen>
  );
}
