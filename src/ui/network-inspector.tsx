import * as Clipboard from 'expo-clipboard';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View, useColorScheme } from 'react-native';

import { countUnseen } from '../core/unseen';
import { resolveStrings, type InspectorLocale, type InspectorStrings } from '../i18n';
import { resolveTheme, type InspectorTheme } from '../theme';
import type { CopyHandler } from '../types';
import { useNetworkEntries } from '../react/hooks';
import { FloatBall } from './float-ball';
import { NetworkDrawer } from './network-drawer';
import { StringsProvider } from './strings-context';

export interface NetworkInspectorProps {
  /** Overrides the palette instead of following the system color scheme. */
  theme?: InspectorTheme;
  /**
   * Where copy actions send their text. Defaults to `expo-clipboard`.
   * Return a promise if the write is async — the confirmation toast waits for it
   * and reports a failure rather than claiming success.
   */
  onCopy?: CopyHandler;
  /** Built-in language for every label in the panel. Defaults to English. */
  locale?: InspectorLocale;
  /**
   * Fired when the user switches languages from inside the panel. Wire this to
   * your own persistence so the choice survives a restart — the panel never
   * touches storage itself. The `locale` prop stays the source of truth, so
   * passing the new value back re-syncs the panel.
   */
  onLocaleChange?: (locale: InspectorLocale) => void;
  /** Overrides individual strings, on top of the chosen locale. */
  messages?: Partial<InspectorStrings>;
  /** Render with the drawer already open. Handy while iterating on the UI. */
  defaultOpen?: boolean;
  /** Hide the floating ball while keeping capture running. */
  hideBall?: boolean;
}

/**
 * Drop this once near the app root — next to the navigator, inside whatever
 * full-screen container the root layout already provides.
 *
 * Capture itself is started by `installNetworkInspector()`; this component only
 * renders the ball and the drawer.
 *
 * The ball badge counts requests captured since the panel was last looked at,
 * and clears as soon as it is closed. Open the panel, and the next request starts
 * the count again from one.
 */
export function NetworkInspector({
  theme,
  onCopy,
  locale,
  onLocaleChange,
  messages,
  defaultOpen = false,
  hideBall = false,
}: NetworkInspectorProps) {
  const scheme = useColorScheme();
  const resolved = theme ?? resolveTheme(scheme);

  // `locale` is the source of truth from the host; the panel keeps its own copy
  // so the in-panel switcher can change it without waiting for a prop round-trip.
  const [activeLocale, setActiveLocale] = useState<InspectorLocale>(locale ?? 'en');
  useEffect(() => setActiveLocale(locale ?? 'en'), [locale]);

  const strings = useMemo(() => resolveStrings(activeLocale, messages), [activeLocale, messages]);

  const handleLocaleChange = useCallback(
    (next: InspectorLocale) => {
      setActiveLocale(next);
      onLocaleChange?.(next);
    },
    [onLocaleChange],
  );

  const [open, setOpen] = useState(defaultOpen);
  // Web exports render on the server where the store is always empty; waiting for
  // mount avoids a hydration mismatch.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const entries = useNetworkEntries();

  /**
   * Id of the newest entry at the moment the panel was last dismissed. Everything
   * newer than it is "new" — it drives both the ball badge and the NEW marker on
   * each list row.
   *
   * The watermark advances on *close*, not on open. Advancing on open would clear
   * the NEW markers at the exact moment the user opened the panel to look for
   * them; this way the markers stay put for the whole session and reset only once
   * the panel is dismissed.
   */
  const [seenId, setSeenId] = useState<string | null>(null);

  const handleClose = useCallback(() => {
    setOpen(false);
    const newestId = entries[0]?.id ?? null;
    if (newestId !== null) setSeenId(newestId);
  }, [entries]);

  const unseenCount = useMemo(() => countUnseen(entries, seenId), [entries, seenId]);

  const handleCopy = useCallback<CopyHandler>(
    (text, label) => {
      if (onCopy) return onCopy(text, label);
      // `expo-clipboard` rather than React Native's core `Clipboard`, which is
      // deprecated and logs a warning on every access.
      return Clipboard.setStringAsync(text).then(() => undefined);
    },
    [onCopy],
  );

  if (!mounted) return null;

  return (
    <StringsProvider strings={strings}>
      <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
        {hideBall ? null : (
          <FloatBall theme={resolved} badge={unseenCount} onPress={() => setOpen(true)} />
        )}
        <NetworkDrawer
          visible={open}
          onClose={handleClose}
          theme={resolved}
          onCopy={handleCopy}
          seenId={seenId}
          locale={activeLocale}
          onLocaleChange={handleLocaleChange}
        />
      </View>
    </StringsProvider>
  );
}
