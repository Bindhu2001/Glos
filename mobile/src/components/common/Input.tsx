import React, { useMemo } from 'react';
import { View, TextInput, Text, StyleSheet, TextInputProps, ViewStyle } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { AppColors } from '../../utils/colors';

interface Props extends TextInputProps {
  label?: string;
  error?: string;
  containerStyle?: ViewStyle;
}

export default function Input({ label, error, containerStyle, ...props }: Props) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={[s.container, containerStyle]}>
      {label && <Text style={s.label}>{label}</Text>}
      <TextInput
        style={[s.input, error ? s.inputError : null, props.multiline && s.multiline]}
        placeholderTextColor={colors.gray400}
        {...props}
      />
      {error && <Text style={s.error}>{error}</Text>}
    </View>
  );
}

function makeStyles(c: AppColors) {
  return StyleSheet.create({
    container: { marginBottom: 16 },
    label: { fontSize: 13, fontWeight: '600', color: c.textSecondary, marginBottom: 6 },
    input: {
      backgroundColor: c.gray50,
      borderWidth: 1.5,
      borderColor: c.border,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      color: c.textPrimary,
    },
    inputError: { borderColor: c.danger },
    multiline: { minHeight: 80, textAlignVertical: 'top' },
    error: { fontSize: 12, color: c.danger, marginTop: 4 },
  });
}
