import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  RefreshControl, Switch, Linking, Alert, Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useApi } from '../../hooks/useApi';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useTheme } from '../../contexts/ThemeContext';
import { AppColors } from '../../utils/colors';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import LoadError from '../../components/common/LoadError';
import { useLoadWithTimeout } from '../../hooks/useLoadWithTimeout';

function SectionCard({ title, children, s }: { title: string; children: React.ReactNode; s: ReturnType<typeof makeStyles> }) {
  return (
    <View style={s.sectionCard}>
      <Text style={s.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function MenuRow({
  icon, label, value, onPress, danger, right, colors, s,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  onPress?: () => void;
  danger?: boolean;
  right?: React.ReactNode;
  colors: AppColors;
  s: ReturnType<typeof makeStyles>;
}) {
  return (
    <TouchableOpacity style={s.menuRow} onPress={onPress} disabled={!onPress && !right} activeOpacity={0.7}>
      <View style={[s.menuIcon, { backgroundColor: danger ? colors.dangerLight : colors.primaryLight }]}>
        <Ionicons name={icon} size={17} color={danger ? colors.danger : colors.primary} />
      </View>
      <Text style={[s.menuLabel, danger && { color: colors.danger }]}>{label}</Text>
      {value ? <Text style={s.menuValue}>{value}</Text> : null}
      {right ?? (onPress ? <Ionicons name="chevron-forward" size={16} color={colors.gray300} /> : null)}
    </TouchableOpacity>
  );
}

export default function ProfileScreen() {
  const api = useApi();
  const { workspace, setWorkspace } = useWorkspace();
  const { isDark, toggleTheme, colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();

  const [profile, setProfile] = useState<any>(null);
  const [roleTitle, setRoleTitle] = useState<string | null>(null);
  const [goals, setGoals] = useState<any[]>([]);
  const [appraisals, setAppraisals] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const { loading, loadError, run } = useLoadWithTimeout();

  const load = useCallback(async () => {
    const [me, ...perf] = await Promise.all([
      api.me.getProfile(),
      workspace ? api.performance.getGoals(workspace.id) : Promise.resolve({ data: { goals: [] } }),
      workspace ? api.performance.getAppraisals(workspace.id) : Promise.resolve({ data: { appraisals: [] } }),
      workspace ? api.dashboard.getMyDashboard(workspace.id) : Promise.resolve({ data: { roles: [] } }),
    ]);
    setProfile(me.data);
    const gData = perf[0].data;
    setGoals(Array.isArray(gData) ? gData : (gData?.items ?? []));
    const aData = perf[1].data;
    setAppraisals(Array.isArray(aData) ? aData : (aData?.items ?? []));
    const dash = perf[2].data;
    const roles: any[] = dash?.roles ?? [];
    setRoleTitle(roles[0]?.title ?? null);
  }, [workspace, api]);

  useEffect(() => { run(load); }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await run(load, true);
    setRefreshing(false);
  };

  if (loading) return <LoadingSpinner />;
  if (loadError) return <LoadError onRetry={() => run(load)} />;

  const fullName = [profile?.firstName, profile?.lastName].filter(Boolean).join(' ') || 'You';

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <Text style={s.headerTitle}>Profile</Text>
      </View>

      <ScrollView
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Hero Card */}
        <View style={s.heroCard}>
          <View style={s.heroBannerAccent} />
          {profile?.photoUrl ? (
            <Image source={{ uri: profile.photoUrl }} style={s.avatarCircle} />
          ) : (
            <View style={s.avatarCircle}>
              <Text style={s.avatarText}>
                {fullName.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)}
              </Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={s.heroName}>{fullName}</Text>
            {roleTitle ? (
              <Text style={s.heroRole}>{roleTitle}</Text>
            ) : null}
            <Text style={s.heroEmail}>{profile?.email}</Text>
          </View>
          {workspace?.role ? (
            <View style={s.memberBadge}>
              <Text style={s.memberBadgeText}>{workspace.role}</Text>
            </View>
          ) : null}
        </View>

        {/* Workspace */}
        <SectionCard title="WORKSPACE" s={s}>
          <MenuRow
            icon="briefcase-outline"
            label={workspace?.name ?? 'No workspace'}
            value={workspace?.type?.toUpperCase()}
            colors={colors}
            s={s}
          />
          <MenuRow
            icon="swap-horizontal-outline"
            label="Switch Workspace"
            onPress={() => setWorkspace(null)}
            colors={colors}
            s={s}
          />
          <MenuRow
            icon="shield-checkmark-outline"
            label="Manage Email & Security"
            onPress={() => navigation.navigate('AccountSecurity')}
            colors={colors}
            s={s}
          />
        </SectionCard>

        {/* Appearance */}
        <SectionCard title="APPEARANCE" s={s}>
          <MenuRow
            icon={isDark ? 'moon' : 'sunny-outline'}
            label="Dark Mode"
            colors={colors}
            s={s}
            right={
              <Switch
                value={isDark}
                onValueChange={toggleTheme}
                trackColor={{ false: colors.gray200, true: colors.primary }}
                thumbColor="#ffffff"
              />
            }
          />
        </SectionCard>

        {/* Performance */}
        {workspace && (
          <SectionCard title="PERFORMANCE" s={s}>
            <MenuRow
              icon="flag-outline"
              label={`Goals (${goals.length})`}
              onPress={() => navigation.navigate('PerformanceTab')}
              colors={colors}
              s={s}
            />
            <MenuRow
              icon="star-outline"
              label={`Appraisals (${appraisals.length})`}
              onPress={() => navigation.navigate('PerformanceTab')}
              colors={colors}
              s={s}
            />
          </SectionCard>
        )}
        {/* Account */}
        <SectionCard title="ACCOUNT" s={s}>
          <MenuRow
            icon="trash-outline"
            label="Request Account Deletion"
            onPress={() =>
              Alert.alert(
                'Delete Account',
                'Your Glos account is provisioned and managed by your organisation\'s admin, so it can\'t be deleted directly from this app.\n\n' +
                  'To request deletion of your account and all associated data (profile, tasks, messages, appraisals, and other records), email our support team at crm@greatleap.tech from your registered email address. We will confirm your identity and process the deletion.\n\n' +
                  'Tap "Email Support" to open a pre-filled request.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Email Support',
                    style: 'destructive',
                    onPress: () =>
                      Linking.openURL(
                        'mailto:crm@greatleap.tech?subject=Account%20Deletion%20Request&body=Please%20delete%20my%20account%20and%20all%20associated%20data.%0A%0AEmail%3A%20' +
                          encodeURIComponent(profile?.email ?? '')
                      ),
                  },
                ]
              )
            }
            danger
            colors={colors}
            s={s}
          />
        </SectionCard>

        <Text style={s.version}>Glos v1.0.0</Text>
      </ScrollView>
    </View>
  );
}

function makeStyles(c: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    header: {
      backgroundColor: c.surface, paddingHorizontal: 20,
      paddingBottom: 14, paddingTop: 10,
      borderBottomWidth: 1, borderBottomColor: c.border,
    },
    headerTitle: { fontSize: 20, fontWeight: '700', color: c.textPrimary },
    content: { padding: 16, paddingBottom: 48 },

    // Hero
    heroCard: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: c.surface, borderRadius: 16, padding: 16,
      marginBottom: 14, borderWidth: 1, borderColor: c.border,
      overflow: 'hidden',
      shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.04, shadowRadius: 4, elevation: 2,
    },
    heroBannerAccent: {
      position: 'absolute', right: -10, top: -10,
      width: 60, height: 60, borderRadius: 12,
      backgroundColor: c.primaryLight, opacity: 0.5, transform: [{ rotate: '20deg' }],
    },
    avatarCircle: {
      width: 52, height: 52, borderRadius: 14,
      backgroundColor: c.primaryLight, borderWidth: 2, borderColor: c.primary + '55',
      alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    },
    avatarText: { fontSize: 18, fontWeight: '900', color: c.primary },
    heroName: { fontSize: 16, fontWeight: '900', color: c.textPrimary, letterSpacing: -0.3 },
    heroRole: { fontSize: 12, fontWeight: '600', color: c.primary, marginTop: 2 },
    heroEmail: { fontSize: 11, color: c.textMuted, marginTop: 1 },
    memberBadge: {
      backgroundColor: c.primaryLight,
      paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20,
      marginLeft: 'auto',
    },
    memberBadgeText: { fontSize: 11, fontWeight: '600', color: c.primary, textTransform: 'capitalize' },

    // Section cards
    sectionCard: {
      backgroundColor: c.surface, borderRadius: 16, padding: 16,
      marginBottom: 12, borderWidth: 1, borderColor: c.border,
      shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
    },
    sectionTitle: {
      fontSize: 11, fontWeight: '700', color: c.textSecondary,
      textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12,
    },

    // Menu rows
    menuRow: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.border,
    },
    menuIcon: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
    menuLabel: { flex: 1, fontSize: 14, fontWeight: '500', color: c.textPrimary },
    menuValue: { fontSize: 13, color: c.textSecondary, marginRight: 4 },
    version: { fontSize: 12, color: c.gray400, textAlign: 'center', marginTop: 8 },
  });
}
