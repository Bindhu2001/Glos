import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, KeyboardAvoidingView, TextInput, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useTheme } from '../../contexts/ThemeContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useApi } from '../../hooks/useApi';
import { AppColors } from '../../utils/colors';
import { MoreStackParamList } from '../../navigation/types';
import { apiErrorMessage } from '../../utils/apiError';
import { showAlert } from '../../components/common/AlertModal';
import ScreenHeader from '../../components/common/ScreenHeader';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import DatePickerField from '../../components/common/DatePickerField';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import LoadError from '../../components/common/LoadError';

type Rt = RouteProp<MoreStackParamList, 'CreateEditService'>;

function ListEditor({ items, onChange, placeholder, colors, styles }: {
  items: string[]; onChange: (v: string[]) => void; placeholder: string; colors: AppColors; styles: ReturnType<typeof makeStyles>;
}) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const val = draft.trim();
    if (!val) return;
    onChange([...items, val]);
    setDraft('');
  };
  return (
    <View>
      {items.map((item, i) => (
        <View key={i} style={styles.clauseRow}>
          <Text style={styles.clauseText} numberOfLines={2}>{item}</Text>
          <TouchableOpacity onPress={() => onChange(items.filter((_, idx) => idx !== i))}>
            <Ionicons name="close-circle" size={18} color={colors.gray400} />
          </TouchableOpacity>
        </View>
      ))}
      <View style={styles.clauseAddRow}>
        <TextInput
          style={styles.clauseInput}
          placeholder={placeholder}
          placeholderTextColor={colors.gray400}
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={add}
        />
        <TouchableOpacity onPress={add}>
          <Ionicons name="add-circle" size={22} color={colors.primary} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function CreateEditServiceScreen() {
  const navigation = useNavigation<any>();
  const { params } = useRoute<Rt>();
  const serviceId = params?.serviceId;
  const isEdit = serviceId != null;
  const { colors } = useTheme();
  const { workspace } = useWorkspace();
  const api = useApi();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();

  const [dataLoading, setDataLoading] = useState(isEdit);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);

  const [serviceName, setServiceName] = useState('');
  const [serviceCode, setServiceCode] = useState('');
  const [description, setDescription] = useState('');
  const [introductionDate, setIntroductionDate] = useState('');
  const [processingDays, setProcessingDays] = useState('1');
  const [isActive, setIsActive] = useState(true);
  const [majorActivities, setMajorActivities] = useState<string[]>([]);
  const [deliverables, setDeliverables] = useState<string[]>([]);

  const load = useCallback(async () => {
    if (!workspace?.id || !serviceId) return;
    setDataLoading(true);
    setLoadError(false);
    try {
      const res = await api.contracts.getService(workspace.id, serviceId);
      const svc = res.data;
      setServiceName(svc.service_name ?? '');
      setServiceCode(svc.service_code ?? '');
      setDescription(svc.description ?? '');
      setIntroductionDate(svc.introduction_date ? String(svc.introduction_date).slice(0, 10) : '');
      setProcessingDays(svc.normal_processing_days != null ? String(svc.normal_processing_days) : '1');
      setIsActive(svc.is_active !== false);
      setMajorActivities(Array.isArray(svc.major_activities) ? svc.major_activities : []);
      setDeliverables(Array.isArray(svc.deliverables) ? svc.deliverables : []);
    } catch (err) {
      showAlert('Could not load service', apiErrorMessage(err));
      setLoadError(true);
    } finally {
      setDataLoading(false);
    }
  }, [workspace?.id, serviceId, api]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (!workspace?.id) return;
    if (!serviceName.trim()) return showAlert('Validation', 'Service name is required.');
    if (!serviceCode.trim()) return showAlert('Validation', 'Service code is required.');

    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        service_name: serviceName.trim(),
        service_code: serviceCode.trim(),
        description: description.trim() || null,
        introduction_date: introductionDate || null,
        normal_processing_days: Number(processingDays) || 1,
        major_activities: majorActivities,
        deliverables,
        is_active: isActive,
      };
      if (isEdit) {
        await api.contracts.updateService(workspace.id, serviceId!, body);
      } else {
        await api.contracts.createService(workspace.id, body);
      }
      navigation.goBack();
    } catch (err) {
      showAlert(isEdit ? 'Could not update service' : 'Could not create service', apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (!workspace?.id || !serviceId) return;
    showAlert(
      'Delete Service',
      `Are you sure you want to delete "${serviceName}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive', onPress: async () => {
            try {
              await api.contracts.deleteService(workspace.id, serviceId);
              navigation.goBack();
            } catch (err) {
              showAlert('Could not delete service', apiErrorMessage(err));
            }
          },
        },
      ],
    );
  };

  if (dataLoading) return <LoadingSpinner />;
  if (loadError) return <LoadError onRetry={load} />;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[s.container, { paddingTop: insets.top }]}>
        <ScreenHeader
          title={isEdit ? 'Edit Service' : 'New Service'}
          showBack
          right={
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              {isEdit && (
                <TouchableOpacity onPress={handleDelete}>
                  <Ionicons name="trash-outline" size={20} color={colors.danger} />
                </TouchableOpacity>
              )}
              <Button label="Save" onPress={handleSave} loading={saving} style={s.saveBtn} />
            </View>
          }
        />
        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          <Input label="Service Name *" value={serviceName} onChangeText={setServiceName} placeholder="e.g. GST Filing" maxLength={100} />
          <Input label="Service Code *" value={serviceCode} onChangeText={setServiceCode} placeholder="e.g. GST-FILING" autoCapitalize="characters" maxLength={20} />

          <Text style={s.fieldLabel}>Status</Text>
          <View style={s.chipRow}>
            {[{ label: 'Active', val: true }, { label: 'Inactive', val: false }].map((opt) => (
              <TouchableOpacity key={opt.label} style={[s.chip, isActive === opt.val && s.chipActive]} onPress={() => setIsActive(opt.val)}>
                <Text style={[s.chipText, isActive === opt.val && s.chipTextActive]}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Input label="Normal Processing Days" value={processingDays} onChangeText={setProcessingDays} placeholder="1" keyboardType="numeric" />
          <DatePickerField label="Introduction Date" value={introductionDate} onChange={setIntroductionDate} />
          <Input label="Description" value={description} onChangeText={setDescription} placeholder="Brief description..." multiline numberOfLines={3} maxLength={1000} />

          <Text style={s.fieldLabel}>Major Activities</Text>
          <ListEditor items={majorActivities} onChange={setMajorActivities} placeholder="Add activity..." colors={colors} styles={s} />

          <Text style={[s.fieldLabel, { marginTop: 8 }]}>Deliverables</Text>
          <ListEditor items={deliverables} onChange={setDeliverables} placeholder="Add deliverable..." colors={colors} styles={s} />
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

function makeStyles(c: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    content: { padding: 16, paddingBottom: 40 },
    saveBtn: { paddingVertical: 8, paddingHorizontal: 16 },
    fieldLabel: { fontSize: 13, fontWeight: '600', color: c.gray700, marginBottom: 8, marginTop: 4 },
    chipRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
    chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: c.border, backgroundColor: c.surface },
    chipActive: { backgroundColor: c.primaryLight, borderColor: c.primary },
    chipText: { fontSize: 13, fontWeight: '600', color: c.gray500 },
    chipTextActive: { color: c.primary },
    clauseRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.gray50, borderRadius: 8, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: c.border },
    clauseText: { flex: 1, fontSize: 13, color: c.textPrimary },
    clauseAddRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 20 },
    clauseInput: { flex: 1, backgroundColor: c.gray50, borderRadius: 8, borderWidth: 1, borderColor: c.border, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, color: c.textPrimary },
  });
}
