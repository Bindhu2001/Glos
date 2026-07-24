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

export default function RoutinesScreen() {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const { workspace } = useWorkspace();
  const { canSeeTeamContent } = useHasTeam();
  const api = useApi();
  const insets = useSafeAreaInsets();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [view, setView] = useState<RView>('my');
  const [stats, setStats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (v: RView) => {
    if (!workspace?.id) return;
    setLoading(true);
    try {
      if (v === 'my') {
        const res = await api.routines.getDashboard(workspace.id, 'week');
        setStats(res.data?.routine_stats ?? []);
      } else {
        const res = await api.routines.getTeamDashboard(workspace.id, 'week');
        setStats(res.data?.members ?? res.data?.routine_stats ?? []);
      }
      setError(null);
    } catch (err) {
      setStats([]);
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
      ) : (
        <ScrollView contentContainerStyle={s.list} showsVerticalScrollIndicator={false}>
          {stats.length === 0 ? (
            <View style={s.empty}>
              <Ionicons name="calendar-outline" size={40} color={colors.gray400} />
              <Text style={s.emptyText}>No routines found</Text>
            </View>
          ) : (
            stats.map((r: any, idx: number) => (
              <View key={r.id ?? r.user_id ?? idx} style={s.card}>
                <Text style={s.cardTitle}>{r.description ?? r.name ?? 'Routine'}</Text>
                <View style={s.metaRow}>
                  {r.role_name ? <Text style={s.metaText}>{r.role_name}</Text> : null}
                  {r.periodicity ? <Text style={s.metaText}>{r.periodicity}</Text> : null}
                  {r.completion_pct != null ? <Text style={s.metaText}>{r.completion_pct}% complete</Text> : null}
                </View>
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
    card: { backgroundColor: c.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: c.border },
    cardTitle: { fontSize: 14, fontWeight: '700', color: c.textPrimary, marginBottom: 6 },
    metaRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
    metaText: { fontSize: 11, color: c.textMuted },
  });
}
