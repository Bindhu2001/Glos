import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../contexts/ThemeContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useApi } from '../../hooks/useApi';
import { AppColors } from '../../utils/colors';
import { apiErrorMessage } from '../../utils/apiError';
import LoadError from '../../components/common/LoadError';

// Backend GET /apps/:appId/hr/org-chart (routes/hr/org_chart.js) returns
// { employee_tree: [{ id, full_name, role_title, multi_role, direct_reports: [...] }], counts, ... }
// This screen renders employee_tree only — the read-only "who reports to whom"
// listing web calls the org chart's Employee view, same as web's My Organisation
// / Organization → Org Chart tab (hideCTC — mobile never shows CTC figures).
interface EmpNode {
  id: number;
  node_key?: string;
  full_name: string;
  role_title?: string;
  multi_role?: boolean;
  direct_reports: EmpNode[];
}

function EmployeeNode({ node, depth, colors, s }: { node: EmpNode; depth: number; colors: AppColors; s: any }) {
  const [expanded, setExpanded] = useState(depth < 1);
  const hasReports = node.direct_reports?.length > 0;

  return (
    <View>
      <TouchableOpacity
        style={[s.row, { marginLeft: depth * 18 }]}
        activeOpacity={hasReports ? 0.7 : 1}
        onPress={() => hasReports && setExpanded((e) => !e)}
      >
        {hasReports ? (
          <Ionicons name={expanded ? 'chevron-down' : 'chevron-forward'} size={16} color={colors.textMuted} />
        ) : (
          <View style={{ width: 16 }} />
        )}
        <View style={s.avatar}>
          <Text style={s.avatarTxt}>
            {node.full_name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.name}>{node.full_name}{node.multi_role ? ' *' : ''}</Text>
          {node.role_title ? <Text style={s.role}>{node.role_title}</Text> : null}
        </View>
        {hasReports && <Text style={s.reportsCount}>{node.direct_reports.length}</Text>}
      </TouchableOpacity>
      {expanded && hasReports && node.direct_reports.map((child) => (
        <EmployeeNode key={child.node_key ?? child.id} node={child} depth={depth + 1} colors={colors} s={s} />
      ))}
    </View>
  );
}

export default function EmployeeHierarchyScreen() {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const { workspace } = useWorkspace();
  const api = useApi();
  const insets = useSafeAreaInsets();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [tree, setTree] = useState<EmpNode[]>([]);
  const [counts, setCounts] = useState<{ employees?: number; roles?: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!workspace?.id) return;
    setLoading(true);
    try {
      const res = await api.employees.getOrgChart(workspace.id);
      setTree(res.data?.employee_tree ?? []);
      setCounts(res.data?.counts ?? null);
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not load the employee hierarchy.'));
    } finally {
      setLoading(false);
    }
  }, [workspace?.id]);

  useEffect(() => { load(); }, [load]);

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.title}>Employee Hierarchy</Text>
        <View style={{ width: 36 }} />
      </View>
      {counts && (
        <Text style={s.countsLine}>{counts.employees ?? 0} employees · {counts.roles ?? 0} roles</Text>
      )}

      {loading ? (
        <ActivityIndicator style={{ flex: 1 }} color={colors.primary} />
      ) : error ? (
        <LoadError message={error} onRetry={load} />
      ) : tree.length === 0 ? (
        <View style={s.empty}>
          <Ionicons name="git-network-outline" size={40} color={colors.gray400} />
          <Text style={s.emptyText}>No hierarchy data yet</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.list} showsVerticalScrollIndicator={false}>
          {tree.map((node) => (
            <EmployeeNode key={node.node_key ?? node.id} node={node} depth={0} colors={colors} s={s} />
          ))}
        </ScrollView>
      )}
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
    countsLine: {
      fontSize: 11, color: c.textMuted, textAlign: 'center', paddingVertical: 8,
      backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border,
    },
    empty: { alignItems: 'center', gap: 12, paddingTop: 60 },
    emptyText: { fontSize: 14, color: c.textMuted },
    list: { padding: 16, paddingBottom: 32 },
    row: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.border,
    },
    avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: c.primaryLight, alignItems: 'center', justifyContent: 'center' },
    avatarTxt: { fontSize: 11, fontWeight: '900', color: c.primary },
    name: { fontSize: 13, fontWeight: '700', color: c.textPrimary },
    role: { fontSize: 11, color: c.textMuted, marginTop: 1 },
    reportsCount: {
      fontSize: 11, fontWeight: '700', color: c.textSecondary,
      backgroundColor: c.gray50, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2,
    },
  });
}
