import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  TextInput, RefreshControl, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useApi } from '../../hooks/useApi';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useTheme } from '../../contexts/ThemeContext';
import { AppColors } from '../../utils/colors';
import Avatar from '../../components/common/Avatar';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import LoadError from '../../components/common/LoadError';
import { useLoadWithTimeout } from '../../hooks/useLoadWithTimeout';
import EmptyState from '../../components/common/EmptyState';
import { PeopleStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<PeopleStackParamList, 'EmployeesList'>;

export default function EmployeesScreen() {
  const api = useApi();
  const { workspace } = useWorkspace();
  const navigation = useNavigation<Nav>();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();

  const [employees, setEmployees] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const { loading, loadError, run } = useLoadWithTimeout();

  const load = useCallback(async () => {
    if (!workspace) return;
    const r = await api.employees.list(workspace.id);
    const d = r.data;
    setEmployees(Array.isArray(d) ? d : (d?.items ?? d?.employees ?? []));
  }, [workspace]);

  useEffect(() => { run(load); }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await run(load, true);
    setRefreshing(false);
  };

  const filtered = employees.filter((e) => {
    if (!search) return true;
    const name = e.full_name ?? ([e.first_name, e.last_name].filter(Boolean).join(' '));
    return name.toLowerCase().includes(search.toLowerCase());
  });

  if (loading) return <LoadingSpinner />;
  if (loadError) return <LoadError onRetry={() => run(load)} />;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <Text style={s.title}>People</Text>
        <Text style={s.count}>{employees.length} members</Text>
      </View>

      <View style={s.searchBar}>
        <Ionicons name="search-outline" size={16} color={colors.gray400} />
        <TextInput
          style={s.searchInput}
          placeholder="Search people..."
          placeholderTextColor={colors.gray400}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={s.list}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={<EmptyState icon="people-outline" title="No people found" />}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={s.card}
            onPress={() => navigation.navigate('EmployeeDetail', { employeeId: item.id, appId: workspace!.id })}
            activeOpacity={0.8}
          >
            <Avatar name={item.full_name ?? 'Unknown'} size={44} />
            <View style={s.info}>
              <Text style={s.name}>{item.full_name}</Text>
              {item.role_title && <Text style={s.role}>{item.role_title}</Text>}
              {item.department_name && <Text style={s.dept}>{item.department_name}</Text>}
            </View>
            <View style={[s.statusDot, { backgroundColor: item.status === 'active' ? colors.success : colors.gray300 }]} />
            <Ionicons name="chevron-forward" size={16} color={colors.gray300} />
          </TouchableOpacity>
        )}
      />
    </View>
    </KeyboardAvoidingView>
  );
}

function makeStyles(c: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    header: {
      flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between',
      backgroundColor: c.surface, paddingHorizontal: 20, paddingBottom: 14,
      paddingTop: 10, borderBottomWidth: 1, borderBottomColor: c.border,
    },
    title: { fontSize: 20, fontWeight: '700', color: c.textPrimary },
    count: { fontSize: 13, color: c.textSecondary },
    searchBar: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: c.surface, marginHorizontal: 16, marginTop: 12,
      borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
      borderWidth: 1.5, borderColor: c.border,
    },
    searchInput: { flex: 1, fontSize: 14, color: c.textPrimary },
    list: { padding: 16, paddingTop: 10, paddingBottom: 32 },
    card: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: c.surface, borderRadius: 12, padding: 14, marginBottom: 8,
      borderWidth: 1, borderColor: c.border,
      shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 2,
    },
    info: { flex: 1 },
    name: { fontSize: 15, fontWeight: '600', color: c.textPrimary },
    role: { fontSize: 13, color: c.textSecondary, marginTop: 1 },
    dept: { fontSize: 12, color: c.gray400, marginTop: 1 },
    statusDot: { width: 8, height: 8, borderRadius: 4 },
  });
}
