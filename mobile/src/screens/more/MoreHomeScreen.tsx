import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useHasTeam } from '../../contexts/HasTeamContext';
import { useTheme } from '../../contexts/ThemeContext';
import { AppColors } from '../../utils/colors';
import { MoreStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<MoreStackParamList, 'MoreHome'>;

export default function MoreHomeScreen() {
  const navigation = useNavigation<Nav>();
  const { colors } = useTheme();
  const { isAdmin, canSeeTeamContent } = useHasTeam();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();

  const MENU_ITEMS = [
    { screen: 'ProjectsList' as const, icon: 'folder-open-outline' as const, label: 'Projects', desc: 'Track project milestones and progress', color: '#0891b2', show: true },
    { screen: 'AgreementsList' as const, icon: 'document-text-outline' as const, label: 'Agreements', desc: 'Client contracts and compliance', color: '#4f46e5', show: true },
    { screen: 'Routines' as const, icon: 'calendar-outline' as const, label: 'Routines', desc: 'Recurring team routines', color: '#059669', show: canSeeTeamContent },
    { screen: 'BusinessReviewsList' as const, icon: 'bar-chart-outline' as const, label: 'Business Reviews', desc: 'Periodic team performance reviews', color: '#d97706', show: canSeeTeamContent },
    { screen: 'MyOrganisation' as const, icon: 'business-outline' as const, label: 'My Organisation', desc: 'View organisation details', color: '#7c3aed', show: !isAdmin },
    { screen: 'EmployeeHierarchy' as const, icon: 'git-network-outline' as const, label: 'Employee Hierarchy', desc: 'Who reports to whom across the org', color: '#0d9488', show: true },
    { screen: 'ReportsList' as const, icon: 'stats-chart-outline' as const, label: 'Reports', desc: 'Task, project, performance and other reports', color: '#dc2626', show: true },
  ].filter((m) => m.show);

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <Text style={s.title}>More</Text>
        <Text style={s.subtitle}>Projects, agreements and more</Text>
      </View>
      <ScrollView contentContainerStyle={s.list} showsVerticalScrollIndicator={false}>
        {MENU_ITEMS.map((item) => (
          <TouchableOpacity
            key={item.screen}
            style={s.card}
            activeOpacity={0.7}
            onPress={() => navigation.navigate(item.screen)}
          >
            <View style={[s.iconBox, { backgroundColor: item.color + '18' }]}>
              <Ionicons name={item.icon} size={22} color={item.color} />
            </View>
            <View style={s.cardBody}>
              <Text style={s.cardLabel}>{item.label}</Text>
              <Text style={s.cardDesc}>{item.desc}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.gray400} />
          </TouchableOpacity>
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
    title: { fontSize: 28, fontFamily: SERIF, color: c.textPrimary },
    subtitle: { fontSize: 12, color: c.textSecondary, marginTop: 4 },
    list: { padding: 16, gap: 10 },
    card: {
      flexDirection: 'row', alignItems: 'center', gap: 14,
      backgroundColor: c.surface, borderRadius: 14, padding: 16,
      borderWidth: 1, borderColor: c.border,
    },
    iconBox: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    cardBody: { flex: 1, gap: 2 },
    cardLabel: { fontSize: 15, fontWeight: '700', color: c.textPrimary },
    cardDesc: { fontSize: 12, color: c.textSecondary },
  });
}
