import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
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

type Nav = NativeStackNavigationProp<MoreStackParamList, 'AgreementsList'>;

const STATUS_COLORS: Record<string, string> = {
  active: '#059669',
  draft: '#d97706',
  expired: '#dc2626',
  terminated: '#6b7280',
};

export default function AgreementsListScreen() {
  const navigation = useNavigation<Nav>();
  const { colors } = useTheme();
  const { workspace } = useWorkspace();
  const api = useApi();
  const insets = useSafeAreaInsets();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [agreements, setAgreements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const hasLoadedRef = useRef(false);
  // Read inside load() via a ref so `load` stays identity-stable — otherwise
  // useFocusEffect would re-fire on every keystroke and defeat the debounce.
  const searchRef = useRef(search);
  searchRef.current = search;

  const load = useCallback(async (isRefresh = false) => {
    if (!workspace?.id) return;
    if (!isRefresh && !hasLoadedRef.current) setLoading(true);
    try {
      // Server-side search — matches web's Agreements list; the backend now
      // matches agreement_name as well as agreement_number (fix 4427687e).
      const q = searchRef.current.trim();
      const res = await api.contracts.listAgreements(workspace.id, q ? { search: q } : undefined);
      setAgreements(res.data?.items ?? res.data ?? []);
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not load agreements.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
      hasLoadedRef.current = true;
    }
  }, [workspace?.id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Debounced server-side re-fetch as the user types.
  useEffect(() => {
    if (!hasLoadedRef.current) return;
    const t = setTimeout(() => load(), 300);
    return () => clearTimeout(t);
  }, [search, load]);

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.title}>Agreements</Text>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.navigate('CreateEditAgreement', { appId: workspace!.id })}>
          <Ionicons name="add" size={24} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <View style={s.searchRow}>
        <Ionicons name="search-outline" size={15} color={colors.gray400} />
        <TextInput
          style={s.searchInput}
          placeholder="Search agreements..."
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
          {agreements.length === 0 ? (
            <View style={s.empty}>
              <Ionicons name="document-text-outline" size={40} color={colors.gray400} />
              <Text style={s.emptyText}>No agreements yet</Text>
            </View>
          ) : (
            agreements.map((a) => {
              const statusColor = STATUS_COLORS[a.status] ?? '#6b7280';
              return (
                <TouchableOpacity
                  key={a.id}
                  style={s.card}
                  activeOpacity={0.7}
                  onPress={() => navigation.navigate('AgreementDetail', { agreementId: a.id, appId: workspace!.id })}
                >
                  <View style={s.iconBox}>
                    <Ionicons name="document-text-outline" size={20} color="#4f46e5" />
                  </View>
                  <View style={s.cardBody}>
                    {/* Matches web's Agreements.jsx list — agreement_name is the
                        heading, agreement_number is the secondary code chip,
                        not the other way around (agreement_number used to be
                        shown as the heading here). */}
                    <Text style={s.cardTitle} numberOfLines={2}>{a.agreement_name || a.agreement_number || `Agreement #${a.id}`}</Text>
                    <View style={s.metaRow}>
                      <Text style={s.codeText}>{a.agreement_number ?? `#${a.id}`}</Text>
                      {a.client?.client_name ? <Text style={s.metaText}>{a.client.client_name}</Text> : null}
                      <Text style={s.metaText}>{a.services?.length ?? 0} services</Text>
                    </View>
                  </View>
                  <View style={[s.statusBadge, { backgroundColor: statusColor + '18', borderColor: statusColor + '44' }]}>
                    <Text style={[s.statusText, { color: statusColor }]}>{a.status ?? 'draft'}</Text>
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
      flexDirection: 'row', alignItems: 'flex-start', gap: 12,
      backgroundColor: c.surface, borderRadius: 14, padding: 14,
      borderWidth: 1, borderColor: c.border,
    },
    iconBox: { width: 40, height: 40, borderRadius: 10, backgroundColor: '#4f46e514', alignItems: 'center', justifyContent: 'center' },
    cardBody: { flex: 1, gap: 4 },
    cardTitle: { fontSize: 14, fontWeight: '700', color: c.textPrimary },
    codeText: { fontSize: 11, fontWeight: '700', color: c.primary, backgroundColor: c.gray50, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
    metaRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
    metaText: { fontSize: 11, color: c.textMuted },
    statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
    statusText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  });
}
