import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme/ThemeContext';

export type IllustrationKind = 'care' | 'education' | 'followUp' | 'allClear';

const SCENES: Record<
  IllustrationKind,
  {
    icon: keyof typeof Ionicons.glyphMap;
    accent: 'primary' | 'success' | 'warning';
    badge: keyof typeof Ionicons.glyphMap;
  }
> = {
  care: { icon: 'woman', accent: 'primary', badge: 'heart' },
  education: { icon: 'play', accent: 'primary', badge: 'glasses' },
  followUp: { icon: 'calendar', accent: 'warning', badge: 'checkmark' },
  allClear: { icon: 'shield-checkmark', accent: 'success', badge: 'checkmark' },
};

export function IllustrationScene({
  kind,
  compact = false,
}: {
  kind: IllustrationKind;
  compact?: boolean;
}) {
  const { theme } = useTheme();
  const scene = SCENES[kind];
  const accent = theme.colors[scene.accent];

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={{
        care: 'Maternal care',
        education: 'Video and virtual reality education',
        followUp: 'Scheduled follow-up care',
        allClear: 'No high-risk cases',
      }[kind]}
      style={[styles.frame, compact && styles.compact]}
    >
      <View style={[styles.halo, { backgroundColor: theme.colors.primary + '12' }]} />
      <View style={[styles.orbit, { borderColor: theme.colors.primary + '26' }]} />
      <View
        style={[
          styles.mainBadge,
          compact && styles.compactMainBadge,
          { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
        ]}
      >
        <Ionicons
          name={scene.icon}
          size={compact ? 34 : 52}
          color={accent}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      </View>
      <View
        style={[
          styles.floatBadge,
          styles.topBadge,
          compact && styles.compactFloatBadge,
          { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
        ]}
      >
        <Ionicons
          name={scene.badge}
          size={compact ? 14 : 18}
          color={theme.colors.primary}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      </View>
      <View
        style={[
          styles.floatBadge,
          styles.bottomBadge,
          compact && styles.compactFloatBadge,
          { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
        ]}
      >
        <Ionicons
          name="medical"
          size={compact ? 13 : 17}
          color={theme.colors.success}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      </View>
      <View style={[styles.dot, styles.dotLeft, { backgroundColor: accent + '55' }]} />
      <View style={[styles.dot, styles.dotRight, { backgroundColor: theme.colors.warning + '77' }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: 184,
    height: 142,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  compact: {
    width: 104,
    height: 96,
    marginBottom: 0,
  },
  halo: {
    position: 'absolute',
    width: 118,
    height: 118,
    borderRadius: 59,
  },
  orbit: {
    position: 'absolute',
    width: 144,
    height: 112,
    borderWidth: 1,
    borderRadius: 56,
    transform: [{ rotate: '-18deg' }],
  },
  mainBadge: {
    width: 88,
    height: 88,
    borderRadius: 28,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0D47A1',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 3,
  },
  compactMainBadge: {
    width: 62,
    height: 62,
    borderRadius: 22,
  },
  floatBadge: {
    position: 'absolute',
    width: 38,
    height: 38,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0D47A1',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 2,
  },
  compactFloatBadge: {
    width: 28,
    height: 28,
    borderRadius: 11,
  },
  topBadge: {
    top: 8,
    right: 34,
  },
  bottomBadge: {
    bottom: 8,
    left: 34,
  },
  dot: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotLeft: {
    top: 22,
    left: 42,
  },
  dotRight: {
    right: 26,
    bottom: 28,
  },
});
