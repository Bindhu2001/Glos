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
import { formatDate } from '../../utils/format';

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
  last_completed_on?: string | null;
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

// Per-periodicity odometer %. Matches web's TeamRoutines.jsx MemberDetailPanel
// (fix 55e0f87e): cap EACH routine's own completion at 100% first, then take
// the plain mean across routines of that periodicity — do NOT sum raw
// completed/expected and clamp only the final ratio, since an over-achieving
// routine (e.g. 22/5) then mathematically absorbs another's shortfall (4/5)
// and hides genuinely incomplete routines.
function typeEfficiencyFor(stats: RoutineStat[]) {
  const out: Partial<Record<Periodicity, number>> = {};
  for (const p of PERIODICITIES) {
    const items = stats.filter((r) => r.routine?.periodicity === p);
    if (items.length === 0) continue;
    const capped = items.map((r) => {
      const exp = r.expected_count ?? 0;
      if (exp <= 0) return 0;
      return Math.min(100, ((r.tasks_completed ?? 0) / exp) * 100);
    });
    out[p] = Math.round(capped.reduce((sum, v) => sum + v, 0) / capped.length);
  }
  return out;
}

const STATUS_LABEL: Record<string, string> = {
  completed: 'Completed', pending: 'Pending', incomplete: 'Incomplete',
  not_started: 'Not Started', not_applicable: 'N/A',
};
const ATTENTION_ORDER: Record<string, number> = { incomplete: 0, pending: 1, not_started: 2 };

// Matches web's MyRoutines.jsx AttentionSection exactly — everything that
// isn't completed/not_applicable, sorted worst-first, grouped by role.
function AttentionSection({ stats, colors, s }: { stats: RoutineStat[]; colors: AppColors; s: any }) {
  const attention = stats
    .filter((r) => r.status !== 'completed' && r.status !== 'not_applicable')
    .sort((a, b) => (ATTENTION_ORDER[a.status] ?? 3) - (ATTENTION_ORDER[b.status] ?? 3));

  if (attention.length === 0) {
    return (
      <View style={s.allDone}>
        <Text style={{ fontSize: 20 }}>✅</Text>
        <Text style={s.allDoneText}>All routines completed for this period!</Text>
      </View>
    );
  }

  const byRole = new Map<string, RoutineStat[]>();
  for (const item of attention) {
    const role = item.role_name || 'General';
    if (!byRole.has(role)) byRole.set(role, []);
    byRole.get(role)!.push(item);
  }

  return (
    <View style={s.attentionSection}>
      <View style={s.attentionHeader}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={s.attentionTitle}>Needs Attention</Text>
          <View style={s.attentionCount}><Text style={s.attentionCountTxt}>{attention.length}</Text></View>
        </View>
        <Text style={s.attentionSub}>Routines that are incomplete or not yet started</Text>
      </View>
      {[...byRole.entries()].map(([role, items]) => (
        <View key={role} style={{ marginTop: 10 }}>
          <Text style={s.attentionRoleLabel}>{role}</Text>
          {items.map((item) => {
            const remaining = item.expected_count != null ? item.expected_count - item.tasks_completed : null;
            const color = STATUS_COLORS[item.status] ?? '#6b7280';
            return (
              <View key={item.routine.id} style={[s.attentionItem, { borderLeftColor: color }]}>
                <View style={{ flex: 1 }}>
                  <Text style={s.attentionName} numberOfLines={1}>{item.routine.description}</Text>
                  <Text style={s.attentionMeta}>
                    {PERIODICITY_LABEL[item.routine.periodicity] ?? item.routine.periodicity}
                    {item.area_name ? ` · ${item.area_name}` : ''}
                    {remaining !== null && remaining > 0 ? ` · ${remaining} more to go` : ''}
                  </Text>
                </View>
                {!!item.expected_count && (
                  <Text style={s.attentionTasks}>{item.tasks_completed}/{item.expected_count}</Text>
                )}
                <View style={[s.statusBadge, { backgroundColor: color + '18', borderColor: color + '44' }]}>
                  <Text style={[s.statusText, { color }]}>{STATUS_LABEL[item.status] ?? item.status}</Text>
                </View>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
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
          {!!r.last_completed_on && <Text style={s.metaText}>Last: {formatDate(r.last_completed_on)}</Text>}
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
  // not_applicable = zero expected occurrences this period (backend's
  // buildMonthRoutineStats), not a deleted routine — never shown as a row.
  const visibleStats = useMemo(() => stats.filter((r) => r.status !== 'not_applicable'), [stats]);

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

          {visibleStats.length === 0 ? (
            <View style={s.empty}>
              <Ionicons name="calendar-outline" size={40} color={colors.gray400} />
              <Text style={s.emptyText}>No routines for this month</Text>
            </View>
          ) : (
            visibleStats.map((r) => (
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
  const [typeFilter, setTypeFilter] = useState<'all' | Periodicity>('all');

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
  // not_applicable = a deleted/inactive assignment — never shown in the
  // routine list itself, same as AttentionSection above already excludes it.
  const visibleMyStats = useMemo(() => myStats.filter((r) => r.status !== 'not_applicable'), [myStats]);
  const myPresentTypes = PERIODICITIES.filter((p) => visibleMyStats.some((r) => r.routine.periodicity === p));
  const filteredMyStats = typeFilter === 'all' ? visibleMyStats : visibleMyStats.filter((r) => r.routine.periodicity === typeFilter);

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
            <>
              <AttentionSection stats={myStats} colors={colors} s={s} />

              <Text style={s.breakdownHead}>All Routines — Breakdown</Text>
              {myPresentTypes.length > 1 && (
                <View style={s.typeTabRow}>
                  <TouchableOpacity style={[s.typeTab, typeFilter === 'all' && s.typeTabActive]} onPress={() => setTypeFilter('all')}>
                    <Text style={[s.typeTabTxt, typeFilter === 'all' && s.typeTabTxtActive]}>All</Text>
                  </TouchableOpacity>
                  {myPresentTypes.map((p) => (
                    <TouchableOpacity key={p} style={[s.typeTab, typeFilter === p && s.typeTabActive]} onPress={() => setTypeFilter(p)}>
                      <Text style={[s.typeTabTxt, typeFilter === p && s.typeTabTxtActive]}>{PERIODICITY_LABEL[p]}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {filteredMyStats.length === 0 ? (
                <Text style={s.emptyText}>No active routines this month</Text>
              ) : (
                filteredMyStats.map((r) => (
                  <View key={r.routine.id} style={s.card}>
                    <RoutineRow r={r} colors={colors} s={s} />
                  </View>
                ))
              )}
            </>
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
                // Matches MemberDetail's own visibleStats filter — otherwise this
                // count disagrees with what tapping through actually shows.
                const visibleCount = p.routine_stats.filter((r) => r.status !== 'not_applicable').length;
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
                      <Text style={s.memberEffLbl}>{visibleCount} routine{visibleCount !== 1 ? 's' : ''}</Text>
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

    // Needs Attention section
    allDone: {
      flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center',
      backgroundColor: c.successLight ?? c.gray50, borderRadius: 12, padding: 16, marginBottom: 4,
    },
    allDoneText: { fontSize: 13, fontWeight: '600', color: c.textPrimary },
    attentionSection: {
      backgroundColor: c.surface, borderRadius: 14, borderWidth: 1, borderColor: c.border,
      padding: 14, marginBottom: 4,
    },
    attentionHeader: { marginBottom: 4 },
    attentionTitle: { fontSize: 14, fontWeight: '800', color: c.textPrimary },
    attentionCount: { backgroundColor: c.danger, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 1 },
    attentionCountTxt: { fontSize: 11, fontWeight: '800', color: '#fff' },
    attentionSub: { fontSize: 11, color: c.textMuted, marginTop: 2 },
    attentionRoleLabel: { fontSize: 11, fontWeight: '700', color: c.textSecondary, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.3 },
    attentionItem: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      borderLeftWidth: 3, paddingLeft: 10, paddingVertical: 8,
    },
    attentionName: { fontSize: 13, fontWeight: '600', color: c.textPrimary },
    attentionMeta: { fontSize: 11, color: c.textMuted, marginTop: 2 },
    attentionTasks: { fontSize: 11, color: c.textMuted, flexShrink: 0 },

    // Breakdown section (type filter tabs + list)
    breakdownHead: { fontSize: 13, fontWeight: '700', color: c.textPrimary, marginTop: 4 },
    typeTabRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    typeTab: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, backgroundColor: c.gray50, borderWidth: 1, borderColor: c.border },
    typeTabActive: { backgroundColor: c.primary, borderColor: c.primary },
    typeTabTxt: { fontSize: 12, fontWeight: '600', color: c.textSecondary },
    typeTabTxtActive: { color: '#fff' },

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
