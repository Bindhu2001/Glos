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
import { useLoadWithTimeout } from '../../hooks/useLoadWithTimeout';
import { PerformanceStackParamList } from '../../navigation/types';

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
  const [appraisal, setAppraisal] = useState<any>(null);
  const [employeeResponse, setEmployeeResponse] = useState<any>(null);
  const [managerResponse, setManagerResponse] = useState<any>(null);
  const [finalDecision, setFinalDecision] = useState<any>(null);
  const [reviewSummaries, setReviewSummaries] = useState<any[]>([]);
  const [isEmployee, setIsEmployee] = useState(false);
  const [isManager, setIsManager] = useState(false);
  const [isFinalApprover, setIsFinalApprover] = useState(false);

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

  // Final decision
  const [decisionNotes, setDecisionNotes] = useState('');

  const load = useCallback(async () => {
    const res = await api.performance.getAppraisal(appId, appraisalId);
    const data = res.data;
    const appr = data.appraisal ?? data;
    setAppraisal(appr);
    setEmployeeResponse(data.employee_response ?? null);
    setManagerResponse(data.manager_response ?? null);
    setFinalDecision(data.final_decision ?? null);
    setReviewSummaries(data.review_summaries ?? []);
    setIsEmployee(!!data.is_employee);
    setIsManager(!!data.is_manager);
    setIsFinalApprover(!!data.is_final_approver);

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
    }
  }, [appId, appraisalId, api]);

  useEffect(() => { run(load); }, [load]);

  const appraisalObj = appraisal ?? {};
  const canEmployeeRespond = isEmployee && appraisalObj.status === 'pending_employee' && !employeeResponse;
  const canManagerRespond = isManager && appraisalObj.status === 'pending_manager';
  const canFinalDecide = isFinalApprover && appraisalObj.status === 'pending_approver';

  const handleEmployeeSubmit = async () => {
    if (!thingsWentWell.trim()) { Alert.alert('Required', 'Please fill in what went well.'); return; }
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

  const handleManagerSubmit = async () => {
    if (!recommendation) { Alert.alert('Required', 'Please select a recommendation.'); return; }
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

  const handleFinalDecision = async (d: 'approved' | 'rejected') => {
    setSubmitting(true);
    try {
      await api.performance.submitFinalDecision(appId, appraisalId, {
        decision: d,
        decision_notes: decisionNotes.trim(),
      });
      Alert.alert('Done', d === 'approved' ? 'Appraisal approved.' : 'Appraisal rejected.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch {
      Alert.alert('Error', 'Failed to submit decision');
    } finally { setSubmitting(false); }
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

          {/* Linked performance reviews for this appraisal's included cycles */}
          {reviewSummaries.length > 0 && (
            <>
              <Text style={s.sectionTitle}>Linked Reviews</Text>
              {reviewSummaries.map((rs: any, i: number) => {
                const cycle = rs.cycle ?? rs;
                const review = rs.review ?? rs.performance_review ?? null;
                return (
                  <TouchableOpacity
                    key={rs.id ?? cycle.id ?? i}
                    style={s.responseBlock}
                    activeOpacity={review?.id ? 0.7 : 1}
                    onPress={() => review?.id && navigation.navigate('ReviewDetail', { reviewId: review.id, appId })}
                  >
                    <Text style={s.responseLabel}>{cycle.cycle_name ?? `Cycle #${cycle.id ?? i + 1}`}{cycle.year ? ` (${cycle.year})` : ''}</Text>
                    {review ? (
                      <>
                        <Text style={s.responseText}>Status: {(review.status ?? '').replace(/_/g, ' ') || '—'}</Text>
                        {review.final_score != null && <Text style={s.responseText}>Final Score: {review.final_score}/5</Text>}
                      </>
                    ) : (
                      <Text style={s.responseText}>No review found for this cycle</Text>
                    )}
                  </TouchableOpacity>
                );
              })}
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
              <TouchableOpacity style={[s.submitBtn, submitting && s.submitBtnDisabled]} onPress={handleEmployeeSubmit} disabled={submitting}>
                {submitting ? <ActivityIndicator color="#fff" /> : <Text style={s.submitBtnText}>Submit Self-Reflection</Text>}
              </TouchableOpacity>
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
              <TouchableOpacity style={[s.submitBtn, submitting && s.submitBtnDisabled]} onPress={handleManagerSubmit} disabled={submitting}>
                {submitting ? <ActivityIndicator color="#fff" /> : <Text style={s.submitBtnText}>Submit Manager Review</Text>}
              </TouchableOpacity>
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
              <Text style={s.fieldLabel}>Decision Notes</Text>
              <TextInput style={[s.input, s.inputMulti]} value={decisionNotes} onChangeText={setDecisionNotes}
                placeholder="Notes on your decision..." placeholderTextColor={colors.gray400} multiline numberOfLines={4} />
              <View style={s.finalBtns}>
                <TouchableOpacity style={[s.approveBtn, submitting && s.submitBtnDisabled]} onPress={() => handleFinalDecision('approved')} disabled={submitting}>
                  {submitting
                    ? <ActivityIndicator color="#fff" />
                    : <><Ionicons name="checkmark" size={16} color="#fff" /><Text style={s.approveBtnText}>Approve</Text></>
                  }
                </TouchableOpacity>
                <TouchableOpacity style={[s.rejectBtn, submitting && s.submitBtnDisabled]} onPress={() => handleFinalDecision('rejected')} disabled={submitting}>
                  {submitting
                    ? <ActivityIndicator color={colors.danger} />
                    : <><Ionicons name="close" size={16} color={colors.danger} /><Text style={s.rejectBtnText}>Reject</Text></>
                  }
                </TouchableOpacity>
              </View>
            </>
          )}

          {/* Existing final decision */}
          {finalDecision && (
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
    sectionTitle:       { fontSize: 16, fontWeight: '700', color: c.textPrimary, marginTop: 8, marginBottom: 12 },
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
