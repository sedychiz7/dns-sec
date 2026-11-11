import { View } from 'react-native';
import { router } from 'expo-router';
import { CATEGORIES, type Policy, hasFeature, minimumPlanFor, type PlanId } from '@kinshield/shared';
import type { PolicyPatch } from '../api';
import { Card, Divider, H2, LinkRow, ToggleRow, type IconName } from './ui';

/**
 * The whole "router admin panel", reduced to switches. Shared by the household
 * Filters tab and each child's profile.
 */
export function PolicyEditor({
  policy,
  plan,
  onChange,
  listsHref,
}: {
  policy: Policy;
  plan: PlanId;
  onChange: (patch: PolicyPatch) => void;
  /** Where "Allow & block specific sites" goes. */
  listsHref: string;
}) {
  const protect = CATEGORIES.filter((c) => ['adult', 'security', 'gambling'].includes(c.id));
  const privacy = CATEGORIES.filter((c) => ['ads', 'trackers'].includes(c.id));
  const limits = CATEGORIES.filter((c) => ['social', 'gaming', 'dating'].includes(c.id));

  const row = (c: (typeof CATEGORIES)[number]) => {
    const locked = !hasFeature(plan, c.feature);
    return (
      <ToggleRow
        key={c.id}
        icon={c.icon as IconName}
        title={c.name}
        subtitle={c.description}
        value={!locked && policy.categories[c.id]}
        locked={locked}
        lockedPlan={minimumPlanFor(c.feature)}
        feature={c.feature}
        onChange={(v) => onChange({ categories: { [c.id]: v } })}
      />
    );
  };

  return (
    <View style={{ gap: 16 }}>
      <Card>
        <H2>Keep kids safe</H2>
        {protect.map(row)}
        <ToggleRow
          icon="search"
          title="SafeSearch"
          subtitle="Hide explicit results on Google, Bing & DuckDuckGo"
          value={policy.safeSearch}
          onChange={(v) => onChange({ safeSearch: v })}
        />
        <ToggleRow
          icon="logo-youtube"
          title="YouTube Restricted Mode"
          subtitle="Hide mature videos and comments"
          value={hasFeature(plan, 'youtubeRestricted') && policy.youtubeRestricted}
          locked={!hasFeature(plan, 'youtubeRestricted')}
          lockedPlan="plus"
          feature="youtubeRestricted"
          onChange={(v) => onChange({ youtubeRestricted: v })}
        />
      </Card>

      <Card>
        <H2>Ads & privacy</H2>
        {privacy.map(row)}
      </Card>

      <Card>
        <H2>Screen-time limits</H2>
        {limits.map(row)}
      </Card>

      <Card>
        <LinkRow
          icon="list"
          title="Allow & block specific sites"
          subtitle={
            hasFeature(plan, 'customLists')
              ? `${policy.allowlist.length} allowed · ${policy.blocklist.length} blocked`
              : 'Plus feature'
          }
          onPress={() => router.push(listsHref as never)}
        />
        <Divider />
        <LinkRow icon="information-circle" title="How filtering works" onPress={() => router.push('/help')} />
      </Card>
    </View>
  );
}
