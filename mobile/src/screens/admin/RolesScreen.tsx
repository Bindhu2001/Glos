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
  code?: string;
  department?: string;
  department_id?: number;
  level?: number;
  reports_to_role_id?: number;
  reports_to?: string;
  employment_type?: string;
  max_yearly_ctc?: number;
  description?: string;
  responsibilities?: string;
  requirements?: string;
};

type Department = { id: number; name: string };

const EMPLOYMENT_TYPES = [
  { value: 'full_time', label: 'Full-time' },
  { value: 'part_time', label: 'Part-time' },
  { value: 'contractor', label: 'Contractor' },
  { value: 'intern', label: 'Intern' },
  { value: 'consultant', label: 'Consultant' },
];

const EMPTY_FORM = {
  title: '',
  code: '',
  department_id: null as number | null,
  level: '',
  reports_to_role_id: null as number | null,
  employment_type: 'full_time',
  max_yearly_ctc: '',
};

export default function RolesScreen() {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const { workspace } = useWorkspace();
  const api = useApi();
  const insets = useSafeAreaInsets();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [roles, setRoles] = useState<Role[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [creating, setCreating] = useState(false);

  const [pickerOpen, setPickerOpen] = useState<'dept' | 'reports_to' | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (!workspace?.id) return;
    if (!isRefresh) setLoading(true);
    try {
      const [rolesRes, deptsRes] = await Promise.all([
        api.roles.list(workspace.id),
        api.departments.list(workspace.id),
      ]);
      setRoles(rolesRes.data?.items ?? rolesRes.data ?? []);
      setDepartments(deptsRes.data?.items ?? deptsRes.data ?? []);
    } catch {
      Alert.alert('Error', 'Failed to load roles.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [workspace?.id]);

  useEffect(() => { load(); }, [load]);

  const toggle = (id: number) => setExpanded((prev) => (prev === id ? null : id));

  const openCreate = () => {
    setForm({ ...EMPTY_FORM });
    setCreateOpen(true);
  };

  const createRole = async () => {
    if (!form.title.trim()) {
      Alert.alert('Required', 'Please enter a role title.');
      return;
    }
    if (!workspace?.id) return;
    setCreating(true);
    try {
      const payload: Record<string, unknown> = {
        title: form.title.trim(),
        employment_type: form.employment_type,
      };
      if (form.code.trim()) payload.code = form.code.trim();
      if (form.department_id != null) payload.department_id = form.department_id;
      if (form.level.trim() !== '') payload.level = parseInt(form.level, 10);
      if (form.reports_to_role_id != null) payload.reports_to_role_id = form.reports_to_role_id;
      if (form.max_yearly_ctc.trim() !== '') payload.max_yearly_ctc = parseFloat(form.max_yearly_ctc);

      await api.roles.create(workspace.id, payload);
      setCreateOpen(false);
      await load();
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error ?? 'Failed to create role.');
    } finally {
      setCreating(false);
    }
  };

  const typeLabel = (val: string) => EMPLOYMENT_TYPES.find((t) => t.value === val)?.label ?? val;

  const selectedDeptName = form.department_id
    ? departments.find((d) => d.id === form.department_id)?.name ?? ''
    : '';

  const selectedReportsTo = form.reports_to_role_id
    ? roles.find((r) => r.id === form.reports_to_role_id)?.title ?? ''
    : '';

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.title}>Roles</Text>
        <TouchableOpacity style={s.addBtn} onPress={openCreate}>
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
              <TouchableOpacity style={s.emptyBtn} onPress={openCreate}>
                <Text style={s.emptyBtnText}>+ Add Role</Text>
              </TouchableOpacity>
            </View>
          )}
          {roles.map((r) => {
            const open = expanded === r.id;
            return (
              <TouchableOpacity key={r.id} style={s.card} onPress={() => toggle(r.id)} activeOpacity={0.7}>
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
                  <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.gray400} />
                </View>
                {open && (
                  <View style={s.cardBody}>
                    {r.code ? <View style={s.detailBlock}><Text style={s.detailLabel}>Code</Text><Text style={s.detailText}>{r.code}</Text></View> : null}
                    {r.level != null ? <View style={s.detailBlock}><Text style={s.detailLabel}>Level</Text><Text style={s.detailText}>{r.level}</Text></View> : null}
                    {r.reports_to ? <View style={s.detailBlock}><Text style={s.detailLabel}>Reports To</Text><Text style={s.detailText}>{r.reports_to}</Text></View> : null}
                    {r.max_yearly_ctc ? <View style={s.detailBlock}><Text style={s.detailLabel}>Max Yearly CTC</Text><Text style={s.detailText}>₹{r.max_yearly_ctc.toLocaleString()}</Text></View> : null}
                    {r.description ? <View style={s.detailBlock}><Text style={s.detailLabel}>Description</Text><Text style={s.detailText}>{r.description}</Text></View> : null}
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* ── Create Role: full-screen form ── */}
      <Modal visible={createOpen} animationType="slide" statusBarTranslucent>
        <KeyboardAvoidingView
          style={{ flex: 1, backgroundColor: colors.background }}
          behavior="padding"
        >
          <View style={[s.formHeader, { paddingTop: insets.top + 8 }]}>
            <TouchableOpacity onPress={() => setCreateOpen(false)} style={s.backBtn}>
              <Ionicons name="close" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
            <Text style={s.formHeaderTitle}>Add Role</Text>
            <TouchableOpacity
              style={[s.saveHeaderBtn, creating && { opacity: 0.5 }]}
              onPress={createRole}
              disabled={creating}
            >
              {creating
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={s.saveHeaderBtnText}>Create</Text>}
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={s.formBody} keyboardShouldPersistTaps="handled">
            <View style={s.formField}>
              <Text style={s.formLabel}>Title <Text style={s.required}>*</Text></Text>
              <TextInput
                style={s.formInput}
                placeholder="e.g. Software Engineer"
                placeholderTextColor={colors.textMuted}
                value={form.title}
                onChangeText={(v) => setForm((f) => ({ ...f, title: v }))}
                autoFocus
              />
            </View>

            <View style={s.formField}>
              <Text style={s.formLabel}>Code</Text>
              <TextInput
                style={s.formInput}
                placeholder="e.g. SWE-01"
                placeholderTextColor={colors.textMuted}
                value={form.code}
                onChangeText={(v) => setForm((f) => ({ ...f, code: v }))}
                maxLength={50}
                autoCapitalize="characters"
              />
            </View>

            <View style={s.formField}>
              <Text style={s.formLabel}>Department</Text>
              <TouchableOpacity style={s.formPicker} onPress={() => setPickerOpen('dept')}>
                <Text style={selectedDeptName ? s.formPickerValue : s.formPickerPlaceholder}>
                  {selectedDeptName || 'Select department'}
                </Text>
                <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <View style={s.formField}>
              <Text style={s.formLabel}>Level <Text style={s.hint}>(0 – 20)</Text></Text>
              <TextInput
                style={s.formInput}
                placeholder="e.g. 3"
                placeholderTextColor={colors.textMuted}
                value={form.level}
                onChangeText={(v) => setForm((f) => ({ ...f, level: v.replace(/[^0-9]/g, '') }))}
                keyboardType="number-pad"
              />
            </View>

            <View style={s.formField}>
              <Text style={s.formLabel}>Reports To</Text>
              <TouchableOpacity style={s.formPicker} onPress={() => setPickerOpen('reports_to')}>
                <Text style={selectedReportsTo ? s.formPickerValue : s.formPickerPlaceholder}>
                  {selectedReportsTo || 'Select role'}
                </Text>
                <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <View style={s.formField}>
              <Text style={s.formLabel}>Employment Type</Text>
              <View style={s.typeGrid}>
                {EMPLOYMENT_TYPES.map((t) => (
                  <TouchableOpacity
                    key={t.value}
                    style={[s.typeChip, form.employment_type === t.value && s.typeChipActive]}
                    onPress={() => setForm((f) => ({ ...f, employment_type: t.value }))}
                  >
                    <Text style={[s.typeChipText, form.employment_type === t.value && s.typeChipTextActive]}>
                      {t.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={s.formField}>
              <Text style={s.formLabel}>Max Yearly CTC</Text>
              <TextInput
                style={s.formInput}
                placeholder="e.g. 1200000"
                placeholderTextColor={colors.textMuted}
                value={form.max_yearly_ctc}
                onChangeText={(v) => setForm((f) => ({ ...f, max_yearly_ctc: v.replace(/[^0-9.]/g, '') }))}
                keyboardType="decimal-pad"
              />
            </View>

            <View style={{ height: 40 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Department Picker ── */}
      <Modal visible={pickerOpen === 'dept'} animationType="slide" transparent statusBarTranslucent>
        <View style={s.pickerOverlay}>
          <View style={[s.pickerSheet, { paddingBottom: insets.bottom + 8 }]}>
            <View style={s.pickerHeader}>
              <Text style={s.pickerTitle}>Select Department</Text>
              <TouchableOpacity onPress={() => setPickerOpen(null)}>
                <Ionicons name="close" size={20} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled">
              <TouchableOpacity
                style={s.pickerRow}
                onPress={() => { setForm((f) => ({ ...f, department_id: null })); setPickerOpen(null); }}
              >
                <Text style={[s.pickerRowText, !form.department_id && s.pickerRowSelected]}>None</Text>
                {!form.department_id && <Ionicons name="checkmark" size={16} color={colors.primary} />}
              </TouchableOpacity>
              {departments.map((d) => (
                <TouchableOpacity
                  key={d.id}
                  style={s.pickerRow}
                  onPress={() => { setForm((f) => ({ ...f, department_id: d.id })); setPickerOpen(null); }}
                >
                  <Text style={[s.pickerRowText, form.department_id === d.id && s.pickerRowSelected]}>{d.name}</Text>
                  {form.department_id === d.id && <Ionicons name="checkmark" size={16} color={colors.primary} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Reports To Picker ── */}
      <Modal visible={pickerOpen === 'reports_to'} animationType="slide" transparent statusBarTranslucent>
        <View style={s.pickerOverlay}>
          <View style={[s.pickerSheet, { paddingBottom: insets.bottom + 8 }]}>
            <View style={s.pickerHeader}>
              <Text style={s.pickerTitle}>Reports To</Text>
              <TouchableOpacity onPress={() => setPickerOpen(null)}>
                <Ionicons name="close" size={20} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled">
              <TouchableOpacity
                style={s.pickerRow}
                onPress={() => { setForm((f) => ({ ...f, reports_to_role_id: null })); setPickerOpen(null); }}
              >
                <Text style={[s.pickerRowText, !form.reports_to_role_id && s.pickerRowSelected]}>None</Text>
                {!form.reports_to_role_id && <Ionicons name="checkmark" size={16} color={colors.primary} />}
              </TouchableOpacity>
              {roles.map((r) => (
                <TouchableOpacity
                  key={r.id}
                  style={s.pickerRow}
                  onPress={() => { setForm((f) => ({ ...f, reports_to_role_id: r.id })); setPickerOpen(null); }}
                >
                  <Text style={[s.pickerRowText, form.reports_to_role_id === r.id && s.pickerRowSelected]}>{r.title}</Text>
                  {form.reports_to_role_id === r.id && <Ionicons name="checkmark" size={16} color={colors.primary} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
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
    emptyBtn: { paddingHorizontal: 20, paddingVertical: 10, backgroundColor: c.primary, borderRadius: 10 },
    emptyBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
    card: { backgroundColor: c.surface, borderRadius: 14, borderWidth: 1, borderColor: c.border, overflow: 'hidden' },
    cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
    iconBox: { width: 38, height: 38, borderRadius: 10, backgroundColor: c.primary + '14', alignItems: 'center', justifyContent: 'center' },
    cardMain: { flex: 1 },
    roleName: { fontSize: 14, fontWeight: '700', color: c.textPrimary },
    metaRow: { flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: 2, flexWrap: 'wrap' },
    dept: { fontSize: 12, color: c.textSecondary },
    typeBadge: { paddingHorizontal: 7, paddingVertical: 2, backgroundColor: c.primary + '14', borderRadius: 5 },
    typeText: { fontSize: 11, color: c.primary, fontWeight: '600' },
    cardBody: { borderTopWidth: 1, borderTopColor: c.border, padding: 14, gap: 12 },
    detailBlock: { gap: 4 },
    detailLabel: { fontSize: 11, fontWeight: '700', color: c.textMuted, letterSpacing: 0.5 },
    detailText: { fontSize: 13, color: c.textSecondary, lineHeight: 20 },
    // ── Full-screen create form ──
    formHeader: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 16, paddingBottom: 12,
      borderBottomWidth: 1, borderBottomColor: c.border, backgroundColor: c.surface,
    },
    formHeaderTitle: { fontSize: 18, fontWeight: '700', color: c.textPrimary, fontFamily: SERIF },
    saveHeaderBtn: { paddingHorizontal: 16, paddingVertical: 8, backgroundColor: c.primary, borderRadius: 10 },
    saveHeaderBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
    formBody: { padding: 20, gap: 18 },
    formField: { gap: 6 },
    formLabel: { fontSize: 12, fontWeight: '700', color: c.textSecondary, letterSpacing: 0.4 },
    required: { color: c.danger },
    hint: { fontWeight: '400', color: c.textMuted },
    formInput: {
      backgroundColor: c.surface, borderRadius: 12, borderWidth: 1, borderColor: c.border,
      paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: c.textPrimary,
    },
    formPicker: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      backgroundColor: c.surface, borderRadius: 12, borderWidth: 1, borderColor: c.border,
      paddingHorizontal: 14, paddingVertical: 13,
    },
    formPickerValue: { fontSize: 15, color: c.textPrimary },
    formPickerPlaceholder: { fontSize: 15, color: c.textMuted },
    typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    typeChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface },
    typeChipActive: { backgroundColor: c.primary + '18', borderColor: c.primary },
    typeChipText: { fontSize: 13, color: c.textSecondary },
    typeChipTextActive: { color: c.primary, fontWeight: '700' },
    // ── Bottom-sheet pickers ──
    pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
    pickerSheet: { backgroundColor: c.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '60%' },
    pickerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: c.border },
    pickerTitle: { fontSize: 16, fontWeight: '700', color: c.textPrimary },
    pickerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: c.border },
    pickerRowText: { fontSize: 15, color: c.textPrimary },
    pickerRowSelected: { color: c.primary, fontWeight: '700' },
  });
}
