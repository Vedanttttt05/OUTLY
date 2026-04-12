import React, { memo, useMemo } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { colors } from '../theme/ui';

function Avatar({ uri, name, size = 40 }) {
  const initials = useMemo(() => (name || '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || '?', [name]);

  const dynamicStyle = useMemo(() => ({
    width: size,
    height: size,
    borderRadius: size / 2,
  }), [size]);

  const initialsStyle = useMemo(
    () => ({ fontSize: Math.max(12, Math.round(size * 0.34)) }),
    [size]
  );

  const imageSource = useMemo(() => (uri ? { uri, cache: 'force-cache' } : null), [uri]);

  if (imageSource) {
    return <Image source={imageSource} style={[styles.image, dynamicStyle]} />;
  }

  return (
    <View style={[styles.fallback, dynamicStyle]}>
      <Text style={[styles.initials, initialsStyle]}>{initials}</Text>
    </View>
  );
}

const areEqual = (prevProps, nextProps) => (
  prevProps.uri === nextProps.uri
  && prevProps.name === nextProps.name
  && prevProps.size === nextProps.size
);

export default memo(Avatar, areEqual);

const styles = StyleSheet.create({
  image: {
    resizeMode: 'cover',
    backgroundColor: colors.backgroundSoft,
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },
  fallback: {
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  initials: {
    color: colors.accentDeep,
    fontWeight: '800',
  },
});
