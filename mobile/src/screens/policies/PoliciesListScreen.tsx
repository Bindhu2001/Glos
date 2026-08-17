import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform,
  ActivityIndicator, TextInput, Modal, RefreshControl, KeyboardAvoidingView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../contexts/ThemeContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useApi } from '../../hooks/useApi';
import { AppColors } from '../../utils/colors';
import { MoreStackParamList } from '../../navigation/types';
import { apiErrorMessage } from '../../utils/apiError';
import { showAlert } from '../../components/common/AlertModal';
import LoadError from '../../components/common/LoadError';
import PostContentView from '../../components/feed/PostContentView';

type Nav = NativeStackNavigationProp<MoreStackParamList, 'PoliciesList'>;

const STATUS_GROUPS = [
  { value: 'active', label: 'Active' },
  { value: 'draft', label: 'Draft' },
  { value: 'retired', label: 'Retired' },
];

const CATEGORY_COLORS = ['#06b6d4', '#4ad295', '#f0a93b', '#6f7bff', '#f472b6', '#34d399', '#fb923c', '#a78bfa'];
function categoryColor(category: string, index: number) {
  const hash = category.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return CATEGORY_COLORS[(hash + index) % CATEGORY_COLORS.length];
}

export default function PoliciesListScreen() {
  const navigation = useNavigation<Nav>();
  const { colors } = useTheme();
  const { workspace } = useWorkspace();
  const api = useApi();
  const insets = useSafeAreaInsets();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const isAdmin = workspace?.role === 'super_admin' || workspace?.role === 'admin';

  const [policies, setPolicies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (!workspace?.id) return;
    if (!isRefresh) setLoading(true);
    try {
      const res = isAdmin
        ? await api.policies.list(workspace.id)
        : await api.policies.list(workspace.id, { status: 'active' });
      const items = Array.isArray(res.data) ? res.data : (res.data?.items ?? []);
      setPolicies(items);
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not load policies.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [workspace?.id, isAdmin, api]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = () => { setRefreshing(true); load(true); };

  const q = search.trim().toLowerCase();
  const filtered = q
    ? policies.filter((p) => p.title?.toLowerCase().includes(q) || p.category?.toLowerCase().includes(q))
    : policies;

  const createPolicy = async () => {
    if (!newTitle.trim() || !workspace) return;
    setCreating(true);
    try {
      const res = await api.policies.create(workspace.id, { title: newTitle.trim() });
      setCreateOpen(false);
      setNewTitle('');
      navigation.navigate('PolicyDetail', { policyId: res.data.id, appId: workspace.id });
    } catch (err) {
      showAlert('Could not create policy', apiErrorMessage(err));
    } finally {
      setCreating(false);
    }
  };

  if (loading) return <View style={{ flex: 1, backgroundColor: colors.background }}><ActivityIndicator style={{ flex: 1 }} color={colors.primary} /></View>;
  if (error) return <LoadError message={error} onRetry={() => load()} />;

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.title}>HR Policies</Text>
        {isAdmin ? (
          <TouchableOpacity style={s.backBtn} onPress={() => setCreateOpen(true)}>
            <Ionicons name="add" size={24} color={colors.primary} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 36 }} />
        )}
      </View>

      <View style={s.searchBar}>
        <Ionicons name="search-outline" size={15} color={colors.gray400} />
        <TextInput
          style={s.searchInput}
          placeholder="Search policies..."
          placeholderTextColor={colors.gray400}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      <ScrollView
        contentContainerStyle={s.body}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {filtered.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="document-text-outline" size={40} color={colors.gray400} />
            <Text style={s.emptyText}>{q ? 'No policies match your search' : 'No policies yet'}</Text>
          </View>
        ) : isAdmin ? (
          // Admin view: grouped by status, tap to open the full editor — matches web's Policies.jsx
          STATUS_GROUPS.map(({ value, label }) => {
            const group = filtered.filter((p) => (p.status || 'draft') === value);
            if (group.length === 0) return null;
            return (
              <View key={value} style={{ marginBottom: 20 }}>
                <Text style={s.groupHead}>{label} · {group.length}</Text>
                {group.map((p) => (
                  <TouchableOpacity
                    key={p.id}
                    style={s.card}
                    activeOpacity={0.7}
                    onPress={() => navigation.navigate('PolicyDetail', { policyId: p.id, appId: workspace!.id })}
                  >
                    <View style={s.cardTopRow}>
                      <View style={[s.statusPill, { backgroundColor: STATUS_COLOR[p.status] + '18' }]}>
                        <Text style={[s.statusPillText, { color: STATUS_COLOR[p.status] }]}>{STATUS_GROUPS.find((g) => g.value === p.status)?.label ?? p.status}</Text>
                      </View>
                      {!!p.category && <Text style={s.cardCategory}>{p.category}</Text>}
                    </View>
                    <Text style={s.cardTitle}>{p.title}</Text>
                    <Text style={s.cardMeta}>
                      v{p.version}{p.effective_from ? ` · effective ${new Date(p.effective_from).toLocaleDateString()}` : ''}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            );
          })
        ) : (
          // Member view: grouped by category, expand-in-place — matches web's MyHRPolicies.jsx
          (() => {
            const grouped: Record<string, any[]> = {};
            for (const p of filtered) {
              const cat = p.category || 'General';
              (grouped[cat] ??= []).push(p);
            }
            const categories = Object.keys(grouped);
            return categories.map((cat, ci) => {
              const color = categoryColor(cat, ci);
              return (
                <View key={cat} style={{ marginBottom: 20 }}>
                  <View style={s.catHeadRow}>
                    <View style={[s.catDot, { backgroundColor: color }]} />
                    <Text style={s.groupHead}>{cat.toUpperCase()}</Text>
                    <Text style={[s.catCount, { backgroundColor: color + '18', color }]}>{grouped[cat].length}</Text>
                  </View>
                  {grouped[cat].map((p) => {
                    const isOpen = expandedId === p.id;
                    return (
                      <View key={p.id} style={[s.memberCard, { borderLeftColor: color }]}>
                        <TouchableOpacity style={s.memberCardHead} onPress={() => setExpandedId(isOpen ? null : p.id)}>
                          <View style={{ flex: 1 }}>
                            <Text style={s.cardTitle}>{p.title}</Text>
                            <Text style={s.cardMeta}>
                              v{p.version}{p.effective_from ? ` · effective ${new Date(p.effective_from).toLocaleDateString()}` : ''}
                            </Text>
                          </View>
                          <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={16} color={colors.gray400} />
                        </TouchableOpacity>
                        {isOpen && (
                          <View style={s.memberCardBody}>
                            {p.body_md ? (
                              <PostContentView content={p.body_md} colors={colors} textStyle={s.paragraph} />
                            ) : (
                              <Text style={s.emptyBodyText}>No content available.</Text>
                            )}
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              );
            });
          })()
        )}
      </ScrollView>

      <Modal visible={createOpen} transparent animationType="fade" onRequestClose={() => setCreateOpen(false)}>
        {/* KeyboardAvoidingView so the auto-focused title input (keyboard opens
            immediately) isn't covered — Modal content sits outside the
            screen's own keyboard handling (separate native root). */}
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.modalBackdrop}>
          <View style={s.modalCard}>
            <View style={s.modalHead}>
              <Text style={s.modalTitle}>New Policy</Text>
              <TouchableOpacity onPress={() => setCreateOpen(false)}>
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <TextInput
              style={s.modalInput}
              placeholder="e.g. Remote Work Policy"
              placeholderTextColor={colors.gray400}
              value={newTitle}
              onChangeText={setNewTitle}
              maxLength={200}
              autoFocus
            />
            <Text style={s.modalHint}>You'll add the body, category, status and effective date on the next page.</Text>
            <TouchableOpacity style={[s.modalSubmit, (!newTitle.trim() || creating) && { opacity: 0.6 }]} onPress={createPolicy} disabled={!newTitle.trim() || creating}>
              {creating ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.modalSubmitText}>Continue to editor</Text>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const STATUS_COLOR: Record<string, string> = { active: '#059669', draft: '#d97706', retired: '#6b7280' };

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
    title: { flex: 1, fontSize: 18, fontFamily: SERIF, color: c.textPrimary, fontWeight: '700', textAlign: 'center' },
    searchBar: {
      flexDirection: 'row', alignItems: 'center', gap: 8, margin: 16, marginBottom: 8,
      backgroundColor: c.gray100, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9,
      borderWidth: 1, borderColor: c.border,
    },
    searchInput: { flex: 1, fontSize: 14, color: c.textPrimary },
    body: { paddingHorizontal: 16, paddingBottom: 32 },
    empty: { alignItems: 'center', gap: 12, paddingTop: 60 },
    emptyText: { fontSize: 14, color: c.textMuted },
    groupHead: { fontSize: 11, fontWeight: '700', color: c.textMuted, letterSpacing: 1, marginBottom: 8 },
    card: {
      backgroundColor: c.surface, borderRadius: 12, borderWidth: 1, borderColor: c.border,
      padding: 14, marginBottom: 10,
    },
    cardTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
    statusPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
    statusPillText: { fontSize: 10, fontWeight: '700', textTransform: 'capitalize' },
    cardCategory: { fontSize: 11, color: c.textMuted },
    cardTitle: { fontSize: 15, fontWeight: '700', color: c.textPrimary },
    cardMeta: { fontSize: 11, color: c.textMuted, marginTop: 3 },

    catHeadRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
    catDot: { width: 8, height: 8, borderRadius: 4 },
    catCount: { fontSize: 10, fontWeight: '700', paddingHorizontal: 7, paddingVertical: 1, borderRadius: 10, marginLeft: -4 },
    memberCard: {
      backgroundColor: c.surface, borderRadius: 10, borderWidth: 1, borderColor: c.border,
      borderLeftWidth: 3, marginBottom: 8, overflow: 'hidden',
    },
    memberCardHead: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
    memberCardBody: { borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.background, padding: 16 },
    paragraph: { fontSize: 14, color: c.textPrimary, lineHeight: 21 },
    emptyBodyText: { fontSize: 13, color: c.textMuted, fontStyle: 'italic' },

    modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
    modalCard: { backgroundColor: c.surface, borderRadius: 16, padding: 18 },
    modalHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
    modalTitle: { fontSize: 17, fontWeight: '800', color: c.textPrimary },
    modalInput: {
      borderWidth: 1, borderColor: c.border, borderRadius: 10, padding: 12,
      fontSize: 14, color: c.textPrimary, marginBottom: 8,
    },
    modalHint: { fontSize: 12, color: c.textMuted, marginBottom: 16 },
    modalSubmit: { backgroundColor: c.primary, borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
    modalSubmitText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  });
}
