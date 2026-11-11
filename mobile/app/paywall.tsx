import { useEffect, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { type Feature, type PlanId, PLANS } from '@kinshield/shared';
import { billing, demoBilling, type Period, type PlanOffer } from '../src/billing';
import { Button, H1, P, Screen, handleError, notify } from '../src/components/ui';
import { useSession } from '../src/session';
import { useColors } from '../src/theme';

/** Headline that matches whatever the parent just tried to do. */
const FEATURE_PITCH: Partial<Record<Feature | 'multiNetwork', string>> = {
  adBlocking: 'Block ads on every device in your home',
  cnameUncloaking: 'Stop hidden trackers',
  youtubeRestricted: 'Make YouTube safer',
  gamblingFilter: 'Block gambling sites',
  customLists: 'Block or allow any website',
  activityLog: 'See what’s happening on your Wi-Fi',
  profiles: 'Different rules for each child',
  schedules: 'Bedtimes & homework time',
  pauseInternet: 'Pause the internet with one tap',
  extraCategories: 'Limit social media & games',
  multiNetwork: 'Protect grandma’s house too',
};

const legal = (Constants.expoConfig?.extra?.legal ?? {}) as { terms?: string; privacy?: string };

export default function Paywall() {
  const params = useLocalSearchParams<{ feature?: string; plan?: PlanId }>();
  const { plan: current, refresh } = useSession();
  const [offers, setOffers] = useState<PlanOffer[]>([]);
  const [period, setPeriod] = useState<Period>('yearly');
  const [selected, setSelected] = useState<'plus' | 'pro'>(params.plan === 'plus' ? 'plus' : 'pro');
  const [busy, setBusy] = useState(false);
  const c = useColors();

  useEffect(() => {
    billing.offers().then(setOffers).catch(handleError);
  }, []);

  const offer = offers.find((o) => o.plan === selected && o.period === period);
  const headline = FEATURE_PITCH[params.feature as Feature] ?? 'A safer, ad-free home internet';

  const buy = async () => {
    if (!offer) return;
    setBusy(true);
    try {
      const plan = await billing.purchase(offer);
      if (plan) {
        await refresh();
        router.back();
        notify(`Welcome to ${PLANS[plan].name}!`, 'Your new protections are switching on now.');
      }
    } catch (err) {
      handleError(err);
    } finally {
      setBusy(false);
    }
  };

  const yearlySaving = (() => {
    const m = offers.find((o) => o.plan === selected && o.period === 'monthly');
    const y = offers.find((o) => o.plan === selected && o.period === 'yearly');
    const num = (s?: string) => Number((s ?? '').replace(/[^0-9.]/g, ''));
    if (!m || !y || !num(m.price)) return null;
    return Math.round((1 - num(y.price) / (num(m.price) * 12)) * 100);
  })();

  return (
    <Screen edges={['top', 'bottom']}>
      <Pressable onPress={() => router.back()} style={{ alignSelf: 'flex-end' }} accessibilityLabel="Close">
        <Ionicons name="close" size={28} color={c.muted} />
      </Pressable>
      <H1>{headline}</H1>
      <P muted>Cancel anytime. You won’t be charged during the free trial.</P>

      <View style={{ flexDirection: 'row', backgroundColor: c.card, borderRadius: 999, padding: 4 }}>
        {(['monthly', 'yearly'] as const).map((p) => (
          <Pressable
            key={p}
            onPress={() => setPeriod(p)}
            style={{ flex: 1, paddingVertical: 10, borderRadius: 999, alignItems: 'center', backgroundColor: period === p ? c.primary : 'transparent' }}
          >
            <Text style={{ color: period === p ? '#fff' : c.text, fontWeight: '700' }}>
              {p === 'monthly' ? 'Monthly' : `Yearly${yearlySaving ? ` · save ${yearlySaving}%` : ''}`}
            </Text>
          </Pressable>
        ))}
      </View>

      {(['plus', 'pro'] as const).map((id) => {
        const p = PLANS[id];
        const o = offers.find((x) => x.plan === id && x.period === period);
        const active = selected === id;
        const color = id === 'pro' ? c.pro : c.plus;
        return (
          <Pressable key={id} onPress={() => setSelected(id)}>
            <View style={{ backgroundColor: c.card, borderRadius: 18, padding: 16, borderWidth: 2.5, borderColor: active ? color : c.border, gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name={active ? 'radio-button-on' : 'radio-button-off'} size={22} color={color} />
                  <Text style={{ fontSize: 20, fontWeight: '800', color: c.text }}>{p.name}</Text>
                  {id === 'pro' && (
                    <Text style={{ fontSize: 11, fontWeight: '800', color: '#fff', backgroundColor: color, paddingHorizontal: 6, borderRadius: 6 }}>
                      BEST FOR FAMILIES
                    </Text>
                  )}
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 18, fontWeight: '800', color: c.text }}>
                    {o?.price ?? '…'}
                    <Text style={{ fontSize: 13, color: c.muted }}>{period === 'monthly' ? '/mo' : '/yr'}</Text>
                  </Text>
                  {o?.perMonth && <Text style={{ fontSize: 12, color: c.muted }}>{o.perMonth}</Text>}
                </View>
              </View>
              <Text style={{ color: c.muted }}>{p.tagline}</Text>
              {p.highlights.map((h) => (
                <View key={h} style={{ flexDirection: 'row', gap: 8 }}>
                  <Ionicons name="checkmark" size={18} color={color} />
                  <Text style={{ color: c.text, flex: 1 }}>{h}</Text>
                </View>
              ))}
            </View>
          </Pressable>
        );
      })}

      <Button
        title={
          current === selected
            ? `You're on ${PLANS[selected].name}`
            : offer?.trialDays
              ? `Start ${offer.trialDays}-day free trial`
              : `Get ${PLANS[selected].name}`
        }
        variant={selected}
        onPress={buy}
        loading={busy}
        disabled={!offer || current === selected}
      />
      <Button title="Restore purchases" variant="secondary" onPress={() => billing.restore().then(refresh).catch(handleError)} />

      <Text style={{ color: c.muted, fontSize: 11, lineHeight: 16, textAlign: 'center' }}>
        {demoBilling
          ? 'Demo billing: no real charge. Add RevenueCat keys in app.json to sell for real.\n'
          : ''}
        After the free trial, your subscription renews automatically at the price shown unless cancelled at least 24 hours before the
        end of the period. Manage or cancel anytime in your App Store / Google Play account settings.
      </Text>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 20 }}>
        {legal.terms && <Text style={{ color: c.primary, fontSize: 12 }} onPress={() => Linking.openURL(legal.terms!)}>Terms</Text>}
        {legal.privacy && <Text style={{ color: c.primary, fontSize: 12 }} onPress={() => Linking.openURL(legal.privacy!)}>Privacy</Text>}
      </View>
    </Screen>
  );
}
