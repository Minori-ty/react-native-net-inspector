import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  displayPath,
  formatDuration,
  methodColor,
  statusColor,
  type InspectorTheme,
} from '../theme';
import type { NetworkEntry } from '../types';
import { Badge } from './primitives';
import { useStrings } from './strings-context';

export const EntryRow = memo(function EntryRow({
  entry,
  theme,
  onPress,
  isNew = false,
}: {
  entry: NetworkEntry;
  theme: InspectorTheme;
  onPress: (id: string) => void;
  /** Captured since the panel was last dismissed. */
  isNew?: boolean;
}) {
  const strings = useStrings();
  const status = entry.response?.status;
  const pending = entry.state === 'pending';
  const statusLabel = status === undefined ? (pending ? '···' : '—') : String(status);

  return (
    // The marker is a sibling of the card, not a child: an Android view with a
    // borderRadius can clip its children, which would shave the corner off.
    <View style={styles.wrapper}>
      <Pressable
        onPress={() => onPress(entry.id)}
        accessibilityRole="button"
        // Only set for new rows — otherwise the children's own text is announced.
        accessibilityLabel={
          isNew
            ? strings.newRequest(entry.request.method, displayPath(entry.request.url))
            : undefined
        }
        style={({ pressed }) => [
          styles.card,
          { backgroundColor: pressed ? theme.surfaceAlt : theme.card },
        ]}>
        <View style={styles.row}>
          <Badge
            label={entry.request.method}
            color={methodColor(entry.request.method)}
            variant="solid"
          />

          <View style={styles.main}>
            <Text
              numberOfLines={1}
              ellipsizeMode="middle"
              style={[styles.path, { color: theme.text }]}>
              {displayPath(entry.request.url)}
            </Text>
            <Text style={[styles.duration, { color: theme.textMuted }]}>
              {formatDuration(entry.timing.duration)}
            </Text>
          </View>

          <Text
            style={[
              styles.status,
              { color: status === undefined ? theme.textFaint : statusColor(status, theme) },
            ]}>
            {statusLabel}
          </Text>
        </View>

        {entry.error ? (
          <Text numberOfLines={2} style={[styles.error, { color: theme.danger }]}>
            {entry.error.message}
          </Text>
        ) : null}
      </Pressable>

      {isNew ? (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[styles.newTag, { backgroundColor: theme.danger }]}>
          <Text style={styles.newTagLabel}>NEW</Text>
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
  },
  card: {
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
    gap: 6,
  },
  newTag: {
    position: 'absolute',
    // Straddles the corner the way the floating ball's badge does. `top` is more
    // negative than `left` so the tag's bottom edge clears the method badge,
    // which starts at the card's 13px top padding.
    top: -7,
    left: -5,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  newTagLabel: {
    // White in both schemes, matching how the method badges render their labels.
    color: '#FFFFFF',
    fontSize: 10,
    // Pinned rather than inherited, so the tag's height stays predictable and
    // cannot creep down into the row.
    lineHeight: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  main: {
    flex: 1,
    gap: 1,
  },
  path: {
    fontSize: 15,
    fontWeight: '500',
  },
  duration: {
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
  status: {
    minWidth: 44,
    textAlign: 'right',
    fontSize: 17,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  error: {
    fontSize: 12,
    lineHeight: 16,
  },
});
