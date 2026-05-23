import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { AppColors } from '../../utils/colors';

interface Item {
  id: number;
  text: string;
  is_done: number | boolean;
}

interface Props {
  item: Item;
  onToggle: () => void;
  onDelete: () => void;
}

export default function ChecklistItem({ item, onToggle, onDelete }: Props) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={s.row}>
      <TouchableOpacity onPress={onToggle} hitSlop={8}>
        <Ionicons
          name={item.is_done ? 'checkbox' : 'square-outline'}
          size={20}
          color={item.is_done ? colors.success : colors.gray400}
        />
      </TouchableOpacity>
      <Text style={[s.label, !!item.is_done && s.checked]} numberOfLines={2}>
        {item.text}
      </Text>
      <TouchableOpacity onPress={onDelete} hitSlop={8} style={s.deleteBtn}>
        <Ionicons name="close-outline" size={18} color={colors.gray400} />
      </TouchableOpacity>
    </View>
  );
}

function makeStyles(c: AppColors) {
  return StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
    label: { flex: 1, fontSize: 14, color: c.textPrimary },
    checked: { textDecorationLine: 'line-through', color: c.gray400 },
    deleteBtn: { marginLeft: 'auto' },
  });
}
