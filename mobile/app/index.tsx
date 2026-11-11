import { ActivityIndicator, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useSession } from '../src/session';

/** Routes to the right place on launch: welcome → setup → dashboard. */
export default function Index() {
  const { ready, user, networks } = useSession();
  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }
  if (!user) return <Redirect href="/welcome" />;
  if (networks.length === 0) return <Redirect href="/setup" />;
  return <Redirect href="/(tabs)" />;
}
