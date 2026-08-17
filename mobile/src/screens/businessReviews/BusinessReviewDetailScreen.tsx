import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, ActivityIndicator, Modal, KeyboardAvoidingView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../contexts/ThemeContext';
import { useApi } from '../../hooks/useApi';
import { useHasTeam } from '../../contexts/HasTeamContext';
import { AppColors } from '../../utils/colors';
import { MoreStackParamList } from '../../navigation/types';
import { apiErrorMessage } from '../../utils/apiError';
import { showAlert } from '../../components/common/AlertModal';
import LoadError from '../../components/common/LoadError';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import { formatDuration } from '../../utils/format';

// Matches the real task status values (TaskCard.tsx, TaskDetailScreen.tsx) —
// this previously used 'not_started' as a key, which never matched a task's
// actual 'open' status, so those tasks fell through to raw unformatted text.
const TASK_STATUS_LABEL: Record<string, string> = {
  open: 'Not Started', in_progress: 'In Progress',
  done: 'Completed', blocked: 'Blocked', cancelled: 'Cancelled',
};

// The manager's daily review verdict on a task — a different concept from the
// task's own lifecycle status above. Matches web's DAILY_TASK_STATUS_OPTS.
const DAILY_REVIEW_STATUS_OPTS: { value: string; label: string }[] = [
  { value: 'on_track', label: 'On Track' },
  { value: 'need_support', label: 'Need Support' },
];

type Nav = NativeStackNavigationProp<MoreStackParamList, 'BusinessReviewDetail'>;
type Rt = RouteProp<MoreStackParamList, 'BusinessReviewDetail'>;

const TYPE_LABELS: Record<string, string> = {
  daily: 'Daily Check-In',
  weekly: 'Weekly Review',
  monthly: 'Monthly Review',
  other: 'Custom Review',
};

function toHHMM(mins: number) {
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
}

// Backend GET /:id (routes/hr/business_reviews.js) returns
// { review, manager, reportees, attendees, assessments, actionItems, reporteeData, projects, routineCompletion }
// — NOT a flat review object, so this must be destructured accordingly.
export default function BusinessReviewDetailScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Rt>();
  const { colors } = useTheme();
  const api = useApi();
  const { isAdmin } = useHasTeam();
  const insets = useSafeAreaInsets();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [review, setReview] = useState<any>(null);
  const [manager, setManager] = useState<any>(null);
  const [actionItems, setActionItems] = useState<any[]>([]);
  const [reporteeData, setReporteeData] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [meId, setMeId] = useState<number | null>(null);
  const [collapsedMembers, setCollapsedMembers] = useState<Record<string, boolean>>({});
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [postingCommentUid, setPostingCommentUid] = useState<string | null>(null);

  // Daily-review-only state: the manager's per-task on-track/need-support
  // verdicts, the day's planner blocks (for Scheduled/Planned), and the
  // Remarks + "Complete Review" flow that saves both plus closes the review
  // in one action — matches web's DailyCheckinView exactly.
  const [taskStatuses, setTaskStatuses] = useState<Record<number, string>>({});
  const [remarks, setRemarks] = useState('');
  const [plannerBlocks, setPlannerBlocks] = useState<Record<string, { taskId: number; startMinutes: number; endMinutes: number }[]>>({});
  const [submittingDaily, setSubmittingDaily] = useState(false);

  // Weekly/Monthly-review-only state: the manager's per-employee assessment
  // (1–5 score + free-text comment) plus the same Remarks + "Complete Review"
  // flow as daily — matches web's WeeklyCheckinView/MonthlyReviewView "core"
  // flow (the per-employee Projects/Agreements/Feedback/Routines/Performance
  // drill-down sections and in-review Appreciation/Feedback shortcuts are a
  // separate, later pass — not part of completing a review).
  const [assessmentDrafts, setAssessmentDrafts] = useState<Record<string, { score: number | null; comment: string }>>({});
  const [savingMemberUid, setSavingMemberUid] = useState<string | null>(null);
  const [submittingPeriodic, setSubmittingPeriodic] = useState(false);

  const [closeModal, setCloseModal] = useState(false);
  const [summary, setSummary] = useState('');
  const [achievements, setAchievements] = useState('');
  const [keyRisks, setKeyRisks] = useState('');
  const [improvementPlans, setImprovementPlans] = useState('');
  const [closing, setClosing] = useState(false);

  const loadPlannerBlocks = useCallback((data: Record<string, any>, dateKey: string) => {
    Object.keys(data).forEach((uid) => {
      api.taskPlanner.getBlocks(params.appId, { user_id: uid, date: dateKey })
        .then((r: any) => setPlannerBlocks((prev) => ({ ...prev, [uid]: r.data ?? [] })))
        .catch(() => {});
    });
  }, [api, params.appId]);

  const load = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try {
      const [res, meRes] = await Promise.all([
        api.businessReviews.get(params.appId, params.reviewId),
        api.me.getProfile(),
      ]);
      const r = res.data?.review ?? null;
      const rd = res.data?.reporteeData ?? {};
      setReview(r);
      setManager(res.data?.manager ?? null);
      setActionItems(res.data?.actionItems ?? []);
      setReporteeData(rd);
      setMeId(meRes.data?.id ?? meRes.data?.user?.id ?? null);
      setRemarks(r?.meeting_notes ?? '');

      const saved: Record<number, string> = {};
      const drafts: Record<string, { score: number | null; comment: string }> = {};
      for (const [uid, member] of Object.entries(rd) as [string, any][]) {
        for (const t of member.tasks ?? []) {
          if (t.review_status) saved[t.id] = t.review_status;
        }
        const a = member.assessment;
        drafts[uid] = { score: a?.score != null ? Number(a.score) : null, comment: a?.comment ?? '' };
      }
      setTaskStatuses(saved);
      setAssessmentDrafts(drafts);

      if (r?.type === 'daily') {
        const dateKey = r.period_start || r.review_date;
        loadPlannerBlocks(rd, dateKey);
      }
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not load this review.'));
    } finally {
      setLoading(false);
    }
  }, [params.appId, params.reviewId, loadPlannerBlocks]);

  useEffect(() => { load(); }, [load]);

  const plannedMinsForTask = useCallback((taskId: number, uid: string) => {
    const dateKey = review?.period_start || review?.review_date;
    if (!dateKey) return 0;
    return (plannerBlocks[uid] ?? [])
      .filter((b) => String(b.taskId) === String(taskId))
      .reduce((sum, b) => sum + (b.endMinutes - b.startMinutes), 0);
  }, [plannerBlocks, review]);

  const scheduledSlotsForTask = useCallback((taskId: number, uid: string) => {
    return (plannerBlocks[uid] ?? [])
      .filter((b) => String(b.taskId) === String(taskId))
      .sort((a, b) => a.startMinutes - b.startMinutes)
      .map((b) => `${toHHMM(b.startMinutes)}–${toHHMM(b.endMinutes)}`);
  }, [plannerBlocks]);

  const canManage = isAdmin || (meId != null && review?.manager_user_id === meId);
  // Matches web's DailyCheckinView/WeeklyCheckinView/MonthlyReviewView
  // `editable` exactly: only the review's own owning manager can comment, set
  // a task's review status, save an assessment, or complete the review — no
  // admin override, unlike delete above — and only while the review is open.
  const editable = meId != null && review?.manager_user_id === meId && review?.status === 'open';

  const postComment = async (uid: string) => {
    const body = (commentDrafts[uid] ?? '').trim();
    if (!body) return;
    setPostingCommentUid(uid);
    try {
      await api.businessReviews.addMemberComment(params.appId, params.reviewId, uid, body);
      setCommentDrafts((prev) => ({ ...prev, [uid]: '' }));
      await load(true);
    } catch (err) {
      showAlert('Could not post comment', apiErrorMessage(err));
    } finally {
      setPostingCommentUid(null);
    }
  };

  const openTask = (taskId: number) => {
    (navigation as any).navigate('TasksTab', { screen: 'TaskDetail', params: { taskId, appId: params.appId }, initial: false });
  };

  const completeDailyReview = async () => {
    if (!remarks.trim()) {
      showAlert('Remarks required', 'Remarks are required to complete the review.');
      return;
    }
    setSubmittingDaily(true);
    try {
      const taskStatusArray = Object.entries(taskStatuses).map(([taskId, status]) => ({ task_id: Number(taskId), status }));
      await api.businessReviews.saveTaskStatuses(params.appId, params.reviewId, taskStatusArray);
      await api.businessReviews.update(params.appId, params.reviewId, { meeting_notes: remarks.trim() });
      await api.businessReviews.close(params.appId, params.reviewId, {});
      await load(true);
    } catch (err) {
      showAlert('Could not complete review', apiErrorMessage(err));
    } finally {
      setSubmittingDaily(false);
    }
  };

  const saveMemberAssessment = async (uid: string) => {
    setSavingMemberUid(uid);
    try {
      const d = assessmentDrafts[uid] ?? { score: null, comment: '' };
      await api.businessReviews.upsertAssessment(params.appId, params.reviewId, uid, { score: d.score, comment: d.comment });
    } catch (err) {
      showAlert('Could not save review', apiErrorMessage(err));
    } finally {
      setSavingMemberUid(null);
    }
  };

  const completePeriodicReview = async () => {
    if (!remarks.trim()) {
      showAlert('Remarks required', 'Remarks are required to complete the review.');
      return;
    }
    setSubmittingPeriodic(true);
    try {
      const uids = Object.keys(reporteeData);
      await Promise.all(uids.map((uid) => {
        const d = assessmentDrafts[uid] ?? { score: null, comment: '' };
        return api.businessReviews.upsertAssessment(params.appId, params.reviewId, uid, { score: d.score, comment: d.comment });
      }));
      await api.businessReviews.update(params.appId, params.reviewId, { meeting_notes: remarks.trim() });
      await api.businessReviews.close(params.appId, params.reviewId, {});
      await load(true);
    } catch (err) {
      showAlert('Could not complete review', apiErrorMessage(err));
    } finally {
      setSubmittingPeriodic(false);
    }
  };

  const deleteReview = () => {
    showAlert(
      'Delete Review',
      'Are you sure you want to delete this business review? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive', onPress: async () => {
            try {
              await api.businessReviews.delete(params.appId, params.reviewId);
              navigation.goBack();
            } catch (err) {
              showAlert('Could not delete review', apiErrorMessage(err));
            }
          },
        },
      ],
    );
  };

  const closeReview = async () => {
    setClosing(true);
    try {
      await api.businessReviews.close(params.appId, params.reviewId, {
        summary: summary.trim() || undefined,
        achievements: achievements.trim() || undefined,
        key_risks: keyRisks.trim() || undefined,
        improvement_plans: improvementPlans.trim() || undefined,
      });
      setCloseModal(false);
      await load(true);
    } catch (err) {
      showAlert('Could not close review', apiErrorMessage(err));
    } finally {
      setClosing(false);
    }
  };

  if (loading) return <View style={{ flex: 1, backgroundColor: colors.background }}><ActivityIndicator style={{ flex: 1 }} color={colors.primary} /></View>;
  if (error) return <LoadError message={error} onRetry={load} />;
  if (!review) return null;

  const isDaily = review.type === 'daily';
  const isPeriodic = review.type === 'weekly' || review.type === 'monthly';

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.title} numberOfLines={1}>{TYPE_LABELS[review.type] ?? review.type ?? 'Business Review'}</Text>
        {canManage ? (
          <TouchableOpacity style={s.backBtn} onPress={deleteReview}>
            <Ionicons name="trash-outline" size={20} color={colors.danger} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 36 }} />
        )}
      </View>

      <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
        <View style={s.metaCard}>
          <View style={s.metaRow}>
            <Text style={s.metaLabel}>Status</Text>
            <Text style={s.metaVal}>{review.status ?? '—'}</Text>
          </View>
          {review.review_date ? (
            <View style={s.metaRow}>
              <Text style={s.metaLabel}>Review Date</Text>
              <Text style={s.metaVal}>{new Date(review.review_date).toLocaleDateString()}</Text>
            </View>
          ) : null}
          {review.period_start && review.period_end ? (
            <View style={s.metaRow}>
              <Text style={s.metaLabel}>Period</Text>
              <Text style={s.metaVal}>{new Date(review.period_start).toLocaleDateString()} – {new Date(review.period_end).toLocaleDateString()}</Text>
            </View>
          ) : null}
          {manager?.name ? (
            <View style={s.metaRow}>
              <Text style={s.metaLabel}>Manager</Text>
              <Text style={s.metaVal}>{manager.name}</Text>
            </View>
          ) : null}
        </View>

        {!isDaily && !isPeriodic && review.status === 'open' && canManage && (
          <Button label="Close Review" onPress={() => setCloseModal(true)} style={{ marginBottom: 16 }} fullWidth />
        )}

        {!editable && (isDaily || isPeriodic) && review.manager_user_id !== meId && (
          <View style={s.infoBanner}>
            <Ionicons name="information-circle-outline" size={15} color={colors.textMuted} />
            <Text style={s.infoBannerTxt}>{isDaily ? 'This check-in' : 'This review'} can only be filled in by the manager.</Text>
          </View>
        )}

        {isDaily && Object.keys(reporteeData).length > 0 && (
          <>
            <Text style={s.sectionHead}>DAILY TASK SUMMARY</Text>
            {(() => { const memberCount = Object.keys(reporteeData).length; return Object.entries(reporteeData).map(([uid, rd]: [string, any]) => {
              const tasks: any[] = rd.tasks ?? [];
              const completedTasks: any[] = rd.completed_tasks ?? [];
              const loggedMins = tasks.reduce((sum, t) => sum + (Number(t.today_minutes) || 0), 0);
              const plannedMins = tasks.reduce((sum, t) => sum + plannedMinsForTask(t.id, uid), 0);
              // Managers scrolling through many reportees default to collapsed; a lone
              // card (e.g. an employee viewing just their own check-in) stays expanded —
              // matches web's BusinessReviewHub.jsx exactly.
              const isCollapsed = memberCount > 1 ? collapsedMembers[uid] !== false : collapsedMembers[uid] === true;
              return (
                <View key={uid} style={s.checkinCard}>
                  <TouchableOpacity
                    style={s.checkinHead}
                    activeOpacity={0.7}
                    onPress={() => setCollapsedMembers((prev) => ({ ...prev, [uid]: !isCollapsed }))}
                  >
                    <Ionicons name={isCollapsed ? 'chevron-forward' : 'chevron-down'} size={16} color={colors.textMuted} />
                    <Text style={s.checkinName} numberOfLines={1}>{rd.user?.name ?? `User ${uid}`}</Text>
                  </TouchableOpacity>
                  {/* Horizontal scroll — 6 stats don't fit one line on narrower phones,
                      and wrapping them mid-row reads worse than a side-scroll here. */}
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={s.checkinStatsRow}>
                      <Text style={s.checkinStat}>Planned: <Text style={s.checkinStatVal}>{plannedMins > 0 ? formatDuration(plannedMins) : '—'}</Text></Text>
                      <Text style={s.checkinStat}>Logged: <Text style={s.checkinStatVal}>{loggedMins > 0 ? formatDuration(loggedMins) : '—'}</Text></Text>
                      <Text style={s.checkinStat}>Active: <Text style={s.checkinStatVal}>{tasks.length}</Text></Text>
                      <Text style={[s.checkinStat, { color: colors.success }]}>Completed: <Text style={s.checkinStatVal}>{completedTasks.length}</Text></Text>
                      <Text style={[s.checkinStat, rd.overdue_count > 0 && { color: colors.danger }]}>
                        Overdue: <Text style={s.checkinStatVal}>{rd.overdue_count ?? 0}</Text>
                      </Text>
                    </View>
                  </ScrollView>

                  {!isCollapsed && (
                    <>
                      {tasks.length === 0 ? (
                        <Text style={s.emptyText}>No pending tasks</Text>
                      ) : (
                        tasks.map((t, ti) => {
                          const scheduledSlots = scheduledSlotsForTask(t.id, uid);
                          const plannedForTask = plannedMinsForTask(t.id, uid);
                          const yesterdayLabel = DAILY_REVIEW_STATUS_OPTS.find((o) => o.value === t.yesterday_review_status)?.label;
                          const yesterdayColor = t.yesterday_review_status === 'on_track' ? colors.success : t.yesterday_review_status === 'need_support' ? colors.warning : colors.textMuted;
                          return (
                            <TouchableOpacity key={t.id} style={s.dailyTaskCard} activeOpacity={0.7} onPress={() => openTask(t.id)}>
                              <View style={s.dailyTaskRow}>
                                <Text style={s.dailyTaskSno}>{ti + 1}</Text>
                                <Text style={s.dailyTaskTitle} numberOfLines={2}>{t.title}</Text>
                                {t.status ? <Text style={s.dailyTaskStatus}>{TASK_STATUS_LABEL[t.status] ?? t.status}</Text> : null}
                              </View>

                              {/* Manager's daily verdict for this task — tap targets inside a
                                  TouchableOpacity row still capture their own taps in RN, so
                                  this doesn't also trigger the outer navigate-to-task press. */}
                              <View style={s.reviewStatusRow}>
                                {DAILY_REVIEW_STATUS_OPTS.map((o) => {
                                  const active = taskStatuses[t.id] === o.value;
                                  return (
                                    <TouchableOpacity
                                      key={o.value}
                                      disabled={!editable}
                                      onPress={() => setTaskStatuses((prev) => ({ ...prev, [t.id]: o.value }))}
                                      style={[
                                        s.reviewStatusChip,
                                        active && (o.value === 'on_track' ? s.reviewStatusChipOnTrack : s.reviewStatusChipNeedSupport),
                                      ]}
                                    >
                                      <Text style={[s.reviewStatusChipTxt, active && s.reviewStatusChipTxtActive]}>{o.label}</Text>
                                    </TouchableOpacity>
                                  );
                                })}
                              </View>

                              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                <View style={s.dailyTaskStatsRow}>
                                  {scheduledSlots.length > 0 && (
                                    <View style={s.dailyStatItem}>
                                      <Text style={s.dailyStatLabel}>Scheduled</Text>
                                      {scheduledSlots.map((slot, si) => (
                                        <Text key={si} style={s.dailyStatValue}>{slot}</Text>
                                      ))}
                                    </View>
                                  )}
                                  <View style={s.dailyStatItem}>
                                    <Text style={s.dailyStatLabel}>Planned</Text>
                                    <Text style={s.dailyStatValue}>{plannedForTask > 0 ? formatDuration(plannedForTask) : '—'}</Text>
                                  </View>
                                  <View style={s.dailyStatItem}>
                                    <Text style={s.dailyStatLabel}>Log Hrs</Text>
                                    <Text style={s.dailyStatValue}>{t.today_minutes > 0 ? formatDuration(t.today_minutes) : '—'}</Text>
                                  </View>
                                  <View style={s.dailyStatItem}>
                                    <Text style={s.dailyStatLabel}>Actual / Est</Text>
                                    <Text style={s.dailyStatValue}>
                                      {t.actual_minutes > 0 ? formatDuration(t.actual_minutes) : '0h'} / {t.estimated_minutes > 0 ? formatDuration(t.estimated_minutes) : '—'}
                                    </Text>
                                  </View>
                                  {yesterdayLabel && (
                                    <View style={s.dailyStatItem}>
                                      <Text style={s.dailyStatLabel}>Yesterday</Text>
                                      <Text style={[s.dailyStatValue, { color: yesterdayColor }]}>{yesterdayLabel}</Text>
                                    </View>
                                  )}
                                </View>
                              </ScrollView>
                            </TouchableOpacity>
                          );
                        })
                      )}

                      {completedTasks.length > 0 && (
                        <>
                          <Text style={s.completedLabel}>COMPLETED TODAY ({completedTasks.length})</Text>
                          {completedTasks.map((t, ti) => (
                            <TouchableOpacity key={t.id} style={[s.dailyTaskCard, s.dailyTaskCardDone]} activeOpacity={0.7} onPress={() => openTask(t.id)}>
                              <View style={s.dailyTaskRow}>
                                <Text style={[s.dailyTaskSno, { color: colors.success }]}>{ti + 1}</Text>
                                <Text style={s.dailyTaskTitle} numberOfLines={2}>{t.title}</Text>
                                {t.completed_at ? (
                                  <Text style={s.dailyTaskTime}>
                                    {new Date(t.completed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  </Text>
                                ) : null}
                              </View>
                            </TouchableOpacity>
                          ))}
                        </>
                      )}

                      {(rd.member_comments ?? []).length > 0 && (
                        <View style={{ marginTop: 8 }}>
                          {rd.member_comments.map((c: any) => (
                            <View key={c.id} style={s.memberCommentRow}>
                              <Ionicons name="chatbubble-ellipses-outline" size={13} color={colors.textMuted} style={{ marginTop: 2 }} />
                              <Text style={s.memberComment}>
                                <Text style={{ fontWeight: '700' }}>{c.author?.name ?? 'Manager'}: </Text>{c.body}
                              </Text>
                            </View>
                          ))}
                        </View>
                      )}

                      {editable && (
                        <View style={s.commentInputRow}>
                          <Ionicons name="chatbubble-outline" size={15} color={colors.gray400} />
                          <Input
                            containerStyle={{ flex: 1, marginBottom: 0 }}
                            placeholder="Add a comment for this employee…"
                            value={commentDrafts[uid] ?? ''}
                            onChangeText={(v) => setCommentDrafts((prev) => ({ ...prev, [uid]: v }))}
                            onSubmitEditing={() => postComment(uid)}
                            returnKeyType="send"
                          />
                          <TouchableOpacity
                            onPress={() => postComment(uid)}
                            disabled={postingCommentUid === uid || !(commentDrafts[uid] ?? '').trim()}
                            hitSlop={8}
                          >
                            {postingCommentUid === uid ? (
                              <ActivityIndicator size="small" color={colors.primary} />
                            ) : (
                              <Ionicons
                                name="send"
                                size={18}
                                color={(commentDrafts[uid] ?? '').trim() ? colors.primary : colors.gray300}
                              />
                            )}
                          </TouchableOpacity>
                        </View>
                      )}
                    </>
                  )}
                </View>
              );
            }); })()}

            {/* Complete Review — matches web's br-checkin-footer: a single
                Remarks field plus one action that saves every task's review
                status, the remarks, and closes the review together. */}
            <View style={s.dailyFooter}>
              {editable ? (
                <Input
                  label="Remarks"
                  value={remarks}
                  onChangeText={setRemarks}
                  placeholder="Overall remarks for today's check-in…"
                  multiline
                  numberOfLines={3}
                />
              ) : review.meeting_notes ? (
                <>
                  <Text style={s.sectionHead}>REMARKS</Text>
                  <Text style={s.paragraph}>{review.meeting_notes}</Text>
                </>
              ) : null}
              {editable && (
                <Button label="Complete Review" onPress={completeDailyReview} loading={submittingDaily} fullWidth />
              )}
            </View>
          </>
        )}

        {isPeriodic && Object.keys(reporteeData).length > 0 && (
          <>
            <Text style={s.sectionHead}>{review.type === 'weekly' ? 'WEEKLY REVIEW' : 'MONTHLY REVIEW'}</Text>
            {Object.entries(reporteeData).map(([uid, rd]: [string, any]) => {
              const sum = rd.summary ?? {};
              const hrsMin = sum.task_hours_minutes ?? 0;
              const hrsLabel = hrsMin > 0 ? formatDuration(hrsMin) : '0m';
              const completed = sum.completed_tasks ?? 0;
              const pending = sum.pending_tasks_count ?? 0;
              const onHold = sum.on_hold_tasks ?? 0;
              const overdue = sum.overdue_tasks ?? 0;
              const totalTasks = completed + pending + onHold + overdue;
              const onTimePct = totalTasks > 0 ? Math.round(((sum.on_time_tasks ?? 0) / totalTasks) * 100) : 0;
              const reviewsCount = (sum.perf_reviews ?? []).length;
              const routinesDone = Array.isArray(sum.routines_done) ? sum.routines_done.length : (sum.routines_done ?? 0);
              const draft = assessmentDrafts[uid] ?? { score: null, comment: '' };
              const breakdown = [
                { label: 'Completed', count: completed, color: colors.success },
                { label: 'Pending', count: pending, color: colors.warning },
                { label: 'On Hold', count: onHold, color: colors.primary },
                { label: 'Overdue', count: overdue, color: colors.danger },
              ];
              return (
                <View key={uid} style={s.checkinCard}>
                  <View style={s.periodicHead}>
                    <Text style={s.checkinName} numberOfLines={1}>{rd.user?.name ?? `User ${uid}`}</Text>
                    {rd.user?.role_title ? <Text style={s.periodicRole} numberOfLines={1}>{rd.user.role_title}</Text> : null}
                  </View>

                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={s.checkinStatsRow}>
                      <Text style={s.checkinStat}>Hours Logged: <Text style={s.checkinStatVal}>{hrsLabel}</Text></Text>
                      <Text style={[s.checkinStat, { color: colors.success }]}>Completed: <Text style={s.checkinStatVal}>{completed}</Text></Text>
                      <Text style={s.checkinStat}>Pending: <Text style={s.checkinStatVal}>{pending}</Text></Text>
                      <Text style={s.checkinStat}>On-Time: <Text style={s.checkinStatVal}>{onTimePct}%</Text></Text>
                      <Text style={s.checkinStat}>Reviews: <Text style={s.checkinStatVal}>{reviewsCount}</Text></Text>
                      <Text style={[s.checkinStat, { color: colors.success }]}>Routines Done: <Text style={s.checkinStatVal}>{routinesDone}</Text></Text>
                    </View>
                  </ScrollView>

                  <View style={s.taskBreakdown}>
                    {breakdown.map((row) => {
                      const pct = totalTasks > 0 ? Math.round((row.count / totalTasks) * 100) : 0;
                      return (
                        <View key={row.label} style={s.taskBreakdownRow}>
                          <View style={[s.taskBreakdownDot, { backgroundColor: row.color }]} />
                          <Text style={s.taskBreakdownLabel}>{row.label}</Text>
                          <View style={s.taskBreakdownBarBg}>
                            <View style={[s.taskBreakdownBarFill, { width: `${pct}%` as any, backgroundColor: row.color }]} />
                          </View>
                          <Text style={s.taskBreakdownPct}>{row.count} · {pct}%</Text>
                        </View>
                      );
                    })}
                  </View>

                  <View style={s.assessSection}>
                    <Text style={s.assessLabel}>Overall Score</Text>
                    <View style={s.scoreRow}>
                      {[1, 2, 3, 4, 5].map((n) => {
                        const active = draft.score === n;
                        return (
                          <TouchableOpacity
                            key={n}
                            disabled={!editable}
                            onPress={() => setAssessmentDrafts((prev) => ({ ...prev, [uid]: { ...draft, score: n } }))}
                            style={[s.scoreBtn, active && s.scoreBtnActive]}
                          >
                            <Text style={[s.scoreBtnTxt, active && s.scoreBtnTxtActive]}>{n}</Text>
                          </TouchableOpacity>
                        );
                      })}
                      {draft.score ? (
                        <Text style={s.scoreWord}>
                          {['', 'Poor', 'Needs Improvement', 'Satisfactory', 'Good', 'Excellent'][draft.score]}
                        </Text>
                      ) : null}
                    </View>

                    <Text style={[s.assessLabel, { marginTop: 12 }]}>Manager Comments</Text>
                    {editable ? (
                      <Input
                        value={draft.comment}
                        onChangeText={(v) => setAssessmentDrafts((prev) => ({ ...prev, [uid]: { ...draft, comment: v } }))}
                        placeholder="Write your feedback, observations and areas for growth…"
                        multiline
                        numberOfLines={3}
                        containerStyle={{ marginBottom: 8 }}
                      />
                    ) : draft.comment ? (
                      <Text style={s.paragraph}>{draft.comment}</Text>
                    ) : (
                      <Text style={s.emptyText}>—</Text>
                    )}

                    {editable && (
                      <Button
                        label="Save Review"
                        onPress={() => saveMemberAssessment(uid)}
                        loading={savingMemberUid === uid}
                        variant="outline"
                      />
                    )}
                  </View>
                </View>
              );
            })}

            <View style={s.dailyFooter}>
              {editable ? (
                <Input
                  label="Remarks *"
                  value={remarks}
                  onChangeText={setRemarks}
                  placeholder={`Overall remarks for this ${review.type === 'weekly' ? "week's" : "month's"} review…`}
                  multiline
                  numberOfLines={3}
                />
              ) : review.meeting_notes ? (
                <>
                  <Text style={s.sectionHead}>REMARKS</Text>
                  <Text style={s.paragraph}>{review.meeting_notes}</Text>
                </>
              ) : null}
              {editable && (
                <Button label="Complete Review" onPress={completePeriodicReview} loading={submittingPeriodic} fullWidth />
              )}
            </View>
          </>
        )}

        {!isDaily && !isPeriodic && review.meeting_notes ? (
          <>
            <Text style={s.sectionHead}>MEETING NOTES</Text>
            <Text style={s.paragraph}>{review.meeting_notes}</Text>
          </>
        ) : null}
        {review.summary ? (
          <>
            <Text style={s.sectionHead}>SUMMARY</Text>
            <Text style={s.paragraph}>{review.summary}</Text>
          </>
        ) : null}
        {review.achievements ? (
          <>
            <Text style={s.sectionHead}>ACHIEVEMENTS</Text>
            <Text style={s.paragraph}>{review.achievements}</Text>
          </>
        ) : null}
        {review.key_risks ? (
          <>
            <Text style={s.sectionHead}>KEY RISKS</Text>
            <Text style={s.paragraph}>{review.key_risks}</Text>
          </>
        ) : null}
        {review.improvement_plans ? (
          <>
            <Text style={s.sectionHead}>IMPROVEMENT PLANS</Text>
            <Text style={s.paragraph}>{review.improvement_plans}</Text>
          </>
        ) : null}

        <Text style={s.sectionHead}>ACTION ITEMS</Text>
        {actionItems.length === 0 ? (
          <Text style={s.emptyText}>No action items</Text>
        ) : (
          actionItems.map((a: any) => (
            <View key={a.id} style={s.itemRow}>
              <Ionicons
                name={a.status === 'done' ? 'checkmark-circle' : 'ellipse-outline'}
                size={18}
                color={a.status === 'done' ? colors.success : colors.gray400}
              />
              <View style={{ flex: 1 }}>
                <Text style={s.itemTitle}>{a.title ?? a.description}</Text>
                {a.assigned_to_user_id_name ? <Text style={s.metaLabel}>{a.assigned_to_user_id_name}</Text> : null}
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <Modal visible={closeModal} transparent animationType="fade" onRequestClose={() => setCloseModal(false)}>
        {/* KeyboardAvoidingView so these 4 text fields aren't covered by the
            keyboard — Modal content sits outside the screen's own keyboard
            handling (separate native root). */}
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.modalBackdrop}>
          <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }} keyboardShouldPersistTaps="handled">
            <View style={s.modalCard}>
              <View style={s.modalHead}>
                <Text style={s.modalTitle}>Close Review</Text>
                <TouchableOpacity onPress={() => setCloseModal(false)}>
                  <Ionicons name="close" size={22} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
              <Input label="Summary" value={summary} onChangeText={setSummary} placeholder="Optional" multiline numberOfLines={3} />
              <Input label="Achievements" value={achievements} onChangeText={setAchievements} placeholder="Optional" multiline numberOfLines={3} />
              <Input label="Key Risks" value={keyRisks} onChangeText={setKeyRisks} placeholder="Optional" multiline numberOfLines={3} />
              <Input label="Improvement Plans" value={improvementPlans} onChangeText={setImprovementPlans} placeholder="Optional" multiline numberOfLines={3} />
              <Button label="Close Review" onPress={closeReview} loading={closing} fullWidth />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
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
    title: { flex: 1, fontSize: 18, fontFamily: SERIF, color: c.textPrimary, fontWeight: '700', textAlign: 'center' },
    body: { padding: 16, paddingBottom: 32 },
    metaCard: {
      backgroundColor: c.surface, borderRadius: 14, borderWidth: 1, borderColor: c.border,
      padding: 14, marginBottom: 16, gap: 8,
    },
    metaRow: { flexDirection: 'row', justifyContent: 'space-between' },
    metaLabel: { fontSize: 12, color: c.textMuted },
    metaVal: { fontSize: 12, fontWeight: '700', color: c.textPrimary, textTransform: 'capitalize' },
    sectionHead: { fontSize: 11, fontWeight: '700', color: c.textMuted, letterSpacing: 1, marginTop: 8, marginBottom: 8 },
    paragraph: { fontSize: 13, color: c.textSecondary, lineHeight: 19, marginBottom: 8 },
    emptyText: { fontSize: 13, color: c.textMuted, marginBottom: 12 },
    itemRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
    itemTitle: { fontSize: 13, fontWeight: '600', color: c.textPrimary, flex: 1 },
    infoBanner: {
      flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.gray50,
      borderRadius: 10, padding: 10, marginBottom: 16,
    },
    infoBannerTxt: { flex: 1, fontSize: 12, color: c.textMuted },

    checkinCard: {
      backgroundColor: c.surface, borderRadius: 12, borderWidth: 1, borderColor: c.border,
      padding: 12, marginBottom: 12,
    },
    checkinHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    checkinName: { flexShrink: 1, fontSize: 14, fontWeight: '700', color: c.textPrimary },
    checkinStatsRow: { flexDirection: 'row', gap: 14, marginBottom: 4, paddingRight: 4 },
    checkinStat: { fontSize: 11, color: c.textMuted },
    checkinStatVal: { fontWeight: '700', color: c.textPrimary },
    dailyTaskCard: {
      backgroundColor: c.background, borderRadius: 10, borderWidth: 1, borderColor: c.border,
      padding: 10, marginTop: 8,
    },
    dailyTaskCardDone: { opacity: 0.85 },
    dailyTaskRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    dailyTaskSno: { fontSize: 12, fontWeight: '700', color: c.textMuted, width: 16 },
    dailyTaskTitle: { flex: 1, fontSize: 13, fontWeight: '600', color: c.textPrimary },
    dailyTaskStatus: { fontSize: 10, fontWeight: '700', color: c.primary },
    dailyTaskTime: { fontSize: 10, color: c.textMuted },
    reviewStatusRow: { flexDirection: 'row', gap: 8, marginTop: 8, paddingLeft: 24 },
    reviewStatusChip: {
      paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14,
      borderWidth: 1, borderColor: c.border, backgroundColor: c.surface,
    },
    reviewStatusChipOnTrack: { backgroundColor: c.successLight, borderColor: c.success },
    reviewStatusChipNeedSupport: { backgroundColor: c.warningLight, borderColor: c.warning },
    reviewStatusChipTxt: { fontSize: 11, fontWeight: '600', color: c.textSecondary },
    reviewStatusChipTxtActive: { color: c.textPrimary, fontWeight: '700' },
    dailyTaskStatsRow: { flexDirection: 'row', gap: 20, marginTop: 8, paddingLeft: 24, paddingRight: 4 },
    dailyStatItem: { gap: 2 },
    dailyStatLabel: { fontSize: 9, color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
    dailyStatValue: { fontSize: 12, fontWeight: '700', color: c.textPrimary },
    completedLabel: {
      fontSize: 10, fontWeight: '700', color: c.success, letterSpacing: 0.5,
      marginTop: 14, marginBottom: 2,
    },
    memberCommentRow: { flexDirection: 'row', gap: 6, marginBottom: 6 },
    memberComment: { flex: 1, fontSize: 12, color: c.textSecondary },
    commentInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
    dailyFooter: { marginTop: 8, marginBottom: 16 },

    periodicHead: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 8 },
    periodicRole: { flexShrink: 1, fontSize: 11, color: c.textMuted },
    taskBreakdown: { marginTop: 10, gap: 8 },
    taskBreakdownRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    taskBreakdownDot: { width: 8, height: 8, borderRadius: 4 },
    taskBreakdownLabel: { width: 66, flexShrink: 1, fontSize: 11, color: c.textSecondary },
    taskBreakdownBarBg: { flex: 1, minWidth: 24, height: 6, borderRadius: 3, backgroundColor: c.gray100, overflow: 'hidden' },
    taskBreakdownBarFill: { height: 6, borderRadius: 3 },
    taskBreakdownPct: { width: 64, flexShrink: 1, fontSize: 11, fontWeight: '600', color: c.textPrimary, textAlign: 'right' },
    assessSection: { marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: c.border },
    assessLabel: { fontSize: 11, fontWeight: '700', color: c.textMuted, letterSpacing: 0.5, marginBottom: 8 },
    scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
    scoreBtn: {
      width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
      borderWidth: 1.5, borderColor: c.border, backgroundColor: c.surface,
    },
    scoreBtnActive: { backgroundColor: c.primary, borderColor: c.primary },
    scoreBtnTxt: { fontSize: 13, fontWeight: '700', color: c.textSecondary },
    scoreBtnTxtActive: { color: '#fff' },
    scoreWord: { fontSize: 12, fontWeight: '600', color: c.textSecondary, marginLeft: 4 },
    modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', padding: 20 },
    modalCard: { backgroundColor: c.surface, borderRadius: 16, padding: 18 },
    modalHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
    modalTitle: { fontSize: 17, fontWeight: '800', color: c.textPrimary },
  });
}
