import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable } from 'react-native';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// Pressable that springs down slightly while held.
export function Tap({ style, children, disabled, scaleTo = 0.97, ...rest }) {
  const scale = useRef(new Animated.Value(1)).current;
  const springTo = (toValue) =>
    Animated.spring(scale, { toValue, useNativeDriver: true, speed: 40, bounciness: 6 }).start();
  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      onPressIn={() => springTo(scaleTo)}
      onPressOut={() => springTo(1)}
      style={[style, { transform: [{ scale }] }]}
    >
      {children}
    </AnimatedPressable>
  );
}

// Fades and lifts its children in once, after `delay` ms.
export function FadeIn({ delay = 0, style, children }) {
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: 420,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [progress, delay]);
  return (
    <Animated.View
      style={[
        {
          width: '100%',
          opacity: progress,
          transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
        },
        style,
      ]}
    >
      {children}
    </Animated.View>
  );
}

// Bar that grows from zero to `value` (0–1) when shown.
export function GrowBar({ value, color, height = 8, track = '#ECEEF5', delay = 0 }) {
  const grow = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(grow, {
      toValue: Math.max(0, Math.min(1, value || 0)),
      duration: 700,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [grow, value, delay]);
  return (
    <Animated.View style={{ height, borderRadius: height / 2, backgroundColor: track, overflow: 'hidden' }}>
      <Animated.View
        style={{
          height,
          borderRadius: height / 2,
          backgroundColor: color,
          width: grow.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
        }}
      />
    </Animated.View>
  );
}
