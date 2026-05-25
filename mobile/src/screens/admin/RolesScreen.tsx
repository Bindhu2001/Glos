import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Platform, Alert, ActivityIndicator, RefreshControl,
  TextInput, Modal, KeyboardAvoidingView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../contexts/ThemeContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useApi } from '../../hooks/useApi';
import { AppColors } from '../../utils/colors';

type Role = {
  id: number;
  title: string;
  department?: string;
  employment_type?: string;
  description?: string;
  responsibilities?: string;
  requirements?: string;
};

const EMPLOYMENT_TYPES = [
  { value: 'full_time', label: 'Full-time' },
  { value: 'part_time', label: 'Part-time' },
  { value: 'contractor', label: 'Contractor' },
  { value: 'intern', label: 'Intern' },
  { value: 'consultant', label: 'Consultant' },
];

export default function RolesScreen() {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const { workspace } = useWorkspace();
  const api = useApi();
  const insets = useSafeAreaInsets();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newType, setNewType] = useState('full_time');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (!workspace?.id) return;
    if (!isRefresh) setLoading(true);
    try {
      const res = await api.roles.list(workspace.id);
      setRoles(res.data?.items ?? res.data ?? []);
    } catch {
      Alert.alert('Error', 'Failed to load roles.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [workspace?.id]);

  useEffect(() => { load(); }, [load]);

  const toggle = (id: number) => setExpanded((prev) => (prev === id ? null : id));

  const createRole = async () => {
    if (!newTitle.trim()) {
      Alert.alert('Required', 'Please enter a role title.');
      return;
    }
    if (!workspace?.id) return;
    setCreating(true);
    try {
      await api.roles.create(workspace.id, { title: newTitle.trim(), employment_type: newType });
      setCreateOpen(false);
      setNewTitle('');
      setNewType('full_time');
      await load();
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error ?? 'Failed to create role.');
    } finally {
      setCreating(false);
    }
  };

  const typeLabel = (val: string) => EMPLOYMENT_TYPES.find((t) => t.value === val)?.label ?? val;

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.title}>Roles</Text>
        <TouchableOpacity style={s.addBtn} onPress={() => { setNewTitle(''); setNewType('full_time'); setCreateOpen(true); }}>
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
          <Text style={s.count}>{roles.length} role{roles.length !== 1 ? 's' : ''}</Text>
          {roles.length === 0 && (
            <View style={s.empty}>
              <Ionicons name="briefcase-outline" size={40} color={colors.gray400} />
              <Text style={s.emptyText}>No roles yet</Text>
              <TouchableOpacity style={s.emptyBtn} onPress={() => { setNewTitle(''); setNewType('full_time'); setCreateOpen(true); }}>
                <Text style={s.emptyBtnText}>+ Add Role</Text>
              </TouchableOpacity>
            </View>
          )}
          {roles.map((r) => {
            const open = expanded === r.id;
            return (
              <TouchableOpacity
                key={r.id}
                style={s.card}
                onPress={() => toggle(r.id)}
                activeOpacity={0.7}
              >
                <View style={s.cardTop}>
                  <View style={s.iconBox}>
                    <Ionicons name="briefcase-outline" size={18} color={colors.primary} />
                  </View>
                  <View style={s.cardMain}>
                    <Text style={s.roleName}>{r.title}</Text>
                    <View style={s.metaRow}>
                      {r.department ? <Text style={s.dept}>{r.department}</Text> : null}
                      {r.employment_type ? (
                        <View style={s.typeBadge}>
                          <Text style={s.typeText}>{typeLabel(r.employment_type)}</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                  <Ionicons
                    name={open ? 'chevron-up' : 'chevron-down'}
                    size={16}
                    color={colors.gray400}
                  />
                </View>

                {open && (
                  <View style={s.cardBody}>
                    {r.description ? (
                      <View style={s.detailBlock}>
                        <Text style={s.detailLabel}>Description</Text>
                        <Text style={s.detailText}>{r.description}</Text>
                      </View>
                    ) : null}
                    {r.responsibilities ? (
                      <View style={s.detailBlock}>
                        <Text style={s.detailLabel}>Responsibilities</Text>
                        <Text style={s.detailText}>{r.responsibilities}</Text>
                      </View>
                    ) : null}
                    {r.requirements ? (
                      <View style={s.detailBlock}>
                        <Text style={s.detailLabel}>Requirements</Text>
                        <Text style={s.detailText}>{r.requirements}</Text>
                      </View>
                    ) : null}
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* Create role modal */}
      <Modal visible={createOpen} transparent animationType="fade">
        <KeyboardAvoidingView
          style={s.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={s.modalBox}>
            <Text style={s.modalTitle}>Add Role</Text>
            <TextInput
              style={s.modalInput}
              placeholder="Role title (e.g. Software Engineer)"
              placeholderTextColor={colors.textMuted}
              value={newTitle}
              onChangeText={setNewTitle}
              autoFocus
              maxLength={150}
            />
            <Text style={s.fieldLabel}>Employment Type</Text>
            <View style={s.typeGrid}>
              {EMPLOYMENT_TYPES.map((t) => (
                <TouchableOpacity
                  key={t.value}
                  style={[s.typeChip, newType === t.value && s.typeChipActive]}
                  onPress={() => setNewType(t.value)}
                >
                  <Text style={[s.typeChipText, newType === t.value && s.typeChipTextActive]}>
                    {t.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
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
                onPress={createRole}
                disabled={creating}
              >
                {creating
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={s.modalBtnConfirmText}>Create</Text>
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
    count: { fontSize: 12, color: c.textMuted, fontWeight: '600', marginBottom: 4 },
    empty: { alignItems: 'center', gap: 12, paddingTop: 60 },
    emptyText: { fontSize: 14, color: c.textMuted },
    emptyBtn: {
      paddingHorizontal: 20, paddingVertical: 10,
      backgroundColor: c.primary, borderRadius: 10,
    },
    emptyBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
    card: {
      backgroundColor: c.surface, borderRadius: 14,
      borderWidth: 1, borderColor: c.border, overflow: 'hidden',
    },
    cardTop: {
      flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14,
    },
    iconBox: {
      width: 38, height: 38, borderRadius: 10,
      backgroundColor: c.primary + '14',
      alignItems: 'center', justifyContent: 'center',
    },
    cardMain: { flex: 1 },
    roleName: { fontSize: 14, fontWeight: '700', color: c.textPrimary },
    metaRow: { flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: 2, flexWrap: 'wrap' },
    dept: { fontSize: 12, color: c.textSecondary },
    typeBadge: {
      paddingHorizontal: 7, paddingVertical: 2,
      backgroundColor: c.primary + '14', borderRadius: 5,
    },
    typeText: { fontSize: 11, color: c.primary, fontWeight: '600' },
    cardBody: {
      borderTopWidth: 1, borderTopColor: c.border,
      padding: 14, gap: 12,
    },
    detailBlock: { gap: 4 },
    detailLabel: { fontSize: 11, fontWeight: '700', color: c.textMuted, letterSpacing: 0.5 },
    detailText: { fontSize: 13, color: c.textSecondary, lineHeight: 20 },
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
    modalInput: {
      backgroundColor: c.background, borderRadius: 12, borderWidth: 1, borderColor: c.border,
      paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: c.textPrimary,
    },
    fieldLabel: { fontSize: 12, fontWeight: '700', color: c.textSecondary, letterSpacing: 0.4 },
    typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    typeChip: {
      paddingHorizontal: 12, paddingVertical: 7,
      borderRadius: 8, borderWidth: 1, borderColor: c.border,
      backgroundColor: c.background,
    },
    typeChipActive: { backgroundColor: c.primary + '18', borderColor: c.primary },
    typeChipText: { fontSize: 13, color: c.textSecondary },
    typeChipTextActive: { color: c.primary, fontWeight: '700' },
    modalActions: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end' },
    modalBtn: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10 },
    modalBtnCancel: { backgroundColor: c.background, borderWidth: 1, borderColor: c.border },
    modalBtnCancelText: { color: c.textPrimary, fontWeight: '600' },
    modalBtnConfirm: { backgroundColor: c.primary },
    modalBtnConfirmText: { color: '#fff', fontWeight: '700' },
  });
}
