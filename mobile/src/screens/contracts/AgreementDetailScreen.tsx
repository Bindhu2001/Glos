import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, ActivityIndicator, Modal, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../contexts/ThemeContext';
import { useApi } from '../../hooks/useApi';
import { useHasTeam } from '../../contexts/HasTeamContext';
import { AppColors } from '../../utils/colors';
import { MoreStackParamList } from '../../navigation/types';
import { apiErrorMessage } from '../../utils/apiError';
import { showAlert } from '../../components/common/AlertModal';
import LoadError from '../../components/common/LoadError';
import Button from '../../components/common/Button';
import MemberPickerModal, { PickOption } from '../../components/common/MemberPickerModal';

type Nav = NativeStackNavigationProp<MoreStackParamList, 'AgreementDetail'>;
type Rt = RouteProp<MoreStackParamList, 'AgreementDetail'>;

export default function AgreementDetailScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Rt>();
  const { colors } = useTheme();
  const api = useApi();
  const { isAdmin } = useHasTeam();
  const insets = useSafeAreaInsets();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [agreement, setAgreement] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [meId, setMeId] = useState<number | null>(null);

  const [svcModal, setSvcModal] = useState(false);
  const [svcOptions, setSvcOptions] = useState<PickOption[]>([]);
  const [svcId, setSvcId] = useState<number | null>(null);
  const [svcPickerOpen, setSvcPickerOpen] = useState(false);
  const [baseCharge, setBaseCharge] = useState('');
  const [savingSvc, setSavingSvc] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [res, meRes] = await Promise.all([
        api.contracts.getAgreement(params.appId, params.agreementId),
        api.me.getProfile(),
      ]);
      setAgreement(res.data);
      setMeId(meRes.data?.id ?? meRes.data?.user?.id ?? null);
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not load this agreement.'));
    } finally {
      setLoading(false);
    }
  }, [params.appId, params.agreementId]);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const canEdit = isAdmin || (meId != null && agreement?.created_by_user_id === meId);

  const deleteAgreement = () => {
    showAlert(
      'Delete Agreement',
      `Are you sure you want to delete "${agreement.agreement_number ?? `Agreement #${agreement.id}`}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive', onPress: async () => {
            try {
              await api.contracts.deleteAgreement(params.appId, params.agreementId);
              navigation.goBack();
            } catch (err) {
              showAlert('Could not delete agreement', apiErrorMessage(err));
            }
          },
        },
      ],
    );
  };

  const openAddService = async () => {
    try {
      const res = await api.contracts.listServices(params.appId, {});
      const rows: any[] = res.data ?? [];
      setSvcOptions(rows.map((r) => ({ id: r.id, name: r.service_name })));
      setSvcModal(true);
    } catch (err) {
      showAlert('Could not load services', apiErrorMessage(err));
    }
  };

  const addService = async () => {
    if (!svcId) return showAlert('Validation', 'Select a service.');
    setSavingSvc(true);
    try {
      await api.contracts.addAgreementService(params.appId, params.agreementId, {
        service_id: svcId,
        pricing: baseCharge.trim() ? { base_charge: Number(baseCharge) } : undefined,
      });
      setSvcModal(false); setSvcId(null); setBaseCharge('');
      await load();
    } catch (err) {
      showAlert('Could not add service', apiErrorMessage(err));
    } finally {
      setSavingSvc(false);
    }
  };

  if (loading) return <View style={{ flex: 1, backgroundColor: colors.background }}><ActivityIndicator style={{ flex: 1 }} color={colors.primary} /></View>;
  if (error) return <LoadError message={error} onRetry={load} />;
  if (!agreement) return null;

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.title} numberOfLines={1}>{agreement.agreement_number ?? `Agreement #${agreement.id}`}</Text>
        {canEdit ? (
          <View style={s.headerActions}>
            <TouchableOpacity
              style={s.backBtn}
              onPress={() => navigation.navigate('CreateEditAgreement', { appId: params.appId, agreementId: params.agreementId })}
            >
              <Ionicons name="create-outline" size={20} color={colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity style={s.backBtn} onPress={deleteAgreement}>
              <Ionicons name="trash-outline" size={20} color={colors.danger} />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ width: 36 }} />
        )}
      </View>

      <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
        {agreement.client?.client_name ? <Text style={s.client}>{agreement.client.client_name}</Text> : null}
        <View style={s.metaCard}>
          <View style={s.metaRow}>
            <Text style={s.metaLabel}>Status</Text>
            <Text style={s.metaVal}>{agreement.status ?? '—'}</Text>
          </View>
          {agreement.rm_user ? (
            <View style={s.metaRow}>
              <Text style={s.metaLabel}>Relationship Manager</Text>
              <Text style={s.metaVal}>{agreement.rm_user.name}</Text>
            </View>
          ) : null}
          {agreement.start_date ? (
            <View style={s.metaRow}>
              <Text style={s.metaLabel}>Start Date</Text>
              <Text style={s.metaVal}>{new Date(agreement.start_date).toLocaleDateString()}</Text>
            </View>
          ) : null}
          {agreement.end_date ? (
            <View style={s.metaRow}>
              <Text style={s.metaLabel}>End Date</Text>
              <Text style={s.metaVal}>{new Date(agreement.end_date).toLocaleDateString()}</Text>
            </View>
          ) : null}
        </View>

        <View style={s.sectionHeadRow}>
          <Text style={s.sectionHead}>SERVICES</Text>
          {canEdit && (
            <TouchableOpacity onPress={openAddService}>
              <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
            </TouchableOpacity>
          )}
        </View>
        {(agreement.services ?? []).length === 0 ? (
          <Text style={s.emptyText}>No services attached</Text>
        ) : (
          agreement.services.map((svc: any) => (
            <View key={svc.id} style={s.svcRow}>
              <Ionicons name="briefcase-outline" size={18} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={s.svcTitle}>{svc.service_name}</Text>
                {svc.base_charge ? <Text style={s.svcSub}>Base charge ₹{svc.base_charge}</Text> : null}
              </View>
            </View>
          ))
        )}

        {(agreement.allocated_users ?? []).length > 0 && (
          <>
            <Text style={s.sectionHead}>ALLOCATED TEAM</Text>
            {agreement.allocated_users.map((u: any) => (
              <Text key={u.id} style={s.teamName}>{u.name}</Text>
            ))}
          </>
        )}
      </ScrollView>

      <Modal visible={svcModal} transparent animationType="fade" onRequestClose={() => setSvcModal(false)}>
        <View style={s.modalBackdrop}>
          <View style={s.modalCard}>
            <View style={s.modalHead}>
              <Text style={s.modalTitle}>Add Service</Text>
              <TouchableOpacity onPress={() => setSvcModal(false)}>
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={s.svcPickRow} onPress={() => setSvcPickerOpen(true)}>
              <Ionicons name="briefcase-outline" size={16} color={colors.gray400} />
              <Text style={svcId ? s.svcPickVal : s.svcPickPlaceholder}>
                {svcId ? svcOptions.find((o) => o.id === svcId)?.name ?? 'Selected' : 'Tap to select a service'}
              </Text>
            </TouchableOpacity>
            <TextInput
              style={s.svcChargeInput}
              placeholder="Base charge (optional)"
              placeholderTextColor={colors.gray400}
              value={baseCharge}
              onChangeText={setBaseCharge}
              keyboardType="decimal-pad"
            />
            <Button label="Add Service" onPress={addService} loading={savingSvc} fullWidth />
          </View>
        </View>
      </Modal>
      <MemberPickerModal
        visible={svcPickerOpen}
        title="Select Service"
        options={svcOptions}
        selected={svcId ? [svcId] : []}
        onChange={(ids) => setSvcId(ids[0] ?? null)}
        onClose={() => setSvcPickerOpen(false)}
      />
    </View>
  );
}

function makeStyles(c: AppColors) {
  const SERIF = Platform.OS === 'ios' ? 'Georgia' : 'serif';
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 16, paddingVertical: 12, gap: 8,
      backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border,
    },
    backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    headerActions: { flexDirection: 'row' },
    title: { flex: 1, fontSize: 18, fontFamily: SERIF, color: c.textPrimary, fontWeight: '700', textAlign: 'center' },
    body: { padding: 16, paddingBottom: 32 },
    client: { fontSize: 15, color: c.primary, fontWeight: '700', marginBottom: 12 },
    metaCard: {
      backgroundColor: c.surface, borderRadius: 14, borderWidth: 1, borderColor: c.border,
      padding: 14, marginBottom: 16, gap: 8,
    },
    metaRow: { flexDirection: 'row', justifyContent: 'space-between' },
    metaLabel: { fontSize: 12, color: c.textMuted },
    metaVal: { fontSize: 12, fontWeight: '700', color: c.textPrimary, textTransform: 'capitalize' },
    sectionHead: { fontSize: 11, fontWeight: '700', color: c.textMuted, letterSpacing: 1, marginTop: 8, marginBottom: 10 },
    sectionHeadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
    modalCard: { backgroundColor: c.surface, borderRadius: 16, padding: 18 },
    modalHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
    modalTitle: { fontSize: 17, fontWeight: '800', color: c.textPrimary },
    svcPickRow: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      backgroundColor: c.gray50, borderRadius: 10, padding: 12,
      borderWidth: 1, borderColor: c.border, marginBottom: 12,
    },
    svcPickVal: { fontSize: 14, color: c.textPrimary, fontWeight: '500', flex: 1 },
    svcPickPlaceholder: { fontSize: 14, color: c.gray400, flex: 1 },
    svcChargeInput: {
      backgroundColor: c.gray50, borderRadius: 10, borderWidth: 1, borderColor: c.border,
      paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: c.textPrimary, marginBottom: 14,
    },
    emptyText: { fontSize: 13, color: c.textMuted, marginBottom: 12 },
    svcRow: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      backgroundColor: c.surface, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: c.border, marginBottom: 10,
    },
    svcTitle: { fontSize: 13, fontWeight: '700', color: c.textPrimary },
    svcSub: { fontSize: 11, color: c.textMuted, marginTop: 2 },
    teamName: { fontSize: 13, color: c.textSecondary, marginBottom: 6 },
  });
}
