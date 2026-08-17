import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, Alert, RefreshControl, ActivityIndicator,
  KeyboardAvoidingView, Platform, Modal, FlatList,
} from 'react-native';
import { useRoute, RouteProp, useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useApi } from '../../hooks/useApi';
import { StatusColors, PriorityColors, AppColors } from '../../utils/colors';
import { useTheme } from '../../contexts/ThemeContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { formatDate, formatRelative, formatDuration, formatDurationSeconds, formatTimerDisplay, formatLogEntry, capitalize } from '../../utils/format';
import { TasksStackParamList } from '../../navigation/types';
import ScreenHeader from '../../components/common/ScreenHeader';
import Badge from '../../components/common/Badge';
import CommentItem from '../../components/tasks/CommentItem';
import ChecklistItem from '../../components/tasks/ChecklistItem';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import LoadError from '../../components/common/LoadError';
import { useLoadWithTimeout } from '../../hooks/useLoadWithTimeout';
import Avatar from '../../components/common/Avatar';
import { stripNonContentElements, stripTags } from '../../utils/postContent';
import UserProfileModal, { ProfileUser } from '../../components/common/UserProfileModal';
import AttachmentChips from '../../components/common/AttachmentChips';
import AttachmentList from '../../components/common/AttachmentList';
import DatePickerField from '../../components/common/DatePickerField';
import TimePickerField from '../../components/common/TimePickerField';
import { showAlert } from '../../components/common/AlertModal';
import { pickAttachmentFiles, uploadAttachments, PickedFile } from '../../utils/attachments';

type Route = RouteProp<TasksStackParamList, 'TaskDetail'>;
type Nav = NativeStackNavigationProp<TasksStackParamList, 'TaskDetail'>;
type TabName = 'details' | 'comments' | 'checklist' | 'timelogs' | 'timeline';

const STATUSES = [
  { value: 'open', label: 'Not started' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'done', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const STATUS_LABELS: Record<string, string> = {
  open: 'Not started',
  in_progress: 'In progress',
  blocked: 'Blocked',
  done: 'Completed',
  cancelled: 'Cancelled',
};

function resolveMemberName(members: any[], id: string | number | undefined): string {
  if (!id) return '';
  const numId = Number(id);
  const m = members.find(mb => (mb.user_id ?? mb.id) === numId);
  if (!m) return '';
  return m.name ?? (`${m.first_name ?? ''} ${m.last_name ?? ''}`.trim() || m.email || '');
}

function formatTimelineEvent(event: any, members: any[]): string {
  const { event_type } = event;
  const meta = typeof event.meta === 'string'
    ? (() => { try { return JSON.parse(event.meta); } catch { return {}; } })()
    : (event.meta ?? {});
  switch (event_type) {
    case 'created': return 'Task created';
    case 'status_changed': {
      const oldVal = meta?.old_status ?? event.old_value ?? '';
      const newVal = meta?.new_status ?? event.new_value ?? '';
      const oldLabel = STATUS_LABELS[oldVal] ?? (oldVal ? oldVal.replace(/_/g, ' ') : '—');
      const newLabel = STATUS_LABELS[newVal] ?? (newVal ? newVal.replace(/_/g, ' ') : '—');
      return `Status changed: ${oldLabel} → ${newLabel}`;
    }
    case 'assignee_changed': {
      const oldName = meta?.old_assignee_name ?? event.old_assignee_name
        ?? resolveMemberName(members, event.old_value) ?? '';
      const newName = meta?.new_assignee_name ?? event.new_assignee_name
        ?? resolveMemberName(members, event.new_value) ?? '';
      if (oldName && newName) return `Assignee changed: ${oldName} → ${newName}`;
      if (newName) return `Assigned to ${newName}`;
      if (oldName) return `Assignee removed (was ${oldName})`;
      return 'Assignee changed';
    }
    case 'deadline_changed': {
      const d = meta?.new_deadline ?? event.new_value ?? '';
      return d ? `Deadline set to ${d}` : 'Deadline removed';
    }
    case 'checklist_item_added': return `Checklist item added: "${event.new_value ?? meta?.text ?? ''}"`;
    case 'checklist_item_checked': return `Completed: "${event.note ?? meta?.text ?? ''}"`;
    case 'checklist_item_unchecked': return `Unchecked: "${event.note ?? meta?.text ?? ''}"`;
    case 'checklist_item_edited': return `Checklist item edited: "${event.old_value ?? ''}" → "${event.new_value ?? ''}"`;
    case 'checklist_item_deleted': return `Removed checklist item: "${event.old_value ?? meta?.text ?? ''}"`;
    case 'estimated_time_set': {
      const mins = meta?.estimated_minutes ?? Number(event.new_value) ?? 0;
      return mins ? `Estimated time set to ${Math.round(mins / 60 * 10) / 10}h` : 'Estimated time set';
    }
    default: return (event_type ?? 'Unknown event').replace(/_/g, ' ');
  }
}

// Matches qa-production/frontend TimeLogsPanel.jsx's calcDuration/MAX_LOG_MINUTES —
// entries longer than 2 hrs are rejected server-side too (task_time_logs.js).
const MAX_LOG_MINUTES = 120;

function timeToMinutes(t: string) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function calcRangeMinutes(start: string, end: string) {
  let mins = timeToMinutes(end) - timeToMinutes(start);
  if (mins <= 0) mins += 24 * 60; // overnight
  return mins;
}

export default function TaskDetailScreen() {
  const route = useRoute<Route>();
  const navigation = useNavigation<Nav>();
  const { taskId, appId } = route.params;
  const api = useApi();
  const { workspace } = useWorkspace();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();

  const [task, setTask] = useState<any>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [checklist, setChecklist] = useState<any[]>([]);
  const [timeLogs, setTimeLogs] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [profileUser, setProfileUser] = useState<ProfileUser | null>(null);
  const [meId, setMeId] = useState<number | null>(null);
  const { loading, loadError, run } = useLoadWithTimeout();
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<TabName>('details');
  const [commentText, setCommentText] = useState('');
  const [pendingCommentFiles, setPendingCommentFiles] = useState<PickedFile[]>([]);
  const [uploadingCommentFiles, setUploadingCommentFiles] = useState(false);
  const [checklistText, setChecklistText] = useState('');
  const [liveSeconds, setLiveSeconds] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scrollRef = useRef<any>(null);
  const [saving, setSaving] = useState(false);
  const [statusModal, setStatusModal] = useState(false);
  const [assigneeModal, setAssigneeModal] = useState(false);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);

  // Manual time-log entry (Time tab "+ Add") — mirrors web's TimeLogsPanel
  const [showAddTimeLog, setShowAddTimeLog] = useState(false);
  const [tlMode, setTlMode] = useState<'range' | 'manual'>('range');
  const [tlStart, setTlStart] = useState('09:00');
  const [tlEnd, setTlEnd] = useState('17:00');
  const [tlMinutes, setTlMinutes] = useState('');
  const [tlLoggedOn, setTlLoggedOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [tlNotes, setTlNotes] = useState('');
  const [tlPosting, setTlPosting] = useState(false);
  const [tlError, setTlError] = useState<string | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ x: 0, y: 0, animated: false });
  }, [activeTab]);

  const timerRunning = !!task?.timer_started_at;
  const timerPaused = !task?.timer_started_at && (task?.timer_accumulated_s ?? 0) > 0;
  const timerActive = timerRunning || timerPaused;

  useEffect(() => {
    if (!timerRunning) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setLiveSeconds(timerPaused ? (task?.timer_accumulated_s ?? 0) : 0);
      return;
    }
    const accumulated = task?.timer_accumulated_s ?? 0;
    const startMs = new Date(task.timer_started_at!).getTime();
    const tick = () => setLiveSeconds(accumulated + Math.max(0, Math.floor((Date.now() - startMs) / 1000)));
    tick();
    intervalRef.current = setInterval(tick, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timerRunning, task?.timer_started_at, task?.timer_accumulated_s]);

  const load = useCallback(async () => {
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
  }, [taskId, appId, api]);

  // A plain useEffect(load) here alongside useFocusEffect(load) below used to
  // both fire on initial mount (a freshly-pushed screen is immediately
  // focused), double-fetching all 6 endpoints below on every task open. Now
  // there's a single load path; hasLoadedRef decides whether refocusing
  // (e.g. coming back from Group Info) shows the full-screen spinner again.
  const hasLoadedRef = useRef(false);
  useFocusEffect(useCallback(() => {
    run(load, hasLoadedRef.current);
    hasLoadedRef.current = true;
  }, [load, run]));

  const onRefresh = async () => {
    setRefreshing(true);
    await run(load, true);
    setRefreshing(false);
  };

  useEffect(() => {
    if (activeTab === 'timeline' && timeline.length === 0 && task) {
      setTimelineLoading(true);
      api.tasks.getTimeline(appId, taskId)
        .then((r: any) => setTimeline(r.data?.items ?? r.data ?? []))
        .catch(() => {})
        .finally(() => setTimelineLoading(false));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const getCommentAuthorName = (c: any) => {
    if (c.author_name) return c.author_name;
    if (c.user?.first_name || c.user?.last_name) return `${c.user.first_name ?? ''} ${c.user.last_name ?? ''}`.trim();
    if (c.user?.email) return c.user.email;
    const uid = c.author_user_id ?? c.author_id ?? c.user_id;
    const m = members.find((mb) => (mb.user_id ?? mb.id) === uid);
    return m ? (m.name ?? (`${m.first_name ?? ''} ${m.last_name ?? ''}`.trim() || m.email)) : 'Team Member';
  };

  const getCommentAuthorPhoto = (c: any): string | null => {
    if (c.author_photo_url) return c.author_photo_url;
    if (c.user?.photo_url) return c.user.photo_url;
    const uid = c.author_user_id ?? c.author_id ?? c.user_id;
    const m = members.find((mb) => (mb.user_id ?? mb.id) === uid);
    return m?.photo_url ?? null;
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

  const pickCommentFiles = async () => {
    try {
      const files = await pickAttachmentFiles();
      if (files.length) setPendingCommentFiles((prev) => [...prev, ...files]);
    } catch {
      showAlert('Error', 'Could not pick file.');
    }
  };

  const removePendingCommentFile = (i: number) =>
    setPendingCommentFiles((prev) => prev.filter((_, idx) => idx !== i));

  const postComment = async () => {
    if (!commentText.trim() && pendingCommentFiles.length === 0) return;
    setSaving(true);
    try {
      let attachments: Record<string, unknown>[] = [];
      if (pendingCommentFiles.length > 0) {
        setUploadingCommentFiles(true);
        attachments = await uploadAttachments(api, appId, 'task_comment', pendingCommentFiles);
        setUploadingCommentFiles(false);
      }
      await api.tasks.addComment(appId, taskId, commentText.trim(), attachments);
      setCommentText('');
      setPendingCommentFiles([]);
      const r = await api.tasks.getComments(appId, taskId);
      setComments(r.data?.items ?? r.data?.comments ?? []);
    } catch {
      setUploadingCommentFiles(false);
      showAlert('Error', 'Could not post comment.');
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

  const editComment = async (commentId: number, newBody: string) => {
    try {
      const res = await api.tasks.updateComment(appId, taskId, commentId, newBody);
      const updated = res.data;
      setComments((prev) => prev.map((c) => (c.id === commentId ? { ...c, ...updated } : c)));
    } catch {
      showAlert('Error', 'Could not update comment.');
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

  const deleteChecklistItem = async (itemId: number) => {
    try {
      await api.tasks.deleteChecklistItem(appId, taskId, itemId);
      setChecklist((prev) => prev.filter((i) => i.id !== itemId));
    } catch {
      Alert.alert('Error', 'Could not delete item.');
    }
  };

  const handleStartTimer = async () => {
    try {
      await api.tasks.startTimer(appId, taskId);
      const startedAt = new Date().toISOString();
      setTask((prev: any) => {
        if (!prev) return prev;
        return { ...prev, timer_started_at: startedAt, ...(prev.status === 'open' ? { status: 'in_progress' } : {}) };
      });
      if (task?.status === 'open') {
        await api.tasks.update(appId, taskId, { status: 'in_progress' });
      }
    } catch {
      Alert.alert('Error', 'Could not start timer.');
    }
  };

  const handlePauseTimer = async () => {
    try {
      const accumulated = (task?.timer_accumulated_s ?? 0) + liveSeconds;
      await api.tasks.pauseTimer(appId, taskId);
      setTask((prev: any) => prev
        ? { ...prev, timer_started_at: null, timer_accumulated_s: accumulated }
        : prev
      );
    } catch {
      Alert.alert('Error', 'Could not pause timer.');
    }
  };

  const handleStopTimer = async () => {
    try {
      await api.tasks.stopTimer(appId, taskId);
      setTask((prev: any) => prev
        ? { ...prev, timer_started_at: null, timer_accumulated_s: 0 }
        : prev
      );
      const tl = await api.tasks.getTimeLogs(appId, taskId);
      setTimeLogs(tl.data?.items ?? tl.data?.logs ?? []);
    } catch {
      Alert.alert('Error', 'Could not stop timer.');
    }
  };

  const resetTimeLogForm = () => {
    setTlMode('range');
    setTlStart('09:00');
    setTlEnd('17:00');
    setTlMinutes('');
    setTlLoggedOn(new Date().toISOString().slice(0, 10));
    setTlNotes('');
    setTlError(null);
  };

  const cancelAddTimeLog = () => {
    setShowAddTimeLog(false);
    resetTimeLogForm();
  };

  const addTimeLogEntry = async () => {
    if (!tlNotes.trim()) { setTlError('Note is required'); return; }
    let body: Record<string, unknown>;
    if (tlMode === 'range') {
      const mins = calcRangeMinutes(tlStart, tlEnd);
      if (mins > MAX_LOG_MINUTES) {
        setTlError('Cannot log more than 2 hrs at once. Log 2 hrs max per entry.');
        return;
      }
      body = { start_time: tlStart, end_time: tlEnd, logged_on: tlLoggedOn, notes: tlNotes.trim() };
    } else {
      const m = Number(tlMinutes);
      if (!Number.isFinite(m) || m <= 0) { setTlError('Enter minutes (e.g. 5)'); return; }
      if (m > MAX_LOG_MINUTES) {
        setTlError('Cannot log more than 2 hrs (120 min) at once.');
        return;
      }
      body = { duration_minutes: Math.round(m), logged_on: tlLoggedOn, notes: tlNotes.trim() };
    }
    setTlPosting(true);
    setTlError(null);
    try {
      await api.tasks.addTimeLog(appId, taskId, body);
      const tl = await api.tasks.getTimeLogs(appId, taskId);
      setTimeLogs(tl.data?.items ?? tl.data?.logs ?? []);
      setShowAddTimeLog(false);
      resetTimeLogForm();
    } catch (err: any) {
      setTlError(err?.response?.data?.error || 'Could not log time.');
    } finally {
      setTlPosting(false);
    }
  };

  const deleteTimeLogEntry = (logId: number) => {
    showAlert('Delete Time Log', 'Delete this time log entry?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            await api.tasks.deleteTimeLog(appId, taskId, logId);
            setTimeLogs((prev) => prev.filter((l) => l.id !== logId));
          } catch {
            showAlert('Error', 'Could not delete time log.');
          }
        },
      },
    ]);
  };

  if (loading) return <LoadingSpinner />;
  if (loadError) return <LoadError onRetry={() => run(load)} />;
  if (!task) return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ paddingTop: insets.top }}>
        <ScreenHeader title="Task" showBack />
      </View>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: colors.textSecondary }}>Task could not be loaded.</Text>
      </View>
    </View>
  );

  const isAdmin = workspace?.role === 'super_admin' || workspace?.role === 'admin';
  const isCreator = task.created_by_user_id === meId;
  const isAssignee = task.assigned_to_user_id === meId;
  const canEdit = isCreator || isAssignee || isAdmin;
  const canControlTimer = isAssignee;

  const statusColor = StatusColors[task.status] ?? StatusColors.open;
  const priorityColor = PriorityColors[task.priority] ?? PriorityColors.medium;

  const checklistDone = checklist.filter((i) => !!i.is_done).length;
  const checklistTotal = checklist.length;
  const checklistPct = checklistTotal === 0 ? 0 : Math.round((checklistDone / checklistTotal) * 100);

  const timeLogsTotalMinutes = timeLogs.reduce((sum, l) => sum + (Number(l.duration_minutes) || 0), 0);
  // Include the current timer session (running or paused-but-not-yet-logged)
  // so this stays accurate in real time, not just after "Stop & Log" commits it.
  const liveTimerMinutes = timerActive ? Math.floor(liveSeconds / 60) : 0;
  const loggedMinutes = timeLogsTotalMinutes + liveTimerMinutes;
  const estimatedMinutes = Number(task.estimated_minutes) || 0;
  const isOverBudget = estimatedMinutes > 0 && loggedMinutes > estimatedMinutes;
  const isNearBudget = estimatedMinutes > 0 && !isOverBudget && loggedMinutes >= estimatedMinutes * 0.8;
  const timeSummaryColor = isOverBudget ? colors.danger : isNearBudget ? colors.warning : colors.textMuted;
  const tlRangePreview = tlMode === 'range' ? calcRangeMinutes(tlStart, tlEnd) : null;

  const assigneeMember = task.assigned_to_user_id
    ? members.find((m) => (m.user_id ?? m.id) === task.assigned_to_user_id)
    : null;
  const assigneeName = task.assignee_name
    ?? (assigneeMember
      ? (assigneeMember.name ?? `${assigneeMember.first_name ?? ''} ${assigneeMember.last_name ?? ''}`.trim())
      : null);

  const creatorMember = task.created_by_user_id
    ? members.find((m) => (m.user_id ?? m.id) === task.created_by_user_id)
    : null;
  const creatorName = task.created_by_name
    ?? (creatorMember
      ? (creatorMember.name ?? `${creatorMember.first_name ?? ''} ${creatorMember.last_name ?? ''}`.trim())
      : null);

  const TABS: { key: TabName; label: string; count?: number }[] = [
    { key: 'details', label: 'Details' },
    { key: 'comments', label: 'Comments', count: comments.length },
    { key: 'checklist', label: `Checklist${checklistTotal > 0 ? ` ${checklistDone}/${checklistTotal}` : ''}` },
    { key: 'timelogs', label: 'Time', count: timeLogs.length },
    { key: 'timeline', label: 'Timeline' },
  ];

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <View style={[s.container, { paddingTop: insets.top }]}>
      <ScreenHeader
        title={task.title}
        showBack
        right={canEdit ? (
          <TouchableOpacity onPress={() => navigation.navigate('CreateTask', { appId, taskId })}>
            <Ionicons name="create-outline" size={22} color={colors.primary} />
          </TouchableOpacity>
        ) : undefined}
      />

      {/* Badges row — status is display-only here; use the Status button below to change it */}
      <View style={s.badges}>
        <Badge label={STATUSES.find(s => s.value === task.status)?.label ?? capitalize(task.status)} bg={statusColor.bg} color={statusColor.text} />
        <Badge label={capitalize(task.priority)} bg={priorityColor.bg} color={priorityColor.text} />
        {task.due_on && (
          <View style={s.dueBadge}>
            <Ionicons name="calendar-outline" size={12} color={colors.gray400} />
            <Text style={s.dueText}>{formatDate(task.due_on)}</Text>
          </View>
        )}
        {(loggedMinutes > 0 || estimatedMinutes > 0) && (
          <View style={s.timeSummary}>
            <Ionicons name="time-outline" size={13} color={timeSummaryColor} />
            <Text style={[s.timeSummaryText, { color: timeSummaryColor }]}>
              {formatDuration(loggedMinutes)}{estimatedMinutes > 0 ? ` / ${formatDuration(estimatedMinutes)}` : ''}
            </Text>
          </View>
        )}
      </View>

      {/* Action bar: timer */}
      <View style={s.actionBar}>
        {timerActive && (
          <Text style={s.clockText}>{formatTimerDisplay(liveSeconds)}</Text>
        )}
        {!timerActive && (
          <TouchableOpacity
            onPress={handleStartTimer}
            style={[s.timerBtn, !canControlTimer && s.timerBtnBlurred]}
            disabled={!canControlTimer}
          >
            <Ionicons name="play-circle-outline" size={18} color={colors.primary} />
            <Text style={s.timerText}>Start</Text>
          </TouchableOpacity>
        )}
        {timerRunning && (
          <TouchableOpacity
            onPress={handlePauseTimer}
            style={[s.timerBtn, !canControlTimer && s.timerBtnBlurred]}
            disabled={!canControlTimer}
          >
            <Ionicons name="pause-circle-outline" size={18} color={colors.primary} />
            <Text style={s.timerText}>Pause</Text>
          </TouchableOpacity>
        )}
        {timerPaused && (
          <TouchableOpacity
            onPress={handleStartTimer}
            style={[s.timerBtn, !canControlTimer && s.timerBtnBlurred]}
            disabled={!canControlTimer}
          >
            <Ionicons name="play-circle-outline" size={18} color={colors.primary} />
            <Text style={s.timerText}>Resume</Text>
          </TouchableOpacity>
        )}
        {timerActive && (
          <TouchableOpacity
            onPress={handleStopTimer}
            style={[s.timerBtn, s.timerActive, !canControlTimer && s.timerBtnBlurred]}
            disabled={!canControlTimer}
          >
            <Ionicons name="stop-circle-outline" size={18} color={colors.danger} />
            <Text style={[s.timerText, { color: colors.danger }]}>Stop & Log</Text>
          </TouchableOpacity>
        )}
        {canEdit && (
          <TouchableOpacity style={s.statusBtn} onPress={() => setStatusModal(true)}>
            <Ionicons name="swap-horizontal-outline" size={15} color={colors.primary} />
            <Text style={s.statusBtnText}>Status</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={[s.tabsScroll, s.tabs]}>
        {TABS.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[s.tab, activeTab === tab.key && s.tabActive]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Text style={[s.tabText, activeTab === tab.key && s.tabTextActive]} numberOfLines={1}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {activeTab === 'details' && (
          <View>
            {(task.description || task.description_attachments?.length > 0) ? (
              <View style={s.section}>
                <Text style={s.sectionTitle}>Description</Text>
                {!!task.description && <Text style={s.description}>{stripTags(stripNonContentElements(task.description))}</Text>}
                {task.description_attachments?.length > 0 && (
                  // View-only here — deleting a description attachment is an edit
                  // action, so it only lives on the Edit screen (CreateTaskScreen).
                  <AttachmentList attachments={task.description_attachments} />
                )}
              </View>
            ) : null}
            <View style={s.section}>
              <Text style={s.sectionTitle}>Info</Text>
              <View style={s.infoGrid}>
                {task.created_at && <InfoRow icon="time-outline" label="Created" value={formatRelative(task.created_at)} colors={colors} s={s} />}
                {creatorName && <InfoRow icon="person-circle-outline" label="Created By" value={creatorName} colors={colors} s={s} />}
                {task.due_on && <InfoRow icon="calendar-outline" label="Due" value={formatDate(task.due_on)} colors={colors} s={s} />}
                {task.project_name && <InfoRow icon="folder-open-outline" label="Project" value={task.project_name} colors={colors} s={s} />}
                {task.milestone_title && <InfoRow icon="flag-outline" label="Milestone" value={task.milestone_title} colors={colors} s={s} />}
              </View>
            </View>
            {/* Assignee section */}
            <View style={s.section}>
              <Text style={s.sectionTitle}>Assignee</Text>
              <TouchableOpacity style={s.assigneeRow} onPress={() => canEdit && setAssigneeModal(true)}>
                {assigneeName ? (
                  <>
                    <Avatar
                      name={assigneeName}
                      photoUrl={assigneeMember?.photo_url}
                      size={28}
                      onPress={() => setProfileUser({
                        id: task.assigned_to_user_id,
                        name: assigneeName,
                        photoUrl: assigneeMember?.photo_url,
                        email: assigneeMember?.email,
                      })}
                    />
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
                comment={{ ...c, author_name: getCommentAuthorName(c), author_photo_url: getCommentAuthorPhoto(c) }}
                canDelete={meId !== null && (c.author_user_id === meId || c.author_id === meId)}
                onDelete={() => deleteComment(c.id)}
                canEdit={meId !== null && (c.author_user_id === meId || c.author_id === meId)}
                onEdit={(newBody) => editComment(c.id, newBody)}
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
            <View style={s.tlHeader}>
              <Text style={s.tlHeaderText}>
                {timeLogsTotalMinutes > 0 ? `${formatDuration(timeLogsTotalMinutes)} total` : 'No time logged yet'}
              </Text>
              {!showAddTimeLog && (
                <TouchableOpacity onPress={() => setShowAddTimeLog(true)} style={s.tlAddBtn} hitSlop={8}>
                  <Ionicons name="add" size={16} color={colors.primary} />
                  <Text style={s.tlAddBtnText}>Add</Text>
                </TouchableOpacity>
              )}
            </View>

            {showAddTimeLog && (
              <View style={s.tlForm}>
                <View style={s.tlModeTabs}>
                  <TouchableOpacity
                    style={[s.tlModeTab, tlMode === 'range' && s.tlModeTabActive]}
                    onPress={() => setTlMode('range')}
                  >
                    <Text style={[s.tlModeTabText, tlMode === 'range' && s.tlModeTabTextActive]}>Start→End</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.tlModeTab, tlMode === 'manual' && s.tlModeTabActive]}
                    onPress={() => setTlMode('manual')}
                  >
                    <Text style={[s.tlModeTabText, tlMode === 'manual' && s.tlModeTabTextActive]}>Minutes</Text>
                  </TouchableOpacity>
                </View>

                {tlMode === 'range' ? (
                  <>
                    <View style={s.tlRow}>
                      <View style={{ flex: 1 }}>
                        <TimePickerField label="Start" value={tlStart} onChange={setTlStart} />
                      </View>
                      <Text style={s.tlArrow}>→</Text>
                      <View style={{ flex: 1 }}>
                        <TimePickerField label="End" value={tlEnd} onChange={setTlEnd} />
                      </View>
                    </View>
                    <View style={s.tlRow}>
                      <View style={{ flex: 1 }}>
                        <DatePickerField label="Date" value={tlLoggedOn} onChange={setTlLoggedOn} maxDate={new Date()} containerStyle={{ marginBottom: 0 }} />
                      </View>
                      {tlRangePreview != null && (
                        <Text style={s.tlPreview}>{formatDuration(tlRangePreview)}</Text>
                      )}
                    </View>
                  </>
                ) : (
                  <View style={s.tlRow}>
                    <TextInput
                      style={[s.tlInput, { flex: 1 }]}
                      placeholder="Minutes (e.g. 5)"
                      placeholderTextColor={colors.gray400}
                      keyboardType="number-pad"
                      value={tlMinutes}
                      onChangeText={setTlMinutes}
                    />
                    <View style={{ flex: 1 }}>
                      <DatePickerField value={tlLoggedOn} onChange={setTlLoggedOn} maxDate={new Date()} containerStyle={{ marginBottom: 0 }} />
                    </View>
                  </View>
                )}

                <TextInput
                  style={s.tlInput}
                  placeholder="Note *"
                  placeholderTextColor={colors.gray400}
                  value={tlNotes}
                  onChangeText={setTlNotes}
                  maxLength={500}
                />

                {!!tlError && <Text style={s.tlErrorText}>{tlError}</Text>}

                <View style={s.tlFormActions}>
                  <TouchableOpacity style={s.tlCancelBtn} onPress={cancelAddTimeLog} disabled={tlPosting}>
                    <Text style={s.tlCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.tlLogBtn, (tlPosting || (tlMode === 'manual' && !tlMinutes)) && { opacity: 0.5 }]}
                    onPress={addTimeLogEntry}
                    disabled={tlPosting || (tlMode === 'manual' && !tlMinutes)}
                  >
                    {tlPosting ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.tlLogText}>Log</Text>}
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {timeLogs.map((log) => {
              const canDeleteLog = log.user_id === meId || isAdmin;
              const logUserName = log.user_id === meId
                ? 'You'
                : (log.user_name || resolveMemberName(members, log.user_id) || 'Team Member');
              return (
                <View key={log.id} style={s.logRow}>
                  <View style={s.logMain}>
                    <View style={s.logTopRow}>
                      <Text style={s.logUser}>{logUserName}</Text>
                      <Text style={s.logDur}>{log.duration_seconds ? formatDurationSeconds(log.duration_seconds) : formatDuration(log.duration_minutes)}</Text>
                    </View>
                    <Text style={s.logDate}>
                      {formatLogEntry(log.created_at) || formatDate(log.logged_on)}
                      {log.start_time && log.end_time ? `  ·  ${log.start_time}–${log.end_time}` : ''}
                    </Text>
                    {!!log.notes && <Text style={s.logNotes} numberOfLines={2}>"{log.notes}"</Text>}
                  </View>
                  {canDeleteLog && (
                    <TouchableOpacity onPress={() => deleteTimeLogEntry(log.id)} hitSlop={8} style={s.logDeleteBtn}>
                      <Ionicons name="trash-outline" size={15} color={colors.danger} />
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
            {timeLogs.length === 0 && !showAddTimeLog && <Text style={s.empty}>No time logged yet.</Text>}
          </View>
        )}

        {activeTab === 'timeline' && (
          <View>
            {timelineLoading ? (
              <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
            ) : timeline.length === 0 ? (
              <Text style={s.empty}>No timeline events yet.</Text>
            ) : (
              [...timeline]
              .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
              .map((event, idx, arr) => (
                <View key={event.id ?? idx} style={s.timelineRow}>
                  <View style={s.timelineDotCol}>
                    <View style={s.timelineDot} />
                    {idx < arr.length - 1 && <View style={s.timelineLine} />}
                  </View>
                  <View style={s.timelineContent}>
                    <Text style={s.timelineLabel}>{formatTimelineEvent(event, members)}</Text>
                    <Text style={s.timelineTime}>{formatRelative(event.created_at)}</Text>
                    {event.actor_name && <Text style={s.timelineActor}>by {event.actor_name}</Text>}
                  </View>
                </View>
              ))
            )}
          </View>
        )}
      </ScrollView>

      {activeTab === 'comments' && (
        <>
          <AttachmentChips files={pendingCommentFiles} onRemove={removePendingCommentFile} uploading={uploadingCommentFiles} containerStyle={{ paddingHorizontal: 16, paddingBottom: 8 }} />
          {/* No insets.bottom here — this screen renders inside the tab navigator,
              whose own tabBarStyle already reserves the device's bottom safe area
              below it, so adding it again just left a dead gap above the tab bar. */}
          <View style={[s.inputBar, { paddingBottom: 8 }]}>
            <TouchableOpacity onPress={pickCommentFiles} style={s.attachBtn} disabled={uploadingCommentFiles}>
              <Ionicons name="attach" size={20} color={colors.gray400} />
            </TouchableOpacity>
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
        </>
      )}
      {activeTab === 'checklist' && (
        <View style={[s.inputBar, { paddingBottom: 8 }]}>
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
                    <Avatar name={name} photoUrl={m.photo_url} size={28} />
                    <Text style={[s.modalOptionText, isActive && { color: colors.primary, fontWeight: '700' }]} numberOfLines={1}>
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
      <UserProfileModal user={profileUser} onClose={() => setProfileUser(null)} />
    </View>
    </KeyboardAvoidingView>
  );
}

function InfoRow({ icon, label, value, colors, s }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; colors: AppColors; s: ReturnType<typeof makeStyles> }) {
  return (
    <View style={s.infoRow}>
      <Ionicons name={icon} size={14} color={colors.gray400} />
      <Text style={s.infoLabel} numberOfLines={1}>{label}:</Text>
      <Text style={s.infoValue} numberOfLines={1}>{value}</Text>
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
    timerBtnBlurred: { opacity: 0.35 },
    timerText: { fontSize: 13, fontWeight: '600', color: c.primary },
    timeSummary: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    timeSummaryText: { fontSize: 12, fontWeight: '800', fontVariant: ['tabular-nums'] as any },
    statusBtn: {
      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
      paddingVertical: 9, borderRadius: 10, borderWidth: 1.5, borderColor: c.primary,
    },
    statusBtnText: { fontSize: 13, fontWeight: '600', color: c.primary },
    tabsScroll: { backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border },
    tabs: { flexDirection: 'row' },
    tab: { flex: 1, paddingVertical: 12, paddingHorizontal: 2, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
    tabActive: { borderBottomColor: c.primary },
    tabText: { fontSize: 11, fontWeight: '500', color: c.gray500 },
    tabTextActive: { color: c.primary, fontWeight: '700' },
    content: { padding: 16, paddingBottom: 100 },
    section: { marginBottom: 20 },
    sectionTitle: { fontSize: 13, fontWeight: '700', color: c.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
    description: { fontSize: 14, color: c.gray700, lineHeight: 22 },
    infoGrid: { gap: 8 },
    infoRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    infoLabel: { fontSize: 13, color: c.gray500, width: 98, flexShrink: 0 },
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
    logRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.border },
    logMain: { flex: 1 },
    logTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
    logUser: { fontSize: 13, fontWeight: '600', color: c.textPrimary },
    logDur: { fontSize: 13, fontWeight: '700', color: c.primary },
    logDate: { fontSize: 11, color: c.gray400 },
    logNotes: { fontSize: 11, color: c.textMuted, fontStyle: 'italic', marginTop: 3 },
    logDeleteBtn: { padding: 2, marginTop: 2 },

    // Time-log "+ Add" form
    tlHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
    tlHeaderText: { fontSize: 13, fontWeight: '600', color: c.textSecondary },
    tlAddBtn: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    tlAddBtnText: { fontSize: 13, fontWeight: '700', color: c.primary },
    tlForm: {
      backgroundColor: c.gray50, borderRadius: 12, padding: 12, marginBottom: 14,
      borderWidth: 1, borderColor: c.border, gap: 10,
    },
    tlModeTabs: { flexDirection: 'row', gap: 8 },
    tlModeTab: { flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 8, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border },
    tlModeTabActive: { backgroundColor: c.primary, borderColor: c.primary },
    tlModeTabText: { fontSize: 12, fontWeight: '600', color: c.textSecondary },
    tlModeTabTextActive: { color: '#fff' },
    tlRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    tlArrow: { fontSize: 14, color: c.gray400, marginTop: 24 },
    tlPreview: { fontSize: 13, fontWeight: '700', color: c.primary, marginLeft: 4 },
    tlInput: {
      backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: 8,
      paddingHorizontal: 10, paddingVertical: 9, fontSize: 13, color: c.textPrimary,
    },
    tlErrorText: { fontSize: 12, color: c.danger },
    tlFormActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
    tlCancelBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: c.gray100 },
    tlCancelText: { fontSize: 12, fontWeight: '600', color: c.textSecondary },
    tlLogBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, backgroundColor: c.primary, minWidth: 60, alignItems: 'center' },
    tlLogText: { fontSize: 12, fontWeight: '700', color: '#fff' },
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
    attachBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
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
    modalOptionText: { fontSize: 15, color: c.textPrimary, flex: 1 },
    statusDot: { width: 10, height: 10, borderRadius: 5 },
    // Timeline
    timelineRow: { flexDirection: 'row', marginBottom: 16 },
    timelineDotCol: { width: 24, alignItems: 'center', marginRight: 12 },
    timelineDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: c.primary, marginTop: 3 },
    timelineLine: { flex: 1, width: 2, backgroundColor: c.border, marginTop: 4 },
    timelineContent: { flex: 1, paddingBottom: 8 },
    timelineLabel: { fontSize: 13, color: c.textPrimary, fontWeight: '500' },
    timelineTime: { fontSize: 11, color: c.gray400, marginTop: 2 },
    timelineActor: { fontSize: 11, color: c.gray500, marginTop: 1 },
    // Edit modal
    editInput: {
      borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14,
    },
    editInputMulti: { minHeight: 100, textAlignVertical: 'top' },
    editActions: { flexDirection: 'row', gap: 12, marginTop: 20 },
    editCancel: {
      flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1.5,
      borderColor: c.border, alignItems: 'center',
    },
    editCancelText: { fontSize: 14, fontWeight: '600', color: c.textSecondary },
    editSave: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: c.primary, alignItems: 'center' },
    editSaveText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  });
}
