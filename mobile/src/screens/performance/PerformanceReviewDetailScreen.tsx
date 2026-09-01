import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useApi } from '../../hooks/useApi';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useTheme } from '../../contexts/ThemeContext';
import { AppColors } from '../../utils/colors';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import LoadError from '../../components/common/LoadError';
import { showAlert } from '../../components/common/AlertModal';
import { useLoadWithTimeout } from '../../hooks/useLoadWithTimeout';
import { PerformanceStackParamList } from '../../navigation/types';

type RouteProps = RouteProp<PerformanceStackParamList, 'ReviewDetail'>;

interface Snapshot {
  id: number;
  goal_name?: string;
  skill_name?: string;
  value_name?: string;
  description?: string;
  weightage?: number;
}

interface Review {
  id: number;
  cycle_name?: string;
  status: string;
  platform_user_id?: number;
  reviewee_name?: string;
  employee_name?: string;
  self_score?: number;
  manager_score?: number;
  final_score?: number;
  goals_score?: number;
  skills_score?: number;
  values_score?: number;
  feedback_discussion_date?: string;
}

interface DraftEntry { rating: number; comments: string; }
type Draft = Record<string, DraftEntry>;

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  pending_self:     { bg: 'rgba(59,130,246,0.15)',  text: '#60a5fa' },
  pending_manager:  { bg: 'rgba(245,158,11,0.15)',  text: '#f59e0b' },
  pending_approver: { bg: 'rgba(245,158,11,0.15)',  text: '#f59e0b' },
  approved:         { bg: 'rgba(16,185,129,0.15)',  text: '#10b981' },
  rejected:         { bg: 'rgba(239,68,68,0.15)',   text: '#ef4444' },
  completed:        { bg: 'rgba(16,185,129,0.15)',  text: '#10b981' },
};

function StatusBadge({ status }: { status: string }) {
  const c = STATUS_COLORS[status] ?? { bg: 'rgba(107,114,128,0.15)', text: '#9ca3af' };
  return (
    <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: c.bg }}>
      <Text style={{ fontSize: 11, fontWeight: '600', textTransform: 'capitalize', color: c.text }}>
        {status.replace(/_/g, ' ')}
      </Text>
    </View>
  );
}

function StarRating({ value, onChange, disabled }: { value: number; onChange?: (v: number) => void; disabled?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
      {[1, 2, 3, 4, 5].map((star) => (
        <TouchableOpacity key={star} onPress={() => !disabled && onChange?.(star)} disabled={disabled} activeOpacity={0.7}>
          <Ionicons name={star <= value ? 'star' : 'star-outline'} size={28} color={star <= value ? '#f59e0b' : '#9ca3af'} />
        </TouchableOpacity>
      ))}
    </View>
  );
}

export default function PerformanceReviewDetailScreen() {
  const route = useRoute<RouteProps>();
  const { reviewId, appId } = route.params;
  const navigation = useNavigation<any>();
  const api = useApi();
  const { workspace } = useWorkspace();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const { loading, loadError, run } = useLoadWithTimeout();
  const [submitting, setSubmitting] = useState(false);
  const [review, setReview] = useState<Review | null>(null);
  const [snapshots, setSnapshots] = useState<{ goals: Snapshot[]; skills: Snapshot[]; values: Snapshot[] }>({ goals: [], skills: [], values: [] });
  const [finalApprover, setFinalApprover] = useState<any>(null);
  const [analytics, setAnalytics] = useState<any>(null);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft>({});
  const [ratingsByRole, setRatingsByRole] = useState<Record<string, Draft>>({});
  const [feedbackDate, setFeedbackDate] = useState('');
  const [feedbackNotes, setFeedbackNotes] = useState('');
  const [managerAction, setManagerAction] = useState<'approve' | 'reject'>('approve');
  const [rejectionComment, setRejectionComment] = useState('');
  const [finalAction, setFinalAction] = useState<'approve' | 'reject_to_manager' | 'reject_to_employee'>('approve');
  const [finalComment, setFinalComment] = useState('');
  const [managerUserIds, setManagerUserIds] = useState<number[]>([]);
  const [hasManager, setHasManager] = useState(false);

  const load = useCallback(async () => {
    const [reviewRes, ratingsRes, analyticsRes, meRes] = await Promise.all([
      api.performance.getReview(appId, reviewId),
      api.performance.getReviewRatings(appId, reviewId).catch(() => ({ data: [] })),
      api.performance.getReviewAnalytics(appId, reviewId).catch(() => ({ data: null })),
      api.me.getProfile(),
    ]);
    const rv: Review = reviewRes.data?.review ?? reviewRes.data;
    const snaps = reviewRes.data?.snapshots ?? { goals: [], skills: [], values: [] };
    const fa = reviewRes.data?.finalApprover ?? null;
    const ratings: any[] = Array.isArray(ratingsRes.data) ? ratingsRes.data : [];
    const myId: number = meRes.data?.id ?? meRes.data?.user?.id;

    setReview(rv);
    setSnapshots(snaps);
    setFinalApprover(fa);
    setAnalytics(analyticsRes.data);
    setCurrentUserId(myId);
    setManagerUserIds(reviewRes.data?.managerUserIds ?? []);
    setHasManager(reviewRes.data?.has_manager ?? (reviewRes.data?.managerUserIds ?? []).length > 0);

    const byRole: Record<string, Draft> = {};
    for (const r of ratings) {
      const role = r.rater_role ?? 'self';
      if (!byRole[role]) byRole[role] = {};
      const key = `${r.rating_type}-${r.snapshot_id}`;
      byRole[role][key] = { rating: r.rating, comments: r.comments ?? '' };
    }
    setRatingsByRole(byRole);
    const currentRole =
      rv.status === 'pending_self' ? 'self'
      : rv.status === 'pending_manager' ? 'manager'
      : rv.status === 'pending_approver' ? 'final_approver'
      : null;
    setDraft(currentRole && byRole[currentRole] ? { ...byRole[currentRole] } : {});

    if (rv.feedback_discussion_date) setFeedbackDate(rv.feedback_discussion_date.split('T')[0]);
  }, [appId, reviewId, api]);

  useEffect(() => { run(load); }, [load]);

  const setRating = (key: string, rating: number) => {
    setDraft(prev => ({ ...prev, [key]: { rating, comments: prev[key]?.comments ?? '' } }));
  };

  const setComments = (key: string, comments: string) => {
    setDraft(prev => ({ ...prev, [key]: { rating: prev[key]?.rating ?? 0, comments } }));
  };

  const buildPayload = () => {
    const result: { type: string; snapshot_id: number; rating: number; comments: string }[] = [];
    const pairs: [string, Snapshot[]][] = [
      ['goal', snapshots.goals],
      ['skill', snapshots.skills],
      ['value', snapshots.values],
    ];
    for (const [type, snaps] of pairs) {
      for (const snap of snaps) {
        const key = `${type}-${snap.id}`;
        const d = draft[key];
        if (d && d.rating > 0) {
          result.push({ type, snapshot_id: snap.id, rating: d.rating, comments: d.comments ?? '' });
        }
      }
    }
    return result;
  };

  const isAdmin = workspace?.role === 'super_admin' || workspace?.role === 'admin';
  const canSelfRate = review?.status === 'pending_self' && review?.platform_user_id === currentUserId;
  const canManagerRate = review?.status === 'pending_manager'
    && (isAdmin || (currentUserId != null && managerUserIds.some((id) => String(id) === String(currentUserId))));
  const isDesignatedApprover = (finalApprover?.user_ids ?? []).some((id: number) => String(id) === String(currentUserId)) || workspace?.role === 'super_admin';
  const canFinalRate = review?.status === 'pending_approver' && isDesignatedApprover;
  const isViewOnly = !canSelfRate && !canManagerRate && !canFinalRate;

  const doSubmitSelf = async (ratings: any[]) => {
    setSubmitting(true);
    try {
      await api.performance.submitSelfRating(appId, reviewId, { ratings });
      Alert.alert('Submitted', 'Self rating submitted successfully.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch {
      Alert.alert('Error', 'Failed to submit self rating');
    } finally { setSubmitting(false); }
  };
  // Confirm before submitting — matches web's PerformanceReview (window.confirm).
  const handleSubmitSelf = () => {
    const ratings = buildPayload();
    if (ratings.length === 0) {
      Alert.alert('Rate yourself', 'Please rate at least one item before submitting.');
      return;
    }
    showAlert('Submit self-rating?', 'Submit your self-rating for manager review?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Submit', onPress: () => doSubmitSelf(ratings) },
    ]);
  };

  const doSubmitManager = async () => {
    setSubmitting(true);
    try {
      await api.performance.submitManagerRating(appId, reviewId, {
        action: managerAction,
        ratings: buildPayload(),
        feedback_discussion_date: feedbackDate || undefined,
        discussion_notes: feedbackNotes || undefined,
        rejection_comment: managerAction === 'reject' ? rejectionComment.trim() : undefined,
      });
      Alert.alert('Submitted', managerAction === 'approve' ? 'Manager rating submitted.' : 'Sent back to employee.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch {
      Alert.alert('Error', 'Failed to submit manager rating');
    } finally { setSubmitting(false); }
  };
  const handleSubmitManager = () => {
    if (managerAction === 'approve') {
      const ratings = buildPayload();
      if (ratings.length === 0) {
        Alert.alert('Rate', 'Please provide ratings before submitting.');
        return;
      }
      if (!feedbackDate.trim()) {
        Alert.alert('Required', 'Please enter a feedback discussion date.');
        return;
      }
    } else if (!rejectionComment.trim()) {
      Alert.alert('Required', 'Please enter a reason for sending this back to the employee.');
      return;
    }
    const isApprove = managerAction === 'approve';
    showAlert(
      isApprove ? 'Submit manager review?' : 'Send back to employee?',
      isApprove
        ? 'Submit your manager review and send for final approval?'
        : 'Reject this review and send it back to the employee for revision?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: isApprove ? 'Submit' : 'Send Back', style: isApprove ? 'default' : 'destructive', onPress: doSubmitManager },
      ],
    );
  };

  const doSubmitFinal = async (action: 'approve' | 'reject_to_manager' | 'reject_to_employee') => {
    setSubmitting(true);
    try {
      await api.performance.submitFinalRating(appId, reviewId, {
        final_action: action,
        final_comment: finalComment.trim() || undefined,
      });
      Alert.alert('Done', action === 'approve' ? 'Review approved.' : 'Review sent back.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch {
      Alert.alert('Error', 'Failed to submit final decision');
    } finally { setSubmitting(false); }
  };
  const handleSubmitFinal = (action: 'approve' | 'reject_to_manager' | 'reject_to_employee') => {
    if (action !== 'approve' && !finalComment.trim()) {
      Alert.alert('Required', 'Please enter a comment.');
      return;
    }
    const msg = action === 'approve'
      ? 'Approve this review? This will complete the workflow.'
      : action === 'reject_to_manager'
        ? 'Reject and send back to manager for revision?'
        : 'Reject and send back to the employee for revision?';
    showAlert(action === 'approve' ? 'Approve review?' : 'Send back?', msg, [
      { text: 'Cancel', style: 'cancel' },
      { text: action === 'approve' ? 'Approve' : 'Send Back', style: action === 'approve' ? 'default' : 'destructive', onPress: () => doSubmitFinal(action) },
    ]);
  };

  if (loading) return <LoadingSpinner />;
  if (loadError) return <LoadError onRetry={() => run(load)} />;
  if (!review) {
    return (
      <View style={[s.container, { paddingTop: insets.top, alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={{ color: colors.textSecondary }}>Review not found</Text>
      </View>
    );
  }

  const renderSnapSection = (type: 'goal' | 'skill' | 'value', snaps: Snapshot[]) => {
    if (snaps.length === 0) return null;
    const label = type === 'goal' ? 'Goals' : type === 'skill' ? 'Skills' : 'Values';
    const nameKey = type === 'goal' ? 'goal_name' : type === 'skill' ? 'skill_name' : 'value_name';
    return (
      <>
        <Text style={s.sectionLabel}>{label}</Text>
        {snaps.map((snap) => {
          const key = `${type}-${snap.id}`;
          const d = draft[key] ?? { rating: 0, comments: '' };
          return (
            <View key={snap.id} style={s.snapCard}>
              <View style={s.snapHeader}>
                <Text style={s.snapName} numberOfLines={2}>{(snap as any)[nameKey] ?? `Item #${snap.id}`}</Text>
                {snap.weightage != null && (
                  <View style={s.weightBadge}>
                    <Text style={s.weightText}>{snap.weightage}%</Text>
                  </View>
                )}
              </View>
              {snap.description ? <Text style={s.snapDesc}>{snap.description}</Text> : null}
              <StarRating value={d.rating} onChange={(v) => setRating(key, v)} disabled={isViewOnly} />
              {(!isViewOnly || d.comments.length > 0) && (
                <TextInput
                  style={[s.commentInput, isViewOnly && s.commentReadOnly]}
                  value={d.comments}
                  onChangeText={(t) => setComments(key, t)}
                  placeholder="Add comments..."
                  placeholderTextColor={colors.gray400}
                  multiline
                  editable={!isViewOnly}
                />
              )}
            </View>
          );
        })}
      </>
    );
  };

  const renderGoalCentricHistory = (type: 'goal' | 'skill' | 'value', snaps: Snapshot[]) => {
    if (snaps.length === 0) return null;
    const label = type === 'goal' ? 'Goals' : type === 'skill' ? 'Skills' : 'Values';
    const nameKey = type === 'goal' ? 'goal_name' : type === 'skill' ? 'skill_name' : 'value_name';
    const ROLES: { key: string; label: string }[] = [
      { key: 'self', label: 'SELF' },
      { key: 'manager', label: 'MANAGER' },
      { key: 'final_approver', label: 'FINAL APPROVER' },
    ];
    return (
      <>
        <Text style={s.sectionLabel}>{label}</Text>
        {snaps.map((snap) => {
          const rows = ROLES.map(({ key, label: rlabel }) => {
            const d = ratingsByRole[key]?.[`${type}-${snap.id}`];
            if (!d || d.rating === 0) return null;
            return (
              <View key={key} style={s.roleRow}>
                <Text style={s.roleRowLabel}>{rlabel}</Text>
                <View style={s.roleRowRight}>
                  <View style={{ flexDirection: 'row', gap: 2 }}>
                    {[1,2,3,4,5].map((star) => (
                      <Ionicons key={star} name={star <= d.rating ? 'star' : 'star-outline'} size={14} color={star <= d.rating ? '#f59e0b' : '#9ca3af'} />
                    ))}
                  </View>
                  <Text style={s.roleRowRating}>{d.rating}/5</Text>
                </View>
                {d.comments ? <Text style={s.roleRowComment}>"{d.comments}"</Text> : null}
              </View>
            );
          }).filter(Boolean);
          if (rows.length === 0) return null;
          return (
            <View key={snap.id} style={s.snapCard}>
              <View style={s.snapHeader}>
                <Text style={s.snapName} numberOfLines={2}>{(snap as any)[nameKey] ?? `Item #${snap.id}`}</Text>
                {snap.weightage != null && (
                  <View style={s.weightBadge}><Text style={s.weightText}>{snap.weightage}%</Text></View>
                )}
              </View>
              {rows}
            </View>
          );
        })}
      </>
    );
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[s.container, { paddingTop: insets.top }]}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
            <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={s.headerTitle} numberOfLines={1}>
              {review.cycle_name ?? `Review #${review.id}`}
            </Text>
            {(review.reviewee_name ?? review.employee_name) && (
              <Text style={s.headerSub}>{review.reviewee_name ?? review.employee_name}</Text>
            )}
          </View>
          <StatusBadge status={review.status} />
        </View>

        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
          {/* Performance metrics — always shown horizontally regardless of review stage
              (self / manager / final approver) so reviewers have task context while rating. */}
          <View style={s.analyticsRow}>
            <View style={s.analyticsItem}>
              <Text style={s.analyticsNum}>{analytics?.tasksCompleted ?? 0}</Text>
              <Text style={s.analyticsLabel}>Tasks Done</Text>
            </View>
            <View style={s.analyticsDivider} />
            <View style={s.analyticsItem}>
              <Text style={s.analyticsNum}>
                {typeof analytics?.hoursSpent === 'number' ? analytics.hoursSpent.toFixed(1) : '0'}
              </Text>
              <Text style={s.analyticsLabel}>Hours Spent</Text>
            </View>
            <View style={s.analyticsDivider} />
            <View style={s.analyticsItem}>
              <Text style={[s.analyticsNum, { color: colors.danger }]}>{analytics?.overdueTasks ?? 0}</Text>
              <Text style={s.analyticsLabel}>Overdue</Text>
            </View>
          </View>

          {(review.self_score != null || review.manager_score != null || review.final_score != null) && (
            <View style={s.ratingsSummary}>
              {review.self_score != null && (
                <View style={s.ratingSumItem}>
                  <Text style={s.ratingSumLabel}>Self</Text>
                  <Text style={s.ratingSumNum}>{review.self_score}/5</Text>
                </View>
              )}
              {review.manager_score != null && (
                <View style={s.ratingSumItem}>
                  <Text style={s.ratingSumLabel}>Manager</Text>
                  <Text style={s.ratingSumNum}>{review.manager_score}/5</Text>
                </View>
              )}
              {review.final_score != null && (
                <View style={s.ratingSumItem}>
                  <Text style={s.ratingSumLabel}>Final</Text>
                  <Text style={[s.ratingSumNum, { color: colors.primary }]}>{review.final_score}/5</Text>
                </View>
              )}
            </View>
          )}

          {isViewOnly && (
            <>
              {renderGoalCentricHistory('goal', snapshots.goals)}
              {renderGoalCentricHistory('skill', snapshots.skills)}
              {renderGoalCentricHistory('value', snapshots.values)}
            </>
          )}

          {!isViewOnly && (
            <>
              <Text style={[s.sectionLabel, { marginTop: 16 }]}>
                {canSelfRate ? 'Your Rating' : canManagerRate ? 'Manager Rating' : 'Final Rating'}
              </Text>
              {renderSnapSection('goal', snapshots.goals)}
              {renderSnapSection('skill', snapshots.skills)}
              {renderSnapSection('value', snapshots.values)}
            </>
          )}

          {canManagerRate && (
            <View style={{ marginTop: 16 }}>
              <Text style={s.sectionLabel}>Manager Decision</Text>
              <View style={s.actionToggleRow}>
                <TouchableOpacity
                  style={[s.actionToggleBtn, managerAction === 'approve' && s.actionToggleBtnActive]}
                  onPress={() => setManagerAction('approve')}
                >
                  <Text style={[s.actionToggleTxt, managerAction === 'approve' && s.actionToggleTxtActive]}>Approve &amp; Rate</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.actionToggleBtn, managerAction === 'reject' && s.actionToggleBtnActive]}
                  onPress={() => setManagerAction('reject')}
                >
                  <Text style={[s.actionToggleTxt, managerAction === 'reject' && s.actionToggleTxtActive]}>Send Back to Employee</Text>
                </TouchableOpacity>
              </View>

              {managerAction === 'approve' ? (
                <>
                  <Text style={s.fieldLabel}>Discussion Date *</Text>
                  <TextInput
                    style={s.input}
                    value={feedbackDate}
                    onChangeText={setFeedbackDate}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={colors.gray400}
                  />
                  <Text style={s.fieldLabel}>Discussion Notes</Text>
                  <TextInput
                    style={[s.input, s.inputMulti]}
                    value={feedbackNotes}
                    onChangeText={setFeedbackNotes}
                    placeholder="Optional notes from the discussion..."
                    placeholderTextColor={colors.gray400}
                    multiline
                    numberOfLines={3}
                  />
                </>
              ) : (
                <>
                  <Text style={s.fieldLabel}>Reason *</Text>
                  <TextInput
                    style={[s.input, s.inputMulti]}
                    value={rejectionComment}
                    onChangeText={setRejectionComment}
                    placeholder="Explain why this is being sent back..."
                    placeholderTextColor={colors.gray400}
                    multiline
                    numberOfLines={3}
                  />
                </>
              )}
            </View>
          )}

          {canFinalRate && (
            <View style={{ marginTop: 16 }}>
              <Text style={s.sectionLabel}>Final Decision</Text>
              <View style={s.actionToggleRow}>
                <TouchableOpacity
                  style={[s.actionToggleBtn, finalAction === 'approve' && s.actionToggleBtnActive]}
                  onPress={() => setFinalAction('approve')}
                >
                  <Text style={[s.actionToggleTxt, finalAction === 'approve' && s.actionToggleTxtActive]}>Approve</Text>
                </TouchableOpacity>
                {hasManager && (
                  <TouchableOpacity
                    style={[s.actionToggleBtn, finalAction === 'reject_to_manager' && s.actionToggleBtnActive]}
                    onPress={() => setFinalAction('reject_to_manager')}
                  >
                    <Text style={[s.actionToggleTxt, finalAction === 'reject_to_manager' && s.actionToggleTxtActive]}>To Manager</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[s.actionToggleBtn, finalAction === 'reject_to_employee' && s.actionToggleBtnActive]}
                  onPress={() => setFinalAction('reject_to_employee')}
                >
                  <Text style={[s.actionToggleTxt, finalAction === 'reject_to_employee' && s.actionToggleTxtActive]}>To Employee</Text>
                </TouchableOpacity>
              </View>
              {finalAction !== 'approve' && (
                <>
                  <Text style={s.fieldLabel}>Comment *</Text>
                  <TextInput
                    style={[s.input, s.inputMulti]}
                    value={finalComment}
                    onChangeText={setFinalComment}
                    placeholder="Enter a reason..."
                    placeholderTextColor={colors.gray400}
                    multiline
                    numberOfLines={3}
                  />
                </>
              )}
            </View>
          )}

          {canSelfRate && (
            <TouchableOpacity
              style={[s.submitBtn, submitting && s.submitBtnDisabled]}
              onPress={handleSubmitSelf}
              disabled={submitting}
            >
              {submitting
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.submitBtnText}>Submit Self Rating</Text>
              }
            </TouchableOpacity>
          )}

          {canManagerRate && (
            <TouchableOpacity
              style={[managerAction === 'approve' ? s.submitBtn : s.submitBtnDanger, submitting && s.submitBtnDisabled]}
              onPress={handleSubmitManager}
              disabled={submitting}
            >
              {submitting
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.submitBtnText}>{managerAction === 'approve' ? 'Submit Manager Rating' : 'Send Back to Employee'}</Text>
              }
            </TouchableOpacity>
          )}

          {canFinalRate && (
            <TouchableOpacity
              style={[finalAction === 'approve' ? s.submitBtn : s.submitBtnDanger, submitting && s.submitBtnDisabled]}
              onPress={() => handleSubmitFinal(finalAction)}
              disabled={submitting}
            >
              {submitting
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.submitBtnText}>{finalAction === 'approve' ? 'Approve Review' : 'Send Back'}</Text>
              }
            </TouchableOpacity>
          )}

          {isViewOnly && (
            <View style={s.viewOnlyBanner}>
              <Ionicons name="eye-outline" size={16} color={colors.textSecondary} />
              <Text style={s.viewOnlyText}>View only — no action required from you at this stage</Text>
            </View>
          )}
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

function makeStyles(c: AppColors) {
  const SERIF = Platform.OS === 'ios' ? 'Georgia' : 'serif';
  return StyleSheet.create({
    container:       { flex: 1, backgroundColor: c.background },
    header:          {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingHorizontal: 16, paddingVertical: 14,
      backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border,
    },
    backBtn:         { padding: 4 },
    headerTitle:     { fontSize: 17, fontWeight: '700', color: c.textPrimary, fontFamily: SERIF },
    headerSub:       { fontSize: 12, color: c.textSecondary, marginTop: 2 },
    content:         { padding: 16, paddingBottom: 48 },
    analyticsRow:    {
      flexDirection: 'row', backgroundColor: c.surface, borderRadius: 12,
      borderWidth: 1, borderColor: c.border, padding: 14, marginBottom: 16,
    },
    analyticsItem:   { flex: 1, alignItems: 'center' },
    analyticsDivider: { width: 1, backgroundColor: c.border },
    analyticsNum:    { fontSize: 22, fontWeight: '800', color: c.primary },
    analyticsLabel:  { fontSize: 10, fontWeight: '600', color: c.textSecondary, marginTop: 2 },
    ratingsSummary:  {
      flexDirection: 'row', backgroundColor: c.surface, borderRadius: 12,
      borderWidth: 1, borderColor: c.border, padding: 14, marginBottom: 16,
    },
    ratingSumItem:   { flex: 1, alignItems: 'center' },
    ratingSumLabel:  { fontSize: 11, fontWeight: '600', color: c.textSecondary },
    ratingSumNum:    { fontSize: 18, fontWeight: '800', color: c.textPrimary, marginTop: 2 },
    sectionLabel:    {
      fontSize: 12, fontWeight: '700', color: c.textSecondary,
      textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginTop: 8,
    },
    snapCard:        {
      backgroundColor: c.surface, borderRadius: 12, padding: 14, marginBottom: 10,
      borderWidth: 1, borderColor: c.border,
    },
    snapHeader:      { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 2 },
    snapName:        { flex: 1, fontSize: 14, fontWeight: '600', color: c.textPrimary },
    snapDesc:        { fontSize: 12, color: c.textSecondary, marginBottom: 4 },
    weightBadge:     { backgroundColor: c.primaryLight, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
    weightText:      { fontSize: 11, fontWeight: '700', color: c.primary },
    commentInput:    {
      marginTop: 10, borderWidth: 1, borderColor: c.border, borderRadius: 8,
      paddingHorizontal: 12, paddingVertical: 8, fontSize: 13,
      color: c.textPrimary, backgroundColor: c.gray50, minHeight: 60, textAlignVertical: 'top',
    },
    commentReadOnly: { backgroundColor: 'transparent', borderColor: 'transparent' },
    fieldLabel:      { fontSize: 13, fontWeight: '600', color: c.textSecondary, marginBottom: 6, marginTop: 12 },
    input:           {
      borderWidth: 1, borderColor: c.border, borderRadius: 10,
      paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: c.textPrimary,
      backgroundColor: c.gray50,
    },
    inputMulti:      { minHeight: 80, textAlignVertical: 'top' },
    submitBtn:       {
      marginTop: 24, backgroundColor: c.primary, borderRadius: 12,
      paddingVertical: 14, alignItems: 'center',
    },
    submitBtnDisabled: { opacity: 0.5 },
    submitBtnDanger: {
      marginTop: 24, backgroundColor: c.danger, borderRadius: 12,
      paddingVertical: 14, alignItems: 'center',
    },
    submitBtnText:   { fontSize: 15, color: '#ffffff', fontWeight: '700' },
    actionToggleRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
    actionToggleBtn: {
      flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center',
      backgroundColor: c.gray50, borderWidth: 1.5, borderColor: c.border,
    },
    actionToggleBtnActive: { backgroundColor: c.primaryLight, borderColor: c.primary },
    actionToggleTxt: { fontSize: 12, fontWeight: '700', color: c.gray600, textAlign: 'center' },
    actionToggleTxtActive: { color: c.primary },
    finalBtns:       { flexDirection: 'row', gap: 12, marginTop: 24 },
    approveBtn:      {
      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      gap: 6, paddingVertical: 14, borderRadius: 12, backgroundColor: c.success,
    },
    approveBtnText:  { fontSize: 14, fontWeight: '700', color: '#ffffff' },
    rejectBtn:       {
      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      gap: 6, paddingVertical: 14, borderRadius: 12,
      backgroundColor: c.dangerLight, borderWidth: 1, borderColor: c.danger + '44',
    },
    rejectBtnText:   { fontSize: 14, fontWeight: '700', color: c.danger },
    viewOnlyBanner:  {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: c.gray100, borderRadius: 10, padding: 12, marginTop: 20,
    },
    viewOnlyText:    { fontSize: 13, color: c.textSecondary, flex: 1 },
    historySection:  { marginBottom: 8 },
    historySectionLabel: {
      fontSize: 12, fontWeight: '700', color: c.primary,
      textTransform: 'uppercase', letterSpacing: 0.5,
      marginBottom: 8, marginTop: 8,
      borderLeftWidth: 3, borderLeftColor: c.primary, paddingLeft: 8,
    },
    historyCard:     { opacity: 0.9 },
    historyComment:  { fontSize: 13, color: c.textSecondary, marginTop: 8, fontStyle: 'italic' },

    roleRow: {
      marginTop: 10, paddingTop: 10,
      borderTopWidth: 1, borderTopColor: c.border,
    },
    roleRowLabel: {
      fontSize: 10, fontWeight: '700', color: c.textMuted,
      letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 4,
    },
    roleRowRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    roleRowRating: { fontSize: 14, fontWeight: '700', color: c.textPrimary },
    roleRowComment: { fontSize: 13, color: c.textSecondary, fontStyle: 'italic', marginTop: 4 },
  });
}
