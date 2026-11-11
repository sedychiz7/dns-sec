import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { type Feature, type PlanId, PLANS, minimumPlanFor } from '@kinshield/shared';
import { ApiError } from '../api';
import { radius, space, useColors } from '../theme';

export type IconName = keyof typeof Ionicons.glyphMap;

export function Screen({
  children,
  refreshing,
  onRefresh,
  edges = ['top'],
}: {
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  edges?: ('top' | 'bottom')[];
}) {
  const c = useColors();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={edges}>
      <ScrollView
        contentContainerStyle={{ padding: space, paddingBottom: space * 3, gap: space }}
        refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} /> : undefined}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  return (
    <View style={[{ backgroundColor: c.card, borderRadius: radius, padding: space, borderWidth: 1, borderColor: c.border }, style]}>
      {children}
    </View>
  );
}

export function H1({ children }: { children: ReactNode }) {
  const c = useColors();
  return <Text style={{ fontSize: 28, fontWeight: '800', color: c.text }}>{children}</Text>;
}

export function H2({ children }: { children: ReactNode }) {
  const c = useColors();
  return <Text style={{ fontSize: 18, fontWeight: '700', color: c.text }}>{children}</Text>;
}

export function P({ children, muted, center }: { children: ReactNode; muted?: boolean; center?: boolean }) {
  const c = useColors();
  return (
    <Text style={{ fontSize: 15, lineHeight: 21, color: muted ? c.muted : c.text, textAlign: center ? 'center' : 'left' }}>
      {children}
    </Text>
  );
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  icon,
  loading,
  disabled,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'plus' | 'pro';
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
}) {
  const c = useColors();
  const bg = { primary: c.primary, secondary: 'transparent', danger: 'transparent', plus: c.plus, pro: c.pro }[variant];
  const fg = variant === 'secondary' ? c.primary : variant === 'danger' ? c.bad : c.primaryText;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => ({
        backgroundColor: bg,
        borderRadius: 999,
        paddingVertical: 14,
        paddingHorizontal: 20,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: 8,
        borderWidth: variant === 'secondary' ? 1.5 : 0,
        borderColor: c.primary,
        opacity: pressed || disabled ? 0.6 : 1,
      })}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon && <Ionicons name={icon} size={18} color={fg} />}
          <Text style={{ color: fg, fontWeight: '700', fontSize: 16 }}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

export function PlanBadge({ plan }: { plan: PlanId }) {
  const c = useColors();
  if (plan === 'free') return null;
  const color = plan === 'pro' ? c.pro : c.plus;
  return (
    <View style={{ backgroundColor: color, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
      <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>{PLANS[plan].name.toUpperCase()}</Text>
    </View>
  );
}

export function openPaywall(feature?: Feature, plan?: PlanId) {
  router.push({ pathname: '/paywall', params: { feature: feature ?? '', plan: plan ?? (feature ? minimumPlanFor(feature) : 'pro') } });
}

/** Shows the paywall for "upgrade required" errors, an alert for anything else. */
export function handleError(err: unknown) {
  if (err instanceof ApiError && err.isUpgrade) {
    openPaywall(err.feature, err.requiredPlan);
    return;
  }
  notify('Oops', err instanceof Error ? err.message : 'Something went wrong.');
}

/** Alert that also works in the web preview (react-native-web's Alert is a no-op). */
export function notify(title: string, message: string) {
  if (Platform.OS === 'web') globalThis.alert?.(`${title}\n\n${message}`);
  else Alert.alert(title, message);
}

/**
 * A setting row. If the user's plan doesn't include `feature`, the switch is
 * replaced by a plan badge and tapping opens the paywall.
 */
export function ToggleRow({
  icon,
  title,
  subtitle,
  value,
  onChange,
  locked,
  lockedPlan,
  feature,
}: {
  icon?: IconName;
  title: string;
  subtitle?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  locked?: boolean;
  lockedPlan?: PlanId;
  feature?: Feature;
}) {
  const c = useColors();
  return (
    <Pressable
      onPress={() => (locked ? openPaywall(feature, lockedPlan) : onChange(!value))}
      style={styles.row}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled: locked }}
    >
      {icon && (
        <View style={[styles.iconWrap, { backgroundColor: c.bg }]}>
          <Ionicons name={icon} size={20} color={locked ? c.muted : c.primary} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 16, fontWeight: '600', color: locked ? c.muted : c.text }}>{title}</Text>
        {subtitle && <Text style={{ fontSize: 13, color: c.muted, marginTop: 2 }}>{subtitle}</Text>}
      </View>
      {locked ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name="lock-closed" size={14} color={c.muted} />
          <PlanBadge plan={lockedPlan ?? 'pro'} />
        </View>
      ) : (
        <Switch value={value} onValueChange={onChange} />
      )}
    </Pressable>
  );
}

export function LinkRow({ icon, title, subtitle, onPress, right }: { icon: IconName; title: string; subtitle?: string; onPress: () => void; right?: ReactNode }) {
  const c = useColors();
  return (
    <Pressable onPress={onPress} style={styles.row} accessibilityRole="button">
      <View style={[styles.iconWrap, { backgroundColor: c.bg }]}>
        <Ionicons name={icon} size={20} color={c.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 16, fontWeight: '600', color: c.text }}>{title}</Text>
        {subtitle && <Text style={{ fontSize: 13, color: c.muted, marginTop: 2 }}>{subtitle}</Text>}
      </View>
      {right ?? <Ionicons name="chevron-forward" size={18} color={c.muted} />}
    </Pressable>
  );
}

export function Divider() {
  const c = useColors();
  return <View style={{ height: 1, backgroundColor: c.border, marginVertical: 4 }} />;
}

/** A value the parent needs to type into a router or device, with a big copy button. */
export function CopyField({ label, value }: { label: string; value: string }) {
  const c = useColors();
  return (
    <Pressable
      onPress={async () => {
        await Clipboard.setStringAsync(value);
        notify('Copied', `${label} copied to clipboard.`);
      }}
      style={[styles.copy, { backgroundColor: c.bg, borderColor: c.border }]}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 12, color: c.muted, fontWeight: '600' }}>{label}</Text>
        <Text selectable style={{ fontSize: 17, color: c.text, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
          {value}
        </Text>
      </View>
      <Ionicons name="copy-outline" size={20} color={c.primary} />
    </Pressable>
  );
}

export function Stat({ label, value, color }: { label: string; value: string | number; color?: string }) {
  const c = useColors();
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={{ fontSize: 24, fontWeight: '800', color: color ?? c.text }}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </Text>
      <Text style={{ fontSize: 12, color: c.muted, textAlign: 'center' }}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  iconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  copy: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, padding: 12, gap: 12 },
});
