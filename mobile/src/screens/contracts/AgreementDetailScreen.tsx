import React, { useState, useMemo, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, ActivityIndicator } from 'react-native';
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

type Nav = NativeStackNavigationProp<MoreStackParamList, 'AgreementDetail'>;
type Rt = RouteProp<MoreStackParamList, 'AgreementDetail'>;

const STATUS_COLORS: Record<string, string> = {
  active: '#4ade80', draft: '#fbbf24', expired: '#94a3b8', terminated: '#f87171',
};

function fmtCycle(v?: string) {
  return v ? v.replace(/_/g, ' ') : '—';
}

function fmtDate(v?: string) {
  return v ? new Date(v).toLocaleDateString() : '—';
}

// One label/value pair — matches main/frontend's ViewField in the web Agreement
// view modal, so the mobile detail screen surfaces the same fields.
function ViewField({ label, value, colors, s }: { label: string; value?: React.ReactNode; colors: AppColors; s: any }) {
  return (
    <View style={s.viewField}>
      <Text style={s.viewFieldLabel}>{label}</Text>
      {typeof value === 'string' || value == null ? (
        <Text style={s.viewFieldVal}>{value || '—'}</Text>
      ) : value}
    </View>
  );
}

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

  const hasLoadedRef = useRef(false);

  const load = useCallback(async () => {
    if (!hasLoadedRef.current) setLoading(true);
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
      hasLoadedRef.current = true;
    }
  }, [params.appId, params.agreementId]);

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

  if (loading) return <View style={{ flex: 1, backgroundColor: colors.background }}><ActivityIndicator style={{ flex: 1 }} color={colors.primary} /></View>;
  if (error) return <LoadError message={error} onRetry={load} />;
  if (!agreement) return null;

  const statusColor = STATUS_COLORS[agreement.status] ?? colors.gray400;

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
        {agreement.agreement_name ? <Text style={s.agreementName}>{agreement.agreement_name}</Text> : null}
        {agreement.client?.client_name ? <Text style={s.client}>{agreement.client.client_name}</Text> : null}

        <View style={s.metaGrid}>
          <ViewField label="Status" colors={colors} s={s} value={
            <View style={[s.statusBadge, { backgroundColor: statusColor + '20', borderColor: statusColor + '55' }]}>
              <Text style={[s.statusBadgeText, { color: statusColor }]}>{agreement.status ?? '—'}</Text>
            </View>
          } />
          <ViewField label="Billing Cycle" value={fmtCycle(agreement.billing_cycle)} colors={colors} s={s} />
          <ViewField label="Start Date" value={fmtDate(agreement.start_date)} colors={colors} s={s} />
          <ViewField label="End Date" value={fmtDate(agreement.end_date)} colors={colors} s={s} />
          <ViewField
            label="Total Value"
            value={agreement.total_value != null ? `${agreement.currency ?? 'INR'} ${Number(agreement.total_value).toLocaleString()}` : undefined}
            colors={colors} s={s}
          />
          <ViewField label="Service Owner" value={agreement.service_owner?.name} colors={colors} s={s} />
          <ViewField label="Relationship Manager" value={agreement.rm_user?.name} colors={colors} s={s} />
        </View>

        {agreement.notes ? (
          <>
            <Text style={s.sectionHead}>NOTES</Text>
            <Text style={s.notesText}>{agreement.notes}</Text>
          </>
        ) : null}

        {(agreement.clauses ?? []).length > 0 && (
          <>
            <Text style={s.sectionHead}>IMPORTANT CLAUSES</Text>
            {agreement.clauses.map((c: string, i: number) => (
              <View key={i} style={s.clauseRow}>
                <Text style={s.clauseNo}>{i + 1}.</Text>
                <Text style={s.clauseText}>{c}</Text>
              </View>
            ))}
          </>
        )}

        <Text style={s.sectionHead}>SERVICES</Text>
        {(agreement.services ?? []).length === 0 ? (
          <Text style={s.emptyText}>No services attached</Text>
        ) : (
          agreement.services.map((svc: any) => (
            <View key={svc.id} style={s.svcRow}>
              <View style={s.svcRowTop}>
                <Ionicons name="briefcase-outline" size={16} color={colors.primary} />
                <Text style={s.svcTitle}>{svc.service_name}</Text>
                <Text style={s.svcPeriodicity}>{fmtCycle(svc.periodicity)}</Text>
              </View>
              <View style={s.svcRowMeta}>
                {svc.base_charge != null && <Text style={s.svcMetaText}>Base: ₹{Number(svc.base_charge || 0).toLocaleString()}</Text>}
                {svc.included_employee_count != null && <Text style={s.svcMetaText}>{svc.included_employee_count} employees</Text>}
                {svc.additional_charge_per_employee != null && Number(svc.additional_charge_per_employee) > 0 && (
                  <Text style={s.svcMetaText}>+₹{Number(svc.additional_charge_per_employee).toLocaleString()}/employee</Text>
                )}
              </View>
              {svc.sla_type && (
                <Text style={s.svcSla}>
                  SLA: {fmtCycle(svc.sla_type)}
                  {svc.sla_type === 'fixed_day' && svc.due_day ? ` — day ${svc.due_day} of month` : ''}
                  {svc.sla_type === 'relative_days' && svc.relative_days ? ` — ${svc.relative_days} days` : ''}
                  {svc.sla_type === 'specific_date' && svc.sla_month && svc.sla_date ? ` — ${svc.sla_month}/${svc.sla_date}` : ''}
                </Text>
              )}
            </View>
          ))
        )}

        {(agreement.allocated_users ?? []).length > 0 && (
          <>
            <Text style={s.sectionHead}>ASSIGNED TEAM</Text>
            <View style={s.teamChipsRow}>
              {agreement.allocated_users.map((u: any) => (
                <View key={u.id} style={s.teamChip}>
                  <Text style={s.teamChipText}>{u.name}</Text>
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>
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
    agreementName: { fontSize: 17, fontWeight: '800', color: c.textPrimary, marginBottom: 2 },
    client: { fontSize: 14, color: c.primary, fontWeight: '700', marginBottom: 14 },
    metaGrid: {
      backgroundColor: c.surface, borderRadius: 14, borderWidth: 1, borderColor: c.border,
      padding: 14, marginBottom: 16, flexDirection: 'row', flexWrap: 'wrap',
    },
    viewField: { width: '50%', paddingRight: 8, marginBottom: 12 },
    viewFieldLabel: { fontSize: 10, fontWeight: '700', color: c.textMuted, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 3 },
    viewFieldVal: { fontSize: 13, fontWeight: '600', color: c.textPrimary, textTransform: 'capitalize' },
    statusBadge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, borderWidth: 1 },
    statusBadgeText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
    sectionHead: { fontSize: 11, fontWeight: '700', color: c.textMuted, letterSpacing: 1, marginTop: 8, marginBottom: 10 },
    notesText: { fontSize: 13, color: c.textSecondary, marginBottom: 8, lineHeight: 19 },
    emptyText: { fontSize: 13, color: c.textMuted, marginBottom: 12 },
    clauseRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: c.surface, borderRadius: 8, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: c.border },
    clauseNo: { fontSize: 12, fontWeight: '700', color: c.primary, marginTop: 1 },
    clauseText: { flex: 1, fontSize: 13, color: c.textPrimary },
    svcRow: {
      backgroundColor: c.surface, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: c.border, marginBottom: 10, gap: 6,
    },
    svcRowTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    svcTitle: { fontSize: 13, fontWeight: '700', color: c.textPrimary, flex: 1 },
    svcPeriodicity: { fontSize: 11, color: c.textMuted, textTransform: 'capitalize' },
    svcRowMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    svcMetaText: { fontSize: 11, color: c.textSecondary },
    svcSla: { fontSize: 11, color: c.textMuted, textTransform: 'capitalize' },
    teamChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    teamChip: { backgroundColor: c.primaryLight, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 },
    teamChipText: { fontSize: 12, fontWeight: '600', color: c.primary },
  });
}
