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
import { useHasTeam } from '../../contexts/HasTeamContext';
import { useTheme } from '../../contexts/ThemeContext';
import { AppColors } from '../../utils/colors';
import TaskCard from '../../components/tasks/TaskCard';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import LoadError from '../../components/common/LoadError';
import { useLoadWithTimeout } from '../../hooks/useLoadWithTimeout';
import EmptyState from '../../components/common/EmptyState';
import { TasksStackParamList } from '../../navigation/types';
import MemberPickerModal from '../../components/common/MemberPickerModal';

type Nav = NativeStackNavigationProp<TasksStackParamList, 'TasksList'>;

const SORT_OPTIONS = [
  { value: 'created_at', label: 'Recently Added' },
  { value: 'deadline', label: 'Deadline' },
  { value: 'priority', label: 'Priority' },
  { value: 'status', label: 'Status' },
  { value: 'assignee', label: 'Assignee' },
];

const STATUS_MAP: Record<string, string> = {
  'Not Started': 'open',
  'In Progress': 'in_progress',
  'Blocked': 'blocked',
  'Completed': 'done',
  'Cancelled': 'cancelled',
};

const PRIORITY_OPTIONS = [
  { value: 'urgent', label: 'Urgent' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];

const DEADLINE_PRESETS = [
  { value: 'overdue', label: 'Overdue' },
  { value: 'today', label: 'Today' },
  { value: 'this_week', label: 'This Week' },
  { value: 'next_week', label: 'Next Week' },
  { value: 'this_month', label: 'This Month' },
];

function startOfWeek(d: Date) {
  const x = new Date(d);
  const day = x.getDay();
  const diffToMon = (day + 6) % 7;
  x.setDate(x.getDate() - diffToMon);
  x.setHours(0, 0, 0, 0);
  return x;
}

function matchesDeadlinePreset(deadline: string | null | undefined, preset: string, now: Date): boolean {
  if (!deadline) return false;
  const d = new Date(deadline);
  const today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (preset === 'overdue') return d < now;
  if (preset === 'today') return d.toDateString() === today0.toDateString();
  if (preset === 'this_week') {
    const start = startOfWeek(now);
    const end = new Date(start); end.setDate(start.getDate() + 6); end.setHours(23, 59, 59, 999);
    return d >= start && d <= end;
  }
  if (preset === 'next_week') {
    const start = startOfWeek(now); start.setDate(start.getDate() + 7);
    const end = new Date(start); end.setDate(start.getDate() + 6); end.setHours(23, 59, 59, 999);
    return d >= start && d <= end;
  }
  if (preset === 'this_month') {
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }
  return true;
}

export default function TasksScreen() {
  const api = useApi();
  const { workspace } = useWorkspace();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();

  const { canSeeTeamContent, isAdmin } = useHasTeam();
  const STATUS_FILTERS = canSeeTeamContent
    ? ['All', 'My Tasks', 'My Team', 'Not Started', 'In Progress', 'Blocked', 'Completed', 'Cancelled']
    : ['All', 'My Tasks', 'Not Started', 'In Progress', 'Blocked', 'Completed', 'Cancelled'];

  const [tasks, setTasks] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [areas, setAreas] = useState<{ id: number; name: string; roleTitle: string }[]>([]);
  const [projects, setProjects] = useState<{ id: number; name: string }[]>([]);
  const [teamMemberIds, setTeamMemberIds] = useState<number[]>([]);
  const [myUserId, setMyUserId] = useState<number | null>(null);
  const { loading, loadError, run } = useLoadWithTimeout();
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('My Tasks');
  const [assigneeFilters, setAssigneeFilters] = useState<number[]>([]);
  const [areaFilter, setAreaFilter] = useState('');
  const [projectFilter, setProjectFilter] = useState<number | ''>('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [deadlinePreset, setDeadlinePreset] = useState('');
  const [needSupport, setNeedSupport] = useState(false);
  const [sortBy, setSortBy] = useState('created_at');
  const [showFilters, setShowFilters] = useState(false);
  const [showAssigneeModal, setShowAssigneeModal] = useState(false);

  // refs so load() reads current values without being recreated on every filter change
  const activeFilterRef = useRef('My Tasks');
  const areaFilterRef = useRef('');
  const projectFilterRef = useRef<number | ''>('');
  const sortByRef = useRef('created_at');

  // No outer try/catch here — a real failure (stuck token, network down) must
  // reach run() so useLoadWithTimeout shows "Unable to load data" with a
  // retry, instead of silently leaving the task list empty forever. The
  // per-role/team-member fallbacks inside loadContext below are intentionally
  // kept local since those are genuinely supplementary (filter dropdowns).
  const load = useCallback(async () => {
    if (!workspace) return;
    const filter = activeFilterRef.current;
    const params: Record<string, unknown> = {};
    if (filter === 'My Tasks') params.mine = 1;
    if (areaFilterRef.current === 'others') params.area_id = 'others';
    else if (areaFilterRef.current) params.area_id = areaFilterRef.current;
    if (projectFilterRef.current !== '') params.project_id = projectFilterRef.current;
    if (sortByRef.current) params.sort = sortByRef.current;
    const r = await api.tasks.list(workspace.id, params);
    setTasks(r.data?.items ?? r.data?.tasks ?? []);
  }, [workspace, api]);

  const loadContext = useCallback(async () => {
    if (!workspace) return;
    const [mRes, rRes, meRes, projRes] = await Promise.all([
      api.members.list(workspace.id),
      api.roles.list(workspace.id),
      api.me.getProfile(),
      api.projects.listSimple(workspace.id).catch(() => ({ data: [] })),
    ]);
    const memberRows: any[] = mRes.data?.items ?? [];
    setMembers(memberRows);
    const meId = meRes.data?.id ?? meRes.data?.user?.id ?? null;
    setMyUserId(meId);
    const projRows: any[] = projRes.data?.items ?? projRes.data ?? [];
    setProjects(projRows.map((p: any) => ({ id: p.id, name: p.name })));

    // Scope the assignee filter to "my team" (self + subordinates) for managers,
    // matching web's Assignee dropdown restriction — admins see everyone.
    if (canSeeTeamContent && !isAdmin) {
      try {
        const teamRes = await api.dashboard.getManagerDashboard(workspace.id, 'all');
        const ids: number[] = (teamRes.data?.members ?? []).map((m: any) => m.user?.id).filter(Boolean);
        setTeamMemberIds(ids);
      } catch { setTeamMemberIds(meId ? [meId] : []); }
    } else if (isAdmin) {
      setTeamMemberIds(memberRows.map((m: any) => m.user_id).filter(Boolean));
    }

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
  }, [workspace, api, canSeeTeamContent, isAdmin]);

  // useFocusEffect below also fires on initial mount (a screen becomes focused
  // as soon as it's pushed), which used to double-fetch api.tasks.list() on
  // every first visit to this tab — once here, once there. hasLoadedRef makes
  // the focus effect a no-op until the initial load (tasks + context) finishes,
  // so it only does its job of refreshing tasks on later refocuses.
  const hasLoadedRef = useRef(false);
  useEffect(() => {
    run(() => Promise.all([load(), loadContext()])).then(() => { hasLoadedRef.current = true; });
  }, [load, loadContext]);

  useFocusEffect(useCallback(() => {
    // Swallowed here deliberately (unlike the initial load above) — this is a
    // quiet background refresh on refocus; the list already has data on
    // screen, and load() no longer catches its own errors so this must, or a
    // failed refocus-refresh would surface as an unhandled promise rejection.
    if (hasLoadedRef.current) load().catch(() => {});
  }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await load();
    } catch {
      // Pull-to-refresh failing silently (list just doesn't update) is
      // preferable to a raw alert here — same reasoning as the focus effect
      // above. The important fix is that setRefreshing still always runs.
    } finally {
      setRefreshing(false);
    }
  };

  const handleFilterPress = async (filter: string) => {
    setActiveFilter(filter);
    activeFilterRef.current = filter;
    try { await load(); } catch {}
  };

  const applyFilter = async (opts: { area?: string; project?: number | ''; sort?: string }) => {
    if (opts.area !== undefined) { setAreaFilter(opts.area); areaFilterRef.current = opts.area; }
    if (opts.project !== undefined) { setProjectFilter(opts.project); projectFilterRef.current = opts.project; }
    if (opts.sort !== undefined) { setSortBy(opts.sort); sortByRef.current = opts.sort; }
    try { await load(); } catch {}
  };

  const resetFilters = async () => {
    setAssigneeFilters([]);
    setAreaFilter(''); areaFilterRef.current = '';
    setProjectFilter(''); projectFilterRef.current = '';
    setPriorityFilter('');
    setDeadlinePreset('');
    setNeedSupport(false);
    setSortBy('created_at'); sortByRef.current = 'created_at';
    try { await load(); } catch {}
  };

  // Everything except the status chip itself — shared by the visible list (which
  // also applies the status chip) and the header stat tiles (which must NOT
  // collapse to the active status chip, since they're the status breakdown of
  // whatever scope — My Tasks / My Team / assignee / priority / etc — is active).
  // Previously the stat tiles were computed from the raw unscoped `tasks` fetch,
  // so picking an Assignee/Priority/Deadline filter changed the visible list but
  // left the header counts unchanged — a mismatch that reads as "wrong counts".
  const scoped = (() => {
    const now = new Date();
    return tasks.filter((t) => {
      const matchSearch = !search || (t.title ?? '').toLowerCase().includes(search.toLowerCase());
      const matchTeam = activeFilter === 'My Team'
        ? teamMemberIds.includes(t.assigned_to_user_id)
        : true;
      const matchAssignee = assigneeFilters.length === 0 || assigneeFilters.includes(t.assigned_to_user_id);
      const matchPriority = !priorityFilter || t.priority === priorityFilter;
      const matchDeadline = !deadlinePreset || matchesDeadlinePreset(t.deadline ?? t.due_on, deadlinePreset, now);
      const matchNeedSupport = !needSupport || t.review_status === 'need_support';
      return matchSearch && matchTeam && matchAssignee && matchPriority && matchDeadline && matchNeedSupport;
    });
  })();

  const filtered = (() => {
    const statusKey = STATUS_MAP[activeFilter];
    let base = statusKey ? scoped.filter((t) => t.status === statusKey) : scoped;
    // "My Tasks" is a work queue, not an archive — hide Done by default so
    // completed work doesn't clutter it. The Done chip (and All) still show
    // everything for anyone who wants to see finished tasks.
    if (activeFilter === 'My Tasks') {
      base = base.filter((t) => t.status !== 'done');
    }
    // Running-timer tasks float to the top, stable otherwise.
    return [...base].sort((a, b) => (b.timer_started_at ? 1 : 0) - (a.timer_started_at ? 1 : 0));
  })();

  const hasActiveFilters = !!(
    assigneeFilters.length > 0 || areaFilter || projectFilter || priorityFilter || deadlinePreset || needSupport
    || (sortBy && sortBy !== 'created_at')
  );

  if (loading) return <LoadingSpinner />;
  if (loadError) return <LoadError onRetry={() => run(() => Promise.all([load(), loadContext()]))} />;

  const now = new Date();
  const inProgressCount = scoped.filter(t => t.status === 'in_progress').length;
  const doneCount = scoped.filter(t => t.status === 'done').length;
  const overdueCount = scoped.filter(t =>
    t.deadline && new Date(t.deadline) < now && t.status !== 'done' && t.status !== 'cancelled'
  ).length;
  const notStartedCount = scoped.filter(t => t.status === 'open').length;

  // Matches web's Tasks.jsx summary card set/order exactly: Total, Completed,
  // In Progress, Not Started, Overdue — this used to show Blocked instead of
  // Not Started, which isn't one of web's cards at all.
  const stats = [
    { label: 'TOTAL', count: scoped.length, color: colors.textPrimary },
    { label: 'COMPLETED', count: doneCount, color: colors.success },
    { label: 'IN PROGRESS', count: inProgressCount, color: colors.primary },
    { label: 'NOT STARTED', count: notStartedCount, color: colors.textSecondary },
    { label: 'OVERDUE', count: overdueCount, color: colors.danger },
  ];

  const assigneeName = (m: any) =>
    `${m.first_name ?? ''} ${m.last_name ?? ''}`.trim() || m.email;

  // Matches web's Assignee dropdown: hidden for plain members with no reportees,
  // scoped to self+subordinates for managers, all members for admins.
  const assigneeOptions = canSeeTeamContent
    ? (isAdmin ? members : members.filter((m) => teamMemberIds.includes(m.user_id)))
    : [];

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
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.filtersContent}
          >
            {STATUS_FILTERS.map((f) => (
              <React.Fragment key={f}>
                <TouchableOpacity
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

                {/* Assignee sits right next to My Team — it's the filter managers/admins
                    reach for immediately after narrowing to their team. */}
                {f === 'My Team' && assigneeOptions.length > 0 && (
                  <TouchableOpacity
                    style={[s.chip, assigneeFilters.length > 0 && s.chipActive]}
                    onPress={() => setShowAssigneeModal(true)}
                  >
                    <Ionicons
                      name="person-outline"
                      size={12}
                      color={assigneeFilters.length > 0 ? '#fff' : colors.gray600}
                      style={{ marginRight: 4 }}
                    />
                    <Text style={[s.chipText, assigneeFilters.length > 0 && s.chipTextActive]}>
                      Assignee{assigneeFilters.length > 0 ? ` (${assigneeFilters.length})` : ''}
                    </Text>
                  </TouchableOpacity>
                )}
              </React.Fragment>
            ))}

            <TouchableOpacity
              style={[s.chip, needSupport && s.chipActive]}
              onPress={() => setNeedSupport((v) => !v)}
            >
              <Ionicons
                name="help-buoy-outline"
                size={12}
                color={needSupport ? '#fff' : colors.gray600}
                style={{ marginRight: 4 }}
              />
              <Text style={[s.chipText, needSupport && s.chipTextActive]}>Need Support</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.chip, (!!areaFilter || !!projectFilter || !!priorityFilter || !!deadlinePreset || (sortBy !== 'created_at')) && s.chipActive]}
              onPress={() => setShowFilters(true)}
            >
              <Ionicons
                name="options-outline"
                size={12}
                color={(!!areaFilter || !!projectFilter || !!priorityFilter || !!deadlinePreset || (sortBy !== 'created_at')) ? '#fff' : colors.gray600}
                style={{ marginRight: 4 }}
              />
              <Text style={[s.chipText, (!!areaFilter || !!projectFilter || !!priorityFilter || !!deadlinePreset || (sortBy !== 'created_at')) && s.chipTextActive]}>More Filters</Text>
            </TouchableOpacity>

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
        <Modal visible={showFilters} animationType="slide" transparent onRequestClose={() => setShowFilters(false)}>
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
                {/* Project */}
                {projects.length > 0 && (
                  <>
                    <Text style={s.sectionLabel}>PROJECT</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.sheetChipsScroll} contentContainerStyle={s.sheetChipsRow}>
                      <TouchableOpacity
                        style={[s.sheetChip, projectFilter === '' && s.sheetChipActive]}
                        onPress={() => applyFilter({ project: '' })}
                      >
                        <Text style={[s.sheetChipText, projectFilter === '' && s.sheetChipTextActive]}>All</Text>
                      </TouchableOpacity>
                      {projects.map((p) => (
                        <TouchableOpacity
                          key={p.id}
                          style={[s.sheetChip, projectFilter === p.id && s.sheetChipActive]}
                          onPress={() => applyFilter({ project: projectFilter === p.id ? '' : p.id })}
                        >
                          <Text style={[s.sheetChipText, projectFilter === p.id && s.sheetChipTextActive]}>{p.name}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </>
                )}

                {/* Priority */}
                <Text style={s.sectionLabel}>PRIORITY</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.sheetChipsScroll} contentContainerStyle={s.sheetChipsRow}>
                  <TouchableOpacity
                    style={[s.sheetChip, priorityFilter === '' && s.sheetChipActive]}
                    onPress={() => setPriorityFilter('')}
                  >
                    <Text style={[s.sheetChipText, priorityFilter === '' && s.sheetChipTextActive]}>All</Text>
                  </TouchableOpacity>
                  {PRIORITY_OPTIONS.map((p) => (
                    <TouchableOpacity
                      key={p.value}
                      style={[s.sheetChip, priorityFilter === p.value && s.sheetChipActive]}
                      onPress={() => setPriorityFilter(priorityFilter === p.value ? '' : p.value)}
                    >
                      <Text style={[s.sheetChipText, priorityFilter === p.value && s.sheetChipTextActive]}>{p.label}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                {/* Deadline */}
                <Text style={s.sectionLabel}>DEADLINE</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.sheetChipsScroll} contentContainerStyle={s.sheetChipsRow}>
                  <TouchableOpacity
                    style={[s.sheetChip, deadlinePreset === '' && s.sheetChipActive]}
                    onPress={() => setDeadlinePreset('')}
                  >
                    <Text style={[s.sheetChipText, deadlinePreset === '' && s.sheetChipTextActive]}>All</Text>
                  </TouchableOpacity>
                  {DEADLINE_PRESETS.map((d) => (
                    <TouchableOpacity
                      key={d.value}
                      style={[s.sheetChip, deadlinePreset === d.value && s.sheetChipActive]}
                      onPress={() => setDeadlinePreset(deadlinePreset === d.value ? '' : d.value)}
                    >
                      <Text style={[s.sheetChipText, deadlinePreset === d.value && s.sheetChipTextActive]}>{d.label}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                {/* Area */}
                <Text style={s.sectionLabel}>AREA</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.sheetChipsScroll} contentContainerStyle={s.sheetChipsRow}>
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

        {/* Assignee multi-select modal */}
        <MemberPickerModal
          visible={showAssigneeModal}
          title="Filter by Assignee"
          multi
          allowClear={false}
          options={assigneeOptions.map((m) => ({
            id: m.user_id,
            name: `${assigneeName(m)}${String(m.user_id) === String(myUserId) ? ' (you)' : ''}`,
          }))}
          selected={assigneeFilters}
          onChange={setAssigneeFilters}
          onClose={() => setShowAssigneeModal(false)}
        />
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
    sectionLabelRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      marginHorizontal: 20, marginTop: 18, marginBottom: 10,
    },
    sectionLabelInline: { fontSize: 10, fontWeight: '700', color: c.textMuted, letterSpacing: 1 },
    sectionClear: { fontSize: 12, fontWeight: '700', color: c.danger },
    sheetChipsScroll: { flexGrow: 0, flexShrink: 0 },
    sheetChipsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingBottom: 4 },
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
