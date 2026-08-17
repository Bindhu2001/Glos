import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, ActivityIndicator, Modal, FlatList } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../contexts/ThemeContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useHasTeam } from '../../contexts/HasTeamContext';
import { useApi } from '../../hooks/useApi';
import { AppColors } from '../../utils/colors';
import { apiErrorMessage } from '../../utils/apiError';
import LoadError from '../../components/common/LoadError';

type RView = 'my' | 'team';

const PERIODICITIES = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'] as const;
type Periodicity = typeof PERIODICITIES[number];
const PERIODICITY_LABEL: Record<Periodicity, string> = {
  daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', quarterly: 'Quarterly', yearly: 'Yearly',
};

// Backend shape (routes/hr/routines.js buildMonthRoutineStats):
// { routine: { id, description, periodicity, position }, role_name, area_name,
//   combined_pct, status, tasks_completed, tasks_total, expected_count, last_completed_on }
interface RoutineStat {
  routine: { id: number; description: string; periodicity: Periodicity; position?: number };
  role_name?: string;
  area_name?: string | null;
  combined_pct: number | null;
  status: 'not_started' | 'incomplete' | 'pending' | 'completed' | 'not_applicable';
  tasks_completed: number;
  tasks_total: number;
  expected_count?: number;
}

interface Reportee {
  user: { id: number; first_name?: string; last_name?: string; email?: string };
  primary_role_name?: string;
  routine_stats: RoutineStat[];
  overall_efficiency: number | null;
  is_manager: boolean;
}

const STATUS_COLORS: Record<string, string> = {
  completed: '#059669',
  pending: '#d97706',
  incomplete: '#dc2626',
  not_started: '#94a3b8',
  not_applicable: '#94a3b8',
};

function personName(u: { first_name?: string; last_name?: string; email?: string }) {
  return [u.first_name, u.last_name].filter(Boolean).join(' ') || u.email || 'Member';
}

function initials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';
}

function buildMonthOptions() {
  const opts: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    opts.push({ value: val, label });
  }
  return opts;
}

function effClass(pct: number | null): 'high' | 'mid' | 'low' {
  if (pct == null) return 'low';
  return pct >= 80 ? 'high' : pct >= 50 ? 'mid' : 'low';
}

function OdometerRing({ type, pct, colors }: { type: Periodicity; pct: number; colors: AppColors }) {
  const cls = effClass(pct);
  const color = cls === 'high' ? colors.success : cls === 'mid' ? colors.warning : colors.danger;
  // Sized so 3-digit percentages (e.g. "333%") have clearance from the ring
  // stroke instead of nearly touching it.
  const size = 80;
  const r = 32;
  const circ = 2 * Math.PI * r;
  const dash = circ * (1 - Math.min(pct, 100) / 100);
  return (
    <View style={{ alignItems: 'center', width: 96 }}>
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.gray100} strokeWidth={6} fill="none" />
          <Circle
            cx={size / 2} cy={size / 2} r={r}
            stroke={color} strokeWidth={6} fill="none"
            strokeDasharray={`${circ} ${circ}`}
            strokeDashoffset={dash}
            strokeLinecap="round"
            rotation={-90}
            origin={`${size / 2}, ${size / 2}`}
          />
        </Svg>
        <Text style={{ position: 'absolute', fontSize: 14, fontWeight: '800', color: colors.textPrimary }}>{pct}%</Text>
      </View>
      <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textSecondary, marginTop: 8 }}>{PERIODICITY_LABEL[type]}</Text>
    </View>
  );
}

// Mirrors backend's buildTeamAggregates() type_stats: the mean of each routine's
// own (already 0-100 capped) combined_pct — NOT sum(done)/sum(expected), which lets
// one overachieved routine (e.g. 26/4) blow the aggregate past 100%.
function typeEfficiencyFor(stats: RoutineStat[]) {
  const out: Partial<Record<Periodicity, number>> = {};
  for (const p of PERIODICITIES) {
    const items = stats.filter((r) => r.routine?.periodicity === p);
    if (items.length === 0) continue;
    // Matches web's TeamRoutines.jsx exactly: sum tasks_completed/expected_count
    // across every routine of this periodicity, then take one ratio — NOT an
    // average of each routine's own already-rounded percentage. Averaging
    // percentages under- or over-weights routines with different expected
    // counts (e.g. one expected 22x/month, another only 4x), which is why this
    // used to disagree with web's number for the same person/month.
    const done = items.reduce((sum, r) => sum + (r.tasks_completed ?? 0), 0);
    const exp = items.reduce((sum, r) => sum + (r.expected_count ?? 0), 0);
    out[p] = exp > 0 ? Math.min(100, Math.round((done / exp) * 100)) : 0;
  }
  return out;
}

function RoutineRow({ r, colors, s }: { r: RoutineStat; colors: AppColors; s: any }) {
  const statusColor = STATUS_COLORS[r.status] ?? '#6b7280';
  return (
    <View style={s.routineRow}>
      <View style={{ flex: 1 }}>
        <Text style={s.routineTitle}>{r.routine.description}</Text>
        <View style={s.metaRow}>
          {r.role_name ? <Text style={s.metaText}>{r.role_name}</Text> : null}
          <Text style={s.metaText}>{PERIODICITY_LABEL[r.routine.periodicity] ?? r.routine.periodicity}</Text>
          <Text style={s.metaText}>{r.tasks_completed}/{r.expected_count ?? r.tasks_total} done</Text>
        </View>
      </View>
      <View style={[s.statusBadge, { backgroundColor: statusColor + '18', borderColor: statusColor + '44' }]}>
        <Text style={[s.statusText, { color: statusColor }]}>
          {r.combined_pct != null ? `${r.combined_pct}%` : r.status.replace('_', ' ')}
        </Text>
      </View>
    </View>
  );
}

function MonthPickerModal({
  visible, onClose, options, value, onSelect, colors, s,
}: {
  visible: boolean; onClose: () => void; options: { value: string; label: string }[];
  value: string; onSelect: (v: string) => void; colors: AppColors; s: any;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={s.modalBackdrop} activeOpacity={1} onPress={onClose}>
        <View style={s.monthModalCard}>
          <Text style={s.monthModalTitle}>Select Month</Text>
          <FlatList
            data={options}
            keyExtractor={(o) => o.value}
            style={{ maxHeight: 340 }}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[s.monthOption, item.value === value && s.monthOptionActive]}
                onPress={() => { onSelect(item.value); onClose(); }}
              >
                <Text style={[s.monthOptionTxt, item.value === value && s.monthOptionTxtActive]}>{item.label}</Text>
                {item.value === value && <Ionicons name="checkmark" size={16} color={colors.primary} />}
              </TouchableOpacity>
            )}
          />
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

// ── Per-member routine breakdown (drill-down from Team Routine Summary) ──────
function MemberDetail({
  person, appId, colors, s, insets, onBack,
}: {
  person: Reportee; appId: number; colors: AppColors; s: any; insets: { top: number }; onBack: () => void;
}) {
  const api = useApi();
  const monthOptions = useMemo(buildMonthOptions, []);
  const [selectedMonth, setSelectedMonth] = useState(monthOptions[0].value);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [stats, setStats] = useState<RoutineStat[]>(person.routine_stats);
  const [efficiency, setEfficiency] = useState<number | null>(person.overall_efficiency);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    // stats/efficiency always already have a value (either from the person
    // prop or the previously-loaded month) — never blank the view, just swap
    // in the new month's numbers once they arrive.
    try {
      const res = await api.routines.getDashboard(appId, { userId: person.user.id, mode: 'month', month: selectedMonth });
      setStats(res.data?.routine_stats ?? []);
      setEfficiency(res.data?.overall_efficiency ?? null);
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not load this member\'s routines.'));
    }
  }, [appId, person.user.id, selectedMonth]);

  useEffect(() => { load(); }, [load]);

  const name = personName(person.user);
  const typeEff = typeEfficiencyFor(stats);
  const activeTypes = PERIODICITIES.filter((p) => typeEff[p] != null);
  const monthLabel = monthOptions.find((o) => o.value === selectedMonth)?.label ?? selectedMonth;

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity onPress={onBack} style={s.backBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.title} numberOfLines={1}>{name}</Text>
        <TouchableOpacity style={s.monthBtn} onPress={() => setPickerOpen(true)}>
          <Text style={s.monthBtnTxt} numberOfLines={1}>{monthLabel}</Text>
          <Ionicons name="chevron-down" size={14} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {error ? (
        <LoadError message={error} onRetry={load} />
      ) : (
        <ScrollView contentContainerStyle={s.list} showsVerticalScrollIndicator={false}>
          {activeTypes.length > 0 && (
            <View style={s.ringRow}>
              {activeTypes.map((p) => <OdometerRing key={p} type={p} pct={typeEff[p] ?? 0} colors={colors} />)}
              {efficiency != null && (
                <View style={{ alignItems: 'center', width: 76 }}>
                  <View style={[s.overallPill, { borderColor: colors.primary }]}>
                    <Text style={[s.overallPillTxt, { color: colors.primary }]}>{efficiency}%</Text>
                  </View>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textSecondary, marginTop: 6 }}>Overall</Text>
                </View>
              )}
            </View>
          )}

          {stats.length === 0 ? (
            <View style={s.empty}>
              <Ionicons name="calendar-outline" size={40} color={colors.gray400} />
              <Text style={s.emptyText}>No routines for this month</Text>
            </View>
          ) : (
            stats.map((r) => (
              <View key={r.routine.id} style={s.card}>
                <RoutineRow r={r} colors={colors} s={s} />
                {r.area_name ? <Text style={s.areaSub}>{r.area_name}</Text> : null}
              </View>
            ))
          )}
        </ScrollView>
      )}

      <MonthPickerModal
        visible={pickerOpen} onClose={() => setPickerOpen(false)}
        options={monthOptions} value={selectedMonth} onSelect={setSelectedMonth}
        colors={colors} s={s}
      />
    </View>
  );
}

export default function RoutinesScreen() {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const { workspace } = useWorkspace();
  const { canSeeTeamContent } = useHasTeam();
  const api = useApi();
  const insets = useSafeAreaInsets();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const monthOptions = useMemo(buildMonthOptions, []);
  const [view, setView] = useState<RView>('my');
  const [selectedMonth, setSelectedMonth] = useState(monthOptions[0].value);
  const [pickerOpen, setPickerOpen] = useState(false);

  const [myStats, setMyStats] = useState<RoutineStat[]>([]);
  const [reportees, setReportees] = useState<Reportee[]>([]);
  const [teamTypeStats, setTeamTypeStats] = useState<Partial<Record<Periodicity, number>>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMember, setSelectedMember] = useState<Reportee | null>(null);

  const hasLoadedRef = useRef(false);

  const load = useCallback(async (v: RView, month: string) => {
    if (!workspace?.id) return;
    if (!hasLoadedRef.current) setLoading(true);
    try {
      if (v === 'my') {
        const res = await api.routines.getDashboard(workspace.id, { mode: 'month', month });
        setMyStats(res.data?.routine_stats ?? []);
      } else {
        const res = await api.routines.getTeamDashboard(workspace.id, { mode: 'month', month });
        setReportees(res.data?.reportees ?? []);
        setTeamTypeStats(res.data?.type_stats ?? {});
      }
      setError(null);
    } catch (err) {
      setMyStats([]);
      setReportees([]);
      setTeamTypeStats({});
      setError(apiErrorMessage(err, 'Could not load routines.'));
    } finally {
      setLoading(false);
      hasLoadedRef.current = true;
    }
  }, [workspace?.id]);

  useEffect(() => { setSelectedMember(null); load(view, selectedMonth); }, [view, selectedMonth, load]);

  const monthLabel = monthOptions.find((o) => o.value === selectedMonth)?.label ?? selectedMonth;
  const myTypeEff = useMemo(() => typeEfficiencyFor(myStats), [myStats]);
  const myActiveTypes = PERIODICITIES.filter((p) => myTypeEff[p] != null);
  const teamActiveTypes = PERIODICITIES.filter((p) => teamTypeStats[p] != null);

  if (selectedMember && workspace) {
    return (
      <MemberDetail
        person={selectedMember} appId={workspace.id} colors={colors} s={s} insets={insets}
        onBack={() => setSelectedMember(null)}
      />
    );
  }

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.title}>Routines</Text>
        <TouchableOpacity style={s.monthBtn} onPress={() => setPickerOpen(true)}>
          <Text style={s.monthBtnTxt} numberOfLines={1}>{monthLabel}</Text>
          <Ionicons name="chevron-down" size={14} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {canSeeTeamContent && (
        <View style={s.toggleRow}>
          <TouchableOpacity style={[s.toggleBtn, view === 'my' && s.toggleBtnActive]} onPress={() => setView('my')}>
            <Text style={[s.toggleTxt, view === 'my' && s.toggleTxtActive]}>My Routines</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.toggleBtn, view === 'team' && s.toggleBtnActive]} onPress={() => setView('team')}>
            <Text style={[s.toggleTxt, view === 'team' && s.toggleTxtActive]}>Team Routines</Text>
          </TouchableOpacity>
        </View>
      )}

      {loading ? (
        <ActivityIndicator style={{ flex: 1 }} color={colors.primary} />
      ) : error ? (
        <LoadError message={error} onRetry={() => load(view, selectedMonth)} />
      ) : view === 'my' ? (
        <ScrollView contentContainerStyle={s.list} showsVerticalScrollIndicator={false}>
          {myActiveTypes.length > 0 && (
            <View style={s.ringRow}>
              {myActiveTypes.map((p) => <OdometerRing key={p} type={p} pct={myTypeEff[p] ?? 0} colors={colors} />)}
            </View>
          )}
          {myStats.length === 0 ? (
            <View style={s.empty}>
              <Ionicons name="calendar-outline" size={40} color={colors.gray400} />
              <Text style={s.emptyText}>No routines found for this month</Text>
            </View>
          ) : (
            myStats.map((r) => (
              <View key={r.routine.id} style={s.card}>
                <RoutineRow r={r} colors={colors} s={s} />
              </View>
            ))
          )}
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={s.list} showsVerticalScrollIndicator={false}>
          {teamActiveTypes.length > 0 && (
            <View style={s.ringRow}>
              {teamActiveTypes.map((p) => <OdometerRing key={p} type={p} pct={teamTypeStats[p] ?? 0} colors={colors} />)}
            </View>
          )}

          {reportees.length === 0 ? (
            <View style={s.empty}>
              <Ionicons name="people-outline" size={40} color={colors.gray400} />
              <Text style={s.emptyText}>No team members found</Text>
            </View>
          ) : (
            <View style={s.summaryCard}>
              <Text style={s.summaryHead}>TEAM ROUTINE SUMMARY · {reportees.length} member{reportees.length !== 1 ? 's' : ''}</Text>
              {reportees.map((p) => {
                const name = personName(p.user);
                const eff = p.overall_efficiency;
                const effColor = eff == null ? colors.textMuted : eff >= 80 ? colors.success : eff >= 50 ? colors.warning : colors.danger;
                return (
                  <TouchableOpacity key={p.user.id} style={s.memberRow} onPress={() => setSelectedMember(p)}>
                    <View style={s.memberAvatar}><Text style={s.memberAvatarTxt}>{initials(name)}</Text></View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={s.memberName} numberOfLines={1}>{name}</Text>
                        {p.is_manager && <View style={s.managerBadge}><Text style={s.managerBadgeTxt}>You</Text></View>}
                      </View>
                      {p.primary_role_name ? <Text style={s.metaText}>{p.primary_role_name}</Text> : null}
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={[s.memberEff, { color: effColor }]}>{eff != null ? `${eff}%` : '—'}</Text>
                      <Text style={s.memberEffLbl}>{p.routine_stats.length} routine{p.routine_stats.length !== 1 ? 's' : ''}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.gray400} />
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </ScrollView>
      )}

      <MonthPickerModal
        visible={pickerOpen} onClose={() => setPickerOpen(false)}
        options={monthOptions} value={selectedMonth} onSelect={setSelectedMonth}
        colors={colors} s={s}
      />
    </View>
  );
}

function makeStyles(c: AppColors) {
  const SERIF = Platform.OS === 'ios' ? 'Georgia' : 'serif';
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8,
      paddingHorizontal: 16, paddingVertical: 12,
      backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border,
    },
    backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    title: { flex: 1, fontSize: 26, fontFamily: SERIF, color: c.textPrimary, fontWeight: '700' },
    monthBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
      backgroundColor: c.primaryLight, maxWidth: 140,
    },
    monthBtnTxt: { fontSize: 12, fontWeight: '700', color: c.primary },
    toggleRow: {
      flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 10,
      backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border,
    },
    toggleBtn: { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center', backgroundColor: c.gray50, borderWidth: 1, borderColor: c.border },
    toggleBtnActive: { backgroundColor: c.primary, borderColor: c.primary },
    toggleTxt: { fontSize: 13, fontWeight: '700', color: c.textSecondary },
    toggleTxtActive: { color: '#fff' },
    list: { padding: 16, gap: 10 },
    ringRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 20, marginBottom: 6 },
    overallPill: { width: 64, height: 64, borderRadius: 32, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
    overallPillTxt: { fontSize: 15, fontWeight: '800' },
    empty: { alignItems: 'center', gap: 12, paddingTop: 60 },
    emptyText: { fontSize: 14, color: c.textMuted },
    card: { backgroundColor: c.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: c.border },
    areaSub: { fontSize: 11, color: c.textMuted, marginTop: 6 },
    // flex-start, not center: when the routine title/description wraps to two
    // lines, centering the row vertically floats the % badge in the middle of
    // the card instead of level with the title's first line.
    routineRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    routineTitle: { fontSize: 13, fontWeight: '700', color: c.textPrimary, marginBottom: 4 },
    metaRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
    metaText: { fontSize: 11, color: c.textMuted },
    statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
    statusText: { fontSize: 11, fontWeight: '700' },

    // Team Routine Summary
    summaryCard: { backgroundColor: c.surface, borderRadius: 14, borderWidth: 1, borderColor: c.border, overflow: 'hidden' },
    summaryHead: {
      fontSize: 10, fontWeight: '700', color: c.textMuted, letterSpacing: 1,
      paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border, backgroundColor: c.gray50,
    },
    memberRow: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingHorizontal: 14, paddingVertical: 12,
      borderBottomWidth: 1, borderBottomColor: c.border,
    },
    memberAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' },
    memberAvatarTxt: { fontSize: 13, fontWeight: '800', color: '#fff' },
    memberName: { fontSize: 13, fontWeight: '700', color: c.textPrimary },
    managerBadge: { backgroundColor: c.primaryLight, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 1 },
    managerBadgeTxt: { fontSize: 9, fontWeight: '700', color: c.primary },
    memberEff: { fontSize: 15, fontWeight: '800' },
    memberEffLbl: { fontSize: 10, color: c.textMuted, marginTop: 1 },

    modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
    monthModalCard: { backgroundColor: c.surface, borderRadius: 16, padding: 16, maxHeight: '70%' },
    monthModalTitle: { fontSize: 15, fontWeight: '800', color: c.textPrimary, marginBottom: 10 },
    monthOption: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingVertical: 12, paddingHorizontal: 8, borderRadius: 8,
    },
    monthOptionActive: { backgroundColor: c.primaryLight },
    monthOptionTxt: { fontSize: 14, color: c.textPrimary },
    monthOptionTxtActive: { fontWeight: '700', color: c.primary },
  });
}
