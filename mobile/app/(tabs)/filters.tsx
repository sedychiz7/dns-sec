import { useState } from 'react';
import { Redirect } from 'expo-router';
import { api, type PolicyPatch } from '../../src/api';
import { H1, P, Screen, handleError } from '../../src/components/ui';
import { PolicyEditor } from '../../src/components/PolicyEditor';
import { useSession } from '../../src/session';

export default function Filters() {
  const { network, plan, putNetwork } = useSession();
  const [, setSaving] = useState(false);
  if (!network) return <Redirect href="/setup" />;

  const change = async (patch: PolicyPatch) => {
    // Optimistic update so switches feel instant.
    const prev = network;
    putNetwork({
      ...network,
      policy: { ...network.policy, ...patch, categories: { ...network.policy.categories, ...patch.categories } } as typeof network.policy,
    });
    setSaving(true);
    try {
      putNetwork(await api.updateNetwork(network.id, { policy: patch }));
    } catch (err) {
      putNetwork(prev);
      handleError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <H1>Filters</H1>
      <P muted>
        These rules apply to every device on {network.name} Wi-Fi.
        {network.profiles.length > 0 ? ' Kids with their own profile follow their profile’s rules.' : ''}
      </P>
      <PolicyEditor policy={network.policy} plan={plan} onChange={change} listsHref="/lists" />
    </Screen>
  );
}
