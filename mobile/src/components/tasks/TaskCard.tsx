import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PriorityColors, AppColors } from '../../utils/colors';
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
  const priorityColor = PriorityColors[task.priority] ?? PriorityColors.medium;

  const isDone = task.status === 'done';
  const isActive = task.status === 'in_progress';

  return (
    <TouchableOpacity style={s.card} onPress={onPress} activeOpacity={0.8}>
      <View style={[s.circle, isDone && s.circleDone, isActive && s.circleActive]}>
        {isDone
          ? <Ionicons name="checkmark" size={10} color="#16a34a" />
          : isActive
          ? <Ionicons name="reload-outline" size={10} color={colors.primary} />
          : <Ionicons name="clipboard-outline" size={10} color={colors.gray400} />
        }
      </View>
      <View style={s.body}>
        <View style={s.top}>
          <Text style={[s.title, isDone && s.titleDone]} numberOfLines={2}>{task.title}</Text>
        </View>
        <View style={s.bottom}>
          <Badge label={capitalize(task.priority)} bg={priorityColor.bg} color={priorityColor.text} />
          <Badge label={isDone ? 'Done' : isActive ? 'Active' : capitalize(task.status)} bg={isDone ? '#def7ec' : isActive ? '#e8f0fe' : '#f3f4f6'} color={isDone ? '#0e9f6e' : isActive ? '#1a56db' : '#374151'} />
          {task.due_on && (
            <View style={s.due}>
              <Ionicons name="calendar-outline" size={12} color={colors.gray400} />
              <Text style={s.dueText}>{formatDate(task.due_on)}</Text>
            </View>
          )}
        </View>
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
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 3,
      elevation: 2,
    },
    circle: {
      width: 24,
      height: 24,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: c.border,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 1,
      flexShrink: 0,
      backgroundColor: c.surface,
    },
    circleDone: { backgroundColor: '#e1fced', borderColor: '#16a34a' },
    circleActive: { backgroundColor: c.primaryLight, borderColor: c.primary },
    body: { flex: 1 },
    top: { marginBottom: 8 },
    title: { fontSize: 14, fontWeight: '600', color: c.textPrimary, lineHeight: 20 },
    titleDone: { color: c.textMuted, textDecorationLine: 'line-through' },
    bottom: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
    due: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 'auto' },
    dueText: { fontSize: 11, color: c.gray400 },
  });
}
