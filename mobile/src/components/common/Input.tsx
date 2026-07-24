import React, { useMemo, useState } from 'react';
import {
  View, TextInput, Text, StyleSheet, TextInputProps, ViewStyle, TouchableOpacity,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { AppColors } from '../../utils/colors';

interface Props extends TextInputProps {
  label?: string;
  error?: string;
  containerStyle?: ViewStyle;
}

export default function Input({ label, error, containerStyle, secureTextEntry, ...props }: Props) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [hidden, setHidden] = useState(true);
  const isPassword = secureTextEntry === true;

  return (
    <View style={[s.container, containerStyle]}>
      {label && <Text style={s.label}>{label}</Text>}
      <View style={s.inputWrapper}>
        <TextInput
          style={[s.input, error ? s.inputError : null, props.multiline && s.multiline, isPassword && s.inputWithIcon]}
          placeholderTextColor={colors.gray400}
          secureTextEntry={isPassword ? hidden : false}
          {...props}
        />
        {isPassword && (
          <TouchableOpacity style={s.eyeBtn} onPress={() => setHidden(h => !h)} activeOpacity={0.7}>
            <Feather name={hidden ? 'eye-off' : 'eye'} size={18} color={colors.gray400} />
          </TouchableOpacity>
        )}
      </View>
      {error && <Text style={s.error}>{error}</Text>}
    </View>
  );
}

function makeStyles(c: AppColors) {
  return StyleSheet.create({
    container: { marginBottom: 16 },
    label: { fontSize: 13, fontWeight: '600', color: c.textSecondary, marginBottom: 6 },
    inputWrapper: { position: 'relative' },
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
    inputWithIcon: { paddingRight: 44 },
    inputError: { borderColor: c.danger },
    multiline: { minHeight: 80, textAlignVertical: 'top' },
    error: { fontSize: 12, color: c.danger, marginTop: 4 },
    eyeBtn: {
      position: 'absolute',
      right: 12,
      top: 0,
      bottom: 0,
      justifyContent: 'center',
      paddingHorizontal: 4,
    },
  });
}
