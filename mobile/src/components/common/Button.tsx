import React, { useMemo } from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, ViewStyle } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { AppColors } from '../../utils/colors';

interface Props {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'outline' | 'ghost' | 'danger';
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  fullWidth?: boolean;
}

export default function Button({
  label, onPress, variant = 'primary', loading = false, disabled = false, style, fullWidth = false,
}: Props) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const isDisabled = disabled || loading;

  return (
    <TouchableOpacity
      style={[s.base, s[variant], isDisabled && s.disabled, fullWidth && s.fullWidth, style]}
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.8}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? '#ffffff' : colors.primary} size="small" />
      ) : (
        <Text style={[s.text, s[`${variant}Text` as keyof typeof s] as any]}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}

function makeStyles(c: AppColors) {
  return StyleSheet.create({
    base: { paddingVertical: 12, paddingHorizontal: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
    fullWidth: { width: '100%' },
    primary: { backgroundColor: c.primary },
    outline: { backgroundColor: c.surface, borderWidth: 1.5, borderColor: c.primary },
    ghost: { backgroundColor: 'transparent' },
    danger: { backgroundColor: c.danger },
    disabled: { opacity: 0.5 },
    text: { fontSize: 15, fontWeight: '600' },
    primaryText: { color: '#ffffff' },
    outlineText: { color: c.primary },
    ghostText: { color: c.primary },
    dangerText: { color: '#ffffff' },
  });
}
