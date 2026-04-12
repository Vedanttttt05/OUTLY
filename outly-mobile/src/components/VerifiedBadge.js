import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../theme/ui';

function VerifiedBadge({ visible, size = 'small' }) {
  if (!visible) return null;

  const compact = size === 'small';

  return (
    <View style={[styles.badge, compact ? styles.badgeSmall : styles.badgeLarge]}>
      <Text style={[styles.icon, compact ? styles.iconSmall : styles.iconLarge]}>✓</Text>
    </View>
  );
}

const areEqual = (prevProps, nextProps) => (
  prevProps.visible === nextProps.visible
  && prevProps.size === nextProps.size
);

export default memo(VerifiedBadge, areEqual);

const styles = StyleSheet.create({
  badge: {
    backgroundColor: colors.success,
    borderRadius: 999,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },
  badgeSmall: {
    width: 16,
    height: 16,
  },
  badgeLarge: {
    width: 22,
    height: 22,
  },
  icon: {
    color: '#fff',
    fontWeight: '800',
  },
  iconSmall: {
    fontSize: 10,
    lineHeight: 10,
  },
  iconLarge: {
    fontSize: 13,
    lineHeight: 13,
  },
});
