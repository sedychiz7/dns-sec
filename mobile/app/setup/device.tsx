import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import * as Clipboard from 'expo-clipboard';
import type { SetupInfo } from '@kinshield/shared';
import { api } from '../../src/api';
import { Button, Card, CopyField, H1, P, Screen, handleError } from '../../src/components/ui';
import { useSession } from '../../src/session';
import { useColors } from '../../src/theme';

type Platform = 'apple' | 'android' | 'windows' | 'other';

const PLATFORMS: { id: Platform; label: string }[] = [
  { id: 'apple', label: 'iPhone / iPad / Mac' },
  { id: 'android', label: 'Android' },
  { id: 'windows', label: 'Windows / Chromebook' },
  { id: 'other', label: 'Other' },
];

/**
 * Per-device protection uses encrypted DNS with a personal address, so it
 * works on mobile data and other Wi-Fi too. With Pro, each child's profile
 * gets its own address and therefore its own rules.
 */
export default function DeviceSetup() {
  const { profileId } = useLocalSearchParams<{ profileId?: string }>();
  const { network } = useSession();
  const [setup, setSetup] = useState<SetupInfo | null>(null);
  const [platform, setPlatform] = useState<Platform>('apple');
  const c = useColors();
  const profile = network?.profiles.find((p) => p.id === profileId);

  useEffect(() => {
    if (!network) return;
    (profileId ? api.profileSetup(profileId) : api.networkSetup(network.id)).then(setSetup).catch(handleError);
  }, [network?.id, profileId]);

  if (!setup) return <Screen edges={['bottom']}><P muted>Loading…</P></Screen>;

  return (
    <Screen edges={['bottom']}>
      <H1>{profile ? `Protect ${profile.name}'s device` : 'Protect a device'}</H1>
      <P muted>Do this on the device you want to protect. Takes about a minute.</P>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {PLATFORMS.map((p) => (
          <Pressable
            key={p.id}
            onPress={() => setPlatform(p.id)}
            style={{
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 999,
              borderWidth: 1.5,
              borderColor: platform === p.id ? c.primary : c.border,
              backgroundColor: platform === p.id ? c.primary : c.card,
            }}
          >
            <Text style={{ color: platform === p.id ? '#fff' : c.text, fontWeight: '600' }}>{p.label}</Text>
          </Pressable>
        ))}
      </View>

      {platform === 'apple' && (
        <Card style={{ gap: 12 }}>
          <P>1. On the iPhone, iPad or Mac, open this link (or tap the button if this is that device).</P>
          <CopyField label="Setup link" value={setup.appleProfileUrl} />
          <Button title="Install on this device" icon="download" onPress={() => WebBrowser.openBrowserAsync(setup.appleProfileUrl)} />
          <P>2. Tap Allow, then open Settings → Profile Downloaded → Install.</P>
          <P muted>Tip: set a Screen Time passcode on your child’s device so the profile can’t be removed.</P>
        </Card>
      )}

      {platform === 'android' && (
        <Card style={{ gap: 12 }}>
          <P>1. Open Settings → Network & internet → Private DNS (on Samsung: Connections → More connection settings).</P>
          <P>2. Choose “Private DNS provider hostname” and paste:</P>
          <CopyField label="Private DNS hostname" value={setup.dotHostname} />
          <P>3. Tap Save.</P>
        </Card>
      )}

      {platform === 'windows' && (
        <Card style={{ gap: 12 }}>
          <P>Chrome, Edge & Chromebook: Settings → Privacy and security → Security → Use secure DNS → Custom, and paste:</P>
          <CopyField label="Secure DNS address" value={setup.dohUrl} />
          <P muted>Windows 11 (whole computer): Settings → Network → your connection → DNS server assignment → Edit → Manual, use the addresses below with “Encrypted only (DNS over HTTPS)”.</P>
          {setup.dnsServers.ipv4.map((ip, i) => (
            <CopyField key={ip} label={`DNS ${i + 1}`} value={ip} />
          ))}
        </Card>
      )}

      {platform === 'other' && (
        <Card style={{ gap: 12 }}>
          <P>Any device or app that supports “DNS over HTTPS” or “Secure DNS” can use:</P>
          <CopyField label="DNS-over-HTTPS" value={setup.dohUrl} />
          <CopyField label="DNS-over-TLS" value={setup.dotHostname} />
          <Button
            title="Share these settings"
            variant="secondary"
            icon="share-outline"
            onPress={() => Clipboard.setStringAsync(`${setup.dohUrl}\n${setup.dotHostname}`)}
          />
        </Card>
      )}

      <Button title="Done" onPress={() => router.replace('/(tabs)')} />
    </Screen>
  );
}
