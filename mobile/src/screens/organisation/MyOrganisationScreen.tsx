import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, ActivityIndicator, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../contexts/ThemeContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useApi } from '../../hooks/useApi';
import { AppColors } from '../../utils/colors';
import { apiErrorMessage } from '../../utils/apiError';
import LoadError from '../../components/common/LoadError';

function parseCoreValues(raw?: string): string[] {
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

export default function MyOrganisationScreen() {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const { workspace } = useWorkspace();
  const api = useApi();
  const insets = useSafeAreaInsets();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [org, setOrg] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!workspace?.id) return;
    setLoading(true);
    try {
      const res = await api.organisation.get(workspace.id);
      setOrg(res.data);
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not load organisation details.'));
    } finally {
      setLoading(false);
    }
  }, [workspace?.id]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <ActivityIndicator style={{ flex: 1 }} color={colors.primary} />;
  if (error) return <LoadError message={error} onRetry={load} />;
  if (!org) return null;

  const coreValues = parseCoreValues(org.core_values);

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.title}>My Organisation</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
        <View style={s.identityRow}>
          {org.logo_url ? (
            <Image source={{ uri: org.logo_url }} style={s.logo} />
          ) : (
            <View style={s.logoPlaceholder}>
              <Text style={s.logoInitials}>{(org.name ?? 'O').split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()}</Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={s.orgName}>{org.name}</Text>
            {org.industry ? <Text style={s.orgIndustry}>{org.industry}</Text> : null}
          </View>
        </View>

        <View style={s.metaCard}>
          {org.founded_on ? (
            <View style={s.metaRow}><Ionicons name="calendar-outline" size={14} color={colors.textMuted} /><Text style={s.metaText}>Est. {new Date(org.founded_on).toLocaleDateString()}</Text></View>
          ) : null}
          {org.registration_no ? (
            <View style={s.metaRow}><Ionicons name="pricetag-outline" size={14} color={colors.textMuted} /><Text style={s.metaText}>{org.registration_no}</Text></View>
          ) : null}
          {org.website ? (
            <View style={s.metaRow}><Ionicons name="globe-outline" size={14} color={colors.textMuted} /><Text style={s.metaText}>{org.website}</Text></View>
          ) : null}
          {org.hq_address ? (
            <View style={s.metaRow}><Ionicons name="location-outline" size={14} color={colors.textMuted} /><Text style={s.metaText}>{org.hq_address}</Text></View>
          ) : null}
        </View>

        {org.description ? (
          <>
            <Text style={s.sectionHead}>ABOUT</Text>
            <Text style={s.paragraph}>{org.description}</Text>
          </>
        ) : null}
        {org.vision ? (
          <>
            <Text style={s.sectionHead}>VISION</Text>
            <Text style={s.paragraph}>{org.vision}</Text>
          </>
        ) : null}
        {org.mission ? (
          <>
            <Text style={s.sectionHead}>MISSION</Text>
            <Text style={s.paragraph}>{org.mission}</Text>
          </>
        ) : null}
        {coreValues.length > 0 && (
          <>
            <Text style={s.sectionHead}>CORE VALUES</Text>
            <View style={s.valuesWrap}>
              {coreValues.map((v, i) => (
                <View key={i} style={s.valueChip}><Text style={s.valueChipText}>{v}</Text></View>
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
      paddingHorizontal: 16, paddingVertical: 12,
      backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border,
    },
    backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    title: { fontSize: 20, fontFamily: SERIF, color: c.textPrimary, fontWeight: '700' },
    body: { padding: 16, paddingBottom: 32 },
    identityRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 },
    logo: { width: 56, height: 56, borderRadius: 14 },
    logoPlaceholder: { width: 56, height: 56, borderRadius: 14, backgroundColor: c.primaryLight, alignItems: 'center', justifyContent: 'center' },
    logoInitials: { fontSize: 20, fontWeight: '900', color: c.primary },
    orgName: { fontSize: 20, fontWeight: '800', color: c.textPrimary },
    orgIndustry: { fontSize: 12, color: c.textSecondary, marginTop: 2 },
    metaCard: {
      backgroundColor: c.surface, borderRadius: 14, borderWidth: 1, borderColor: c.border,
      padding: 14, marginBottom: 16, gap: 10,
    },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    metaText: { fontSize: 12, color: c.textSecondary, flex: 1 },
    sectionHead: { fontSize: 11, fontWeight: '700', color: c.textMuted, letterSpacing: 1, marginTop: 8, marginBottom: 8 },
    paragraph: { fontSize: 13, color: c.textSecondary, lineHeight: 19, marginBottom: 4 },
    valuesWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    valueChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: c.primaryLight },
    valueChipText: { fontSize: 12, fontWeight: '600', color: c.primary },
  });
}
