import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppColors } from '../../../utils/colors';
import { useApi } from '../../../hooks/useApi';

interface RoutineStat {
  routine: { description: string };
  status: 'not_applicable' | 'not_started' | 'pending' | 'incomplete' | 'completed';
}
interface AreaStat {
  area_id: number;
  area_name: string;
  done: number;
  total: number;
  pct: number | null;
}
interface Reportee {
  user: { id: number; first_name?: string; last_name?: string; email?: string; photo_url?: string };
  overall_efficiency: number | null;
  routine_stats: RoutineStat[];
  area_stats?: AreaStat[];
  is_manager?: boolean;
}

function name(u: { first_name?: string; last_name?: string; email?: string }) {
  return [u.first_name, u.last_name].filter(Boolean).join(' ') || u.email || 'Member';
}

function barColor(pct: number) {
  if (pct >= 80) return '#059669';
  if (pct >= 50) return '#d97706';
  return '#dc2626';
}

// Matches web's TeamDashboard.jsx last12MonthOptions() — duplicated locally
// (also in BusinessReviewsTableWidget/AppreciationsFeedbackWidget) so each
// widget keeps its own independently-browsable month, matching web where
// TeamRoutineAnalysis has its own picker separate from the others.
function buildMonthOptions() {
  const opts: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    opts.push({ value, label });
  }
  return opts;
}

export default function TeamRoutineAnalysisWidget({
  appId, mgrScope, viewAs, colors, onViewAllRoutines,
}: {
  appId: number;
  mgrScope: 'direct' | 'all' | 'admin';
  viewAs: number | null;
  colors: AppColors;
  onViewAllRoutines?: () => void;
}) {
  const api = useApi();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const monthOptions = useMemo(buildMonthOptions, []);
  const [month, setMonth] = useState(monthOptions[0].value);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [reportees, setReportees] = useState<Reportee[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  // 'routines' | 'areas' — mirrors web TeamDashboard's rtView toggle.
  const [tab, setTab] = useState<'routines' | 'areas'>('routines');

  const load = useCallback(async () => {
    setLoading(true);
    const scopeViewAs = mgrScope === 'all' && viewAs != null ? viewAs : undefined;
    try {
      const res = await api.routines.getTeamDashboard(appId, { mode: 'month', month, scope: mgrScope, view_as: scopeViewAs });
      setReportees(res.data?.reportees ?? []);
      setError(false);
    } catch {
      setReportees([]);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [api, appId, mgrScope, viewAs, month]);

  useEffect(() => { load(); }, [load]);

  const monthLabel = month === monthOptions[0].value
    ? 'This Month'
    : monthOptions.find((o) => o.value === month)?.label ?? month;

  if (!loading && !error && reportees.length === 0) return null;

  const totalRoutines = reportees.reduce((sum, r) => sum + r.routine_stats.length, 0);
  const withEff = reportees.filter((r) => r.overall_efficiency != null);
  const avgEff = withEff.length ? Math.round(withEff.reduce((s2, r) => s2 + (r.overall_efficiency ?? 0), 0) / withEff.length) : 0;
  const needsAttention = reportees.filter((r) => (r.overall_efficiency ?? 100) < 50).length;

  const sorted = [...withEff].sort((a, b) => (b.overall_efficiency ?? 0) - (a.overall_efficiency ?? 0));
  const top = sorted[0];
  const bottom = sorted[sorted.length - 1];

  const missedCount = new Map<string, number>();
  for (const r of reportees) {
    for (const rs of r.routine_stats) {
      if (['incomplete', 'not_started', 'pending'].includes(rs.status)) {
        missedCount.set(rs.routine.description, (missedCount.get(rs.routine.description) ?? 0) + 1);
      }
    }
  }
  const mostMissed = Array.from(missedCount.entries()).sort((a, b) => b[1] - a[1]).slice(0, 4);

  // ── Routines | Areas ──────────────────────────────────────────────────
  // De-dupe areas by name across the scope, summing done/total; `people` =
  // how many members have work in that area. Same as web TeamDashboard.
  const teamAreas = (() => {
    const m = new Map<string, { area_id: number; area_name: string; done: number; total: number; people: number }>();
    for (const r of reportees) {
      for (const a of r.area_stats ?? []) {
        const k = a.area_name.trim().toLowerCase();
        if (!m.has(k)) m.set(k, { area_id: a.area_id, area_name: a.area_name, done: 0, total: 0, people: 0 });
        const e = m.get(k)!;
        e.done += a.done;
        e.total += a.total;
        if (a.total > 0) e.people += 1;
      }
    }
    return [...m.values()]
      .map((e) => ({ ...e, pct: e.total > 0 ? Math.min(100, Math.round((e.done / e.total) * 100)) : null }))
      .sort((a, b) => a.area_name.localeCompare(b.area_name));
  })();
  const showAreas = tab === 'areas' && teamAreas.length > 0;
  const areaWithPct = teamAreas.filter((a) => a.pct != null);
  const stripAvg = showAreas
    ? (areaWithPct.length ? Math.round(areaWithPct.reduce((s2, a) => s2 + (a.pct ?? 0), 0) / areaWithPct.length) : 0)
    : avgEff;
  const stripNeeds = showAreas ? areaWithPct.filter((a) => (a.pct ?? 0) < 50).length : needsAttention;
  const stripTotal = showAreas ? teamAreas.length : totalRoutines;

  return (
    <View style={s.card}>
      <View style={s.headRow}>
        <Text style={s.headTitle}>{showAreas ? 'TEAM AREAS' : 'ROUTINE ANALYSIS'}</Text>
        <View style={s.headActions}>
          <TouchableOpacity style={s.monthBtn} onPress={() => setPickerOpen(true)}>
            <Text style={s.monthBtnTxt} numberOfLines={1}>{monthLabel}</Text>
            <Ionicons name="chevron-down" size={13} color={colors.primary} />
          </TouchableOpacity>
          {!showAreas && onViewAllRoutines && (
            <TouchableOpacity onPress={onViewAllRoutines} hitSlop={8}>
              <Text style={s.viewAllTxt}>View All →</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {!loading && !error && teamAreas.length > 0 && (
        <View style={s.raTabs}>
          <TouchableOpacity
            style={[s.raTab, tab === 'routines' && s.raTabActive]}
            onPress={() => setTab('routines')}
          >
            <Text style={[s.raTabTxt, tab === 'routines' && s.raTabTxtActive]}>Routines</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.raTab, tab === 'areas' && s.raTabActive]}
            onPress={() => setTab('areas')}
          >
            <Text style={[s.raTabTxt, tab === 'areas' && s.raTabTxtActive]}>Areas</Text>
          </TouchableOpacity>
        </View>
      )}

      {error ? (
        <TouchableOpacity onPress={load}>
          <Text style={s.emptyTxt}>Could not load routine analysis. Tap to retry.</Text>
        </TouchableOpacity>
      ) : loading ? (
        <Text style={s.emptyTxt}>Loading…</Text>
      ) : (
        <>
          <View style={s.statsRow}>
            <View style={s.statCell}><Text style={s.statVal}>{reportees.length}</Text><Text style={s.statLbl}>Members</Text></View>
            <View style={s.statCell}><Text style={s.statVal}>{stripTotal}</Text><Text style={s.statLbl}>{showAreas ? 'Areas' : 'Routines'}</Text></View>
            <View style={s.statCell}><Text style={[s.statVal, { color: stripAvg >= 80 ? '#059669' : stripAvg >= 50 ? '#d97706' : '#dc2626' }]}>{stripAvg}%</Text><Text style={s.statLbl}>Avg</Text></View>
            <View style={s.statCell}><Text style={[s.statVal, stripNeeds > 0 && { color: colors.danger }]}>{stripNeeds}</Text><Text style={s.statLbl}>{showAreas ? '< 50%' : 'Attention'}</Text></View>
          </View>

          {showAreas ? (
            /* Areas view — one block per member: their areas + completed/assigned */
            <ScrollView style={s.memberScroll} nestedScrollEnabled showsVerticalScrollIndicator={false}>
              {reportees.map((r) => {
                const areas = r.area_stats ?? [];
                return (
                  <View key={r.user.id} style={s.areaMemberBlock}>
                    <Text style={s.areaMemberName} numberOfLines={1}>{name(r.user)}{r.is_manager ? ' (You)' : ''}</Text>
                    {areas.length === 0 ? (
                      <Text style={s.areaLineMuted}>—</Text>
                    ) : (
                      areas.map((a) => (
                        <View key={a.area_id} style={s.areaLine}>
                          <Text style={s.areaLineName} numberOfLines={1}>{a.area_name}</Text>
                          <Text
                            style={[
                              s.areaLineMeta,
                              { color: a.total > 0 ? barColor(a.pct ?? 0) : colors.textMuted },
                            ]}
                          >
                            {a.total > 0 ? `${a.done} / ${a.total}` : '—'}
                          </Text>
                        </View>
                      ))
                    )}
                  </View>
                );
              })}
            </ScrollView>
          ) : (
          <>
          {/* Fixed maxHeight so this scrolls within its own box (~10 rows) once
              the team is large, instead of growing the whole page. */}
          <ScrollView style={s.memberScroll} nestedScrollEnabled showsVerticalScrollIndicator={false}>
            {reportees.map((r) => {
              const pct = r.overall_efficiency ?? 0;
              return (
                <View key={r.user.id} style={s.memberRow}>
                  <Text style={s.memberName} numberOfLines={1}>{name(r.user)}{r.is_manager ? ' (You)' : ''}</Text>
                  <View style={s.memberBarBg}>
                    <View style={[s.memberBarFill, { width: `${Math.min(pct, 100)}%` as any, backgroundColor: barColor(pct) }]} />
                  </View>
                  <Text style={s.memberPct} numberOfLines={1}>{r.overall_efficiency != null ? `${pct}%` : '—'}</Text>
                </View>
              );
            })}
          </ScrollView>

          {(top || bottom) && (
            <View style={s.highlightRow}>
              {top && (
                <View style={[s.highlightCard, { backgroundColor: colors.successLight }]}>
                  <Text style={s.highlightLbl}>Top Performer</Text>
                  <Text style={[s.highlightName, { color: colors.success }]}>{name(top.user)}</Text>
                  <Text style={s.highlightPct}>{top.overall_efficiency}%</Text>
                </View>
              )}
              {bottom && bottom !== top && (
                <View style={[s.highlightCard, { backgroundColor: colors.dangerLight }]}>
                  <Text style={s.highlightLbl}>Needs Support</Text>
                  <Text style={[s.highlightName, { color: colors.danger }]}>{name(bottom.user)}</Text>
                  <Text style={s.highlightPct}>{bottom.overall_efficiency}%</Text>
                </View>
              )}
            </View>
          )}

          {mostMissed.length > 0 && (
            <View style={s.missedSec}>
              <Text style={s.missedTitle}>Most Missed Routines</Text>
              {mostMissed.map(([desc, count]) => (
                <View key={desc} style={s.missedRow}>
                  <Text style={s.missedDesc} numberOfLines={1}>{desc}</Text>
                  <TouchableOpacity onPress={onViewAllRoutines} disabled={!onViewAllRoutines} hitSlop={6}>
                    <Text style={s.missedCount}>{count} member{count !== 1 ? 's' : ''}</Text>
                  </TouchableOpacity>
                </View>
              ))}
              {onViewAllRoutines && (
                <TouchableOpacity onPress={onViewAllRoutines} hitSlop={8}>
                  <Text style={s.viewAllMissedTxt}>View All Missed Routines →</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
          </>
          )}
        </>
      )}

      <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
        <TouchableOpacity style={s.modalBackdrop} activeOpacity={1} onPress={() => setPickerOpen(false)}>
          <View style={s.monthModalCard}>
            <Text style={s.monthModalTitle}>Select Month</Text>
            <FlatList
              data={monthOptions}
              keyExtractor={(o) => o.value}
              style={{ maxHeight: 340 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[s.monthOption, item.value === month && s.monthOptionActive]}
                  onPress={() => { setMonth(item.value); setPickerOpen(false); }}
                >
                  <Text style={[s.monthOptionTxt, item.value === month && s.monthOptionTxtActive]}>{item.label}</Text>
                  {item.value === month && <Ionicons name="checkmark" size={16} color={colors.primary} />}
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

function makeStyles(c: AppColors) {
  return StyleSheet.create({
    card: { marginHorizontal: 16, marginTop: 12, backgroundColor: c.surface, borderRadius: 14, borderWidth: 1, borderColor: c.border, padding: 16 },
    headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12 },
    headTitle: { fontSize: 10, fontWeight: '700', color: c.textMuted, letterSpacing: 1 },
    headActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    monthBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      backgroundColor: c.gray50, borderWidth: 1, borderColor: c.border, borderRadius: 8,
      paddingHorizontal: 10, paddingVertical: 6,
    },
    monthBtnTxt: { fontSize: 11, fontWeight: '700', color: c.textPrimary },
    emptyTxt: { fontSize: 12, color: c.textMuted, textAlign: 'center', paddingVertical: 12 },
    viewAllTxt: { fontSize: 11, fontWeight: '700', color: c.primary },
    raTabs: { flexDirection: 'row', alignSelf: 'flex-start', backgroundColor: c.gray100, borderRadius: 8, padding: 2, marginBottom: 12 },
    raTab: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 6 },
    raTabActive: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.border },
    raTabTxt: { fontSize: 11, fontWeight: '700', color: c.textMuted },
    raTabTxtActive: { color: c.textPrimary },
    areaMemberBlock: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.border },
    areaMemberName: { fontSize: 12, fontWeight: '800', color: c.textPrimary, marginBottom: 4 },
    areaLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingVertical: 2 },
    areaLineName: { flex: 1, fontSize: 11, color: c.textSecondary },
    areaLineMeta: { fontSize: 11, fontWeight: '700' },
    areaLineMuted: { fontSize: 11, color: c.textMuted },
    statsRow: { flexDirection: 'row', marginBottom: 14 },
    statCell: { flex: 1, alignItems: 'center' },
    statVal: { fontSize: 16, fontWeight: '800', color: c.textPrimary },
    statLbl: { fontSize: 9, color: c.textMuted, marginTop: 2 },
    memberScroll: { maxHeight: 260 },
    memberRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    // flexShrink:1 matters here — RN defaults flexShrink to 0 (unlike web
    // CSS), so a plain fixed width never yields space back on narrower
    // screens, and can force the bar toward zero width instead of shrinking
    // the label to fit.
    memberName: { width: 130, flexShrink: 1, fontSize: 11, fontWeight: '600', color: c.textPrimary },
    memberBarBg: { flex: 1, minWidth: 24, height: 7, backgroundColor: c.gray100, borderRadius: 4, overflow: 'hidden' },
    memberBarFill: { height: 7, borderRadius: 4 },
    memberPct: { width: 40, flexShrink: 1, fontSize: 11, fontWeight: '700', color: c.textSecondary, textAlign: 'right' },
    highlightRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
    highlightCard: { flex: 1, borderRadius: 10, padding: 10 },
    highlightLbl: { fontSize: 9, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase' },
    highlightName: { fontSize: 12, fontWeight: '800', marginTop: 2 },
    highlightPct: { fontSize: 11, color: c.textSecondary, marginTop: 2 },
    missedSec: { marginTop: 12, borderTopWidth: 1, borderTopColor: c.border, paddingTop: 10 },
    missedTitle: { fontSize: 11, fontWeight: '700', color: c.textSecondary, marginBottom: 6 },
    missedRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
    missedDesc: { flex: 1, fontSize: 11, color: c.textPrimary },
    missedCount: { fontSize: 11, fontWeight: '600', color: c.primary },
    viewAllMissedTxt: { fontSize: 11, fontWeight: '700', color: c.primary, marginTop: 10, textAlign: 'center' },
    modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
    monthModalCard: { backgroundColor: c.surface, borderRadius: 16, padding: 12, borderWidth: 1, borderColor: c.border },
    monthModalTitle: { fontSize: 15, fontWeight: '700', color: c.textPrimary, padding: 10 },
    monthOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 12, borderRadius: 10 },
    monthOptionActive: { backgroundColor: c.primaryLight },
    monthOptionTxt: { fontSize: 14, color: c.textPrimary },
    monthOptionTxtActive: { fontWeight: '700', color: c.primary },
  });
}
