import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { useHasTeam } from '../../contexts/HasTeamContext';
import { AppColors } from '../../utils/colors';
import { MoreStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<MoreStackParamList, 'ReportsList'>;

export default function ReportsListScreen() {
  const navigation = useNavigation<Nav>();
  const { colors } = useTheme();
  const { isAdmin } = useHasTeam();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();

  const items = [
    { key: 'task', icon: 'checkmark-done-outline' as const, color: '#0891b2', label: 'Task Report', desc: 'Hours logged and task details', onPress: () => navigation.navigate('TaskReports'), show: true },
    { key: 'projects', icon: 'folder-open-outline' as const, color: '#4f46e5', label: 'Project Report', desc: 'Progress, milestones and status', onPress: () => navigation.navigate('ReportView', { reportType: 'projects' }), show: true },
    { key: 'contracts', icon: 'document-text-outline' as const, color: '#0d9488', label: 'Contract Report', desc: 'Overdue, SLA, workload, revenue', onPress: () => navigation.navigate('ReportView', { reportType: 'contracts' }), show: true },
    { key: 'goals', icon: 'flag-outline' as const, color: '#d97706', label: 'Goals Report', desc: 'Goal approval status by employee', onPress: () => navigation.navigate('ReportView', { reportType: 'goals' }), show: true },
    { key: 'performance', icon: 'trending-up-outline' as const, color: '#7c3aed', label: 'Performance Report', desc: 'Review scores by employee', onPress: () => navigation.navigate('ReportView', { reportType: 'performance' }), show: true },
    { key: 'appraisals', icon: 'ribbon-outline' as const, color: '#be185d', label: 'Appraisal Report', desc: 'Appraisal status by employee', onPress: () => navigation.navigate('ReportView', { reportType: 'appraisals' }), show: true },
    { key: 'financial', icon: 'cash-outline' as const, color: '#059669', label: 'Financial Report', desc: 'Project profitability and margins', onPress: () => navigation.navigate('ReportView', { reportType: 'financial' }), show: isAdmin },
  ].filter((i) => i.show);

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.title}>Reports</Text>
        <View style={{ width: 36 }} />
      </View>
      <ScrollView contentContainerStyle={s.list} showsVerticalScrollIndicator={false}>
        {items.map((item) => (
          <TouchableOpacity key={item.key} style={s.card} activeOpacity={0.7} onPress={item.onPress}>
            <View style={[s.iconBox, { backgroundColor: item.color + '18' }]}>
              <Ionicons name={item.icon} size={20} color={item.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.cardLabel}>{item.label}</Text>
              <Text style={s.cardDesc}>{item.desc}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.gray400} />
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
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 16, paddingVertical: 12,
      backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border,
    },
    backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    title: { fontSize: 20, fontFamily: SERIF, color: c.textPrimary, fontWeight: '700' },
    list: { padding: 16, gap: 10 },
    card: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: c.surface, borderRadius: 14, padding: 14,
      borderWidth: 1, borderColor: c.border,
    },
    iconBox: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    cardLabel: { fontSize: 14, fontWeight: '700', color: c.textPrimary },
    cardDesc: { fontSize: 11, color: c.textMuted, marginTop: 2 },
  });
}
