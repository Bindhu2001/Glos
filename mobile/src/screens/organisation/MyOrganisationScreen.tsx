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

interface CoreValue {
  value: string;
  description?: string;
  accepted_behavior?: string;
  unaccepted_behavior?: string;
}

function parseCoreValues(raw?: string): CoreValue[] {
  if (!raw) return [];
  try {
    const a = JSON.parse(raw);
    if (!Array.isArray(a)) return [];
    // Older orgs stored this as a plain string array — normalize to the
    // {value, description, accepted_behavior, unaccepted_behavior} shape
    // the web app (MyOrganisation.jsx) now writes, so rendering never has
    // to branch on which shape it got.
    return a.map((v) => (typeof v === 'string' ? { value: v } : v));
  } catch { return []; }
}

const VALUE_COLORS = ['#2563eb', '#16a34a', '#9333ea', '#ea580c', '#dc2626', '#0d9488'];
function splitBehaviors(raw?: string): string[] {
  return (raw ?? '').split(',').map((t) => t.trim()).filter(Boolean);
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

  if (loading) return <View style={{ flex: 1, backgroundColor: colors.background }}><ActivityIndicator style={{ flex: 1 }} color={colors.primary} /></View>;
  if (error) return <LoadError message={error} onRetry={load} />;
  if (!org) return <LoadError message="Organisation details are unavailable." onRetry={load} />;

  const coreValues = parseCoreValues(org.core_values);
  const logoSrc = org.logo_data || org.logo_url || null;

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
          <View style={s.logoWrap}>
            {logoSrc ? (
              <Image source={{ uri: logoSrc }} style={s.logo} resizeMode="contain" />
            ) : (
              <Text style={s.logoInitials}>{(org.name ?? 'O').split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()}</Text>
            )}
          </View>
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
            <View style={{ gap: 10 }}>
              {coreValues.map((cv, i) => {
                const color = VALUE_COLORS[i % VALUE_COLORS.length];
                const accepted = splitBehaviors(cv.accepted_behavior);
                const unaccepted = splitBehaviors(cv.unaccepted_behavior);
                return (
                  <View key={i} style={[s.valueCard, { borderLeftColor: color }]}>
                    <View style={s.valueCardHead}>
                      <View style={[s.valueDot, { backgroundColor: color }]} />
                      <Text style={s.valueName}>{cv.value}</Text>
                    </View>
                    {!!cv.description && <Text style={s.valueDesc}>{cv.description}</Text>}
                    {(accepted.length > 0 || unaccepted.length > 0) && (
                      <View style={s.valueTagsWrap}>
                        {accepted.map((t, j) => (
                          <View key={`a-${j}`} style={s.tagChip}><Text style={s.tagChipText}>{t}</Text></View>
                        ))}
                        {unaccepted.map((t, j) => (
                          <View key={`u-${j}`} style={[s.tagChip, s.tagChipDanger]}><Text style={[s.tagChipText, s.tagChipTextDanger]}>{t}</Text></View>
                        ))}
                      </View>
                    )}
                  </View>
                );
              })}
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
    // Fixed-size box with a background/border (mirrors web's MyOrganisation.jsx logo
    // container) so a non-square uploaded logo scales to fit inside via
    // resizeMode="contain" instead of being cropped to fill the box.
    logoWrap: {
      width: 72, height: 72, borderRadius: 12, flexShrink: 0,
      backgroundColor: c.gray50, borderWidth: 1, borderColor: c.border,
      alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    },
    logo: { width: '100%', height: '100%' },
    logoInitials: { fontSize: 22, fontWeight: '900', color: c.primary },
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
    valueCard: {
      backgroundColor: c.surface, borderRadius: 10, borderWidth: 1, borderColor: c.border,
      borderLeftWidth: 4, padding: 12, gap: 6,
    },
    valueCardHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    valueDot: { width: 8, height: 8, borderRadius: 4 },
    valueName: { fontSize: 13, fontWeight: '700', color: c.textPrimary },
    valueDesc: { fontSize: 12, color: c.textSecondary, lineHeight: 18 },
    valueTagsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
    tagChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: c.successLight },
    tagChipText: { fontSize: 11, fontWeight: '600', color: c.success },
    tagChipDanger: { backgroundColor: c.dangerLight },
    tagChipTextDanger: { color: c.danger },
  });
}
