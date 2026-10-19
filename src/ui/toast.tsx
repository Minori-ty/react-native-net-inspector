import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOut } from 'react-native-reanimated';

import type { InspectorTheme } from '../theme';

/**
 * Transient confirmation pill.
 *
 * Render it conditionally — the parent removing it is what triggers the exit
 * animation. It is also non-interactive, so it never swallows a tap meant for the
 * content underneath.
 */
export function Toast({ message, theme }: { message: string; theme: InspectorTheme }) {
  return (
    <Animated.View
      pointerEvents="none"
      entering={FadeInDown.duration(180)}
      exiting={FadeOut.duration(180)}
      style={styles.wrapper}>
      <View style={[styles.pill, { backgroundColor: theme.text }]}>
        <Text numberOfLines={2} style={[styles.label, { color: theme.card }]}>
          {message}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 28,
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  pill: {
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
  },
});
