import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  Platform, Alert, ActivityIndicator, KeyboardAvoidingView, ScrollView, Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '../../contexts/ThemeContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useApi } from '../../hooks/useApi';
import { AppColors } from '../../utils/colors';

type OrgData = {
  name?: string;
  legal_name?: string;
  registration_no?: string;
  industry?: string;
  website?: string;
  founded_on?: string;
  hq_address?: string;
  description?: string;
  vision?: string;
  mission?: string;
  core_values?: string; // JSON array
  target_customer_segments?: string;
  major_products_services?: string;
  quality_policy?: string;
  logo_url?: string;
};

function parseCoreValues(raw?: string): string[] {
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

export default function OrganisationScreen() {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const { workspace } = useWorkspace();
  const api = useApi();
  const insets = useSafeAreaInsets();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [org, setOrg] = useState<OrgData>({});
  const [coreValues, setCoreValues] = useState<string[]>([]);
  const [newValue, setNewValue] = useState('');
  const [addingValue, setAddingValue] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    if (!workspace?.id) return;
    setLoading(true);
    try {
      const res = await api.organisation.get(workspace.id);
      const data: OrgData = res.data ?? {};
      setOrg(data);
      setCoreValues(parseCoreValues(data.core_values));
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

  const addCoreValue = () => {
    const v = newValue.trim();
    if (!v) return;
    const updated = [...coreValues, v];
    setCoreValues(updated);
    setOrg((prev) => ({ ...prev, core_values: JSON.stringify(updated) }));
    setNewValue('');
    setAddingValue(false);
    setDirty(true);
  };

  const removeCoreValue = (idx: number) => {
    const updated = coreValues.filter((_, i) => i !== idx);
    setCoreValues(updated);
    setOrg((prev) => ({ ...prev, core_values: JSON.stringify(updated) }));
    setDirty(true);
  };

  const save = async () => {
    if (!workspace?.id) return;
    if (!org.name?.trim()) {
      Alert.alert('Required', 'Organisation name is required.');
      return;
    }
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

  const pickLogo = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Allow access to your photo library to upload a logo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    setUploadingLogo(true);
    try {
      const mime = asset.mimeType ?? 'image/jpeg';
      const res = await api.organisation.uploadLogo(workspace!.id, asset.uri, mime);
      setOrg((prev) => ({ ...prev, logo_url: res.data?.logo_url }));
    } catch {
      Alert.alert('Error', 'Failed to upload logo.');
    } finally {
      setUploadingLogo(false);
    }
  };

  const removeLogo = () => {
    Alert.alert('Remove Logo', 'Remove the organisation logo?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: async () => {
          if (!workspace?.id) return;
          setUploadingLogo(true);
          try {
            await api.organisation.deleteLogo(workspace.id);
            setOrg((prev) => ({ ...prev, logo_url: undefined }));
          } catch {
            Alert.alert('Error', 'Failed to remove logo.');
          } finally {
            setUploadingLogo(false);
          }
        },
      },
    ]);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <View style={[s.container, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
            <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={s.title}>Organisation</Text>
          {dirty ? (
            <TouchableOpacity style={s.saveBtn} onPress={save} disabled={saving}>
              {saving
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={s.saveBtnText}>Save</Text>}
            </TouchableOpacity>
          ) : (
            <View style={{ width: 52 }} />
          )}
        </View>

        {loading ? (
          <ActivityIndicator style={{ flex: 1 }} color={colors.primary} />
        ) : (
          <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">

            {/* Logo */}
            <View style={s.logoSection}>
              <Text style={s.sectionLabel}>Logo</Text>
              <View style={s.logoRow}>
                <TouchableOpacity onPress={pickLogo} disabled={uploadingLogo} style={s.logoBox}>
                  {uploadingLogo ? (
                    <ActivityIndicator color={colors.primary} />
                  ) : org.logo_url ? (
                    <Image source={{ uri: org.logo_url }} style={s.logoImage} resizeMode="contain" />
                  ) : (
                    <View style={s.logoPlaceholder}>
                      <Ionicons name="image-outline" size={28} color={colors.textMuted} />
                      <Text style={s.logoHint}>Tap to upload</Text>
                    </View>
                  )}
                </TouchableOpacity>
                {org.logo_url ? (
                  <View style={s.logoActions}>
                    <TouchableOpacity style={s.logoActionBtn} onPress={pickLogo} disabled={uploadingLogo}>
                      <Ionicons name="pencil-outline" size={15} color={colors.primary} />
                      <Text style={[s.logoActionText, { color: colors.primary }]}>Change</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.logoActionBtn} onPress={removeLogo} disabled={uploadingLogo}>
                      <Ionicons name="trash-outline" size={15} color={colors.danger} />
                      <Text style={[s.logoActionText, { color: colors.danger }]}>Remove</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
              </View>
            </View>

            {/* Basic Information */}
            <SectionHeader label="Basic Information" s={s} />

            <Field label="Organisation Name *" s={s}>
              <TextInput
                style={s.input}
                placeholder="e.g. Acme Corp"
                placeholderTextColor={colors.textMuted}
                value={org.name ?? ''}
                onChangeText={(v) => update('name', v)}
              />
            </Field>

            <Field label="Legal Name" s={s}>
              <TextInput
                style={s.input}
                placeholder="Legal registered name"
                placeholderTextColor={colors.textMuted}
                value={org.legal_name ?? ''}
                onChangeText={(v) => update('legal_name', v)}
              />
            </Field>

            <Field label="Registration Number" s={s}>
              <TextInput
                style={s.input}
                placeholder="e.g. CIN / GST number"
                placeholderTextColor={colors.textMuted}
                value={org.registration_no ?? ''}
                onChangeText={(v) => update('registration_no', v)}
                autoCapitalize="characters"
              />
            </Field>

            <Field label="Industry" s={s}>
              <TextInput
                style={s.input}
                placeholder="e.g. Technology"
                placeholderTextColor={colors.textMuted}
                value={org.industry ?? ''}
                onChangeText={(v) => update('industry', v)}
              />
            </Field>

            <Field label="Website" s={s}>
              <TextInput
                style={s.input}
                placeholder="https://yourcompany.com"
                placeholderTextColor={colors.textMuted}
                value={org.website ?? ''}
                onChangeText={(v) => update('website', v)}
                autoCapitalize="none"
                keyboardType="url"
              />
            </Field>

            <Field label="Founded On" s={s}>
              <TextInput
                style={s.input}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.textMuted}
                value={org.founded_on ?? ''}
                onChangeText={(v) => update('founded_on', v)}
                keyboardType="numbers-and-punctuation"
              />
            </Field>

            <Field label="HQ Address" s={s}>
              <TextInput
                style={[s.input, s.inputMulti]}
                placeholder="City, State, Country"
                placeholderTextColor={colors.textMuted}
                value={org.hq_address ?? ''}
                onChangeText={(v) => update('hq_address', v)}
                multiline
              />
            </Field>

            <Field label="About" s={s}>
              <TextInput
                style={[s.input, s.inputMulti]}
                placeholder="Describe your organisation"
                placeholderTextColor={colors.textMuted}
                value={org.description ?? ''}
                onChangeText={(v) => update('description', v)}
                multiline
              />
            </Field>

            {/* Strategy */}
            <SectionHeader label="Strategy" s={s} />

            <Field label="Vision" s={s}>
              <TextInput
                style={[s.input, s.inputMulti]}
                placeholder="Where we are going — the aspirational future state"
                placeholderTextColor={colors.textMuted}
                value={org.vision ?? ''}
                onChangeText={(v) => update('vision', v)}
                multiline
              />
            </Field>

            <Field label="Mission" s={s}>
              <TextInput
                style={[s.input, s.inputMulti]}
                placeholder="Why we exist — the purpose that drives us"
                placeholderTextColor={colors.textMuted}
                value={org.mission ?? ''}
                onChangeText={(v) => update('mission', v)}
                multiline
              />
            </Field>

            {/* Core Values */}
            <Field label="Core Values" s={s}>
              {coreValues.length === 0 && !addingValue ? (
                <Text style={s.emptyHint}>No core values yet.</Text>
              ) : null}
              {coreValues.map((val, idx) => (
                <View key={idx} style={s.valueChip}>
                  <Text style={s.valueChipText}>{val}</Text>
                  <TouchableOpacity onPress={() => removeCoreValue(idx)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="close-circle" size={16} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>
              ))}
              {addingValue ? (
                <View style={s.addValueRow}>
                  <TextInput
                    style={[s.input, { flex: 1 }]}
                    placeholder="e.g. Integrity"
                    placeholderTextColor={colors.textMuted}
                    value={newValue}
                    onChangeText={setNewValue}
                    autoFocus
                    returnKeyType="done"
                    onSubmitEditing={addCoreValue}
                  />
                  <TouchableOpacity onPress={addCoreValue} style={s.addValueConfirm}>
                    <Ionicons name="checkmark" size={18} color="#fff" />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => { setAddingValue(false); setNewValue(''); }} style={s.addValueCancel}>
                    <Ionicons name="close" size={18} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity onPress={() => setAddingValue(true)} style={s.addValueTrigger}>
                  <Ionicons name="add" size={16} color={colors.primary} />
                  <Text style={s.addValueTriggerText}>Add value</Text>
                </TouchableOpacity>
              )}
            </Field>

            {/* Business */}
            <SectionHeader label="Business" s={s} />

            <Field label="Target Customer Segments" s={s}>
              <TextInput
                style={[s.input, s.inputMulti]}
                placeholder="Describe the customer groups or market segments this organisation serves"
                placeholderTextColor={colors.textMuted}
                value={org.target_customer_segments ?? ''}
                onChangeText={(v) => update('target_customer_segments', v)}
                multiline
              />
            </Field>

            <Field label="Major Products or Services" s={s}>
              <TextInput
                style={[s.input, s.inputMulti]}
                placeholder="List the main products or services offered"
                placeholderTextColor={colors.textMuted}
                value={org.major_products_services ?? ''}
                onChangeText={(v) => update('major_products_services', v)}
                multiline
              />
            </Field>

            <Field label="Quality Policy" s={s}>
              <TextInput
                style={[s.input, s.inputMulti]}
                placeholder="State the organisation's commitment to quality"
                placeholderTextColor={colors.textMuted}
                value={org.quality_policy ?? ''}
                onChangeText={(v) => update('quality_policy', v)}
                multiline
              />
            </Field>

          </ScrollView>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

function SectionHeader({ label, s }: { label: string; s: ReturnType<typeof makeStyles> }) {
  return <Text style={s.sectionHeader}>{label}</Text>;
}

function Field({ label, children, s }: { label: string; children: React.ReactNode; s: ReturnType<typeof makeStyles> }) {
  return (
    <View style={s.field}>
      <Text style={s.fieldLabel}>{label}</Text>
      {children}
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
    saveBtn: { paddingHorizontal: 14, paddingVertical: 6, backgroundColor: c.primary, borderRadius: 8 },
    saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
    body: { padding: 16, paddingBottom: 60, gap: 0 },

    sectionHeader: {
      fontSize: 13, fontWeight: '700', color: c.textSecondary,
      textTransform: 'uppercase', letterSpacing: 0.8,
      marginTop: 24, marginBottom: 12,
    },
    field: { marginBottom: 14 },
    fieldLabel: { fontSize: 12, fontWeight: '600', color: c.textSecondary, marginBottom: 6 },
    input: {
      backgroundColor: c.surface, borderRadius: 10, borderWidth: 1, borderColor: c.border,
      paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: c.textPrimary,
    },
    inputMulti: { minHeight: 80, textAlignVertical: 'top' },

    // Logo
    sectionLabel: { fontSize: 12, fontWeight: '600', color: c.textSecondary, marginBottom: 8 },
    logoSection: { marginBottom: 8 },
    logoRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
    logoBox: {
      width: 80, height: 80, borderRadius: 14,
      backgroundColor: c.surface, borderWidth: 1, borderColor: c.border,
      borderStyle: 'dashed', overflow: 'hidden',
      alignItems: 'center', justifyContent: 'center',
    },
    logoImage: { width: 80, height: 80 },
    logoPlaceholder: { alignItems: 'center', gap: 4 },
    logoHint: { fontSize: 10, color: c.textMuted },
    logoActions: { gap: 10 },
    logoActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    logoActionText: { fontSize: 13, fontWeight: '600' },

    // Core Values
    valueChip: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      backgroundColor: c.primaryLight, borderRadius: 8,
      paddingHorizontal: 12, paddingVertical: 8, marginBottom: 6,
    },
    valueChipText: { fontSize: 13, color: c.primary, fontWeight: '600', flex: 1 },
    emptyHint: { fontSize: 13, color: c.textMuted, marginBottom: 8 },
    addValueRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
    addValueConfirm: {
      width: 36, height: 36, borderRadius: 8, backgroundColor: c.primary,
      alignItems: 'center', justifyContent: 'center',
    },
    addValueCancel: {
      width: 36, height: 36, borderRadius: 8, backgroundColor: c.border,
      alignItems: 'center', justifyContent: 'center',
    },
    addValueTrigger: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4 },
    addValueTriggerText: { fontSize: 13, color: c.primary, fontWeight: '600' },
  });
}
