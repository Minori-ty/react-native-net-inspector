import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import {
  installNetworkInspector,
  NetworkInspector,
} from '@minority/react-native-network-inspector';

// Before any request is issued — module scope of the root file is early enough.
// Default config reveals every header (this is a dev-only debugging surface).
installNetworkInspector();

const BASE = 'https://jsonplaceholder.typicode.com';

interface Demo {
  label: string;
  run: () => Promise<unknown>;
}

const DEMOS: Demo[] = [
  { label: 'GET /todos/1', run: () => fetch(`${BASE}/todos/1`) },
  {
    label: 'POST /posts',
    run: () =>
      fetch(`${BASE}/posts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'hello', body: 'from the example app', userId: 1 }),
      }),
  },
  { label: 'GET /todos (100 items)', run: () => fetch(`${BASE}/todos`) },
  { label: '404', run: () => fetch(`${BASE}/definitely-not-here`) },
  { label: 'timeout', run: () => xhrGet(`${BASE}/todos/1`, 1) },
  {
    label: 'abort',
    run: () => {
      const controller = new AbortController();
      const pending = fetch(`${BASE}/todos/1`, { signal: controller.signal });
      setTimeout(() => controller.abort(), 50);
      return pending;
    },
  },
];

function xhrGet(url: string, timeoutMs?: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', url);
    if (timeoutMs !== undefined) xhr.timeout = timeoutMs;
    xhr.onload = () => resolve(xhr.responseText);
    xhr.onerror = () => reject(new Error('network error'));
    xhr.ontimeout = () => reject(new Error('timeout'));
    xhr.send();
  });
}

export default function App() {
  const scheme = useColorScheme();
  const dark = scheme === 'dark';
  const colors = dark
    ? { background: '#0E1116', card: '#1A1E25', border: '#2C323C', text: '#EDF1F6', muted: '#9AA4B2', accent: '#4DA3F5' }
    : { background: '#F2F2F7', card: '#FFFFFF', border: '#E3E3E8', text: '#1C1C1E', muted: '#7C7C80', accent: '#0A84FF' };

  const [last, setLast] = useState<string | null>(null);

  const run = async (demo: Demo) => {
    setLast(`${demo.label} → …`);
    try {
      const result = await demo.run();
      setLast(`${demo.label} → ${summarize(result)}`);
    } catch (error) {
      setLast(`${demo.label} → ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  return (
    // Required: the floating ball's drag gesture needs a gesture root.
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ScrollView
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={styles.content}>
        <Text style={[styles.title, { color: colors.text }]}>Network inspector</Text>
        <Text style={[styles.subtitle, { color: colors.muted }]}>
          Fire a request, then tap the floating ball in the bottom-right corner.
        </Text>

        <View style={styles.grid}>
          {DEMOS.map((demo) => (
            <Pressable
              key={demo.label}
              onPress={() => run(demo)}
              style={({ pressed }) => [
                styles.button,
                { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.6 : 1 },
              ]}>
              <Text style={{ color: colors.text, fontSize: 13 }}>{demo.label}</Text>
            </Pressable>
          ))}
        </View>

        {last ? (
          <Text style={[styles.result, { color: colors.muted }]} numberOfLines={3}>
            {last}
          </Text>
        ) : null}
      </ScrollView>

      {/* The panel has a built-in EN/中文 switch in its header — no wiring needed here. */}
      <NetworkInspector />
    </GestureHandlerRootView>
  );
}

function summarize(result: unknown): string {
  if (Array.isArray(result)) return `${result.length} items`;
  if (result && typeof result === 'object') return 'object';
  if (typeof result === 'string') return `${result.length} chars`;
  return 'ok';
}

const styles = StyleSheet.create({
  content: {
    padding: 20,
    paddingTop: 72,
    gap: 14,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  button: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  result: {
    fontSize: 12,
    lineHeight: 17,
  },
});
