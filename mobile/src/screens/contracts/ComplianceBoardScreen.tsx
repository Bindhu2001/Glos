import React, { useState, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, ActivityIndicator,
  RefreshControl, TextInput,
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

// linked_tasks carry the Tasks-module status vocabulary (open/in_progress/
// blocked/done/cancelled), NOT contract_tasks' (pending/completed/…). This
// mirrors web's taskModuleStatusColor.
function taskStatusMeta(s?: string | null) {
  switch (s) {
    case 'in_progress': return { bg: 'rgba(21,101,192,0.14)', color: '#1565C0', label: 'In Progress' };
    case 'blocked':     return { bg: 'rgba(123,31,162,0.14)', color: '#7B1FA2', label: 'Blocked' };
    case 'done':        return { bg: 'rgba(56,142,60,0.14)',  color: '#388E3C', label: 'Done' };
    case 'cancelled':   return { bg: 'rgba(198,40,40,0.14)',  color: '#C62828', label: 'Cancelled' };
    default:            return { bg: 'rgba(245,124,0,0.14)',  color: '#F57C00', label: 'Not Started' };
  }
}

function checkMeta(s?: string | null) {
  switch (s) {
    case 'approved':       return { bg: 'rgba(56,142,60,0.14)', color: '#388E3C', label: 'Approved' };
    case 'rejected':       return { bg: 'rgba(198,40,40,0.14)', color: '#C62828', label: 'Rejected' };
    case 'pending_review': return { bg: 'rgba(245,127,23,0.16)', color: '#F57F17', label: 'Pending Review' };
    default: return null;
  }
}

function fmtDate(d?: string | null) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
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

  // ── KPI roll-up — matches web's KpiCard strip ─────────────────
  const kpi = useMemo(() => {
    let allP = 0, doneP = 0, allO = 0, doneO = 0, fullyDone = 0;
    for (const ag of agreements) {
      const p = ag.periodic ?? {}; const o = ag.one_time ?? {};
      allP += p.total ?? 0; doneP += p.done ?? 0;
      allO += o.total ?? 0; doneO += o.done ?? 0;
      const svcs = [...(p.services ?? []), ...(o.services ?? [])];
      if (svcs.length > 0 && (doneCount(ag) === svcs.length)) fullyDone += 1;
    }
    const totalSvcs = allP + allO;
    const doneSvcs = doneP + doneO;
    return {
      overallPct: totalSvcs > 0 ? Math.round((doneSvcs / totalSvcs) * 100) : 0,
      doneSvcs, totalSvcs, fullyDone, totalAgreements: agreements.length,
      doneP, allP, doneO, allO,
    };
  }, [agreements]);

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
            <>
              <View style={s.kpiRow}>
                <KpiChip label="Overall" value={`${kpi.overallPct}%`} sub={`${kpi.doneSvcs}/${kpi.totalSvcs} done`} accent={kpi.overallPct >= 80 ? '#4caf50' : '#ef5350'} s={s} />
                <KpiChip label="Agreements" value={`${kpi.fullyDone}/${kpi.totalAgreements}`} sub="fully done" accent="#42A5F5" s={s} />
                <KpiChip label="Periodic" value={`${kpi.doneP}/${kpi.allP}`} sub="services" accent="#AB47BC" s={s} />
                <KpiChip label="One-Time" value={`${kpi.doneO}/${kpi.allO}`} sub="services" accent="#26A69A" s={s} />
              </View>

              {agreements.map((ag) => {
                const isExpanded = expandedIds.has(ag.id);
                const periodic = ag.periodic ?? { services: [], done: 0, total: 0 };
                const oneTime = ag.one_time ?? { services: [], done: 0, total: 0 };
                const allServices = [...(periodic.services ?? []), ...(oneTime.services ?? [])];
                const done = doneCount(ag);
                const total = (periodic.total ?? 0) + (oneTime.total ?? 0);
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
                      <View style={[s.countBadge, done === total && total > 0 && s.countBadgeDone]}>
                        <Text style={[s.countBadgeText, done === total && total > 0 && s.countBadgeTextDone]}>
                          {done}/{total}
                        </Text>
                      </View>
                      <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.gray400} />
                    </TouchableOpacity>

                    {isExpanded && (
                      <View style={s.serviceList}>
                        {allServices.length === 0 ? (
                          <Text style={s.noServices}>No services due this month</Text>
                        ) : (
                          allServices.map((svc: any) => (
                            <ServiceRow
                              key={svc.id}
                              svc={svc}
                              agreementId={ag.id}
                              appId={workspace!.id}
                              colors={colors}
                              s={s}
                              navigation={navigation}
                              onReviewed={() => load()}
                            />
                          ))
                        )}
                      </View>
                    )}
                  </View>
                );
              })}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

// A service counts as done for the month if any linked task is approved
// (backend-computed periodic.done / one_time.done already use this rule, so
// just sum those); kept as a helper so the KPI + card badge agree.
function doneCount(ag: any): number {
  return (ag.periodic?.done ?? 0) + (ag.one_time?.done ?? 0);
}

function KpiChip({ label, value, sub, accent, s }: { label: string; value: string; sub: string; accent: string; s: any }) {
  return (
    <View style={[s.kpiChip, { borderTopColor: accent }]}>
      <Text style={s.kpiLabel}>{label}</Text>
      <Text style={s.kpiValue}>{value}</Text>
      <Text style={s.kpiSub}>{sub}</Text>
    </View>
  );
}

function ServiceRow({
  svc, agreementId, appId, colors, s, navigation, onReviewed,
}: {
  svc: any; agreementId: number; appId: number; colors: AppColors; s: any;
  navigation: Nav; onReviewed: () => void;
}) {
  const linkedTasks: any[] = svc.linked_tasks ?? [];
  const legacyTask = svc.task;

  return (
    <View style={s.serviceRow}>
      <View style={s.serviceHead}>
        <View style={{ flex: 1 }}>
          <Text style={s.serviceName} numberOfLines={2}>{svc.service_name}</Text>
          <Text style={s.serviceMeta}>
            {[svc.service_code, svc.periodicity?.replace(/_/g, ' ')].filter(Boolean).join(' · ')}
          </Text>
        </View>
        <TouchableOpacity
          style={s.createTaskBtn}
          onPress={() => navigation.navigate('CreateTask', {
            appId,
            presetContractId: agreementId,
            presetAgreementServiceId: svc.id,
            lockContractType: true,
          })}
        >
          <Ionicons name="add" size={13} color="#fff" />
          <Text style={s.createTaskBtnText}>Create Task</Text>
        </TouchableOpacity>
      </View>

      {/* Legacy single-slot task — read-only summary if one exists (older
          data not yet migrated to Tasks-module tasks). */}
      {legacyTask && (
        <View style={s.legacyTask}>
          <Text style={s.legacyTaskText} numberOfLines={2}>
            {legacyTask.title || 'Compliance task'}
          </Text>
          <View style={s.badgeRow}>
            <StatusBadge meta={taskStatusMeta(mapLegacyStatus(legacyTask.status))} s={s} />
            {checkMeta(legacyTask.check_status) && <StatusBadge meta={checkMeta(legacyTask.check_status)!} s={s} />}
          </View>
        </View>
      )}

      {linkedTasks.length === 0 && !legacyTask && (
        <Text style={s.noTaskHint}>No task yet — tap Create Task to add one.</Text>
      )}

      {linkedTasks.map((lt) => (
        <LinkedTaskCard
          key={lt.id}
          lt={lt}
          appId={appId}
          colors={colors}
          s={s}
          navigation={navigation}
          onReviewed={onReviewed}
        />
      ))}
    </View>
  );
}

// contract_tasks status → Tasks-module vocabulary, so the legacy slot's badge
// uses the same colours as linked tasks.
function mapLegacyStatus(s?: string | null) {
  switch (s) {
    case 'completed': return 'done';
    case 'delayed': return 'blocked';
    case 'in_progress': return 'in_progress';
    default: return 'open';
  }
}

function StatusBadge({ meta, s }: { meta: { bg: string; color: string; label: string }; s: any }) {
  return (
    <View style={[s.badge, { backgroundColor: meta.bg }]}>
      <Text style={[s.badgeText, { color: meta.color }]}>{meta.label}</Text>
    </View>
  );
}

function LinkedTaskCard({
  lt, appId, colors, s, navigation, onReviewed,
}: {
  lt: any; appId: number; colors: AppColors; s: any; navigation: Nav; onReviewed: () => void;
}) {
  const api = useApi();
  const [expanded, setExpanded] = useState(false);
  const [remarks, setRemarks] = useState('');
  const [checking, setChecking] = useState<null | 'approved' | 'rejected'>(null);

  const stMeta = taskStatusMeta(lt.status);
  const ckMeta = checkMeta(lt.check_status);
  const isPendingReview = lt.check_status === 'pending_review';

  const handleCheck = async (decision: 'approved' | 'rejected') => {
    setChecking(decision);
    try {
      await api.tasks.check(appId, lt.id, { check_status: decision, check_remarks: remarks.trim() || null });
      setRemarks('');
      setExpanded(false);
      onReviewed();
    } catch (err) {
      showAlert('Could Not Submit Review', apiErrorMessage(err));
    } finally {
      setChecking(null);
    }
  };

  return (
    <View style={s.linkedCard}>
      <View style={s.linkedHead}>
        <TouchableOpacity
          style={{ flex: 1 }}
          onPress={() => navigation.navigate('TaskDetail', { taskId: lt.id, appId })}
        >
          <Text style={s.linkedTitle} numberOfLines={2}>
            {lt.title}
            {lt.task_number ? <Text style={s.linkedNum}>  ({lt.task_number})</Text> : null}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setExpanded((v) => !v)} hitSlop={8}>
          <Text style={[s.linkedToggle, isPendingReview && { color: colors.success }]}>
            {expanded ? 'Close' : isPendingReview ? 'Review' : 'View'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={s.badgeRow}>
        <StatusBadge meta={stMeta} s={s} />
        {ckMeta && <StatusBadge meta={ckMeta} s={s} />}
      </View>

      <View style={s.linkedMetaRow}>
        {lt.assigned_user?.name && (
          <Text style={s.linkedMeta}><Ionicons name="person-outline" size={10} color={colors.textMuted} /> {lt.assigned_user.name}</Text>
        )}
        {lt.due_on && <Text style={s.linkedMeta}>Due {fmtDate(lt.due_on)}</Text>}
        {lt.completed_at && <Text style={s.linkedMeta}>Done {fmtDate(lt.completed_at)}</Text>}
      </View>

      {expanded && (
        <View style={s.linkedBody}>
          {Array.isArray(lt.checklist) && lt.checklist.length > 0 && (
            <View style={{ marginBottom: 8 }}>
              {lt.checklist.map((c: any) => (
                <View key={c.id} style={s.checkItem}>
                  <Ionicons
                    name={c.is_done ? 'checkbox' : 'square-outline'}
                    size={15}
                    color={c.is_done ? colors.success : colors.gray400}
                  />
                  <Text style={[s.checkItemText, c.is_done && { color: colors.textMuted, textDecorationLine: 'line-through' }]}>
                    {c.text}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {lt.checked_by_user?.name && lt.checked_at && (
            <Text style={s.reviewedLine}>
              {ckMeta?.label ?? 'Reviewed'} by {lt.checked_by_user.name} on {fmtDate(lt.checked_at)}
            </Text>
          )}
          {lt.check_remarks && <Text style={s.reviewRemark}>"{lt.check_remarks}"</Text>}

          {isPendingReview && (
            <View style={{ marginTop: 8 }}>
              <TextInput
                style={s.reviewInput}
                value={remarks}
                onChangeText={setRemarks}
                placeholder="Review comments (optional)…"
                placeholderTextColor={colors.gray400}
                maxLength={1000}
                multiline
              />
              <View style={s.reviewBtns}>
                <TouchableOpacity
                  style={[s.rejectBtn, checking !== null && { opacity: 0.5 }]}
                  onPress={() => handleCheck('rejected')}
                  disabled={checking !== null}
                >
                  {checking === 'rejected'
                    ? <ActivityIndicator size="small" color={colors.danger} />
                    : <><Ionicons name="thumbs-down-outline" size={14} color={colors.danger} /><Text style={s.rejectBtnText}>Reject</Text></>}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.approveBtn, checking !== null && { opacity: 0.5 }]}
                  onPress={() => handleCheck('approved')}
                  disabled={checking !== null}
                >
                  {checking === 'approved'
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <><Ionicons name="thumbs-up-outline" size={14} color="#fff" /><Text style={s.approveBtnText}>Approve</Text></>}
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      )}
    </View>
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

    kpiRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
    kpiChip: {
      flexGrow: 1, flexBasis: '46%', backgroundColor: c.surface, borderRadius: 10,
      borderWidth: 1, borderColor: c.border, borderTopWidth: 3, padding: 10,
    },
    kpiLabel: { fontSize: 10, fontWeight: '700', color: c.textSecondary, textTransform: 'uppercase', letterSpacing: 1 },
    kpiValue: { fontSize: 20, fontWeight: '800', color: c.textPrimary, marginTop: 3 },
    kpiSub: { fontSize: 11, color: c.textMuted, marginTop: 1 },

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
    serviceRow: { paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: 1, borderTopColor: c.border, gap: 8 },
    serviceHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
    serviceName: { fontSize: 14, fontWeight: '600', color: c.textPrimary },
    serviceMeta: { fontSize: 11, color: c.textMuted, marginTop: 2, textTransform: 'capitalize' },
    createTaskBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 3,
      backgroundColor: c.primary, borderRadius: 7, paddingHorizontal: 9, paddingVertical: 6,
    },
    createTaskBtnText: { fontSize: 11, fontWeight: '700', color: '#fff' },
    noTaskHint: { fontSize: 12, color: c.textMuted, fontStyle: 'italic' },

    legacyTask: { backgroundColor: c.gray50, borderRadius: 8, borderWidth: 1, borderColor: c.border, padding: 8, gap: 6 },
    legacyTaskText: { fontSize: 12, fontWeight: '600', color: c.textPrimary },

    badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
    badgeText: { fontSize: 10, fontWeight: '700' },

    linkedCard: { backgroundColor: c.gray50, borderRadius: 8, borderWidth: 1, borderColor: c.border, padding: 10, gap: 6 },
    linkedHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
    linkedTitle: { fontSize: 12, fontWeight: '600', color: c.textPrimary },
    linkedNum: { fontWeight: '400', color: c.textMuted },
    linkedToggle: { fontSize: 12, fontWeight: '700', color: c.textSecondary },
    linkedMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    linkedMeta: { fontSize: 11, color: c.textMuted },
    linkedBody: { borderTopWidth: 1, borderTopColor: c.border, paddingTop: 8, marginTop: 2 },
    checkItem: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 3 },
    checkItemText: { flex: 1, fontSize: 12, color: c.textPrimary },
    reviewedLine: { fontSize: 11, color: c.textMuted, marginTop: 2 },
    reviewRemark: { fontSize: 11, color: c.textMuted, fontStyle: 'italic', marginTop: 3 },
    reviewInput: {
      borderWidth: 1, borderColor: c.border, borderRadius: 8, backgroundColor: c.surface,
      paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, color: c.textPrimary,
      minHeight: 52, textAlignVertical: 'top',
    },
    reviewBtns: { flexDirection: 'row', gap: 10, marginTop: 8 },
    approveBtn: {
      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
      backgroundColor: c.success, borderRadius: 8, paddingVertical: 10,
    },
    approveBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },
    rejectBtn: {
      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
      backgroundColor: c.dangerLight, borderRadius: 8, paddingVertical: 10,
      borderWidth: 1, borderColor: c.danger + '44',
    },
    rejectBtnText: { fontSize: 13, fontWeight: '700', color: c.danger },
  });
}
