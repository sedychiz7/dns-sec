import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from '../session';
import { useColors } from '../theme';
import { Button, Card, P } from './ui';
import { openPaywall } from './ui';

/**
 * Tells the parent where they're managing from.
 * - Away without Pro: settings are view-only, with an upgrade button.
 * - Away with Pro: a small "managing remotely" note so they know changes apply at home.
 */
export function AccessBanner() {
  const { status, viewOnly, network } = useSession();
  const c = useColors();
  if (!status || status.atHome !== false || !network) return null;

  if (!viewOnly) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Ionicons name="globe-outline" size={16} color={c.good} />
        <P muted>Managing {network.name} remotely - changes apply right away.</P>
      </View>
    );
  }

  return (
    <Card style={{ backgroundColor: c.warnBg, gap: 10 }}>
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
        <Ionicons name="lock-closed" size={20} color={c.warn} />
        <View style={{ flex: 1 }}>
          <P>You’re away from {network.name}. You can look, but changes need you on your home Wi-Fi.</P>
        </View>
      </View>
      <Button title="Manage from anywhere with Pro" variant="pro" icon="globe-outline" onPress={() => openPaywall('remoteManagement', 'pro')} />
    </Card>
  );
}
