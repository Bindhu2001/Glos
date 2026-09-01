import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity, RefreshControl,
  Platform, Alert, TextInput, ScrollView, Modal, ActivityIndicator,
  KeyboardAvoidingView,
} from 'react-native';
import { useNavigation, useFocusEffect, useRoute, RouteProp } from '@react-navigation/native';
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
import LoadError from '../../components/common/LoadError';
import EmptyState from '../../components/common/EmptyState';
import { FeedStackParamList } from '../../navigation/types';
import { formatRelative } from '../../utils/format';
import { renderMentionText } from '../../utils/mentions';
import { BADGE_META } from '../../utils/badges';
import { showAlert } from '../../components/common/AlertModal';
import { guardedTextChange, CONTENT_MAX_LEN, stripTags, stripNonContentElements } from '../../utils/postContent';
import {
  RecipientNamesInline, RecipientsModal, toRecipients, Recipient,
} from '../../components/feed/RecipientNames';

type Nav = NativeStackNavigationProp<FeedStackParamList, 'FeedList'>;
type Route = RouteProp<FeedStackParamList, 'FeedList'>;
type Tab = 'feed' | 'appreciations' | 'feedback';


export default function FeedScreen() {
  const api = useApi();
  const { workspace } = useWorkspace();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const insets = useSafeAreaInsets();

  const isAdmin = workspace?.role === 'super_admin' || workspace?.role === 'admin';

  const [activeTab, setActiveTab] = useState<Tab>(route.params?.initialTab ?? 'feed');
  const [recipientsModal, setRecipientsModal] = useState<Recipient[] | null>(null);

  // Deep-link from notifications (e.g. tapping a "feedback received" notification
  // while the Feed tab is already mounted in the background) — the screen isn't
  // remounted on re-navigation, so the initial useState value alone won't catch it.
  useEffect(() => {
    if (route.params?.initialTab) setActiveTab(route.params.initialTab);
  }, [route.params?.initialTab]);

  // Feed tab
  const [posts, setPosts] = useState<any[]>([]);
  const [feedTotal, setFeedTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [feedLoading, setFeedLoading] = useState(true);
  const [feedError, setFeedError] = useState(false);
  const [feedRefreshing, setFeedRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  // "Appreciation"/"Feedback" from web's filter dropdown are redundant here —
  // mobile already has dedicated tabs for those. All/Post/Poll is the
  // meaningful remaining split within the Feed tab itself.
  const [postTypeFilter, setPostTypeFilter] = useState<'all' | 'post' | 'poll'>('all');
  const [showAppreciation, setShowAppreciation] = useState(false);
  const [meId, setMeId] = useState<number | null>(null);

  // Appreciations tab
  const [receivedAppreciations, setReceivedAppreciations] = useState<any[]>([]);
  const [givenAppreciations, setGivenAppreciations] = useState<any[]>([]);
  const [apprLoading, setApprLoading] = useState(false);
  const [apprError, setApprError] = useState(false);
  const [apprView, setApprView] = useState<'received' | 'given'>('received');

  // Feedback tab
  const [receivedFeedback, setReceivedFeedback] = useState<any[]>([]);
  const [givenFeedback, setGivenFeedback] = useState<any[]>([]);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackError, setFeedbackError] = useState(false);
  const [feedbackView, setFeedbackView] = useState<'received' | 'given'>('received');

  // Give Feedback modal
  const [showGiveFeedback, setShowGiveFeedback] = useState(false);
  const [fbMembers, setFbMembers] = useState<any[]>([]);
  const [fbMembersLoaded, setFbMembersLoaded] = useState(false);
  const [fbSearch, setFbSearch] = useState('');
  const [fbSelected, setFbSelected] = useState<any[]>([]);
  const [fbFeedbackText, setFbFeedbackText] = useState('');
  const [fbIsAnonymous, setFbIsAnonymous] = useState(false);
  const [fbSubmitting, setFbSubmitting] = useState(false);
  const [fbCycles, setFbCycles] = useState<any[]>([]);
  const [fbCycleId, setFbCycleId] = useState<number | null>(null);
  const [showCyclePicker, setShowCyclePicker] = useState(false);
  const [fbCyclesLoaded, setFbCyclesLoaded] = useState(false);

  // Resolves audience_type='users'/'departments'/'roles' post badges to display
  // names — loaded once up front (unlike fbMembers, which is lazy-loaded only
  // when the Give Feedback modal opens) since post cards need it immediately.
  const [audienceMembers, setAudienceMembers] = useState<{ id: number; name: string }[]>([]);
  const [audienceDepartments, setAudienceDepartments] = useState<{ id: number; name: string }[]>([]);
  const [audienceRoles, setAudienceRoles] = useState<{ id: number; name: string }[]>([]);

  // ── Feed ──────────────────────────────────────────────────
  // Matches web (Feed.jsx) — first page is 30, "Load more" pulls 20 at a
  // time. The backend defaults to limit=50 with no pagination at all if not
  // asked, which is exactly why the list used to just stop at 50 with no way
  // to see anything older.
  const loadFeed = useCallback(async () => {
    if (!workspace) return;
    try {
      const r = await api.feed.list(workspace.id, { limit: 30, offset: 0 });
      const d = r.data;
      setPosts(Array.isArray(d) ? d : (d?.items ?? d?.posts ?? []));
      setFeedTotal(Array.isArray(d) ? d.length : (d?.total ?? 0));
      setFeedError(false);
    } catch {
      setFeedError(true);
    }
  }, [workspace, api]);

  const loadMoreFeed = useCallback(async () => {
    if (!workspace || loadingMore) return;
    setLoadingMore(true);
    try {
      const r = await api.feed.list(workspace.id, { limit: 20, offset: posts.length });
      const d = r.data;
      const more = Array.isArray(d) ? d : (d?.items ?? d?.posts ?? []);
      setPosts((prev) => [...prev, ...more]);
      setFeedTotal(Array.isArray(d) ? feedTotal : (d?.total ?? feedTotal));
    } catch {
      // Silent — same as web, the button just stays available to retry.
    } finally {
      setLoadingMore(false);
    }
  }, [workspace, api, posts.length, loadingMore, feedTotal]);

  // ── Appreciations ─────────────────────────────────────────
  const loadAppreciations = useCallback(async () => {
    if (!workspace) return;
    setApprLoading(true);
    try {
      if (meId) {
        const r = await api.appreciations.getForUser(workspace.id, meId);
        setReceivedAppreciations(Array.isArray(r.data?.received) ? r.data.received : []);
        setGivenAppreciations(Array.isArray(r.data?.given) ? r.data.given : []);
      } else {
        const r = await api.appreciations.listReceived(workspace.id);
        setReceivedAppreciations(Array.isArray(r.data) ? r.data : (r.data?.items ?? []));
        setGivenAppreciations([]);
      }
      setApprError(false);
    } catch {
      setApprError(true);
    } finally { setApprLoading(false); }
  }, [workspace, api, meId]);

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
      setFeedbackError(false);
    } catch {
      setFeedbackError(true);
    } finally { setFeedbackLoading(false); }
  }, [workspace, api]);

  useEffect(() => {
    api.me.getProfile().then((r: any) => setMeId(r.data?.id ?? r.data?.user?.id ?? null)).catch(() => {});
  }, [api]);

  useEffect(() => {
    if (!workspace) return;
    api.workspace.getMembers(workspace.id).then((r: any) => {
      const items: any[] = r.data?.items ?? r.data ?? [];
      setAudienceMembers(items.map((m: any) => ({
        id: m.user_id,
        name: `${m.first_name ?? ''} ${m.last_name ?? ''}`.trim() || m.email,
      })));
    }).catch(() => {});
    api.departments.list(workspace.id).then((r: any) => {
      const items: any[] = Array.isArray(r.data) ? r.data : (r.data?.items ?? []);
      setAudienceDepartments(items.map((d: any) => ({ id: d.id, name: d.name })));
    }).catch(() => {});
    api.roles.list(workspace.id).then((r: any) => {
      const items: any[] = Array.isArray(r.data) ? r.data : (r.data?.items ?? []);
      setAudienceRoles(items.map((role: any) => ({ id: role.id, name: role.name ?? role.title })));
    }).catch(() => {});
  }, [workspace, api]);

  // useFocusEffect below also fires on initial mount (a screen becomes focused
  // as soon as it's pushed), which used to double-fetch api.feed.list() on
  // every first visit to the Feed tab. hasFeedLoadedRef makes the focus effect
  // a no-op until the initial load finishes, so it only refreshes on later
  // refocuses, same pattern as TasksScreen/TaskDetailScreen.
  const hasFeedLoadedRef = useRef(false);
  useEffect(() => {
    loadFeed().finally(() => { setFeedLoading(false); hasFeedLoadedRef.current = true; });
  }, [loadFeed]);

  useFocusEffect(useCallback(() => {
    if (hasFeedLoadedRef.current) loadFeed();
  }, [loadFeed]));

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
  // Backend toggles a single (post, user, emoji) row independently — a user
  // can hold several simultaneous reactions on one post (matches web's
  // Feed.jsx handleReact). Previously mobile treated my_reactions as
  // single-select and un-reacted whatever was there first, which silently
  // dropped any other reaction the user already had on the post.
  const handleReact = async (postId: number, emoji: string = '❤️') => {
    if (!workspace) return;
    const originalPosts = posts;

    setPosts(prev => prev.map(p => {
      if (p.id !== postId) return p;
      const myReactions = p.my_reactions ?? [];
      const alreadyReacted = myReactions.includes(emoji);
      const newMyReactions = alreadyReacted
        ? myReactions.filter((e: string) => e !== emoji)
        : [...myReactions, emoji];
      const reactions = p.reactions ?? [];
      const newReactions = alreadyReacted
        ? reactions.map((r: any) => (r.emoji === emoji ? { ...r, count: Math.max(0, r.count - 1) } : r)).filter((r: any) => r.count > 0)
        : reactions.some((r: any) => r.emoji === emoji)
          ? reactions.map((r: any) => (r.emoji === emoji ? { ...r, count: r.count + 1 } : r))
          : [...reactions, { emoji, count: 1 }];
      return { ...p, my_reactions: newMyReactions, reactions: newReactions };
    }));

    try {
      await api.feed.addReaction(workspace.id, postId, emoji);
    } catch {
      setPosts(originalPosts); // revert on error
    }
  };

  const handleVote = async (postId: number, optionIds: number[]) => {
    if (!workspace) return;
    const originalPosts = posts;
    setPosts((prev) => prev.map((p) => {
      if (p.id !== postId || !p.poll) return p;
      const options = p.poll.options.map((opt: any) => {
        const wasMine = (p.poll.my_votes ?? []).includes(opt.id);
        const isMine = optionIds.includes(opt.id);
        const delta = isMine && !wasMine ? 1 : !isMine && wasMine ? -1 : 0;
        return { ...opt, votes: Math.max(0, opt.votes + delta) };
      });
      const total = options.reduce((sum: number, o: any) => sum + o.votes, 0);
      return { ...p, poll: { ...p.poll, options, my_votes: optionIds, total_votes: total } };
    }));
    try {
      await api.feed.votePoll(workspace.id, postId, optionIds);
    } catch {
      setPosts(originalPosts);
    }
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

  // Mirrors the backend's own rule (author-only, within 15 minutes of
  // posting) so the edit option simply isn't offered once it'd be rejected
  // server-side, instead of surfacing a confusing 403 after the fact.
  const EDIT_WINDOW_MS = 15 * 60 * 1000;
  // Appreciation/feedback are excluded: their real content lives in
  // post.appreciation.message / post.feedback.feedback_text, not post.content
  // (which is just an auto-generated summary line like "Alice gave feedback
  // to Bob") — the generic text editor below only ever touches post.content,
  // so offering it here would silently overwrite the summary line while
  // leaving the actual message untouched. Mobile has no dedicated edit flow
  // for these two types yet, so editing them isn't offered at all for now.
  const canEditPost = (post: { author_user_id?: number; created_at: string; post_type?: string }) =>
    meId !== null && post.author_user_id === meId
    && post.post_type !== 'appreciation' && post.post_type !== 'feedback'
    && (Date.now() - new Date(post.created_at).getTime()) <= EDIT_WINDOW_MS;

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
  const findActiveCycle = (cycles: any[]) => {
    const today = new Date().toISOString().split('T')[0];
    return cycles.find((c: any) => c.start_date <= today && c.end_date >= today)
      ?? cycles[cycles.length - 1]
      ?? null;
  };

  const openGiveFeedback = async () => {
    setShowGiveFeedback(true);
    if (!workspace) return;
    const loaders: Promise<void>[] = [];
    if (!fbMembersLoaded) {
      loaders.push(
        api.workspace.getMembers(workspace.id).then((r: any) => {
          const items: any[] = r.data?.items ?? r.data ?? [];
          setFbMembers(items.map((m: any) => ({
            id: m.user_id,
            name: `${m.first_name ?? ''} ${m.last_name ?? ''}`.trim() || m.email,
            photoUrl: m.photo_url,
          })));
          setFbMembersLoaded(true);
        }).catch(() => {})
      );
    }
    if (!fbCyclesLoaded) {
      loaders.push(
        api.performance.getCycles(workspace.id).then((r: any) => {
          const cycles: any[] = r.data?.items ?? r.data ?? [];
          setFbCycles(cycles);
          const active = findActiveCycle(cycles);
          if (active) setFbCycleId(active.id);
          setFbCyclesLoaded(true);
        }).catch(() => {})
      );
    } else if (fbCycles.length > 0) {
      const active = findActiveCycle(fbCycles);
      setFbCycleId(active?.id ?? null);
    }
    if (loaders.length) await Promise.all(loaders);
  };

  const submitFeedback = async () => {
    if (!workspace || fbSelected.length === 0) return;
    if (!fbFeedbackText.trim()) { showAlert('Please write your feedback'); return; }
    setFbSubmitting(true);
    try {
      await api.feed.giveFeedback(workspace.id, {
        to_user_ids: fbSelected.map((m) => m.id),
        feedback_text: fbFeedbackText.trim(),
        is_anonymous: fbIsAnonymous,
        cycle_id: fbCycleId ?? null,
      });
      setShowGiveFeedback(false);
      setFbSelected([]);
      setFbFeedbackText('');
      setFbIsAnonymous(false);
      setFbSearch('');
      setFbCycleId(null);
      await loadFeedback();
    } catch (err: any) {
      showAlert('Failed', err?.response?.data?.error ?? 'Something went wrong');
    } finally { setFbSubmitting(false); }
  };

  // Shared by the X button and the Modal's onRequestClose (Android hardware/
  // gesture back) — without wiring the latter, back does nothing while this
  // modal is open since RN's Modal swallows the back event itself.
  const closeGiveFeedback = () => {
    setShowGiveFeedback(false);
    setFbSelected([]);
    setFbFeedbackText('');
    setFbSearch('');
    setFbCycleId(null);
  };

  if (feedLoading) return <LoadingSpinner />;
  if (feedError && activeTab === 'feed') return <LoadError onRetry={() => { setFeedLoading(true); loadFeed().finally(() => setFeedLoading(false)); }} />;

  // Matches web's matchesQuery — content, author, and poll question (this
  // tab never shows appreciation/feedback posts, those have their own tabs).
  const filteredPosts = posts
    .filter((p) => postTypeFilter === 'all' || p.post_type === postTypeFilter)
    .filter((p) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      const authorName = p.author_name
        ?? [p.author?.first_name, p.author?.last_name].filter(Boolean).join(' ')
        ?? '';
      const pollQ = p.poll?.question ?? '';
      return (p.content ?? '').toLowerCase().includes(q)
        || authorName.toLowerCase().includes(q)
        || pollQ.toLowerCase().includes(q);
    });

  const fbSelectedIds = new Set(fbSelected.map((m) => m.id));
  const fbFilteredMembers = fbSearch.trim()
    ? fbMembers.filter(m => m.name.toLowerCase().includes(fbSearch.toLowerCase()))
    : fbMembers;
  const fbAllFilteredSelected = fbFilteredMembers.length > 0 && fbFilteredMembers.every(m => fbSelectedIds.has(m.id));

  const toggleFbOne = (m: any) => {
    setFbSelected((prev) => (prev.some((x) => x.id === m.id) ? prev.filter((x) => x.id !== m.id) : [...prev, m]));
  };

  const toggleFbSelectAll = () => {
    if (fbAllFilteredSelected) {
      const filteredIds = new Set(fbFilteredMembers.map(m => m.id));
      setFbSelected((prev) => prev.filter((m) => !filteredIds.has(m.id)));
    } else {
      setFbSelected((prev) => {
        const existingIds = new Set(prev.map((m) => m.id));
        return [...prev, ...fbFilteredMembers.filter((m) => !existingIds.has(m.id))];
      });
    }
  };

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
                    <TouchableOpacity
                      style={[s.actionBtn, s.actionBtnPrimary, { flex: 1 }]}
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
                  <View style={s.typeFilterRow}>
                    {([
                      { key: 'all', label: 'All' },
                      { key: 'post', label: 'Posts' },
                      { key: 'poll', label: 'Polls' },
                    ] as { key: 'all' | 'post' | 'poll'; label: string }[]).map((o) => (
                      <TouchableOpacity
                        key={o.key}
                        style={[s.typeFilterChip, postTypeFilter === o.key && s.typeFilterChipActive]}
                        onPress={() => setPostTypeFilter(o.key)}
                      >
                        <Text style={[s.typeFilterChipTxt, postTypeFilter === o.key && s.typeFilterChipTxtActive]}>{o.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </View>
            }
            ListEmptyComponent={
              <EmptyState icon="newspaper-outline" title="No posts yet" subtitle="Share something with your team!" />
            }
            ListFooterComponent={
              !search && postTypeFilter === 'all' && posts.length < feedTotal ? (
                <TouchableOpacity style={s.loadMoreBtn} onPress={loadMoreFeed} disabled={loadingMore}>
                  {loadingMore ? (
                    <ActivityIndicator color={colors.primary} />
                  ) : (
                    <Text style={s.loadMoreTxt}>Load more ({feedTotal - posts.length} remaining)</Text>
                  )}
                </TouchableOpacity>
              ) : null
            }
            renderItem={({ item }) => (
              <PostCard
                post={item}
                liked={item.my_reactions?.includes('❤️') ?? false}
                onPress={() => navigation.navigate('PostDetail', { postId: item.id, appId: workspace!.id })}
                onReact={(emoji) => handleReact(item.id, emoji)}
                onVote={(optionIds) => handleVote(item.id, optionIds)}
                onDelete={(isAdmin || item.author_user_id === meId) ? () => handleDelete(item.id) : undefined}
                onEdit={canEditPost(item) ? () => navigation.navigate('CreatePost', {
                  appId: workspace!.id, postId: item.id, initialContent: item.content,
                  initialPostType: item.post_type, initialPoll: item.post_type === 'poll' ? item.poll : undefined,
                }) : undefined}
                onPin={isAdmin ? () => handlePin(item.id) : undefined}
                members={audienceMembers}
                departments={audienceDepartments}
                roles={audienceRoles}
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
          <View style={s.toggleRow}>
            <TouchableOpacity
              style={[s.toggleBtn, apprView === 'received' && s.toggleBtnActive]}
              onPress={() => setApprView('received')}
            >
              <Text style={[s.toggleText, apprView === 'received' && s.toggleTextActive]}>Received</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.toggleBtn, apprView === 'given' && s.toggleBtnActive]}
              onPress={() => setApprView('given')}
            >
              <Text style={[s.toggleText, apprView === 'given' && s.toggleTextActive]}>Given</Text>
            </TouchableOpacity>
          </View>
          <FlatList
            data={apprView === 'received' ? receivedAppreciations : givenAppreciations}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={s.list}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={apprLoading} onRefresh={loadAppreciations} />}
            ListEmptyComponent={
              apprLoading
                ? <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
                : apprError
                ? <LoadError onRetry={loadAppreciations} />
                : <EmptyState icon="heart-outline" title={apprView === 'received' ? 'No appreciations received yet' : 'No appreciations given yet'} subtitle="Be the first to appreciate someone!" />
            }
            renderItem={({ item }) => {
              const meta = BADGE_META[item.badge];
              return (
                <View style={s.apprCard}>
                  <View style={s.apprBadgeIcon}>
                    <Text style={s.apprBadgeEmoji}>{meta?.emoji ?? '🙌'}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={s.apprTopRow}>
                      <Text style={s.apprFrom} numberOfLines={2}>
                        <Text style={s.apprName}>{uname(item.from_user_name, item.from_user, 'Someone')}</Text>
                        {' → '}
                        <RecipientNamesInline
                          recipients={toRecipients(item.to_users, item.to_user_name, item.to_user)}
                          textStyle={s.apprName}
                          linkStyle={s.recipientLink}
                          onExpand={setRecipientsModal}
                        />
                      </Text>
                      {meta && (
                        <View style={s.apprBadgeChip}>
                          <Text style={s.apprBadgeChipText}>{meta.label}</Text>
                        </View>
                      )}
                    </View>
                    {!!item.message && <Text style={s.apprMsg}>"{renderMentionText(stripTags(stripNonContentElements(item.message)), s.mention)}"</Text>}
                    <Text style={s.apprTime}>{formatRelative(item.created_at)}</Text>
                  </View>
                </View>
              );
            }}
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
            {feedbackLoading && (feedbackView === 'received' ? receivedFeedback : givenFeedback).length === 0 ? (
              <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
            ) : feedbackError && (feedbackView === 'received' ? receivedFeedback : givenFeedback).length === 0 ? (
              <LoadError onRetry={loadFeedback} />
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
                        : namesWithMore(item.to_users, item.to_user_name, item.to_user)}
                      photoUrl={feedbackView === 'received'
                        ? (item.is_anonymous ? null : item.from_user?.photo_url)
                        : (item.to_users?.[0]?.photo_url ?? item.to_user?.photo_url)}
                      size={34}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={s.fbPerson}>
                        {feedbackView === 'received' ? (
                          `From ${item.is_anonymous ? 'Anonymous' : uname(item.from_user_name, item.from_user)}`
                        ) : (
                          <>
                            {'To '}
                            <RecipientNamesInline
                              recipients={toRecipients(item.to_users, item.to_user_name, item.to_user)}
                              textStyle={s.fbPerson}
                              linkStyle={s.recipientLink}
                              onExpand={setRecipientsModal}
                            />
                          </>
                        )}
                      </Text>
                      <Text style={s.fbTime}>{formatRelative(item.created_at)}</Text>
                    </View>
                    {item.type && (
                      <View style={s.fbTypeBadge}>
                        <Text style={s.fbTypeText}>{item.type}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={s.fbMsg}>{renderMentionText(stripTags(stripNonContentElements(item.feedback_text)), s.mention)}</Text>
                </View>
              ))
            )}
          </ScrollView>
        </View>
      )}

      {/* ── Give Feedback Modal ───────────────────────────── */}
      <Modal visible={showGiveFeedback} transparent animationType="slide" onRequestClose={closeGiveFeedback}>
        <KeyboardAvoidingView
          style={s.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={[s.modalSheet, { paddingBottom: insets.bottom + 20 }]}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>💬 Give Feedback</Text>
              <TouchableOpacity onPress={closeGiveFeedback}>
                <Ionicons name="close" size={22} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            {/* flexShrink: 1 — without it the ScrollView never gets squeezed into
                a bounded viewport by modalSheet's maxHeight (RN's flexShrink
                default is 0), so a long member list overflows uncapped instead
                of becoming scrollable. See GiveAppreciationModal for the same fix. */}
            <ScrollView style={{ flexShrink: 1 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={s.formLabel}>To</Text>
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
              ) : (
                <View style={s.fbMemberList}>
                  {fbFilteredMembers.length > 0 && (
                    <TouchableOpacity style={s.fbSelectAllRow} onPress={toggleFbSelectAll}>
                      <View style={[s.checkbox, fbAllFilteredSelected && s.checkboxActive]}>
                        {fbAllFilteredSelected && <Ionicons name="checkmark" size={13} color="#fff" />}
                      </View>
                      <Text style={s.fbSelectAllText}>{fbAllFilteredSelected ? 'Deselect All' : 'Select All'}</Text>
                      <Text style={s.fbSelectedCount}>{fbSelected.length}/{fbMembers.length}</Text>
                    </TouchableOpacity>
                  )}
                  {/* Select All stays fixed above; only the member rows
                      scroll, bounded to ~3 rows tall. */}
                  <ScrollView style={s.fbMemberScroll} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                    {fbFilteredMembers.slice(0, 50).map((m) => {
                      const checked = fbSelectedIds.has(m.id);
                      return (
                      <TouchableOpacity
                        key={m.id}
                        style={s.fbMemberRow}
                        onPress={() => toggleFbOne(m)}
                      >
                        <Avatar name={m.name} photoUrl={m.photoUrl} size={32} />
                        <Text style={[s.fbMemberName, { flex: 1 }]}>{m.name}</Text>
                        <View style={[s.checkbox, checked && s.checkboxActive]}>
                          {checked && <Ionicons name="checkmark" size={13} color="#fff" />}
                        </View>
                      </TouchableOpacity>
                      );
                    })}
                    {fbFilteredMembers.length === 0 && (
                      <Text style={s.fbHint}>No members found</Text>
                    )}
                  </ScrollView>
                </View>
              )}

              <Text style={s.formLabel}>Review Period</Text>
              <TouchableOpacity style={s.cyclePickerRow} onPress={() => setShowCyclePicker(true)}>
                <Ionicons name="calendar-outline" size={16} color={colors.gray400} />
                <Text style={fbCycleId ? s.cyclePickerValue : s.cyclePickerPlaceholder} numberOfLines={1}>
                  {fbCycleId
                    ? (fbCycles.find((c: any) => c.id === fbCycleId)?.cycle_name ?? 'Selected')
                    : 'Select (optional)'}
                </Text>
                <Ionicons name="chevron-down" size={16} color={colors.gray400} />
              </TouchableOpacity>

              <Text style={s.formLabel}>Message</Text>
              <TextInput
                style={s.fbMessageInput}
                placeholder="Write your feedback..."
                placeholderTextColor={colors.gray400}
                value={fbFeedbackText}
                onChangeText={(v) => {
                  const { text, blocked } = guardedTextChange(fbFeedbackText, v);
                  if (blocked) {
                    showAlert('Too Long to Paste', `That paste would exceed the ${CONTENT_MAX_LEN.toLocaleString()}-character limit, so it was not inserted.`);
                    return;
                  }
                  setFbFeedbackText(text);
                }}
                maxLength={CONTENT_MAX_LEN}
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
                style={[s.submitBtn, (fbSubmitting || fbSelected.length === 0) && s.submitBtnDisabled]}
                onPress={submitFeedback}
                disabled={fbSubmitting || fbSelected.length === 0}
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

      {/* Cycle Picker */}
      <Modal visible={showCyclePicker} transparent animationType="slide" onRequestClose={() => setShowCyclePicker(false)}>
        <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setShowCyclePicker(false)}>
          <View style={[s.cycleSheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={s.modalHandle} />
            <Text style={s.modalTitle}>Review Period</Text>
            <ScrollView>
              <TouchableOpacity
                style={[s.cycleOption, !fbCycleId && s.cycleOptionActive]}
                onPress={() => { setFbCycleId(null); setShowCyclePicker(false); }}
              >
                <Text style={[s.cycleOptionText, !fbCycleId && { color: colors.primary, fontWeight: '700' }]}>None (optional)</Text>
                {!fbCycleId && <Ionicons name="checkmark" size={18} color={colors.primary} style={{ marginLeft: 'auto' }} />}
              </TouchableOpacity>
              {fbCycles.map((c: any) => (
                <TouchableOpacity
                  key={c.id}
                  style={[s.cycleOption, fbCycleId === c.id && s.cycleOptionActive]}
                  onPress={() => { setFbCycleId(c.id); setShowCyclePicker(false); }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[s.cycleOptionText, fbCycleId === c.id && { color: colors.primary, fontWeight: '700' }]}>{c.cycle_name}</Text>
                    {(c.start_date || c.end_date) && (
                      <Text style={s.cycleDateText}>{c.start_date ?? ''} – {c.end_date ?? ''}</Text>
                    )}
                  </View>
                  {fbCycleId === c.id && <Ionicons name="checkmark" size={18} color={colors.primary} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
      <RecipientsModal recipients={recipientsModal} onClose={() => setRecipientsModal(null)} />
    </View>
  );
}

function uname(flat: string | null | undefined, obj: any, fallback = 'Unknown'): string {
  if (flat) return flat;
  if (obj?.first_name || obj?.last_name) return [obj.first_name, obj.last_name].filter(Boolean).join(' ');
  return obj?.email || fallback;
}

// Mirrors web's NamesWithMore: "Alice, Bob & +3 more" for multi-recipient
// appreciations/feedback, falling back to the single to_user for older records.
function namesWithMore(toUsers: any[] | undefined, flatSingle: string | null | undefined, singleObj: any): string {
  const names = (toUsers && toUsers.length ? toUsers : [singleObj]).filter(Boolean).map((u) => uname(null, u, 'Someone'));
  if (names.length === 0) return flatSingle ?? 'Someone';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  return `${names[0]}, ${names[1]} & +${names.length - 2} more`;
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
    typeFilterRow: { flexDirection: 'row', gap: 6, marginTop: 8, marginHorizontal: 16 },
    typeFilterChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, backgroundColor: c.gray50, borderWidth: 1, borderColor: c.border },
    typeFilterChipActive: { backgroundColor: c.primaryLight, borderColor: c.primary },
    typeFilterChipTxt: { fontSize: 11.5, fontWeight: '600', color: c.textSecondary },
    typeFilterChipTxtActive: { color: c.primary, fontWeight: '700' },
    loadMoreBtn: {
      alignItems: 'center', justifyContent: 'center', paddingVertical: 14,
      marginTop: 4, marginBottom: 8, borderRadius: 10,
      backgroundColor: c.gray50, borderWidth: 1, borderColor: c.border,
    },
    loadMoreTxt: { fontSize: 13, fontWeight: '700', color: c.primary },

    list: { padding: 16, paddingBottom: 32 },
    listHeader: { marginHorizontal: -16, marginTop: -16, marginBottom: 8 },

    // Appreciations
    apprCard: {
      backgroundColor: c.surface, borderRadius: 14, padding: 14, marginBottom: 12,
      borderWidth: 1, borderColor: c.border,
      flexDirection: 'row', alignItems: 'flex-start', gap: 14,
    },
    apprBadgeIcon: {
      width: 52, height: 52, borderRadius: 26,
      backgroundColor: c.primaryLight, alignItems: 'center', justifyContent: 'center',
    },
    apprBadgeEmoji: { fontSize: 26 },
    apprTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 },
    apprFrom: { fontSize: 13, color: c.textSecondary, lineHeight: 18, flex: 1 },
    apprName: { fontWeight: '700', color: c.textPrimary },
    recipientLink: { fontWeight: '700', color: c.primary, textDecorationLine: 'underline' },
    apprBadgeChip: {
      backgroundColor: c.primaryLight, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12,
    },
    apprBadgeChipText: { fontSize: 11, fontWeight: '600', color: c.primary },
    apprTime: { fontSize: 11, color: c.gray400, marginTop: 4 },
    apprMsg: { fontSize: 14, color: c.textPrimary, lineHeight: 20, fontStyle: 'italic', marginTop: 4 },
    mention: { fontWeight: '700', color: c.primary },

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
    fbSearchBar: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: c.gray100, borderRadius: 10,
      paddingHorizontal: 12, paddingVertical: 10,
      borderWidth: 1, borderColor: c.border,
    },
    fbSearchInput: { flex: 1, fontSize: 14, color: c.textPrimary },
    fbHint: { fontSize: 14, color: c.gray400, textAlign: 'center', padding: 16 },
    fbMemberList: { marginTop: 8, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: c.border },
    fbSelectAllRow: {
      flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12,
      backgroundColor: c.gray50, borderBottomWidth: 1, borderBottomColor: c.border,
    },
    fbSelectAllText: { fontSize: 13, fontWeight: '700', color: c.textPrimary },
    fbSelectedCount: { marginLeft: 'auto', fontSize: 12, color: c.textMuted },
    fbMemberScroll: { maxHeight: 175 },
    fbMemberRow: {
      flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12,
      backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border,
    },
    fbMemberName: { fontSize: 14, fontWeight: '600', color: c.textPrimary },
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
    cyclePickerRow: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      backgroundColor: c.gray100, borderRadius: 10, padding: 12,
      borderWidth: 1, borderColor: c.border,
    },
    cyclePickerValue: { flex: 1, fontSize: 14, color: c.textPrimary },
    cyclePickerPlaceholder: { flex: 1, fontSize: 14, color: c.gray400 },
    cycleSheet: {
      backgroundColor: c.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20,
      padding: 20, paddingTop: 12, maxHeight: '70%',
    },
    modalHandle: { width: 40, height: 4, backgroundColor: c.gray200, borderRadius: 2, alignSelf: 'center', marginBottom: 14 },
    cycleOption: {
      flexDirection: 'row', alignItems: 'center',
      paddingVertical: 12, paddingHorizontal: 8, borderRadius: 10,
    },
    cycleOptionActive: { backgroundColor: c.primaryLight },
    cycleOptionText: { fontSize: 15, color: c.textPrimary },
    cycleDateText: { fontSize: 11, color: c.gray400, marginTop: 1 },
  });
}
