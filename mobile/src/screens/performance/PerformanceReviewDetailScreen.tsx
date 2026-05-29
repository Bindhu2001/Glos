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
  self_rating?: number;
  manager_rating?: number;
  final_rating?: number;
  feedback_discussion_date?: string;
  final_approval_status?: string;
  rejection_reason?: string;
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
  const isAdmin = workspace?.role === 'super_admin' || workspace?.role === 'admin';

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [review, setReview] = useState<Review | null>(null);
  const [snapshots, setSnapshots] = useState<{ goals: Snapshot[]; skills: Snapshot[]; values: Snapshot[] }>({ goals: [], skills: [], values: [] });
  const [finalApprover, setFinalApprover] = useState<any>(null);
  const [analytics, setAnalytics] = useState<any>(null);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft>({});
  const [feedbackDate, setFeedbackDate] = useState('');
  const [feedbackNotes, setFeedbackNotes] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');

  const load = useCallback(async () => {
    try {
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

      if (ratings.length > 0) {
        const d: Draft = {};
        for (const r of ratings) {
          const key = `${r.rating_type}-${r.snapshot_id}`;
          d[key] = { rating: r.rating, comments: r.comments ?? '' };
        }
        setDraft(d);
      }

      if (rv.feedback_discussion_date) setFeedbackDate(rv.feedback_discussion_date.split('T')[0]);
      if (rv.rejection_reason) setRejectionReason(rv.rejection_reason);
    } catch {
      Alert.alert('Error', 'Failed to load review');
    } finally {
      setLoading(false);
    }
  }, [appId, reviewId, api]);

  useEffect(() => { load(); }, [load]);

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

  const canSelfRate = review?.status === 'pending_self' && review?.platform_user_id === currentUserId;
  // Backend doesn't expose manager_user_id; show form to non-reviewees when pending (backend enforces nothing)
  const canManagerRate = review?.status === 'pending_manager' && review?.platform_user_id !== currentUserId;
  const isDesignatedApprover = finalApprover?.user_id === currentUserId || isAdmin;
  const canFinalRate = review?.status === 'pending_approver' && isDesignatedApprover;
  const isViewOnly = !canSelfRate && !canManagerRate && !canFinalRate;

  const handleSubmitSelf = async () => {
    const ratings = buildPayload();
    if (ratings.length === 0) {
      Alert.alert('Rate yourself', 'Please rate at least one item before submitting.');
      return;
    }
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

  const handleSubmitManager = async () => {
    const ratings = buildPayload();
    if (ratings.length === 0) {
      Alert.alert('Rate', 'Please provide ratings before submitting.');
      return;
    }
    setSubmitting(true);
    try {
      await api.performance.submitManagerRating(appId, reviewId, {
        ratings,
        feedback_discussion_date: feedbackDate || undefined,
        discussion_notes: feedbackNotes || undefined,
      });
      Alert.alert('Submitted', 'Manager rating submitted.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch {
      Alert.alert('Error', 'Failed to submit manager rating');
    } finally { setSubmitting(false); }
  };

  const handleSubmitFinal = async (status: 'approved' | 'rejected') => {
    if (status === 'rejected' && !rejectionReason.trim()) {
      Alert.alert('Required', 'Please enter a rejection reason.');
      return;
    }
    const ratings = buildPayload();
    setSubmitting(true);
    try {
      await api.performance.submitFinalRating(appId, reviewId, {
        ratings,
        final_approval_status: status,
        rejection_reason: status === 'rejected' ? rejectionReason.trim() : undefined,
      });
      Alert.alert('Done', status === 'approved' ? 'Review approved.' : 'Review rejected.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch {
      Alert.alert('Error', 'Failed to submit final rating');
    } finally { setSubmitting(false); }
  };

  if (loading) return <LoadingSpinner />;
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
          {analytics && (
            <View style={s.analyticsRow}>
              <View style={s.analyticsItem}>
                <Text style={s.analyticsNum}>{analytics.tasksCompleted ?? 0}</Text>
                <Text style={s.analyticsLabel}>Tasks Done</Text>
              </View>
              <View style={s.analyticsDivider} />
              <View style={s.analyticsItem}>
                <Text style={s.analyticsNum}>
                  {typeof analytics.hoursSpent === 'number' ? analytics.hoursSpent.toFixed(1) : '0'}
                </Text>
                <Text style={s.analyticsLabel}>Hours Spent</Text>
              </View>
              <View style={s.analyticsDivider} />
              <View style={s.analyticsItem}>
                <Text style={[s.analyticsNum, { color: colors.danger }]}>{analytics.overdueTasks ?? 0}</Text>
                <Text style={s.analyticsLabel}>Overdue</Text>
              </View>
            </View>
          )}

          {(review.self_rating != null || review.manager_rating != null || review.final_rating != null) && (
            <View style={s.ratingsSummary}>
              {review.self_rating != null && (
                <View style={s.ratingSumItem}>
                  <Text style={s.ratingSumLabel}>Self</Text>
                  <Text style={s.ratingSumNum}>{review.self_rating}/5</Text>
                </View>
              )}
              {review.manager_rating != null && (
                <View style={s.ratingSumItem}>
                  <Text style={s.ratingSumLabel}>Manager</Text>
                  <Text style={s.ratingSumNum}>{review.manager_rating}/5</Text>
                </View>
              )}
              {review.final_rating != null && (
                <View style={s.ratingSumItem}>
                  <Text style={s.ratingSumLabel}>Final</Text>
                  <Text style={[s.ratingSumNum, { color: colors.primary }]}>{review.final_rating}/5</Text>
                </View>
              )}
            </View>
          )}

          {renderSnapSection('goal', snapshots.goals)}
          {renderSnapSection('skill', snapshots.skills)}
          {renderSnapSection('value', snapshots.values)}

          {canManagerRate && (
            <View style={{ marginTop: 16 }}>
              <Text style={s.sectionLabel}>Feedback Discussion</Text>
              <Text style={s.fieldLabel}>Discussion Date</Text>
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
            </View>
          )}

          {canFinalRate && (
            <View style={{ marginTop: 16 }}>
              <Text style={s.sectionLabel}>Final Decision</Text>
              <Text style={s.fieldLabel}>Rejection Reason (required if rejecting)</Text>
              <TextInput
                style={[s.input, s.inputMulti]}
                value={rejectionReason}
                onChangeText={setRejectionReason}
                placeholder="Enter reason if rejecting..."
                placeholderTextColor={colors.gray400}
                multiline
                numberOfLines={3}
              />
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
              style={[s.submitBtn, submitting && s.submitBtnDisabled]}
              onPress={handleSubmitManager}
              disabled={submitting}
            >
              {submitting
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.submitBtnText}>Submit Manager Rating</Text>
              }
            </TouchableOpacity>
          )}

          {canFinalRate && (
            <View style={s.finalBtns}>
              <TouchableOpacity
                style={[s.approveBtn, submitting && s.submitBtnDisabled]}
                onPress={() => handleSubmitFinal('approved')}
                disabled={submitting}
              >
                {submitting
                  ? <ActivityIndicator color="#fff" />
                  : <><Ionicons name="checkmark" size={16} color="#fff" /><Text style={s.approveBtnText}>Approve</Text></>
                }
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.rejectBtn, submitting && s.submitBtnDisabled]}
                onPress={() => handleSubmitFinal('rejected')}
                disabled={submitting}
              >
                {submitting
                  ? <ActivityIndicator color={colors.danger} />
                  : <><Ionicons name="close" size={16} color={colors.danger} /><Text style={s.rejectBtnText}>Reject</Text></>
                }
              </TouchableOpacity>
            </View>
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
    submitBtnText:   { fontSize: 15, color: '#ffffff', fontWeight: '700' },
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
  });
}
