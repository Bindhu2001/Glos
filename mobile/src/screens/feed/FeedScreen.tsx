import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity, RefreshControl, Platform, Alert, TextInput,
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
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import { FeedStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<FeedStackParamList, 'FeedList'>;

export default function FeedScreen() {
  const api = useApi();
  const { workspace } = useWorkspace();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();

  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAppreciation, setShowAppreciation] = useState(false);
  const [likedIds, setLikedIds] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    if (!workspace) return;
    try {
      const r = await api.feed.list(workspace.id);
      const d = r.data;
      setPosts(Array.isArray(d) ? d : (d?.items ?? d?.posts ?? []));
    } catch {}
  }, [workspace, api]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
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

  const handleReact = async (postId: number) => {
    if (!workspace) return;
    const alreadyLiked = likedIds.has(postId);
    setLikedIds(prev => {
      const next = new Set(prev);
      alreadyLiked ? next.delete(postId) : next.add(postId);
      return next;
    });
    setPosts(prev => prev.map(p =>
      p.id === postId
        ? { ...p, reaction_count: Math.max(0, (p.reaction_count ?? 0) + (alreadyLiked ? -1 : 1)) }
        : p
    ));
    if (!alreadyLiked) {
      try { await api.feed.addReaction(workspace.id, postId, '❤️'); } catch {}
    }
  };

  if (loading) return <LoadingSpinner />;

  const filtered = search
    ? posts.filter((p) => {
        const q = search.toLowerCase();
        return (
          (p.content ?? p.body ?? '').toLowerCase().includes(q) ||
          (p.author_name ?? p.author ?? '').toLowerCase().includes(q)
        );
      })
    : posts;

  const appreciationsCount = posts.filter(p => p.post_type === 'appreciation' || p.type === 'appreciation').length;
  const postsCount = posts.length - appreciationsCount;

  const highlights = [
    { label: 'New Posts', count: postsCount, icon: 'document-text-outline' as const, color: colors.primary },
    { label: 'Appreciations', count: appreciationsCount, icon: 'heart-outline' as const, color: colors.success },
    { label: 'Total', count: posts.length, icon: 'layers-outline' as const, color: colors.secondary },
  ];

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Page header */}
      <View style={s.pageHeader}>
        <Text style={s.breadcrumb}>{workspace?.name?.toUpperCase() ?? 'WORKSPACE'} · SOCIAL</Text>
        <Text style={s.pageTitle}>Feed</Text>
        <Text style={s.subtitle}>What's happening across your team.</Text>
      </View>

      {/* Action buttons */}
      <View style={s.actionRow}>
        <TouchableOpacity style={s.actionBtn} onPress={() => setShowAppreciation(true)}>
          <Ionicons name="heart-outline" size={15} color={colors.success} />
          <Text style={[s.actionBtnTxt, { color: colors.success }]}>Give Appreciation</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.actionBtn, s.actionBtnPrimary]}
          onPress={() => navigation.navigate('CreatePost', { appId: workspace!.id })}
        >
          <Ionicons name="add" size={15} color="#ffffff" />
          <Text style={[s.actionBtnTxt, { color: '#ffffff' }]}>Write a Post</Text>
        </TouchableOpacity>
      </View>

      {/* Highlights strip */}
      <View style={s.highlightsRow}>
        {highlights.map((h, i) => (
          <View key={h.label} style={[s.highlightItem, i > 0 && s.highlightBorder]}>
            <Ionicons name={h.icon} size={14} color={h.color} />
            <Text style={[s.highlightCount, { color: h.color }]}>{h.count}</Text>
            <Text style={s.highlightLabel}>{h.label}</Text>
          </View>
        ))}
      </View>

      {/* Search bar */}
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

      <GiveAppreciationModal
        visible={showAppreciation}
        onClose={() => setShowAppreciation(false)}
        onSuccess={load}
        appId={workspace!.id}
      />

      <FlatList
        data={filtered}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={s.list}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <EmptyState icon="newspaper-outline" title="No posts yet" subtitle="Share something with your team!" />
        }
        renderItem={({ item }) => (
          <PostCard
            post={item}
            liked={likedIds.has(item.id)}
            onPress={() => navigation.navigate('PostDetail', { postId: item.id, appId: workspace!.id })}
            onReact={() => handleReact(item.id)}
            onDelete={() => handleDelete(item.id)}
          />
        )}
      />
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

    actionRow: {
      flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingVertical: 12,
      backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border,
    },
    actionBtn: {
      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
      paddingVertical: 9, borderRadius: 10,
      backgroundColor: c.successLight, borderWidth: 1, borderColor: c.success + '33',
    },
    actionBtnPrimary: { backgroundColor: c.primary, borderColor: c.primary },
    actionBtnTxt: { fontSize: 13, fontWeight: '700' },

    highlightsRow: {
      flexDirection: 'row', backgroundColor: c.surface,
      borderBottomWidth: 1, borderBottomColor: c.border,
    },
    highlightItem: {
      flex: 1, alignItems: 'center', paddingVertical: 10, gap: 2,
    },
    highlightBorder: { borderLeftWidth: 1, borderLeftColor: c.border },
    highlightCount: { fontSize: 16, fontWeight: '800', letterSpacing: -0.5 },
    highlightLabel: { fontSize: 9, fontWeight: '600', color: c.textMuted, letterSpacing: 0.3 },

    searchBar: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: c.surface, marginHorizontal: 16, marginTop: 8, marginBottom: 4,
      borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9,
      borderWidth: 1.5, borderColor: c.border,
    },
    searchInput: { flex: 1, fontSize: 14, color: c.textPrimary },

    list: { padding: 16, paddingBottom: 32 },
  });
}
