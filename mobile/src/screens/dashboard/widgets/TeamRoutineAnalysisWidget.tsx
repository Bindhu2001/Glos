import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { AppColors } from '../../../utils/colors';

interface RoutineStat {
  routine: { description: string };
  status: 'not_applicable' | 'not_started' | 'pending' | 'incomplete' | 'completed';
}
interface Reportee {
  user: { id: number; first_name?: string; last_name?: string; email?: string };
  overall_efficiency: number | null;
  routine_stats: RoutineStat[];
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

export default function TeamRoutineAnalysisWidget({
  reportees, colors, onViewAllRoutines,
}: {
  reportees: Reportee[];
  colors: AppColors;
  onViewAllRoutines?: () => void;
}) {
  const s = useMemo(() => makeStyles(colors), [colors]);
  const members = reportees.filter((r) => !r.is_manager);
  if (members.length === 0) return null;

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

  return (
    <View style={s.card}>
      <View style={s.headRow}>
        <Text style={s.headTitle}>ROUTINE ANALYSIS</Text>
        {onViewAllRoutines && (
          <TouchableOpacity onPress={onViewAllRoutines} hitSlop={8}>
            <Text style={s.viewAllTxt}>View All Routines →</Text>
          </TouchableOpacity>
        )}
      </View>
      <View style={s.statsRow}>
        <View style={s.statCell}><Text style={s.statVal}>{reportees.length}</Text><Text style={s.statLbl}>Members</Text></View>
        <View style={s.statCell}><Text style={s.statVal}>{totalRoutines}</Text><Text style={s.statLbl}>Routines</Text></View>
        <View style={s.statCell}><Text style={s.statVal}>{avgEff}%</Text><Text style={s.statLbl}>Avg</Text></View>
        <View style={s.statCell}><Text style={[s.statVal, needsAttention > 0 && { color: colors.danger }]}>{needsAttention}</Text><Text style={s.statLbl}>Attention</Text></View>
      </View>

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
    </View>
  );
}

function makeStyles(c: AppColors) {
  return StyleSheet.create({
    card: { marginHorizontal: 16, marginTop: 12, backgroundColor: c.surface, borderRadius: 14, borderWidth: 1, borderColor: c.border, padding: 16 },
    headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12 },
    headTitle: { fontSize: 10, fontWeight: '700', color: c.textMuted, letterSpacing: 1 },
    viewAllTxt: { fontSize: 11, fontWeight: '700', color: c.primary },
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
  });
}
