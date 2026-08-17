import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, ActivityIndicator,
  RefreshControl, TextInput, Modal, KeyboardAvoidingView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../contexts/ThemeContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useApi } from '../../hooks/useApi';
import { AppColors } from '../../utils/colors';
import { MoreStackParamList } from '../../navigation/types';
import { apiErrorMessage } from '../../utils/apiError';
import LoadError from '../../components/common/LoadError';
import { showAlert } from '../../components/common/AlertModal';

type Nav = NativeStackNavigationProp<MoreStackParamList, 'ComplianceBoard'>;

const STATUS_OPTIONS = [
  { value: 'pending', label: 'Not Started' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'awaiting_client', label: 'Awaiting Client' },
  { value: 'completed', label: 'Completed' },
  { value: 'delayed', label: 'Delayed' },
];

function statusMeta(s?: string | null) {
  switch (s) {
    case 'completed': return { bg: 'rgba(16,185,129,0.15)', color: '#10b981', label: 'Completed' };
    case 'in_progress': return { bg: 'rgba(37,99,235,0.15)', color: '#2563eb', label: 'In Progress' };
    case 'awaiting_client': return { bg: 'rgba(147,51,234,0.15)', color: '#9333ea', label: 'Awaiting Client' };
    case 'delayed': return { bg: 'rgba(239,68,68,0.15)', color: '#ef4444', label: 'Delayed' };
    default: return { bg: 'rgba(245,158,11,0.15)', color: '#f59e0b', label: 'Not Started' };
  }
}

function checkMeta(s?: string | null) {
  switch (s) {
    case 'approved': return { bg: 'rgba(16,185,129,0.15)', color: '#10b981', label: 'Approved' };
    case 'rejected': return { bg: 'rgba(239,68,68,0.15)', color: '#ef4444', label: 'Rejected' };
    case 'pending_review': return { bg: 'rgba(245,158,11,0.15)', color: '#f59e0b', label: 'Pending Review' };
    default: return null;
  }
}

function monthLabel(month: number, year: number) {
  return new Date(year, month - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' });
}

// Mirrors web's compliance board bound — Aug 2025 is when this feature
// launched, so there's no data (and no reason to navigate) before it.
const MIN_MONTH = { month: 8, year: 2025 };

export default function ComplianceBoardScreen() {
  const navigation = useNavigation<Nav>();
  const { colors } = useTheme();
  const { workspace } = useWorkspace();
  const api = useApi();
  const insets = useSafeAreaInsets();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [agreements, setAgreements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  const [editing, setEditing] = useState<{ agreementId: number; svc: any } | null>(null);

  const atMin = month === MIN_MONTH.month && year === MIN_MONTH.year;
  const atMax = month === now.getMonth() + 1 && year === now.getFullYear();

  const stepMonth = (dir: -1 | 1) => {
    if (dir === -1 && atMin) return;
    if (dir === 1 && atMax) return;
    let m = month + dir;
    let y = year;
    if (m < 1) { m = 12; y -= 1; }
    if (m > 12) { m = 1; y += 1; }
    setMonth(m);
    setYear(y);
  };

  const load = useCallback(async (isRefresh = false) => {
    if (!workspace?.id) return;
    if (!isRefresh) setLoading(true);
    try {
      const res = await api.contracts.getComplianceBoard(workspace.id, { month, year });
      setAgreements(res.data ?? []);
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not load the compliance board.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [workspace?.id, month, year]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const toggleExpanded = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.title}>Compliance Board</Text>
        <View style={{ width: 36 }} />
      </View>

      <View style={s.monthRow}>
        <TouchableOpacity onPress={() => stepMonth(-1)} disabled={atMin} style={s.monthBtn}>
          <Ionicons name="chevron-back" size={18} color={atMin ? colors.gray300 : colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.monthLabel}>{monthLabel(month, year)}</Text>
        <TouchableOpacity onPress={() => stepMonth(1)} disabled={atMax} style={s.monthBtn}>
          <Ionicons name="chevron-forward" size={18} color={atMax ? colors.gray300 : colors.textPrimary} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator style={{ flex: 1 }} color={colors.primary} />
      ) : error ? (
        <LoadError message={error} onRetry={() => load()} />
      ) : (
        <ScrollView
          contentContainerStyle={[s.list, { paddingBottom: 24 + insets.bottom }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={colors.primary} />}
        >
          {agreements.length === 0 ? (
            <View style={s.empty}>
              <Ionicons name="shield-checkmark-outline" size={40} color={colors.gray400} />
              <Text style={s.emptyText}>No active agreements to show for this month</Text>
            </View>
          ) : (
            agreements.map((ag) => {
              const isExpanded = expandedIds.has(ag.id);
              const allServices = [...ag.periodic.services, ...ag.one_time.services];
              const doneCount = ag.periodic.done + ag.one_time.done;
              const totalCount = ag.periodic.total + ag.one_time.total;
              return (
                <View key={ag.id} style={s.card}>
                  <TouchableOpacity style={s.cardHeader} onPress={() => toggleExpanded(ag.id)} activeOpacity={0.7}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.cardTitle} numberOfLines={1}>
                        {ag.agreement_name || ag.agreement_number}
                      </Text>
                      <Text style={s.cardSub} numberOfLines={1}>
                        {ag.client?.client_name ?? 'No client'} · {ag.agreement_number}
                      </Text>
                    </View>
                    <View style={[s.countBadge, doneCount === totalCount && totalCount > 0 && s.countBadgeDone]}>
                      <Text style={[s.countBadgeText, doneCount === totalCount && totalCount > 0 && s.countBadgeTextDone]}>
                        {doneCount}/{totalCount}
                      </Text>
                    </View>
                    <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.gray400} />
                  </TouchableOpacity>

                  {isExpanded && (
                    <View style={s.serviceList}>
                      {allServices.length === 0 ? (
                        <Text style={s.noServices}>No services due this month</Text>
                      ) : (
                        allServices.map((svc) => {
                          const task = svc.task;
                          const st = statusMeta(task?.status);
                          const ck = checkMeta(task?.check_status);
                          return (
                            <TouchableOpacity
                              key={svc.id}
                              style={s.serviceRow}
                              onPress={() => setEditing({ agreementId: ag.id, svc })}
                              activeOpacity={0.7}
                            >
                              <View style={{ flex: 1 }}>
                                <Text style={s.serviceName} numberOfLines={1}>{svc.service_name}</Text>
                                <View style={s.badgeRow}>
                                  <View style={[s.badge, { backgroundColor: st.bg }]}>
                                    <Text style={[s.badgeText, { color: st.color }]}>{st.label}</Text>
                                  </View>
                                  {ck && (
                                    <View style={[s.badge, { backgroundColor: ck.bg }]}>
                                      <Text style={[s.badgeText, { color: ck.color }]}>{ck.label}</Text>
                                    </View>
                                  )}
                                  {task?.can_review && task?.check_status === 'pending_review' && (
                                    <View style={[s.badge, { backgroundColor: colors.primaryLight }]}>
                                      <Text style={[s.badgeText, { color: colors.primary }]}>Review needed</Text>
                                    </View>
                                  )}
                                </View>
                              </View>
                              <Ionicons name="chevron-forward" size={16} color={colors.gray300} />
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
        </ScrollView>
      )}

      {editing && (
        <ServiceUpdateModal
          agreementId={editing.agreementId}
          svc={editing.svc}
          month={month}
          year={year}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </View>
  );
}

function ServiceUpdateModal({
  agreementId, svc, month, year, onClose, onSaved,
}: {
  agreementId: number; svc: any; month: number; year: number; onClose: () => void; onSaved: () => void;
}) {
  const { colors } = useTheme();
  const { workspace } = useWorkspace();
  const api = useApi();
  const insets = useSafeAreaInsets();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const task = svc.task;
  const activities: string[] = svc.major_activities ?? [];
  const deliverables: string[] = svc.deliverables ?? [];

  const [status, setStatus] = useState(task?.status ?? 'pending');
  const [remarks, setRemarks] = useState(task?.remarks ?? '');
  const [activitiesChecked, setActivitiesChecked] = useState<Set<string>>(new Set(task?.activities_checked ?? []));
  const [deliverablesChecked, setDeliverablesChecked] = useState<Set<string>>(new Set(task?.deliverables_checked ?? []));
  const [saving, setSaving] = useState(false);
  const [reviewing, setReviewing] = useState<'approved' | 'rejected' | null>(null);
  const [checkRemarks, setCheckRemarks] = useState('');

  const toggleItem = (set: Set<string>, setSet: (s: Set<string>) => void, item: string) => {
    const next = new Set(set);
    if (next.has(item)) next.delete(item); else next.add(item);
    setSet(next);
  };

  const canReview = !!task?.can_review && task?.check_status === 'pending_review';

  const handleSave = async () => {
    if (!workspace?.id) return;
    setSaving(true);
    try {
      await api.contracts.submitComplianceTask(workspace.id, {
        agreement_service_id: svc.id,
        agreement_id: agreementId,
        month, year,
        status,
        remarks: remarks.trim() || undefined,
        activities_checked: [...activitiesChecked],
        deliverables_checked: [...deliverablesChecked],
      });
      onSaved();
    } catch (err) {
      showAlert('Could Not Save', apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleReview = async (decision: 'approved' | 'rejected') => {
    if (!workspace?.id || !task?.id) return;
    setReviewing(decision);
    try {
      await api.contracts.checkContractTask(workspace.id, task.id, {
        check_status: decision,
        check_remarks: checkRemarks.trim() || null,
      });
      onSaved();
    } catch (err) {
      showAlert('Could Not Submit Review', apiErrorMessage(err));
    } finally {
      setReviewing(null);
    }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={s.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={[s.modalCard, { paddingBottom: 16 + insets.bottom }]}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle} numberOfLines={1}>{svc.service_name}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={s.modalBody} keyboardShouldPersistTaps="handled">
            <Text style={s.fieldLabel}>Status</Text>
            <View style={s.chipRow}>
              {STATUS_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  style={[s.chip, status === opt.value && s.chipActive]}
                  onPress={() => setStatus(opt.value)}
                >
                  <Text style={[s.chipText, status === opt.value && s.chipTextActive]}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {activities.length > 0 && (
              <>
                <Text style={s.fieldLabel}>Major Activities</Text>
                {activities.map((item, i) => (
                  <TouchableOpacity key={i} style={s.checkRow} onPress={() => toggleItem(activitiesChecked, setActivitiesChecked, item)}>
                    <Ionicons
                      name={activitiesChecked.has(item) ? 'checkbox' : 'square-outline'}
                      size={20}
                      color={activitiesChecked.has(item) ? colors.success : colors.gray400}
                    />
                    <Text style={s.checkLabel}>{item}</Text>
                  </TouchableOpacity>
                ))}
              </>
            )}

            {deliverables.length > 0 && (
              <>
                <Text style={s.fieldLabel}>Deliverables</Text>
                {deliverables.map((item, i) => (
                  <TouchableOpacity key={i} style={s.checkRow} onPress={() => toggleItem(deliverablesChecked, setDeliverablesChecked, item)}>
                    <Ionicons
                      name={deliverablesChecked.has(item) ? 'checkbox' : 'square-outline'}
                      size={20}
                      color={deliverablesChecked.has(item) ? colors.success : colors.gray400}
                    />
                    <Text style={s.checkLabel}>{item}</Text>
                  </TouchableOpacity>
                ))}
              </>
            )}

            <Text style={s.fieldLabel}>Remarks</Text>
            <TextInput
              style={[s.input, s.inputMulti]}
              value={remarks}
              onChangeText={setRemarks}
              placeholder="Notes on progress..."
              placeholderTextColor={colors.gray400}
              multiline
              numberOfLines={3}
            />

            <TouchableOpacity style={[s.submitBtn, saving && s.submitBtnDisabled]} onPress={handleSave} disabled={saving || !!reviewing}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.submitBtnText}>Save</Text>}
            </TouchableOpacity>

            {canReview && (
              <View style={s.reviewSection}>
                <Text style={s.fieldLabel}>Review (Maker-Checker)</Text>
                <TextInput
                  style={[s.input, s.inputMulti]}
                  value={checkRemarks}
                  onChangeText={setCheckRemarks}
                  placeholder="Review comments (optional)..."
                  placeholderTextColor={colors.gray400}
                  multiline
                  numberOfLines={2}
                />
                <View style={s.finalBtns}>
                  <TouchableOpacity style={[s.approveBtn, !!reviewing && s.submitBtnDisabled]} onPress={() => handleReview('approved')} disabled={!!reviewing || saving}>
                    {reviewing === 'approved' ? <ActivityIndicator color="#fff" /> : <><Ionicons name="checkmark" size={16} color="#fff" /><Text style={s.approveBtnText}>Approve</Text></>}
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.rejectBtn, !!reviewing && s.submitBtnDisabled]} onPress={() => handleReview('rejected')} disabled={!!reviewing || saving}>
                    {reviewing === 'rejected' ? <ActivityIndicator color={colors.danger} /> : <><Ionicons name="close" size={16} color={colors.danger} /><Text style={s.rejectBtnText}>Reject</Text></>}
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {task?.check_remarks && (
              <View style={s.pastReview}>
                <Text style={s.fieldLabel}>Last Review Comment</Text>
                <Text style={s.pastReviewText}>{task.check_remarks}</Text>
              </View>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function makeStyles(c: AppColors) {
  const SERIF = Platform.OS === 'ios' ? 'Georgia' : 'serif';
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 16, paddingVertical: 12,
      backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border,
    },
    backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    title: { fontSize: 18, fontFamily: SERIF, color: c.textPrimary, fontWeight: '700' },
    monthRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16,
      paddingVertical: 12, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border,
    },
    monthBtn: { padding: 6 },
    monthLabel: { fontSize: 14, fontWeight: '700', color: c.textPrimary, minWidth: 150, textAlign: 'center' },
    list: { padding: 16, gap: 12 },
    empty: { alignItems: 'center', gap: 12, paddingTop: 60 },
    emptyText: { fontSize: 14, color: c.textMuted, textAlign: 'center', paddingHorizontal: 40 },
    card: {
      backgroundColor: c.surface, borderRadius: 14, borderWidth: 1, borderColor: c.border, overflow: 'hidden',
    },
    cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
    cardTitle: { fontSize: 15, fontWeight: '700', color: c.textPrimary },
    cardSub: { fontSize: 12, color: c.textSecondary, marginTop: 2 },
    countBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: c.gray100 },
    countBadgeDone: { backgroundColor: 'rgba(16,185,129,0.15)' },
    countBadgeText: { fontSize: 12, fontWeight: '700', color: c.textSecondary },
    countBadgeTextDone: { color: '#10b981' },
    serviceList: { borderTopWidth: 1, borderTopColor: c.border },
    noServices: { padding: 14, fontSize: 13, color: c.textMuted, fontStyle: 'italic' },
    serviceRow: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      paddingHorizontal: 14, paddingVertical: 12,
      borderTopWidth: 1, borderTopColor: c.border,
    },
    serviceName: { fontSize: 14, fontWeight: '600', color: c.textPrimary },
    badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
    badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
    badgeText: { fontSize: 10, fontWeight: '700' },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    modalCard: { backgroundColor: c.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '88%' },
    modalHeader: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: c.border,
    },
    modalTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: c.textPrimary, marginRight: 12 },
    modalBody: { padding: 16, paddingBottom: 32 },
    fieldLabel: { fontSize: 13, fontWeight: '600', color: c.textSecondary, marginBottom: 8, marginTop: 16 },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
      borderWidth: 1.5, borderColor: c.border, backgroundColor: c.surface,
    },
    chipActive: { backgroundColor: c.primary, borderColor: c.primary },
    chipText: { fontSize: 13, fontWeight: '500', color: c.textSecondary },
    chipTextActive: { color: '#ffffff' },
    checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 },
    checkLabel: { flex: 1, fontSize: 13, color: c.textPrimary },
    input: {
      borderWidth: 1, borderColor: c.border, borderRadius: 10,
      paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: c.textPrimary,
      backgroundColor: c.gray50,
    },
    inputMulti: { minHeight: 70, textAlignVertical: 'top' },
    submitBtn: {
      marginTop: 20, backgroundColor: c.primary, borderRadius: 12,
      paddingVertical: 14, alignItems: 'center',
    },
    submitBtnDisabled: { opacity: 0.5 },
    submitBtnText: { fontSize: 15, color: '#ffffff', fontWeight: '700' },
    reviewSection: { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: c.border },
    finalBtns: { flexDirection: 'row', gap: 12, marginTop: 12 },
    approveBtn: {
      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      gap: 6, paddingVertical: 14, borderRadius: 12, backgroundColor: c.success,
    },
    approveBtnText: { fontSize: 14, fontWeight: '700', color: '#ffffff' },
    rejectBtn: {
      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      gap: 6, paddingVertical: 14, borderRadius: 12,
      backgroundColor: c.dangerLight, borderWidth: 1, borderColor: c.danger + '44',
    },
    rejectBtnText: { fontSize: 14, fontWeight: '700', color: c.danger },
    pastReview: { marginTop: 16, backgroundColor: c.gray50, borderRadius: 10, padding: 12 },
    pastReviewText: { fontSize: 13, color: c.textPrimary, marginTop: 4, lineHeight: 18 },
  });
}
