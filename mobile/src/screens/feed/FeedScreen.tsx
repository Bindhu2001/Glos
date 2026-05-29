import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity, RefreshControl,
  Platform, Alert, TextInput, ScrollView, Modal, ActivityIndicator,
  KeyboardAvoidingView,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useApi } from '../../hooks/useApi';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useTheme } from '../../contexts/ThemeContext';
import { AppColors } from '../../utils/colors';
import PostCard from '../../components/feed/PostCard';
import GiveAppreciationModal from '../../components/feed/GiveAppreciationModal';
import Avatar from '../../components/common/Avatar';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import { FeedStackParamList } from '../../navigation/types';
import { formatRelative } from '../../utils/format';
import { showAlert } from '../../components/common/AlertModal';

type Nav = NativeStackNavigationProp<FeedStackParamList, 'FeedList'>;
type Tab = 'feed' | 'announcements' | 'appreciations' | 'feedback';

const FEEDBACK_TYPES = [
  { key: 'general', label: 'General' },
  { key: 'constructive', label: 'Constructive' },
  { key: 'positive', label: 'Positive' },
];

export default function FeedScreen() {
  const api = useApi();
  const { workspace } = useWorkspace();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();

  const isAdmin = workspace?.role === 'super_admin' || workspace?.role === 'admin';

  const [activeTab, setActiveTab] = useState<Tab>('feed');

  // Feed tab
  const [posts, setPosts] = useState<any[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);
  const [feedRefreshing, setFeedRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [showAppreciation, setShowAppreciation] = useState(false);
  const [meId, setMeId] = useState<number | null>(null);

  // Appreciations tab
  const [appreciations, setAppreciations] = useState<any[]>([]);
  const [apprLoading, setApprLoading] = useState(false);

  // Feedback tab
  const [receivedFeedback, setReceivedFeedback] = useState<any[]>([]);
  const [givenFeedback, setGivenFeedback] = useState<any[]>([]);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackView, setFeedbackView] = useState<'received' | 'given'>('received');

  // Give Feedback modal
  const [showGiveFeedback, setShowGiveFeedback] = useState(false);
  const [fbMembers, setFbMembers] = useState<any[]>([]);
  const [fbMembersLoaded, setFbMembersLoaded] = useState(false);
  const [fbSearch, setFbSearch] = useState('');
  const [fbSelected, setFbSelected] = useState<any>(null);
  const [fbFeedbackText, setFbFeedbackText] = useState('');
  const [fbType, setFbType] = useState('general');
  const [fbIsAnonymous, setFbIsAnonymous] = useState(false);
  const [fbSubmitting, setFbSubmitting] = useState(false);

  // ── Feed ──────────────────────────────────────────────────
  const loadFeed = useCallback(async () => {
    if (!workspace) return;
    try {
      const r = await api.feed.list(workspace.id);
      const d = r.data;
      setPosts(Array.isArray(d) ? d : (d?.items ?? d?.posts ?? []));
    } catch {}
  }, [workspace, api]);

  // ── Appreciations ─────────────────────────────────────────
  const loadAppreciations = useCallback(async () => {
    if (!workspace) return;
    setApprLoading(true);
    try {
      const r = await api.appreciations.listReceived(workspace.id);
      setAppreciations(Array.isArray(r.data) ? r.data : (r.data?.items ?? []));
    } catch {} finally { setApprLoading(false); }
  }, [workspace, api]);

  // ── Feedback ──────────────────────────────────────────────
  const loadFeedback = useCallback(async () => {
    if (!workspace) return;
    setFeedbackLoading(true);
    try {
      const [recRes, givRes] = await Promise.all([
        api.feed.getReceivedFeedback(workspace.id),
        api.feed.getGivenFeedback(workspace.id),
      ]);
      setReceivedFeedback(Array.isArray(recRes.data) ? recRes.data : (recRes.data?.items ?? []));
      setGivenFeedback(Array.isArray(givRes.data) ? givRes.data : (givRes.data?.items ?? []));
    } catch {} finally { setFeedbackLoading(false); }
  }, [workspace, api]);

  useEffect(() => {
    api.me.getProfile().then((r: any) => setMeId(r.data?.id ?? r.data?.user?.id ?? null)).catch(() => {});
  }, [api]);

  useEffect(() => {
    loadFeed().finally(() => setFeedLoading(false));
  }, [loadFeed]);

  useFocusEffect(useCallback(() => { loadFeed(); }, [loadFeed]));

  useEffect(() => {
    if (activeTab === 'appreciations') loadAppreciations();
    else if (activeTab === 'feedback') loadFeedback();
  }, [activeTab]);

  const onRefreshFeed = async () => {
    setFeedRefreshing(true);
    await loadFeed();
    setFeedRefreshing(false);
  };

  // ── Post reactions ────────────────────────────────────────
  const handleReact = async (postId: number, emoji: string = '❤️') => {
    if (!workspace) return;
    try {
      const post = posts.find(p => p.id === postId);
      const prevEmoji = post?.my_reactions?.[0] ?? null; // user can only have one reaction
      const togglingOff = prevEmoji === emoji;

      // If switching from a different emoji, remove old one first
      if (prevEmoji && !togglingOff) {
        await api.feed.addReaction(workspace.id, postId, prevEmoji);
      }
      await api.feed.addReaction(workspace.id, postId, emoji);

      // Optimistic update: enforce single-selection
      setPosts(prev => prev.map(p => {
        if (p.id !== postId) return p;
        let reactions = [...(p.reactions ?? [])];

        if (togglingOff) {
          // Remove this emoji
          reactions = reactions.map((r: any) =>
            r.emoji === emoji ? { ...r, count: Math.max(0, r.count - 1) } : r
          );
          return { ...p, my_reactions: [], reactions };
        }

        // Remove old emoji count
        if (prevEmoji) {
          reactions = reactions.map((r: any) =>
            r.emoji === prevEmoji ? { ...r, count: Math.max(0, r.count - 1) } : r
          );
        }
        // Add new emoji count
        const hasNew = reactions.find((r: any) => r.emoji === emoji);
        if (hasNew) {
          reactions = reactions.map((r: any) =>
            r.emoji === emoji ? { ...r, count: r.count + 1 } : r
          );
        } else {
          reactions.push({ emoji, count: 1 });
        }
        return { ...p, my_reactions: [emoji], reactions };
      }));
    } catch {}
  };

  const handleDelete = async (postId: number) => {
    if (!workspace) return;
    try {
      await api.feed.delete(workspace.id, postId);
      setPosts(prev => prev.filter(p => p.id !== postId));
    } catch {
      Alert.alert('Error', 'Could not delete post.');
    }
  };

  const handlePin = async (postId: number) => {
    if (!workspace) return;
    try {
      await api.feed.pin(workspace.id, postId);
      setPosts(prev => prev.map(p =>
        p.id === postId ? { ...p, is_pinned: !p.is_pinned } : p
      ));
    } catch {
      Alert.alert('Error', 'Could not pin post.');
    }
  };

  // ── Give Feedback ─────────────────────────────────────────
  const openGiveFeedback = async () => {
    setShowGiveFeedback(true);
    if (!fbMembersLoaded && workspace) {
      try {
        const r = await api.workspace.getMembers(workspace.id);
        const items: any[] = r.data?.items ?? r.data ?? [];
        setFbMembers(items.map((m: any) => ({
          id: m.user_id,
          name: `${m.first_name ?? ''} ${m.last_name ?? ''}`.trim() || m.email,
        })));
        setFbMembersLoaded(true);
      } catch {}
    }
  };

  const submitFeedback = async () => {
    if (!workspace || !fbSelected) return;
    if (!fbFeedbackText.trim()) { showAlert('Please write your feedback'); return; }
    setFbSubmitting(true);
    try {
      await api.feed.giveFeedback(workspace.id, {
        to_user_id: fbSelected.id,
        feedback_text: fbFeedbackText.trim(),
        is_anonymous: fbIsAnonymous,
        type: fbType,
      });
      setShowGiveFeedback(false);
      setFbSelected(null);
      setFbFeedbackText('');
      setFbType('general');
      setFbIsAnonymous(false);
      setFbSearch('');
      loadFeedback();
    } catch (err: any) {
      showAlert('Failed', err?.response?.data?.error ?? 'Something went wrong');
    } finally { setFbSubmitting(false); }
  };

  if (feedLoading) return <LoadingSpinner />;

  const filteredPosts = search
    ? posts.filter((p) => {
        const q = search.toLowerCase();
        const authorName = p.author_name
          ?? [p.author?.first_name, p.author?.last_name].filter(Boolean).join(' ')
          ?? '';
        return (p.content ?? '').toLowerCase().includes(q) || authorName.toLowerCase().includes(q);
      })
    : posts;

  const fbFilteredMembers = fbSearch.trim()
    ? fbMembers.filter(m => m.name.toLowerCase().includes(fbSearch.toLowerCase()))
    : [];

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Page header */}
      <View style={s.pageHeader}>
        <Text style={s.breadcrumb}>{workspace?.name?.toUpperCase() ?? 'WORKSPACE'} · SOCIAL</Text>
        <Text style={s.pageTitle}>Feed</Text>
        <Text style={s.subtitle}>What's happening across your team.</Text>
      </View>

      {/* Tab bar */}
      <View style={[s.tabBarScroll, s.tabBar]}>
        {([
          { key: 'feed', label: 'Feed' },
          { key: 'announcements', label: 'Announce' },
          { key: 'appreciations', label: 'Appreciate' },
          { key: 'feedback', label: 'Feedback' },
        ] as { key: Tab; label: string }[]).map(({ key, label }) => (
          <TouchableOpacity
            key={key}
            style={[s.tab, activeTab === key && s.tabActive]}
            onPress={() => setActiveTab(key)}
          >
            <Text style={[s.tabText, activeTab === key && s.tabTextActive]} numberOfLines={1}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Feed tab ─────────────────────────────────────── */}
      {activeTab === 'feed' && (
        <View style={{ flex: 1 }}>
          <GiveAppreciationModal
            visible={showAppreciation}
            onClose={() => setShowAppreciation(false)}
            onSuccess={loadFeed}
            appId={workspace!.id}
          />
          <FlatList
            data={filteredPosts}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={s.list}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={feedRefreshing} onRefresh={onRefreshFeed} />}
            ListHeaderComponent={
              <View style={s.listHeader}>
                <View style={s.actionSection}>
                  <View style={s.actionRow}>
                    <TouchableOpacity style={s.actionBtn} onPress={() => setShowAppreciation(true)}>
                      <Ionicons name="heart-outline" size={15} color={colors.success} />
                      <Text style={[s.actionBtnTxt, { color: colors.success }]}>Appreciate</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.actionBtn, s.actionBtnPrimary]}
                      onPress={() => navigation.navigate('CreatePost', { appId: workspace!.id })}
                    >
                      <Ionicons name="add" size={15} color="#ffffff" />
                      <Text style={[s.actionBtnTxt, { color: '#ffffff' }]}>Write a Post</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={s.searchBar}>
                    <Ionicons name="search-outline" size={16} color={colors.gray400} />
                    <TextInput
                      style={s.searchInput}
                      placeholder="Search posts..."
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
                </View>
              </View>
            }
            ListEmptyComponent={
              <EmptyState icon="newspaper-outline" title="No posts yet" subtitle="Share something with your team!" />
            }
            renderItem={({ item }) => (
              <PostCard
                post={item}
                liked={item.my_reactions?.includes('❤️') ?? false}
                onPress={() => navigation.navigate('PostDetail', { postId: item.id, appId: workspace!.id })}
                onReact={(emoji) => handleReact(item.id, emoji)}
                onDelete={(isAdmin || item.author_user_id === meId) ? () => handleDelete(item.id) : undefined}
                onPin={isAdmin ? () => handlePin(item.id) : undefined}
              />
            )}
          />
        </View>
      )}

      {/* ── Announcements tab ───────────────────────────── */}
      {activeTab === 'announcements' && (
        <View style={{ flex: 1 }}>
        <FlatList
          data={posts.filter(p => (p.post_type ?? p.type) === 'announcement')}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={feedRefreshing} onRefresh={onRefreshFeed} />}
          ListEmptyComponent={
            <EmptyState icon="megaphone-outline" title="No announcements yet" subtitle="Admins can post announcements for the whole team." />
          }
          renderItem={({ item }) => (
            <PostCard
              post={item}
              liked={item.my_reactions?.includes('❤️') ?? false}
              onPress={() => navigation.navigate('PostDetail', { postId: item.id, appId: workspace!.id })}
              onReact={(emoji) => handleReact(item.id, emoji)}
              onDelete={(isAdmin || item.author_user_id === meId) ? () => handleDelete(item.id) : undefined}
              onPin={isAdmin ? () => handlePin(item.id) : undefined}
            />
          )}
        />
        </View>
      )}

      {/* ── Appreciations tab ────────────────────────────── */}
      {activeTab === 'appreciations' && (
        <View style={{ flex: 1 }}>
          <GiveAppreciationModal
            visible={showAppreciation}
            onClose={() => setShowAppreciation(false)}
            onSuccess={loadAppreciations}
            appId={workspace!.id}
          />
          <View style={s.actionSection}>
            <View style={s.actionRow}>
              <TouchableOpacity
                style={[s.actionBtn, s.actionBtnPrimary, { flex: 1 }]}
                onPress={() => setShowAppreciation(true)}
              >
                <Ionicons name="heart" size={15} color="#ffffff" />
                <Text style={[s.actionBtnTxt, { color: '#ffffff' }]}>Give Appreciation</Text>
              </TouchableOpacity>
            </View>
          </View>
          <FlatList
            data={apprLoading ? [] : appreciations}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={s.list}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={apprLoading} onRefresh={loadAppreciations} />}
            ListEmptyComponent={
              apprLoading
                ? <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
                : <EmptyState icon="heart-outline" title="No appreciations yet" subtitle="Be the first to appreciate someone!" />
            }
            renderItem={({ item }) => (
              <View style={s.apprCard}>
                <View style={s.apprHeader}>
                  <Avatar name={uname(item.from_user_name, item.from_user, '?')} size={36} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.apprFrom}>
                      <Text style={s.apprName}>{uname(item.from_user_name, item.from_user, 'Someone')}</Text>
                      {' appreciated '}
                      <Text style={s.apprName}>{uname(item.to_user_name, item.to_user, 'you')}</Text>
                    </Text>
                    <Text style={s.apprTime}>{formatRelative(item.created_at)}</Text>
                  </View>
                  {item.badge && <Text style={s.apprBadge}>{item.badge}</Text>}
                </View>
                <Text style={s.apprMsg}>{item.message}</Text>
              </View>
            )}
          />
        </View>
      )}

      {/* ── Feedback tab ─────────────────────────────────── */}
      {activeTab === 'feedback' && (
        <View style={{ flex: 1 }}>
          <View style={s.actionSection}>
            <View style={s.actionRow}>
              <TouchableOpacity
                style={[s.actionBtn, s.actionBtnPrimary, { flex: 1 }]}
                onPress={openGiveFeedback}
              >
                <Ionicons name="chatbubbles-outline" size={15} color="#ffffff" />
                <Text style={[s.actionBtnTxt, { color: '#ffffff' }]}>Give Feedback</Text>
              </TouchableOpacity>
            </View>
          </View>
          <View style={s.toggleRow}>
            <TouchableOpacity
              style={[s.toggleBtn, feedbackView === 'received' && s.toggleBtnActive]}
              onPress={() => setFeedbackView('received')}
            >
              <Text style={[s.toggleText, feedbackView === 'received' && s.toggleTextActive]}>Received</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.toggleBtn, feedbackView === 'given' && s.toggleBtnActive]}
              onPress={() => setFeedbackView('given')}
            >
              <Text style={[s.toggleText, feedbackView === 'given' && s.toggleTextActive]}>Given</Text>
            </TouchableOpacity>
          </View>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 16, paddingBottom: 32, flexGrow: 1 }}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={feedbackLoading} onRefresh={loadFeedback} />}
          >
            {feedbackLoading ? (
              <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
            ) : (feedbackView === 'received' ? receivedFeedback : givenFeedback).length === 0 ? (
              <EmptyState
                icon="chatbubble-outline"
                title={feedbackView === 'received' ? 'No feedback received yet' : 'No feedback given yet'}
                subtitle="Feedback helps teams grow together."
              />
            ) : (
              (feedbackView === 'received' ? receivedFeedback : givenFeedback).map(item => (
                <View key={item.id} style={s.fbCard}>
                  <View style={s.fbHeader}>
                    <Avatar
                      name={feedbackView === 'received'
                        ? (item.is_anonymous ? 'A' : uname(item.from_user_name, item.from_user, '?'))
                        : uname(item.to_user_name, item.to_user, '?')}
                      size={34}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={s.fbPerson}>
                        {feedbackView === 'received'
                          ? `From ${item.is_anonymous ? 'Anonymous' : uname(item.from_user_name, item.from_user)}`
                          : `To ${uname(item.to_user_name, item.to_user)}`
                        }
                      </Text>
                      <Text style={s.fbTime}>{formatRelative(item.created_at)}</Text>
                    </View>
                    {item.type && (
                      <View style={s.fbTypeBadge}>
                        <Text style={s.fbTypeText}>{item.type}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={s.fbMsg}>{item.feedback_text}</Text>
                </View>
              ))
            )}
          </ScrollView>
        </View>
      )}

      {/* ── Give Feedback Modal ───────────────────────────── */}
      <Modal visible={showGiveFeedback} transparent animationType="slide">
        <KeyboardAvoidingView
          style={s.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={s.modalSheet}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>💬 Give Feedback</Text>
              <TouchableOpacity onPress={() => {
                setShowGiveFeedback(false);
                setFbSelected(null);
                setFbFeedbackText('');
                setFbSearch('');
              }}>
                <Ionicons name="close" size={22} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={s.formLabel}>To</Text>
              {fbSelected ? (
                <TouchableOpacity style={s.selectedRow} onPress={() => setFbSelected(null)}>
                  <Avatar name={fbSelected.name} size={32} />
                  <Text style={s.selectedName}>{fbSelected.name}</Text>
                  <Ionicons name="close-circle" size={18} color={colors.gray400} />
                </TouchableOpacity>
              ) : (
                <>
                  <View style={s.fbSearchBar}>
                    <Ionicons name="search-outline" size={15} color={colors.gray400} />
                    <TextInput
                      style={s.fbSearchInput}
                      placeholder="Search team members..."
                      placeholderTextColor={colors.gray400}
                      value={fbSearch}
                      onChangeText={setFbSearch}
                    />
                  </View>
                  {!fbMembersLoaded ? (
                    <ActivityIndicator style={{ marginVertical: 16 }} color={colors.primary} />
                  ) : fbSearch.trim() === '' ? (
                    <Text style={s.fbHint}>Type a name to search</Text>
                  ) : fbFilteredMembers.length === 0 ? (
                    <Text style={s.fbHint}>No members found</Text>
                  ) : (
                    <View style={s.fbMemberList}>
                      {fbFilteredMembers.slice(0, 20).map((m) => (
                        <TouchableOpacity
                          key={m.id}
                          style={s.fbMemberRow}
                          onPress={() => { setFbSelected(m); setFbSearch(''); }}
                        >
                          <Avatar name={m.name} size={32} />
                          <Text style={s.fbMemberName}>{m.name}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </>
              )}

              <Text style={s.formLabel}>Type</Text>
              <View style={s.typeRow}>
                {FEEDBACK_TYPES.map((t) => (
                  <TouchableOpacity
                    key={t.key}
                    style={[s.typeChip, fbType === t.key && s.typeChipActive]}
                    onPress={() => setFbType(t.key)}
                  >
                    <Text style={[s.typeChipText, fbType === t.key && s.typeChipTextActive]}>{t.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={s.formLabel}>Message</Text>
              <TextInput
                style={s.fbMessageInput}
                placeholder="Write your feedback..."
                placeholderTextColor={colors.gray400}
                value={fbFeedbackText}
                onChangeText={setFbFeedbackText}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />

              <TouchableOpacity
                style={s.anonRow}
                onPress={() => setFbIsAnonymous(!fbIsAnonymous)}
                activeOpacity={0.7}
              >
                <View style={[s.checkbox, fbIsAnonymous && s.checkboxActive]}>
                  {fbIsAnonymous && <Ionicons name="checkmark" size={13} color="#fff" />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.anonLabel}>Send anonymously</Text>
                  <Text style={s.anonHint}>Your name won't be shown to the recipient</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[s.submitBtn, (fbSubmitting || !fbSelected) && s.submitBtnDisabled]}
                onPress={submitFeedback}
                disabled={fbSubmitting || !fbSelected}
              >
                {fbSubmitting
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={s.submitBtnText}>Send Feedback</Text>
                }
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function uname(flat: string | null | undefined, obj: any, fallback = 'Unknown'): string {
  if (flat) return flat;
  if (obj?.first_name || obj?.last_name) return [obj.first_name, obj.last_name].filter(Boolean).join(' ');
  return obj?.email || fallback;
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

    tabBarScroll: { backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border },
    tabBar: { flexDirection: 'row' },
    tab: {
      flex: 1, paddingVertical: 12, paddingHorizontal: 4, alignItems: 'center',
      borderBottomWidth: 2, borderBottomColor: 'transparent',
    },
    tabActive: { borderBottomColor: c.primary },
    tabText: { fontSize: 11, fontWeight: '600', color: c.textMuted },
    tabTextActive: { color: c.primary },

    actionSection: {
      backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border,
      paddingTop: 10, paddingBottom: 10,
    },
    actionRow: {
      flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingBottom: 8,
    },
    actionBtn: {
      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
      paddingVertical: 9, borderRadius: 10,
      backgroundColor: c.successLight, borderWidth: 1, borderColor: c.success + '33',
    },
    actionBtnPrimary: { backgroundColor: c.primary, borderColor: c.primary },
    actionBtnTxt: { fontSize: 13, fontWeight: '700' },

    searchBar: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: c.background, marginHorizontal: 16,
      borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7,
      borderWidth: 1.5, borderColor: c.border,
    },
    searchInput: { flex: 1, fontSize: 14, color: c.textPrimary },

    list: { padding: 16, paddingBottom: 32 },
    listHeader: { marginHorizontal: -16, marginTop: -16 },

    // Appreciations
    apprCard: {
      backgroundColor: c.surface, borderRadius: 14, padding: 14, marginBottom: 12,
      borderWidth: 1, borderColor: c.border,
    },
    apprHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
    apprFrom: { fontSize: 13, color: c.textSecondary, lineHeight: 18 },
    apprName: { fontWeight: '700', color: c.textPrimary },
    apprTime: { fontSize: 11, color: c.gray400, marginTop: 2 },
    apprBadge: { fontSize: 24 },
    apprMsg: { fontSize: 14, color: c.textPrimary, lineHeight: 20, fontStyle: 'italic' },

    // Feedback list
    toggleRow: {
      flexDirection: 'row', backgroundColor: c.surface,
      paddingHorizontal: 16, paddingVertical: 8, gap: 8,
      borderBottomWidth: 1, borderBottomColor: c.border,
    },
    toggleBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center', backgroundColor: c.gray100 },
    toggleBtnActive: { backgroundColor: c.primary },
    toggleText: { fontSize: 13, fontWeight: '600', color: c.textSecondary },
    toggleTextActive: { color: '#fff' },
    fbCard: {
      backgroundColor: c.surface, borderRadius: 14, padding: 14, marginBottom: 12,
      borderWidth: 1, borderColor: c.border,
    },
    fbHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
    fbPerson: { fontSize: 13, fontWeight: '700', color: c.textPrimary },
    fbTime: { fontSize: 11, color: c.gray400, marginTop: 2 },
    fbTypeBadge: {
      backgroundColor: c.primaryLight, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
    },
    fbTypeText: { fontSize: 11, fontWeight: '600', color: c.primary, textTransform: 'capitalize' },
    fbMsg: { fontSize: 14, color: c.textPrimary, lineHeight: 20 },

    // Give Feedback modal
    modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
    modalSheet: {
      backgroundColor: c.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22,
      padding: 20, maxHeight: '90%',
    },
    modalHeader: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      marginBottom: 16, paddingBottom: 16,
      borderBottomWidth: 1, borderBottomColor: c.border,
    },
    modalTitle: { fontSize: 17, fontWeight: '700', color: c.textPrimary },
    formLabel: {
      fontSize: 12, fontWeight: '700', color: c.textSecondary,
      textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 16, marginBottom: 8,
    },
    selectedRow: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      backgroundColor: c.primaryLight, borderRadius: 12, padding: 12,
    },
    selectedName: { flex: 1, fontSize: 14, fontWeight: '600', color: c.textPrimary },
    fbSearchBar: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: c.gray100, borderRadius: 10,
      paddingHorizontal: 12, paddingVertical: 10,
      borderWidth: 1, borderColor: c.border,
    },
    fbSearchInput: { flex: 1, fontSize: 14, color: c.textPrimary },
    fbHint: { fontSize: 14, color: c.gray400, textAlign: 'center', padding: 16 },
    fbMemberList: { marginTop: 8, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: c.border },
    fbMemberRow: {
      flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12,
      backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border,
    },
    fbMemberName: { fontSize: 14, fontWeight: '600', color: c.textPrimary },
    typeRow: { flexDirection: 'row', gap: 8 },
    typeChip: {
      paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
      backgroundColor: c.gray100, borderWidth: 1.5, borderColor: c.border,
    },
    typeChipActive: { backgroundColor: c.primaryLight, borderColor: c.primary },
    typeChipText: { fontSize: 13, fontWeight: '600', color: c.gray600 },
    typeChipTextActive: { color: c.primary, fontWeight: '700' },
    fbMessageInput: {
      backgroundColor: c.gray100, borderRadius: 12, padding: 12,
      fontSize: 14, color: c.textPrimary, minHeight: 100,
      borderWidth: 1, borderColor: c.border,
    },
    anonRow: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      marginTop: 14, padding: 12, borderRadius: 10,
      backgroundColor: c.gray100, borderWidth: 1, borderColor: c.border,
    },
    checkbox: {
      width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: c.border,
      alignItems: 'center', justifyContent: 'center', backgroundColor: c.surface,
    },
    checkboxActive: { backgroundColor: c.primary, borderColor: c.primary },
    anonLabel: { fontSize: 13, fontWeight: '600', color: c.textPrimary },
    anonHint: { fontSize: 11, color: c.gray400, marginTop: 1 },
    submitBtn: {
      backgroundColor: c.primary, borderRadius: 12, padding: 16,
      alignItems: 'center', marginTop: 20, marginBottom: 8,
    },
    submitBtnDisabled: { opacity: 0.5 },
    submitBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  });
}
