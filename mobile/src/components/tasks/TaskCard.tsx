import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusColors, PriorityColors, AppColors } from '../../utils/colors';
import { useTheme } from '../../contexts/ThemeContext';
import { formatDate, capitalize } from '../../utils/format';
import Badge from '../common/Badge';

interface Task {
  id: number;
  title: string;
  status: string;
  priority: string;
  due_on?: string;
  assignee_ids_json?: string;
}

interface Props {
  task: Task;
  onPress: () => void;
}

export default function TaskCard({ task, onPress }: Props) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const statusColor = StatusColors[task.status] ?? StatusColors.open;
  const priorityColor = PriorityColors[task.priority] ?? PriorityColors.medium;

  return (
    <TouchableOpacity style={s.card} onPress={onPress} activeOpacity={0.8}>
      <View style={s.top}>
        <Text style={s.title} numberOfLines={2}>{task.title}</Text>
        <Badge label={capitalize(task.status)} bg={statusColor.bg} color={statusColor.text} />
      </View>
      <View style={s.bottom}>
        <Badge label={capitalize(task.priority)} bg={priorityColor.bg} color={priorityColor.text} />
        {task.due_on && (
          <View style={s.due}>
            <Ionicons name="calendar-outline" size={12} color={colors.gray400} />
            <Text style={s.dueText}>{formatDate(task.due_on)}</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

function makeStyles(c: AppColors) {
  return StyleSheet.create({
    card: {
      backgroundColor: c.surface,
      borderRadius: 12,
      padding: 14,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: c.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 3,
      elevation: 2,
    },
    top: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 10 },
    title: { flex: 1, fontSize: 14, fontWeight: '600', color: c.textPrimary, lineHeight: 20 },
    bottom: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    due: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 'auto' },
    dueText: { fontSize: 11, color: c.gray400 },
  });
}
