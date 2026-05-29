import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PriorityColors, StatusColors, AppColors } from '../../utils/colors';
import { useTheme } from '../../contexts/ThemeContext';
import { formatDuration } from '../../utils/format';

const STATUS_LABELS: Record<string, string> = {
  open: 'Not started',
  in_progress: 'In progress',
  blocked: 'Blocked',
  done: 'Completed',
  cancelled: 'Cancelled',
};

function deadlineLabel(due_on: string | undefined): { text: string; color: string } | null {
  if (!due_on) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(due_on);
  due.setHours(0, 0, 0, 0);
  const diffDays = Math.round((due.getTime() - today.getTime()) / 86400000);
  if (diffDays === 0) return { text: 'Today', color: '#f59e0b' };
  if (diffDays > 0) return { text: `${diffDays}d left`, color: '#6b7280' };
  return { text: `${Math.abs(diffDays)}d overdue`, color: '#ef4444' };
}

interface Task {
  id: number;
  title: string;
  status: string;
  priority: string;
  due_on?: string;
  assignee_name?: string;
  area_name?: string;
  total_logged_minutes?: number;
  estimated_minutes?: number;
}

interface Props {
  task: Task;
  onPress: () => void;
}

export default function TaskCard({ task, onPress }: Props) {
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const priorityColor = PriorityColors[task.priority] ?? PriorityColors.medium;
  const statusColor = StatusColors[task.status] ?? StatusColors.open;
  const dl = deadlineLabel(task.due_on);
  const isDone = task.status === 'done';

  const taskRef = `TASK-${String(task.id).padStart(4, '0')}`;

  return (
    <TouchableOpacity style={s.card} onPress={onPress} activeOpacity={0.8}>
      {/* Left accent bar colored by status */}
      <View style={[s.accent, { backgroundColor: statusColor.text }]} />

      <View style={s.body}>
        {/* Top row: task ref + deadline label */}
        <View style={s.topRow}>
          <Text style={s.taskRef}>{taskRef}</Text>
          {dl && (
            <Text style={[s.dlLabel, { color: dl.color }]}>{dl.text}</Text>
          )}
        </View>

        {/* Title */}
        <Text style={[s.title, isDone && s.titleDone]} numberOfLines={2}>
          {task.title}
        </Text>

        {/* Meta row: area · assignee */}
        {(task.area_name || task.assignee_name) && (
          <View style={s.metaRow}>
            {task.area_name && (
              <View style={s.metaItem}>
                <Ionicons name="grid-outline" size={11} color={colors.gray400} />
                <Text style={s.metaText}>{task.area_name}</Text>
              </View>
            )}
            {task.assignee_name && (
              <View style={s.metaItem}>
                <Ionicons name="person-outline" size={11} color={colors.gray400} />
                <Text style={s.metaText}>{task.assignee_name}</Text>
              </View>
            )}
            {task.due_on && (
              <View style={s.metaItem}>
                <Ionicons name="calendar-outline" size={11} color={colors.gray400} />
                <Text style={s.metaText}>{task.due_on}</Text>
              </View>
            )}
            {(task.total_logged_minutes != null) && (
              <View style={s.metaItem}>
                <Ionicons name="time-outline" size={11} color={colors.gray400} />
                <Text style={s.metaText}>
                  {formatDuration(task.total_logged_minutes)}
                  {task.estimated_minutes ? `/${formatDuration(task.estimated_minutes)}` : ''}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Badges row */}
        <View style={s.badgesRow}>
          <View style={[s.badge, { backgroundColor: statusColor.bg }]}>
            <Text style={[s.badgeText, { color: statusColor.text }]}>
              {STATUS_LABELS[task.status] ?? task.status}
            </Text>
          </View>
          <View style={[s.badge, { backgroundColor: priorityColor.bg }]}>
            <Text style={[s.badgeText, { color: priorityColor.text }]}>
              {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
            </Text>
          </View>
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
      marginBottom: 10,
      borderWidth: 1,
      borderColor: c.border,
      flexDirection: 'row',
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 3,
      elevation: 2,
    },
    accent: { width: 4, flexShrink: 0 },
    body: { flex: 1, padding: 12, paddingLeft: 10 },
    topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
    taskRef: { fontSize: 10, fontWeight: '700', color: c.textMuted, letterSpacing: 0.5 },
    dlLabel: { fontSize: 11, fontWeight: '700' },
    title: { fontSize: 14, fontWeight: '600', color: c.textPrimary, lineHeight: 20, marginBottom: 6 },
    titleDone: { color: c.textMuted, textDecorationLine: 'line-through' },
    metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
    metaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    metaText: { fontSize: 11, color: c.gray500 },
    badgesRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
    badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
    badgeText: { fontSize: 11, fontWeight: '700' },
  });
}
