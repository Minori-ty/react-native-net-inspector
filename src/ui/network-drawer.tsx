import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { networkStore } from '../core/store';
import { unseenIds } from '../core/unseen';
import type { InspectorLocale } from '../i18n';
import type { InspectorTheme } from '../theme';
import type { CopyHandler, NetworkEntry } from '../types';
import { useNetworkEntries, useNetworkEntry } from '../react/hooks';
import { EntryDetail } from './entry-detail';
import { EntryRow } from './entry-row';
import { applyFilters, collectMethods, emptyFilters, FilterBar, type Filters } from './filter-bar';
import { ActionButton, EmptyState } from './primitives';
import { useStrings } from './strings-context';
import { Toast } from './toast';

/** How long the copy confirmation stays on screen. */
const TOAST_MS = 1600;

export function NetworkDrawer({
  visible,
  onClose,
  theme,
  onCopy,
  seenId,
  locale,
  onLocaleChange,
}: {
  visible: boolean;
  onClose: () => void;
  theme: InspectorTheme;
  onCopy: CopyHandler;
  /** Everything newer than this id is marked NEW in the list. */
  seenId: string | null;
  /** Active built-in language; drives the in-panel switcher. */
  locale: InspectorLocale;
  /** Called when the in-panel switcher changes the language. */
  onLocaleChange: (locale: InspectorLocale) => void;
}) {
  const entries = useNetworkEntries();
  const strings = useStrings();
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  /**
   * Ids whose detail was opened during this panel session.
   *
   * Opening a row is an explicit "I have seen this", so its NEW marker has to
   * clear right then — the watermark cannot do it, because that only advances
   * when the whole panel closes. Kept local rather than lifted into the store:
   * it is a property of this visit to the list, not of the captured request.
   */
  const [openedIds, setOpenedIds] = useState<ReadonlySet<string>>(() => new Set());

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (toastTimer.current !== null) clearTimeout(toastTimer.current);
    },
    [],
  );

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current !== null) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  /**
   * Every copy action funnels through here so the confirmation is consistent —
   * a silent copy leaves you wondering whether it worked.
   *
   * The toast waits for the handler when it is async, so a failed clipboard write
   * is reported instead of being announced as a success.
   */
  const handleCopy = useCallback<CopyHandler>(
    (text, label) => {
      let result: void | Promise<void>;
      try {
        result = onCopy(text, label);
      } catch {
        showToast(strings.copyFailed(label));
        return;
      }
      Promise.resolve(result).then(
        () => showToast(strings.copied(label)),
        () => showToast(strings.copyFailed(label)),
      );
    },
    [onCopy, showToast, strings],
  );

  const selected = useNetworkEntry(selectedId);
  const methods = useMemo(() => collectMethods(entries), [entries]);

  /**
   * Rows that still deserve the NEW marker: newer than the watermark, minus the
   * ones already opened. Returns the derived set untouched while nothing has been
   * opened, so `EntryRow`'s memo can bail out on the common path.
   */
  const unseen = useMemo(() => {
    const fresh = unseenIds(entries, seenId);
    if (openedIds.size === 0) return fresh;
    const remaining = new Set<string>();
    for (const id of fresh) {
      if (!openedIds.has(id)) remaining.add(id);
    }
    return remaining;
  }, [entries, seenId, openedIds]);

  const shown = useMemo(() => applyFilters(entries, filters), [entries, filters]);
  const failed = useMemo(
    () => entries.filter((entry) => entry.state === 'error' || entry.state === 'timeout').length,
    [entries],
  );

  // The selected entry can be evicted by the ring buffer while the detail is open.
  useEffect(() => {
    if (selectedId !== null && selected === undefined) setSelectedId(null);
  }, [selectedId, selected]);

  /** Opening a row both navigates and marks it seen. */
  const handleOpenDetail = useCallback((id: string) => {
    setSelectedId(id);
    setOpenedIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: NetworkEntry }) => (
      <EntryRow
        entry={item}
        theme={theme}
        onPress={handleOpenDetail}
        isNew={unseen.has(item.id)}
      />
    ),
    [theme, unseen, handleOpenDetail],
  );

  /**
   * Closing the panel ends the visit, so the opened set is dropped with it — the
   * watermark moves to the newest entry at the same moment, which leaves every
   * marker clear anyway. Clearing here just stops the set from growing for the
   * life of the component.
   */
  const handleClose = useCallback(() => {
    setOpenedIds((prev) => (prev.size === 0 ? prev : new Set()));
    onClose();
  }, [onClose]);

  /**
   * Android's hardware back button routes through here. It has to unwind one
   * level at a time — closing the whole panel straight from a detail screen
   * would skip the list the user came from.
   */
  const handleRequestClose = useCallback(() => {
    if (selectedId !== null) {
      setSelectedId(null);
      return;
    }
    handleClose();
  }, [selectedId, handleClose]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      statusBarTranslucent
      onRequestClose={handleRequestClose}>
      <View style={[styles.root, { backgroundColor: theme.background }]}>
        <SafeAreaView edges={['top', 'bottom']} style={styles.root}>
          <View style={[styles.header, { borderBottomColor: theme.border }]}>
            {selected ? (
              <ActionButton
                label={strings.back}
                icon="chevron-back"
                theme={theme}
                onPress={() => setSelectedId(null)}
              />
            ) : (
              <Text style={[styles.title, { color: theme.text }]}>{strings.panelTitle}</Text>
            )}

            <LocaleSwitch value={locale} onChange={onLocaleChange} theme={theme} />
            <View style={styles.spacer} />

            <Text style={[styles.count, { color: theme.textMuted }]}>
              {shown.length}/{entries.length}
              {failed > 0 ? strings.failedSuffix(failed) : ''}
            </Text>
            {selected ? null : (
              <ActionButton label={strings.clear} theme={theme} onPress={() => networkStore.clear()} />
            )}
            <ActionButton label={strings.close} theme={theme} onPress={handleClose} />
          </View>

          {selected ? (
            <EntryDetail entry={selected} theme={theme} onCopy={handleCopy} />
          ) : (
            <>
              {entries.length > 0 ? (
                <FilterBar filters={filters} onChange={setFilters} theme={theme} methods={methods} />
              ) : null}

              <FlatList
                data={shown}
                keyExtractor={keyExtractor}
                renderItem={renderItem}
                keyboardShouldPersistTaps="handled"
                maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
                contentContainerStyle={shown.length === 0 ? styles.emptyContainer : styles.listContainer}
                ListEmptyComponent={
                  <EmptyState
                    theme={theme}
                    message={
                      entries.length === 0 ? strings.emptyNoRequests : strings.emptyNoMatches
                    }
                  />
                }
              />
            </>
          )}

          {toast ? <Toast message={toast} theme={theme} /> : null}
        </SafeAreaView>
      </View>
    </Modal>
  );
}

function keyExtractor(entry: NetworkEntry): string {
  return entry.id;
}

/**
 * In-panel language switcher. The two labels are the languages' own names
 * (English in English, Chinese in Chinese) — the conventional, self-explanatory
 * pattern for a locale control — so they are not part of the translatable
 * `InspectorStrings` table.
 */
const LOCALE_OPTIONS: ReadonlyArray<{ value: InspectorLocale; label: string }> = [
  { value: 'en', label: 'EN' },
  { value: 'zh-CN', label: '中文' },
];

function LocaleSwitch({
  value,
  onChange,
  theme,
}: {
  value: InspectorLocale;
  onChange: (locale: InspectorLocale) => void;
  theme: InspectorTheme;
}) {
  return (
    <View style={[styles.localeSwitch, { borderColor: theme.border }]}>
      {LOCALE_OPTIONS.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={[styles.localeOption, active && { backgroundColor: theme.accent }]}>
            <Text style={[styles.localeOptionText, { color: active ? theme.onAccent : theme.textMuted }]}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
  },
  localeSwitch: {
    flexDirection: 'row',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 7,
    overflow: 'hidden',
  },
  localeOption: {
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  localeOptionText: {
    fontSize: 12,
    fontWeight: '600',
  },
  spacer: {
    flex: 1,
  },
  count: {
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  listContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 28,
    gap: 10,
  },
  emptyContainer: {
    flexGrow: 1,
    paddingHorizontal: 32,
  },
});
