import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, Alert, RefreshControl, ActivityIndicator,
  KeyboardAvoidingView, Platform, Modal, FlatList,
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
import Avatar from '../../components/common/Avatar';

type Route = RouteProp<TasksStackParamList, 'TaskDetail'>;
type TabName = 'details' | 'comments' | 'checklist' | 'timelogs';

const STATUSES = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'done', label: 'Done' },
  { value: 'cancelled', label: 'Cancelled' },
];

function decodeHtml(str: string) {
  return str
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

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
  const [members, setMembers] = useState<any[]>([]);
  const [meId, setMeId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<TabName>('details');
  const [commentText, setCommentText] = useState('');
  const [checklistText, setChecklistText] = useState('');
  const [timerActive, setTimerActive] = useState(false);
  const [liveSeconds, setLiveSeconds] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [saving, setSaving] = useState(false);
  const [statusModal, setStatusModal] = useState(false);
  const [assigneeModal, setAssigneeModal] = useState(false);

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
      const [t, c, cl, tl, me, mbrs] = await Promise.all([
        api.tasks.get(appId, taskId),
        api.tasks.getComments(appId, taskId),
        api.tasks.getChecklist(appId, taskId),
        api.tasks.getTimeLogs(appId, taskId),
        api.me.getProfile(),
        api.workspace.getMembers(appId),
      ]);
      setTask(t.data.task ?? t.data);
      setComments(c.data?.items ?? c.data?.comments ?? []);
      setChecklist(cl.data.items ?? []);
      setTimeLogs(tl.data?.items ?? tl.data?.logs ?? []);
      setMeId(me.data?.id ?? me.data?.user?.id ?? null);
      setMembers(mbrs.data?.members ?? mbrs.data?.items ?? mbrs.data ?? []);
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

  const changeStatus = async (status: string) => {
    setStatusModal(false);
    try {
      await api.tasks.update(appId, taskId, { status });
      setTask((prev: any) => prev ? { ...prev, status } : prev);
    } catch {
      Alert.alert('Error', 'Could not update status.');
    }
  };

  const changeAssignee = async (userId: number | null) => {
    setAssigneeModal(false);
    try {
      await api.tasks.update(appId, taskId, { assigned_to_user_id: userId });
      const member = members.find((m) => m.user_id === userId || m.id === userId);
      const name = member ? (member.name ?? `${member.first_name ?? ''} ${member.last_name ?? ''}`.trim()) : null;
      setTask((prev: any) => prev ? { ...prev, assigned_to_user_id: userId, assignee_name: name } : prev);
    } catch {
      Alert.alert('Error', 'Could not update assignee.');
    }
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

  const deleteComment = async (commentId: number) => {
    Alert.alert('Delete Comment', 'Delete this comment?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            await api.tasks.deleteComment(appId, taskId, commentId);
            setComments((prev) => prev.filter((c) => c.id !== commentId));
          } catch {
            Alert.alert('Error', 'Could not delete comment.');
          }
        },
      },
    ]);
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

  const deleteChecklistItem = async (itemId: number) => {
    try {
      await api.tasks.deleteChecklistItem(appId, taskId, itemId);
      setChecklist((prev) => prev.filter((i) => i.id !== itemId));
    } catch {
      Alert.alert('Error', 'Could not delete item.');
    }
  };

  const toggleTimer = async () => {
    try {
      if (timerActive) {
        await api.tasks.stopTimer(appId, taskId);
        setTimerActive(false);
        setTask((prev: any) => prev ? { ...prev, timer_started_at: null } : prev);
        const tl = await api.tasks.getTimeLogs(appId, taskId);
        setTimeLogs(tl.data?.items ?? tl.data?.logs ?? []);
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

  const checklistDone = checklist.filter((i) => !!i.is_done).length;
  const checklistTotal = checklist.length;
  const checklistPct = checklistTotal === 0 ? 0 : Math.round((checklistDone / checklistTotal) * 100);

  const assigneeMember = task.assigned_to_user_id
    ? members.find((m) => (m.user_id ?? m.id) === task.assigned_to_user_id)
    : null;
  const assigneeName = task.assignee_name
    ?? (assigneeMember
      ? (assigneeMember.name ?? `${assigneeMember.first_name ?? ''} ${assigneeMember.last_name ?? ''}`.trim())
      : null);

  const TABS: { key: TabName; label: string; count?: number }[] = [
    { key: 'details', label: 'Details' },
    { key: 'comments', label: 'Comments', count: comments.length },
    { key: 'checklist', label: `Checklist${checklistTotal > 0 ? ` ${checklistDone}/${checklistTotal}` : ''}` },
    { key: 'timelogs', label: 'Time', count: timeLogs.length },
  ];

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <View style={[s.container, { paddingTop: insets.top }]}>
      <ScreenHeader title={task.title} showBack />

      {/* Badges row — tap status to change */}
      <View style={s.badges}>
        <TouchableOpacity onPress={() => setStatusModal(true)}>
          <Badge label={capitalize(task.status)} bg={statusColor.bg} color={statusColor.text} />
        </TouchableOpacity>
        <Badge label={capitalize(task.priority)} bg={priorityColor.bg} color={priorityColor.text} />
        {task.due_on && (
          <View style={s.dueBadge}>
            <Ionicons name="calendar-outline" size={12} color={colors.gray400} />
            <Text style={s.dueText}>{formatDate(task.due_on)}</Text>
          </View>
        )}
      </View>

      {/* Action bar: timer */}
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
        <TouchableOpacity style={s.statusBtn} onPress={() => setStatusModal(true)}>
          <Ionicons name="swap-horizontal-outline" size={15} color={colors.primary} />
          <Text style={s.statusBtnText}>Status</Text>
        </TouchableOpacity>
      </View>

      <View style={s.tabs}>
        {TABS.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[s.tab, activeTab === tab.key && s.tabActive]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Text style={[s.tabText, activeTab === tab.key && s.tabTextActive]}>
              {tab.label}
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
                <Text style={s.description}>{decodeHtml(task.description)}</Text>
              </View>
            ) : null}
            <View style={s.section}>
              <Text style={s.sectionTitle}>Info</Text>
              <View style={s.infoGrid}>
                {task.created_at && <InfoRow icon="time-outline" label="Created" value={formatRelative(task.created_at)} colors={colors} s={s} />}
                {task.due_on && <InfoRow icon="calendar-outline" label="Due" value={formatDate(task.due_on)} colors={colors} s={s} />}
              </View>
            </View>
            {/* Assignee section */}
            <View style={s.section}>
              <Text style={s.sectionTitle}>Assignee</Text>
              <TouchableOpacity style={s.assigneeRow} onPress={() => setAssigneeModal(true)}>
                {assigneeName ? (
                  <>
                    <Avatar name={assigneeName} size={28} />
                    <Text style={s.assigneeName}>{assigneeName}</Text>
                  </>
                ) : (
                  <Text style={s.assigneeUnset}>Tap to assign</Text>
                )}
                <Ionicons name="chevron-forward" size={16} color={colors.gray400} style={{ marginLeft: 'auto' }} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {activeTab === 'comments' && (
          <View>
            {comments.map((c) => (
              <CommentItem
                key={c.id}
                comment={{ ...c, author_name: c.author_name ?? 'Team Member' }}
                canDelete={meId !== null && (c.author_user_id === meId || c.author_id === meId)}
                onDelete={() => deleteComment(c.id)}
              />
            ))}
            {comments.length === 0 && (
              <Text style={s.empty}>No comments yet. Be the first!</Text>
            )}
          </View>
        )}

        {activeTab === 'checklist' && (
          <View>
            {/* Progress bar */}
            {checklistTotal > 0 && (
              <View style={s.progressBlock}>
                <View style={s.progressHeader}>
                  <Text style={s.progressLabel}>
                    {checklistDone}/{checklistTotal} completed
                  </Text>
                  <Text style={[s.progressPct, checklistDone === checklistTotal && { color: colors.success }]}>
                    {checklistPct}%
                  </Text>
                </View>
                <View style={s.progressBar}>
                  <View
                    style={[
                      s.progressFill,
                      { width: `${checklistPct}%` as any },
                      checklistDone === checklistTotal && { backgroundColor: colors.success },
                    ]}
                  />
                </View>
              </View>
            )}
            {checklist.map((item) => (
              <ChecklistItem
                key={item.id}
                item={item}
                onToggle={() => toggleCheck(item.id, !!item.is_done)}
                onDelete={() => deleteChecklistItem(item.id)}
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

      {/* Status picker modal */}
      <Modal visible={statusModal} transparent animationType="slide" onRequestClose={() => setStatusModal(false)}>
        <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setStatusModal(false)}>
          <View style={[s.modalSheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={s.modalHandle} />
            <Text style={s.modalTitle}>Change Status</Text>
            {STATUSES.map((st) => {
              const sc = StatusColors[st.value] ?? StatusColors.open;
              const isActive = task.status === st.value;
              return (
                <TouchableOpacity
                  key={st.value}
                  style={[s.modalOption, isActive && s.modalOptionActive]}
                  onPress={() => changeStatus(st.value)}
                >
                  <View style={[s.statusDot, { backgroundColor: sc.text }]} />
                  <Text style={[s.modalOptionText, isActive && { color: colors.primary, fontWeight: '700' }]}>
                    {st.label}
                  </Text>
                  {isActive && <Ionicons name="checkmark" size={18} color={colors.primary} style={{ marginLeft: 'auto' }} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Assignee picker modal */}
      <Modal visible={assigneeModal} transparent animationType="slide" onRequestClose={() => setAssigneeModal(false)}>
        <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setAssigneeModal(false)}>
          <View style={[s.modalSheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={s.modalHandle} />
            <Text style={s.modalTitle}>Assign To</Text>
            <TouchableOpacity
              style={s.modalOption}
              onPress={() => changeAssignee(null)}
            >
              <Ionicons name="person-remove-outline" size={18} color={colors.gray400} />
              <Text style={[s.modalOptionText, { color: colors.gray500 }]}>Unassign</Text>
            </TouchableOpacity>
            <FlatList
              data={members}
              keyExtractor={(m) => String(m.user_id ?? m.id)}
              scrollEnabled={false}
              renderItem={({ item: m }) => {
                const uid = m.user_id ?? m.id;
                const name = m.name ?? `${m.first_name ?? ''} ${m.last_name ?? ''}`.trim();
                const isActive = task.assigned_to_user_id === uid;
                return (
                  <TouchableOpacity
                    style={[s.modalOption, isActive && s.modalOptionActive]}
                    onPress={() => changeAssignee(uid)}
                  >
                    <Avatar name={name} size={28} />
                    <Text style={[s.modalOptionText, isActive && { color: colors.primary, fontWeight: '700' }]}>
                      {name}
                    </Text>
                    {isActive && <Ionicons name="checkmark" size={18} color={colors.primary} style={{ marginLeft: 'auto' }} />}
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </TouchableOpacity>
      </Modal>
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
    statusBtn: {
      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
      paddingVertical: 9, borderRadius: 10, borderWidth: 1.5, borderColor: c.primary,
    },
    statusBtnText: { fontSize: 13, fontWeight: '600', color: c.primary },
    tabs: { flexDirection: 'row', backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border },
    tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
    tabActive: { borderBottomWidth: 2, borderBottomColor: c.primary },
    tabText: { fontSize: 11, fontWeight: '500', color: c.gray500 },
    tabTextActive: { color: c.primary, fontWeight: '700' },
    content: { padding: 16, paddingBottom: 100 },
    section: { marginBottom: 20 },
    sectionTitle: { fontSize: 13, fontWeight: '700', color: c.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
    description: { fontSize: 14, color: c.gray700, lineHeight: 22 },
    infoGrid: { gap: 8 },
    infoRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    infoLabel: { fontSize: 13, color: c.gray500, width: 60 },
    infoValue: { fontSize: 13, color: c.textPrimary, flex: 1 },
    assigneeRow: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      backgroundColor: c.gray50, borderRadius: 10, padding: 12,
      borderWidth: 1, borderColor: c.border,
    },
    assigneeName: { fontSize: 14, color: c.textPrimary, fontWeight: '600' },
    assigneeUnset: { fontSize: 14, color: c.gray400 },
    progressBlock: { marginBottom: 14 },
    progressHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
    progressLabel: { fontSize: 13, fontWeight: '600', color: c.textSecondary },
    progressPct: { fontSize: 13, fontWeight: '700', color: c.primary },
    progressBar: { height: 6, backgroundColor: c.gray100, borderRadius: 3, overflow: 'hidden' },
    progressFill: { height: '100%', backgroundColor: c.primary, borderRadius: 3 },
    empty: { fontSize: 14, color: c.gray400, textAlign: 'center', marginTop: 40 },
    logRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.border },
    logUser: { flex: 1, fontSize: 13, color: c.textPrimary },
    logDur: { fontSize: 13, fontWeight: '700', color: c.primary },
    logDate: { fontSize: 12, color: c.gray400 },
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
    // Modals
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
    modalSheet: {
      backgroundColor: c.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20,
      padding: 20, paddingTop: 12,
    },
    modalHandle: { width: 40, height: 4, backgroundColor: c.gray200, borderRadius: 2, alignSelf: 'center', marginBottom: 14 },
    modalTitle: { fontSize: 16, fontWeight: '700', color: c.textPrimary, marginBottom: 12 },
    modalOption: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingVertical: 12, paddingHorizontal: 8, borderRadius: 10,
    },
    modalOptionActive: { backgroundColor: c.primaryLight },
    modalOptionText: { fontSize: 15, color: c.textPrimary },
    statusDot: { width: 10, height: 10, borderRadius: 5 },
  });
}
