import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useApi } from '../../hooks/useApi';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useTheme } from '../../contexts/ThemeContext';
import { AppColors } from '../../utils/colors';
import LoadingSpinner from '../../components/common/LoadingSpinner';

type ViewMode = 'list' | 'hours';

interface Task {
  id: number;
  title: string;
  description?: string;
  status: string;
  priority?: string;
  deadline?: string;
  created_at?: string;
  assigned_to_user_id?: number;
  created_by_user_id?: number;
  assignee_name?: string;
  creator_name?: string;
  comments_count?: number;
  total_minutes?: number;
}

function getMonthRange(year: number, month: number) {
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { start: fmt(start), end: fmt(end) };
}

function formatMinutes(mins?: number) {
  if (!mins) return '—';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const STATUS_BG: Record<string, string> = {
  todo: '#f3f4f6', in_progress: '#e8f0fe', in_review: '#fdf6b2',
  done: '#def7ec', blocked: '#fde8e8',
};
const STATUS_TEXT: Record<string, string> = {
  todo: '#374151', in_progress: '#1a56db', in_review: '#c27803',
  done: '#0e9f6e', blocked: '#e02424',
};
const statusBg = (status: string) => STATUS_BG[status] ?? '#f3f4f6';
const statusColor = (status: string) => STATUS_TEXT[status] ?? '#374151';

export default function TaskReportsScreen() {
  const api = useApi();
  const { workspace } = useWorkspace();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  const [tasks, setTasks] = useState<Task[]>([]);
  const [meId, setMeId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!workspace) return;
    try {
      const [meRes, tasksRes] = await Promise.all([
        api.me.getProfile(),
        api.tasks.list(workspace.id),
      ]);
      const myId = meRes.data?.id ?? meRes.data?.user?.id ?? null;
      setMeId(myId);
      setTasks(Array.isArray(tasksRes.data) ? tasksRes.data : (tasksRes.data?.items ?? []));
    } catch {}
  }, [workspace]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const { start, end } = getMonthRange(year, month);

  const filtered = tasks.filter((t) => {
    if (meId !== null) {
      const isMyTask = t.assigned_to_user_id === meId || t.created_by_user_id === meId;
      if (!isMyTask) return false;
    }
    const createdAt = t.created_at ? t.created_at.slice(0, 10) : null;
    if (createdAt && (createdAt < start || createdAt > end)) return false;
    return true;
  });

  const shiftMonth = (delta: number) => {
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  };

  if (loading) return <LoadingSpinner />;

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.title}>Task Reports</Text>
        <View style={{ width: 22 }} />
      </View>

      <View style={s.monthPicker}>
        <TouchableOpacity onPress={() => shiftMonth(-1)} hitSlop={8}>
          <Ionicons name="chevron-back" size={20} color={colors.primary} />
        </TouchableOpacity>
        <Text style={s.monthLabel}>{MONTH_NAMES[month]} {year}</Text>
        <TouchableOpacity
          onPress={() => shiftMonth(1)}
          hitSlop={8}
          disabled={year === now.getFullYear() && month === now.getMonth()}
        >
          <Ionicons
            name="chevron-forward"
            size={20}
            color={year === now.getFullYear() && month === now.getMonth() ? colors.gray300 : colors.primary}
          />
        </TouchableOpacity>
      </View>

      <View style={s.toggleRow}>
        <TouchableOpacity
          style={[s.toggleBtn, viewMode === 'list' && s.toggleBtnActive]}
          onPress={() => setViewMode('list')}
        >
          <Text style={[s.toggleText, viewMode === 'list' && s.toggleTextActive]}>Task List</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.toggleBtn, viewMode === 'hours' && s.toggleBtnActive]}
          onPress={() => setViewMode('hours')}
        >
          <Text style={[s.toggleText, viewMode === 'hours' && s.toggleTextActive]}>Task Hours</Text>
        </TouchableOpacity>
      </View>

      <View style={s.summaryBar}>
        <Text style={s.summaryText}>{filtered.length} task{filtered.length !== 1 ? 's' : ''}</Text>
        {viewMode === 'hours' && (
          <Text style={s.summaryText}>
            Total: {formatMinutes(filtered.reduce((acc, t) => acc + (t.total_minutes ?? 0), 0))}
          </Text>
        )}
      </View>

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {filtered.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="document-text-outline" size={40} color={colors.gray300} />
            <Text style={s.emptyText}>No tasks for {MONTH_NAMES[month]} {year}</Text>
          </View>
        ) : (
          filtered.map((task) => (
            <View key={task.id} style={s.taskCard}>
              <View style={s.taskHeader}>
                <Text style={s.taskId}>#{task.id}</Text>
                <View style={[s.statusBadge, { backgroundColor: statusBg(task.status) }]}>
                  <Text style={[s.statusText, { color: statusColor(task.status) }]}>
                    {task.status.replace(/_/g, ' ')}
                  </Text>
                </View>
              </View>
              <Text style={s.taskTitle} numberOfLines={2}>{task.title}</Text>
              {task.description ? (
                <Text style={s.taskDesc} numberOfLines={1}>{task.description}</Text>
              ) : null}
              <View style={s.taskMeta}>
                {task.deadline && (
                  <Text style={s.metaItem}>
                    <Ionicons name="calendar-outline" size={11} color={colors.gray500} /> {task.deadline.slice(0, 10)}
                  </Text>
                )}
                {task.assignee_name && (
                  <Text style={s.metaItem}>
                    <Ionicons name="person-outline" size={11} color={colors.gray500} /> {task.assignee_name}
                  </Text>
                )}
                {task.comments_count != null && task.comments_count > 0 && (
                  <Text style={s.metaItem}>
                    <Ionicons name="chatbubble-outline" size={11} color={colors.gray500} /> {task.comments_count}
                  </Text>
                )}
                {viewMode === 'hours' && (
                  <Text style={[s.metaItem, s.hoursChip]}>
                    <Ionicons name="time-outline" size={11} color={colors.info} /> {formatMinutes(task.total_minutes)}
                  </Text>
                )}
              </View>
            </View>
          ))
        )}
        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

function makeStyles(c: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    header: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      backgroundColor: c.surface, paddingHorizontal: 20, paddingVertical: 14,
      borderBottomWidth: 1, borderBottomColor: c.border,
    },
    title: { fontSize: 18, fontWeight: '700', color: c.textPrimary },
    monthPicker: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      gap: 16, backgroundColor: c.surface, paddingVertical: 12,
      borderBottomWidth: 1, borderBottomColor: c.border,
    },
    monthLabel: { fontSize: 15, fontWeight: '700', color: c.textPrimary, minWidth: 80, textAlign: 'center' },
    toggleRow: {
      flexDirection: 'row', backgroundColor: c.surface,
      paddingHorizontal: 16, paddingVertical: 8, gap: 8,
      borderBottomWidth: 1, borderBottomColor: c.border,
    },
    toggleBtn: {
      flex: 1, paddingVertical: 8, borderRadius: 8,
      alignItems: 'center', backgroundColor: c.gray100,
    },
    toggleBtnActive: { backgroundColor: c.primary },
    toggleText: { fontSize: 13, fontWeight: '600', color: c.textSecondary },
    toggleTextActive: { color: '#ffffff' },
    summaryBar: {
      flexDirection: 'row', justifyContent: 'space-between',
      paddingHorizontal: 16, paddingVertical: 8,
      backgroundColor: c.gray50, borderBottomWidth: 1, borderBottomColor: c.border,
    },
    summaryText: { fontSize: 12, fontWeight: '600', color: c.textSecondary },
    taskCard: {
      backgroundColor: c.surface, marginHorizontal: 12, marginTop: 10, borderRadius: 12, padding: 14,
      borderWidth: 1, borderColor: c.border,
      shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 2,
    },
    taskHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
    taskId: { fontSize: 12, color: c.textMuted, fontWeight: '600' },
    statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
    statusText: { fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
    taskTitle: { fontSize: 14, fontWeight: '600', color: c.textPrimary, marginBottom: 4 },
    taskDesc: { fontSize: 12, color: c.textSecondary, marginBottom: 6 },
    taskMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
    metaItem: { fontSize: 11, color: c.gray500 },
    hoursChip: { color: c.info, fontWeight: '600' },
    empty: { alignItems: 'center', justifyContent: 'center', padding: 60, gap: 12 },
    emptyText: { fontSize: 14, color: c.textSecondary, textAlign: 'center' },
  });
}
