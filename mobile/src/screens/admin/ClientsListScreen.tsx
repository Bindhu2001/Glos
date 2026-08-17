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
import { AdminStackParamList } from '../../navigation/types';
import { apiErrorMessage } from '../../utils/apiError';
import LoadError from '../../components/common/LoadError';

type Nav = NativeStackNavigationProp<AdminStackParamList, 'ClientsList'>;

const STATUS_COLORS: Record<string, string> = { active: '#059669', inactive: '#6b7280' };

export default function ClientsListScreen() {
  const navigation = useNavigation<Nav>();
  const { colors } = useTheme();
  const { workspace } = useWorkspace();
  const api = useApi();
  const insets = useSafeAreaInsets();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [clients, setClients] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasLoadedRef = useRef(false);

  const load = useCallback(async (isRefresh = false) => {
    if (!workspace?.id) return;
    if (!isRefresh && !hasLoadedRef.current) setLoading(true);
    try {
      const res = await api.contracts.listClients(workspace.id, {});
      setClients(res.data ?? []);
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not load clients.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
      hasLoadedRef.current = true;
    }
  }, [workspace?.id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const filtered = clients.filter((c) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (c.client_name ?? '').toLowerCase().includes(q) || (c.client_code ?? '').toLowerCase().includes(q);
  });

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.title}>Clients</Text>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.navigate('CreateEditClient', {})}>
          <Ionicons name="add" size={24} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <View style={s.searchRow}>
        <Ionicons name="search-outline" size={15} color={colors.gray400} />
        <TextInput
          style={s.searchInput}
          placeholder="Search clients..."
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
          {filtered.length === 0 ? (
            <View style={s.empty}>
              <Ionicons name="business-outline" size={40} color={colors.gray400} />
              <Text style={s.emptyText}>No clients yet</Text>
            </View>
          ) : (
            filtered.map((c) => {
              const statusColor = STATUS_COLORS[c.status] ?? '#6b7280';
              return (
                <TouchableOpacity
                  key={c.id}
                  style={s.card}
                  activeOpacity={0.7}
                  onPress={() => navigation.navigate('CreateEditClient', { clientId: c.id })}
                >
                  <View style={s.iconBox}>
                    <Ionicons name="business-outline" size={20} color="#4f46e5" />
                  </View>
                  <View style={s.cardBody}>
                    <Text style={s.cardTitle}>{c.client_name}</Text>
                    <View style={s.metaRow}>
                      <Text style={s.metaText}>{c.client_code}</Text>
                      {c.contact_person ? <Text style={s.metaText}>{c.contact_person}</Text> : null}
                    </View>
                  </View>
                  <View style={[s.statusBadge, { backgroundColor: statusColor + '18', borderColor: statusColor + '44' }]}>
                    <Text style={[s.statusText, { color: statusColor }]}>{c.status ?? 'active'}</Text>
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
    searchRow: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      marginHorizontal: 16, marginTop: 12, marginBottom: 4,
      backgroundColor: c.surface, borderRadius: 10, borderWidth: 1, borderColor: c.border,
      paddingHorizontal: 12, paddingVertical: 8,
    },
    searchInput: { flex: 1, fontSize: 13, color: c.textPrimary },
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
    metaRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
    metaText: { fontSize: 11, color: c.textMuted },
    statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
    statusText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  });
}
