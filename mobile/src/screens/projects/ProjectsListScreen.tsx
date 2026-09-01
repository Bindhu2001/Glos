import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, ActivityIndicator, RefreshControl, TextInput, Modal, FlatList } from 'react-native';
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

// Matches web's STATUS_FILTER_OPTIONS/SORT_OPTIONS exactly.
const STATUS_FILTER_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'near_end', label: 'Near End' },
  { value: 'inactive', label: 'Inactive' },
];
const SORT_OPTIONS = [
  { value: '', label: 'Default (Newest)' },
  { value: 'start_date_desc', label: 'Start Date (Latest)' },
  { value: 'start_date_asc', label: 'Start Date (Earliest)' },
  { value: 'end_date_desc', label: 'End Date (Latest)' },
  { value: 'end_date_asc', label: 'End Date (Earliest)' },
  { value: 'name_asc', label: 'Name A → Z' },
  { value: 'progress_desc', label: 'Progress (High → Low)' },
  { value: 'progress_asc', label: 'Progress (Low → High)' },
];

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
  const [dash, setDash] = useState<{ total: number; completed: number; overdue: number; near_end: number; on_time_projects?: number } | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [ownerFilter, setOwnerFilter] = useState<number | null>(null);
  const [ownerFilterOpen, setOwnerFilterOpen] = useState(false);
  const [sortBy, setSortBy] = useState('');
  const [sortOpen, setSortOpen] = useState(false);

  const hasLoadedRef = useRef(false);

  const load = useCallback(async (isRefresh = false, searchTerm?: string) => {
    if (!workspace?.id) return;
    if (!isRefresh && !hasLoadedRef.current) setLoading(true);
    try {
      const [res, meRes, dashRes] = await Promise.all([
        api.projects.list(workspace.id, searchTerm?.trim() ? { search: searchTerm.trim() } : undefined),
        api.me.getProfile(),
        api.projects.dashboard(workspace.id).catch(() => ({ data: null })),
      ]);
      setProjects(res.data?.items ?? res.data ?? []);
      setMeId(meRes.data?.id ?? meRes.data?.user?.id ?? null);
      setDash(dashRes.data ?? null);
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not load projects.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
      hasLoadedRef.current = true;
    }
  }, [workspace?.id]);

  useFocusEffect(useCallback(() => { load(false, search); }, [load]));

  // Server-side search (matches web) — debounced so typing doesn't fire a
  // request per keystroke. Skipped on first mount (useFocusEffect above
  // already covers the initial load).
  const searchMounted = useRef(false);
  useEffect(() => {
    if (!searchMounted.current) { searchMounted.current = true; return; }
    const t = setTimeout(() => load(true, search), 350);
    return () => clearTimeout(t);
  }, [search]);

  // Status/Owner filter and sort are all client-side over the fetched list,
  // matching web's `filtered` useMemo exactly.
  const ownerOptions = useMemo(() => {
    const seen = new Map<number, string>();
    for (const p of projects) {
      if (p.owner_user_id != null && !seen.has(p.owner_user_id)) {
        seen.set(p.owner_user_id, p.owner_name || 'Unknown');
      }
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [projects]);

  const filteredProjects = useMemo(() => {
    let list = [...projects];
    if (statusFilter.length > 0) {
      list = list.filter((p) => {
        if (statusFilter.includes('inactive') && (p.computed_status === 'inactive' || p.computed_status === 'deleted')) return true;
        return statusFilter.includes(p.computed_status);
      });
    }
    if (ownerFilter != null) {
      list = list.filter((p) => p.owner_user_id === ownerFilter);
    }
    if (sortBy === 'start_date_desc') list.sort((a, b) => ((b.start_date || '') > (a.start_date || '') ? 1 : -1));
    else if (sortBy === 'start_date_asc') list.sort((a, b) => ((a.start_date || '') > (b.start_date || '') ? 1 : -1));
    else if (sortBy === 'end_date_desc') list.sort((a, b) => ((b.end_date || '') > (a.end_date || '') ? 1 : -1));
    else if (sortBy === 'end_date_asc') list.sort((a, b) => ((a.end_date || '') > (b.end_date || '') ? 1 : -1));
    else if (sortBy === 'name_asc') list.sort((a, b) => a.name.localeCompare(b.name));
    else if (sortBy === 'progress_desc') list.sort((a, b) => (b.completion_pct || 0) - (a.completion_pct || 0));
    else if (sortBy === 'progress_asc') list.sort((a, b) => (a.completion_pct || 0) - (b.completion_pct || 0));
    return list;
  }, [projects, statusFilter, ownerFilter, sortBy]);

  const isOwnerOfProject = (p: any) => meId != null && p.owner_user_id === meId;

  const toggleComplete = async (p: any) => {
    if (!isAdmin && !isOwnerOfProject(p)) {
      showAlert('Not allowed', "You're not the project owner or admin.");
      return;
    }
    setToggling(p.id);
    try {
      await api.projects.update(workspace!.id, p.id, { is_completed: p.is_completed ? 0 : 1 });
      await load(true, search);
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

      <View style={s.searchBar}>
        <Ionicons name="search-outline" size={16} color={colors.gray400} />
        <TextInput
          style={s.searchInput}
          placeholder="Search Projects…"
          placeholderTextColor={colors.gray400}
          value={search}
          onChangeText={setSearch}
        />
        {!!search && (
          <TouchableOpacity onPress={() => setSearch('')} hitSlop={8}>
            <Ionicons name="close-circle" size={16} color={colors.gray400} />
          </TouchableOpacity>
        )}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterRowScroll} contentContainerStyle={s.filterRow}>
        {STATUS_FILTER_OPTIONS.map((o) => {
          const active = statusFilter.includes(o.value);
          return (
            <TouchableOpacity
              key={o.value}
              style={[s.filterChip, active && s.filterChipActive]}
              onPress={() => setStatusFilter((prev) => (prev.includes(o.value) ? prev.filter((x) => x !== o.value) : [...prev, o.value]))}
            >
              <Text style={[s.filterChipTxt, active && s.filterChipTxtActive]}>{o.label}</Text>
            </TouchableOpacity>
          );
        })}
        {ownerOptions.length > 0 && (
          <TouchableOpacity style={s.filterSelectBtn} onPress={() => setOwnerFilterOpen(true)}>
            <Text style={s.filterSelectTxt} numberOfLines={1}>
              {ownerFilter != null ? ownerOptions.find((o) => o.id === ownerFilter)?.name ?? 'Owner' : 'Owner'}
            </Text>
            <Ionicons name="chevron-down" size={12} color={colors.textSecondary} />
          </TouchableOpacity>
        )}
        <TouchableOpacity style={s.filterSelectBtn} onPress={() => setSortOpen(true)}>
          <Text style={s.filterSelectTxt} numberOfLines={1}>{SORT_OPTIONS.find((o) => o.value === sortBy)?.label ?? 'Sort'}</Text>
          <Ionicons name="chevron-down" size={12} color={colors.textSecondary} />
        </TouchableOpacity>
      </ScrollView>

      {loading ? (
        <ActivityIndicator style={{ flex: 1 }} color={colors.primary} />
      ) : error ? (
        <LoadError message={error} onRetry={() => load(false, search)} />
      ) : (
        <ScrollView
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true, search); }} />}
        >
          {dash != null && dash.total > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.dashStripScroll} contentContainerStyle={s.dashStrip}>
              <DashStat label="Total" value={dash.total} color="#6f7bff" icon="briefcase-outline" colors={colors} />
              <DashStat label="Completed" value={dash.completed} color="#4ade80" icon="checkmark-circle-outline" colors={colors} />
              <DashStat label="Active" value={Math.max(0, dash.total - dash.completed - dash.overdue - dash.near_end)} color="#22d3ee" icon="trending-up-outline" colors={colors} />
              <DashStat label="Overdue" value={dash.overdue} color="#ff6b6b" icon="alert-circle-outline" colors={colors} />
              <DashStat label="Near End" value={dash.near_end} color="#f0a93b" icon="time-outline" colors={colors} />
              <DashStat label="On-Time" value={dash.on_time_projects ?? 0} color="#a78bfa" icon="trophy-outline" colors={colors} />
            </ScrollView>
          )}

          {filteredProjects.length === 0 ? (
            <View style={s.empty}>
              <Ionicons name="folder-open-outline" size={40} color={colors.gray400} />
              <Text style={s.emptyText}>
                {projects.length === 0 ? 'No projects yet' : 'No projects match your search/filters'}
              </Text>
            </View>
          ) : (
            filteredProjects.map((p) => {
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
                    <Text style={s.cardTitle} numberOfLines={2}>{p.name}</Text>
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

      <Modal visible={ownerFilterOpen} transparent animationType="fade" onRequestClose={() => setOwnerFilterOpen(false)}>
        <TouchableOpacity style={s.modalBackdrop} activeOpacity={1} onPress={() => setOwnerFilterOpen(false)}>
          <View style={s.pickerModalCard}>
            <Text style={s.pickerModalTitle}>Filter by Owner</Text>
            <FlatList
              data={[{ id: -1, name: 'All Owners' }, ...ownerOptions]}
              keyExtractor={(o) => String(o.id)}
              style={{ maxHeight: 340 }}
              renderItem={({ item }) => {
                const isAll = item.id === -1;
                const active = isAll ? ownerFilter == null : ownerFilter === item.id;
                return (
                  <TouchableOpacity
                    style={[s.pickerOption, active && s.pickerOptionActive]}
                    onPress={() => { setOwnerFilter(isAll ? null : item.id); setOwnerFilterOpen(false); }}
                  >
                    <Text style={[s.pickerOptionTxt, active && s.pickerOptionTxtActive]}>{item.name}</Text>
                    {active && <Ionicons name="checkmark" size={16} color={colors.primary} />}
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={sortOpen} transparent animationType="fade" onRequestClose={() => setSortOpen(false)}>
        <TouchableOpacity style={s.modalBackdrop} activeOpacity={1} onPress={() => setSortOpen(false)}>
          <View style={s.pickerModalCard}>
            <Text style={s.pickerModalTitle}>Sort By</Text>
            <FlatList
              data={SORT_OPTIONS}
              keyExtractor={(o) => o.value}
              style={{ maxHeight: 340 }}
              renderItem={({ item }) => {
                const active = sortBy === item.value;
                return (
                  <TouchableOpacity
                    style={[s.pickerOption, active && s.pickerOptionActive]}
                    onPress={() => { setSortBy(item.value); setSortOpen(false); }}
                  >
                    <Text style={[s.pickerOptionTxt, active && s.pickerOptionTxtActive]}>{item.label}</Text>
                    {active && <Ionicons name="checkmark" size={16} color={colors.primary} />}
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

function DashStat({ label, value, color, icon, colors }: { label: string; value: number; color: string; icon: keyof typeof Ionicons.glyphMap; colors: AppColors }) {
  return (
    <View style={[dashStatCardStyle(colors), { borderTopColor: color }]}>
      <View style={{ width: 24, height: 24, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: color + '18' }}>
        <Ionicons name={icon} size={14} color={color} />
      </View>
      <Text style={{ fontSize: 16, fontWeight: '800', color }}>{value}</Text>
      <Text style={{ fontSize: 9.5, fontWeight: '600', color: colors.textMuted }}>{label}</Text>
    </View>
  );
}

function dashStatCardStyle(c: AppColors) {
  return {
    width: 88, borderRadius: 12, borderTopWidth: 3, backgroundColor: c.surface,
    borderWidth: 1, borderColor: c.border,
    paddingVertical: 10, paddingHorizontal: 10, alignItems: 'flex-start' as const, gap: 4,
  };
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
    dashStripScroll: { flexGrow: 0, marginHorizontal: -16, marginBottom: 4 },
    dashStrip: { flexDirection: 'row', gap: 8, paddingHorizontal: 16 },
    searchBar: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      marginHorizontal: 16, marginTop: 12,
      backgroundColor: c.gray50, borderWidth: 1, borderColor: c.border, borderRadius: 10,
      paddingHorizontal: 12, paddingVertical: 9,
    },
    searchInput: { flex: 1, fontSize: 14, color: c.textPrimary, padding: 0 },
    // Fixed height (not just flexGrow:0) — on Android, a horizontal ScrollView
    // sized purely from its content can momentarily collapse/re-measure when
    // a sibling (the vertical project list below) re-lays-out, e.g. as async
    // data arrives, which read as the filter row "squishing" mid-scroll.
    filterRowScroll: { flexGrow: 0, height: 54 },
    filterRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
    filterChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, backgroundColor: c.gray50, borderWidth: 1, borderColor: c.border },
    filterChipActive: { backgroundColor: c.primaryLight, borderColor: c.primary },
    filterChipTxt: { fontSize: 12, fontWeight: '600', color: c.textSecondary },
    filterChipTxtActive: { color: c.primary, fontWeight: '700' },
    filterSelectBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: 150,
      backgroundColor: c.gray50, borderWidth: 1, borderColor: c.border, borderRadius: 16,
      paddingHorizontal: 12, paddingVertical: 7,
    },
    filterSelectTxt: { fontSize: 12, fontWeight: '600', color: c.textSecondary, flexShrink: 1 },
    modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
    pickerModalCard: { backgroundColor: c.surface, borderRadius: 16, padding: 12, borderWidth: 1, borderColor: c.border },
    pickerModalTitle: { fontSize: 15, fontWeight: '700', color: c.textPrimary, padding: 10 },
    pickerOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 12, borderRadius: 10 },
    pickerOptionActive: { backgroundColor: c.primaryLight },
    pickerOptionTxt: { fontSize: 14, color: c.textPrimary },
    pickerOptionTxtActive: { fontWeight: '700', color: c.primary },
    empty: { alignItems: 'center', gap: 12, paddingTop: 60 },
    emptyText: { fontSize: 14, color: c.textMuted },
    // flex-start, not center — an unbounded-length project name used to
    // stretch the row to 6+ lines and vertically center the checkbox/icon/
    // status badge in the middle of that block instead of by the title.
    card: {
      flexDirection: 'row', alignItems: 'flex-start', gap: 12,
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
