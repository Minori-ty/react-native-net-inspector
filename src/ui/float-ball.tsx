import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import type { InspectorTheme } from '../theme';

export const BALL_SIZE = 52;
const EDGE = 10;
const TOP_LIMIT = 70;
/** Keeps the ball clear of the home indicator and of typical bottom tab bars. */
const BOTTOM_RESERVE = 140;

function clamp(value: number, min: number, max: number): number {
  'worklet';
  return Math.min(Math.max(value, min), max);
}

/**
 * Draggable floating ball. Tap opens the drawer, drag moves it and springs it to
 * the nearest horizontal edge on release.
 *
 * Requires a `GestureHandlerRootView` somewhere above it — Expo Router only
 * provides one inside its stack navigator, so an app using native tabs has to
 * add the root view itself.
 */
export function FloatBall({
  theme,
  badge = 0,
  onPress,
}: {
  theme: InspectorTheme;
  badge?: number;
  onPress: () => void;
}) {
  const { width, height } = useWindowDimensions();

  const x = useSharedValue(width - BALL_SIZE - EDGE);
  const y = useSharedValue(height * 0.62);
  const originX = useSharedValue(0);
  const originY = useSharedValue(0);
  const active = useSharedValue(0);

  // Re-clamp when the viewport changes (rotation, split screen).
  useEffect(() => {
    x.value = Math.min(Math.max(x.value, EDGE), Math.max(EDGE, width - BALL_SIZE - EDGE));
    y.value = Math.min(Math.max(y.value, TOP_LIMIT), Math.max(TOP_LIMIT, height - BALL_SIZE - BOTTOM_RESERVE));
  }, [width, height, x, y]);

  const pan = Gesture.Pan()
    .minDistance(6)
    .onStart(() => {
      originX.value = x.value;
      originY.value = y.value;
      active.value = 1;
    })
    .onUpdate((event) => {
      x.value = clamp(originX.value + event.translationX, EDGE, width - BALL_SIZE - EDGE);
      y.value = clamp(
        originY.value + event.translationY,
        TOP_LIMIT,
        height - BALL_SIZE - BOTTOM_RESERVE,
      );
    })
    .onEnd(() => {
      active.value = 0;
      const target = x.value + BALL_SIZE / 2 < width / 2 ? EDGE : width - BALL_SIZE - EDGE;
      x.value = withSpring(target, { damping: 18, stiffness: 200 });
    });

  const tap = Gesture.Tap()
    .maxDuration(280)
    .onEnd((_event, success) => {
      if (success) runOnJS(onPress)();
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: x.value },
      { translateY: y.value },
      { scale: active.value ? 1.08 : 1 },
    ],
  }));

  return (
    <GestureDetector gesture={Gesture.Race(pan, tap)}>
      <Animated.View
        style={[
          styles.ball,
          { backgroundColor: theme.accent, borderColor: theme.card },
          animatedStyle,
        ]}>
        <Ionicons name="pulse" size={26} color={theme.onAccent} />

        {badge > 0 ? (
          <View style={[styles.badge, { backgroundColor: theme.danger, borderColor: theme.card }]}>
            <Text style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Text>
          </View>
        ) : null}
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  ball: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: BALL_SIZE,
    height: BALL_SIZE,
    borderRadius: BALL_SIZE / 2,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.22,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
});
