import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  TextInput, RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
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

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <Text style={s.title}>Tasks</Text>
        <TouchableOpacity
          style={s.addBtn}
          onPress={() => navigation.navigate('CreateTask', { appId: workspace!.id })}
        >
          <Ionicons name="add" size={20} color={colors.primary} />
        </TouchableOpacity>
      </View>

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

      <View style={s.filters}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f}
            style={[s.chip, activeFilter === f && s.chipActive]}
            onPress={() => setActiveFilter(f)}
          >
            <Text style={[s.chipText, activeFilter === f && s.chipTextActive]}>{f}</Text>
          </TouchableOpacity>
        ))}
      </View>

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
  );
}

function makeStyles(c: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      backgroundColor: c.surface, paddingHorizontal: 20, paddingBottom: 14,
      paddingTop: 10, borderBottomWidth: 1, borderBottomColor: c.border,
    },
    title: { fontSize: 20, fontWeight: '700', color: c.textPrimary },
    addBtn: {
      width: 36, height: 36, borderRadius: 10, backgroundColor: c.primaryLight,
      alignItems: 'center', justifyContent: 'center',
      borderWidth: 1, borderColor: c.primary + '33',
    },
    searchBar: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: c.surface, marginHorizontal: 16, marginTop: 12,
      borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
      borderWidth: 1.5, borderColor: c.border,
    },
    searchInput: { flex: 1, fontSize: 14, color: c.textPrimary },
    filters: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
    chip: {
      paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20,
      backgroundColor: c.surface, borderWidth: 1, borderColor: c.border,
    },
    chipActive: { backgroundColor: c.primaryLight, borderColor: c.primary + '66' },
    chipText: { fontSize: 13, fontWeight: '600', color: c.textMuted },
    chipTextActive: { color: c.primary, fontWeight: '700' },
    list: { padding: 16, paddingBottom: 32 },
  });
}
