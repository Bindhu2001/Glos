import React, { useState, useMemo, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, ActivityIndicator, RefreshControl, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../contexts/ThemeContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useApi } from '../../hooks/useApi';
import { AppColors } from '../../utils/colors';
import { MoreStackParamList } from '../../navigation/types';
import { apiErrorMessage } from '../../utils/apiError';
import LoadError from '../../components/common/LoadError';

type Nav = NativeStackNavigationProp<MoreStackParamList, 'ServicesList'>;

const FILTERS = ['all', 'active', 'inactive'] as const;

export default function ServicesListScreen() {
  const navigation = useNavigation<Nav>();
  const { colors } = useTheme();
  const { workspace } = useWorkspace();
  const api = useApi();
  const insets = useSafeAreaInsets();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [services, setServices] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<typeof FILTERS[number]>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasLoadedRef = useRef(false);

  const load = useCallback(async (isRefresh = false) => {
    if (!workspace?.id) return;
    if (!isRefresh && !hasLoadedRef.current) setLoading(true);
    try {
      const params: Record<string, unknown> = {};
      if (search) params.search = search;
      if (filter !== 'all') params.active = filter === 'active';
      const res = await api.contracts.listServices(workspace.id, params);
      setServices(res.data ?? []);
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not load services.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
      hasLoadedRef.current = true;
    }
  }, [workspace?.id, search, filter]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.title}>Services</Text>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.navigate('CreateEditService', {})}>
          <Ionicons name="add" size={24} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <View style={s.searchRow}>
        <Ionicons name="search-outline" size={15} color={colors.gray400} />
        <TextInput
          style={s.searchInput}
          placeholder="Search services..."
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

      <View style={s.filterRow}>
        {FILTERS.map((f) => (
          <TouchableOpacity key={f} style={[s.filterChip, filter === f && s.filterChipActive]} onPress={() => setFilter(f)}>
            <Text style={[s.filterChipText, filter === f && s.filterChipTextActive]}>
              {f === 'all' ? 'All Status' : f[0].toUpperCase() + f.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
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
          {services.length === 0 ? (
            <View style={s.empty}>
              <Ionicons name="construct-outline" size={40} color={colors.gray400} />
              <Text style={s.emptyText}>No services found</Text>
            </View>
          ) : (
            services.map((svc) => (
              <TouchableOpacity
                key={svc.id}
                style={s.card}
                activeOpacity={0.7}
                onPress={() => navigation.navigate('CreateEditService', { serviceId: svc.id })}
              >
                <View style={s.iconBox}>
                  <Ionicons name="construct-outline" size={20} color="#4f46e5" />
                </View>
                <View style={s.cardBody}>
                  <Text style={s.cardTitle}>{svc.service_name}</Text>
                  <View style={s.metaRow}>
                    <Text style={s.codeText}>{svc.service_code}</Text>
                    <Text style={s.metaText}>{svc.normal_processing_days} day{svc.normal_processing_days !== 1 ? 's' : ''}</Text>
                  </View>
                </View>
                <View style={[s.statusBadge, { backgroundColor: (svc.is_active ? '#059669' : '#6b7280') + '18', borderColor: (svc.is_active ? '#059669' : '#6b7280') + '44' }]}>
                  <Text style={[s.statusText, { color: svc.is_active ? '#059669' : '#6b7280' }]}>{svc.is_active ? 'Active' : 'Inactive'}</Text>
                </View>
              </TouchableOpacity>
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
    searchRow: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      marginHorizontal: 16, marginTop: 12, marginBottom: 10,
      backgroundColor: c.surface, borderRadius: 10, borderWidth: 1, borderColor: c.border,
      paddingHorizontal: 12, paddingVertical: 8,
    },
    searchInput: { flex: 1, fontSize: 13, color: c.textPrimary },
    filterRow: { flexDirection: 'row', gap: 8, marginHorizontal: 16, marginBottom: 4 },
    filterChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1.5, borderColor: c.border, backgroundColor: c.surface },
    filterChipActive: { backgroundColor: c.primaryLight, borderColor: c.primary },
    filterChipText: { fontSize: 12, fontWeight: '600', color: c.gray500 },
    filterChipTextActive: { color: c.primary },
    list: { padding: 16, gap: 10 },
    empty: { alignItems: 'center', gap: 12, paddingTop: 60 },
    emptyText: { fontSize: 14, color: c.textMuted },
    card: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: c.surface, borderRadius: 14, padding: 14,
      borderWidth: 1, borderColor: c.border,
    },
    iconBox: { width: 40, height: 40, borderRadius: 10, backgroundColor: '#4f46e514', alignItems: 'center', justifyContent: 'center' },
    cardBody: { flex: 1, gap: 4 },
    cardTitle: { fontSize: 14, fontWeight: '700', color: c.textPrimary },
    metaRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
    codeText: { fontSize: 11, fontWeight: '700', color: c.primary, backgroundColor: c.gray50, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
    metaText: { fontSize: 11, color: c.textMuted },
    statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
    statusText: { fontSize: 11, fontWeight: '700' },
  });
}
