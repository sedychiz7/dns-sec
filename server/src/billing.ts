/**
 * Subscription billing via RevenueCat.
 *
 * App Store / Play Store rules require in-app purchase for digital
 * subscriptions, and RevenueCat wraps both stores behind one SDK + webhook.
 *
 * Setup (RevenueCat dashboard):
 *   - Entitlements:  "plus", "pro"
 *   - Products:      kinshield_plus_monthly, kinshield_plus_yearly,
 *                    kinshield_pro_monthly,  kinshield_pro_yearly
 *                    (Pro products grant BOTH entitlements)
 *   - Offering "default" with those 4 packages; add a 7-day free trial to each.
 *   - Webhook URL:   <PUBLIC_URL>/v1/billing/revenuecat
 *     Authorization header value = REVENUECAT_WEBHOOK_SECRET
 *   - The app logs into RevenueCat with our user id as appUserID, so the
 *     webhook's app_user_id is our user id.
 */
import type { PlanId } from '@kinshield/shared';

export interface RevenueCatEvent {
  type: string;
  app_user_id: string;
  original_app_user_id?: string;
  aliases?: string[];
  entitlement_ids?: string[] | null;
  expiration_at_ms?: number | null;
}

const GRANTING = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'PRODUCT_CHANGE',
  'UNCANCELLATION',
  'NON_RENEWING_PURCHASE',
  'SUBSCRIPTION_EXTENDED',
  'TEMPORARY_ENTITLEMENT_GRANT',
]);

/**
 * Turns a webhook event into a plan change. CANCELLATION is ignored on
 * purpose: the user keeps access until EXPIRATION.
 */
export function planFromEvent(e: RevenueCatEvent): { plan: PlanId; expiresAt: string | null } | null {
  if (e.type === 'EXPIRATION') return { plan: 'free', expiresAt: null };
  if (!GRANTING.has(e.type)) return null;
  const ents = e.entitlement_ids ?? [];
  const plan: PlanId = ents.includes('pro') ? 'pro' : ents.includes('plus') ? 'plus' : 'free';
  const expiresAt = e.expiration_at_ms ? new Date(e.expiration_at_ms).toISOString() : null;
  return { plan, expiresAt };
}
