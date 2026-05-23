import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';

interface Props {
  label: string;
  bg?: string;
  color?: string;
}

export default function Badge({ label, bg, color }: Props) {
  const { colors } = useTheme();
  const resolvedBg = bg ?? colors.primaryLight;
  const resolvedColor = color ?? colors.primary;
  return (
    <View style={[styles.badge, { backgroundColor: resolvedBg }]}>
      <Text style={[styles.text, { color: resolvedColor }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  text: { fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
});
