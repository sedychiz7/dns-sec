import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { SetupInfo } from '@kinshield/shared';
import { api } from '../../src/api';
import { Button, Card, CopyField, H1, H2, P, Screen, handleError } from '../../src/components/ui';
import { ROUTER_GUIDES } from '../../src/routerGuides';
import { useSession } from '../../src/session';
import { useColors } from '../../src/theme';

export default function RouterSetup() {
  const { network, putNetwork, refreshStatus } = useSession();
  const [setup, setSetup] = useState<SetupInfo | null>(null);
  const [brand, setBrand] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<'ok' | 'waiting' | 'elsewhere' | null>(null);
  const c = useColors();

  useEffect(() => {
    if (!network) return;
    // Step 1 happens automatically the first time: this phone is on the home
    // Wi-Fi, so linking records the home's public IP. Parents never see or type it.
    // Once linked we never re-link silently - the parent might be at work.
    (network.linkedIp ? Promise.resolve(network) : api.linkNetwork(network.id))
      .then(putNetwork)
      .then(() => api.networkSetup(network.id))
      .then(setSetup)
      .catch(handleError);
  }, [network?.id]);

  if (!network || !setup) return <Screen edges={['bottom']}><P muted>Getting your settings…</P></Screen>;

  const guide = ROUTER_GUIDES.find((g) => g.id === brand);

  const check = async () => {
    setChecking(true);
    try {
      const s = await api.networkStatus(network.id);
      await refreshStatus();
      setResult(s.protected ? 'ok' : s.atHome === false ? 'elsewhere' : 'waiting');
    } catch (err) {
      handleError(err);
    } finally {
      setChecking(false);
    }
  };

  return (
    <Screen edges={['bottom']}>
      <H1>Protect every device</H1>
      <P muted>
        Make sure this phone is connected to your home Wi-Fi. Then copy these two addresses into your router’s DNS settings.
      </P>

      <Card style={{ gap: 10 }}>
        <CopyField label="Primary DNS" value={setup.dnsServers.ipv4[0] ?? ''} />
        {setup.dnsServers.ipv4[1] && <CopyField label="Secondary DNS" value={setup.dnsServers.ipv4[1]} />}
      </Card>

      <H2>What router do you have?</H2>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {ROUTER_GUIDES.map((g) => (
          <Pressable
            key={g.id}
            onPress={() => setBrand(g.id)}
            style={{
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 999,
              borderWidth: 1.5,
              borderColor: brand === g.id ? c.primary : c.border,
              backgroundColor: brand === g.id ? c.primary : c.card,
            }}
          >
            <Text style={{ color: brand === g.id ? '#fff' : c.text, fontWeight: '600' }}>{g.name}</Text>
          </Pressable>
        ))}
      </View>

      {guide && (
        <Card style={{ gap: 10 }}>
          <Text style={{ color: c.muted, fontWeight: '600' }}>Open: {guide.where}</Text>
          {guide.limited ? (
            <>
              <P>{guide.limited}</P>
              <Button title="Protect devices one by one" onPress={() => router.push('/setup/device')} />
            </>
          ) : (
            guide.steps.map((s, i) => (
              <View key={s} style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>{i + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <P>{s}</P>
                </View>
              </View>
            ))
          )}
        </Card>
      )}

      {result === 'ok' && (
        <Card style={{ backgroundColor: c.goodBg, flexDirection: 'row', gap: 10, alignItems: 'center' }}>
          <Ionicons name="checkmark-circle" size={28} color={c.good} />
          <View style={{ flex: 1 }}>
            <P>You’re protected! Every device on {network.name} Wi-Fi is now filtered.</P>
          </View>
        </Card>
      )}
      {result === 'waiting' && (
        <Card style={{ backgroundColor: c.warnBg }}>
          <P>
            We haven’t seen traffic yet. Routers can take a few minutes after saving - try restarting the router, then check again.
          </P>
        </Card>
      )}

      {result === 'elsewhere' && (
        <Card style={{ backgroundColor: c.warnBg, gap: 10 }}>
          <P>
            This phone isn’t on the connection we have saved for {network.name}. If you’re at home on your Wi-Fi right now, use this
            connection instead.
          </P>
          <Button
            title="I'm on my home Wi-Fi - use this connection"
            icon="wifi"
            onPress={() =>
              api
                .linkNetwork(network.id)
                .then(putNetwork)
                .then(check)
                .catch(handleError)
            }
          />
        </Card>
      )}

      <Button title="Check my protection" icon="refresh" onPress={check} loading={checking} />
      <Button title={result === 'ok' ? 'Go to dashboard' : 'Done for now'} variant="secondary" onPress={() => router.replace('/(tabs)')} />
    </Screen>
  );
}
