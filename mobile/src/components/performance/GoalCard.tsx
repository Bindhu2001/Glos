import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { AppColors } from '../../utils/colors';
import Badge from '../common/Badge';
import { formatDate, capitalize } from '../../utils/format';

interface Goal {
  id: number;
  title: string;
  description?: string;
  status: string;
  due_date?: string;
  cycle_name?: string;
}

interface Props { goal: Goal }

export default function GoalCard({ goal }: Props) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const STATUS_COLOR: Record<string, { bg: string; text: string }> = {
    draft: { bg: colors.gray100, text: colors.gray600 },
    pending_approval: { bg: colors.warningLight, text: colors.warning },
    approved: { bg: colors.successLight, text: colors.success },
    achieved: { bg: colors.successLight, text: colors.success },
    missed: { bg: colors.dangerLight, text: colors.danger },
  };

  const sc = STATUS_COLOR[goal.status] ?? STATUS_COLOR.draft;
  return (
    <View style={s.card}>
      <View style={s.top}>
        <Text style={s.title} numberOfLines={2}>{goal.title}</Text>
        <Badge label={capitalize(goal.status)} bg={sc.bg} color={sc.text} />
      </View>
      {goal.description && <Text style={s.desc} numberOfLines={2}>{goal.description}</Text>}
      <View style={s.meta}>
        {goal.cycle_name && <Text style={s.metaText}>Cycle: {goal.cycle_name}</Text>}
        {goal.due_date && <Text style={s.metaText}>Due: {formatDate(goal.due_date)}</Text>}
      </View>
    </View>
  );
}

function makeStyles(c: AppColors) {
  return StyleSheet.create({
    card: {
      backgroundColor: c.surface, borderRadius: 12, padding: 14,
      marginBottom: 10, borderWidth: 1, borderColor: c.border,
      shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05, shadowRadius: 3, elevation: 2,
    },
    top: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 6 },
    title: { flex: 1, fontSize: 14, fontWeight: '600', color: c.textPrimary },
    desc: { fontSize: 13, color: c.gray500, lineHeight: 19, marginBottom: 8 },
    meta: { flexDirection: 'row', gap: 14 },
    metaText: { fontSize: 12, color: c.gray400 },
  });
}
