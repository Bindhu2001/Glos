import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Platform, Alert, ActivityIndicator, RefreshControl,
  TextInput, Modal, KeyboardAvoidingView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../contexts/ThemeContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useApi } from '../../hooks/useApi';
import { AppColors } from '../../utils/colors';
import { AdminStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<AdminStackParamList, 'Policies'>;

type Policy = {
  id: number;
  title: string;
  category?: string;
  status?: string;
  version?: number;
  effective_from?: string;
  updated_at?: string;
};

const STATUS_COLORS: Record<string, string> = {
  active: '#059669',
  draft: '#d97706',
  retired: '#6b7280',
};

const STATUS_GROUPS = ['active', 'draft', 'retired'];

export default function PoliciesScreen() {
  const navigation = useNavigation<Nav>();
  const { colors } = useTheme();
  const { workspace } = useWorkspace();
  const api = useApi();
  const insets = useSafeAreaInsets();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (!workspace?.id) return;
    if (!isRefresh) setLoading(true);
    try {
      const res = await api.policies.list(workspace.id);
      setPolicies(res.data?.items ?? res.data ?? []);
    } catch {
      Alert.alert('Error', 'Failed to load policies.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [workspace?.id]);

  useEffect(() => { load(); }, [load]);

  const createPolicy = async () => {
    if (!newTitle.trim()) {
      Alert.alert('Required', 'Please enter a policy title.');
      return;
    }
    if (!workspace?.id) return;
    setCreating(true);
    try {
      const res = await api.policies.create(workspace.id, { title: newTitle.trim() });
      const created = res.data;
      setCreateOpen(false);
      setNewTitle('');
      await load();
      navigation.navigate('PolicyDetail', { policyId: created.id, appId: workspace.id });
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error ?? 'Failed to create policy.');
    } finally {
      setCreating(false);
    }
  };

  const formatDate = (iso?: string) => {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const grouped: Record<string, Policy[]> = {};
  for (const p of policies) {
    const k = p.status ?? 'draft';
    if (!grouped[k]) grouped[k] = [];
    grouped[k].push(p);
  }

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.title}>HR Policies</Text>
        <TouchableOpacity style={s.addBtn} onPress={() => { setNewTitle(''); setCreateOpen(true); }}>
          <Ionicons name="add" size={22} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator style={{ flex: 1 }} color={colors.primary} />
      ) : (
        <ScrollView
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} />}
        >
          {policies.length === 0 ? (
            <View style={s.empty}>
              <Ionicons name="document-text-outline" size={40} color={colors.gray400} />
              <Text style={s.emptyText}>No policies yet</Text>
              <TouchableOpacity style={s.emptyBtn} onPress={() => { setNewTitle(''); setCreateOpen(true); }}>
                <Text style={s.emptyBtnText}>+ New Policy</Text>
              </TouchableOpacity>
            </View>
          ) : (
            STATUS_GROUPS.map((group) => {
              const items = grouped[group];
              if (!items?.length) return null;
              const statusColor = STATUS_COLORS[group] ?? '#6b7280';
              return (
                <View key={group}>
                  <Text style={s.groupLabel}>{group.charAt(0).toUpperCase() + group.slice(1)} · {items.length}</Text>
                  {items.map((p) => (
                    <TouchableOpacity
                      key={p.id}
                      style={s.card}
                      onPress={() => navigation.navigate('PolicyDetail', { policyId: p.id, appId: workspace!.id })}
                      activeOpacity={0.7}
                    >
                      <View style={s.iconBox}>
                        <Ionicons name="document-text-outline" size={20} color="#7c3aed" />
                      </View>
                      <View style={s.cardBody}>
                        <Text style={s.policyTitle}>{p.title}</Text>
                        <View style={s.metaRow}>
                          {p.category ? <Text style={s.metaText}>{p.category}</Text> : null}
                          {p.version ? <Text style={s.metaText}>v{p.version}</Text> : null}
                          {p.effective_from ? <Text style={s.metaText}>{formatDate(p.effective_from)}</Text> : null}
                        </View>
                      </View>
                      <View style={[s.statusBadge, { backgroundColor: statusColor + '18', borderColor: statusColor + '44' }]}>
                        <Text style={[s.statusText, { color: statusColor }]}>
                          {group.charAt(0).toUpperCase() + group.slice(1)}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      {/* Create policy modal */}
      <Modal visible={createOpen} transparent animationType="fade">
        <KeyboardAvoidingView
          style={s.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={s.modalBox}>
            <Text style={s.modalTitle}>New Policy</Text>
            <Text style={s.modalHint}>You'll add the body and details on the next page.</Text>
            <TextInput
              style={s.modalInput}
              placeholder="e.g. Remote Work Policy"
              placeholderTextColor={colors.textMuted}
              value={newTitle}
              onChangeText={setNewTitle}
              autoFocus
              maxLength={200}
            />
            <View style={s.modalActions}>
              <TouchableOpacity
                style={[s.modalBtn, s.modalBtnCancel]}
                onPress={() => setCreateOpen(false)}
                disabled={creating}
              >
                <Text style={s.modalBtnCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.modalBtn, s.modalBtnConfirm]}
                onPress={createPolicy}
                disabled={creating}
              >
                {creating
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={s.modalBtnConfirmText}>Continue →</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
    addBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    list: { padding: 16, gap: 10 },
    groupLabel: { fontSize: 12, color: c.textMuted, fontWeight: '700', letterSpacing: 0.5, marginBottom: 6, marginTop: 4 },
    empty: { alignItems: 'center', gap: 12, paddingTop: 60 },
    emptyText: { fontSize: 14, color: c.textMuted },
    emptyBtn: {
      paddingHorizontal: 20, paddingVertical: 10,
      backgroundColor: c.primary, borderRadius: 10,
    },
    emptyBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
    card: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: c.surface, borderRadius: 14, padding: 14,
      borderWidth: 1, borderColor: c.border,
    },
    iconBox: {
      width: 40, height: 40, borderRadius: 10,
      backgroundColor: '#7c3aed14',
      alignItems: 'center', justifyContent: 'center',
    },
    cardBody: { flex: 1, gap: 4 },
    policyTitle: { fontSize: 14, fontWeight: '700', color: c.textPrimary },
    metaRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
    metaText: { fontSize: 11, color: c.textMuted },
    statusBadge: {
      paddingHorizontal: 8, paddingVertical: 3,
      borderRadius: 6, borderWidth: 1,
    },
    statusText: { fontSize: 11, fontWeight: '700' },
    // Modal
    modalOverlay: {
      flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
      alignItems: 'center', justifyContent: 'center', padding: 24,
    },
    modalBox: {
      backgroundColor: c.surface, borderRadius: 18, padding: 24,
      width: '100%', gap: 14,
    },
    modalTitle: { fontSize: 18, fontWeight: '700', color: c.textPrimary, fontFamily: SERIF },
    modalHint: { fontSize: 12, color: c.textSecondary },
    modalInput: {
      backgroundColor: c.background, borderRadius: 12, borderWidth: 1, borderColor: c.border,
      paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: c.textPrimary,
    },
    modalActions: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end' },
    modalBtn: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10 },
    modalBtnCancel: { backgroundColor: c.background, borderWidth: 1, borderColor: c.border },
    modalBtnCancelText: { color: c.textPrimary, fontWeight: '600' },
    modalBtnConfirm: { backgroundColor: c.primary },
    modalBtnConfirmText: { color: '#fff', fontWeight: '700' },
  });
}
