import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  TextInput, RefreshControl, ScrollView, Platform, Modal,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useApi } from '../../hooks/useApi';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useTheme } from '../../contexts/ThemeContext';
import { AppColors } from '../../utils/colors';
import TaskCard from '../../components/tasks/TaskCard';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import { TasksStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<TasksStackParamList, 'TasksList'>;

const SORT_OPTIONS = [
  { value: '', label: 'Default' },
  { value: 'deadline', label: 'Deadline' },
  { value: 'priority', label: 'Priority' },
  { value: 'status', label: 'Status' },
  { value: 'assignee', label: 'Assignee' },
];

const STATUS_MAP: Record<string, string> = {
  'Open': 'open',
  'In Progress': 'in_progress',
  'Blocked': 'blocked',
  'Done': 'done',
  'Cancelled': 'cancelled',
};

export default function TasksScreen() {
  const api = useApi();
  const { workspace } = useWorkspace();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();

  const isAdmin = workspace?.role === 'super_admin' || workspace?.role === 'admin';
  const STATUS_FILTERS = isAdmin
    ? ['All', 'My Tasks', 'My Team', 'Open', 'In Progress', 'Blocked', 'Done', 'Cancelled']
    : ['All', 'My Tasks', 'Open', 'In Progress', 'Blocked', 'Done', 'Cancelled'];

  const [tasks, setTasks] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [areas, setAreas] = useState<{ id: number; name: string; roleTitle: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('All');
  const [assigneeFilter, setAssigneeFilter] = useState<number | ''>('');
  const [areaFilter, setAreaFilter] = useState('');
  const [sortBy, setSortBy] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // refs so load() reads current values without being recreated on every filter change
  const activeFilterRef = useRef('All');
  const assigneeFilterRef = useRef<number | ''>('');
  const areaFilterRef = useRef('');
  const sortByRef = useRef('');

  const load = useCallback(async () => {
    if (!workspace) return;
    try {
      const filter = activeFilterRef.current;
      const params: Record<string, unknown> = {};
      if (filter === 'My Tasks') params.mine = 1;
      if (assigneeFilterRef.current !== '') params.assigned_to_user_id = assigneeFilterRef.current;
      if (areaFilterRef.current === 'others') params.area_id = 'others';
      else if (areaFilterRef.current) params.area_id = areaFilterRef.current;
      if (sortByRef.current) params.sort = sortByRef.current;
      const r = await api.tasks.list(workspace.id, params);
      setTasks(r.data?.items ?? r.data?.tasks ?? []);
    } catch {}
  }, [workspace, api]);

  const loadContext = useCallback(async () => {
    if (!workspace) return;
    try {
      const [mRes, rRes] = await Promise.all([
        api.members.list(workspace.id),
        api.roles.list(workspace.id),
      ]);
      const memberRows: any[] = mRes.data?.items ?? [];
      setMembers(memberRows);

      const roleRows: any[] = rRes.data?.items ?? [];
      const flat: { id: number; name: string; roleTitle: string }[] = [];
      await Promise.all(
        roleRows.map(async (role: any) => {
          try {
            const aRes = await api.roles.listAreas(workspace.id, role.id);
            const areaItems: any[] = aRes.data?.items ?? [];
            for (const a of areaItems) {
              flat.push({ id: a.id, name: a.name, roleTitle: role.title });
            }
          } catch {}
        })
      );
      setAreas(flat);
    } catch {}
  }, [workspace, api]);

  useEffect(() => {
    Promise.all([load(), loadContext()]).finally(() => setLoading(false));
  }, [load, loadContext]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const handleFilterPress = async (filter: string) => {
    setActiveFilter(filter);
    activeFilterRef.current = filter;
    await load();
  };

  const applyFilter = async (opts: { assignee?: number | ''; area?: string; sort?: string }) => {
    if (opts.assignee !== undefined) { setAssigneeFilter(opts.assignee); assigneeFilterRef.current = opts.assignee; }
    if (opts.area !== undefined) { setAreaFilter(opts.area); areaFilterRef.current = opts.area; }
    if (opts.sort !== undefined) { setSortBy(opts.sort); sortByRef.current = opts.sort; }
    await load();
  };

  const resetFilters = async () => {
    setAssigneeFilter(''); assigneeFilterRef.current = '';
    setAreaFilter(''); areaFilterRef.current = '';
    setSortBy(''); sortByRef.current = '';
    await load();
  };

  const filtered = tasks.filter((t) => {
    const matchSearch = !search || t.title.toLowerCase().includes(search.toLowerCase());
    const statusKey = STATUS_MAP[activeFilter];
    const matchStatus = statusKey ? t.status === statusKey : true;
    return matchSearch && matchStatus;
  });

  const hasActiveFilters = !!(assigneeFilter || areaFilter || sortBy);

  if (loading) return <LoadingSpinner />;

  const now = new Date();
  const inProgressCount = tasks.filter(t => t.status === 'in_progress').length;
  const doneCount = tasks.filter(t => t.status === 'done').length;
  const overdueCount = tasks.filter(t =>
    t.deadline && new Date(t.deadline) < now && t.status !== 'done' && t.status !== 'cancelled'
  ).length;
  const blockedCount = tasks.filter(t => t.status === 'blocked').length;

  const stats = [
    { label: 'TOTAL', count: tasks.length, color: colors.textPrimary },
    { label: 'IN PROGRESS', count: inProgressCount, color: colors.primary },
    { label: 'COMPLETED', count: doneCount, color: colors.success },
    { label: 'OVERDUE', count: overdueCount, color: colors.danger },
    { label: 'BLOCKED', count: blockedCount, color: colors.warning },
  ];

  const assigneeName = (m: any) =>
    `${m.first_name ?? ''} ${m.last_name ?? ''}`.trim() || m.email;

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
        {/* Page header */}
        <View style={s.pageHeader}>
          <Text style={s.breadcrumb}>{workspace?.name?.toUpperCase() ?? 'WORKSPACE'} · TASKS</Text>
          <View style={s.titleRow}>
            <Text style={s.pageTitle}>Tasks</Text>
            {overdueCount > 0 && (
              <View style={s.overdueBadge}>
                <Text style={s.overdueText}>{overdueCount} overdue</Text>
              </View>
            )}
            <TouchableOpacity
              style={s.addBtn}
              onPress={() => navigation.navigate('CreateTask', { appId: workspace!.id })}
            >
              <Ionicons name="add" size={20} color={colors.primary} />
            </TouchableOpacity>
          </View>
          <Text style={s.subtitle}>Your work, organized. Stay on track.</Text>
        </View>

        {/* Stats bar */}
        <View style={s.statsRow}>
          {stats.map((stat, i) => (
            <View key={stat.label} style={[s.statItem, i > 0 && s.statItemBorder]}>
              <Text style={[s.statCount, { color: stat.color }]}>{stat.count}</Text>
              <Text style={s.statLabel}>{stat.label}</Text>
            </View>
          ))}
        </View>

        {/* Search + filter chips — unified surface panel */}
        <View style={s.searchSection}>
          <View style={s.searchRow}>
            <View style={s.searchBar}>
              <Ionicons name="search-outline" size={16} color={colors.gray400} />
              <TextInput
                style={s.searchInput}
                placeholder="Search tasks..."
                placeholderTextColor={colors.gray400}
                value={search}
                onChangeText={setSearch}
              />
              {search.length > 0 && (
                <TouchableOpacity onPress={() => setSearch('')}>
                  <Ionicons name="close-circle" size={16} color={colors.gray400} />
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity
              style={[s.filterBtn, hasActiveFilters && s.filterBtnActive]}
              onPress={() => setShowFilters(true)}
            >
              <Ionicons
                name="options-outline"
                size={18}
                color={hasActiveFilters ? '#fff' : colors.textPrimary}
              />
              {hasActiveFilters && <View style={s.filterDot} />}
            </TouchableOpacity>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.filtersContent}
          >
            {STATUS_FILTERS.map((f) => (
              <TouchableOpacity
                key={f}
                style={[s.chip, activeFilter === f && s.chipActive]}
                onPress={() => handleFilterPress(f)}
              >
                {f === 'My Team' && (
                  <Ionicons
                    name="people-outline"
                    size={12}
                    color={activeFilter === f ? '#fff' : colors.gray600}
                    style={{ marginRight: 4 }}
                  />
                )}
                <Text style={[s.chipText, activeFilter === f && s.chipTextActive]}>{f}</Text>
              </TouchableOpacity>
            ))}
            {hasActiveFilters && (
              <TouchableOpacity style={s.resetChip} onPress={resetFilters}>
                <Ionicons name="close" size={12} color={colors.danger} style={{ marginRight: 3 }} />
                <Text style={s.resetChipText}>Reset</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>

        {/* Task list */}
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          style={s.listContainer}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <EmptyState
              icon="checkmark-circle-outline"
              title="No tasks found"
              subtitle="Create a task or adjust your filter."
            />
          }
          renderItem={({ item }) => (
            <TaskCard
              task={item}
              onPress={() => navigation.navigate('TaskDetail', { taskId: item.id, appId: workspace!.id })}
            />
          )}
        />

        {/* Filter bottom sheet */}
        <Modal visible={showFilters} animationType="slide" transparent>
          <View style={s.modalOverlay}>
            <TouchableOpacity style={s.modalBackdrop} onPress={() => setShowFilters(false)} />
            <View style={[s.modalSheet, { paddingBottom: insets.bottom + 16 }]}>
              {/* Sheet header */}
              <View style={s.sheetHeader}>
                <Text style={s.sheetTitle}>Filters</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  {hasActiveFilters && (
                    <TouchableOpacity onPress={() => { resetFilters(); setShowFilters(false); }}>
                      <Text style={s.sheetReset}>Reset all</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity onPress={() => setShowFilters(false)}>
                    <Ionicons name="close" size={22} color={colors.textPrimary} />
                  </TouchableOpacity>
                </View>
              </View>

              <ScrollView showsVerticalScrollIndicator={false}>
                {/* Assignee */}
                <Text style={s.sectionLabel}>ASSIGNEE</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.sheetChipsRow}>
                  <TouchableOpacity
                    style={[s.sheetChip, assigneeFilter === '' && s.sheetChipActive]}
                    onPress={() => applyFilter({ assignee: '' })}
                  >
                    <Text style={[s.sheetChipText, assigneeFilter === '' && s.sheetChipTextActive]}>All</Text>
                  </TouchableOpacity>
                  {members.map((m) => (
                    <TouchableOpacity
                      key={m.user_id}
                      style={[s.sheetChip, assigneeFilter === m.user_id && s.sheetChipActive]}
                      onPress={() => applyFilter({ assignee: assigneeFilter === m.user_id ? '' : m.user_id })}
                    >
                      <Text style={[s.sheetChipText, assigneeFilter === m.user_id && s.sheetChipTextActive]}>
                        {assigneeName(m)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                {/* Area */}
                <Text style={s.sectionLabel}>AREA</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.sheetChipsRow}>
                  <TouchableOpacity
                    style={[s.sheetChip, areaFilter === '' && s.sheetChipActive]}
                    onPress={() => applyFilter({ area: '' })}
                  >
                    <Text style={[s.sheetChipText, areaFilter === '' && s.sheetChipTextActive]}>All</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.sheetChip, areaFilter === 'others' && s.sheetChipActive]}
                    onPress={() => applyFilter({ area: areaFilter === 'others' ? '' : 'others' })}
                  >
                    <Text style={[s.sheetChipText, areaFilter === 'others' && s.sheetChipTextActive]}>Others</Text>
                  </TouchableOpacity>
                  {areas.map((a) => (
                    <TouchableOpacity
                      key={a.id}
                      style={[s.sheetChip, areaFilter === String(a.id) && s.sheetChipActive]}
                      onPress={() => applyFilter({ area: areaFilter === String(a.id) ? '' : String(a.id) })}
                    >
                      <Text style={[s.sheetChipText, areaFilter === String(a.id) && s.sheetChipTextActive]}>
                        {a.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                {/* Sort */}
                <Text style={s.sectionLabel}>SORT BY</Text>
                <View style={s.sheetChipsWrap}>
                  {SORT_OPTIONS.map((opt) => (
                    <TouchableOpacity
                      key={opt.value}
                      style={[s.sheetChip, sortBy === opt.value && s.sheetChipActive]}
                      onPress={() => applyFilter({ sort: opt.value })}
                    >
                      <Text style={[s.sheetChipText, sortBy === opt.value && s.sheetChipTextActive]}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </View>
          </View>
        </Modal>
    </View>
  );
}

function makeStyles(c: AppColors) {
  const SERIF = Platform.OS === 'ios' ? 'Georgia' : 'serif';
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },

    pageHeader: {
      backgroundColor: c.surface, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 14,
      borderBottomWidth: 1, borderBottomColor: c.border,
    },
    breadcrumb: { fontSize: 10, fontWeight: '700', color: c.textMuted, letterSpacing: 1, marginBottom: 6 },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
    pageTitle: { fontSize: 30, fontFamily: SERIF, color: c.textPrimary, flex: 1 },
    overdueBadge: { backgroundColor: c.dangerLight, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
    overdueText: { fontSize: 11, fontWeight: '700', color: c.danger },
    addBtn: {
      width: 34, height: 34, borderRadius: 10, backgroundColor: c.primaryLight,
      alignItems: 'center', justifyContent: 'center',
    },
    subtitle: { fontSize: 12, color: c.textSecondary },

    statsRow: {
      flexDirection: 'row', backgroundColor: c.surface,
      borderBottomWidth: 1, borderBottomColor: c.border,
      paddingVertical: 10,
    },
    statItem: { flex: 1, alignItems: 'center' },
    statItemBorder: { borderLeftWidth: 1, borderLeftColor: c.border },
    statCount: { fontSize: 20, fontWeight: '800', letterSpacing: -0.5 },
    statLabel: { fontSize: 9, fontWeight: '700', color: c.textMuted, letterSpacing: 0.5, marginTop: 2 },

    searchSection: {
      backgroundColor: c.surface,
      borderBottomWidth: 1, borderBottomColor: c.border,
      paddingTop: 10, paddingBottom: 4,
    },
    searchRow: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      paddingHorizontal: 16, paddingBottom: 8,
    },
    searchBar: {
      flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: c.background,
      borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7,
      borderWidth: 1.5, borderColor: c.border,
    },
    searchInput: { flex: 1, fontSize: 14, color: c.textPrimary },
    filterBtn: {
      width: 38, height: 38, borderRadius: 10, borderWidth: 1.5,
      borderColor: c.border, backgroundColor: c.background,
      alignItems: 'center', justifyContent: 'center',
    },
    filterBtnActive: { backgroundColor: c.primary, borderColor: c.primary },
    filterDot: {
      position: 'absolute', top: 6, right: 6,
      width: 7, height: 7, borderRadius: 4,
      backgroundColor: '#fff',
    },

    filtersContent: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 0, paddingBottom: 8 },
    chip: {
      flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
      backgroundColor: c.surface, borderWidth: 1.5, borderColor: c.border,
    },
    chipActive: { backgroundColor: c.primary, borderColor: c.primary },
    chipText: { fontSize: 14, fontWeight: '600', color: c.gray600 },
    chipTextActive: { color: '#ffffff', fontWeight: '800' },
    resetChip: {
      flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
      backgroundColor: c.dangerLight, borderWidth: 1.5, borderColor: c.danger,
    },
    resetChipText: { fontSize: 13, fontWeight: '700', color: c.danger },

    listContainer: { flex: 1, backgroundColor: c.background },
    list: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 32 },

    // Filter modal
    modalOverlay: { flex: 1, justifyContent: 'flex-end' },
    modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
    modalSheet: {
      backgroundColor: c.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20,
      maxHeight: '80%', paddingTop: 8,
    },
    sheetHeader: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 20, paddingVertical: 14,
      borderBottomWidth: 1, borderBottomColor: c.border,
    },
    sheetTitle: { fontSize: 17, fontWeight: '700', color: c.textPrimary },
    sheetReset: { fontSize: 14, fontWeight: '600', color: c.danger },
    sectionLabel: {
      fontSize: 10, fontWeight: '700', color: c.textMuted, letterSpacing: 1,
      marginHorizontal: 20, marginTop: 18, marginBottom: 10,
    },
    sheetChipsRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingBottom: 4 },
    sheetChipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 20, paddingBottom: 4 },
    sheetChip: {
      paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
      backgroundColor: c.background, borderWidth: 1.5, borderColor: c.border,
    },
    sheetChipActive: { backgroundColor: c.primary, borderColor: c.primary },
    sheetChipText: { fontSize: 14, fontWeight: '600', color: c.gray600 },
    sheetChipTextActive: { color: '#fff', fontWeight: '700' },
  });
}
