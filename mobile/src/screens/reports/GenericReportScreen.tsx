import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useTheme } from '../../contexts/ThemeContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useApi } from '../../hooks/useApi';
import { AppColors } from '../../utils/colors';
import { MoreStackParamList } from '../../navigation/types';
import { apiErrorMessage } from '../../utils/apiError';
import LoadError from '../../components/common/LoadError';

type Rt = RouteProp<MoreStackParamList, 'ReportView'>;

interface Col { key: string; label: string; format?: (row: any) => string }

const CONTRACT_TYPES = [
  { value: 'overdue', label: 'Overdue Tasks' },
  { value: 'sla', label: 'SLA Compliance' },
  { value: 'workload', label: 'User Workload' },
  { value: 'agreement-expiry', label: 'Agreement Expiry' },
  { value: 'revenue', label: 'Revenue by Client' },
];

const TITLES: Record<string, string> = {
  projects: 'Project Report',
  financial: 'Financial Report',
  goals: 'Goals Report',
  performance: 'Performance Report',
  appraisals: 'Appraisal Report',
  contracts: 'Contract Report',
};

function personName(u: any) {
  if (!u) return '—';
  return [u.first_name, u.last_name].filter(Boolean).join(' ') || u.email || '—';
}
function fmtDate(s?: string) {
  if (!s) return '—';
  return String(s).slice(0, 10);
}
function titleCase(key: string) {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function GenericReportScreen() {
  const navigation = useNavigation<any>();
  const { params } = useRoute<Rt>();
  const { reportType } = params;
  const { colors } = useTheme();
  const { workspace } = useWorkspace();
  const api = useApi();
  const insets = useSafeAreaInsets();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [contractType, setContractType] = useState('overdue');

  const load = useCallback(async () => {
    if (!workspace?.id) return;
    setLoading(true);
    try {
      if (reportType === 'projects') {
        const res = await api.projects.list(workspace.id, {});
        setRows(res.data?.items ?? res.data ?? []);
      } else if (reportType === 'financial') {
        const res = await api.projects.financialsSummary(workspace.id, {});
        setRows(Array.isArray(res.data) ? res.data : res.data?.items ?? []);
      } else if (reportType === 'goals') {
        const cyclesRes = await api.performance.getCycles(workspace.id);
        const cycles = cyclesRes.data?.items ?? cyclesRes.data ?? [];
        const latestCycle = cycles[0];
        if (!latestCycle) { setRows([]); return; }
        const res = await api.performance.getWorkflowStatus(workspace.id, { cycle_id: latestCycle.id });
        setRows(res.data?.goals ?? []);
      } else if (reportType === 'performance') {
        const res = await api.performance.listAllReviews(workspace.id).catch(() =>
          api.performance.listTeamReviews(workspace.id));
        setRows(res.data?.items ?? res.data ?? []);
      } else if (reportType === 'appraisals') {
        const res = await api.performance.getAppraisals(workspace.id, { view: 'all' }).catch(() =>
          api.performance.getAppraisals(workspace.id, {}));
        setRows(res.data?.items ?? res.data ?? []);
      } else if (reportType === 'contracts') {
        const res = await api.contracts.getReports(workspace.id, { type: contractType });
        setRows(res.data?.items ?? res.data ?? []);
      }
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not load this report.'));
    } finally {
      setLoading(false);
    }
  }, [workspace?.id, reportType, contractType]);

  useEffect(() => { load(); }, [load]);

  const columns: Col[] = useMemo(() => {
    if (reportType === 'projects') {
      return [
        { key: 'name', label: 'Project' },
        { key: 'client_name', label: 'Client' },
        { key: 'computed_status', label: 'Status' },
        { key: 'completion_pct', label: 'Progress %', format: (r) => `${r.completion_pct ?? 0}%` },
        { key: 'total_tasks', label: 'Tasks' },
        { key: 'start_date', label: 'Start', format: (r) => fmtDate(r.start_date) },
        { key: 'end_date', label: 'End', format: (r) => fmtDate(r.end_date) },
      ];
    }
    if (reportType === 'financial') {
      return [
        { key: 'name', label: 'Project' },
        { key: 'client_name', label: 'Client' },
        { key: 'billing_type', label: 'Billing Type' },
        { key: 'total_billing', label: 'Total Billing', format: (r) => r.total_billing != null ? `₹${r.total_billing}` : '—' },
        { key: 'estimated_cost', label: 'Est. Cost', format: (r) => `₹${r.estimated_cost}` },
        { key: 'actual_labor_cost', label: 'Actual Labor', format: (r) => `₹${r.actual_labor_cost}` },
        { key: 'total_actual_cost', label: 'Total Cost', format: (r) => `₹${r.total_actual_cost}` },
        { key: 'invoiced_total', label: 'Invoiced', format: (r) => `₹${r.invoiced_total}` },
        { key: 'profit', label: 'Profit', format: (r) => `₹${r.profit}` },
        { key: 'margin_pct', label: 'Margin %', format: (r) => r.margin_pct != null ? `${r.margin_pct}%` : '—' },
      ];
    }
    if (reportType === 'goals') {
      return [
        { key: 'employee', label: 'Employee', format: (r) => personName(r.employee) },
        { key: 'goal_status', label: 'Status' },
        { key: 'goals_total', label: 'Total' },
        { key: 'goals_approved', label: 'Approved' },
        { key: 'goals_submitted', label: 'Awaiting Approval' },
        { key: 'goals_pending', label: 'Draft' },
      ];
    }
    if (reportType === 'performance') {
      return [
        { key: 'employee', label: 'Employee', format: (r) => r.reviewee_name ?? r.employee_name ?? personName(r.employee) },
        { key: 'role_title', label: 'Role' },
        { key: 'status', label: 'Status' },
        { key: 'goals_score', label: 'Goals' },
        { key: 'skills_score', label: 'Skills' },
        { key: 'values_score', label: 'Values' },
        { key: 'final_score', label: 'Overall', format: (r) => r.final_score != null ? `${r.final_score}/5` : '—' },
        { key: 'created_at', label: 'Created', format: (r) => fmtDate(r.created_at) },
      ];
    }
    if (reportType === 'appraisals') {
      return [
        { key: 'employee', label: 'Employee', format: (r) => personName(r.employee) },
        { key: 'role_title', label: 'Role' },
        { key: 'reason', label: 'Reason' },
        { key: 'status', label: 'Status' },
        { key: 'created_at', label: 'Date', format: (r) => fmtDate(r.created_at) },
      ];
    }
    // contracts: dynamic — columns derived from first row's keys
    const first = rows[0];
    if (!first) return [];
    return Object.keys(first)
      .filter((k) => !['id'].includes(k))
      .map((k) => ({ key: k, label: titleCase(k) }));
  }, [reportType, rows]);

  const cellValue = (row: any, col: Col) => {
    if (col.format) return col.format(row);
    const v = row[col.key];
    if (v == null) return '—';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  };

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.title}>{TITLES[reportType] ?? 'Report'}</Text>
        <View style={{ width: 36 }} />
      </View>

      {reportType === 'contracts' && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.subtypeRow}>
          {CONTRACT_TYPES.map((t) => (
            <TouchableOpacity
              key={t.value}
              style={[s.subtypeChip, contractType === t.value && s.subtypeChipActive]}
              onPress={() => setContractType(t.value)}
            >
              <Text style={[s.subtypeChipText, contractType === t.value && s.subtypeChipTextActive]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {loading ? (
        <ActivityIndicator style={{ flex: 1 }} color={colors.primary} />
      ) : error ? (
        <LoadError message={error} onRetry={load} />
      ) : rows.length === 0 ? (
        <View style={s.empty}>
          <Ionicons name="stats-chart-outline" size={40} color={colors.gray400} />
          <Text style={s.emptyText}>No data for this report yet</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.list} showsVerticalScrollIndicator={false}>
          <Text style={s.countText}>{rows.length} row{rows.length === 1 ? '' : 's'}</Text>
          {rows.map((row, idx) => (
            <View key={row.id ?? idx} style={s.card}>
              {columns.map((col) => (
                <View key={col.key} style={s.cardRow}>
                  <Text style={s.cardKey}>{col.label}</Text>
                  <Text style={s.cardVal} numberOfLines={2}>{cellValue(row, col)}</Text>
                </View>
              ))}
            </View>
          ))}
        </ScrollView>
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
    subtypeRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border },
    subtypeChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: c.gray50, borderWidth: 1, borderColor: c.border },
    subtypeChipActive: { backgroundColor: c.primary, borderColor: c.primary },
    subtypeChipText: { fontSize: 12, fontWeight: '600', color: c.gray600 },
    subtypeChipTextActive: { color: '#fff' },
    empty: { alignItems: 'center', gap: 12, paddingTop: 60, flex: 1, justifyContent: 'center' },
    emptyText: { fontSize: 14, color: c.textMuted },
    list: { padding: 16, gap: 10, paddingBottom: 32 },
    countText: { fontSize: 11, color: c.textMuted, marginBottom: 2 },
    card: { backgroundColor: c.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: c.border, gap: 6 },
    cardRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
    cardKey: { fontSize: 11, color: c.textMuted, fontWeight: '600', flexShrink: 0 },
    cardVal: { fontSize: 12, color: c.textPrimary, fontWeight: '600', flex: 1, textAlign: 'right' },
  });
}
