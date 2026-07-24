import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useRoute, RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useApi } from '../../hooks/useApi';
import { useTheme } from '../../contexts/ThemeContext';
import { AppColors } from '../../utils/colors';
import { PeopleStackParamList } from '../../navigation/types';
import ScreenHeader from '../../components/common/ScreenHeader';
import Avatar from '../../components/common/Avatar';
import Badge from '../../components/common/Badge';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import LoadError from '../../components/common/LoadError';
import { useLoadWithTimeout } from '../../hooks/useLoadWithTimeout';

type Route = RouteProp<PeopleStackParamList, 'EmployeeDetail'>;

export default function EmployeeDetailScreen() {
  const route = useRoute<Route>();
  const { employeeId, appId } = route.params;
  const api = useApi();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();

  const [employee, setEmployee] = useState<any>(null);
  const { loading, loadError, run } = useLoadWithTimeout();

  const load = useCallback(async () => {
    const r = await api.employees.get(appId, employeeId);
    setEmployee(r.data.employee ?? r.data);
  }, [appId, employeeId, api]);

  useEffect(() => { run(load); }, [load]);

  if (loading) return <LoadingSpinner />;
  if (loadError) return <LoadError onRetry={() => run(load)} />;
  if (!employee) return null;

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <ScreenHeader title="Employee" showBack />
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <View style={s.profileCard}>
          <Avatar name={employee.full_name ?? 'Unknown'} size={72} />
          <Text style={s.name}>{employee.full_name}</Text>
          {employee.role_title && <Text style={s.roleTitle}>{employee.role_title}</Text>}
          <View style={s.badgeRow}>
            <Badge
              label={employee.status ?? 'active'}
              bg={employee.status === 'active' ? colors.successLight : colors.gray100}
              color={employee.status === 'active' ? colors.success : colors.gray500}
            />
            {employee.department_name && (
              <Badge label={employee.department_name} bg={colors.primaryLight} color={colors.primary} />
            )}
          </View>
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>Details</Text>
          {employee.email && <InfoRow icon="mail-outline" label="Email" value={employee.email} colors={colors} s={s} />}
          {employee.branch_name && <InfoRow icon="business-outline" label="Branch" value={employee.branch_name} colors={colors} s={s} />}
          {employee.location_name && <InfoRow icon="location-outline" label="Location" value={employee.location_name} colors={colors} s={s} />}
          {employee.manager_name && <InfoRow icon="person-outline" label="Manager" value={employee.manager_name} colors={colors} s={s} />}
          {employee.employment_type && <InfoRow icon="briefcase-outline" label="Type" value={employee.employment_type} colors={colors} s={s} />}
        </View>

        {employee.skills && employee.skills.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Skills</Text>
            <View style={s.skillsWrap}>
              {employee.skills.map((sk: any) => (
                <Badge key={sk.id} label={sk.name} bg={colors.gray100} color={colors.gray700} />
              ))}
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function InfoRow({
  icon, label, value, colors, s,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  colors: AppColors;
  s: ReturnType<typeof makeStyles>;
}) {
  return (
    <View style={s.infoRow}>
      <Ionicons name={icon} size={16} color={colors.gray400} />
      <Text style={s.infoLabel}>{label}</Text>
      <Text style={s.infoValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function makeStyles(c: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    content: { padding: 16, paddingBottom: 40 },
    profileCard: {
      backgroundColor: c.surface, borderRadius: 16, padding: 24,
      alignItems: 'center', marginBottom: 16,
      borderWidth: 1, borderColor: c.border,
      shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 3,
    },
    name: { fontSize: 20, fontWeight: '800', color: c.textPrimary, marginTop: 12 },
    roleTitle: { fontSize: 14, color: c.textSecondary, marginTop: 4 },
    badgeRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
    section: {
      backgroundColor: c.surface, borderRadius: 14, padding: 16, marginBottom: 12,
      borderWidth: 1, borderColor: c.border,
      shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 1,
    },
    sectionTitle: { fontSize: 13, fontWeight: '700', color: c.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 },
    infoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.border },
    infoLabel: { fontSize: 13, color: c.gray500, width: 70 },
    infoValue: { flex: 1, fontSize: 13, color: c.textPrimary },
    skillsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  });
}
