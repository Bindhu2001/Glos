import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../contexts/ThemeContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useHasTeam } from '../../contexts/HasTeamContext';
import { useApi } from '../../hooks/useApi';
import { AppColors } from '../../utils/colors';
import { apiErrorMessage } from '../../utils/apiError';
import LoadError from '../../components/common/LoadError';

type RView = 'my' | 'team';

// Backend shape (routes/hr/routines.js buildUserRoutineStats):
// { routine: { id, description, periodicity, position }, role_name, area_name,
//   routine_pct, area_pct, combined_pct, status, tasks_completed, tasks_total, last_completed_on }
interface RoutineStat {
  routine: { id: number; description: string; periodicity: string; position?: number };
  role_name?: string;
  combined_pct: number | null;
  status: 'not_started' | 'incomplete' | 'pending' | 'completed';
  tasks_completed: number;
  tasks_total: number;
}

// team-dashboard shape: { reportees: [{ user, primary_role_name, routine_stats, overall_efficiency, is_manager }] }
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
};

function personName(u: { first_name?: string; last_name?: string; email?: string }) {
  return [u.first_name, u.last_name].filter(Boolean).join(' ') || u.email || 'Member';
}

function RoutineRow({ r, colors, s }: { r: RoutineStat; colors: AppColors; s: any }) {
  const statusColor = STATUS_COLORS[r.status] ?? '#6b7280';
  return (
    <View style={s.routineRow}>
      <View style={{ flex: 1 }}>
        <Text style={s.routineTitle}>{r.routine.description}</Text>
        <View style={s.metaRow}>
          {r.role_name ? <Text style={s.metaText}>{r.role_name}</Text> : null}
          <Text style={s.metaText}>{r.routine.periodicity}</Text>
          <Text style={s.metaText}>{r.tasks_completed}/{r.tasks_total} tasks</Text>
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

export default function RoutinesScreen() {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const { workspace } = useWorkspace();
  const { canSeeTeamContent } = useHasTeam();
  const api = useApi();
  const insets = useSafeAreaInsets();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [view, setView] = useState<RView>('my');
  const [myStats, setMyStats] = useState<RoutineStat[]>([]);
  const [reportees, setReportees] = useState<Reportee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (v: RView) => {
    if (!workspace?.id) return;
    setLoading(true);
    try {
      if (v === 'my') {
        const res = await api.routines.getDashboard(workspace.id, { period: 'week' });
        setMyStats(res.data?.routine_stats ?? []);
      } else {
        const res = await api.routines.getTeamDashboard(workspace.id, { period: 'week' });
        setReportees(res.data?.reportees ?? []);
      }
      setError(null);
    } catch (err) {
      setMyStats([]);
      setReportees([]);
      setError(apiErrorMessage(err, 'Could not load routines.'));
    } finally {
      setLoading(false);
    }
  }, [workspace?.id]);

  useEffect(() => { load(view); }, [view, load]);

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.title}>Routines</Text>
        <View style={{ width: 36 }} />
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
        <LoadError message={error} onRetry={() => load(view)} />
      ) : view === 'my' ? (
        <ScrollView contentContainerStyle={s.list} showsVerticalScrollIndicator={false}>
          {myStats.length === 0 ? (
            <View style={s.empty}>
              <Ionicons name="calendar-outline" size={40} color={colors.gray400} />
              <Text style={s.emptyText}>No routines found for this week</Text>
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
          {reportees.length === 0 ? (
            <View style={s.empty}>
              <Ionicons name="people-outline" size={40} color={colors.gray400} />
              <Text style={s.emptyText}>No team members found</Text>
            </View>
          ) : (
            reportees.map((p) => (
              <View key={p.user.id} style={s.card}>
                <View style={s.personHead}>
                  <Text style={s.personName}>{personName(p.user)}{p.is_manager ? ' (You)' : ''}</Text>
                  {p.primary_role_name ? <Text style={s.metaText}>{p.primary_role_name}</Text> : null}
                  <Text style={s.efficiencyTxt}>
                    {p.overall_efficiency != null ? `${p.overall_efficiency}% efficiency` : '—'}
                  </Text>
                </View>
                {p.routine_stats.length === 0 ? (
                  <Text style={s.emptyInline}>No routines this week</Text>
                ) : (
                  p.routine_stats.map((r) => (
                    <View key={r.routine.id} style={s.nestedRoutineRow}>
                      <RoutineRow r={r} colors={colors} s={s} />
                    </View>
                  ))
                )}
              </View>
            ))
          )}
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
    title: { fontSize: 20, fontFamily: SERIF, color: c.textPrimary, fontWeight: '700' },
    toggleRow: {
      flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 10,
      backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border,
    },
    toggleBtn: { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center', backgroundColor: c.gray50, borderWidth: 1, borderColor: c.border },
    toggleBtnActive: { backgroundColor: c.primary, borderColor: c.primary },
    toggleTxt: { fontSize: 13, fontWeight: '700', color: c.textSecondary },
    toggleTxtActive: { color: '#fff' },
    list: { padding: 16, gap: 10 },
    empty: { alignItems: 'center', gap: 12, paddingTop: 60 },
    emptyText: { fontSize: 14, color: c.textMuted },
    emptyInline: { fontSize: 12, color: c.textMuted, marginTop: 6 },
    card: { backgroundColor: c.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: c.border },
    personHead: { marginBottom: 8, gap: 2 },
    personName: { fontSize: 14, fontWeight: '800', color: c.textPrimary },
    efficiencyTxt: { fontSize: 11, fontWeight: '700', color: c.primary, marginTop: 2 },
    nestedRoutineRow: { borderTopWidth: 1, borderTopColor: c.border, paddingTop: 8, marginTop: 8 },
    routineRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    routineTitle: { fontSize: 13, fontWeight: '700', color: c.textPrimary, marginBottom: 4 },
    metaRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
    metaText: { fontSize: 11, color: c.textMuted },
    statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
    statusText: { fontSize: 11, fontWeight: '700' },
  });
}
