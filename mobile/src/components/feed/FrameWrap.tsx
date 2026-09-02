import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, ImageBackground, ImageSourcePropType, StyleSheet } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { AppColors } from '../../utils/colors';

// Matches qa-production web's FRAME_IMAGES/FRAME_OPTIONS in RichEditor.jsx —
// same two styles, same 'lines' | 'flower' identifiers (also what the shared
// backend's VALID_FRAME_STYLES accepts).
export const FRAME_IMAGES: Record<string, ImageSourcePropType> = {
  lines: require('../../../assets/frames/lines_frame.png'),
  flower: require('../../../assets/frames/flower_frame.png'),
};

export const FRAME_OPTIONS: { value: string | null; label: string }[] = [
  { value: null, label: 'No frame' },
  { value: 'lines', label: 'Lines' },
  { value: 'flower', label: 'Flower' },
];

const BORDER_WIDTH = 16;

// Web wraps the card in a CSS `border-image` (a 9-slice stretch that keeps
// the frame's corner motifs crisp at any card size). React Native's Image
// has no equivalent (capInsets is iOS-only, and these source PNGs aren't
// pre-cut 9-patches for Android), so this stretches the whole frame image
// across the card's bounds instead — a reasonable approximation for a
// decorative border, not pixel-identical to web at every card height.
export function FrameWrap({ frameStyle, children }: { frameStyle?: string | null; children: React.ReactNode }) {
  if (!frameStyle || !FRAME_IMAGES[frameStyle]) return <>{children}</>;
  return (
    <ImageBackground source={FRAME_IMAGES[frameStyle]} resizeMode="stretch" style={styles.wrap}>
      <View style={styles.inner}>{children}</View>
    </ImageBackground>
  );
}

// Chip-row picker (matches this app's existing badge/audience chip pattern
// rather than web's anchored popover, which has no direct RN equivalent).
export function FramePickerRow({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={s.row}>
      {FRAME_OPTIONS.map((opt) => (
        <TouchableOpacity
          key={opt.label}
          style={[s.chip, value === opt.value && s.chipActive]}
          onPress={() => onChange(opt.value)}
        >
          {opt.value && (
            <ImageBackground source={FRAME_IMAGES[opt.value]} resizeMode="cover" style={s.swatch} imageStyle={{ borderRadius: 4 }} />
          )}
          <Text style={[s.chipText, value === opt.value && s.chipTextActive]}>{opt.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: 14, padding: BORDER_WIDTH, marginBottom: 12, overflow: 'hidden' },
  inner: {},
});

function makeStyles(c: AppColors) {
  return StyleSheet.create({
    row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
      backgroundColor: c.gray100, borderWidth: 1.5, borderColor: c.border,
    },
    chipActive: { backgroundColor: c.primaryLight, borderColor: c.primary },
    chipText: { fontSize: 12, fontWeight: '500', color: c.gray600 },
    chipTextActive: { color: c.primary, fontWeight: '700' },
    swatch: { width: 16, height: 16, borderRadius: 4, overflow: 'hidden' },
  });
}
