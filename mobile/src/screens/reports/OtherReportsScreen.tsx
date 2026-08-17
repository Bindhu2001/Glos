import React, { useState, useMemo, useCallback } from 'react';
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

export default function OtherReportsScreen() {
  const navigation = useNavigation<any>();
  const { colors } = useTheme();
  const { workspace } = useWorkspace();
  const api = useApi();
  const insets = useSafeAreaInsets();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [month, setMonth] = useState(ymNow());
  const [areas, setAreas] = useState<any[]>([]);
  const [routines, setRoutines] = useState<any[]>([]);
  const [routineSummary, setRoutineSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const atMax = month === ymNow();
  const stepMonth = (dir: -1 | 1) => {
    if (dir === 1 && atMax) return;
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m - 1 + dir, 1);
    setMonth(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`);
  };

  const load = useCallback(async () => {
    if (!workspace?.id) return;
    setLoading(true);
    try {
      const [areasRes, routinesRes] = await Promise.all([
        api.otherReports.getAreaReport(workspace.id, { month }),
        api.otherReports.getRoutineReport(workspace.id, { month }),
      ]);
      setAreas(areasRes.data?.items ?? []);
      setRoutines(routinesRes.data?.items ?? []);
      setRoutineSummary(routinesRes.data?.summary ?? null);
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not load this report.'));
    } finally {
      setLoading(false);
    }
  }, [workspace?.id, month]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const totalAreaMinutes = areas.reduce((sum, a) => sum + (a.total_minutes ?? 0), 0);

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.title}>Areas & Routines</Text>
        <View style={{ width: 36 }} />
      </View>

      <View style={s.monthRow}>
        <TouchableOpacity onPress={() => stepMonth(-1)} style={s.monthBtn}>
          <Ionicons name="chevron-back" size={18} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.monthLabel}>{monthLabel(month)}</Text>
        <TouchableOpacity onPress={() => stepMonth(1)} disabled={atMax} style={s.monthBtn}>
          <Ionicons name="chevron-forward" size={18} color={atMax ? colors.gray300 : colors.textPrimary} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator style={{ flex: 1 }} color={colors.primary} />
      ) : error ? (
        <LoadError message={error} onRetry={load} />
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
            <Text style={s.emptyHint}>No areas found for your role this month</Text>
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
            <Text style={s.emptyHint}>No routines found for your role this month</Text>
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
  });
}
