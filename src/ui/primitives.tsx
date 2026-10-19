import Ionicons from '@expo/vector-icons/Ionicons';
import { useState, type ComponentProps, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';

import type { InspectorTheme } from '../theme';
import { useStrings } from './strings-context';

export type IoniconName = ComponentProps<typeof Ionicons>['name'];

export const MONO_FONT = Platform.select({
  ios: 'ui-monospace',
  android: 'monospace',
  default: 'monospace',
});

export function Mono({
  children,
  theme,
  style,
  numberOfLines,
  selectable,
}: {
  children: ReactNode;
  theme: InspectorTheme;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  selectable?: boolean;
}) {
  return (
    <Text
      selectable={selectable}
      numberOfLines={numberOfLines}
      // Android defaults to BREAK_STRATEGY_HIGH_QUALITY, which optimises line
      // breaking for prose: it refuses to break a long unbreakable token such as
      // a URL mid-word and instead breaks at the token's own separators (`://`,
      // `.`, `/`). A URL then lands on three short lines with most of each line
      // empty. `simple` is plain greedy character wrapping — exactly what a URL
      // or a minified JSON blob wants.
      //
      // iOS needs nothing here: RN's default is already NSLineBreakStrategyNone.
      // It is passed explicitly so the intent survives a default change.
      textBreakStrategy="simple"
      lineBreakStrategyIOS="none"
      style={[styles.mono, { color: theme.text }, style]}>
      {children}
    </Text>
  );
}

export function Badge({
  label,
  color,
  variant = 'outline',
  style,
}: {
  label: string;
  color: string;
  variant?: 'outline' | 'solid';
  style?: StyleProp<TextStyle>;
}) {
  const solid = variant === 'solid';
  return (
    <View
      style={[
        styles.badge,
        { borderColor: color, backgroundColor: solid ? color : 'transparent' },
      ]}>
      <Text style={[styles.badgeLabel, { color: solid ? '#FFFFFF' : color }, style]}>{label}</Text>
    </View>
  );
}

/**
 * A titled card. Sections that carry a lot of low-signal rows (header lists)
 * can start folded: the title stays, the copy affordance stays, only the rows
 * go away.
 */
export function Section({
  title,
  theme,
  children,
  right,
  collapsible = false,
  defaultOpen = true,
  count,
}: {
  title: string;
  theme: InspectorTheme;
  children: ReactNode;
  right?: ReactNode;
  /** Adds a chevron and makes the title row toggle the body. */
  collapsible?: boolean;
  defaultOpen?: boolean;
  /** Row count, shown next to a folded title so the section still says something. */
  count?: number;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const strings = useStrings();
  const expanded = !collapsible || open;

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        {collapsible ? (
          <Pressable
            onPress={() => setOpen((previous) => !previous)}
            // The title is short; the padding is what makes the whole strip feel
            // tappable without swallowing the copy button on the right.
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel={`${expanded ? strings.collapse : strings.expand} ${title}`}
            accessibilityState={{ expanded }}
            style={({ pressed }) => [styles.sectionTitleRow, { opacity: pressed ? 0.6 : 1 }]}>
            <Ionicons
              name={expanded ? 'chevron-down' : 'chevron-forward'}
              size={12}
              color={theme.textFaint}
            />
            <Text style={[styles.sectionTitle, { color: theme.textFaint }]}>{title}</Text>
            {!expanded && count !== undefined ? (
              <Text style={[styles.sectionCount, { color: theme.textFaint }]}>{count}</Text>
            ) : null}
          </Pressable>
        ) : (
          <Text style={[styles.sectionTitle, { color: theme.textFaint }]}>{title}</Text>
        )}
        {right}
      </View>
      {expanded ? (
        <View style={[styles.sectionBody, { backgroundColor: theme.card, borderColor: theme.border }]}>
          {children}
        </View>
      ) : null}
    </View>
  );
}

export function KeyValueRow({
  label,
  value,
  theme,
  mono,
  selectable = true,
  last,
}: {
  label: string;
  value: string;
  theme: InspectorTheme;
  mono?: boolean;
  selectable?: boolean;
  last?: boolean;
}) {
  return (
    <View style={[styles.kvRow, !last && { borderBottomColor: theme.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
      <Text style={[styles.kvLabel, { color: theme.textMuted }]} numberOfLines={1}>
        {label}
      </Text>
      <Text
        selectable={selectable}
        textBreakStrategy="simple"
        lineBreakStrategyIOS="none"
        style={[mono ? styles.mono : styles.kvValue, { color: theme.text }]}>
        {value}
      </Text>
    </View>
  );
}

export function Chip({
  label,
  active,
  onPress,
  theme,
  color,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  theme: InspectorTheme;
  color?: string;
}) {
  const tone = color ?? theme.accent;
  return (
    <Pressable
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [
        styles.chip,
        {
          borderColor: active ? tone : theme.border,
          backgroundColor: active ? tone : 'transparent',
          opacity: pressed ? 0.7 : 1,
        },
      ]}>
      <Text style={[styles.chipLabel, { color: active ? '#FFFFFF' : theme.textMuted }]}>{label}</Text>
    </Pressable>
  );
}

export function ActionButton({
  label,
  onPress,
  theme,
  tone,
  icon,
}: {
  label: string;
  onPress: () => void;
  theme: InspectorTheme;
  tone?: string;
  icon?: IoniconName;
}) {
  const color = tone ?? theme.accent;
  return (
    <Pressable onPress={onPress} hitSlop={8} style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}>
      <View style={styles.actionRow}>
        {icon ? <Ionicons name={icon} size={18} color={color} /> : null}
        <Text style={[styles.action, { color }]}>{label}</Text>
      </View>
    </Pressable>
  );
}

/**
 * Icon-only action, for affordances where a text label would be noise.
 *
 * Defaults to the muted tone rather than the accent: these sit in chrome, next to
 * section titles and row hints, where an accent-coloured icon in every section
 * reads as noise. Every copy affordance in the panel shares this one colour.
 */
export function IconButton({
  icon,
  onPress,
  theme,
  tone,
  label,
  size = 20,
}: {
  icon: IoniconName;
  onPress: () => void;
  theme: InspectorTheme;
  tone?: string;
  /** Screen-reader text — an icon alone says nothing to assistive tech. */
  label: string;
  size?: number;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1 }]}>
      <Ionicons name={icon} size={size} color={tone ?? theme.textFaint} />
    </Pressable>
  );
}

/** Trailing affordance for rows that copy on tap. */
export function CopyIcon({ color, size = 18 }: { color: string; size?: number }) {
  return <Ionicons name="copy-outline" size={size} color={color} />;
}

export function EmptyState({ theme, message }: { theme: InspectorTheme; message: string }) {
  return (
    <View style={styles.empty}>
      <Text style={[styles.emptyText, { color: theme.textFaint }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  mono: {
    fontFamily: MONO_FONT,
    fontSize: 12,
    lineHeight: 17,
  },
  badge: {
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  badgeLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  section: {
    marginBottom: 18,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 1,
  },
  sectionCount: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.8,
  },
  sectionBody: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    overflow: 'hidden',
  },
  kvRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 9,
    gap: 10,
  },
  kvLabel: {
    // Sized for the longest label actually used (4 CJK glyphs). It used to be
    // 104px for long header names, but headers have their own row layout now, and
    // the extra 36px went to the value instead.
    width: 68,
    fontSize: 12,
    lineHeight: 17,
  },
  kvValue: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  chip: {
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  chipLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  action: {
    fontSize: 13,
    fontWeight: '500',
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 13,
    textAlign: 'center',
  },
});
