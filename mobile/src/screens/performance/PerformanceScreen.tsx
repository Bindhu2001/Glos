import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl,
  TouchableOpacity, Modal, TextInput, Alert, ActivityIndicator, Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useApi } from '../../hooks/useApi';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useHasTeam } from '../../contexts/HasTeamContext';
import { useTheme } from '../../contexts/ThemeContext';
import { AppColors } from '../../utils/colors';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import LoadError from '../../components/common/LoadError';
import { useLoadWithTimeout } from '../../hooks/useLoadWithTimeout';
import EmptyState from '../../components/common/EmptyState';

type Tab = 'work' | 'goals' | 'reviews' | 'team' | 'recognitions';

interface Goal {
  id: number;
  role_id?: number;
  goal_name: string;
  description?: string;
  status: string;
  weightage?: number;
  target_l1?: string;
  target_l2?: string;
  target_l3?: string;
  target_l4?: string;
  target_l5?: string;
  is_active?: number | boolean;
  cycle_id?: number;
  cycle_name?: string;
  employee_name?: string;
  user_name?: string;
}

interface Review {
  id: number;
  cycle_id?: number;
  cycle_name?: string;
  status: string;
  self_score?: number;
  manager_score?: number;
  final_score?: number;
  created_at?: string;
  employee_name?: string;
  reviewee_name?: string;
}

const reviewTitle = (r: Review) => r.cycle_name || (r.cycle_id ? `Cycle #${r.cycle_id}` : `Review #${r.id}`);

interface Appraisal {
  id: number;
  status: string;
  reason?: string;
  employee?: { first_name?: string; last_name?: string; email?: string };
}

const REASON_LABELS: Record<string, string> = {
  salary_increment: 'Salary Increment',
  annual_appraisal: 'Annual Appraisal',
  promotion: 'Promotion',
  disciplinary_action: 'Disciplinary Action',
  others: 'Others',
};

const appraisalTitle = (a: Appraisal) => {
  const emp = a.employee;
  const name = emp ? [emp.first_name, emp.last_name].filter(Boolean).join(' ') : '';
  return name || REASON_LABELS[a.reason ?? ''] || `Appraisal #${a.id}`;
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  pending:          { bg: 'rgba(245,158,11,0.15)',  text: '#f59e0b' },
  pending_self:     { bg: 'rgba(59,130,246,0.15)',  text: '#60a5fa' },
  pending_manager:  { bg: 'rgba(245,158,11,0.15)',  text: '#f59e0b' },
  pending_approver: { bg: 'rgba(245,158,11,0.15)',  text: '#f59e0b' },
  approved:         { bg: 'rgba(16,185,129,0.15)',  text: '#10b981' },
  rejected:         { bg: 'rgba(239,68,68,0.15)',   text: '#ef4444' },
  submitted:        { bg: 'rgba(59,130,246,0.15)',  text: '#60a5fa' },
  completed:        { bg: 'rgba(16,185,129,0.15)',  text: '#10b981' },
  draft:            { bg: 'rgba(107,114,128,0.15)', text: '#9ca3af' },
};

function StatusBadge({ status }: { status: string }) {
  const c = STATUS_COLORS[status] ?? { bg: 'rgba(107,114,128,0.15)', text: '#9ca3af' };
  return (
    <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: c.bg }}>
      <Text style={{ fontSize: 11, fontWeight: '600', textTransform: 'capitalize', color: c.text }}>
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

  const isAdmin = workspace?.role === 'super_admin' || workspace?.role === 'admin';
  const { canSeeTeamContent } = useHasTeam();

  const [activeTab, setActiveTab] = useState<Tab>('work');
  const [refreshing, setRefreshing] = useState(false);
  const { loading, loadError, run } = useLoadWithTimeout();

  // Personal data
  const [pendingReviews, setPendingReviews] = useState<Review[]>([]);
  const [pendingAppraisals, setPendingAppraisals] = useState<Appraisal[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [allReviews, setAllReviews] = useState<Review[]>([]);

  // Team data
  const [teamGoals, setTeamGoals] = useState<Goal[]>([]);
  const [teamReviews, setTeamReviews] = useState<Review[]>([]);
  const [teamLoading, setTeamLoading] = useState(false);
  const [managerAppraisals, setManagerAppraisals] = useState<Appraisal[]>([]);
  const [approverAppraisals, setApproverAppraisals] = useState<Appraisal[]>([]);
  const [appreciations, setAppreciations] = useState<any[]>([]);

  const [search, setSearch] = useState('');

  const [reviewSubTab, setReviewSubTab] = useState<'active' | 'completed'>('active');

  // Create/Edit goal modal
  const [showCreateGoal, setShowCreateGoal] = useState(false);
  const [editingGoalId, setEditingGoalId] = useState<number | null>(null);
  const [goalTitle, setGoalTitle] = useState('');
  const [goalDesc, setGoalDesc] = useState('');
  const [goalWeightage, setGoalWeightage] = useState('');
  const [goalTargets, setGoalTargets] = useState<string[]>(['', '', '', '', '']);
  const [saving, setSaving] = useState(false);
  const [roles, setRoles] = useState<any[]>([]);
  const [userRoleId, setUserRoleId] = useState<number | null>(null);
  const [loadingModal, setLoadingModal] = useState(false);

  // Reject goal modal
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectGoalId, setRejectGoalId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejecting, setRejecting] = useState(false);

  const load = useCallback(async () => {
    if (!workspace) return;
    try {
      const [pendingRes, appraisalRes, goalsRes, reviewsRes, teamGoalsRes, teamReviewsRes, mgrAppraisalRes, approverAppraisalRes, apprRes] = await Promise.all([
        api.performance.listPendingForMe(workspace.id).catch(() => ({ data: [] })),
        api.performance.getAppraisals(workspace.id, { my: true }).catch(() => ({ data: [] })),
        api.performance.getGoals(workspace.id).catch(() => ({ data: [] })),
        api.performance.listMyReviews(workspace.id).catch(() => ({ data: [] })),
        api.performance.listTeamGoals(workspace.id).catch(() => ({ data: [] })),
        api.performance.listTeamReviews(workspace.id).catch(() => ({ data: [] })),
        api.performance.getAppraisals(workspace.id, { view: 'manage' }).catch(() => ({ data: [] })),
        api.performance.getAppraisals(workspace.id, { view: 'pending_approver' }).catch(() => ({ data: [] })),
        api.appreciations.listReceived(workspace.id).catch(() => ({ data: [] })),
      ]);
      const norm = (d: any) => Array.isArray(d) ? d : (Array.isArray(d?.items) ? d.items : []);
      setPendingReviews(norm(pendingRes.data));
      setPendingAppraisals(norm(appraisalRes.data));
      setGoals(norm(goalsRes.data));
      setAllReviews(norm(reviewsRes.data));
      setTeamGoals(norm(teamGoalsRes.data));
      setTeamReviews(norm(teamReviewsRes.data));
      setManagerAppraisals(norm(mgrAppraisalRes.data));
      setApproverAppraisals(norm(approverAppraisalRes.data));
      setAppreciations(norm(apprRes.data));
    } catch {}
  }, [workspace, api]);

  const loadTeam = useCallback(async () => {
    if (!workspace) return;
    setTeamLoading(true);
    try {
      const [goalsRes, reviewsRes] = await Promise.all([
        api.performance.listTeamGoals(workspace.id).catch(() => ({ data: [] })),
        (workspace.role === 'super_admin'
          ? api.performance.listAllReviews(workspace.id)
          : api.performance.listTeamReviews(workspace.id)
        ).catch(() => ({ data: [] })),
      ]);
      const norm = (d: any) => Array.isArray(d) ? d : (Array.isArray(d?.items) ? d.items : []);
      setTeamGoals(norm(goalsRes.data));
      setTeamReviews(norm(reviewsRes.data));
    } catch {} finally { setTeamLoading(false); }
  }, [workspace, api]);

  useEffect(() => { run(load); }, [load]);

  useEffect(() => {
    if (activeTab === 'team') loadTeam();
  }, [activeTab]);

  const onRefresh = async () => {
    setRefreshing(true);
    await (activeTab === 'team' ? loadTeam() : run(load, true));
    setRefreshing(false);
  };

  // ── Goal actions ──────────────────────────────────────────
  const handleApproveGoal = async (goalId: number) => {
    if (!workspace) return;
    try {
      await api.performance.approveGoal(workspace.id, goalId);
      setTeamGoals(prev => prev.map(g =>
        g.id === goalId ? { ...g, status: 'approved' } : g
      ));
    } catch {
      Alert.alert('Error', 'Failed to approve goal');
    }
  };

  const openRejectGoal = (goalId: number) => {
    setRejectGoalId(goalId);
    setRejectReason('');
    setShowRejectModal(true);
  };

  const handleRejectGoal = async () => {
    if (!workspace || !rejectGoalId) return;
    if (!rejectReason.trim()) { Alert.alert('Reason required', 'Please enter a rejection reason.'); return; }
    setRejecting(true);
    try {
      await api.performance.rejectGoal(workspace.id, rejectGoalId, rejectReason.trim());
      setTeamGoals(prev => prev.map(g =>
        g.id === rejectGoalId ? { ...g, status: 'rejected' } : g
      ));
      setShowRejectModal(false);
    } catch {
      Alert.alert('Error', 'Failed to reject goal');
    } finally { setRejecting(false); }
  };

  // ── Create / Edit goal ───────────────────────────────────────
  const resetGoalForm = () => {
    setGoalTitle(''); setGoalDesc(''); setGoalWeightage(''); setGoalTargets(['', '', '', '', '']);
    setEditingGoalId(null);
  };

  const openCreateGoal = async () => {
    resetGoalForm();
    setShowCreateGoal(true);
    if (!workspace) return;
    setLoadingModal(true);
    try {
      const dashRes = await api.dashboard.getMyDashboard(workspace.id);
      const roleList: any[] = dashRes.data?.roles ?? [];
      setRoles(roleList);
      if (roleList[0]?.id) setUserRoleId(roleList[0].id);
    } catch {} finally { setLoadingModal(false); }
  };

  const openEditGoal = (g: Goal) => {
    setEditingGoalId(g.id);
    setGoalTitle(g.goal_name ?? '');
    setGoalDesc(g.description ?? '');
    setGoalWeightage(g.weightage != null ? String(g.weightage) : '');
    setGoalTargets([g.target_l1 ?? '', g.target_l2 ?? '', g.target_l3 ?? '', g.target_l4 ?? '', g.target_l5 ?? '']);
    setUserRoleId(g.role_id ?? null);
    setRoles([]);
    setShowCreateGoal(true);
  };

  const handleCreateGoal = async () => {
    if (!goalTitle.trim() || !workspace) return;
    if (!editingGoalId && !userRoleId) { Alert.alert('Error', 'No role is assigned to your profile. Ask your admin.'); return; }
    const w = parseFloat(goalWeightage);
    if (!goalWeightage || isNaN(w) || w <= 0 || w > 100) {
      Alert.alert('Validation', 'Weightage must be a number between 1 and 100.');
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        goal_name: goalTitle.trim(),
        description: goalDesc.trim() || undefined,
        weightage: w,
        target_l1: goalTargets[0].trim() || undefined,
        target_l2: goalTargets[1].trim() || undefined,
        target_l3: goalTargets[2].trim() || undefined,
        target_l4: goalTargets[3].trim() || undefined,
        target_l5: goalTargets[4].trim() || undefined,
      };
      if (editingGoalId) {
        await api.performance.updateGoal(workspace.id, editingGoalId, payload);
      } else {
        await api.performance.createGoal(workspace.id, { ...payload, role_id: userRoleId });
      }
      resetGoalForm();
      setShowCreateGoal(false);
      await load();
    } catch {
      Alert.alert('Error', editingGoalId ? 'Failed to update goal' : 'Failed to create goal');
    } finally { setSaving(false); }
  };

  const handleToggleGoalActive = async (goalId: number) => {
    if (!workspace) return;
    try {
      await api.performance.toggleGoalActive(workspace.id, goalId);
      await load();
    } catch {
      Alert.alert('Error', 'Failed to update goal status');
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
  if (loadError) return <LoadError onRetry={() => run(load)} />;

  const q = search.toLowerCase();
  const filteredPendingReviews = q ? pendingReviews.filter(r => (r.cycle_name ?? '').toLowerCase().includes(q)) : pendingReviews;
  const filteredAppraisals = q ? pendingAppraisals.filter(a => appraisalTitle(a).toLowerCase().includes(q)) : pendingAppraisals;
  const filteredGoals = q ? goals.filter(g => g.goal_name.toLowerCase().includes(q)) : goals;
  const filteredReviews = q ? allReviews.filter(r => (r.cycle_name ?? '').toLowerCase().includes(q)) : allReviews;
  const filteredTeamGoals = q ? teamGoals.filter(g => (g.goal_name + (g.employee_name ?? '')).toLowerCase().includes(q)) : teamGoals;
  const filteredTeamReviews = q ? teamReviews.filter(r => ((r.reviewee_name ?? r.employee_name ?? '') + (r.cycle_name ?? '')).toLowerCase().includes(q)) : teamReviews;

  const tabs: { key: Tab; label: string }[] = [
    { key: 'work', label: 'Overview' },
    { key: 'goals', label: 'Goals' },
    { key: 'reviews', label: 'Reviews' },
    ...(canSeeTeamContent ? [{ key: 'team' as Tab, label: 'Team' }] : []),
    { key: 'recognitions', label: 'Recognitions' },
  ];

  const latestReview = allReviews.find(r => r.final_score != null) ?? allReviews[0];
  const approvedGoals = goals.filter(g => g.status === 'approved').length;
  const pendingGoals = goals.filter(g => g.status === 'pending' || g.status === 'submitted').length;

  const pendingTeamGoals = teamGoals.filter(g => g.status === 'submitted').length;
  const pendingManagerReviews = teamReviews.filter(r => r.status === 'pending_manager').length;
  const totalManagerPending = pendingTeamGoals + pendingManagerReviews;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Page header */}
      <View style={s.pageHeader}>
        <Text style={s.breadcrumb}>{workspace?.name?.toUpperCase() ?? 'WORKSPACE'} · PERFORMANCE</Text>
        <View style={s.titleRow}>
          <Text style={s.pageTitle}>Performance</Text>
          {totalManagerPending > 0 && (
            <View style={s.pendingBadge}>
              <Text style={s.pendingBadgeText}>{totalManagerPending} pending</Text>
            </View>
          )}
          {isAdmin && (
            <TouchableOpacity onPress={() => navigation.navigate('CreateAppraisal', { appId: workspace!.id })}>
              <View style={s.reportsBtn}>
                <Ionicons name="add" size={15} color={colors.primary} />
                <Text style={s.reportsBtnText}>Appraisal</Text>
              </View>
            </TouchableOpacity>
          )}
          {isAdmin && (
            <TouchableOpacity onPress={() => navigation.navigate('TaskReports')}>
              <View style={s.reportsBtn}>
                <Ionicons name="bar-chart-outline" size={15} color={colors.primary} />
                <Text style={s.reportsBtnText}>Reports</Text>
              </View>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Tab bar */}
      <View style={s.tabBar}>
        {tabs.map((t) => (
          <TouchableOpacity
            key={t.key}
            style={[s.tab, activeTab === t.key && s.tabActive]}
            onPress={() => setActiveTab(t.key)}
          >
            <Text style={[s.tabText, activeTab === t.key && s.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Search bar */}
      <View style={s.searchBar}>
        <Ionicons name="search-outline" size={16} color={colors.gray400} />
        <TextInput
          style={s.searchInput}
          placeholder="Search..."
          placeholderTextColor={colors.gray400}
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={16} color={colors.gray400} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        contentContainerStyle={s.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Overview ──────────────────────────────────── */}
        {activeTab === 'work' && (
          <>
            {latestReview && (
              <View style={s.ratingCard}>
                <Text style={s.ratingCycle}>{latestReview.cycle_name?.toUpperCase() ?? 'CURRENT CYCLE'}</Text>
                <View style={s.ratingRow}>
                  <View>
                    <Text style={s.ratingNum}>
                      {latestReview.final_score != null ? latestReview.final_score
                        : latestReview.self_score != null ? latestReview.self_score : '—'}
                      <Text style={s.ratingMax}>/5</Text>
                    </Text>
                    <Text style={s.ratingLabel}>
                      {latestReview.final_score != null ? 'Final Rating' : 'Self Rating'}
                    </Text>
                  </View>
                  <StatusBadge status={latestReview.status} />
                </View>
              </View>
            )}

            <View style={s.actionCards}>
              <View style={s.actionCard}>
                <Ionicons name="flag-outline" size={20} color={colors.primary} />
                <Text style={s.actionNum}>{approvedGoals}</Text>
                <Text style={s.actionCardLabel}>Approved Goals</Text>
              </View>
              <View style={[s.actionCard, s.actionCardMid]}>
                <Ionicons name="time-outline" size={20} color={colors.warning} />
                <Text style={[s.actionNum, { color: colors.warning }]}>{pendingGoals}</Text>
                <Text style={s.actionCardLabel}>Pending Goals</Text>
              </View>
              <View style={s.actionCard}>
                <Ionicons name="document-text-outline" size={20} color={colors.success} />
                <Text style={[s.actionNum, { color: colors.success }]}>{allReviews.length}</Text>
                <Text style={s.actionCardLabel}>Reviews</Text>
              </View>
            </View>

            <Text style={s.sectionLabel}>Pending Self-Ratings</Text>
            {filteredPendingReviews.length === 0 ? (
              <EmptyState icon="checkmark-circle-outline" title="No pending self-ratings" />
            ) : filteredPendingReviews.map((r) => (
              <TouchableOpacity
                key={r.id} style={s.card} activeOpacity={0.7}
                onPress={() => navigation.navigate('ReviewDetail', { reviewId: r.id, appId: workspace?.id ?? 0 })}
              >
                <View style={s.cardRow}>
                  <Text style={s.cardTitle}>{reviewTitle(r)}</Text>
                  <StatusBadge status={r.status} />
                </View>
                {r.status === 'pending_self' && (
                  <Text style={s.cardHint}>Tap to rate yourself</Text>
                )}
              </TouchableOpacity>
            ))}

            {pendingTeamGoals > 0 && (
              <>
                <Text style={[s.sectionLabel, { marginTop: 20 }]}>Goal Approvals Needed</Text>
                {filteredTeamGoals.filter(g => g.status === 'submitted').map((g) => (
                  <View key={g.id} style={s.card}>
                    <View style={s.cardRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.cardTitle} numberOfLines={1}>{g.goal_name}</Text>
                        {(g.employee_name ?? g.user_name) && (
                          <Text style={s.cardMeta}>{g.employee_name ?? g.user_name}</Text>
                        )}
                      </View>
                      <StatusBadge status={g.status} />
                    </View>
                    <View style={s.approvalRow}>
                      <TouchableOpacity style={s.approveBtn} onPress={() => handleApproveGoal(g.id)}>
                        <Ionicons name="checkmark" size={14} color="#ffffff" />
                        <Text style={s.approveBtnText}>Approve</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={s.rejectBtn} onPress={() => openRejectGoal(g.id)}>
                        <Ionicons name="close" size={14} color={colors.danger} />
                        <Text style={s.rejectBtnText}>Reject</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </>
            )}

            {pendingManagerReviews > 0 && (
              <>
                <Text style={[s.sectionLabel, { marginTop: 20 }]}>Pending Manager Ratings</Text>
                {filteredTeamReviews.filter(r => r.status === 'pending_manager').map((r) => (
                  <TouchableOpacity
                    key={r.id} style={s.card} activeOpacity={0.7}
                    onPress={() => navigation.navigate('ReviewDetail', { reviewId: r.id, appId: workspace?.id ?? 0 })}
                  >
                    <View style={s.cardRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.cardTitle}>{r.reviewee_name ?? r.employee_name ?? reviewTitle(r)}</Text>
                        {r.cycle_name && <Text style={s.cardMeta}>{r.cycle_name}</Text>}
                      </View>
                      <StatusBadge status={r.status} />
                    </View>
                    <Text style={s.cardHint}>Tap to submit manager rating</Text>
                  </TouchableOpacity>
                ))}
              </>
            )}

            <Text style={[s.sectionLabel, { marginTop: 20 }]}>My Appraisals</Text>
            {filteredAppraisals.length === 0 ? (
              <EmptyState icon="document-text-outline" title="No appraisals found" />
            ) : filteredAppraisals.map((a) => (
              <TouchableOpacity
                key={a.id} style={s.card} activeOpacity={0.7}
                onPress={() => navigation.navigate('AppraisalDetail', { appraisalId: a.id, appId: workspace?.id ?? 0 })}
              >
                <View style={s.cardRow}>
                  <Text style={s.cardTitle}>{appraisalTitle(a)}</Text>
                  <StatusBadge status={a.status} />
                </View>
              </TouchableOpacity>
            ))}

            {managerAppraisals.length > 0 && (
              <>
                <Text style={[s.sectionLabel, { marginTop: 20 }]}>To Review (Manager)</Text>
                {managerAppraisals.map((a) => (
                  <TouchableOpacity
                    key={`mgr-${a.id}`} style={s.card} activeOpacity={0.7}
                    onPress={() => navigation.navigate('AppraisalDetail', { appraisalId: a.id, appId: workspace?.id ?? 0 })}
                  >
                    <View style={s.cardRow}>
                      <Text style={s.cardTitle}>{appraisalTitle(a)}</Text>
                      <StatusBadge status={a.status} />
                    </View>
                    <Text style={s.cardHint}>Awaiting your manager review</Text>
                  </TouchableOpacity>
                ))}
              </>
            )}

            {approverAppraisals.length > 0 && (
              <>
                <Text style={[s.sectionLabel, { marginTop: 20 }]}>To Approve</Text>
                {approverAppraisals.map((a) => (
                  <TouchableOpacity
                    key={`apr-${a.id}`} style={s.card} activeOpacity={0.7}
                    onPress={() => navigation.navigate('AppraisalDetail', { appraisalId: a.id, appId: workspace?.id ?? 0 })}
                  >
                    <View style={s.cardRow}>
                      <Text style={s.cardTitle}>{appraisalTitle(a)}</Text>
                      <StatusBadge status={a.status} />
                    </View>
                    <Text style={s.cardHint}>Awaiting your approval</Text>
                  </TouchableOpacity>
                ))}
              </>
            )}
          </>
        )}

        {/* ── Goals ─────────────────────────────────────── */}
        {activeTab === 'goals' && (
          <>
            <View style={s.sectionRow}>
              <Text style={s.sectionLabel}>My Goals</Text>
              <TouchableOpacity style={s.addBtn} onPress={openCreateGoal}>
                <Ionicons name="add" size={16} color="#ffffff" />
                <Text style={s.addBtnText}>Add Goal</Text>
              </TouchableOpacity>
            </View>
            {filteredGoals.length === 0 ? (
              <EmptyState icon="flag-outline" title="No goals yet" subtitle="Add your first goal." />
            ) : filteredGoals.map((g) => (
              <View key={g.id} style={s.card}>
                <View style={s.cardRow}>
                  <Text style={s.cardTitle} numberOfLines={2}>{g.goal_name}</Text>
                  <StatusBadge status={g.status} />
                </View>
                {g.description ? <Text style={s.cardMeta}>{g.description}</Text> : null}
                {g.weightage != null && <Text style={s.cardMeta}>Weightage: {g.weightage}%</Text>}
                {[g.target_l1, g.target_l2, g.target_l3, g.target_l4, g.target_l5].some(Boolean) && (
                  <Text style={s.cardMeta}>
                    Targets: {[g.target_l1, g.target_l2, g.target_l3, g.target_l4, g.target_l5].filter(Boolean).join(' · ')}
                  </Text>
                )}
                {g.status === 'approved' && (
                  <Text style={[s.cardMeta, { color: g.is_active ? colors.success : colors.textMuted, fontWeight: '600' }]}>
                    {g.is_active ? 'Active' : 'Inactive'}
                  </Text>
                )}
                <View style={s.goalActionsRow}>
                  {['pending', 'rejected', 'approved'].includes(g.status) && (
                    <TouchableOpacity style={s.editGoalBtn} onPress={() => openEditGoal(g)}>
                      <Ionicons name="create-outline" size={13} color={colors.primary} />
                      <Text style={s.editGoalBtnText}>Edit</Text>
                    </TouchableOpacity>
                  )}
                  {g.status === 'approved' && (
                    <TouchableOpacity style={s.editGoalBtn} onPress={() => handleToggleGoalActive(g.id)}>
                      <Ionicons name={g.is_active ? 'pause-outline' : 'play-outline'} size={13} color={colors.primary} />
                      <Text style={s.editGoalBtnText}>{g.is_active ? 'Deactivate' : 'Activate'}</Text>
                    </TouchableOpacity>
                  )}
                  {g.status === 'pending' && (
                    <TouchableOpacity style={s.submitGoalBtn} onPress={() => handleSubmitGoal(g.id)}>
                      <Text style={s.submitGoalBtnText}>Submit for Approval</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ))}
          </>
        )}

        {/* ── Reviews ───────────────────────────────────── */}
        {activeTab === 'reviews' && (
          <>
            <Text style={s.sectionLabel}>My Performance Reviews</Text>

            {/* Active / Completed toggle */}
            <View style={s.revToggleRow}>
              <TouchableOpacity
                style={[s.revToggleBtn, reviewSubTab === 'active' && s.revToggleBtnActive]}
                onPress={() => setReviewSubTab('active')}
              >
                <Text style={[s.revToggleBtnText, reviewSubTab === 'active' && s.revToggleBtnTextActive]}>Active</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.revToggleBtn, reviewSubTab === 'completed' && s.revToggleBtnActive]}
                onPress={() => setReviewSubTab('completed')}
              >
                <Text style={[s.revToggleBtnText, reviewSubTab === 'completed' && s.revToggleBtnTextActive]}>Completed</Text>
              </TouchableOpacity>
            </View>

            {reviewSubTab === 'active' ? (() => {
              const activeReviews = filteredReviews.filter(r => !['approved', 'rejected'].includes(r.status));
              return activeReviews.length === 0 ? (
                <EmptyState icon="document-text-outline" title="No active reviews" />
              ) : activeReviews.map((r) => (
                <TouchableOpacity
                  key={r.id} style={s.card} activeOpacity={0.7}
                  onPress={() => navigation.navigate('ReviewDetail', { reviewId: r.id, appId: workspace?.id ?? 0 })}
                >
                  <View style={s.cardRow}>
                    <Text style={s.cardTitle}>{reviewTitle(r)}</Text>
                    <StatusBadge status={r.status} />
                  </View>
                  {r.self_score != null && <Text style={s.cardMeta}>Self Rating: {r.self_score}/5</Text>}
                  {r.manager_score != null && <Text style={s.cardMeta}>Manager Rating: {r.manager_score}/5</Text>}
                  {r.final_score != null && <Text style={s.cardMeta}>Final Rating: {r.final_score}/5</Text>}
                </TouchableOpacity>
              ));
            })() : (() => {
              const completedReviews = filteredReviews.filter(r => ['approved', 'rejected'].includes(r.status));
              return completedReviews.length === 0 ? (
                <EmptyState icon="checkmark-done-outline" title="No completed reviews" subtitle="Approved and rejected reviews will appear here." />
              ) : completedReviews.map((r) => (
                <TouchableOpacity
                  key={r.id} style={s.card} activeOpacity={0.7}
                  onPress={() => navigation.navigate('ReviewDetail', { reviewId: r.id, appId: workspace?.id ?? 0 })}
                >
                  <View style={s.cardRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.cardTitle}>{reviewTitle(r)}</Text>
                      {r.final_score != null && (
                        <Text style={[s.cardMeta, { color: colors.success, fontWeight: '700' }]}>
                          Final Rating: {r.final_score}/5
                        </Text>
                      )}
                    </View>
                    <StatusBadge status={r.status} />
                  </View>
                  {r.self_score != null && <Text style={s.cardMeta}>Self: {r.self_score}/5</Text>}
                  {r.manager_score != null && <Text style={s.cardMeta}>Manager: {r.manager_score}/5</Text>}
                  {r.created_at && (
                    <Text style={s.cardMeta}>{new Date(r.created_at).toLocaleDateString()}</Text>
                  )}
                </TouchableOpacity>
              ));
            })()}
          </>
        )}

        {/* ── Team ─────────────────────────────────────── */}
        {activeTab === 'team' && (
          <>
            {teamLoading ? (
              <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
            ) : (
              <>
                {/* Team Goals */}
                <View style={s.sectionRow}>
                  <Text style={s.sectionLabel}>Team Goals</Text>
                  {pendingTeamGoals > 0 && (
                    <View style={s.pendingBadge}>
                      <Text style={s.pendingBadgeText}>{pendingTeamGoals} need review</Text>
                    </View>
                  )}
                </View>
                {filteredTeamGoals.length === 0 ? (
                  <EmptyState icon="flag-outline" title="No team goals" />
                ) : filteredTeamGoals.map((g) => (
                  <View key={g.id} style={s.card}>
                    <View style={s.cardRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.cardTitle} numberOfLines={2}>{g.goal_name}</Text>
                        {(g.employee_name ?? g.user_name) && (
                          <Text style={s.cardMeta}>
                            <Ionicons name="person-outline" size={11} color={colors.gray500} /> {g.employee_name ?? g.user_name}
                          </Text>
                        )}
                      </View>
                      <StatusBadge status={g.status} />
                    </View>
                    {g.cycle_name && <Text style={s.cardMeta}>Cycle: {g.cycle_name}</Text>}
                    {g.weightage != null && <Text style={s.cardMeta}>Weightage: {g.weightage}%</Text>}

                    {g.status === 'submitted' && (
                      <View style={s.approvalRow}>
                        <TouchableOpacity
                          style={s.approveBtn}
                          onPress={() => handleApproveGoal(g.id)}
                        >
                          <Ionicons name="checkmark" size={14} color="#ffffff" />
                          <Text style={s.approveBtnText}>Approve</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={s.rejectBtn}
                          onPress={() => openRejectGoal(g.id)}
                        >
                          <Ionicons name="close" size={14} color={colors.danger} />
                          <Text style={s.rejectBtnText}>Reject</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                ))}

                {/* Team Reviews */}
                <Text style={[s.sectionLabel, { marginTop: 24 }]}>
                  {workspace?.role === 'super_admin' ? 'All Reviews' : 'Team Reviews'}
                </Text>
                {filteredTeamReviews.length === 0 ? (
                  <EmptyState icon="document-text-outline" title="No team reviews" />
                ) : filteredTeamReviews.map((r) => (
                  <TouchableOpacity
                    key={r.id} style={s.card} activeOpacity={0.7}
                    onPress={() => navigation.navigate('ReviewDetail', { reviewId: r.id, appId: workspace?.id ?? 0 })}
                  >
                    <View style={s.cardRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.cardTitle}>
                          {r.reviewee_name ?? r.employee_name ?? reviewTitle(r)}
                        </Text>
                        {r.cycle_name && <Text style={s.cardMeta}>{r.cycle_name}</Text>}
                      </View>
                      <StatusBadge status={r.status} />
                    </View>
                    {r.self_score != null && <Text style={s.cardMeta}>Self: {r.self_score}/5</Text>}
                    {r.manager_score != null && <Text style={s.cardMeta}>Manager: {r.manager_score}/5</Text>}
                    {r.final_score != null && <Text style={s.cardMeta}>Final: {r.final_score}/5</Text>}
                  </TouchableOpacity>
                ))}
              </>
            )}
          </>
        )}
        {/* ── Recognitions ──────────────────────────────── */}
        {activeTab === 'recognitions' && (
          <>
            <Text style={s.sectionLabel}>Recognitions Received</Text>
            {appreciations.length === 0 ? (
              <EmptyState icon="heart-outline" title="No recognitions yet" subtitle="Appreciations from your team will appear here." />
            ) : appreciations.map((a: any) => (
              <View key={a.id} style={s.card}>
                <View style={s.cardRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.cardTitle}>{a.from_name ?? a.giver_name ?? a.sender_name ?? 'A colleague'}</Text>
                    {a.badge && <Text style={s.cardMeta}>{a.badge}</Text>}
                  </View>
                  {a.created_at && (
                    <Text style={[s.cardMeta, { fontSize: 11 }]}>
                      {new Date(a.created_at).toLocaleDateString()}
                    </Text>
                  )}
                </View>
                {a.message && <Text style={[s.cardMeta, { marginTop: 8 }]}>{a.message}</Text>}
              </View>
            ))}
          </>
        )}
      </ScrollView>

      {/* Create Goal Modal */}
      <Modal visible={showCreateGoal} animationType="slide" transparent onRequestClose={() => setShowCreateGoal(false)}>
        <KeyboardAvoidingView style={s.modalOverlay} behavior="padding">
          <View style={s.modalSheetWrapper}>
          <ScrollView style={s.modalSheet} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>{editingGoalId ? 'Edit Goal' : 'New Goal'}</Text>
              <TouchableOpacity onPress={() => setShowCreateGoal(false)}>
                <Ionicons name="close" size={22} color={colors.gray600} />
              </TouchableOpacity>
            </View>

            {loadingModal ? (
              <ActivityIndicator color={colors.primary} style={{ marginVertical: 20 }} />
            ) : (
              <>
                {!editingGoalId && roles.length > 1 && (
                  <>
                    <Text style={s.fieldLabel}>Role *</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
                      {roles.map((r: any) => (
                        <TouchableOpacity
                          key={r.id}
                          style={[s.cycleChip, userRoleId === r.id && s.cycleChipActive]}
                          onPress={() => setUserRoleId(r.id)}
                        >
                          <Text style={[s.cycleChipText, userRoleId === r.id && s.cycleChipTextActive]}>
                            {r.title}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </>
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

                <Text style={s.fieldLabel}>Targets (optional)</Text>
                {goalTargets.map((t, i) => (
                  <TextInput
                    key={i}
                    style={[s.input, { marginBottom: 8 }]}
                    value={t}
                    onChangeText={(v) => setGoalTargets((prev) => prev.map((p, pi) => (pi === i ? v : p)))}
                    placeholder={`Level ${i + 1} target`}
                    placeholderTextColor={colors.gray400}
                  />
                ))}

                <TouchableOpacity
                  style={[s.saveBtn, (!goalTitle.trim() || saving) && s.saveBtnDisabled]}
                  onPress={handleCreateGoal}
                  disabled={!goalTitle.trim() || saving}
                >
                  {saving
                    ? <ActivityIndicator color="#ffffff" size="small" />
                    : <Text style={s.saveBtnText}>{editingGoalId ? 'Save Changes' : 'Create Goal'}</Text>
                  }
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Reject Goal Modal */}
      <Modal visible={showRejectModal} transparent animationType="fade">
        <KeyboardAvoidingView
          style={s.modalOverlay}
          behavior="padding"
        >
          <View style={s.rejectSheet}>
            <Text style={s.modalTitle}>Reject Goal</Text>
            <Text style={s.rejectSubtitle}>Please provide a reason for rejection:</Text>
            <TextInput
              style={[s.input, s.inputMulti, { marginTop: 12 }]}
              value={rejectReason}
              onChangeText={setRejectReason}
              placeholder="Rejection reason..."
              placeholderTextColor={colors.gray400}
              multiline
              numberOfLines={3}
              autoFocus
            />
            <View style={s.rejectActions}>
              <TouchableOpacity
                style={s.rejectCancelBtn}
                onPress={() => setShowRejectModal(false)}
              >
                <Text style={s.rejectCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.rejectConfirmBtn, rejecting && s.saveBtnDisabled]}
                onPress={handleRejectGoal}
                disabled={rejecting}
              >
                {rejecting
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={s.rejectConfirmText}>Reject</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
    </KeyboardAvoidingView>
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
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    pageTitle: { fontSize: 30, fontFamily: SERIF, color: c.textPrimary, flex: 1 },
    pendingBadge: { backgroundColor: c.warningLight, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
    pendingBadgeText: { fontSize: 11, fontWeight: '700', color: c.warning },
    reportsBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      backgroundColor: c.primaryLight, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
    },
    reportsBtnText: { fontSize: 13, color: c.primary, fontWeight: '600' },

    tabBar: { flexDirection: 'row', backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border },
    tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
    tabActive: { borderBottomWidth: 2, borderBottomColor: c.primary },
    tabText: { fontSize: 13, fontWeight: '500', color: c.textSecondary },
    tabTextActive: { color: c.primary, fontWeight: '700' },

    content: { padding: 16, paddingBottom: 32 },

    ratingCard: {
      backgroundColor: c.surface, borderRadius: 14, padding: 18, marginBottom: 14,
      borderWidth: 1, borderColor: c.border,
    },
    ratingCycle: { fontSize: 10, fontWeight: '700', color: c.textMuted, letterSpacing: 1, marginBottom: 8 },
    ratingRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
    ratingNum: { fontSize: 44, fontWeight: '800', color: c.secondary, letterSpacing: -2 },
    ratingMax: { fontSize: 22, fontWeight: '600', color: c.textMuted },
    ratingLabel: { fontSize: 11, color: c.textSecondary, marginTop: 2 },

    actionCards: {
      flexDirection: 'row', marginBottom: 20,
      backgroundColor: c.surface, borderRadius: 14,
      borderWidth: 1, borderColor: c.border, overflow: 'hidden',
    },
    actionCard: { flex: 1, alignItems: 'center', padding: 14, gap: 4 },
    actionCardMid: { borderLeftWidth: 1, borderRightWidth: 1, borderColor: c.border },
    actionNum: { fontSize: 24, fontWeight: '800', color: c.primary, letterSpacing: -0.5 },
    actionCardLabel: { fontSize: 10, fontWeight: '600', color: c.textSecondary, textAlign: 'center' },

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

    addBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      backgroundColor: c.primary, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
    },
    addBtnText: { fontSize: 13, color: '#ffffff', fontWeight: '600' },

    submitGoalBtn: {
      flex: 1, paddingVertical: 8, borderRadius: 8,
      backgroundColor: c.primaryLight, alignItems: 'center',
    },
    submitGoalBtnText: { fontSize: 13, color: c.primary, fontWeight: '600' },
    goalActionsRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
    editGoalBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8,
      backgroundColor: c.gray50, borderWidth: 1, borderColor: c.border,
    },
    editGoalBtnText: { fontSize: 12, fontWeight: '600', color: c.primary },

    approvalRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
    approveBtn: {
      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      gap: 4, paddingVertical: 8, borderRadius: 8, backgroundColor: c.success,
    },
    approveBtnText: { fontSize: 13, fontWeight: '700', color: '#ffffff' },
    rejectBtn: {
      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      gap: 4, paddingVertical: 8, borderRadius: 8,
      backgroundColor: c.dangerLight, borderWidth: 1, borderColor: c.danger + '44',
    },
    rejectBtnText: { fontSize: 13, fontWeight: '700', color: c.danger },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalSheetWrapper: {
      backgroundColor: c.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20,
      maxHeight: '85%',
    },
    modalSheet: { padding: 20, paddingBottom: 40 },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    modalTitle: { fontSize: 17, fontWeight: '700', color: c.textPrimary },
    fieldLabel: { fontSize: 13, fontWeight: '600', color: c.textSecondary, marginBottom: 6, marginTop: 12 },
    input: {
      borderWidth: 1, borderColor: c.border, borderRadius: 10,
      paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: c.textPrimary,
      backgroundColor: c.gray50,
    },
    inputMulti: { minHeight: 80, textAlignVertical: 'top' },
    saveBtn: {
      marginTop: 20, backgroundColor: c.primary, borderRadius: 12,
      paddingVertical: 14, alignItems: 'center',
    },
    saveBtnDisabled: { opacity: 0.5 },
    saveBtnText: { fontSize: 15, color: '#ffffff', fontWeight: '700' },
    hintText: { fontSize: 13, color: c.gray500, marginBottom: 12, fontStyle: 'italic' },

    searchBar: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: c.surface, marginHorizontal: 16, marginTop: 8, marginBottom: 0,
      borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9,
      borderWidth: 1.5, borderColor: c.border,
    },
    searchInput: { flex: 1, fontSize: 14, color: c.textPrimary },

    cycleChip: {
      paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, marginRight: 8, marginBottom: 12,
      borderWidth: 1.5, borderColor: c.border, backgroundColor: c.surface,
    },
    cycleChipActive: { backgroundColor: c.primary, borderColor: c.primary },
    cycleChipText: { fontSize: 13, fontWeight: '500', color: c.gray600 },
    cycleChipTextActive: { color: '#ffffff' },

    revToggleRow: {
      flexDirection: 'row', backgroundColor: c.gray100, borderRadius: 10,
      padding: 3, marginBottom: 14,
    },
    revToggleBtn: {
      flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center',
    },
    revToggleBtnActive: {
      backgroundColor: c.surface,
      shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, elevation: 2,
    },
    revToggleBtnText: { fontSize: 13, fontWeight: '600', color: c.textSecondary },
    revToggleBtnTextActive: { color: c.primary },

    // Reject modal
    rejectSheet: {
      backgroundColor: c.surface, borderRadius: 20, margin: 20,
      padding: 24, alignSelf: 'center', width: '90%',
    },
    rejectSubtitle: { fontSize: 14, color: c.textSecondary, marginTop: 6 },
    rejectActions: { flexDirection: 'row', gap: 12, marginTop: 20 },
    rejectCancelBtn: {
      flex: 1, paddingVertical: 12, borderRadius: 10,
      backgroundColor: c.gray100, alignItems: 'center',
    },
    rejectCancelText: { fontSize: 14, fontWeight: '600', color: c.textPrimary },
    rejectConfirmBtn: {
      flex: 1, paddingVertical: 12, borderRadius: 10,
      backgroundColor: c.danger, alignItems: 'center',
    },
    rejectConfirmText: { fontSize: 14, fontWeight: '700', color: '#ffffff' },
  });
}
