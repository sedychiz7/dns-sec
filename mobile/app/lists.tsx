import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { PLANS, normalizeDomain } from '@kinshield/shared';
import { api, type PolicyPatch } from '../src/api';
import { Button, Card, H2, P, Screen, handleError, openPaywall } from '../src/components/ui';
import { useSession } from '../src/session';
import { useColors } from '../src/theme';

export default function Lists() {
  const { profileId } = useLocalSearchParams<{ profileId?: string }>();
  const { network, plan, can, putNetwork } = useSession();
  const [input, setInput] = useState('');
  const c = useColors();
  if (!network) return null;
  const profile = profileId ? network.profiles.find((p) => p.id === profileId) : undefined;
  const policy = profile?.policy ?? network.policy;

  if (!can('customLists')) {
    return (
      <Screen edges={['bottom']}>
        <Card style={{ gap: 12 }}>
          <H2>Block or allow any website</H2>
          <P muted>Block a specific game or site, or allow a school site that got caught by a filter.</P>
          <Button title="Unlock with Plus" variant="plus" onPress={() => openPaywall('customLists', 'plus')} />
        </Card>
      </Screen>
    );
  }

  const save = async (patch: PolicyPatch) => {
    try {
      if (profile) {
        const updated = await api.updateProfile(profile.id, { policy: patch });
        putNetwork({ ...network, profiles: network.profiles.map((p) => (p.id === updated.id ? updated : p)) });
      } else {
        putNetwork(await api.updateNetwork(network.id, { policy: patch }));
      }
    } catch (err) {
      handleError(err);
    }
  };

  const add = (list: 'allowlist' | 'blocklist') => {
    const d = normalizeDomain(input);
    if (!d) return handleError(new Error('Type a website like example.com'));
    setInput('');
    const other = list === 'allowlist' ? 'blocklist' : 'allowlist';
    save({ [list]: [...new Set([...policy[list], d])], [other]: policy[other].filter((x) => x !== d) });
  };

  const remove = (list: 'allowlist' | 'blocklist', d: string) => save({ [list]: policy[list].filter((x) => x !== d) });

  const section = (list: 'allowlist' | 'blocklist', title: string, icon: 'checkmark-circle' | 'close-circle', color: string) => (
    <Card>
      <H2>{title}</H2>
      {policy[list].length === 0 && <P muted>None yet.</P>}
      {policy[list].map((d) => (
        <View key={d} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 }}>
          <Ionicons name={icon} size={20} color={color} />
          <Text style={{ flex: 1, color: c.text }}>{d}</Text>
          <Pressable onPress={() => remove(list, d)} hitSlop={10} accessibilityLabel={`Remove ${d}`}>
            <Ionicons name="trash-outline" size={20} color={c.muted} />
          </Pressable>
        </View>
      ))}
    </Card>
  );

  return (
    <Screen edges={['bottom']}>
      <P muted>
        {profile ? `Only for ${profile.name}.` : 'For everyone on this network.'} Subdomains are included automatically.
      </P>
      <TextInput
        placeholder="e.g. roblox.com"
        placeholderTextColor={c.muted}
        value={input}
        onChangeText={setInput}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        style={{ backgroundColor: c.card, borderRadius: 12, padding: 14, fontSize: 16, color: c.text, borderWidth: 1, borderColor: c.border }}
      />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Button title="Block" icon="close-circle" onPress={() => add('blocklist')} />
        </View>
        <View style={{ flex: 1 }}>
          <Button title="Allow" icon="checkmark-circle" variant="secondary" onPress={() => add('allowlist')} />
        </View>
      </View>
      {section('blocklist', 'Always blocked', 'close-circle', c.bad)}
      {section('allowlist', 'Always allowed', 'checkmark-circle', c.good)}
      <P muted>
        {policy.allowlist.length + policy.blocklist.length} of {PLANS[plan].limits.customListEntries} sites used.
      </P>
    </Screen>
  );
}
