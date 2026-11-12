/**
 * In-app subscriptions via RevenueCat (wraps App Store + Google Play billing).
 *
 * If no RevenueCat API key is configured (app.json -> extra.revenueCat) the app
 * runs in "demo billing" mode: purchases just call the dev-only /billing/sync
 * endpoint so you can try every plan before setting up the stores.
 */
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import Purchases, { type PurchasesPackage } from 'react-native-purchases';
import { type PlanId, PLANS } from '@kinshield/shared';
import { api } from './api';

export type Period = 'monthly' | 'yearly';

export interface PlanOffer {
  plan: Exclude<PlanId, 'free'>;
  period: Period;
  price: string;
  /** e.g. "$2.50/mo" for yearly plans, to make the saving obvious. */
  perMonth: string | null;
  trialDays: number;
  pkg: PurchasesPackage | null;
}

const keys = (Constants.expoConfig?.extra?.revenueCat ?? {}) as { iosApiKey?: string; androidApiKey?: string };
const apiKey = Platform.OS === 'ios' ? keys.iosApiKey : Platform.OS === 'android' ? keys.androidApiKey : undefined;

/**
 * App Store / Play rules: subscriptions are bought in the mobile app. The web
 * dashboard therefore can't sell plans - except in demo builds
 * (EXPO_PUBLIC_DEMO_BILLING=1) used for previews and testing.
 */
export const webCanPurchase = process.env.EXPO_PUBLIC_DEMO_BILLING === '1';
export const purchasesAvailable = Platform.OS !== 'web' || webCanPurchase;
export const demoBilling = !apiKey;

let configured = false;

function planFromEntitlements(active: Record<string, unknown>): PlanId {
  if (active.pro) return 'pro';
  if (active.plus) return 'plus';
  return 'free';
}

function fallbackOffers(): PlanOffer[] {
  const out: PlanOffer[] = [];
  for (const plan of ['plus', 'pro'] as const) {
    const p = PLANS[plan];
    const yearly = Number(p.displayPrice!.yearly.replace(/[^0-9.]/g, ''));
    out.push({ plan, period: 'monthly', price: p.displayPrice!.monthly, perMonth: null, trialDays: p.trialDays, pkg: null });
    out.push({
      plan,
      period: 'yearly',
      price: p.displayPrice!.yearly,
      perMonth: `$${(yearly / 12).toFixed(2)}/mo`,
      trialDays: p.trialDays,
      pkg: null,
    });
  }
  return out;
}

export const billing = {
  async identify(userId: string) {
    if (demoBilling) return;
    if (!configured) {
      Purchases.configure({ apiKey: apiKey!, appUserID: userId });
      configured = true;
    } else {
      await Purchases.logIn(userId);
    }
  },

  async logout() {
    if (!demoBilling && configured) await Purchases.logOut();
  },

  /** Store prices (localised) for each plan and period. */
  async offers(): Promise<PlanOffer[]> {
    if (demoBilling || !configured) return fallbackOffers();
    const offerings = await Purchases.getOfferings();
    const pkgs = offerings.current?.availablePackages ?? [];
    const out: PlanOffer[] = [];
    for (const pkg of pkgs) {
      const id = pkg.product.identifier;
      const plan = id.includes('pro') ? 'pro' : id.includes('plus') ? 'plus' : null;
      if (!plan) continue;
      const period: Period = pkg.packageType === 'ANNUAL' ? 'yearly' : 'monthly';
      out.push({
        plan,
        period,
        price: pkg.product.priceString,
        perMonth: period === 'yearly' ? (pkg.product.pricePerMonthString ?? null) : null,
        trialDays: PLANS[plan].trialDays,
        pkg,
      });
    }
    return out.length ? out : fallbackOffers();
  },

  /** Returns the plan the user has after the purchase. Throws on failure; returns null if cancelled. */
  async purchase(offer: PlanOffer): Promise<PlanId | null> {
    if (demoBilling || !offer.pkg) {
      const { user } = await api.syncPlan(offer.plan);
      return user.plan;
    }
    try {
      const { customerInfo } = await Purchases.purchasePackage(offer.pkg);
      const plan = planFromEntitlements(customerInfo.entitlements.active);
      await api.syncPlan(plan).catch(() => undefined); // webhook is the source of truth; this is just faster
      return plan;
    } catch (err) {
      if ((err as { userCancelled?: boolean }).userCancelled) return null;
      throw err;
    }
  },

  async restore(): Promise<PlanId> {
    if (demoBilling) return (await api.me()).user.plan;
    const info = await Purchases.restorePurchases();
    const plan = planFromEntitlements(info.entitlements.active);
    await api.syncPlan(plan).catch(() => undefined);
    return plan;
  },

  async manage() {
    if (demoBilling) {
      await api.syncPlan('free');
      return;
    }
    await Purchases.showManageSubscriptions();
  },
};
