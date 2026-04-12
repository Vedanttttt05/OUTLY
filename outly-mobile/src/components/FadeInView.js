import React, { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';

export default function FadeInView({
  children,
  style,
  delay = 0,
  distance = 12,
  duration = 520,
  scaleFrom = 0.985,
  float = false,
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(distance)).current;
  const scale = useRef(new Animated.Value(scaleFrom)).current;
  const drift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const enter = Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(translateY, {
        toValue: 0,
        damping: 15,
        stiffness: 140,
        mass: 0.8,
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 1,
        duration: Math.max(300, duration - 80),
        easing: Easing.out(Easing.exp),
        useNativeDriver: true,
      }),
    ]);

    const run = Animated.sequence([
      Animated.delay(delay),
      enter,
    ]);

    run.start(({ finished }) => {
      if (!finished || !float) return;

      Animated.loop(
        Animated.sequence([
          Animated.timing(drift, {
            toValue: -3,
            duration: 2000,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(drift, {
            toValue: 0,
            duration: 2000,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ])
      ).start();
    });
  }, [opacity, translateY, scale, drift, delay, duration, float]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity,
          transform: [
            { translateY: Animated.add(translateY, drift) },
            { scale },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}
