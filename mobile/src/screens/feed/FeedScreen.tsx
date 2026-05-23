import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity, RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
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

  const load = useCallback(async () => {
    if (!workspace) return;
    try {
      const r = await api.feed.list(workspace.id);
      const d = r.data;
      setPosts(Array.isArray(d) ? d : (d?.items ?? d?.posts ?? []));
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

  const handleReact = async (postId: number) => {
    if (!workspace) return;
    try {
      await api.feed.addReaction(workspace.id, postId, '❤️');
      await load();
    } catch {}
  };

  if (loading) return <LoadingSpinner />;

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <Text style={s.title}>Team Feed</Text>
        <TouchableOpacity
          style={s.addBtn}
          onPress={() => navigation.navigate('CreatePost', { appId: workspace!.id })}
        >
          <Ionicons name="add" size={22} color="#ffffff" />
        </TouchableOpacity>
      </View>

      <GiveAppreciationModal
        visible={showAppreciation}
        onClose={() => setShowAppreciation(false)}
        onSuccess={load}
        appId={workspace!.id}
      />

      <FlatList
        data={posts}
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
            onPress={() => navigation.navigate('PostDetail', { postId: item.id, appId: workspace!.id })}
            onReact={() => handleReact(item.id)}
          />
        )}
      />
    </View>
  );
}

function makeStyles(c: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      backgroundColor: c.surface, paddingHorizontal: 20, paddingBottom: 14,
      paddingTop: 10, borderBottomWidth: 1, borderBottomColor: c.border,
    },
    title: { fontSize: 20, fontWeight: '700', color: c.textPrimary },
    addBtn: {
      width: 38, height: 38, borderRadius: 12, backgroundColor: c.primary,
      alignItems: 'center', justifyContent: 'center',
    },
    list: { padding: 16, paddingBottom: 32 },
  });
}
