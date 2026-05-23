import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl,
  TouchableOpacity, Modal, TextInput, Alert, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useApi } from '../../hooks/useApi';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useTheme } from '../../contexts/ThemeContext';
import { AppColors } from '../../utils/colors';
import LoadingSpinner from '../../components/common/LoadingSpinner';

type Tab = 'work' | 'goals' | 'reviews';

interface Goal {
  id: number;
  goal_name: string;
  description?: string;
  status: string;
  weightage?: number;
  cycle_id?: number;
  cycle_name?: string;
}

interface Review {
  id: number;
  cycle_name?: string;
  status: string;
  self_rating?: number;
  final_rating?: number;
  created_at?: string;
}

interface Appraisal {
  id: number;
  title?: string;
  status: string;
  cycle_name?: string;
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  pending: { bg: '#fdf6b2', text: '#c27803' },
  pending_self: { bg: '#e8f0fe', text: '#1a56db' },
  approved: { bg: '#def7ec', text: '#0e9f6e' },
  rejected: { bg: '#fde8e8', text: '#e02424' },
  submitted: { bg: '#e8f0fe', text: '#1a56db' },
  completed: { bg: '#def7ec', text: '#0e9f6e' },
  draft: { bg: '#f3f4f6', text: '#374151' },
};

function StatusBadge({ status }: { status: string }) {
  const c = STATUS_COLORS[status] ?? { bg: '#f3f4f6', text: '#374151' };
  return (
    <View style={[{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: c.bg }]}>
      <Text style={[{ fontSize: 11, fontWeight: '600', textTransform: 'capitalize', color: c.text }]}>
        {status.replace(/_/g, ' ')}
      </Text>
    </View>
  );
}

export default function PerformanceScreen() {
  const api = useApi();
  const { workspace } = useWorkspace();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();

  const [activeTab, setActiveTab] = useState<Tab>('work');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [pendingReviews, setPendingReviews] = useState<Review[]>([]);
  const [pendingAppraisals, setPendingAppraisals] = useState<Appraisal[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [allReviews, setAllReviews] = useState<Review[]>([]);

  const [showCreateGoal, setShowCreateGoal] = useState(false);
  const [goalTitle, setGoalTitle] = useState('');
  const [goalDesc, setGoalDesc] = useState('');
  const [goalWeightage, setGoalWeightage] = useState('');
  const [saving, setSaving] = useState(false);
  const [cycles, setCycles] = useState<any[]>([]);
  const [selectedCycleId, setSelectedCycleId] = useState<number | null>(null);
  const [userRoleId, setUserRoleId] = useState<number | null>(null);
  const [loadingModal, setLoadingModal] = useState(false);

  const load = useCallback(async () => {
    if (!workspace) return;
    try {
      const [pendingRes, appraisalRes, goalsRes, reviewsRes] = await Promise.all([
        api.performance.listPendingForMe(workspace.id).catch(() => ({ data: [] })),
        api.performance.getAppraisals(workspace.id, { my: true }).catch(() => ({ data: [] })),
        api.performance.getGoals(workspace.id).catch(() => ({ data: [] })),
        api.performance.listMyReviews(workspace.id).catch(() => ({ data: [] })),
      ]);
      const norm = (d: any) =>
        Array.isArray(d) ? d : (Array.isArray(d?.items) ? d.items : []);
      setPendingReviews(norm(pendingRes.data));
      setPendingAppraisals(norm(appraisalRes.data));
      setGoals(norm(goalsRes.data));
      setAllReviews(norm(reviewsRes.data));
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

  const openCreateGoal = async () => {
    setShowCreateGoal(true);
    if (!workspace) return;
    setLoadingModal(true);
    try {
      const [cyclesRes, meRes, empRes] = await Promise.all([
        api.performance.getCycles(workspace.id),
        api.me.getProfile(),
        api.employees.list(workspace.id),
      ]);
      const cycleList = cyclesRes.data?.items ?? [];
      setCycles(cycleList);
      if (cycleList.length === 1) setSelectedCycleId(cycleList[0].id);
      const myId = meRes.data?.id ?? meRes.data?.user?.id;
      const employees: any[] = empRes.data?.items ?? empRes.data?.employees ?? [];
      const myEmployee = employees.find((e) => e.platform_user_id === myId);
      if (myEmployee?.role_id) setUserRoleId(myEmployee.role_id);
    } catch {} finally {
      setLoadingModal(false);
    }
  };

  const handleCreateGoal = async () => {
    if (!goalTitle.trim() || !workspace) return;
    if (!selectedCycleId) { Alert.alert('Validation', 'Please select a review cycle.'); return; }
    if (!userRoleId) { Alert.alert('Error', 'No role is assigned to your profile. Ask your admin.'); return; }
    const w = parseFloat(goalWeightage);
    if (!goalWeightage || isNaN(w) || w <= 0 || w > 100) {
      Alert.alert('Validation', 'Weightage must be a number between 1 and 100.');
      return;
    }
    setSaving(true);
    try {
      await api.performance.createGoal(workspace.id, {
        goal_name: goalTitle.trim(),
        description: goalDesc.trim() || undefined,
        weightage: w,
        role_id: userRoleId,
        cycle_id: selectedCycleId,
      });
      setGoalTitle(''); setGoalDesc(''); setGoalWeightage(''); setSelectedCycleId(null);
      setShowCreateGoal(false);
      await load();
    } catch {
      Alert.alert('Error', 'Failed to create goal');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitGoal = async (goalId: number) => {
    if (!workspace) return;
    try {
      await api.performance.submitGoalForApproval(workspace.id, goalId);
      await load();
    } catch {
      Alert.alert('Error', 'Failed to submit goal for approval');
    }
  };

  if (loading) return <LoadingSpinner />;

  const tabs: { key: Tab; label: string }[] = [
    { key: 'work', label: 'My Work' },
    { key: 'goals', label: 'My Goals' },
    { key: 'reviews', label: 'My Reviews' },
  ];

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <Text style={s.title}>Performance</Text>
        <TouchableOpacity onPress={() => navigation.navigate('TaskReports')}>
          <View style={s.reportsBtn}>
            <Ionicons name="bar-chart-outline" size={16} color={colors.primary} />
            <Text style={s.reportsBtnText}>Task Reports</Text>
          </View>
        </TouchableOpacity>
      </View>

      <View style={s.tabBar}>
        {tabs.map((t) => (
          <TouchableOpacity
            key={t.key}
            style={[s.tab, activeTab === t.key && s.tabActive]}
            onPress={() => setActiveTab(t.key)}
          >
            <Text style={[s.tabText, activeTab === t.key && s.tabTextActive]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={s.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {activeTab === 'work' && (
          <>
            <Text style={s.sectionLabel}>Pending Self-Ratings</Text>
            {pendingReviews.length === 0 ? (
              <View style={s.emptyCard}>
                <Ionicons name="checkmark-circle-outline" size={32} color={colors.success} />
                <Text style={s.emptyText}>No pending self-ratings</Text>
              </View>
            ) : (
              pendingReviews.map((r) => (
                <View key={r.id} style={s.card}>
                  <View style={s.cardRow}>
                    <Text style={s.cardTitle}>{r.cycle_name ?? `Review #${r.id}`}</Text>
                    <StatusBadge status={r.status} />
                  </View>
                  {r.status === 'pending_self' && (
                    <Text style={s.cardHint}>Rate yourself to proceed</Text>
                  )}
                </View>
              ))
            )}

            <Text style={[s.sectionLabel, { marginTop: 20 }]}>My Appraisals</Text>
            {pendingAppraisals.length === 0 ? (
              <View style={s.emptyCard}>
                <Text style={s.emptyText}>No appraisals found</Text>
              </View>
            ) : (
              pendingAppraisals.map((a) => (
                <View key={a.id} style={s.card}>
                  <View style={s.cardRow}>
                    <Text style={s.cardTitle}>{a.title ?? a.cycle_name ?? `Appraisal #${a.id}`}</Text>
                    <StatusBadge status={a.status} />
                  </View>
                </View>
              ))
            )}
          </>
        )}

        {activeTab === 'goals' && (
          <>
            <View style={s.sectionRow}>
              <Text style={s.sectionLabel}>My Goals</Text>
              <TouchableOpacity style={s.addBtn} onPress={openCreateGoal}>
                <Ionicons name="add" size={16} color="#ffffff" />
                <Text style={s.addBtnText}>Add Goal</Text>
              </TouchableOpacity>
            </View>

            {goals.length === 0 ? (
              <View style={s.emptyCard}>
                <Ionicons name="flag-outline" size={32} color={colors.gray300} />
                <Text style={s.emptyText}>No goals yet. Add your first goal.</Text>
              </View>
            ) : (
              goals.map((g) => (
                <View key={g.id} style={s.card}>
                  <View style={s.cardRow}>
                    <Text style={s.cardTitle} numberOfLines={2}>{g.goal_name}</Text>
                    <StatusBadge status={g.status} />
                  </View>
                  {g.cycle_name && <Text style={s.cardMeta}>Cycle: {g.cycle_name}</Text>}
                  {g.weightage != null && <Text style={s.cardMeta}>Weightage: {g.weightage}%</Text>}
                  {g.status === 'pending' && (
                    <TouchableOpacity style={s.submitBtn} onPress={() => handleSubmitGoal(g.id)}>
                      <Text style={s.submitBtnText}>Submit for Approval</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))
            )}
          </>
        )}

        {activeTab === 'reviews' && (
          <>
            <Text style={s.sectionLabel}>My Performance Reviews</Text>
            {allReviews.length === 0 ? (
              <View style={s.emptyCard}>
                <Ionicons name="document-text-outline" size={32} color={colors.gray300} />
                <Text style={s.emptyText}>No reviews found</Text>
              </View>
            ) : (
              allReviews.map((r) => (
                <View key={r.id} style={s.card}>
                  <View style={s.cardRow}>
                    <Text style={s.cardTitle}>{r.cycle_name ?? `Review #${r.id}`}</Text>
                    <StatusBadge status={r.status} />
                  </View>
                  {r.self_rating != null && <Text style={s.cardMeta}>Self Rating: {r.self_rating}</Text>}
                  {r.final_rating != null && <Text style={s.cardMeta}>Final Rating: {r.final_rating}</Text>}
                </View>
              ))
            )}
          </>
        )}
      </ScrollView>

      <Modal visible={showCreateGoal} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <ScrollView style={s.modalSheet} keyboardShouldPersistTaps="handled">
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>New Goal</Text>
              <TouchableOpacity onPress={() => setShowCreateGoal(false)}>
                <Ionicons name="close" size={22} color={colors.gray600} />
              </TouchableOpacity>
            </View>

            {loadingModal ? (
              <ActivityIndicator color={colors.primary} style={{ marginVertical: 20 }} />
            ) : (
              <>
                <Text style={s.fieldLabel}>Review Cycle *</Text>
                {cycles.length === 0 ? (
                  <Text style={s.hintText}>No review cycles available. Ask your admin to create one.</Text>
                ) : (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
                    {cycles.map((c: any) => (
                      <TouchableOpacity
                        key={c.id}
                        style={[s.cycleChip, selectedCycleId === c.id && s.cycleChipActive]}
                        onPress={() => setSelectedCycleId(c.id)}
                      >
                        <Text style={[s.cycleChipText, selectedCycleId === c.id && s.cycleChipTextActive]}>
                          {c.cycle_name} ({c.year})
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}

                <Text style={s.fieldLabel}>Goal Name *</Text>
                <TextInput
                  style={s.input}
                  value={goalTitle}
                  onChangeText={setGoalTitle}
                  placeholder="Goal title"
                  placeholderTextColor={colors.gray400}
                />

                <Text style={s.fieldLabel}>Description</Text>
                <TextInput
                  style={[s.input, s.inputMulti]}
                  value={goalDesc}
                  onChangeText={setGoalDesc}
                  placeholder="Optional description"
                  placeholderTextColor={colors.gray400}
                  multiline
                  numberOfLines={3}
                />

                <Text style={s.fieldLabel}>Weightage (%) *</Text>
                <TextInput
                  style={s.input}
                  value={goalWeightage}
                  onChangeText={setGoalWeightage}
                  placeholder="e.g. 25"
                  placeholderTextColor={colors.gray400}
                  keyboardType="numeric"
                />

                <TouchableOpacity
                  style={[s.saveBtn, (!goalTitle.trim() || saving) && s.saveBtnDisabled]}
                  onPress={handleCreateGoal}
                  disabled={!goalTitle.trim() || saving}
                >
                  {saving ? (
                    <ActivityIndicator color="#ffffff" size="small" />
                  ) : (
                    <Text style={s.saveBtnText}>Create Goal</Text>
                  )}
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

function makeStyles(c: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    header: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      backgroundColor: c.surface, paddingHorizontal: 20, paddingVertical: 14,
      borderBottomWidth: 1, borderBottomColor: c.border,
    },
    title: { fontSize: 20, fontWeight: '700', color: c.textPrimary },
    reportsBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      backgroundColor: c.primaryLight, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
    },
    reportsBtnText: { fontSize: 13, color: c.primary, fontWeight: '600' },
    tabBar: {
      flexDirection: 'row', backgroundColor: c.surface,
      borderBottomWidth: 1, borderBottomColor: c.border,
    },
    tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
    tabActive: { borderBottomWidth: 2, borderBottomColor: c.primary },
    tabText: { fontSize: 13, fontWeight: '500', color: c.textSecondary },
    tabTextActive: { color: c.primary, fontWeight: '700' },
    content: { padding: 16, paddingBottom: 32 },
    sectionLabel: {
      fontSize: 12, fontWeight: '700', color: c.textSecondary,
      textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10,
    },
    sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    card: {
      backgroundColor: c.surface, borderRadius: 12, padding: 14, marginBottom: 10,
      borderWidth: 1, borderColor: c.border,
      shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 2,
    },
    cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
    cardTitle: { flex: 1, fontSize: 14, fontWeight: '600', color: c.textPrimary },
    cardMeta: { fontSize: 12, color: c.textSecondary, marginTop: 4 },
    cardHint: { fontSize: 12, color: c.primary, marginTop: 6, fontStyle: 'italic' },
    emptyCard: {
      backgroundColor: c.surface, borderRadius: 12, padding: 24,
      alignItems: 'center', gap: 8, marginBottom: 10, borderWidth: 1, borderColor: c.border,
    },
    emptyText: { fontSize: 13, color: c.textSecondary, textAlign: 'center' },
    addBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      backgroundColor: c.primary, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
    },
    addBtnText: { fontSize: 13, color: '#ffffff', fontWeight: '600' },
    submitBtn: {
      marginTop: 10, paddingVertical: 8, borderRadius: 8,
      backgroundColor: c.primaryLight, alignItems: 'center',
    },
    submitBtnText: { fontSize: 13, color: c.primary, fontWeight: '600' },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalSheet: {
      backgroundColor: c.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20,
      padding: 20, paddingBottom: 40,
    },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    modalTitle: { fontSize: 17, fontWeight: '700', color: c.textPrimary },
    fieldLabel: { fontSize: 13, fontWeight: '600', color: c.textSecondary, marginBottom: 6, marginTop: 12 },
    input: {
      borderWidth: 1, borderColor: c.border, borderRadius: 10,
      paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: c.textPrimary,
      backgroundColor: c.gray50,
    },
    inputMulti: { height: 80, textAlignVertical: 'top' },
    saveBtn: {
      marginTop: 20, backgroundColor: c.primary, borderRadius: 12,
      paddingVertical: 14, alignItems: 'center',
    },
    saveBtnDisabled: { backgroundColor: c.gray300 },
    saveBtnText: { fontSize: 15, color: '#ffffff', fontWeight: '700' },
    hintText: { fontSize: 13, color: c.gray500, marginBottom: 12, fontStyle: 'italic' },
    cycleChip: {
      paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, marginRight: 8, marginBottom: 12,
      borderWidth: 1.5, borderColor: c.border, backgroundColor: c.surface,
    },
    cycleChipActive: { backgroundColor: c.primary, borderColor: c.primary },
    cycleChipText: { fontSize: 13, fontWeight: '500', color: c.gray600 },
    cycleChipTextActive: { color: '#ffffff' },
  });
}
