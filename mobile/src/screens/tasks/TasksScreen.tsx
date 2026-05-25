import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  TextInput, RefreshControl, ScrollView, Platform,
  KeyboardAvoidingView,
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

const FILTERS = ['All', 'My Tasks', 'Active', 'Done'];

export default function TasksScreen() {
  const api = useApi();
  const { workspace } = useWorkspace();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();

  const [tasks, setTasks] = useState<any[]>([]);
  const [meId, setMeId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('All');

  const load = useCallback(async () => {
    if (!workspace) return;
    try {
      const [r, meRes] = await Promise.all([
        api.tasks.list(workspace.id),
        api.me.getProfile(),
      ]);
      setTasks(r.data?.items ?? r.data?.tasks ?? []);
      const id = meRes.data?.id ?? meRes.data?.user?.id ?? null;
      setMeId(id);
    } catch {}
  }, [workspace, api]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const filtered = tasks.filter((t) => {
    const matchSearch = !search || t.title.toLowerCase().includes(search.toLowerCase());
    let matchFilter = true;
    if (activeFilter === 'Active') matchFilter = t.status === 'in_progress';
    else if (activeFilter === 'Done') matchFilter = t.status === 'done';
    else if (activeFilter === 'My Tasks' && meId !== null)
      matchFilter = t.assigned_to_user_id === meId || t.created_by_user_id === meId;
    return matchSearch && matchFilter;
  });

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

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
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

      {/* Search bar */}
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

      {/* Filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.filtersContent}
      >
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f}
            style={[s.chip, activeFilter === f && s.chipActive]}
            onPress={() => setActiveFilter(f)}
          >
            <Text style={[s.chipText, activeFilter === f && s.chipTextActive]}>{f}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Task list */}
      <FlatList
        data={filtered}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={s.list}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <EmptyState icon="checkmark-circle-outline" title="No tasks found" subtitle="Create a task or adjust your filter." />
        }
        renderItem={({ item }) => (
          <TaskCard
            task={item}
            onPress={() => navigation.navigate('TaskDetail', { taskId: item.id, appId: workspace!.id })}
          />
        )}
      />
    </View>
    </KeyboardAvoidingView>
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

    searchBar: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: c.surface, marginHorizontal: 16, marginTop: 8, marginBottom: 0,
      borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9,
      borderWidth: 1.5, borderColor: c.border,
    },
    searchInput: { flex: 1, fontSize: 14, color: c.textPrimary },

    filtersContent: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8 },
    chip: {
      paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
      backgroundColor: c.surface, borderWidth: 1.5, borderColor: c.border,
      alignItems: 'center',
    },
    chipActive: { backgroundColor: c.primary, borderColor: c.primary },
    chipText: { fontSize: 14, fontWeight: '600', color: c.gray600 },
    chipTextActive: { color: '#ffffff', fontWeight: '800' },

    list: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 32 },
  });
}
