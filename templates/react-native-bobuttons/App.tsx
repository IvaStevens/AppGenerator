/**
 * Generated React Native app built entirely on bobuttons components.
 *
 * The root wraps the tree in `BobuttonsProvider` (with no `config` prop -
 * the provider wires its bundled Tamagui config internally) and never adds
 * a second, separate Tamagui provider. See the template README for why: a
 * second provider/config is exactly how the "can't find Tamagui
 * configuration" crash happens even with a single Tamagui copy installed.
 *
 * No icons are used: bobuttons ships none, so this screen sticks to the
 * components that need no icon source.
 *
 * @format
 */

import * as React from 'react';
import { useState } from 'react';
import { StatusBar } from 'react-native';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import {
  AppHeader,
  AppShell,
  Badge,
  BobuttonsProvider,
  Button,
  Checkbox,
  Radio,
  RadioGroup,
  SquareGrid,
  Tabs,
  TextInput,
  ViewBody,
  ViewPane,
  ViewToolbar,
} from 'bobuttons';
import { name as appName } from './app.json';

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
  const [text, setText] = useState('');
  const [checked, setChecked] = useState(true);
  const [choice, setChoice] = useState<'a' | 'b'>('a');
  const [taps, setTaps] = useState(0);

  return (
    <AppShell
      insets={insets}
      header={<AppHeader title={appName} />}
      sidebar={
        <Tabs
          tabs={[
            { id: 'home', label: 'Home' },
            { id: 'activity', label: 'Activity' },
            { id: 'settings', label: 'Settings' },
          ]}
          current={tab}
          onChange={setTab}
        />
      }
    >
      <ViewPane>
        <ViewToolbar
          title={tab}
          actions={<Badge label={`${taps} taps`} tone="accent" />}
        />
        <ViewBody>
          <Button
            label="Hello from bobuttons"
            onPress={() => setTaps(taps + 1)}
          />
          <TextInput
            value={text}
            onChange={setText}
            placeholder="Type here"
          />
          <Checkbox label="Checkbox" checked={checked} onChange={setChecked} />
          <RadioGroup label="Radio group">
            <Radio
              label="Option A"
              checked={choice === 'a'}
              onSelect={() => setChoice('a')}
            />
            <Radio
              label="Option B"
              checked={choice === 'b'}
              onSelect={() => setChoice('b')}
            />
          </RadioGroup>
          <SquareGrid
            columns={3}
            rows={1}
            cells={[
              { color: '$primary', text: 'A' },
              { color: '$secondary', text: 'B' },
              { color: '$accent', text: 'C' },
            ]}
          />
        </ViewBody>
      </ViewPane>
    </AppShell>
  );
}

export default App;
