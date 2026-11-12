import { Linking, Platform, Text, View } from 'react-native';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import { PLANS } from '@kinshield/shared';
import { api } from '../../src/api';
import { billing, demoBilling } from '../../src/billing';
import { Button, Card, CopyField, Divider, H1, H2, LinkRow, P, PlanBadge, Screen, confirm, handleError, notify, openPaywall } from '../../src/components/ui';
import { useSession } from '../../src/session';
import { useColors } from '../../src/theme';

const legal = (Constants.expoConfig?.extra?.legal ?? {}) as { terms?: string; privacy?: string; support?: string };
const dashboardUrl = (Constants.expoConfig?.extra?.dashboardUrl as string | undefined) ?? '';

export default function Account() {
  const { user, plan, networks, network, selectNetwork, signOut, refresh, can } = useSession();
  const c = useColors();
  const p = PLANS[plan];

  const addLocation = () => {
    if (networks.length >= p.limits.networks) return openPaywall(undefined, 'pro');
    router.push({ pathname: '/setup', params: { new: '1' } });
  };

  return (
    <Screen>
      <H1>Account</H1>

      <Card style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <H2>{p.name} plan</H2>
          <PlanBadge plan={plan} />
        </View>
        <P muted>{p.tagline}</P>
        {user?.planExpiresAt && plan !== 'free' && (
          <P muted>Renews or ends {new Date(user.planExpiresAt).toLocaleDateString()}</P>
        )}
        {plan !== 'pro' && (
          <Button
            title={plan === 'free' ? 'See plans' : 'Upgrade to Pro'}
            variant={plan === 'free' ? 'plus' : 'pro'}
            onPress={() => openPaywall(undefined, plan === 'free' ? 'plus' : 'pro')}
          />
        )}
        {plan !== 'free' && (
          <Button
            title={demoBilling ? 'Cancel (demo)' : 'Manage subscription'}
            variant="secondary"
            onPress={() => billing.manage().then(refresh).catch(handleError)}
          />
        )}
        <Button
          title="Restore purchases"
          variant="secondary"
          onPress={() =>
            billing
              .restore()
              .then(async (restored) => {
                await refresh();
                notify('Purchases restored', `You're on ${PLANS[restored].name}.`);
              })
              .catch(handleError)
          }
        />
      </Card>

      {Platform.OS !== 'web' && dashboardUrl ? (
        <Card style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <H2>Manage from anywhere</H2>
            <PlanBadge plan="pro" />
          </View>
          {can('remoteManagement') ? (
            <>
              <P muted>Change settings from this app wherever you are, or sign in on any computer:</P>
              <CopyField label="Web dashboard" value={dashboardUrl} />
            </>
          ) : (
            <>
              <P muted>Right now settings can only be changed while you’re on your home Wi-Fi. Pro lets you manage from work, on a trip, or from any web browser.</P>
              <Button title="Unlock remote control" variant="pro" icon="globe-outline" onPress={() => openPaywall('remoteManagement', 'pro')} />
            </>
          )}
        </Card>
      ) : null}

      <Card>
        <H2>Locations</H2>
        {networks.map((n) => (
          <LinkRow
            key={n.id}
            icon={n.id === network?.id ? 'home' : 'home-outline'}
            title={n.name}
            subtitle={n.id === network?.id ? 'Currently managing' : 'Tap to switch'}
            onPress={() => selectNetwork(n.id)}
          />
        ))}
        <Divider />
        <LinkRow
          icon="add-circle"
          title="Protect another location"
          subtitle={can('profiles') ? `Up to ${p.limits.networks}` : 'Pro: grandparents, cabin, office…'}
          onPress={addLocation}
        />
        <LinkRow icon="wifi" title="Router setup instructions" onPress={() => router.push('/setup/router')} />
        <LinkRow icon="phone-portrait" title="Protect a single device" onPress={() => router.push('/setup/device')} />
      </Card>

      <Card>
        <LinkRow icon="help-circle" title="How KinShield works" onPress={() => router.push('/help')} />
        {legal.support && <LinkRow icon="chatbubbles" title="Contact support" onPress={() => Linking.openURL(legal.support!)} />}
        {legal.privacy && <LinkRow icon="document-text" title="Privacy policy" onPress={() => Linking.openURL(legal.privacy!)} />}
        {legal.terms && <LinkRow icon="document" title="Terms of use" onPress={() => Linking.openURL(legal.terms!)} />}
      </Card>

      <Text style={{ color: c.muted, textAlign: 'center' }}>{user?.email}</Text>
      <Button
        title="Sign out"
        variant="secondary"
        onPress={async () => {
          await signOut();
          router.replace('/welcome');
        }}
      />
      <Button
        title="Delete account"
        variant="danger"
        onPress={() =>
          confirm(
            'Delete your account?',
            'This removes your settings and history and stops protection. Cancel any subscription in your app store too.',
            'Delete',
            async () => {
              try {
                await api.deleteAccount();
                await signOut();
                router.replace('/welcome');
              } catch (err) {
                handleError(err);
              }
            },
          )
        }
      />
    </Screen>
  );
}
