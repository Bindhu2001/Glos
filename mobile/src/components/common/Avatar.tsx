import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { getInitials } from '../../utils/format';

const PALETTE = [
  '#1a56db', '#0e9f6e', '#c27803', '#e02424', '#7e3af2', '#0694a2',
];

function colorForName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

interface Props {
  name: string;
  size?: number;
  photoUrl?: string | null;
}

export default function Avatar({ name, size = 36, photoUrl }: Props) {
  const safeName = name || '?';

  if (photoUrl) {
    return (
      <Image
        source={{ uri: photoUrl }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
      />
    );
  }

  const bg = colorForName(safeName);
  const initials = getInitials(safeName);
  const fontSize = size * 0.38;

  return (
    <View style={[styles.circle, { width: size, height: size, borderRadius: size / 2, backgroundColor: bg }]}>
      <Text style={[styles.text, { fontSize }]}>{initials}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { alignItems: 'center', justifyContent: 'center' },
  text: { color: '#ffffff', fontWeight: '700' },
});
