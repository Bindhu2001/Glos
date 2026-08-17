import React, { useState, useMemo, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, ActivityIndicator, TextInput, KeyboardAvoidingView, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../contexts/ThemeContext';
import { useApi } from '../../hooks/useApi';
import { useHasTeam } from '../../contexts/HasTeamContext';
import { AppColors, StatusColors } from '../../utils/colors';
import { formatDuration } from '../../utils/format';
import { MoreStackParamList } from '../../navigation/types';
import { apiErrorMessage } from '../../utils/apiError';
import { showAlert } from '../../components/common/AlertModal';
import LoadError from '../../components/common/LoadError';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import DatePickerField from '../../components/common/DatePickerField';

type Nav = NativeStackNavigationProp<MoreStackParamList, 'ProjectDetail'>;
type Rt = RouteProp<MoreStackParamList, 'ProjectDetail'>;

export default function ProjectDetailScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Rt>();
  const { colors } = useTheme();
  const api = useApi();
  const { isAdmin } = useHasTeam();
  const insets = useSafeAreaInsets();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [project, setProject] = useState<any>(null);
  const [milestones, setMilestones] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [comments, setComments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newComment, setNewComment] = useState('');
  const [posting, setPosting] = useState(false);
  const [meId, setMeId] = useState<number | null>(null);
  const [addMsModal, setAddMsModal] = useState(false);
  const [msTitle, setMsTitle] = useState('');
  const [msStart, setMsStart] = useState('');
  const [msEnd, setMsEnd] = useState('');
  const [savingMs, setSavingMs] = useState(false);
  const [expandedMsId, setExpandedMsId] = useState<number | null>(null);

  const hasLoadedRef = useRef(false);

  const load = useCallback(async () => {
    if (!hasLoadedRef.current) setLoading(true);
    try {
      const [pRes, mRes, tRes, cRes, meRes, mbrRes] = await Promise.all([
        api.projects.get(params.appId, params.projectId),
        api.projects.listMilestones(params.appId, params.projectId),
        api.tasks.list(params.appId, { project_id: params.projectId }),
        api.projects.listComments(params.appId, params.projectId),
        api.me.getProfile(),
        api.members.list(params.appId).catch(() => ({ data: [] })),
      ]);
      setProject(pRes.data);
      setMilestones(mRes.data?.items ?? mRes.data ?? []);
      setTasks(tRes.data?.items ?? tRes.data ?? []);
      setComments(cRes.data?.items ?? cRes.data ?? []);
      setMeId(meRes.data?.id ?? meRes.data?.user?.id ?? null);
      setMembers(mbrRes.data?.items ?? mbrRes.data ?? []);
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not load this project.'));
    } finally {
      setLoading(false);
      hasLoadedRef.current = true;
    }
  }, [params.appId, params.projectId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const isOwnerOrAdmin = isAdmin || (meId != null && project?.owner_user_id === meId);

  const tasksByMilestone = useMemo(() => {
    const map = new Map<number, any[]>();
    for (const t of tasks) {
      if (t.milestone_id == null) continue;
      if (!map.has(t.milestone_id)) map.set(t.milestone_id, []);
      map.get(t.milestone_id)!.push(t);
    }
    return map;
  }, [tasks]);

  const memberName = (userId: number | null | undefined) => {
    if (userId == null) return 'Unassigned';
    const m = members.find((x) => (x.user_id ?? x.id) === userId);
    if (!m) return 'Unassigned';
    return m.name ?? (`${m.first_name ?? ''} ${m.last_name ?? ''}`.trim() || m.email || 'Unassigned');
  };

  const openTask = (taskId: number) => {
    try {
      navigation.getParent()?.navigate('TasksTab', {
        screen: 'TaskDetail',
        params: { taskId, appId: params.appId },
        initial: false,
      } as never);
    } catch {}
  };

  const toggleMilestone = async (m: any) => {
    if (!isOwnerOrAdmin) {
      showAlert('Not allowed', "You're not the project owner or admin.");
      return;
    }
    try {
      await api.projects.updateMilestone(params.appId, params.projectId, m.id, { is_completed: m.is_completed ? 0 : 1 });
      await load();
    } catch (err) {
      showAlert('Could not update milestone', apiErrorMessage(err));
    }
  };

  const deleteProject = () => {
    showAlert(
      'Delete Project',
      `Are you sure you want to delete "${project.name}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive', onPress: async () => {
            try {
              await api.projects.delete(params.appId, params.projectId);
              navigation.goBack();
            } catch (err) {
              showAlert('Could not delete project', apiErrorMessage(err));
            }
          },
        },
      ],
    );
  };

  const addMilestone = async () => {
    if (!msTitle.trim()) return showAlert('Validation', 'Milestone title is required.');
    setSavingMs(true);
    try {
      await api.projects.createMilestone(params.appId, params.projectId, {
        title: msTitle.trim(), start_date: msStart || undefined, end_date: msEnd || undefined,
      });
      setMsTitle(''); setMsStart(''); setMsEnd(''); setAddMsModal(false);
      await load();
    } catch (err) {
      showAlert('Could not add milestone', apiErrorMessage(err));
    } finally {
      setSavingMs(false);
    }
  };

  const postComment = async () => {
    if (!newComment.trim()) return;
    setPosting(true);
    try {
      await api.projects.createComment(params.appId, params.projectId, newComment.trim());
      setNewComment('');
      await load();
    } catch (err) {
      showAlert('Could not post comment', apiErrorMessage(err));
    } finally {
      setPosting(false);
    }
  };

  if (loading) return <View style={{ flex: 1, backgroundColor: colors.background }}><ActivityIndicator style={{ flex: 1 }} color={colors.primary} /></View>;
  if (error) return <LoadError message={error} onRetry={load} />;
  if (!project) return null;

  return (
    <KeyboardAvoidingView style={[s.container, { paddingTop: insets.top }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.title} numberOfLines={1}>{project.name}</Text>
        {isOwnerOrAdmin ? (
          <View style={s.headerActions}>
            <TouchableOpacity
              style={s.backBtn}
              onPress={() => navigation.navigate('CreateEditProject', { appId: params.appId, projectId: params.projectId })}
            >
              <Ionicons name="create-outline" size={20} color={colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity style={s.backBtn} onPress={deleteProject}>
              <Ionicons name="trash-outline" size={20} color={colors.danger} />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ width: 36 }} />
        )}
      </View>

      <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
        {project.client_name ? <Text style={s.client}>{project.client_name}</Text> : null}
        {project.description ? <Text style={s.desc}>{project.description}</Text> : null}

        <View style={s.statsRow}>
          <View style={s.statCell}>
            <Text style={s.statVal}>{project.done_tasks ?? 0}/{project.total_tasks ?? 0}</Text>
            <Text style={s.statLbl}>TASKS</Text>
          </View>
          <View style={s.statCell}>
            <Text style={s.statVal}>{project.completed_milestones ?? 0}/{project.total_milestones ?? 0}</Text>
            <Text style={s.statLbl}>MILESTONES</Text>
          </View>
          <View style={s.statCell}>
            <Text style={s.statVal}>{(project.computed_status ?? '—').replace('_', ' ')}</Text>
            <Text style={s.statLbl}>STATUS</Text>
          </View>
        </View>

        <View style={s.sectionHeadRow}>
          <Text style={s.sectionHead}>MILESTONES</Text>
          {isOwnerOrAdmin && (
            <TouchableOpacity onPress={() => setAddMsModal(true)}>
              <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
            </TouchableOpacity>
          )}
        </View>
        {milestones.length === 0 ? (
          <Text style={s.emptyText}>No milestones yet</Text>
        ) : (
          milestones.map((m) => {
            const msTasks = tasksByMilestone.get(m.id) ?? [];
            const isExpanded = expandedMsId === m.id;
            const today = new Date().toISOString().slice(0, 10);
            const isOverdue = !m.is_completed && m.end_date && m.end_date < today;
            return (
              <View key={m.id} style={s.msItemWrap}>
                {/* Row click expands to show tasks under this milestone (matches
                    web) — only the circle itself toggles completion, so it needs
                    its own nested touchable rather than sharing the row's onPress. */}
                <TouchableOpacity
                  style={s.msRow}
                  onPress={() => setExpandedMsId(isExpanded ? null : m.id)}
                  activeOpacity={0.7}
                >
                  <TouchableOpacity onPress={() => toggleMilestone(m)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons
                      name={m.is_completed ? 'checkmark-circle' : 'ellipse-outline'}
                      size={18}
                      color={m.is_completed ? colors.success : colors.gray400}
                    />
                  </TouchableOpacity>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.msTitle, m.is_completed && s.msTitleDone]}>{m.title}</Text>
                    {(m.start_date || m.end_date) ? (
                      <Text style={s.msDate}>
                        {m.start_date ? `Start: ${new Date(m.start_date).toLocaleDateString()}` : ''}
                        {m.start_date && m.end_date ? '  ·  ' : ''}
                        {m.end_date ? `End: ${new Date(m.end_date).toLocaleDateString()}` : ''}
                      </Text>
                    ) : null}
                  </View>
                  <Text style={s.msTaskCount}>{msTasks.length} task{msTasks.length === 1 ? '' : 's'}</Text>
                  {m.is_completed && (
                    <View style={[s.msBadge, { backgroundColor: colors.success + '20' }]}>
                      <Text style={[s.msBadgeText, { color: colors.success }]}>Done</Text>
                    </View>
                  )}
                  {isOverdue && (
                    <View style={[s.msBadge, { backgroundColor: colors.danger + '20' }]}>
                      <Text style={[s.msBadgeText, { color: colors.danger }]}>Overdue</Text>
                    </View>
                  )}
                  <Ionicons name={isExpanded ? 'chevron-down' : 'chevron-forward'} size={16} color={colors.gray400} />
                </TouchableOpacity>

                {isExpanded && (
                  <View style={s.msTasksBox}>
                    <Text style={s.msTasksLabel}>TASKS</Text>
                    {msTasks.length === 0 ? (
                      <Text style={s.emptyText}>No tasks assigned to this milestone.</Text>
                    ) : (
                      msTasks.map((t, ti) => {
                        const sc = StatusColors[t.status] ?? StatusColors.open;
                        return (
                          <TouchableOpacity key={t.id} style={s.msTaskRow} onPress={() => openTask(t.id)} activeOpacity={0.7}>
                            <Text style={s.msTaskSno}>{ti + 1}</Text>
                            <View style={{ flex: 1 }}>
                              <Text style={s.msTaskTitle} numberOfLines={1}>{t.title}</Text>
                              <Text style={s.msTaskAssignee}>{memberName(t.assigned_to_user_id)}</Text>
                            </View>
                            <View style={[s.msTaskStatus, { backgroundColor: sc.bg }]}>
                              <Text style={[s.msTaskStatusText, { color: sc.text }]}>{(t.status ?? '').replace(/_/g, ' ')}</Text>
                            </View>
                            {t.total_minutes > 0 && (
                              <Text style={s.msTaskLogged}>{formatDuration(t.total_minutes)}</Text>
                            )}
                            <Ionicons name="chevron-forward" size={14} color={colors.gray400} />
                          </TouchableOpacity>
                        );
                      })
                    )}
                  </View>
                )}
              </View>
            );
          })
        )}

        <Text style={s.sectionHead}>COMMENTS</Text>
        {comments.length === 0 ? (
          <Text style={s.emptyText}>No comments yet</Text>
        ) : (
          comments.map((c) => (
            <View key={c.id} style={s.commentRow}>
              <Text style={s.commentAuthor}>{[c.first_name, c.last_name].filter(Boolean).join(' ') || c.email || 'User'}</Text>
              <Text style={s.commentBody}>{c.content}</Text>
            </View>
          ))
        )}
      </ScrollView>

      {/* No insets.bottom — this screen sits inside the tab navigator, whose
          tabBarStyle already reserves the device's bottom safe area below it. */}
      <View style={[s.commentBar, { paddingBottom: 8 }]}>
        <TextInput
          style={s.commentInput}
          placeholder="Add a comment..."
          placeholderTextColor={colors.textMuted}
          value={newComment}
          onChangeText={setNewComment}
        />
        <TouchableOpacity style={s.sendBtn} onPress={postComment} disabled={posting}>
          <Ionicons name="send" size={16} color="#fff" />
        </TouchableOpacity>
      </View>

      <Modal visible={addMsModal} transparent animationType="fade" onRequestClose={() => setAddMsModal(false)}>
        {/* KeyboardAvoidingView so the title input isn't covered by the keyboard
            — Modal content sits outside the screen's own KeyboardAvoidingView
            (separate native root), so it needs its own here. */}
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.modalBackdrop}>
          <View style={s.modalCard}>
            <View style={s.modalHead}>
              <Text style={s.modalTitle}>Add Milestone</Text>
              <TouchableOpacity onPress={() => setAddMsModal(false)}>
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <Input label="Title *" value={msTitle} onChangeText={setMsTitle} placeholder="Milestone title" />
            <DatePickerField label="Start Date" value={msStart} onChange={setMsStart} />
            <DatePickerField label="End Date" value={msEnd} onChange={setMsEnd} />
            <Button label="Add Milestone" onPress={addMilestone} loading={savingMs} fullWidth />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function makeStyles(c: AppColors) {
  const SERIF = Platform.OS === 'ios' ? 'Georgia' : 'serif';
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 16, paddingVertical: 12, gap: 8,
      backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border,
    },
    backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    headerActions: { flexDirection: 'row' },
    title: { flex: 1, fontSize: 18, fontFamily: SERIF, color: c.textPrimary, fontWeight: '700', textAlign: 'center' },
    body: { padding: 16, paddingBottom: 32 },
    client: { fontSize: 13, color: c.primary, fontWeight: '700', marginBottom: 4 },
    desc: { fontSize: 13, color: c.textSecondary, marginBottom: 14 },
    statsRow: {
      flexDirection: 'row', backgroundColor: c.surface, borderRadius: 14,
      borderWidth: 1, borderColor: c.border, paddingVertical: 12, marginBottom: 16,
    },
    statCell: { flex: 1, alignItems: 'center' },
    statVal: { fontSize: 14, fontWeight: '800', color: c.textPrimary, textTransform: 'capitalize' },
    statLbl: { fontSize: 9, fontWeight: '700', color: c.textMuted, marginTop: 4, letterSpacing: 0.5 },
    sectionHead: { fontSize: 11, fontWeight: '700', color: c.textMuted, letterSpacing: 1, marginTop: 8, marginBottom: 10 },
    sectionHeadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
    modalCard: { backgroundColor: c.surface, borderRadius: 16, padding: 18 },
    modalHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
    modalTitle: { fontSize: 17, fontWeight: '800', color: c.textPrimary },
    emptyText: { fontSize: 13, color: c.textMuted, marginBottom: 12 },
    msItemWrap: { marginBottom: 12 },
    msRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    msTitle: { fontSize: 13, fontWeight: '600', color: c.textPrimary },
    msTitleDone: { color: c.textMuted, textDecorationLine: 'line-through' },
    msDate: { fontSize: 11, color: c.textMuted, marginTop: 2 },
    msTaskCount: { fontSize: 11, color: c.textMuted, flexShrink: 0 },
    msBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 99, flexShrink: 0 },
    msBadgeText: { fontSize: 10, fontWeight: '700' },
    msTasksBox: {
      borderWidth: 1, borderColor: c.border, borderTopWidth: 0, borderRadius: 10, borderTopLeftRadius: 0, borderTopRightRadius: 0,
      backgroundColor: c.gray50, padding: 10, marginTop: -8, gap: 6,
    },
    msTasksLabel: { fontSize: 10, fontWeight: '700', color: c.textMuted, letterSpacing: 0.5, marginBottom: 2 },
    msTaskRow: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: c.surface, borderRadius: 8, borderWidth: 1, borderColor: c.border,
      paddingVertical: 8, paddingHorizontal: 10,
    },
    msTaskSno: { fontSize: 10, fontWeight: '700', color: c.textMuted, minWidth: 14 },
    msTaskTitle: { fontSize: 12, fontWeight: '600', color: c.textPrimary },
    msTaskAssignee: { fontSize: 10, color: c.textMuted, marginTop: 1 },
    msTaskStatus: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 99, flexShrink: 0 },
    msTaskStatusText: { fontSize: 9, fontWeight: '700', textTransform: 'capitalize' },
    msTaskLogged: { fontSize: 10, color: c.textMuted, flexShrink: 0 },
    commentRow: { marginBottom: 12, backgroundColor: c.surface, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: c.border },
    commentAuthor: { fontSize: 12, fontWeight: '700', color: c.textPrimary, marginBottom: 2 },
    commentBody: { fontSize: 13, color: c.textSecondary },
    commentBar: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      paddingHorizontal: 16, paddingTop: 8,
      backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.border,
    },
    commentInput: {
      flex: 1, backgroundColor: c.background, borderRadius: 20, borderWidth: 1, borderColor: c.border,
      paddingHorizontal: 14, paddingVertical: 9, fontSize: 13, color: c.textPrimary,
    },
    sendBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' },
  });
}
