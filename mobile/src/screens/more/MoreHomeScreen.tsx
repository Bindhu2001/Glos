import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useHasTeam } from '../../contexts/HasTeamContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { AppColors } from '../../utils/colors';
import { MoreStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<MoreStackParamList, 'MoreHome'>;

interface MenuItem {
  screen: keyof MoreStackParamList;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  desc: string;
  color: string;
  show: boolean;
}

export default function MoreHomeScreen() {
  const navigation = useNavigation<Nav>();
  const { colors } = useTheme();
  const { workspace } = useWorkspace();
  const { isAdmin, canSeeTeamContent } = useHasTeam();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();

  const rawSections: { label: string; items: MenuItem[] }[] = [
    {
      label: 'WORK',
      items: [
        { screen: 'ProjectsList', icon: 'folder-open-outline', label: 'Projects', desc: 'Track project milestones and progress', color: '#0891b2', show: true },
        { screen: 'AgreementsList', icon: 'document-text-outline', label: 'Agreements', desc: 'Client contracts and compliance', color: '#4f46e5', show: true },
        { screen: 'ServicesList', icon: 'construct-outline', label: 'Services', desc: 'Contract services and deliverables', color: '#0d9488', show: true },
        { screen: 'Routines', icon: 'calendar-outline', label: 'Routines', desc: 'Recurring team routines', color: '#059669', show: canSeeTeamContent },
        { screen: 'BusinessReviewsList', icon: 'bar-chart-outline', label: 'Business Reviews', desc: 'Periodic team performance reviews', color: '#d97706', show: canSeeTeamContent },
      ],
    },
    {
      label: 'ORGANISATION',
      items: [
        { screen: 'MyOrganisation', icon: 'business-outline', label: 'My Organisation', desc: 'View organisation details', color: '#7c3aed', show: !isAdmin },
      ],
    },
    {
      label: 'INSIGHTS',
      items: [
        { screen: 'ReportsList', icon: 'stats-chart-outline', label: 'Reports', desc: 'Task, project, performance and other reports', color: '#dc2626', show: true },
        { screen: 'PoliciesList', icon: 'shield-checkmark-outline', label: 'HR Policies', desc: 'Company policies and guidelines', color: '#0d9488', show: true },
      ],
    },
  ];
  const sections = rawSections
    .map((sec) => ({ ...sec, items: sec.items.filter((m) => m.show) }))
    .filter((sec) => sec.items.length > 0);

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <Text style={s.breadcrumb}>{workspace?.name?.toUpperCase() ?? 'WORKSPACE'} · MORE</Text>
        <Text style={s.title}>More</Text>
        <Text style={s.subtitle}>Projects, agreements and more</Text>
      </View>
      <ScrollView contentContainerStyle={s.list} showsVerticalScrollIndicator={false}>
        {sections.map((sec) => (
          <View key={sec.label} style={s.section}>
            <Text style={s.sectionLabel}>{sec.label}</Text>
            <View style={s.sectionCard}>
              {sec.items.map((item, i) => (
                <TouchableOpacity
                  key={item.screen}
                  style={[s.row, i < sec.items.length - 1 && s.rowDivider]}
                  activeOpacity={0.6}
                  onPress={() => navigation.navigate(item.screen as any)}
                >
                  <View style={[s.iconBox, { backgroundColor: item.color + '18' }]}>
                    <Ionicons name={item.icon} size={20} color={item.color} />
                  </View>
                  <View style={s.rowBody}>
                    <Text style={s.rowLabel}>{item.label}</Text>
                    <Text style={s.rowDesc}>{item.desc}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.gray400} />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

function makeStyles(c: AppColors) {
  const SERIF = Platform.OS === 'ios' ? 'Georgia' : 'serif';
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    header: {
      backgroundColor: c.surface, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 14,
      borderBottomWidth: 1, borderBottomColor: c.border,
    },
    breadcrumb: { fontSize: 10, fontWeight: '700', color: c.textMuted, letterSpacing: 1, marginBottom: 6 },
    title: { fontSize: 30, fontFamily: SERIF, color: c.textPrimary },
    subtitle: { fontSize: 12, color: c.textSecondary, marginTop: 4 },
    list: { padding: 16, paddingTop: 12, paddingBottom: 32 },
    section: { marginBottom: 20 },
    sectionLabel: {
      fontSize: 11, fontWeight: '700', color: c.textMuted, letterSpacing: 1,
      marginBottom: 8, marginLeft: 4,
    },
    sectionCard: {
      backgroundColor: c.surface, borderRadius: 16,
      borderWidth: 1, borderColor: c.border, overflow: 'hidden',
      shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
    },
    row: {
      flexDirection: 'row', alignItems: 'center', gap: 14,
      paddingHorizontal: 16, paddingVertical: 14,
    },
    rowDivider: { borderBottomWidth: 1, borderBottomColor: c.border },
    iconBox: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    rowBody: { flex: 1, gap: 2 },
    rowLabel: { fontSize: 15, fontWeight: '700', color: c.textPrimary },
    rowDesc: { fontSize: 12, color: c.textSecondary },
  });
}
