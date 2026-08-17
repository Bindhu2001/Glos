import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useTheme } from '../../contexts/ThemeContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useApi } from '../../hooks/useApi';
import { AppColors } from '../../utils/colors';
import { AdminStackParamList } from '../../navigation/types';
import { apiErrorMessage } from '../../utils/apiError';
import { showAlert } from '../../components/common/AlertModal';
import ScreenHeader from '../../components/common/ScreenHeader';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import DatePickerField from '../../components/common/DatePickerField';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import LoadError from '../../components/common/LoadError';

type Rt = RouteProp<AdminStackParamList, 'CreateEditClient'>;

const STATUSES = ['active', 'inactive'] as const;

export default function CreateEditClientScreen() {
  const navigation = useNavigation<any>();
  const { params } = useRoute<Rt>();
  const clientId = params?.clientId;
  const isEdit = clientId != null;
  const { colors } = useTheme();
  const { workspace } = useWorkspace();
  const api = useApi();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();

  const [dataLoading, setDataLoading] = useState(isEdit);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);

  const [clientName, setClientName] = useState('');
  const [clientCode, setClientCode] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [mobile, setMobile] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [gstNumber, setGstNumber] = useState('');
  const [panNumber, setPanNumber] = useState('');
  const [industry, setIndustry] = useState('');
  const [numEmployees, setNumEmployees] = useState('');
  const [startDate, setStartDate] = useState('');
  const [status, setStatus] = useState<typeof STATUSES[number]>('active');

  const load = useCallback(async () => {
    if (!workspace?.id || !clientId) return;
    setDataLoading(true);
    setLoadError(false);
    try {
      const res = await api.contracts.getClient(workspace.id, clientId);
      const c = res.data;
      setClientName(c.client_name ?? '');
      setClientCode(c.client_code ?? '');
      setContactPerson(c.contact_person ?? '');
      setMobile(c.mobile ?? '');
      setEmail(c.email ?? '');
      setAddress(c.address ?? '');
      setGstNumber(c.gst_number ?? '');
      setPanNumber(c.pan_number ?? '');
      setIndustry(c.industry ?? '');
      setNumEmployees(c.number_of_employees != null ? String(c.number_of_employees) : '');
      setStartDate(c.start_date ? String(c.start_date).slice(0, 10) : '');
      setStatus((c.status as any) ?? 'active');
    } catch (err) {
      showAlert('Could not load client', apiErrorMessage(err));
      setLoadError(true);
    } finally {
      setDataLoading(false);
    }
  }, [workspace?.id, clientId, api]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (!workspace?.id) return;
    if (!clientName.trim()) return showAlert('Validation', 'Client name is required.');
    if (!clientCode.trim()) return showAlert('Validation', 'Client code is required.');

    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        client_name: clientName.trim(),
        client_code: clientCode.trim(),
        contact_person: contactPerson.trim() || undefined,
        mobile: mobile.trim() || undefined,
        email: email.trim() || undefined,
        address: address.trim() || undefined,
        gst_number: gstNumber.trim() || undefined,
        pan_number: panNumber.trim() || undefined,
        industry: industry.trim() || undefined,
        number_of_employees: numEmployees.trim() ? Number(numEmployees) : undefined,
        start_date: startDate || undefined,
        status,
      };
      if (isEdit) {
        await api.contracts.updateClient(workspace.id, clientId!, body);
      } else {
        await api.contracts.createClient(workspace.id, body);
      }
      navigation.goBack();
    } catch (err) {
      showAlert(isEdit ? 'Could not update client' : 'Could not create client', apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (!workspace?.id || !clientId) return;
    showAlert(
      'Delete Client',
      `Are you sure you want to delete "${clientName}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive', onPress: async () => {
            try {
              await api.contracts.deleteClient(workspace.id, clientId);
              navigation.goBack();
            } catch (err) {
              showAlert('Could not delete client', apiErrorMessage(err));
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
          title={isEdit ? 'Edit Client' : 'New Client'}
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
          <Input label="Client Name *" value={clientName} onChangeText={setClientName} placeholder="e.g. Acme Corp" />
          <Input label="Client Code *" value={clientCode} onChangeText={setClientCode} placeholder="e.g. ACME01" autoCapitalize="characters" />

          <Text style={s.fieldLabel}>Status</Text>
          <View style={s.chipRow}>
            {STATUSES.map((st) => (
              <TouchableOpacity key={st} style={[s.chip, status === st && s.chipActive]} onPress={() => setStatus(st)}>
                <Text style={[s.chipText, status === st && s.chipTextActive]}>{st}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Input label="Contact Person" value={contactPerson} onChangeText={setContactPerson} placeholder="Primary contact name" />
          <Input label="Mobile" value={mobile} onChangeText={setMobile} placeholder="Phone number" keyboardType="phone-pad" />
          <Input label="Email" value={email} onChangeText={setEmail} placeholder="Email address" keyboardType="email-address" autoCapitalize="none" />
          <Input label="Address" value={address} onChangeText={setAddress} placeholder="Optional address" multiline numberOfLines={2} />
          <Input label="Industry" value={industry} onChangeText={setIndustry} placeholder="e.g. Manufacturing" />
          <Input label="Number of Employees" value={numEmployees} onChangeText={setNumEmployees} placeholder="Optional" keyboardType="numeric" />
          <DatePickerField label="Start Date" value={startDate} onChange={setStartDate} />
          <Input label="GST Number" value={gstNumber} onChangeText={setGstNumber} placeholder="Optional" />
          <Input label="PAN Number" value={panNumber} onChangeText={setPanNumber} placeholder="Optional" />
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
    chipText: { fontSize: 13, fontWeight: '600', color: c.gray500, textTransform: 'capitalize' },
    chipTextActive: { color: c.primary },
  });
}
