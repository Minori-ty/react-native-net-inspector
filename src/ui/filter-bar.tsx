import { StyleSheet, TextInput, View } from 'react-native';

import type { InspectorTheme } from '../theme';
import type { NetworkEntry } from '../types';
import { Chip } from './primitives';
import { useStrings } from './strings-context';

export type StatusGroup = '2xx' | '3xx' | '4xx' | '5xx';

export interface Filters {
  method: string | null;
  statusGroup: StatusGroup | null;
  onlyFailed: boolean;
  query: string;
}

export const emptyFilters: Filters = {
  method: null,
  statusGroup: null,
  onlyFailed: false,
  query: '',
};

export function isFiltered(filters: Filters): boolean {
  return (
    filters.method !== null ||
    filters.statusGroup !== null ||
    filters.onlyFailed ||
    filters.query.trim().length > 0
  );
}

export function applyFilters(
  entries: readonly NetworkEntry[],
  filters: Filters,
): readonly NetworkEntry[] {
  const query = filters.query.trim().toLowerCase();
  if (!isFiltered(filters)) return entries;

  return entries.filter((entry) => {
    if (filters.method && entry.request.method !== filters.method) return false;

    if (filters.onlyFailed && (entry.state === 'success' || entry.state === 'pending')) {
      return false;
    }

    if (filters.statusGroup) {
      const status = entry.response?.status;
      if (status === undefined) return false;
      if (`${Math.floor(status / 100)}xx` !== filters.statusGroup) return false;
    }

    if (query && !entry.request.url.toLowerCase().includes(query)) return false;
    return true;
  });
}

/** Methods actually present in the capture, in a stable display order. */
export function collectMethods(entries: readonly NetworkEntry[]): string[] {
  const order = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
  const present = new Set(entries.map((entry) => entry.request.method));
  const known = order.filter((method) => present.has(method));
  const rest = Array.from(present)
    .filter((method) => !order.includes(method))
    .sort();
  return [...known, ...rest];
}

const STATUS_GROUPS: StatusGroup[] = ['2xx', '3xx', '4xx', '5xx'];

export function FilterBar({
  filters,
  onChange,
  theme,
  methods,
}: {
  filters: Filters;
  onChange: (next: Filters) => void;
  theme: InspectorTheme;
  methods: readonly string[];
}) {
  const strings = useStrings();

  return (
    <View style={[styles.bar, { borderBottomColor: theme.border, backgroundColor: theme.background }]}>
      <View style={styles.row}>
        {methods.map((method) => (
          <Chip
            key={method}
            label={method}
            active={filters.method === method}
            onPress={() => onChange({ ...filters, method: filters.method === method ? null : method })}
            theme={theme}
          />
        ))}
      </View>

      <View style={styles.row}>
        <Chip
          label={strings.onlyFailed}
          active={filters.onlyFailed}
          onPress={() => onChange({ ...filters, onlyFailed: !filters.onlyFailed })}
          theme={theme}
          color={theme.danger}
        />
        {STATUS_GROUPS.map((group) => (
          <Chip
            key={group}
            label={group}
            active={filters.statusGroup === group}
            onPress={() =>
              onChange({
                ...filters,
                statusGroup: filters.statusGroup === group ? null : group,
              })
            }
            theme={theme}
          />
        ))}
      </View>

      <TextInput
        value={filters.query}
        onChangeText={(query) => onChange({ ...filters, query })}
        placeholder={strings.searchPlaceholder}
        placeholderTextColor={theme.textFaint}
        autoCapitalize="none"
        autoCorrect={false}
        style={[
          styles.search,
          { color: theme.text, backgroundColor: theme.card, borderColor: theme.border },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  search: {
    height: 36,
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 11,
    fontSize: 13,
    marginTop: 2,
  },
});
