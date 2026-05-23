import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, Alert, RefreshControl, ActivityIndicator,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRoute, RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useApi } from '../../hooks/useApi';
import { StatusColors, PriorityColors, AppColors } from '../../utils/colors';
import { useTheme } from '../../contexts/ThemeContext';
import { formatDate, formatRelative, formatDuration, capitalize } from '../../utils/format';
import { TasksStackParamList } from '../../navigation/types';
import ScreenHeader from '../../components/common/ScreenHeader';
import Badge from '../../components/common/Badge';
import CommentItem from '../../components/tasks/CommentItem';
import ChecklistItem from '../../components/tasks/ChecklistItem';
import LoadingSpinner from '../../components/common/LoadingSpinner';

type Route = RouteProp<TasksStackParamList, 'TaskDetail'>;
type TabName = 'details' | 'comments' | 'checklist' | 'timelogs';

export default function TaskDetailScreen() {
  const route = useRoute<Route>();
  const { taskId, appId } = route.params;
  const api = useApi();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();

  const [task, setTask] = useState<any>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [checklist, setChecklist] = useState<any[]>([]);
  const [timeLogs, setTimeLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<TabName>('details');
  const [commentText, setCommentText] = useState('');
  const [checklistText, setChecklistText] = useState('');
  const [timerActive, setTimerActive] = useState(false);
  const [liveSeconds, setLiveSeconds] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!timerActive || !task?.timer_started_at) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setLiveSeconds(0);
      return;
    }
    const startMs = new Date(task.timer_started_at).getTime();
    const tick = () => setLiveSeconds(Math.max(0, Math.floor((Date.now() - startMs) / 1000)));
    tick();
    intervalRef.current = setInterval(tick, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [timerActive, task?.timer_started_at]);

  const load = useCallback(async () => {
    try {
      const [t, c, cl, tl] = await Promise.all([
        api.tasks.get(appId, taskId),
        api.tasks.getComments(appId, taskId),
        api.tasks.getChecklist(appId, taskId),
        api.tasks.getTimeLogs(appId, taskId),
      ]);
      setTask(t.data.task ?? t.data);
      setComments(c.data?.items ?? c.data?.comments ?? []);
      setChecklist(cl.data.items ?? []);
      setTimeLogs(tl.data?.items ?? tl.data?.logs ?? []);
      setTimerActive(!!(t.data.task ?? t.data).timer_started_at);
    } catch {}
  }, [taskId, appId]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const postComment = async () => {
    if (!commentText.trim()) return;
    setSaving(true);
    try {
      await api.tasks.addComment(appId, taskId, commentText.trim());
      setCommentText('');
      const r = await api.tasks.getComments(appId, taskId);
      setComments(r.data?.items ?? r.data?.comments ?? []);
    } catch {
      Alert.alert('Error', 'Could not post comment.');
    } finally {
      setSaving(false);
    }
  };

  const addChecklist = async () => {
    if (!checklistText.trim()) return;
    setSaving(true);
    try {
      await api.tasks.addChecklistItem(appId, taskId, checklistText.trim());
      setChecklistText('');
      const r = await api.tasks.getChecklist(appId, taskId);
      setChecklist(r.data.items ?? []);
    } catch {} finally { setSaving(false); }
  };

  const toggleCheck = async (itemId: number, checked: boolean) => {
    try {
      await api.tasks.toggleChecklistItem(appId, taskId, itemId, !checked);
      setChecklist((prev) => prev.map((i) => i.id === itemId ? { ...i, is_done: !checked ? 1 : 0 } : i));
    } catch {}
  };

  const markComplete = async () => {
    if (task.status === 'done') return;
    try {
      await api.tasks.update(appId, taskId, { status: 'done' });
      setTask((prev: any) => prev ? { ...prev, status: 'done' } : prev);
    } catch {
      Alert.alert('Error', 'Could not update task status.');
    }
  };

  const toggleTimer = async () => {
    try {
      if (timerActive) {
        await api.tasks.stopTimer(appId, taskId);
        setTimerActive(false);
        setTask((prev: any) => prev ? { ...prev, timer_started_at: null } : prev);
      } else {
        await api.tasks.startTimer(appId, taskId);
        const startedAt = new Date().toISOString();
        setTimerActive(true);
        setTask((prev: any) => prev ? { ...prev, timer_started_at: startedAt } : prev);
      }
    } catch {
      Alert.alert('Error', 'Could not update timer.');
    }
  };

  if (loading) return <LoadingSpinner />;
  if (!task) return null;

  const formatHMS = (sec: number) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const sec2 = sec % 60;
    return [h, m, sec2].map((n) => String(n).padStart(2, '0')).join(':');
  };

  const statusColor = StatusColors[task.status] ?? StatusColors.open;
  const priorityColor = PriorityColors[task.priority] ?? PriorityColors.medium;
  const TABS: { key: TabName; label: string; count?: number }[] = [
    { key: 'details', label: 'Details' },
    { key: 'comments', label: 'Comments', count: comments.length },
    { key: 'checklist', label: 'Checklist', count: checklist.length },
    { key: 'timelogs', label: 'Time', count: timeLogs.length },
  ];

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <View style={[s.container, { paddingTop: insets.top }]}>
      <ScreenHeader title={task.title} showBack />

      {/* Badges row */}
      <View style={s.badges}>
        <Badge label={capitalize(task.status)} bg={statusColor.bg} color={statusColor.text} />
        <Badge label={capitalize(task.priority)} bg={priorityColor.bg} color={priorityColor.text} />
        {task.due_on && (
          <View style={s.dueBadge}>
            <Ionicons name="calendar-outline" size={12} color={colors.gray400} />
            <Text style={s.dueText}>{formatDate(task.due_on)}</Text>
          </View>
        )}
      </View>

      {/* Action bar: timer + start/pause + mark complete — all one line */}
      <View style={s.actionBar}>
        {timerActive && (
          <Text style={s.clockText}>{formatHMS(liveSeconds)}</Text>
        )}
        <TouchableOpacity onPress={toggleTimer} style={[s.timerBtn, timerActive && s.timerActive]}>
          <Ionicons name={timerActive ? 'pause-circle-outline' : 'play-circle-outline'} size={18} color={timerActive ? colors.danger : colors.primary} />
          <Text style={[s.timerText, timerActive && { color: colors.danger }]}>
            {timerActive ? 'Pause' : 'Start'}
          </Text>
        </TouchableOpacity>
        {task.status !== 'done' && (
          <TouchableOpacity style={s.completeBtn} onPress={markComplete}>
            <Ionicons name="checkmark-circle-outline" size={16} color="#ffffff" />
            <Text style={s.completeBtnText}>Mark Complete</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={s.tabs}>
        {TABS.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[s.tab, activeTab === tab.key && s.tabActive]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Text style={[s.tabText, activeTab === tab.key && s.tabTextActive]}>
              {tab.label}{tab.count !== undefined ? ` (${tab.count})` : ''}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {activeTab === 'details' && (
          <View>
            {task.description ? (
              <View style={s.section}>
                <Text style={s.sectionTitle}>Description</Text>
                <Text style={s.description}>{task.description.replace(/<[^>]*>/g, '')}</Text>
              </View>
            ) : null}
            <View style={s.section}>
              <Text style={s.sectionTitle}>Info</Text>
              <View style={s.infoGrid}>
                {task.created_at && <InfoRow icon="time-outline" label="Created" value={formatRelative(task.created_at)} colors={colors} s={s} />}
                {task.due_on && <InfoRow icon="calendar-outline" label="Due" value={formatDate(task.due_on)} colors={colors} s={s} />}
              </View>
            </View>
          </View>
        )}

        {activeTab === 'comments' && (
          <View>
            {comments.map((c) => (
              <CommentItem
                key={c.id}
                comment={{ ...c, author_name: c.author_name ?? 'Team Member' }}
                canDelete={false}
                onDelete={() => {}}
              />
            ))}
            {comments.length === 0 && (
              <Text style={s.empty}>No comments yet. Be the first!</Text>
            )}
          </View>
        )}

        {activeTab === 'checklist' && (
          <View>
            {checklist.map((item) => (
              <ChecklistItem
                key={item.id}
                item={item}
                onToggle={() => toggleCheck(item.id, !!item.is_done)}
                onDelete={() => {}}
              />
            ))}
            {checklist.length === 0 && (
              <Text style={s.empty}>No checklist items yet.</Text>
            )}
          </View>
        )}

        {activeTab === 'timelogs' && (
          <View>
            {timeLogs.map((log) => (
              <View key={log.id} style={s.logRow}>
                <Ionicons name="time-outline" size={16} color={colors.primary} />
                <Text style={s.logUser}>{log.user_name ?? 'You'}</Text>
                <Text style={s.logDur}>{formatDuration(log.duration_minutes)}</Text>
                <Text style={s.logDate}>{formatDate(log.logged_on)}</Text>
              </View>
            ))}
            {timeLogs.length === 0 && <Text style={s.empty}>No time logged yet.</Text>}
          </View>
        )}
      </ScrollView>

      {activeTab === 'comments' && (
        <View style={[s.inputBar, { paddingBottom: insets.bottom + 8 }]}>
          <TextInput
            style={s.inputField}
            placeholder="Add a comment..."
            placeholderTextColor={colors.gray400}
            value={commentText}
            onChangeText={setCommentText}
            multiline
          />
          <TouchableOpacity onPress={postComment} style={s.sendBtn} disabled={saving}>
            {saving ? <ActivityIndicator size="small" color="#ffffff" /> : <Ionicons name="send" size={18} color="#ffffff" />}
          </TouchableOpacity>
        </View>
      )}
      {activeTab === 'checklist' && (
        <View style={[s.inputBar, { paddingBottom: insets.bottom + 8 }]}>
          <TextInput
            style={s.inputField}
            placeholder="Add checklist item..."
            placeholderTextColor={colors.gray400}
            value={checklistText}
            onChangeText={setChecklistText}
          />
          <TouchableOpacity onPress={addChecklist} style={s.sendBtn} disabled={saving}>
            {saving ? <ActivityIndicator size="small" color="#ffffff" /> : <Ionicons name="add" size={18} color="#ffffff" />}
          </TouchableOpacity>
        </View>
      )}
    </View>
    </KeyboardAvoidingView>
  );
}

function InfoRow({ icon, label, value, colors, s }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; colors: AppColors; s: ReturnType<typeof makeStyles> }) {
  return (
    <View style={s.infoRow}>
      <Ionicons name={icon} size={14} color={colors.gray400} />
      <Text style={s.infoLabel}>{label}:</Text>
      <Text style={s.infoValue}>{value}</Text>
    </View>
  );
}

function makeStyles(c: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    badges: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: c.surface, flexWrap: 'wrap', borderBottomWidth: 1, borderBottomColor: c.border },
    dueBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    dueText: { fontSize: 12, color: c.gray400 },
    actionBar: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      paddingHorizontal: 16, paddingVertical: 10,
      backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border,
    },
    clockText: { fontSize: 14, fontWeight: '800', color: c.danger, fontVariant: ['tabular-nums'] as any },
    timerBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, borderWidth: 1.5, borderColor: c.primary },
    timerActive: { borderColor: c.danger },
    timerText: { fontSize: 13, fontWeight: '600', color: c.primary },
    tabs: { flexDirection: 'row', backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border },
    tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
    tabActive: { borderBottomWidth: 2, borderBottomColor: c.primary },
    tabText: { fontSize: 12, fontWeight: '500', color: c.gray500 },
    tabTextActive: { color: c.primary, fontWeight: '700' },
    content: { padding: 16, paddingBottom: 100 },
    section: { marginBottom: 20 },
    sectionTitle: { fontSize: 13, fontWeight: '700', color: c.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
    description: { fontSize: 14, color: c.gray700, lineHeight: 22 },
    infoGrid: { gap: 8 },
    infoRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    infoLabel: { fontSize: 13, color: c.gray500, width: 60 },
    infoValue: { fontSize: 13, color: c.textPrimary, flex: 1 },
    empty: { fontSize: 14, color: c.gray400, textAlign: 'center', marginTop: 40 },
    logRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.border },
    logUser: { flex: 1, fontSize: 13, color: c.textPrimary },
    logDur: { fontSize: 13, fontWeight: '700', color: c.primary },
    logDate: { fontSize: 12, color: c.gray400 },
    completeBtn: {
      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
      backgroundColor: c.success, paddingVertical: 9, borderRadius: 10,
    },
    completeBtnText: { fontSize: 13, fontWeight: '700', color: '#ffffff' },
    inputBar: {
      flexDirection: 'row', alignItems: 'flex-end', gap: 10,
      backgroundColor: c.surface, paddingHorizontal: 16, paddingTop: 10,
      borderTopWidth: 1, borderTopColor: c.border,
    },
    inputField: {
      flex: 1, backgroundColor: c.gray50, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10,
      fontSize: 14, color: c.textPrimary, maxHeight: 80, borderWidth: 1, borderColor: c.border,
    },
    sendBtn: {
      width: 38, height: 38, borderRadius: 19, backgroundColor: c.primary,
      alignItems: 'center', justifyContent: 'center',
    },
  });
}
