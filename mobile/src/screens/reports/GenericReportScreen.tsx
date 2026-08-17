import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
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

const REPORT_COLORS: Record<string, string> = {
  projects: '#4f46e5',
  financial: '#059669',
  goals: '#d97706',
  performance: '#7c3aed',
  appraisals: '#be185d',
  contracts: '#0d9488',
};

const REPORT_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  projects: 'folder-open-outline',
  financial: 'cash-outline',
  goals: 'flag-outline',
  performance: 'trending-up-outline',
  appraisals: 'ribbon-outline',
  contracts: 'document-text-outline',
};

// Each card's title (shown next to the icon) and status badge (top-right)
// come from these two columns rather than the generic scrollable strip below —
// 'contracts' is excluded since its columns are fully dynamic per sub-type
// (overdue/sla/workload/...), with no reliable "name" or "status" field.
const CARD_TITLE_KEY: Record<string, string> = {
  projects: 'name', financial: 'name', goals: 'employee', performance: 'employee', appraisals: 'employee',
};
const CARD_BADGE_KEY: Record<string, string> = {
  projects: 'computed_status', goals: 'goal_status', performance: 'status', appraisals: 'status',
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

// Best-effort icon per column, based on its key — covers every column across
// all 6 report types without hand-mapping each one individually.
function columnIcon(col: Col): keyof typeof Ionicons.glyphMap {
  const k = col.key.toLowerCase();
  if (k.includes('date') || k.endsWith('_at')) return 'calendar-outline';
  if (k.includes('cycle')) return 'repeat-outline';
  if (k.includes('pct') || k.includes('progress') || k.includes('score')) return 'stats-chart-outline';
  if (k.includes('cost') || k.includes('billing') || k.includes('profit') || k.includes('invoice')) return 'cash-outline';
  if (k.includes('client') || k === 'employee' || k.includes('name')) return 'person-outline';
  if (k.includes('task')) return 'list-outline';
  if (k.includes('role')) return 'briefcase-outline';
  if (k.includes('reason')) return 'document-text-outline';
  return 'ellipse-outline';
}

// Loose keyword match so one heuristic covers every status-ish value across
// all report types (computed_status, goal_status, review status, ...)
// instead of enumerating every possible value per type.
function statusTint(value: string, c: AppColors): string {
  const v = (value || '').toLowerCase();
  if (/(active|approved|completed|done|on.?time)/.test(v)) return c.success;
  if (/(pending|submitted|draft|awaiting|in.?progress|near.?end)/.test(v)) return c.warning;
  if (/(overdue|rejected|inactive|blocked|cancelled|deleted)/.test(v)) return c.danger;
  return c.textSecondary;
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

  const hasLoadedRef = useRef(false);

  const load = useCallback(async () => {
    if (!workspace?.id) return;
    if (!hasLoadedRef.current) setLoading(true);
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
        // Matches web's GoalsReport.jsx: prefer the cycle whose date range spans
        // today over just taking the newest by year — falls back to the oldest
        // cycle (last in the list) if none is currently active.
        const today = new Date().toISOString().slice(0, 10);
        const activeCycle = cycles.find((c: any) => c.start_date <= today && c.end_date >= today) ?? cycles[cycles.length - 1];
        if (!activeCycle) { setRows([]); return; }
        const res = await api.performance.getWorkflowStatus(workspace.id, { cycle_id: activeCycle.id });
        setRows(res.data?.goals ?? []);
      } else if (reportType === 'performance') {
        // An admin sees all. Non-admins (managers and plain members alike) need
        // their team's reviews AND their own self review merged — matching web's
        // PerformanceReport.jsx (isMultiUser = isAdmin || isManager fetches team
        // + self together). A `.catch()` fallback chain doesn't work here because
        // the team endpoint resolves with an empty list (not an error) for a
        // plain member with no reportees, which would silently swallow their
        // own review.
        let items: any[];
        try {
          const res = await api.performance.listAllReviews(workspace.id);
          items = res.data?.items ?? res.data ?? [];
        } catch {
          // listAllReviews failing here is expected for non-admins (403) — but
          // if BOTH fallbacks below also fail, that's not "no reportees", it's
          // a real outage, and must not silently resolve to an empty report.
          let teamFailed = false;
          let selfFailed = false;
          const [teamRes, selfRes] = await Promise.all([
            api.performance.listTeamReviews(workspace.id).catch(() => { teamFailed = true; return { data: { items: [] as any[] } }; }),
            api.performance.listMyReviews(workspace.id).catch(() => { selfFailed = true; return { data: { items: [] as any[] } }; }),
          ]);
          if (teamFailed && selfFailed) throw new Error('Could not load performance report');
          const teamItems = teamRes.data?.items ?? teamRes.data ?? [];
          const selfItems = selfRes.data?.items ?? selfRes.data ?? [];
          const seen = new Set<any>();
          items = [];
          for (const it of [...teamItems, ...selfItems]) {
            if (seen.has(it.id)) continue;
            seen.add(it.id);
            items.push(it);
          }
        }
        setRows(items);
      } else if (reportType === 'appraisals') {
        // Matches web's AppraisalReport.jsx: merge every view the current role can
        // see (org-wide, own, reportees awaiting this manager, and pending final
        // approval) rather than stopping at the first one that resolves — a
        // manager who is also a final approver needs all four, not just their own.
        const results = await Promise.allSettled([
          api.performance.getAppraisals(workspace.id, { view: 'all' }),
          api.performance.getAppraisals(workspace.id, {}),
          api.performance.getAppraisals(workspace.id, { view: 'manage' }),
          api.performance.getAppraisals(workspace.id, { view: 'pending_approver' }),
        ]);
        // Each view can legitimately 403 depending on role — but if every
        // single one failed, that's a real outage, not "no permissions for
        // any of these 4 different views," and must surface as an error
        // rather than silently rendering an empty report.
        if (results.every((r) => r.status === 'rejected')) {
          throw new Error('Could not load appraisal report');
        }
        const seen = new Set<any>();
        const merged: any[] = [];
        for (const r of results) {
          if (r.status !== 'fulfilled') continue;
          const items = r.value.data?.items ?? r.value.data ?? [];
          for (const a of items) {
            if (seen.has(a.id)) continue;
            seen.add(a.id);
            merged.push(a);
          }
        }
        setRows(merged);
      } else if (reportType === 'contracts') {
        const res = await api.contracts.getReports(workspace.id, { type: contractType });
        setRows(res.data?.items ?? res.data ?? []);
      }
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not load this report.'));
    } finally {
      setLoading(false);
      hasLoadedRef.current = true;
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
        { key: 'employee', label: 'Employee', format: (r) => r.reviewee_name ?? r.employee_name ?? (r.employee ? personName(r.employee) : 'You') },
        { key: 'cycle_name', label: 'Cycle', format: (r) => r.cycle_name ?? (r.cycle_id ? `Cycle #${r.cycle_id}` : '—') },
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

  const accent = REPORT_COLORS[reportType] ?? colors.primary;

  // Up to 4 icon tiles across the top of every report — always starts with
  // the row count, then up to 3 report-specific aggregates computed from
  // whatever fields that report actually has. 'contracts' just gets the row
  // count since its columns vary completely by sub-type.
  const headlineStats = useMemo(() => {
    type Tile = { icon: keyof typeof Ionicons.glyphMap; value: string; label: string; color: string };
    if (rows.length === 0) return [] as Tile[];
    const rowWord = rows.length === 1 ? 'Row' : 'Rows';
    const tiles: Tile[] = [];

    if (reportType === 'projects') {
      const totalTasks = rows.reduce((s, r) => s + (Number(r.total_tasks) || 0), 0);
      const completed = rows.filter((r) => r.computed_status === 'completed').length;
      const avgPct = Math.round(rows.reduce((s, r) => s + (Number(r.completion_pct) || 0), 0) / rows.length);
      tiles.push({ icon: REPORT_ICONS.projects, value: String(rows.length), label: 'Projects', color: accent });
      tiles.push({ icon: 'clipboard-outline', value: String(totalTasks), label: 'Total Tasks', color: colors.info });
      tiles.push({ icon: 'checkmark-done-outline', value: String(completed), label: 'Completed', color: colors.success });
      tiles.push({ icon: 'trending-up-outline', value: `${avgPct}%`, label: 'Avg Progress', color: colors.primary });
    } else if (reportType === 'financial') {
      const totalBilling = rows.reduce((s, r) => s + (Number(r.total_billing) || 0), 0);
      const totalProfit = rows.reduce((s, r) => s + (Number(r.profit) || 0), 0);
      const margins = rows.filter((r) => r.margin_pct != null).map((r) => Number(r.margin_pct));
      const avgMargin = margins.length ? Math.round(margins.reduce((a, b) => a + b, 0) / margins.length) : null;
      tiles.push({ icon: REPORT_ICONS.financial, value: String(rows.length), label: 'Projects', color: accent });
      tiles.push({ icon: 'cash-outline', value: `₹${totalBilling.toLocaleString()}`, label: 'Total Billing', color: colors.info });
      tiles.push({ icon: 'trending-up-outline', value: `₹${totalProfit.toLocaleString()}`, label: 'Total Profit', color: colors.success });
      if (avgMargin != null) tiles.push({ icon: 'stats-chart-outline', value: `${avgMargin}%`, label: 'Avg Margin', color: colors.primary });
    } else if (reportType === 'goals') {
      const total = rows.reduce((s, r) => s + (Number(r.goals_total) || 0), 0);
      const approved = rows.reduce((s, r) => s + (Number(r.goals_approved) || 0), 0);
      const pending = rows.reduce((s, r) => s + (Number(r.goals_pending) || 0), 0);
      tiles.push({ icon: REPORT_ICONS.goals, value: String(rows.length), label: 'Employees', color: accent });
      tiles.push({ icon: 'list-outline', value: String(total), label: 'Total Goals', color: colors.info });
      tiles.push({ icon: 'checkmark-done-outline', value: String(approved), label: 'Approved', color: colors.success });
      tiles.push({ icon: 'time-outline', value: String(pending), label: 'Draft', color: colors.warning });
    } else if (reportType === 'performance') {
      const approved = rows.filter((r) => r.status === 'approved').length;
      const scored = rows.filter((r) => r.final_score != null);
      const avg = scored.length ? (scored.reduce((s, r) => s + Number(r.final_score), 0) / scored.length).toFixed(2) : null;
      tiles.push({ icon: REPORT_ICONS.performance, value: String(rows.length), label: 'Reviews', color: accent });
      tiles.push({ icon: 'checkmark-done-outline', value: String(approved), label: 'Approved', color: colors.success });
      if (avg != null) tiles.push({ icon: 'trophy-outline', value: `${avg}/5`, label: 'Avg Score', color: colors.warning });
    } else if (reportType === 'appraisals') {
      const approved = rows.filter((r) => r.status === 'approved').length;
      const pending = rows.filter((r) => (r.status || '').includes('pending')).length;
      const rejected = rows.filter((r) => r.status === 'rejected').length;
      tiles.push({ icon: REPORT_ICONS.appraisals, value: String(rows.length), label: 'Appraisals', color: accent });
      tiles.push({ icon: 'checkmark-done-outline', value: String(approved), label: 'Approved', color: colors.success });
      tiles.push({ icon: 'time-outline', value: String(pending), label: 'Pending', color: colors.warning });
      tiles.push({ icon: 'close-circle-outline', value: String(rejected), label: 'Rejected', color: colors.danger });
    } else {
      tiles.push({ icon: REPORT_ICONS.contracts, value: String(rows.length), label: rowWord, color: accent });
    }
    return tiles;
  }, [rows, reportType, colors, accent]);

  const titleKey = CARD_TITLE_KEY[reportType];
  const badgeKey = CARD_BADGE_KEY[reportType];
  const dataColumns = columns.filter((c) => c.key !== titleKey && c.key !== badgeKey);

  return (
    <View style={s.container}>
      <View style={[s.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.title}>{TITLES[reportType] ?? 'Report'}</Text>
        <View style={{ width: 36 }} />
      </View>

      {reportType === 'contracts' && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.subtypeScroll} contentContainerStyle={s.subtypeRow}>
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
          <View style={s.statsRow}>
            {headlineStats.map((tile) => (
              <View key={tile.label} style={s.statTile}>
                <View style={[s.statTileIconBox, { backgroundColor: tile.color + '22' }]}>
                  <Ionicons name={tile.icon} size={18} color={tile.color} />
                </View>
                <Text style={s.statTileVal} numberOfLines={1}>{tile.value}</Text>
                <Text style={s.statTileLabel} numberOfLines={1}>{tile.label}</Text>
              </View>
            ))}
          </View>

          {rows.map((row, idx) => {
            const titleCol = columns.find((c) => c.key === titleKey);
            const badgeCol = columns.find((c) => c.key === badgeKey);
            const titleText = titleCol ? cellValue(row, titleCol) : `Row ${idx + 1}`;
            const badgeText = badgeCol ? cellValue(row, badgeCol) : null;
            const badgeColor = badgeText ? statusTint(badgeText, colors) : accent;
            return (
              <View key={row.id ?? idx} style={[s.card, { borderLeftColor: accent }]}>
                <View style={s.cardHeader}>
                  <View style={[s.cardIconBox, { backgroundColor: accent + '22' }]}>
                    <Ionicons name={REPORT_ICONS[reportType] ?? 'document-text-outline'} size={16} color={accent} />
                  </View>
                  <Text style={s.cardTitle} numberOfLines={1}>{titleText}</Text>
                  {!!badgeText && badgeText !== '—' && (
                    <View style={[s.cardBadge, { backgroundColor: badgeColor + '1c', borderColor: badgeColor + '44' }]}>
                      <Text style={[s.cardBadgeText, { color: badgeColor }]} numberOfLines={1}>{badgeText}</Text>
                    </View>
                  )}
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.cardColsRow}>
                  {dataColumns.map((col) => {
                    const val = cellValue(row, col);
                    const isPct = col.key.toLowerCase().includes('pct');
                    const pctNum = isPct ? Math.max(0, Math.min(100, parseFloat(val) || 0)) : null;
                    return (
                      <View key={col.key} style={s.cardCol}>
                        <View style={s.cardColLabelRow}>
                          <Ionicons name={columnIcon(col)} size={11} color={colors.textMuted} />
                          <Text style={s.cardColLabel} numberOfLines={1}>{col.label}</Text>
                        </View>
                        <Text style={s.cardColVal} numberOfLines={1}>{val}</Text>
                        {pctNum != null && (
                          <View style={s.miniProgressTrack}>
                            <View style={[s.miniProgressFill, { width: `${pctNum}%`, backgroundColor: accent }]} />
                          </View>
                        )}
                      </View>
                    );
                  })}
                </ScrollView>
              </View>
            );
          })}
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
      paddingHorizontal: 16, paddingBottom: 16,
      backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border,
    },
    backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    title: { fontSize: 18, fontFamily: SERIF, color: c.textPrimary, fontWeight: '700' },
    subtypeScroll: { flexGrow: 0, flexShrink: 0 },
    subtypeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border },
    subtypeChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: c.gray50, borderWidth: 1, borderColor: c.border },
    subtypeChipActive: { backgroundColor: c.primary, borderColor: c.primary },
    subtypeChipText: { fontSize: 12, fontWeight: '600', color: c.gray600 },
    subtypeChipTextActive: { color: '#fff' },
    empty: { alignItems: 'center', gap: 12, paddingTop: 60, flex: 1, justifyContent: 'center' },
    emptyText: { fontSize: 14, color: c.textMuted },
    list: { padding: 16, gap: 12, paddingBottom: 32 },

    // Headline stat tiles
    statsRow: { flexDirection: 'row', gap: 8 },
    statTile: {
      flex: 1, backgroundColor: c.surface, borderRadius: 12, borderWidth: 1, borderColor: c.border,
      paddingVertical: 12, paddingHorizontal: 6, alignItems: 'center', gap: 6,
    },
    statTileIconBox: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
    statTileVal: { fontSize: 15, fontWeight: '800', color: c.textPrimary },
    statTileLabel: { fontSize: 9, fontWeight: '600', color: c.textMuted, textAlign: 'center' },

    // Report row card
    card: { backgroundColor: c.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: c.border, borderLeftWidth: 4 },
    cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
    cardIconBox: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
    cardTitle: { flex: 1, fontSize: 14, fontWeight: '700', color: c.textPrimary },
    cardBadge: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20, borderWidth: 1, maxWidth: 120 },
    cardBadgeText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },

    // Column-wise data strip — horizontally scrollable so any number of
    // columns (financial reports run to 9-10) stays readable on a phone.
    cardColsRow: { flexDirection: 'row', gap: 20 },
    cardCol: { minWidth: 68 },
    cardColLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 3 },
    cardColLabel: { fontSize: 10, color: c.textMuted, fontWeight: '600' },
    cardColVal: { fontSize: 13, color: c.textPrimary, fontWeight: '700' },
    miniProgressTrack: { height: 4, borderRadius: 2, backgroundColor: c.gray100, overflow: 'hidden', marginTop: 5, width: 56 },
    miniProgressFill: { height: '100%', borderRadius: 2 },
  });
}
