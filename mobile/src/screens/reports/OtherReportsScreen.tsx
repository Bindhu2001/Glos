import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../../contexts/ThemeContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useApi } from '../../hooks/useApi';
import { AppColors } from '../../utils/colors';
import { apiErrorMessage } from '../../utils/apiError';
import LoadError from '../../components/common/LoadError';
import MemberPickerModal, { PickOption } from '../../components/common/MemberPickerModal';

function pad(n: number) { return String(n).padStart(2, '0'); }
function ymNow() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}
function monthLabel(ym: string) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' });
}
function fmtHours(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

const STATUS_META: Record<string, { bg: string; color: string; label: string }> = {
  completed: { bg: 'rgba(16,185,129,0.15)', color: '#10b981', label: 'Completed' },
  pending: { bg: 'rgba(245,158,11,0.15)', color: '#f59e0b', label: 'In Progress' },
  not_started: { bg: 'rgba(239,68,68,0.15)', color: '#ef4444', label: 'Not Started' },
  not_applicable: { bg: 'rgba(148,163,184,0.15)', color: '#94a3b8', label: 'N/A' },
};

interface EmployeeBreakdown {
  userId: number;
  name: string;
  areaMinutes: number;
  completed: number;
  pending: number;
  notStarted: number;
}

export default function OtherReportsScreen() {
  const navigation = useNavigation<any>();
  const { colors } = useTheme();
  const { workspace } = useWorkspace();
  const api = useApi();
  const insets = useSafeAreaInsets();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [month, setMonth] = useState(ymNow());
  const [meId, setMeId] = useState<number | null>(null);
  const [meName, setMeName] = useState('You');

  // Role + employee filters — matches web's OtherReports.jsx builder. Empty
  // selection defaults to "just me", the screen's original single-user view.
  const [roles, setRoles] = useState<{ id: number; name: string }[]>([]);
  const [roleId, setRoleId] = useState<number | null>(null);
  const [rolePickerOpen, setRolePickerOpen] = useState(false);
  const [roleEmployees, setRoleEmployees] = useState<PickOption[]>([]);
  const [employeesLoading, setEmployeesLoading] = useState(false);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<number[]>([]);
  const [employeePickerOpen, setEmployeePickerOpen] = useState(false);

  const [areas, setAreas] = useState<any[]>([]);
  const [routines, setRoutines] = useState<any[]>([]);
  const [routineSummary, setRoutineSummary] = useState<any>(null);
  const [breakdown, setBreakdown] = useState<EmployeeBreakdown[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const atMax = month === ymNow();
  const stepMonth = (dir: -1 | 1) => {
    if (dir === 1 && atMax) return;
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m - 1 + dir, 1);
    setMonth(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`);
  };

  useEffect(() => {
    if (!workspace?.id) return;
    api.me.getProfile().then((r: any) => {
      setMeId(r.data?.id ?? r.data?.user?.id ?? null);
      const u = r.data?.user ?? r.data;
      setMeName([u?.first_name, u?.last_name].filter(Boolean).join(' ') || u?.email || 'You');
    }).catch(() => {});
    api.roles.list(workspace.id).then((r: any) => {
      const items = r.data?.items ?? r.data ?? [];
      setRoles(items.map((role: any) => ({ id: role.id, name: role.name ?? role.title ?? 'Role' })));
    }).catch(() => {});
  }, [workspace?.id]);

  // Role change reloads the employee list for that role and clears any
  // employee selection that no longer applies — matches web.
  useEffect(() => {
    setSelectedEmployeeIds([]);
    setRoleEmployees([]);
    if (!workspace?.id || roleId == null) return;
    setEmployeesLoading(true);
    api.otherReports.getEmployeesByRole(workspace.id, roleId)
      .then((r: any) => {
        const items = r.data?.items ?? [];
        setRoleEmployees(items.map((u: any) => ({ id: u.id, name: [u.first_name, u.last_name].filter(Boolean).join(' ') || u.email })));
      })
      .catch(() => setRoleEmployees([]))
      .finally(() => setEmployeesLoading(false));
  }, [workspace?.id, roleId]);

  const targetUsers = useMemo((): PickOption[] => {
    if (selectedEmployeeIds.length > 0) {
      return roleEmployees.filter((e) => selectedEmployeeIds.includes(e.id));
    }
    return meId != null ? [{ id: meId, name: meName }] : [];
  }, [selectedEmployeeIds, roleEmployees, meId, meName]);

  const load = useCallback(async () => {
    if (!workspace?.id || targetUsers.length === 0) return;
    setLoading(true);
    try {
      if (targetUsers.length === 1) {
        // Single-user view — same detailed area/routine cards as before.
        const [areasRes, routinesRes] = await Promise.all([
          api.otherReports.getAreaReport(workspace.id, { month, user_id: targetUsers[0].id }),
          api.otherReports.getRoutineReport(workspace.id, { month, user_id: targetUsers[0].id }),
        ]);
        setAreas(areasRes.data?.items ?? []);
        setRoutines(routinesRes.data?.items ?? []);
        setRoutineSummary(routinesRes.data?.summary ?? null);
        setBreakdown([]);
      } else {
        // Multiple employees — per-employee rollup table, matching web's
        // per-employee-breakdown builder output. One pair of calls per
        // employee, run in parallel, same as web's userList.map(...).
        const results = await Promise.all(targetUsers.map(async (u) => {
          const [areasRes, routinesRes] = await Promise.all([
            api.otherReports.getAreaReport(workspace.id, { month, user_id: u.id }).catch(() => ({ data: { items: [] } })),
            api.otherReports.getRoutineReport(workspace.id, { month, user_id: u.id }).catch(() => ({ data: { items: [], summary: null } })),
          ]);
          const aItems = areasRes.data?.items ?? [];
          const summary = routinesRes.data?.summary ?? { completed: 0, pending: 0, not_started: 0 };
          return {
            userId: u.id,
            name: u.name,
            areaMinutes: aItems.reduce((sum: number, a: any) => sum + (a.total_minutes ?? 0), 0),
            completed: summary.completed ?? 0,
            pending: summary.pending ?? 0,
            notStarted: summary.not_started ?? 0,
          } as EmployeeBreakdown;
        }));
        setBreakdown(results);
        setAreas([]); setRoutines([]); setRoutineSummary(null);
      }
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not load this report.'));
    } finally {
      setLoading(false);
    }
  }, [workspace?.id, month, targetUsers]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const totalAreaMinutes = areas.reduce((sum, a) => sum + (a.total_minutes ?? 0), 0);
  const isMulti = targetUsers.length > 1;

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.title}>Areas & Routines</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterScroll} contentContainerStyle={s.filterRow}>
        <View style={s.monthRow}>
          <TouchableOpacity onPress={() => stepMonth(-1)} style={s.monthBtn}>
            <Ionicons name="chevron-back" size={16} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={s.monthLabel}>{monthLabel(month)}</Text>
          <TouchableOpacity onPress={() => stepMonth(1)} disabled={atMax} style={s.monthBtn}>
            <Ionicons name="chevron-forward" size={16} color={atMax ? colors.gray300 : colors.textPrimary} />
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={s.filterChip} onPress={() => setRolePickerOpen(true)}>
          <Text style={s.filterChipTxt} numberOfLines={1}>{roleId != null ? roles.find((r) => r.id === roleId)?.name ?? 'Role' : 'Any Role'}</Text>
          <Ionicons name="chevron-down" size={12} color={colors.textSecondary} />
        </TouchableOpacity>
        {roleId != null && (
          <TouchableOpacity
            style={[s.filterChip, employeesLoading && { opacity: 0.5 }]}
            onPress={() => !employeesLoading && setEmployeePickerOpen(true)}
            disabled={employeesLoading}
          >
            <Text style={s.filterChipTxt} numberOfLines={1}>
              {selectedEmployeeIds.length === 0 ? 'Me only'
                : selectedEmployeeIds.length === roleEmployees.length ? 'All Employees'
                : `${selectedEmployeeIds.length} Employees`}
            </Text>
            <Ionicons name="chevron-down" size={12} color={colors.textSecondary} />
          </TouchableOpacity>
        )}
      </ScrollView>

      {loading ? (
        <ActivityIndicator style={{ flex: 1 }} color={colors.primary} />
      ) : error ? (
        <LoadError message={error} onRetry={load} />
      ) : isMulti ? (
        <ScrollView contentContainerStyle={[s.list, { paddingBottom: 24 + insets.bottom }]}>
          <Text style={s.sectionTitle}>Employee Breakdown</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ minWidth: 480 }}>
            <View style={{ minWidth: 480 }}>
              <View style={s.tableHead}>
                <Text style={[s.th, s.alignLeft, { width: 140 }]}>Employee</Text>
                <Text style={[s.th, { width: 80 }]}>Area Hrs</Text>
                <Text style={[s.th, { width: 90 }]}>Completed</Text>
                <Text style={[s.th, { width: 90 }]}>Pending</Text>
                <Text style={[s.th, { width: 90 }]}>Not Started</Text>
              </View>
              {breakdown.map((b) => (
                <View key={b.userId} style={s.tableRow}>
                  <Text style={[s.td, s.alignLeft, { width: 140 }]} numberOfLines={1}>{b.name}</Text>
                  <Text style={[s.td, { width: 80 }]}>{fmtHours(b.areaMinutes)}</Text>
                  <Text style={[s.td, { width: 90, color: colors.success, fontWeight: '700' }]}>{b.completed}</Text>
                  <Text style={[s.td, { width: 90, color: colors.warning, fontWeight: '700' }]}>{b.pending}</Text>
                  <Text style={[s.td, { width: 90, color: colors.danger, fontWeight: '700' }]}>{b.notStarted}</Text>
                </View>
              ))}
            </View>
          </ScrollView>
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={[s.list, { paddingBottom: 24 + insets.bottom }]}>
          {routineSummary && (
            <View style={s.statsRow}>
              <View style={s.statTile}>
                <Text style={s.statVal}>{routineSummary.completed}</Text>
                <Text style={s.statLabel}>Completed</Text>
              </View>
              <View style={s.statTile}>
                <Text style={s.statVal}>{routineSummary.pending}</Text>
                <Text style={s.statLabel}>In Progress</Text>
              </View>
              <View style={s.statTile}>
                <Text style={s.statVal}>{routineSummary.not_started}</Text>
                <Text style={s.statLabel}>Not Started</Text>
              </View>
              <View style={s.statTile}>
                <Text style={s.statVal}>{fmtHours(totalAreaMinutes)}</Text>
                <Text style={s.statLabel}>Area Hours</Text>
              </View>
            </View>
          )}

          <Text style={s.sectionTitle}>Areas</Text>
          {areas.length === 0 ? (
            <Text style={s.emptyHint}>No areas found for this role this month</Text>
          ) : (
            areas.map((a) => {
              const pct = totalAreaMinutes > 0 ? Math.round((a.total_minutes / totalAreaMinutes) * 100) : 0;
              return (
                <View key={a.area_id} style={s.card}>
                  <View style={s.cardHeader}>
                    <Text style={s.cardTitle} numberOfLines={1}>{a.area_name}</Text>
                    <Text style={s.cardHours}>{fmtHours(a.total_minutes)}</Text>
                  </View>
                  <View style={s.progressTrack}>
                    <View style={[s.progressFill, { width: `${pct}%`, backgroundColor: colors.primary }]} />
                  </View>
                  <Text style={s.cardSub}>{a.tasks_done}/{a.task_count} tasks done</Text>
                </View>
              );
            })
          )}

          <Text style={s.sectionTitle}>Routines</Text>
          {routines.length === 0 ? (
            <Text style={s.emptyHint}>No routines found for this role this month</Text>
          ) : (
            routines.map((r) => {
              const meta = STATUS_META[r.status] ?? STATUS_META.not_applicable;
              return (
                <View key={r.routine_id} style={s.card}>
                  <View style={s.cardHeader}>
                    <Text style={s.cardTitle} numberOfLines={2}>{r.description}</Text>
                    <View style={[s.badge, { backgroundColor: meta.bg }]}>
                      <Text style={[s.badgeText, { color: meta.color }]}>{meta.label}</Text>
                    </View>
                  </View>
                  <Text style={s.cardSub}>
                    {r.periodicity} · {r.tasks_done}/{r.expected} done
                    {r.completion_pct != null ? ` · ${r.completion_pct}%` : ''} · {fmtHours(r.total_minutes)}
                  </Text>
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      <MemberPickerModal
        visible={rolePickerOpen}
        title="Filter by Role"
        options={roles}
        selected={roleId != null ? [roleId] : []}
        onChange={(ids) => setRoleId(ids[0] ?? null)}
        onClose={() => setRolePickerOpen(false)}
      />
      <MemberPickerModal
        visible={employeePickerOpen}
        title="Select Employees"
        options={roleEmployees}
        multi
        selected={selectedEmployeeIds}
        onChange={setSelectedEmployeeIds}
        onClose={() => setEmployeePickerOpen(false)}
      />
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
    filterScroll: { flexGrow: 0, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border },
    filterRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
    monthRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    monthBtn: { padding: 4 },
    monthLabel: { fontSize: 13, fontWeight: '700', color: c.textPrimary, minWidth: 130, textAlign: 'center' },
    filterChip: {
      flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: 150,
      backgroundColor: c.gray50, borderWidth: 1, borderColor: c.border, borderRadius: 16,
      paddingHorizontal: 12, paddingVertical: 7,
    },
    filterChipTxt: { fontSize: 12, fontWeight: '600', color: c.textSecondary, flexShrink: 1 },
    list: { padding: 16, gap: 10 },
    statsRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
    statTile: {
      flex: 1, backgroundColor: c.surface, borderRadius: 12, borderWidth: 1, borderColor: c.border,
      paddingVertical: 12, alignItems: 'center', gap: 4,
    },
    statVal: { fontSize: 16, fontWeight: '800', color: c.textPrimary },
    statLabel: { fontSize: 9, fontWeight: '600', color: c.textMuted, textAlign: 'center' },
    sectionTitle: { fontSize: 13, fontWeight: '700', color: c.textSecondary, marginTop: 12, marginBottom: 2, textTransform: 'uppercase', letterSpacing: 0.5 },
    emptyHint: { fontSize: 13, color: c.textMuted, fontStyle: 'italic', paddingVertical: 8 },
    card: { backgroundColor: c.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: c.border },
    cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    cardTitle: { flex: 1, fontSize: 14, fontWeight: '700', color: c.textPrimary },
    cardHours: { fontSize: 13, fontWeight: '700', color: c.primary },
    cardSub: { fontSize: 12, color: c.textSecondary, marginTop: 6 },
    progressTrack: { height: 6, borderRadius: 3, backgroundColor: c.gray100, overflow: 'hidden', marginTop: 8 },
    progressFill: { height: '100%', borderRadius: 3 },
    badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
    badgeText: { fontSize: 10, fontWeight: '700' },
    tableHead: { flexDirection: 'row', gap: 12, borderBottomWidth: 1, borderBottomColor: c.border, paddingBottom: 6, marginBottom: 4 },
    th: { fontSize: 10, fontWeight: '700', color: c.textMuted, textAlign: 'right' },
    alignLeft: { textAlign: 'left' },
    tableRow: { flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.border },
    td: { fontSize: 12, color: c.textPrimary, textAlign: 'right', fontWeight: '600' },
  });
}
