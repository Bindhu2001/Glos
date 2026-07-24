import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Platform, Alert, ActivityIndicator, TextInput,
  KeyboardAvoidingView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useTheme } from '../../contexts/ThemeContext';
import { useApi } from '../../hooks/useApi';
import { AppColors } from '../../utils/colors';
import { AdminStackParamList } from '../../navigation/types';

type RouteT = RouteProp<AdminStackParamList, 'PolicyDetail'>;

type Policy = {
  id: number;
  title: string;
  category?: string;
  status?: string;
  body_md?: string;
  effective_from?: string;
  version?: number;
  updated_at?: string;
};

const STATUS_OPTIONS: { value: string; label: string; color: string }[] = [
  { value: 'draft', label: 'Draft', color: '#d97706' },
  { value: 'active', label: 'Active', color: '#059669' },
  { value: 'retired', label: 'Retired', color: '#6b7280' },
];

export default function PolicyDetailScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteT>();
  const { policyId, appId } = route.params;
  const { colors } = useTheme();
  const api = useApi();
  const insets = useSafeAreaInsets();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [policy, setPolicy] = useState<Policy | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Editable buffers
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [body, setBody] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [version, setVersion] = useState('1');
  const [status, setStatus] = useState('draft');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.policies.get(appId, policyId);
      const p: Policy = res.data;
      setPolicy(p);
      setTitle(p.title ?? '');
      setCategory(p.category ?? '');
      setBody(p.body_md ?? '');
      setEffectiveFrom(p.effective_from ?? '');
      setVersion(String(p.version ?? 1));
      setStatus(p.status ?? 'draft');
    } catch {
      Alert.alert('Error', 'Failed to load policy.');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  }, [appId, policyId]);

  useEffect(() => { load(); }, [load]);

  const dirty = policy && (
    title !== (policy.title ?? '') ||
    category !== (policy.category ?? '') ||
    body !== (policy.body_md ?? '') ||
    effectiveFrom !== (policy.effective_from ?? '') ||
    version !== String(policy.version ?? 1) ||
    status !== (policy.status ?? 'draft')
  );

  const save = async () => {
    if (!title.trim()) {
      Alert.alert('Required', 'Title is required.');
      return;
    }
    setSaving(true);
    try {
      const res = await api.policies.update(appId, policyId, {
        title: title.trim(),
        category: category.trim() || null,
        body_md: body || null,
        effective_from: effectiveFrom || null,
        version: Number(version) || 1,
        status,
      });
      setPolicy(res.data);
    } catch {
      Alert.alert('Error', 'Failed to save changes.');
    } finally {
      setSaving(false);
    }
  };

  const quickStatus = async (newStatus: string) => {
    try {
      const res = await api.policies.update(appId, policyId, { status: newStatus });
      setPolicy(res.data);
      setStatus(newStatus);
    } catch {
      Alert.alert('Error', 'Failed to update status.');
    }
  };

  const deletePolicy = () => {
    Alert.alert(
      `Delete "${policy?.title}"?`,
      'The policy will be permanently removed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.policies.remove(appId, policyId);
              navigation.goBack();
            } catch {
              Alert.alert('Error', 'Failed to delete policy.');
            }
          },
        },
      ],
    );
  };

  const formatDate = (iso?: string) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  const currentStatusObj = STATUS_OPTIONS.find((o) => o.value === status);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior="padding"
    >
      <View style={[s.container, { paddingTop: insets.top }]}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
            <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={s.headerTitle} numberOfLines={1}>Policy</Text>
          {dirty ? (
            <TouchableOpacity style={s.saveBtn} onPress={save} disabled={saving}>
              {saving
                ? <ActivityIndicator size="small" color={colors.primary} />
                : <Text style={s.saveBtnText}>Save</Text>
              }
            </TouchableOpacity>
          ) : (
            <View style={{ width: 52 }} />
          )}
        </View>

        {loading ? (
          <ActivityIndicator style={{ flex: 1 }} color={colors.primary} />
        ) : (
          <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

            {/* Status badge row */}
            <View style={s.statusRow}>
              {currentStatusObj && (
                <View style={[s.statusBadge, {
                  backgroundColor: currentStatusObj.color + '18',
                  borderColor: currentStatusObj.color + '44',
                }]}>
                  <Text style={[s.statusBadgeText, { color: currentStatusObj.color }]}>
                    {currentStatusObj.label}
                  </Text>
                </View>
              )}
              {policy?.updated_at && (
                <Text style={s.metaMuted}>Updated {formatDate(policy.updated_at)}</Text>
              )}
            </View>

            {/* Title */}
            <View style={s.field}>
              <Text style={s.fieldLabel}>Title *</Text>
              <TextInput
                style={s.input}
                value={title}
                onChangeText={setTitle}
                placeholder="Policy title"
                placeholderTextColor={colors.textMuted}
                maxLength={200}
              />
            </View>

            {/* Meta row */}
            <View style={s.metaGrid}>
              <View style={[s.field, { flex: 1 }]}>
                <Text style={s.fieldLabel}>Status</Text>
                <View style={s.segmented}>
                  {STATUS_OPTIONS.map((o) => (
                    <TouchableOpacity
                      key={o.value}
                      style={[s.segBtn, status === o.value && { backgroundColor: o.color + '22', borderColor: o.color }]}
                      onPress={() => setStatus(o.value)}
                    >
                      <Text style={[s.segBtnText, status === o.value && { color: o.color, fontWeight: '700' }]}>
                        {o.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>

            <View style={s.metaGrid}>
              <View style={[s.field, { flex: 1 }]}>
                <Text style={s.fieldLabel}>Category</Text>
                <TextInput
                  style={s.input}
                  value={category}
                  onChangeText={setCategory}
                  placeholder="e.g. leave, conduct"
                  placeholderTextColor={colors.textMuted}
                  maxLength={100}
                />
              </View>
              <View style={[s.field, { flex: 1 }]}>
                <Text style={s.fieldLabel}>Version</Text>
                <TextInput
                  style={s.input}
                  value={version}
                  onChangeText={setVersion}
                  keyboardType="number-pad"
                  placeholder="1"
                  placeholderTextColor={colors.textMuted}
                  maxLength={4}
                />
              </View>
            </View>

            <View style={s.field}>
              <Text style={s.fieldLabel}>Effective From (YYYY-MM-DD)</Text>
              <TextInput
                style={s.input}
                value={effectiveFrom}
                onChangeText={setEffectiveFrom}
                placeholder="2025-01-01"
                placeholderTextColor={colors.textMuted}
                keyboardType="numbers-and-punctuation"
                maxLength={10}
              />
            </View>

            {/* Body */}
            <View style={s.field}>
              <Text style={s.fieldLabel}>Policy Text · {body.length.toLocaleString()} chars</Text>
              <TextInput
                style={s.bodyInput}
                value={body}
                onChangeText={setBody}
                placeholder={'# Section heading\n\nWrite your policy content here. Markdown supported.\n\n## Sub-section\n- Bullet points work too'}
                placeholderTextColor={colors.textMuted}
                multiline
                maxLength={200000}
                textAlignVertical="top"
              />
            </View>

            {/* Quick status workflow */}
            <View style={s.workflowRow}>
              <Text style={s.workflowLabel}>Quick actions:</Text>
              {STATUS_OPTIONS.filter((o) => o.value !== status).map((o) => (
                <TouchableOpacity key={o.value} style={s.workflowBtn} onPress={() => quickStatus(o.value)}>
                  <Text style={[s.workflowBtnText, { color: o.color }]}>Mark {o.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Danger zone */}
            <TouchableOpacity style={s.deleteBtn} onPress={deletePolicy}>
              <Ionicons name="trash-outline" size={16} color="#ef4444" />
              <Text style={s.deleteBtnText}>Delete this policy</Text>
            </TouchableOpacity>
          </ScrollView>
        )}
      </View>
    </KeyboardAvoidingView>
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
    headerTitle: { fontSize: 18, fontFamily: SERIF, color: c.textPrimary, fontWeight: '700', flex: 1, textAlign: 'center' },
    saveBtn: { paddingHorizontal: 14, paddingVertical: 6, backgroundColor: c.primary, borderRadius: 8 },
    saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
    body: { padding: 20, gap: 16 },
    statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
    statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
    statusBadgeText: { fontSize: 12, fontWeight: '700' },
    metaMuted: { fontSize: 12, color: c.textMuted },
    field: { gap: 6 },
    fieldLabel: { fontSize: 12, fontWeight: '700', color: c.textSecondary, letterSpacing: 0.4 },
    input: {
      backgroundColor: c.surface, borderRadius: 12, borderWidth: 1, borderColor: c.border,
      paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: c.textPrimary,
    },
    bodyInput: {
      backgroundColor: c.surface, borderRadius: 12, borderWidth: 1, borderColor: c.border,
      paddingHorizontal: 14, paddingVertical: 12, fontSize: 13, color: c.textPrimary,
      minHeight: 240, lineHeight: 20,
    },
    metaGrid: { flexDirection: 'row', gap: 12 },
    segmented: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
    segBtn: {
      paddingHorizontal: 12, paddingVertical: 7,
      borderRadius: 8, borderWidth: 1, borderColor: c.border,
      backgroundColor: c.surface,
    },
    segBtnText: { fontSize: 13, color: c.textSecondary },
    workflowRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
    workflowLabel: { fontSize: 12, color: c.textMuted },
    workflowBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: c.border },
    workflowBtnText: { fontSize: 12, fontWeight: '600' },
    deleteBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      paddingVertical: 12, justifyContent: 'center',
      borderRadius: 12, borderWidth: 1, borderColor: '#ef444444',
      backgroundColor: '#ef444408',
    },
    deleteBtnText: { fontSize: 14, color: '#ef4444', fontWeight: '600' },
  });
}
