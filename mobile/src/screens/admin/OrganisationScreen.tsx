import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  Platform, Alert, ActivityIndicator, KeyboardAvoidingView, ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../contexts/ThemeContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useApi } from '../../hooks/useApi';
import { AppColors } from '../../utils/colors';

type OrgData = {
  name?: string;
  industry?: string;
  size?: string;
  mission?: string;
  vision?: string;
  values?: string;
  website?: string;
  address?: string;
};

const FIELDS: { key: keyof OrgData; label: string; multiline?: boolean; placeholder: string }[] = [
  { key: 'name', label: 'Organisation Name', placeholder: 'e.g. Acme Corp' },
  { key: 'industry', label: 'Industry', placeholder: 'e.g. Technology' },
  { key: 'size', label: 'Company Size', placeholder: 'e.g. 50–200' },
  { key: 'website', label: 'Website', placeholder: 'https://yourcompany.com' },
  { key: 'address', label: 'Address', placeholder: 'City, Country', multiline: true },
  { key: 'mission', label: 'Mission Statement', placeholder: 'What is your mission?', multiline: true },
  { key: 'vision', label: 'Vision', placeholder: 'What is your vision?', multiline: true },
  { key: 'values', label: 'Values', placeholder: 'Core values (e.g. Integrity, Innovation)', multiline: true },
];

export default function OrganisationScreen() {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const { workspace } = useWorkspace();
  const api = useApi();
  const insets = useSafeAreaInsets();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [org, setOrg] = useState<OrgData>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    if (!workspace?.id) return;
    setLoading(true);
    try {
      const res = await api.organisation.get(workspace.id);
      setOrg(res.data ?? {});
    } catch {
      Alert.alert('Error', 'Failed to load organisation details.');
    } finally {
      setLoading(false);
    }
  }, [workspace?.id]);

  useEffect(() => { load(); }, [load]);

  const update = (key: keyof OrgData, val: string) => {
    setOrg((prev) => ({ ...prev, [key]: val }));
    setDirty(true);
  };

  const save = async () => {
    if (!workspace?.id) return;
    setSaving(true);
    try {
      await api.organisation.update(workspace.id, org);
      setDirty(false);
      Alert.alert('Saved', 'Organisation details updated.');
    } catch {
      Alert.alert('Error', 'Failed to save changes.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[s.container, { paddingTop: insets.top }]}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
            <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={s.title}>Organisation</Text>
          {dirty ? (
            <TouchableOpacity style={s.saveBtn} onPress={save} disabled={saving}>
              {saving ? <ActivityIndicator size="small" color={colors.primary} /> : <Text style={s.saveBtnText}>Save</Text>}
            </TouchableOpacity>
          ) : (
            <View style={{ width: 52 }} />
          )}
        </View>

        {loading ? (
          <ActivityIndicator style={{ flex: 1 }} color={colors.primary} />
        ) : (
          <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
            {FIELDS.map((f) => (
              <View key={f.key} style={s.field}>
                <Text style={s.label}>{f.label}</Text>
                <TextInput
                  style={[s.input, f.multiline && s.inputMulti]}
                  placeholder={f.placeholder}
                  placeholderTextColor={colors.textMuted}
                  value={org[f.key] ?? ''}
                  onChangeText={(v) => update(f.key, v)}
                  multiline={f.multiline}
                  autoCapitalize={f.key === 'website' ? 'none' : 'sentences'}
                />
              </View>
            ))}
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
    title: { fontSize: 20, fontFamily: SERIF, color: c.textPrimary, fontWeight: '700' },
    saveBtn: { paddingHorizontal: 14, paddingVertical: 6, backgroundColor: c.primary, borderRadius: 8 },
    saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
    body: { padding: 20, gap: 16 },
    field: { gap: 6 },
    label: { fontSize: 12, fontWeight: '700', color: c.textSecondary, letterSpacing: 0.4 },
    input: {
      backgroundColor: c.surface, borderRadius: 12, borderWidth: 1, borderColor: c.border,
      paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: c.textPrimary,
    },
    inputMulti: { minHeight: 80, textAlignVertical: 'top' },
  });
}
