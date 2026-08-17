import React, { useState, useMemo, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, ActivityIndicator, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../contexts/ThemeContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useHasTeam } from '../../contexts/HasTeamContext';
import { useApi } from '../../hooks/useApi';
import { AppColors } from '../../utils/colors';
import { MoreStackParamList } from '../../navigation/types';
import { apiErrorMessage } from '../../utils/apiError';
import { showAlert } from '../../components/common/AlertModal';
import LoadError from '../../components/common/LoadError';

type Nav = NativeStackNavigationProp<MoreStackParamList, 'ProjectsList'>;

// Matches qa-production/frontend/src/pages/workspace/Projects.jsx STATUS_META
const STATUS_COLORS: Record<string, string> = {
  active: '#38bdf8',
  completed: '#4ade80',
  overdue: '#f87171',
  near_end: '#fbbf24',
  inactive: '#94a3b8',
  deleted: '#f87171',
};

export default function ProjectsListScreen() {
  const navigation = useNavigation<Nav>();
  const { colors } = useTheme();
  const { workspace } = useWorkspace();
  const { isAdmin } = useHasTeam();
  const api = useApi();
  const insets = useSafeAreaInsets();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meId, setMeId] = useState<number | null>(null);
  const [toggling, setToggling] = useState<number | null>(null);

  const hasLoadedRef = useRef(false);

  const load = useCallback(async (isRefresh = false) => {
    if (!workspace?.id) return;
    if (!isRefresh && !hasLoadedRef.current) setLoading(true);
    try {
      const [res, meRes] = await Promise.all([
        api.projects.list(workspace.id),
        api.me.getProfile(),
      ]);
      setProjects(res.data?.items ?? res.data ?? []);
      setMeId(meRes.data?.id ?? meRes.data?.user?.id ?? null);
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not load projects.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
      hasLoadedRef.current = true;
    }
  }, [workspace?.id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const isOwnerOfProject = (p: any) => meId != null && p.owner_user_id === meId;

  const toggleComplete = async (p: any) => {
    if (!isAdmin && !isOwnerOfProject(p)) {
      showAlert('Not allowed', "You're not the project owner or admin.");
      return;
    }
    setToggling(p.id);
    try {
      await api.projects.update(workspace!.id, p.id, { is_completed: p.is_completed ? 0 : 1 });
      await load(true);
    } catch (err) {
      showAlert('Could not update project', apiErrorMessage(err));
    } finally {
      setToggling(null);
    }
  };

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.title}>Projects</Text>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.navigate('CreateEditProject', { appId: workspace!.id })}>
          <Ionicons name="add" size={24} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator style={{ flex: 1 }} color={colors.primary} />
      ) : error ? (
        <LoadError message={error} onRetry={() => load()} />
      ) : (
        <ScrollView
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} />}
        >
          {projects.length === 0 ? (
            <View style={s.empty}>
              <Ionicons name="folder-open-outline" size={40} color={colors.gray400} />
              <Text style={s.emptyText}>No projects yet</Text>
            </View>
          ) : (
            projects.map((p) => {
              const statusColor = STATUS_COLORS[p.computed_status] ?? '#6b7280';
              const isDone = p.computed_status === 'completed';
              const isTogglingThis = toggling === p.id;
              return (
                <TouchableOpacity
                  key={p.id}
                  style={s.card}
                  activeOpacity={0.7}
                  onPress={() => navigation.navigate('ProjectDetail', { projectId: p.id, appId: workspace!.id })}
                >
                  {/* Complete toggle — visible to everyone (matches WhatsApp-style
                      affordance on mobile) but only owner/admin can actually flip
                      it; anyone else gets a clear "not allowed" alert instead of a
                      dead tap or a confusing 403 from the API. */}
                  <TouchableOpacity
                    style={[s.completeCircle, isDone && s.completeCircleDone]}
                    onPress={() => toggleComplete(p)}
                    disabled={isTogglingThis}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    {isTogglingThis ? (
                      <ActivityIndicator size="small" color={isDone ? '#fff' : colors.primary} />
                    ) : isDone ? (
                      <Ionicons name="checkmark" size={14} color="#fff" />
                    ) : null}
                  </TouchableOpacity>
                  <View style={s.iconBox}>
                    <Ionicons name="folder-open-outline" size={20} color="#0891b2" />
                  </View>
                  <View style={s.cardBody}>
                    <Text style={s.cardTitle}>{p.name}</Text>
                    <View style={s.metaRow}>
                      {p.client_name ? <Text style={s.metaText}>{p.client_name}</Text> : null}
                      <Text style={s.metaText}>{p.total_tasks ?? 0} task{p.total_tasks === 1 ? '' : 's'} · {p.completion_pct ?? 0}% done</Text>
                    </View>
                  </View>
                  <View style={[s.statusBadge, { backgroundColor: statusColor + '18', borderColor: statusColor + '44' }]}>
                    <Text style={[s.statusText, { color: statusColor }]}>
                      {(p.computed_status ?? 'active').replace('_', ' ')}
                    </Text>
                  </View>
                </TouchableOpacity>
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
    title: { fontSize: 20, fontFamily: SERIF, color: c.textPrimary, fontWeight: '700' },
    list: { padding: 16, gap: 10 },
    empty: { alignItems: 'center', gap: 12, paddingTop: 60 },
    emptyText: { fontSize: 14, color: c.textMuted },
    card: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: c.surface, borderRadius: 14, padding: 14,
      borderWidth: 1, borderColor: c.border,
    },
    completeCircle: {
      width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: c.border,
      alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    },
    completeCircleDone: { backgroundColor: '#4ade80', borderColor: '#4ade80' },
    iconBox: { width: 40, height: 40, borderRadius: 10, backgroundColor: '#0891b214', alignItems: 'center', justifyContent: 'center' },
    cardBody: { flex: 1, gap: 4 },
    cardTitle: { fontSize: 14, fontWeight: '700', color: c.textPrimary },
    metaRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
    metaText: { fontSize: 11, color: c.textMuted },
    statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
    statusText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  });
}
