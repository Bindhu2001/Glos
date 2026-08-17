import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppColors } from '../../../utils/colors';
import { useApi } from '../../../hooks/useApi';
import { formatDuration } from '../../../utils/format';

interface ActivityMember {
  user_id: number;
  name: string;
  role?: string | null;
  department?: string | null;
  created: number;
  completed: number;
  hours: number;
  minutes?: number;
  planned_hours?: number | null;
  planned_minutes?: number | null;
  on_time_pct: number | null;
}

type Period = 'today' | 'yesterday' | 'week' | 'last_week';

const PERIODS: { key: Period; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'week', label: 'This Week' },
  { key: 'last_week', label: 'Last Week' },
];

// Row avatar colors — cycles by user_id, matches web's stable per-user hash
// (qa-production's avatarColor()) closely enough without importing its logic.
const AVATAR_COLORS = ['#2563eb', '#10b981', '#f59e0b', '#8b5cf6', '#0891b2', '#ef4444', '#0d9488', '#d946ef'];
function avatarColor(userId: number) {
  return AVATAR_COLORS[userId % AVATAR_COLORS.length];
}

// Column widths kept in one place so the header row and data rows line up
// inside the horizontal ScrollView.
const COL = { sno: 26, name: 148, meta: 118, stat: 64, hours: 76 };
// Gap between columns — was 8, widened so the row doesn't read as one
// smashed-together block of numbers when scrolled into view.
const COL_GAP = 16;
// sno, name, meta, Assigned, Completed, Hours, Planned, On Time = 8 columns, 7 gaps.
const TABLE_WIDTH = COL.sno + COL.name + COL.meta + COL.stat * 4 + COL.hours + 7 * COL_GAP;

export default function TeamActivityTableWidget({
  appId, isAdmin, scope, viewAs, colors, minHoursPerDay = 0, minHoursPerWeek = 0,
}: {
  appId: number;
  isAdmin: boolean;
  scope: 'direct' | 'all' | 'admin';
  viewAs: number | null;
  colors: AppColors;
  minHoursPerDay?: number;
  minHoursPerWeek?: number;
}) {
  const api = useApi();
  const s = useMemo(() => makeStyles(colors), [colors]);
  // Matches web's TeamDashboard.jsx activityPeriod default ('today') — mobile
  // was defaulting to the whole month instead.
  const [period, setPeriod] = useState<Period>('today');
  const [search, setSearch] = useState('');
  const [members, setMembers] = useState<ActivityMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.dashboard.getManagerActivityByMember(appId, { period, scope, view_as: viewAs ?? undefined });
      setMembers(res.data?.members ?? []);
      setError(false);
    } catch {
      setMembers([]);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [appId, scope, viewAs, period]);

  useEffect(() => { load(); }, [load]);

  // Matches web's TeamDashboard.jsx `filtered` — summary totals and the table
  // both reflect the search box, not the full unfiltered member list.
  const filteredMembers = search.trim()
    ? members.filter((m) => m.name.toLowerCase().includes(search.trim().toLowerCase()))
    : members;

  const totalCreated = filteredMembers.reduce((a, m) => a + (m.created ?? 0), 0);
  const totalCompleted = filteredMembers.reduce((a, m) => a + (m.completed ?? 0), 0);
  const totalMinutes = filteredMembers.reduce((a, m) => a + Math.round(Number(m.hours ?? 0) * 60), 0);
  const otRates = filteredMembers.map((m) => m.on_time_pct).filter((x): x is number => x != null);
  const avgOnTime = otRates.length ? Math.round(otRates.reduce((a, b) => a + b, 0) / otRates.length) : null;

  // Matches web's per-row "below minimum hours" warning — min/day for
  // today|yesterday, min/week for week|last_week, none for month.
  const minH = period === 'today' || period === 'yesterday'
    ? minHoursPerDay
    : period === 'week' || period === 'last_week'
      ? minHoursPerWeek
      : 0;

  return (
    <View style={s.card}>
      <View style={s.headRow}>
        <Text style={s.headTitle}>TEAM ACTIVITY</Text>
        <View style={s.searchWrap}>
          <Ionicons name="search-outline" size={13} color={colors.textMuted} />
          <TextInput
            style={s.searchInput}
            placeholder="Search employee…"
            placeholderTextColor={colors.gray400}
            value={search}
            onChangeText={setSearch}
          />
        </View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={s.periodRow}>
        {PERIODS.map((p) => (
          <TouchableOpacity key={p.key} style={[s.periodBtn, period === p.key && s.periodBtnActive]} onPress={() => setPeriod(p.key)}>
            <Text style={[s.periodTxt, period === p.key && s.periodTxtActive]}>{p.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <View style={s.kpiRow}>
        <View style={s.kpiCell}>
          <Ionicons name="clipboard-outline" size={14} color={colors.primary} />
          <Text style={s.kpiVal}>{totalCreated}</Text>
          <Text style={s.kpiLbl}>Assigned</Text>
        </View>
        <View style={s.kpiCell}>
          <Ionicons name="checkmark-circle-outline" size={14} color={colors.success} />
          <Text style={s.kpiVal}>{totalCompleted}</Text>
          <Text style={s.kpiLbl}>Completed</Text>
        </View>
        <View style={s.kpiCell}>
          <Ionicons name="time-outline" size={14} color={colors.secondary} />
          <Text style={s.kpiVal}>{formatDuration(totalMinutes)}</Text>
          <Text style={s.kpiLbl}>Hours</Text>
        </View>
        <View style={s.kpiCell}>
          <Ionicons name="checkmark-done-circle-outline" size={14} color={colors.warning} />
          <Text style={s.kpiVal}>{avgOnTime != null ? `${avgOnTime}%` : '—'}</Text>
          <Text style={s.kpiLbl}>On Time</Text>
        </View>
      </View>
      {error ? (
        <TouchableOpacity onPress={load}>
          <Text style={s.emptyTxt}>Could not load team activity. Tap to retry.</Text>
        </TouchableOpacity>
      ) : loading ? (
        <Text style={s.emptyTxt}>Loading…</Text>
      ) : filteredMembers.length === 0 ? (
        <Text style={s.emptyTxt}>{members.length === 0 ? 'No activity for this period' : 'No employees match the search'}</Text>
      ) : (
        // Whole table (header + rows) scrolls horizontally together so every
        // column — including Role/Dept, Assigned and Planned, which used to
        // be dropped entirely — fits instead of being cut off on narrow phones.
        <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ minWidth: TABLE_WIDTH }}>
          <View style={{ minWidth: TABLE_WIDTH }}>
            <View style={s.tableHead}>
              <Text style={[s.th, { width: COL.sno }]}>#</Text>
              <Text style={[s.th, s.alignLeft, { width: COL.name }]}>Employee</Text>
              <Text style={[s.th, s.alignLeft, { width: COL.meta }]}>Role / Dept</Text>
              <Text style={[s.th, { width: COL.stat }]}>Assigned</Text>
              <Text style={[s.th, { width: COL.stat }]}>Completed</Text>
              <View style={{ width: COL.hours, alignItems: 'flex-end' }}>
                <Text style={s.th}>Hours</Text>
                {minH > 0 && <Text style={s.thSub}>min {minH}h</Text>}
              </View>
              <Text style={[s.th, { width: COL.stat }]}>Planned</Text>
              <Text style={[s.th, { width: COL.stat }]}>On Time</Text>
            </View>
            {/* Fixed maxHeight so this scrolls within its own box (~10 rows) once
                the team is large, instead of growing the whole page. */}
            <ScrollView style={s.tableScroll} nestedScrollEnabled showsVerticalScrollIndicator={false}>
              {filteredMembers.map((m, idx) => {
                const otColor = m.on_time_pct == null ? colors.textMuted : m.on_time_pct >= 80 ? colors.success : m.on_time_pct >= 50 ? colors.warning : colors.danger;
                const belowMin = minH > 0 && (m.hours || 0) < minH;
                const plannedMinutes = m.planned_minutes != null
                  ? m.planned_minutes
                  : m.planned_hours != null
                    ? Math.round(m.planned_hours * 60)
                    : null;
                return (
                  <View key={m.user_id} style={s.row}>
                    <Text style={[s.rowCell, { width: COL.sno }]}>{idx + 1}</Text>
                    <View style={[s.nameCell, { width: COL.name }]}>
                      <View style={[s.avatar, { backgroundColor: avatarColor(m.user_id) }]}>
                        <Text style={s.avatarTxt}>{(m.name || '?')[0].toUpperCase()}</Text>
                      </View>
                      <Text style={s.rowName} numberOfLines={1}>{m.name}</Text>
                    </View>
                    <View style={{ width: COL.meta }}>
                      {m.role ? <Text style={s.metaRole} numberOfLines={1}>{m.role}</Text> : null}
                      {m.department ? <Text style={s.metaDept} numberOfLines={1}>{m.department}</Text> : null}
                      {!m.role && !m.department ? <Text style={s.rowDash}>—</Text> : null}
                    </View>
                    <Text style={[s.rowCell, { width: COL.stat }]}>{m.created}</Text>
                    <Text style={[s.rowCell, { width: COL.stat }]}>{m.completed}</Text>
                    <Text style={[s.rowCell, { width: COL.hours }, belowMin && s.warnTxt]} numberOfLines={1}>
                      {belowMin ? '⚠ ' : ''}{formatDuration(Math.round(Number(m.hours ?? 0) * 60))}
                    </Text>
                    <Text style={[s.rowCell, { width: COL.stat }]}>
                      {plannedMinutes != null && plannedMinutes > 0 ? formatDuration(plannedMinutes) : '—'}
                    </Text>
                    <Text style={[s.rowCell, { width: COL.stat, color: otColor, fontWeight: '700' }]} numberOfLines={1}>
                      {m.on_time_pct != null ? `${m.on_time_pct}%` : '—'}
                    </Text>
                  </View>
                );
              })}
            </ScrollView>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

function makeStyles(c: AppColors) {
  return StyleSheet.create({
    card: { marginHorizontal: 16, marginTop: 12, backgroundColor: c.surface, borderRadius: 14, borderWidth: 1, borderColor: c.border, padding: 16 },
    headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12 },
    headTitle: { fontSize: 10, fontWeight: '700', color: c.textMuted, letterSpacing: 1 },
    searchWrap: {
      flex: 1, maxWidth: 160, flexDirection: 'row', alignItems: 'center', gap: 6,
      backgroundColor: c.gray50, borderWidth: 1, borderColor: c.border, borderRadius: 8,
      paddingHorizontal: 8, paddingVertical: 5,
    },
    searchInput: { flex: 1, fontSize: 11, color: c.textPrimary, padding: 0 },
    periodRow: { flexDirection: 'row', gap: 6, marginBottom: 12 },
    periodBtn: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, alignItems: 'center', backgroundColor: c.gray50, borderWidth: 1, borderColor: c.border },
    periodBtnActive: { backgroundColor: c.primary, borderColor: c.primary },
    periodTxt: { fontSize: 10.5, fontWeight: '700', color: c.textSecondary },
    periodTxtActive: { color: '#fff' },
    kpiRow: { flexDirection: 'row', marginBottom: 12 },
    kpiCell: { flex: 1, alignItems: 'center', gap: 3 },
    kpiVal: { fontSize: 15, fontWeight: '800', color: c.textPrimary },
    kpiLbl: { fontSize: 9, color: c.textMuted },
    emptyTxt: { fontSize: 12, color: c.textMuted, textAlign: 'center', paddingVertical: 12 },
    tableHead: { flexDirection: 'row', gap: COL_GAP, borderBottomWidth: 1, borderBottomColor: c.border, paddingBottom: 6, marginBottom: 4 },
    tableScroll: { maxHeight: 290 },
    th: { fontSize: 9.5, fontWeight: '700', color: c.textMuted, textAlign: 'right' },
    thSub: { fontSize: 8, fontWeight: '400', color: c.textMuted },
    alignLeft: { textAlign: 'left' },
    row: { flexDirection: 'row', alignItems: 'center', gap: COL_GAP, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.border },
    rowCell: { fontSize: 12, color: c.textSecondary, textAlign: 'right' },
    rowDash: { fontSize: 11, color: c.textMuted },
    nameCell: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    avatar: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    avatarTxt: { fontSize: 10, fontWeight: '800', color: '#fff' },
    rowName: { flex: 1, fontSize: 12, fontWeight: '600', color: c.textPrimary },
    metaRole: { fontSize: 10.5, fontWeight: '600', color: c.textPrimary },
    metaDept: { fontSize: 9.5, color: c.textMuted, marginTop: 1 },
    warnTxt: { color: '#d97706' },
  });
}
