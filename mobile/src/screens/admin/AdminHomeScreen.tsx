import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useTheme } from '../../contexts/ThemeContext';
import { AppColors } from '../../utils/colors';
import { AdminStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<AdminStackParamList, 'AdminHome'>;

const MENU_ITEMS = [
  {
    screen: 'Members' as const,
    icon: 'people-outline' as const,
    label: 'Members',
    desc: 'Manage team members and roles',
    color: '#4f46e5',
  },
  {
    screen: 'InviteMember' as const,
    icon: 'person-add-outline' as const,
    label: 'Invite Member',
    desc: 'Send invitations to new members',
    color: '#0891b2',
  },
  {
    screen: 'Organisation' as const,
    icon: 'business-outline' as const,
    label: 'Organisation',
    desc: 'View and edit organisation details',
    color: '#059669',
  },
  {
    screen: 'Roles' as const,
    icon: 'briefcase-outline' as const,
    label: 'Roles',
    desc: 'Browse all job roles in the org',
    color: '#d97706',
  },
  {
    screen: 'Policies' as const,
    icon: 'document-text-outline' as const,
    label: 'HR Policies',
    desc: 'View and manage HR policy documents',
    color: '#7c3aed',
  },
];

export default function AdminHomeScreen() {
  const navigation = useNavigation<Nav>();
  const { workspace } = useWorkspace();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.pageHeader}>
        <Text style={s.breadcrumb}>{workspace?.name?.toUpperCase() ?? 'WORKSPACE'} · ADMIN</Text>
        <Text style={s.pageTitle}>Admin Panel</Text>
        <Text style={s.subtitle}>Manage your workspace settings and team.</Text>
      </View>

      <View style={s.ownerBadge}>
        <Ionicons name="shield-checkmark" size={14} color="#7c3aed" />
        <Text style={s.ownerText}>You are the workspace owner (Super Admin)</Text>
      </View>

      <ScrollView contentContainerStyle={s.list} showsVerticalScrollIndicator={false}>
        {MENU_ITEMS.map((item) => (
          <TouchableOpacity
            key={item.screen}
            style={s.card}
            onPress={() => navigation.navigate(item.screen)}
            activeOpacity={0.7}
          >
            <View style={[s.iconBox, { backgroundColor: item.color + '18' }]}>
              <Ionicons name={item.icon} size={22} color={item.color} />
            </View>
            <View style={s.cardBody}>
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
    pageHeader: {
      backgroundColor: c.surface, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 14,
      borderBottomWidth: 1, borderBottomColor: c.border,
    },
    breadcrumb: { fontSize: 10, fontWeight: '700', color: c.textMuted, letterSpacing: 1, marginBottom: 6 },
    pageTitle: { fontSize: 30, fontFamily: SERIF, color: c.textPrimary, marginBottom: 4 },
    subtitle: { fontSize: 12, color: c.textSecondary },

    ownerBadge: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      marginHorizontal: 16, marginTop: 12, marginBottom: 4,
      backgroundColor: '#7c3aed18', paddingHorizontal: 12, paddingVertical: 8,
      borderRadius: 10, borderWidth: 1, borderColor: '#7c3aed33',
    },
    ownerText: { fontSize: 12, fontWeight: '600', color: '#7c3aed' },

    list: { padding: 16, gap: 10 },
    card: {
      flexDirection: 'row', alignItems: 'center', gap: 14,
      backgroundColor: c.surface, borderRadius: 14, padding: 16,
      borderWidth: 1, borderColor: c.border,
    },
    iconBox: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    cardBody: { flex: 1 },
    cardLabel: { fontSize: 15, fontWeight: '700', color: c.textPrimary, marginBottom: 2 },
    cardDesc: { fontSize: 12, color: c.textSecondary },
  });
}
