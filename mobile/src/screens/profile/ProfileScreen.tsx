import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  RefreshControl, Switch,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { useClerk } from '@clerk/clerk-expo';
import { useApi } from '../../hooks/useApi';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useTheme } from '../../contexts/ThemeContext';
import { AppColors } from '../../utils/colors';
import LoadingSpinner from '../../components/common/LoadingSpinner';

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
  const { signOut } = useClerk();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();

  const [profile, setProfile] = useState<any>(null);
  const [goals, setGoals] = useState<any[]>([]);
  const [appraisals, setAppraisals] = useState<any[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [me, notif, ...perf] = await Promise.all([
        api.me.getProfile(),
        api.notifications.unreadCount(),
        workspace ? api.performance.getGoals(workspace.id) : Promise.resolve({ data: { goals: [] } }),
        workspace ? api.performance.getAppraisals(workspace.id) : Promise.resolve({ data: { appraisals: [] } }),
      ]);
      setProfile(me.data);
      setUnread(notif.data.count ?? 0);
      const gData = perf[0].data;
      setGoals(Array.isArray(gData) ? gData : (gData?.items ?? []));
      const aData = perf[1].data;
      setAppraisals(Array.isArray(aData) ? aData : (aData?.items ?? []));
    } catch {}
  }, [workspace]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (loading) return <LoadingSpinner />;

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
        <LinearGradient
          colors={['#4F6EF7', '#7e3af2']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={s.heroCard}
        >
          <View style={s.avatarCircle}>
            <Text style={s.avatarText}>
              {fullName.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)}
            </Text>
          </View>
          <Text style={s.heroName}>{fullName}</Text>
          <Text style={s.heroEmail}>{profile?.email}</Text>
          {workspace && (
            <View style={s.memberBadge}>
              <Text style={s.memberBadgeText}>{workspace.role.replace('_', ' ')}</Text>
            </View>
          )}
        </LinearGradient>

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

        {/* Activity */}
        <SectionCard title="ACTIVITY" s={s}>
          <MenuRow
            icon="notifications-outline"
            label="Notifications"
            onPress={() => navigation.navigate('Notifications')}
            colors={colors}
            s={s}
            right={
              <View style={s.menuRight}>
                {unread > 0 && (
                  <View style={s.unreadBadge}>
                    <Text style={s.unreadText}>{unread > 9 ? '9+' : unread}</Text>
                  </View>
                )}
                <Ionicons name="chevron-forward" size={16} color={colors.gray300} />
              </View>
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
            icon="log-out-outline"
            label="Sign Out"
            onPress={() => { setWorkspace(null); signOut(); }}
            danger
            colors={colors}
            s={s}
          />
        </SectionCard>

        <Text style={s.version}>GreatLeap Mobile v1.0.0</Text>
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
      borderRadius: 20, padding: 28, alignItems: 'center',
      marginBottom: 14,
      shadowColor: '#4F6EF7', shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3, shadowRadius: 12, elevation: 6,
    },
    avatarCircle: {
      width: 72, height: 72, borderRadius: 36,
      backgroundColor: 'rgba(255,255,255,0.25)',
      alignItems: 'center', justifyContent: 'center', marginBottom: 12,
    },
    avatarText: { fontSize: 28, fontWeight: '800', color: '#ffffff' },
    heroName: { fontSize: 20, fontWeight: '800', color: '#ffffff', marginBottom: 4 },
    heroEmail: { fontSize: 13, color: 'rgba(255,255,255,0.8)', marginBottom: 10 },
    memberBadge: {
      backgroundColor: 'rgba(255,255,255,0.2)',
      paddingHorizontal: 14, paddingVertical: 4, borderRadius: 20,
    },
    memberBadgeText: { fontSize: 12, fontWeight: '600', color: '#ffffff', textTransform: 'capitalize' },

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
    menuRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    unreadBadge: {
      backgroundColor: c.danger, minWidth: 20, height: 20,
      borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
    },
    unreadText: { fontSize: 11, color: '#ffffff', fontWeight: '700' },

    version: { fontSize: 12, color: c.gray400, textAlign: 'center', marginTop: 8 },
  });
}
