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
import { useTheme } from '../../contexts/ThemeContext';
import { AppColors } from '../../utils/colors';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import LoadError from '../../components/common/LoadError';
import { showAlert } from '../../components/common/AlertModal';
import { useLoadWithTimeout } from '../../hooks/useLoadWithTimeout';
import { PerformanceStackParamList } from '../../navigation/types';
import { formatExact } from '../../utils/format';

type RouteProps = RouteProp<PerformanceStackParamList, 'AppraisalDetail'>;

const REASON_LABELS: Record<string, string> = {
  salary_increment: 'Salary Increment',
  annual_appraisal: 'Annual Appraisal',
  promotion: 'Promotion',
  disciplinary_action: 'Disciplinary Action',
  others: 'Others',
};

const STATUS_LABELS: Record<string, string> = {
  pending_employee: 'Pending Employee',
  pending_manager: 'Pending Manager',
  pending_approver: 'Pending Approver',
  completed: 'Completed',
  rejected: 'Rejected',
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  pending_employee: { bg: 'rgba(59,130,246,0.15)',  text: '#60a5fa' },
  pending_manager:  { bg: 'rgba(245,158,11,0.15)',  text: '#f59e0b' },
  pending_approver: { bg: 'rgba(245,158,11,0.15)',  text: '#f59e0b' },
  completed:        { bg: 'rgba(16,185,129,0.15)',  text: '#10b981' },
  rejected:         { bg: 'rgba(239,68,68,0.15)',   text: '#ef4444' },
};

function StatusBadge({ status }: { status: string }) {
  const c = STATUS_COLORS[status] ?? { bg: 'rgba(107,114,128,0.15)', text: '#9ca3af' };
  return (
    <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: c.bg }}>
      <Text style={{ fontSize: 11, fontWeight: '600', color: c.text }}>
        {STATUS_LABELS[status] ?? status.replace(/_/g, ' ')}
      </Text>
    </View>
  );
}

const RECOMMENDATION_OPTIONS = [
  { value: 'recommend', label: 'Recommend' },
  { value: 'not_recommend', label: 'Not Recommend' },
  { value: 'conditional', label: 'Conditional' },
];
const RECOMMENDATION_LABELS: Record<string, string> = {
  recommend: 'Recommend', not_recommend: 'Not Recommend', conditional: 'Conditional',
};

const EVENT_META: Record<string, { label: string; color: string }> = {
  created:                    { label: 'Appraisal Created',                       color: '#3498db' },
  employee_submitted:         { label: 'Employee Reflection Submitted',           color: '#3498db' },
  manager_submitted:          { label: 'Manager Review Submitted',                color: '#9b59b6' },
  manager_rejected:           { label: 'Sent Back to Employee by Manager',        color: '#e74c3c' },
  final_approved:             { label: 'Final Decision — Approved',               color: '#27ae60' },
  final_rejected_to_manager:  { label: 'Sent Back to Manager by Final Approver',  color: '#e74c3c' },
  final_rejected_to_employee: { label: 'Sent Back to Employee by Final Approver', color: '#e74c3c' },
};
const CURRENT_STAGE_META: Record<string, { label: string; color: string }> = {
  pending_employee: { label: 'Employee Reflection', color: '#f39c12' },
  pending_manager:  { label: 'Manager Review',       color: '#3498db' },
  pending_approver: { label: 'Final Approval',       color: '#3498db' },
};

function personName(u: any): string {
  if (!u) return '';
  return [u.first_name, u.last_name].filter(Boolean).join(' ') || u.email || '';
}

interface TimelineStep {
  key: string; label: string; at: string | null; by: string | null;
  detail: string | null; color: string; done: boolean; current: boolean;
}

function eventDetail(a: any, e: any): string | null {
  if (e.event_type === 'created') {
    return `${REASON_LABELS[a.reason] ?? a.reason}${e.note ? ` — ${e.note}` : ''}`;
  }
  if (e.event_type === 'manager_submitted' && e.note) {
    return RECOMMENDATION_LABELS[e.note] ?? e.note;
  }
  return e.note ?? null;
}

// Full, append-only history — every round trip of a reject-and-resubmit loop
// shows as its own entry, since appraisal_events is never overwritten.
function buildEventTimelineSteps(a: any): TimelineStep[] {
  const steps: TimelineStep[] = (a.events ?? []).map((e: any) => ({
    key: `ev-${e.id}`,
    label: EVENT_META[e.event_type]?.label ?? e.event_type,
    at: e.created_at,
    by: e.actor ? personName(e.actor) : null,
    detail: eventDetail(a, e),
    color: EVENT_META[e.event_type]?.color ?? '#9ca3af',
    done: true,
    current: false,
  }));

  const stage = CURRENT_STAGE_META[a.status];
  if (stage) {
    steps.push({ key: 'current-stage', label: stage.label, at: null, by: null, detail: null, color: stage.color, done: false, current: true });
  } else if (a.status === 'completed') {
    steps.push({ key: 'completed', label: 'Completed', at: a.final_decided_at ?? a.manager_submitted_at ?? null, by: null, detail: 'Appraisal finalized', color: '#27ae60', done: true, current: false });
  }
  return steps;
}

// Fallback for appraisals created before appraisal_events existed — derives
// one step per stage from current-state columns (collapses reject/resubmit
// loops onto the same step since only the latest pass is known).
function buildTimelineSteps(a: any): TimelineStep[] {
  const managerRejectedCurrent = a.rejected_by_stage === 'manager' && a.status === 'pending_employee';
  const approverRejectedCurrent = a.rejected_by_stage === 'final_approver' && a.status === 'pending_employee';
  const approverRejectedToManagerCurrent = a.rejected_by_stage === 'final_approver' && a.status === 'pending_manager';

  const steps: TimelineStep[] = [
    {
      key: 'created', label: 'Appraisal Created', at: a.created_at, by: personName(a.triggered_by),
      detail: `${REASON_LABELS[a.reason] ?? a.reason}${a.reason_notes ? ` — ${a.reason_notes}` : ''}`,
      color: '#3498db', done: true, current: false,
    },
    {
      key: 'employee', label: 'Employee Reflection', at: a.employee_submitted_at ?? null,
      by: a.employee_submitted_at ? personName(a.employee) : null,
      detail: (managerRejectedCurrent || approverRejectedCurrent)
        ? `Sent back by ${approverRejectedCurrent ? 'the Final Approver' : 'the Manager'} — awaiting resubmission: ${a.rejection_reason ?? ''}`
        : null,
      color: (managerRejectedCurrent || approverRejectedCurrent) ? '#e74c3c' : '#3498db',
      done: !!a.employee_submitted_at, current: a.status === 'pending_employee',
    },
    {
      key: 'manager', label: 'Manager Review', at: a.manager_submitted_at ?? null,
      by: a.manager_response?.submitted_by ? personName(a.manager_response.submitted_by) : null,
      detail: approverRejectedToManagerCurrent
        ? `Sent back by the Final Approver — awaiting re-review: ${a.rejection_reason ?? ''}`
        : managerRejectedCurrent
          ? `Sent back to employee: ${a.rejection_reason ?? ''}`
          : (a.manager_response?.recommendation ? RECOMMENDATION_LABELS[a.manager_response.recommendation] : null),
      color: (managerRejectedCurrent || approverRejectedToManagerCurrent) ? '#e74c3c' : '#9b59b6',
      done: !!a.manager_submitted_at, current: a.status === 'pending_manager',
    },
    {
      key: 'approver', label: 'Final Approval', at: a.final_decided_at ?? null,
      by: a.final_decision?.submitted_by ? personName(a.final_decision.submitted_by) : null,
      detail: a.final_decision?.decision_notes ?? null,
      color: (approverRejectedCurrent || a.final_decision?.decision === 'rejected') ? '#e74c3c' : '#9b59b6',
      done: !!a.final_decided_at, current: a.status === 'pending_approver',
    },
    {
      key: 'completed', label: 'Completed',
      at: a.status === 'completed' ? (a.final_decided_at ?? a.manager_submitted_at ?? null) : null,
      by: null, detail: a.status === 'completed' ? 'Appraisal finalized' : null,
      color: '#27ae60', done: a.status === 'completed', current: false,
    },
  ];
  return steps;
}

const REVIEW_STATUS_LABELS: Record<string, string> = {
  pending_self: 'Pending Self-Rating', pending_manager: 'Pending Manager Review',
  pending_approver: 'Pending Final Approval', approved: 'Approved', rejected: 'Rejected',
};
const REVIEW_STATUS_COLORS: Record<string, string> = {
  pending_self: '#f39c12', pending_manager: '#3498db', pending_approver: '#9b59b6',
  approved: '#27ae60', rejected: '#e74c3c',
};

// Simple mean of the given ratings — used for Skills and Values.
// Matches web's AppraisalDashboard `avg()` (2 decimals).
function ratingAvg(ratings: any[]): string | null {
  if (!ratings.length) return null;
  return (ratings.reduce((sum, r) => sum + (r.rating || 0), 0) / ratings.length).toFixed(2);
}

// Goals are weighted by each goal's weightage over the review's TOTAL goal
// weightage (every goal, rated or not) — matches web's AppraisalDashboard
// `weightedAvg()` / the "Goals (Weighted Avg)" card. Pooling goals unweighted
// like skills/values gives a different number for the same review.
function goalWeightedAvg(ratings: any[], totalWeightage: number): string | null {
  if (!ratings.length || !totalWeightage) return null;
  const weighted = ratings.reduce((sum, r) => sum + (r.weightage || 0) * (r.rating || 0), 0);
  return (weighted / totalWeightage).toFixed(2);
}

function Stars({ value, colors }: { value: string | number | null | undefined; colors: AppColors }) {
  if (!value) return <Text style={{ color: colors.textMuted, fontSize: 12 }}>—</Text>;
  const floored = Math.floor(Number(value));
  return (
    <Text style={{ fontSize: 13 }}>
      <Text style={{ color: '#f1c40f' }}>{'★'.repeat(floored)}{'☆'.repeat(5 - floored)}</Text>
      <Text style={{ color: colors.textSecondary, fontSize: 12 }}> ({value})</Text>
    </Text>
  );
}

// Ratings rows carry over as a draft when a stage is rejected back for
// revision, so the row still exists even though it isn't the current,
// finalized submission — only surface stars once that stage has actually
// (re)submitted (matches web's CycleReviewSummary exactly).
function ReviewRatingsSummary({ rs, colors, s, onOpen }: { rs: any; colors: AppColors; s: any; onOpen: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const cycle = rs.cycle ?? rs;
  const review = rs.review ?? rs.performance_review ?? null;
  const cycleName = `${cycle.cycle_name ?? `Cycle #${cycle.id}`}${cycle.year ? ` (${cycle.year})` : ''}`;

  if (!review) {
    return (
      <View style={s.responseBlock}>
        <Text style={s.responseLabel}>{cycleName}</Text>
        <Text style={s.responseText}>No review found for this cycle</Text>
      </View>
    );
  }

  const ratings: any[] = rs.ratings ?? [];
  const selfSubmitted = !['pending_self', 'rejected'].includes(review.status);
  const managerSubmitted = !['pending_self', 'pending_manager', 'rejected'].includes(review.status);
  const byRole = (type: string, role: string) => ratings.filter((r) => r.rating_type === type && r.rater_role === role);
  // Goals use a weightage-weighted average (÷ total goal weightage); skills
  // and values use a plain mean — matches web's CycleReviewSummary.
  const catAvg = (type: string, role: string) => (
    type === 'goal'
      ? goalWeightedAvg(byRole('goal', role), rs.total_goal_weightage ?? 0)
      : ratingAvg(byRole(type, role))
  );

  const categories = [
    { key: 'goal', label: 'Goals', show: rs.has_goals, nameField: 'goal_name' },
    { key: 'skill', label: 'Skills', show: rs.has_skills, nameField: 'skill_name' },
    { key: 'value', label: 'Values', show: rs.has_values, nameField: 'value_name' },
  ];

  return (
    <View style={s.responseBlock}>
      <TouchableOpacity onPress={onOpen} disabled={!review.id}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={s.responseLabel}>{cycleName}</Text>
          <View style={{ backgroundColor: (REVIEW_STATUS_COLORS[review.status] ?? colors.gray400) + '22', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 }}>
            <Text style={{ fontSize: 10, fontWeight: '700', color: REVIEW_STATUS_COLORS[review.status] ?? colors.textMuted }}>
              {REVIEW_STATUS_LABELS[review.status] ?? review.status}
            </Text>
          </View>
        </View>
      </TouchableOpacity>

      <View style={{ marginTop: 6, gap: 3 }}>
        {categories.filter((c) => c.show).map((c) => (
          <View key={c.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ fontSize: 12, color: colors.textSecondary, width: 44 }}>{c.label}</Text>
            <Text style={{ fontSize: 11, color: colors.textMuted }}>Self</Text>
            <Stars value={selfSubmitted ? catAvg(c.key, 'self') : null} colors={colors} />
            <Text style={{ fontSize: 11, color: colors.textMuted, marginLeft: 6 }}>Mgr</Text>
            <Stars value={managerSubmitted ? catAvg(c.key, 'manager') : null} colors={colors} />
          </View>
        ))}
      </View>

      <TouchableOpacity onPress={() => setExpanded((v) => !v)} style={{ marginTop: 6 }}>
        <Text style={{ fontSize: 12, fontWeight: '600', color: colors.primary }}>{expanded ? 'Hide details' : 'Details'}</Text>
      </TouchableOpacity>

      {expanded && !selfSubmitted && (
        <Text style={{ marginTop: 8, fontSize: 12, color: colors.textMuted }}>Self review not started yet.</Text>
      )}
      {expanded && selfSubmitted && ratings.length > 0 && categories.filter((c) => c.show).map((c) => {
        const typeRatings = ratings.filter((r) => r.rating_type === c.key);
        const snapshotIds = [...new Set(typeRatings.map((r) => r.snapshot_id))];
        return (
          <View key={c.key} style={{ marginTop: 10 }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textPrimary, marginBottom: 4 }}>{c.label}</Text>
            {snapshotIds.map((sid) => {
              const group = typeRatings.filter((r) => r.snapshot_id === sid);
              const name = group[0]?.[c.nameField] ?? `#${sid}`;
              const self = group.find((r) => r.rater_role === 'self');
              const mgr = group.find((r) => r.rater_role === 'manager');
              return (
                <View key={sid} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                  <Text style={{ flex: 1, fontSize: 12, color: colors.textPrimary }}>{name}</Text>
                  <Stars value={selfSubmitted ? self?.rating : null} colors={colors} />
                  <Stars value={managerSubmitted ? mgr?.rating : null} colors={colors} />
                </View>
              );
            })}
          </View>
        );
      })}
    </View>
  );
}

function AppraisalTimeline({ a, colors, s }: { a: any; colors: AppColors; s: any }) {
  const steps = (a.events && a.events.length) ? buildEventTimelineSteps(a) : buildTimelineSteps(a);
  return (
    <View style={{ paddingVertical: 4 }}>
      {steps.map((step, i) => (
        <View key={step.key} style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ alignItems: 'center', width: 14 }}>
            <View style={{
              width: 12, height: 12, borderRadius: 6,
              backgroundColor: step.done ? step.color : colors.surface,
              borderWidth: step.done ? 0 : 2,
              borderColor: step.current ? step.color : colors.border,
            }} />
            {i < steps.length - 1 && (
              <View style={{ width: 2, flex: 1, minHeight: 34, backgroundColor: step.done ? step.color : colors.border, opacity: step.done ? 0.35 : 1, marginTop: 2 }} />
            )}
          </View>
          <View style={{ flex: 1, paddingBottom: 20 }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: step.done || step.current ? colors.textPrimary : colors.textMuted }}>
                {step.label}
              </Text>
              {step.current && (
                <Text style={{ fontSize: 11, fontWeight: '600', color: step.color }}>
                  {step.done ? 'Awaiting resubmission' : 'In progress'}
                </Text>
              )}
              {!step.current && step.at && <Text style={{ fontSize: 11, color: colors.textMuted }}>{formatExact(step.at)}</Text>}
              {!step.current && !step.done && <Text style={{ fontSize: 11, color: colors.textMuted }}>Pending</Text>}
            </View>
            {step.by && <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>by {step.by}</Text>}
            {step.detail && (
              <Text style={{ fontSize: 12, color: step.color === '#e74c3c' ? '#e74c3c' : colors.textSecondary, marginTop: 4, lineHeight: 17, fontWeight: step.color === '#e74c3c' ? '500' : '400' }}>
                {step.detail}
              </Text>
            )}
          </View>
        </View>
      ))}
    </View>
  );
}

export default function AppraisalDetailScreen() {
  const route = useRoute<RouteProps>();
  const { appraisalId, appId } = route.params;
  const navigation = useNavigation<any>();
  const api = useApi();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();

  const { loading, loadError, run } = useLoadWithTimeout();
  const [submitting, setSubmitting] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [appraisal, setAppraisal] = useState<any>(null);
  const [employeeResponse, setEmployeeResponse] = useState<any>(null);
  const [managerResponse, setManagerResponse] = useState<any>(null);
  const [finalDecision, setFinalDecision] = useState<any>(null);
  const [reviewSummaries, setReviewSummaries] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [isEmployee, setIsEmployee] = useState(false);
  const [isManager, setIsManager] = useState(false);
  const [isFinalApprover, setIsFinalApprover] = useState(false);
  // Who's driving this appraisal — shown so it's clear who's being waited on,
  // matching web's Overview tab (previously mobile only showed the employee).
  const [showTimeline, setShowTimeline] = useState(false);
  const [manager, setManager] = useState<any>(null);
  const [finalApprovers, setFinalApprovers] = useState<any[]>([]);

  // Employee form
  const [thingsWentWell, setThingsWentWell] = useState('');
  const [couldBeBetter, setCouldBeBetter] = useState('');
  const [nextTermAspirations, setNextTermAspirations] = useState('');
  const [supportRequired, setSupportRequired] = useState('');

  // Manager form
  const [goalsFeedback, setGoalsFeedback] = useState('');
  const [skillsFeedback, setSkillsFeedback] = useState('');
  const [valuesFeedback, setValuesFeedback] = useState('');
  const [potentialAssessment, setPotentialAssessment] = useState('');
  const [recommendation, setRecommendation] = useState('');
  const [recommendationNotes, setRecommendationNotes] = useState('');
  // Sends the appraisal back to the employee to edit and resubmit, instead
  // of a recommendation that always advances to the final approver.
  const [managerRejecting, setManagerRejecting] = useState(false);
  const [managerRejectReason, setManagerRejectReason] = useState('');
  const [rejectingManager, setRejectingManager] = useState(false);

  // Final decision — reject_target is required by the backend whenever
  // decision is 'rejected' (determines whether it bounces back to the
  // manager or the employee); previously mobile never sent it at all, so
  // rejecting from mobile always failed with a 400.
  const [decisionNotes, setDecisionNotes] = useState('');
  const [rejectTarget, setRejectTarget] = useState<'manager' | 'employee' | null>(null);

  const load = useCallback(async () => {
    const res = await api.performance.getAppraisal(appId, appraisalId);
    const data = res.data;
    const appr = data.appraisal ?? data;
    setAppraisal(appr);
    setEmployeeResponse(data.employee_response ?? null);
    setManagerResponse(data.manager_response ?? null);
    setFinalDecision(data.final_decision ?? null);
    setReviewSummaries(data.review_summaries ?? []);
    setEvents(data.events ?? []);
    setIsEmployee(!!data.is_employee);
    setIsManager(!!data.is_manager);
    setIsFinalApprover(!!data.is_final_approver);
    setManager(data.manager ?? null);
    setFinalApprovers(data.final_approvers ?? []);

    if (data.employee_response) {
      setThingsWentWell(data.employee_response.things_went_well ?? '');
      setCouldBeBetter(data.employee_response.could_be_better ?? '');
      setNextTermAspirations(data.employee_response.next_term_aspirations ?? '');
      setSupportRequired(data.employee_response.support_required ?? '');
    }
    if (data.manager_response) {
      setGoalsFeedback(data.manager_response.goals_feedback ?? '');
      setSkillsFeedback(data.manager_response.skills_feedback ?? '');
      setValuesFeedback(data.manager_response.values_feedback ?? '');
      setPotentialAssessment(data.manager_response.potential_assessment ?? '');
      setRecommendation(data.manager_response.recommendation ?? '');
      setRecommendationNotes(data.manager_response.recommendation_notes ?? '');
    }
    if (data.final_decision) {
      setDecisionNotes(data.final_decision.decision_notes ?? '');
    } else if (appr.draft_decision_notes || appr.draft_reject_target) {
      // Restore an in-progress (never submitted) final-decision draft.
      setDecisionNotes(appr.draft_decision_notes ?? '');
      setRejectTarget(appr.draft_reject_target ?? null);
    }
  }, [appId, appraisalId, api]);

  useEffect(() => { run(load); }, [load]);

  const appraisalObj = appraisal ?? {};
  // A saved draft still leaves the appraisal in 'pending_employee' — gating
  // on `!employeeResponse` used to hide the form forever after the first
  // Save Draft, since is_draft only flips to false on actual submission.
  const canEmployeeRespond = isEmployee && appraisalObj.status === 'pending_employee';
  const canManagerRespond = isManager && appraisalObj.status === 'pending_manager';
  const canFinalDecide = isFinalApprover && appraisalObj.status === 'pending_approver';

  // Matches the backend's own validation exactly (performance.js POST
  // /appraisals/:id/employee-response) — all four fields required, not just
  // "what went well". Submitting with the others blank used to succeed
  // client-side and only fail once it hit the server.
  const employeeFieldsComplete = !!(thingsWentWell.trim() && couldBeBetter.trim() && nextTermAspirations.trim() && supportRequired.trim());
  const doEmployeeSubmit = async () => {
    setSubmitting(true);
    try {
      await api.performance.submitEmployeeResponse(appId, appraisalId, {
        things_went_well: thingsWentWell.trim(),
        could_be_better: couldBeBetter.trim(),
        next_term_aspirations: nextTermAspirations.trim(),
        support_required: supportRequired.trim(),
      });
      Alert.alert('Submitted', 'Your self-reflection has been submitted.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch {
      Alert.alert('Error', 'Failed to submit response');
    } finally { setSubmitting(false); }
  };
  // Confirm before submitting — matches web's AppraisalDetail (window.confirm).
  const handleEmployeeSubmit = () => {
    if (!employeeFieldsComplete) { Alert.alert('Required', 'Please fill in all fields before submitting.'); return; }
    showAlert('Submit reflection?', 'Submit your reflection for manager review?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Submit', onPress: doEmployeeSubmit },
    ]);
  };

  const handleEmployeeSaveDraft = async () => {
    setSavingDraft(true);
    try {
      await api.performance.saveEmployeeResponseDraft(appId, appraisalId, {
        things_went_well: thingsWentWell.trim(),
        could_be_better: couldBeBetter.trim(),
        next_term_aspirations: nextTermAspirations.trim(),
        support_required: supportRequired.trim(),
      });
      Alert.alert('Draft Saved', 'Your progress has been saved. You can finish this later.');
    } catch {
      Alert.alert('Error', 'Failed to save draft');
    } finally { setSavingDraft(false); }
  };

  // Matches the backend exactly (POST /appraisals/:id/manager-response) —
  // recommendation plus all five feedback/assessment fields are required,
  // not just the recommendation choice.
  const managerFieldsComplete = !!(
    recommendation && goalsFeedback.trim() && skillsFeedback.trim() &&
    valuesFeedback.trim() && potentialAssessment.trim() && recommendationNotes.trim()
  );
  const doManagerSubmit = async () => {
    setSubmitting(true);
    try {
      await api.performance.submitManagerResponse(appId, appraisalId, {
        goals_feedback: goalsFeedback.trim(),
        skills_feedback: skillsFeedback.trim(),
        values_feedback: valuesFeedback.trim(),
        potential_assessment: potentialAssessment.trim(),
        recommendation,
        recommendation_notes: recommendationNotes.trim(),
      });
      Alert.alert('Submitted', 'Manager review submitted.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch {
      Alert.alert('Error', 'Failed to submit review');
    } finally { setSubmitting(false); }
  };
  const handleManagerSubmit = () => {
    if (!managerFieldsComplete) { Alert.alert('Required', 'Please select a recommendation and fill in all feedback fields.'); return; }
    showAlert('Submit manager review?', 'Submit your manager feedback for this appraisal?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Submit', onPress: doManagerSubmit },
    ]);
  };

  const handleManagerSaveDraft = async () => {
    setSavingDraft(true);
    try {
      await api.performance.saveManagerResponseDraft(appId, appraisalId, {
        goals_feedback: goalsFeedback.trim(),
        skills_feedback: skillsFeedback.trim(),
        values_feedback: valuesFeedback.trim(),
        potential_assessment: potentialAssessment.trim(),
        recommendation: recommendation || undefined,
        recommendation_notes: recommendationNotes.trim(),
      });
      Alert.alert('Draft Saved', 'Your progress has been saved. You can finish this later.');
    } catch {
      Alert.alert('Error', 'Failed to save draft');
    } finally { setSavingDraft(false); }
  };

  const doManagerReject = async () => {
    setRejectingManager(true);
    try {
      await api.performance.managerReject(appId, appraisalId, { rejection_reason: managerRejectReason.trim() });
      Alert.alert('Sent Back', 'This appraisal has been sent back to the employee.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch {
      Alert.alert('Error', 'Failed to send back to employee');
    } finally { setRejectingManager(false); }
  };
  const handleManagerReject = () => {
    if (!managerRejectReason.trim()) { Alert.alert('Required', 'Please add a reason for sending this back.'); return; }
    showAlert('Send back to employee?', 'Send this appraisal back to the employee for revision?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Send Back', style: 'destructive', onPress: doManagerReject },
    ]);
  };

  const doFinalDecision = async (d: 'approved' | 'rejected') => {
    setSubmitting(true);
    try {
      await api.performance.submitFinalDecision(appId, appraisalId, {
        decision: d,
        decision_notes: decisionNotes.trim(),
        ...(d === 'rejected' ? { reject_target: rejectTarget } : {}),
      });
      Alert.alert('Done', d === 'approved' ? 'Appraisal approved.' : 'Appraisal rejected.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch {
      Alert.alert('Error', 'Failed to submit decision');
    } finally { setSubmitting(false); }
  };
  const handleFinalDecision = (d: 'approved' | 'rejected') => {
    if (!decisionNotes.trim()) { Alert.alert('Required', 'Please add decision notes.'); return; }
    if (d === 'rejected' && !rejectTarget) { Alert.alert('Required', 'Choose whether to send this back to the manager or the employee.'); return; }
    if (d === 'approved') {
      showAlert('Approve appraisal?', 'Approve this appraisal? This finalizes the decision.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Approve', onPress: () => doFinalDecision('approved') },
      ]);
    } else {
      showAlert('Send back?', `Send this appraisal back to the ${rejectTarget === 'manager' ? 'manager' : 'employee'} for revision?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Send Back', style: 'destructive', onPress: () => doFinalDecision('rejected') },
      ]);
    }
  };

  const handleFinalSaveDraft = async () => {
    setSavingDraft(true);
    try {
      await api.performance.saveFinalDecisionDraft(appId, appraisalId, {
        decision_notes: decisionNotes.trim(),
        reject_target: rejectTarget ?? undefined,
      });
      Alert.alert('Draft Saved', 'Your progress has been saved. You can finish this later.');
    } catch {
      Alert.alert('Error', 'Failed to save draft');
    } finally { setSavingDraft(false); }
  };

  if (loading) return <LoadingSpinner />;
  if (loadError) return <LoadError onRetry={() => run(load)} />;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[s.container, { paddingTop: insets.top }]}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
            <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={s.headerTitle} numberOfLines={1}>
              {appraisalObj.employee
                ? [appraisalObj.employee.first_name, appraisalObj.employee.last_name].filter(Boolean).join(' ')
                : REASON_LABELS[appraisalObj.reason] ?? `Appraisal #${appraisalId}`}
            </Text>
            {appraisalObj.reason && (
              <Text style={s.headerSub}>{REASON_LABELS[appraisalObj.reason] ?? appraisalObj.reason}</Text>
            )}
          </View>
          {appraisalObj.status && <StatusBadge status={appraisalObj.status} />}
        </View>

        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

          {/* "Sent back by your Manager" is meaningless read back to the
              manager who did the sending — once the employee resubmits and
              it's their turn again, showing them a banner about their own
              past action is just confusing. Matches web's guard exactly. */}
          {appraisalObj.rejection_reason && !(isManager && appraisalObj.status === 'pending_manager' && appraisalObj.rejected_by_stage === 'manager') && (
            <View style={s.rejectionBanner}>
              <Text style={s.rejectionBannerTitle}>
                {(appraisalObj.status === 'pending_employee' || appraisalObj.status === 'pending_manager') ? 'Sent back' : 'Previously sent back'} by{' '}
                {appraisalObj.rejected_by_stage === 'final_approver' ? 'the Final Approver' : 'your Manager'}
                {appraisalObj.status === 'pending_employee' ? ' — please edit and resubmit' : ''}
                {appraisalObj.status === 'pending_manager' ? ' — please review again' : ''}
              </Text>
              <Text style={s.rejectionBannerBody}>{appraisalObj.rejection_reason}</Text>
            </View>
          )}

          {(manager || finalApprovers.length > 0) && (
            <View style={s.peopleRow}>
              {manager && (
                <View style={s.peopleChip}>
                  <Text style={s.peopleChipLabel}>Manager</Text>
                  <Text style={s.peopleChipName}>{[manager.first_name, manager.last_name].filter(Boolean).join(' ') || manager.email}</Text>
                </View>
              )}
              {finalApprovers.length > 0 && (
                <View style={s.peopleChip}>
                  <Text style={s.peopleChipLabel}>Final Approver{finalApprovers.length > 1 ? 's' : ''}</Text>
                  <Text style={s.peopleChipName}>
                    {finalApprovers.map((u) => [u.first_name, u.last_name].filter(Boolean).join(' ') || u.email).join(', ')}
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* Timeline — full history including every round trip of a
              reject-and-resubmit loop (web's Timeline tab). Collapsed by
              default on mobile so the action form stays reachable without
              scrolling past it. */}
          <TouchableOpacity style={s.timelineToggle} onPress={() => setShowTimeline((v) => !v)}>
            <Text style={s.sectionTitle}>Timeline</Text>
            <Ionicons name={showTimeline ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textSecondary} />
          </TouchableOpacity>
          {showTimeline && (
            <AppraisalTimeline
              a={{ ...appraisalObj, events, employee_response: employeeResponse, manager_response: managerResponse, final_decision: finalDecision }}
              colors={colors}
              s={s}
            />
          )}

          {/* Linked performance reviews for this appraisal's included cycles —
              goal/skill/value rating breakdown (matches web's Review Ratings
              tab / CycleReviewSummary), not just status + final score. */}
          {reviewSummaries.length > 0 && (
            <>
              <Text style={s.sectionTitle}>Review Ratings</Text>
              {reviewSummaries.map((rs: any, i: number) => (
                <ReviewRatingsSummary
                  key={rs.cycle?.id ?? i}
                  rs={rs}
                  colors={colors}
                  s={s}
                  onOpen={() => {
                    const review = rs.review ?? rs.performance_review ?? null;
                    if (review?.id) navigation.navigate('ReviewDetail', { reviewId: review.id, appId });
                  }}
                />
              ))}
            </>
          )}

          {/* Employee self-reflection form */}
          {canEmployeeRespond && (
            <>
              <Text style={s.sectionTitle}>Your Self-Reflection</Text>
              <Text style={s.fieldLabel}>What went well? *</Text>
              <TextInput style={[s.input, s.inputMulti]} value={thingsWentWell} onChangeText={setThingsWentWell}
                placeholder="Describe your achievements and wins..." placeholderTextColor={colors.gray400} multiline numberOfLines={4} />
              <Text style={s.fieldLabel}>What could be better?</Text>
              <TextInput style={[s.input, s.inputMulti]} value={couldBeBetter} onChangeText={setCouldBeBetter}
                placeholder="Areas for improvement..." placeholderTextColor={colors.gray400} multiline numberOfLines={4} />
              <Text style={s.fieldLabel}>Next term aspirations</Text>
              <TextInput style={[s.input, s.inputMulti]} value={nextTermAspirations} onChangeText={setNextTermAspirations}
                placeholder="Goals and aspirations for next period..." placeholderTextColor={colors.gray400} multiline numberOfLines={4} />
              <Text style={s.fieldLabel}>Support required</Text>
              <TextInput style={[s.input, s.inputMulti]} value={supportRequired} onChangeText={setSupportRequired}
                placeholder="What support do you need?" placeholderTextColor={colors.gray400} multiline numberOfLines={3} />
              <View style={s.actionRow}>
                <TouchableOpacity style={[s.draftBtn, savingDraft && s.submitBtnDisabled]} onPress={handleEmployeeSaveDraft} disabled={savingDraft || submitting}>
                  {savingDraft ? <ActivityIndicator color={colors.primary} /> : <Text style={s.draftBtnText}>Save Draft</Text>}
                </TouchableOpacity>
                <TouchableOpacity style={[s.submitBtn, s.submitBtnFlex, (submitting || !employeeFieldsComplete) && s.submitBtnDisabled]} onPress={handleEmployeeSubmit} disabled={submitting || savingDraft}>
                  {submitting ? <ActivityIndicator color="#fff" /> : <Text style={s.submitBtnText}>Submit Self-Reflection</Text>}
                </TouchableOpacity>
              </View>
            </>
          )}

          {/* Existing employee response (read-only) */}
          {employeeResponse && !canEmployeeRespond && (
            <>
              <Text style={s.sectionTitle}>Employee Self-Reflection</Text>
              {employeeResponse.things_went_well ? (
                <View style={s.responseBlock}>
                  <Text style={s.responseLabel}>What went well</Text>
                  <Text style={s.responseText}>{employeeResponse.things_went_well}</Text>
                </View>
              ) : null}
              {employeeResponse.could_be_better ? (
                <View style={s.responseBlock}>
                  <Text style={s.responseLabel}>Could be better</Text>
                  <Text style={s.responseText}>{employeeResponse.could_be_better}</Text>
                </View>
              ) : null}
              {employeeResponse.next_term_aspirations ? (
                <View style={s.responseBlock}>
                  <Text style={s.responseLabel}>Next term aspirations</Text>
                  <Text style={s.responseText}>{employeeResponse.next_term_aspirations}</Text>
                </View>
              ) : null}
              {employeeResponse.support_required ? (
                <View style={s.responseBlock}>
                  <Text style={s.responseLabel}>Support required</Text>
                  <Text style={s.responseText}>{employeeResponse.support_required}</Text>
                </View>
              ) : null}
            </>
          )}

          {/* Manager review form */}
          {canManagerRespond && (
            <>
              <Text style={s.sectionTitle}>Manager Review</Text>
              <Text style={s.fieldLabel}>Goals Feedback</Text>
              <TextInput style={[s.input, s.inputMulti]} value={goalsFeedback} onChangeText={setGoalsFeedback}
                placeholder="Feedback on goal performance..." placeholderTextColor={colors.gray400} multiline numberOfLines={4} />
              <Text style={s.fieldLabel}>Skills Feedback</Text>
              <TextInput style={[s.input, s.inputMulti]} value={skillsFeedback} onChangeText={setSkillsFeedback}
                placeholder="Feedback on skills demonstrated..." placeholderTextColor={colors.gray400} multiline numberOfLines={4} />
              <Text style={s.fieldLabel}>Values Feedback</Text>
              <TextInput style={[s.input, s.inputMulti]} value={valuesFeedback} onChangeText={setValuesFeedback}
                placeholder="Feedback on values alignment..." placeholderTextColor={colors.gray400} multiline numberOfLines={4} />
              <Text style={s.fieldLabel}>Potential Assessment</Text>
              <TextInput style={[s.input, s.inputMulti]} value={potentialAssessment} onChangeText={setPotentialAssessment}
                placeholder="Assessment of employee potential..." placeholderTextColor={colors.gray400} multiline numberOfLines={3} />
              <Text style={s.fieldLabel}>Recommendation *</Text>
              <View style={s.chipRow}>
                {RECOMMENDATION_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt.value}
                    style={[s.chip, recommendation === opt.value && s.chipActive]}
                    onPress={() => setRecommendation(opt.value)}
                  >
                    <Text style={[s.chipText, recommendation === opt.value && s.chipTextActive]}>{opt.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={s.fieldLabel}>Recommendation Notes</Text>
              <TextInput style={[s.input, s.inputMulti]} value={recommendationNotes} onChangeText={setRecommendationNotes}
                placeholder="Additional notes on recommendation..." placeholderTextColor={colors.gray400} multiline numberOfLines={3} />
              <View style={s.actionRow}>
                <TouchableOpacity style={[s.draftBtn, savingDraft && s.submitBtnDisabled]} onPress={handleManagerSaveDraft} disabled={savingDraft || submitting}>
                  {savingDraft ? <ActivityIndicator color={colors.primary} /> : <Text style={s.draftBtnText}>Save Draft</Text>}
                </TouchableOpacity>
                <TouchableOpacity style={[s.submitBtn, s.submitBtnFlex, (submitting || !managerFieldsComplete) && s.submitBtnDisabled]} onPress={handleManagerSubmit} disabled={submitting || savingDraft}>
                  {submitting ? <ActivityIndicator color="#fff" /> : <Text style={s.submitBtnText}>Submit Manager Review</Text>}
                </TouchableOpacity>
              </View>

              {managerRejecting ? (
                <View style={s.reviewSection}>
                  <Text style={s.fieldLabel}>Reason for sending back *</Text>
                  <TextInput style={[s.input, s.inputMulti]} value={managerRejectReason} onChangeText={setManagerRejectReason}
                    placeholder="What needs to change before resubmitting?" placeholderTextColor={colors.gray400} multiline numberOfLines={3} />
                  <View style={s.finalBtns}>
                    <TouchableOpacity style={s.draftBtn} onPress={() => { setManagerRejecting(false); setManagerRejectReason(''); }} disabled={rejectingManager}>
                      <Text style={s.draftBtnText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[s.rejectBtn, (rejectingManager || !managerRejectReason.trim()) && s.submitBtnDisabled]} onPress={handleManagerReject} disabled={rejectingManager}>
                      {rejectingManager ? <ActivityIndicator color={colors.danger} /> : <><Ionicons name="arrow-undo" size={16} color={colors.danger} /><Text style={s.rejectBtnText}>Send Back</Text></>}
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <TouchableOpacity style={s.sendBackLink} onPress={() => setManagerRejecting(true)} disabled={submitting || savingDraft}>
                  <Ionicons name="arrow-undo-outline" size={14} color={colors.danger} />
                  <Text style={s.sendBackLinkText}>Send back to employee instead</Text>
                </TouchableOpacity>
              )}
            </>
          )}

          {/* Existing manager response (read-only) */}
          {managerResponse && !canManagerRespond && (
            <>
              <Text style={s.sectionTitle}>Manager Review</Text>
              {managerResponse.goals_feedback ? (
                <View style={s.responseBlock}>
                  <Text style={s.responseLabel}>Goals feedback</Text>
                  <Text style={s.responseText}>{managerResponse.goals_feedback}</Text>
                </View>
              ) : null}
              {managerResponse.skills_feedback ? (
                <View style={s.responseBlock}>
                  <Text style={s.responseLabel}>Skills feedback</Text>
                  <Text style={s.responseText}>{managerResponse.skills_feedback}</Text>
                </View>
              ) : null}
              {managerResponse.values_feedback ? (
                <View style={s.responseBlock}>
                  <Text style={s.responseLabel}>Values feedback</Text>
                  <Text style={s.responseText}>{managerResponse.values_feedback}</Text>
                </View>
              ) : null}
              {managerResponse.recommendation ? (
                <View style={s.responseBlock}>
                  <Text style={s.responseLabel}>Recommendation</Text>
                  <View style={s.recommendationBadge}>
                    <Text style={s.recommendationText}>
                      {RECOMMENDATION_OPTIONS.find(o => o.value === managerResponse.recommendation)?.label ?? managerResponse.recommendation}
                    </Text>
                  </View>
                </View>
              ) : null}
            </>
          )}

          {/* Final decision form */}
          {canFinalDecide && (
            <>
              <Text style={s.sectionTitle}>Final Decision</Text>
              <Text style={s.fieldLabel}>Decision Notes *</Text>
              <TextInput style={[s.input, s.inputMulti]} value={decisionNotes} onChangeText={setDecisionNotes}
                placeholder="Notes on your decision..." placeholderTextColor={colors.gray400} multiline numberOfLines={4} />
              <Text style={s.fieldLabel}>If rejecting, send back to *</Text>
              <View style={s.chipRow}>
                {(['manager', 'employee'] as const).map((target) => (
                  <TouchableOpacity
                    key={target}
                    style={[s.chip, rejectTarget === target && s.chipActive]}
                    onPress={() => setRejectTarget(target)}
                  >
                    <Text style={[s.chipText, rejectTarget === target && s.chipTextActive]}>
                      {target === 'manager' ? 'Manager' : 'Employee'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity style={[s.draftBtn, { marginTop: 16 }, savingDraft && s.submitBtnDisabled]} onPress={handleFinalSaveDraft} disabled={savingDraft || submitting}>
                {savingDraft ? <ActivityIndicator color={colors.primary} /> : <Text style={s.draftBtnText}>Save Draft</Text>}
              </TouchableOpacity>
              <View style={s.finalBtns}>
                <TouchableOpacity style={[s.approveBtn, (submitting || !decisionNotes.trim()) && s.submitBtnDisabled]} onPress={() => handleFinalDecision('approved')} disabled={submitting || savingDraft}>
                  {submitting
                    ? <ActivityIndicator color="#fff" />
                    : <><Ionicons name="checkmark" size={16} color="#fff" /><Text style={s.approveBtnText}>Approve</Text></>
                  }
                </TouchableOpacity>
                <TouchableOpacity style={[s.rejectBtn, (submitting || !decisionNotes.trim() || !rejectTarget) && s.submitBtnDisabled]} onPress={() => handleFinalDecision('rejected')} disabled={submitting || savingDraft}>
                  {submitting
                    ? <ActivityIndicator color={colors.danger} />
                    : <><Ionicons name="close" size={16} color={colors.danger} /><Text style={s.rejectBtnText}>Reject</Text></>
                  }
                </TouchableOpacity>
              </View>
            </>
          )}

          {/* Existing final decision — suppressed while the active decision
              form above is showing, otherwise a stale decision from an
              earlier reject-and-resubmit round duplicates it (matches web's
              `!showFinalDecisionForm` guard on the final_view tab). */}
          {finalDecision && !canFinalDecide && (
            <View style={{ marginTop: 16 }}>
              <Text style={s.sectionTitle}>Final Decision</Text>
              <View style={[s.decisionBadge, finalDecision.decision === 'approved' ? s.approvedBadge : s.rejectedBadge]}>
                <Text style={[s.decisionText, { color: finalDecision.decision === 'approved' ? '#10b981' : '#ef4444' }]}>
                  {finalDecision.decision === 'approved' ? 'Approved' : 'Rejected'}
                </Text>
              </View>
              {finalDecision.decision_notes ? (
                <Text style={[s.responseText, { marginTop: 8 }]}>{finalDecision.decision_notes}</Text>
              ) : null}
            </View>
          )}

          {/* View-only placeholder when nothing to do */}
          {!canEmployeeRespond && !canManagerRespond && !canFinalDecide && !employeeResponse && !managerResponse && !finalDecision && (
            <View style={s.viewOnlyBanner}>
              <Ionicons name="eye-outline" size={16} color={colors.textSecondary} />
              <Text style={s.viewOnlyText}>No actions required from you at this stage</Text>
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
    container:          { flex: 1, backgroundColor: c.background },
    header:             {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingHorizontal: 16, paddingVertical: 14,
      backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border,
    },
    backBtn:            { padding: 4 },
    headerTitle:        { fontSize: 17, fontWeight: '700', color: c.textPrimary, fontFamily: SERIF },
    headerSub:          { fontSize: 12, color: c.textSecondary, marginTop: 2 },
    content:            { padding: 16, paddingBottom: 48 },
    rejectionBanner:    {
      backgroundColor: '#e74c3c15', borderWidth: 1, borderColor: '#e74c3c40',
      borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 16,
    },
    rejectionBannerTitle: { fontSize: 13, fontWeight: '700', color: '#e74c3c', marginBottom: 2 },
    rejectionBannerBody:  { fontSize: 13, color: c.textSecondary },
    peopleRow:          { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
    peopleChip:         {
      backgroundColor: c.gray50, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
      borderWidth: 1, borderColor: c.border, flexGrow: 1,
    },
    peopleChipLabel:    { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, color: c.textMuted },
    peopleChipName:     { fontSize: 13, fontWeight: '600', color: c.textPrimary, marginTop: 2 },
    actionRow:          { flexDirection: 'row', gap: 10, marginTop: 20 },
    draftBtn:           {
      paddingHorizontal: 16, paddingVertical: 14, borderRadius: 12,
      borderWidth: 1.5, borderColor: c.primary, alignItems: 'center', justifyContent: 'center',
    },
    draftBtnText:       { fontSize: 14, fontWeight: '700', color: c.primary },
    submitBtnFlex:      { flex: 1, marginTop: 0 },
    sendBackLink:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 14, paddingVertical: 8 },
    sendBackLinkText:   { fontSize: 13, fontWeight: '600', color: c.danger },
    reviewSection:      { marginTop: 8, paddingTop: 16, borderTopWidth: 1, borderTopColor: c.border },
    sectionTitle:       { fontSize: 16, fontWeight: '700', color: c.textPrimary, marginTop: 8, marginBottom: 12 },
    timelineToggle:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    fieldLabel:         { fontSize: 13, fontWeight: '600', color: c.textSecondary, marginBottom: 6, marginTop: 12 },
    input:              {
      borderWidth: 1, borderColor: c.border, borderRadius: 10,
      paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: c.textPrimary,
      backgroundColor: c.gray50,
    },
    inputMulti:         { minHeight: 80, textAlignVertical: 'top' },
    chipRow:            { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
    chip:               {
      paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
      borderWidth: 1.5, borderColor: c.border, backgroundColor: c.surface,
    },
    chipActive:         { backgroundColor: c.primary, borderColor: c.primary },
    chipText:           { fontSize: 13, fontWeight: '500', color: c.textSecondary },
    chipTextActive:     { color: '#ffffff' },
    submitBtn:          {
      marginTop: 20, backgroundColor: c.primary, borderRadius: 12,
      paddingVertical: 14, alignItems: 'center',
    },
    submitBtnDisabled:  { opacity: 0.5 },
    submitBtnText:      { fontSize: 15, color: '#ffffff', fontWeight: '700' },
    responseBlock:      {
      backgroundColor: c.surface, borderRadius: 10, padding: 14, marginBottom: 10,
      borderWidth: 1, borderColor: c.border,
    },
    responseLabel:      {
      fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5,
      color: c.textSecondary, marginBottom: 6,
    },
    responseText:       { fontSize: 14, color: c.textPrimary, lineHeight: 20 },
    recommendationBadge: {
      alignSelf: 'flex-start', backgroundColor: c.primaryLight,
      paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, marginTop: 4,
    },
    recommendationText: { fontSize: 13, fontWeight: '600', color: c.primary },
    finalBtns:          { flexDirection: 'row', gap: 12, marginTop: 20 },
    approveBtn:         {
      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      gap: 6, paddingVertical: 14, borderRadius: 12, backgroundColor: c.success,
    },
    approveBtnText:     { fontSize: 14, fontWeight: '700', color: '#ffffff' },
    rejectBtn:          {
      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      gap: 6, paddingVertical: 14, borderRadius: 12,
      backgroundColor: c.dangerLight, borderWidth: 1, borderColor: c.danger + '44',
    },
    rejectBtnText:      { fontSize: 14, fontWeight: '700', color: c.danger },
    decisionBadge:      { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, alignSelf: 'flex-start' },
    approvedBadge:      { backgroundColor: 'rgba(16,185,129,0.15)' },
    rejectedBadge:      { backgroundColor: 'rgba(239,68,68,0.15)' },
    decisionText:       { fontSize: 14, fontWeight: '700' },
    viewOnlyBanner:     {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: c.gray100, borderRadius: 10, padding: 12, marginTop: 20,
    },
    viewOnlyText:       { fontSize: 13, color: c.textSecondary, flex: 1 },
  });
}
