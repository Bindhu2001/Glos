import React, { ReactNode, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../contexts/ThemeContext';
import { AppColors } from '../../utils/colors';

interface Props {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  right?: ReactNode;
}

export default function ScreenHeader({ title, subtitle, showBack = false, right }: Props) {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={s.container}>
      <View style={s.row}>
        {showBack && (
          <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn} hitSlop={8}>
            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
        )}
        <View style={s.titles}>
          <Text style={s.title} numberOfLines={1}>{title}</Text>
          {subtitle && <Text style={s.subtitle} numberOfLines={1}>{subtitle}</Text>}
        </View>
        {right && <View style={s.right}>{right}</View>}
      </View>
    </View>
  );
}

function makeStyles(c: AppColors) {
  return StyleSheet.create({
    container: {
      backgroundColor: c.surface,
      paddingHorizontal: 20,
      paddingBottom: 14,
      paddingTop: 14,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    row: { flexDirection: 'row', alignItems: 'center' },
    backBtn: { marginRight: 10 },
    titles: { flex: 1 },
    title: { fontSize: 20, fontWeight: '700', color: c.textPrimary },
    subtitle: { fontSize: 13, color: c.textSecondary, marginTop: 1 },
    right: { marginLeft: 10 },
  });
}
