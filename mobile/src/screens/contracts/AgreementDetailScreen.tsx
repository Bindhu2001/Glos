import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../contexts/ThemeContext';
import { useApi } from '../../hooks/useApi';
import { AppColors } from '../../utils/colors';
import { MoreStackParamList } from '../../navigation/types';
import { apiErrorMessage } from '../../utils/apiError';
import LoadError from '../../components/common/LoadError';

type Nav = NativeStackNavigationProp<MoreStackParamList, 'AgreementDetail'>;
type Rt = RouteProp<MoreStackParamList, 'AgreementDetail'>;

export default function AgreementDetailScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Rt>();
  const { colors } = useTheme();
  const api = useApi();
  const insets = useSafeAreaInsets();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [agreement, setAgreement] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.contracts.getAgreement(params.appId, params.agreementId);
      setAgreement(res.data);
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not load this agreement.'));
    } finally {
      setLoading(false);
    }
  }, [params.appId, params.agreementId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <ActivityIndicator style={{ flex: 1 }} color={colors.primary} />;
  if (error) return <LoadError message={error} onRetry={load} />;
  if (!agreement) return null;

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.title} numberOfLines={1}>{agreement.agreement_number ?? `Agreement #${agreement.id}`}</Text>
        <View style={{ width: 36 }} />
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

        <Text style={s.sectionHead}>SERVICES</Text>
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
