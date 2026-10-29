/**
 * Generated React Native app built entirely on bobuttons components.
 *
 * The root wraps the tree in `BobuttonsProvider` (with no `config` prop -
 * the provider wires its bundled Tamagui config internally) and never adds
 * a second, separate Tamagui provider. See the template README for why: a
 * second provider/config is exactly how the "can't find Tamagui
 * configuration" crash happens even with a single Tamagui copy installed.
 *
 * @format
 */

import * as React from 'react';
import { useState } from 'react';
import { StatusBar, StyleSheet, View } from 'react-native';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import {
  AppHeader,
  AppShell,
  BobuttonsProvider,
  Button,
  Icon,
  SquareGrid,
  TabBar,
  TessellatedBackground,
  ViewBody,
} from 'bobuttons';
import { name as appName } from './app.json';
import {
  Activity,
  Heart,
  Home,
  Moon,
  Settings,
  Star,
  Sun,
} from './components/icons';

type TabId = 'home' | 'activity' | 'settings';

function App() {
  return (
    <SafeAreaProvider>
      <BobuttonsProvider>
        <StatusBar barStyle="dark-content" />
        <AppContent />
      </BobuttonsProvider>
    </SafeAreaProvider>
  );
}

function AppContent() {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<TabId>('home');

  return (
    <View style={styles.container}>
      <TessellatedBackground
        icons={[
          { source: Heart, size: 28 },
          { source: Activity, size: 20 },
          { source: Star, size: 16 },
          { source: Sun, size: 24 },
          { source: Moon, size: 18 },
        ]}
      >
        <AppShell
          insets={insets}
          header={<AppHeader title={appName} />}
          sidebar={
            <TabBar
              tabs={[
                { id: 'home', label: 'Home', icon: Home },
                { id: 'activity', label: 'Activity', icon: Activity },
                { id: 'settings', label: 'Settings', icon: Settings },
              ]}
              current={tab}
              onChange={setTab}
            />
          }
        >
          <ViewBody>
            <SquareGrid
              columns={3}
              rows={1}
              cells={[
                { icon: Home, label: 'Home' },
                { icon: Activity, label: 'Activity' },
                { icon: Settings, label: 'Settings' },
              ]}
            />
            <Icon source={Settings} size={20} label="Settings" />
            <Button label="Hello from bobuttons" onPress={() => {}} />
          </ViewBody>
        </AppShell>
      </TessellatedBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

export default App;
