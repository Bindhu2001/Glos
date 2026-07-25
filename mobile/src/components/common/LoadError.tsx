import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { AppColors } from '../../utils/colors';

interface Props {
  onRetry: () => void;
  message?: string;
}

export default function LoadError({ onRetry, message = 'Unable to load data. Please check your connection.' }: Props) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={s.container}>
      <Text style={s.msg}>{message}</Text>
      <TouchableOpacity style={s.btn} onPress={onRetry}>
        <Text style={s.btnText}>Try Again</Text>
      </TouchableOpacity>
    </View>
  );
}

function makeStyles(c: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: c.background },
    msg: { fontSize: 15, color: c.textSecondary, textAlign: 'center', marginBottom: 20 },
    btn: { backgroundColor: c.primary, paddingHorizontal: 32, paddingVertical: 12, borderRadius: 8 },
    btnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  });
}
