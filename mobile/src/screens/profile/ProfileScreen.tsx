import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  RefreshControl, Switch,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useApi } from '../../hooks/useApi';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useTheme } from '../../contexts/ThemeContext';
import { AppColors } from '../../utils/colors';
import Avatar from '../../components/common/Avatar';
import Card from '../../components/common/Card';
import Badge from '../../components/common/Badge';
import GoalCard from '../../components/performance/GoalCard';
import LoadingSpinner from '../../components/common/LoadingSpinner';

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
      {right ?? (onPress && !danger ? <Ionicons name="chevron-forward" size={16} color={colors.gray300} /> : null)}
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
  const [goals, setGoals] = useState<any[]>([]);
  const [appraisals, setAppraisals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<'goals' | 'appraisals'>('goals');

  const load = useCallback(async () => {
    try {
      const [me, ...perf] = await Promise.all([
        api.me.getProfile(),
        workspace ? api.performance.getGoals(workspace.id) : Promise.resolve({ data: { goals: [] } }),
        workspace ? api.performance.getAppraisals(workspace.id) : Promise.resolve({ data: { appraisals: [] } }),
      ]);
      setProfile(me.data);
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
        <Text style={s.title}>Profile</Text>
      </View>

      <ScrollView
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Avatar + name */}
        <Card style={s.heroCard}>
          <View style={s.heroRow}>
            <Avatar name={fullName} size={64} />
            <View style={s.heroInfo}>
              <Text style={s.heroName}>{fullName}</Text>
              <Text style={s.heroEmail}>{profile?.email}</Text>
              {workspace && (
                <Badge label={workspace.role.replace('_', ' ')} bg={colors.primaryLight} color={colors.primary} />
              )}
            </View>
          </View>
        </Card>

        {/* Appearance */}
        <Card>
          <Text style={s.sectionTitle}>Appearance</Text>
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
        </Card>

        {/* Workspace */}
        <Card>
          <Text style={s.sectionTitle}>Workspace</Text>
          <MenuRow
            icon="briefcase-outline"
            label={workspace?.name ?? 'No workspace'}
            value={workspace?.type?.toUpperCase()}
            colors={colors}
            s={s}
          />
          <MenuRow icon="swap-horizontal-outline" label="Switch Workspace" onPress={() => setWorkspace(null)} colors={colors} s={s} />
        </Card>

        {/* Notifications shortcut */}
        <Card>
          <Text style={s.sectionTitle}>Activity</Text>
          <MenuRow
            icon="notifications-outline"
            label="Notifications"
            onPress={() => navigation.navigate('Notifications')}
            colors={colors}
            s={s}
          />
        </Card>

        {/* Performance Hub */}
        {workspace && (
          <Card>
            <Text style={s.sectionTitle}>Performance</Text>

            <View style={s.tabRow}>
              <TouchableOpacity
                style={[s.tabChip, tab === 'goals' && s.tabChipActive]}
                onPress={() => setTab('goals')}
              >
                <Text style={[s.tabChipText, tab === 'goals' && s.tabChipTextActive]}>
                  Goals ({goals.length})
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.tabChip, tab === 'appraisals' && s.tabChipActive]}
                onPress={() => setTab('appraisals')}
              >
                <Text style={[s.tabChipText, tab === 'appraisals' && s.tabChipTextActive]}>
                  Appraisals ({appraisals.length})
                </Text>
              </TouchableOpacity>
            </View>

            {tab === 'goals' && (
              goals.length > 0
                ? goals.map((g) => <GoalCard key={g.id} goal={g} />)
                : <Text style={s.emptyText}>No goals set yet.</Text>
            )}

            {tab === 'appraisals' && (
              appraisals.length > 0
                ? appraisals.map((a: any) => (
                  <View key={a.id} style={s.appraisalRow}>
                    <Ionicons name="document-text-outline" size={18} color={colors.primary} />
                    <View style={s.appraisalInfo}>
                      <Text style={s.appraisalTitle}>{a.title ?? `Appraisal #${a.id}`}</Text>
                      <Text style={s.appraisalDate}>{a.cycle_name ?? a.period}</Text>
                    </View>
                    <Badge
                      label={a.status ?? 'pending'}
                      bg={a.status === 'completed' ? colors.successLight : colors.warningLight}
                      color={a.status === 'completed' ? colors.success : colors.warning}
                    />
                  </View>
                ))
                : <Text style={s.emptyText}>No appraisals yet.</Text>
            )}
          </Card>
        )}

        <Text style={s.version}>GreatLeap Mobile v1.0.0</Text>
      </ScrollView>
    </View>
  );
}

function makeStyles(c: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    header: {
      backgroundColor: c.surface, paddingHorizontal: 20, paddingBottom: 14,
      paddingTop: 10, borderBottomWidth: 1, borderBottomColor: c.border,
    },
    title: { fontSize: 20, fontWeight: '700', color: c.textPrimary },
    content: { padding: 16, paddingBottom: 48 },
    heroCard: { marginBottom: 12 },
    heroRow: { flexDirection: 'row', gap: 16, alignItems: 'center' },
    heroInfo: { flex: 1, gap: 4 },
    heroName: { fontSize: 18, fontWeight: '800', color: c.textPrimary },
    heroEmail: { fontSize: 13, color: c.textSecondary },
    sectionTitle: {
      fontSize: 11, fontWeight: '700', color: c.textSecondary,
      textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 12,
    },
    menuRow: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.border,
    },
    menuIcon: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
    menuLabel: { flex: 1, fontSize: 14, fontWeight: '500', color: c.textPrimary },
    menuValue: { fontSize: 13, color: c.textSecondary, marginRight: 4 },
    tabRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
    tabChip: {
      paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20,
      backgroundColor: c.gray100, borderWidth: 1.5, borderColor: c.gray200,
    },
    tabChipActive: { backgroundColor: c.primary, borderColor: c.primary },
    tabChipText: { fontSize: 13, fontWeight: '500', color: c.gray600 },
    tabChipTextActive: { color: '#ffffff' },
    emptyText: { fontSize: 14, color: c.gray400, textAlign: 'center', paddingVertical: 16 },
    appraisalRow: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.border,
    },
    appraisalInfo: { flex: 1 },
    appraisalTitle: { fontSize: 14, fontWeight: '600', color: c.textPrimary },
    appraisalDate: { fontSize: 12, color: c.textSecondary, marginTop: 2 },
    version: { fontSize: 12, color: c.gray400, textAlign: 'center', marginTop: 8 },
  });
}
