import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useApi } from '../../hooks/useApi';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useTheme } from '../../contexts/ThemeContext';
import { AppColors } from '../../utils/colors';
import { formatRelative } from '../../utils/format';
import ScreenHeader from '../../components/common/ScreenHeader';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import LoadError from '../../components/common/LoadError';
import { useLoadWithTimeout } from '../../hooks/useLoadWithTimeout';
import EmptyState from '../../components/common/EmptyState';
import { RootStackParamList } from '../../navigation/types';

interface Notif {
  id: number;
  app_id: number;
  task_id: number | null;
  entity_id: number | null;
  entity_type: string | null;
  title: string;
  preview: string;
  type: string;
  read_at: string | null;
  created_at: string;
  app_name: string | null;
}

const TYPE_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  mention_task_comment: 'checkmark-circle-outline',
  mention_feed_comment: 'chatbubble-outline',
  mention_feed_post: 'newspaper-outline',
  feed_post: 'newspaper-outline',
  task_assigned: 'clipboard-outline',
  task_commented: 'chatbubble-outline',
  task_reassigned: 'swap-horizontal-outline',
  task_overdue: 'alert-circle-outline',
  appreciation: 'ribbon-outline',
  feedback_received: 'bulb-outline',
  wish: 'gift-outline',
  review_started: 'create-outline',
  review_submitted: 'paper-plane-outline',
  review_rejected: 'arrow-undo-outline',
  review_approved: 'checkmark-done-circle-outline',
  project_join_request: 'people-outline',
  project_join_accepted: 'checkmark-circle-outline',
  project_join_rejected: 'close-circle-outline',
  project_commented: 'chatbox-outline',
  checkin_comment: 'document-text-outline',
};

export default function NotificationsScreen() {
  const api = useApi();
  const { workspace } = useWorkspace();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [notifications, setNotifications] = useState<Notif[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const { loading, loadError, run } = useLoadWithTimeout();

  // Scoped to the workspace the user is currently in — without app_id the
  // backend returns notifications across every workspace the user belongs
  // to, which reads as noise (and mis-routes on tap) in a single-workspace
  // mobile view.
  const load = useCallback(async () => {
    if (!workspace) return;
    const r = await api.notifications.list({ limit: 50, app_id: workspace.id });
    setNotifications(r.data?.items ?? []);
  }, [api, workspace]);

  useEffect(() => { run(load); }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await run(load, true);
    setRefreshing(false);
  };

  // Matches qa-production/frontend's NotificationBell.jsx routing table exactly —
  // entity_id's meaning varies per type (e.g. for mention_feed_comment it's the
  // *comment* id, not the post id), so — same as web — feed types land on the
  // Feed tab generally rather than guessing a specific post to deep-link to.
  const TASK_TYPES = ['mention_task_comment', 'task_assigned', 'task_commented', 'task_reassigned', 'task_overdue'];
  const FEED_TYPES = ['mention_feed_comment', 'mention_feed_post', 'feed_post', 'appreciation', 'feedback_received', 'wish'];
  const PERF_TYPES = ['review_started', 'review_rejected', 'review_approved'];
  const PROJECT_TYPES = ['project_join_request', 'project_join_accepted', 'project_join_rejected', 'project_commented'];

  const handleTap = async (item: Notif) => {
    if (!item.read_at) {
      try {
        await api.notifications.markRead(item.id);
        setNotifications((prev) =>
          prev.map((n) => (n.id === item.id ? { ...n, read_at: new Date().toISOString() } : n))
        );
      } catch {}
    }

    if (!item.app_id) return;

    if (TASK_TYPES.includes(item.type) && item.task_id) {
      navigation.navigate('Main', {
        screen: 'TasksTab',
        params: { screen: 'TaskDetail', params: { taskId: item.task_id, appId: item.app_id }, initial: false },
      } as never);
    } else if (FEED_TYPES.includes(item.type)) {
      const initialTab = item.type === 'feedback_received' ? 'feedback'
        : item.type === 'appreciation' ? 'appreciations'
        : 'feed';
      navigation.navigate('Main', {
        screen: 'FeedTab',
        params: { screen: 'FeedList', params: { initialTab }, initial: false },
      } as never);
    } else if (PERF_TYPES.includes(item.type)) {
      navigation.navigate('Main', { screen: 'PerformanceTab' } as never);
    } else if (PROJECT_TYPES.includes(item.type)) {
      navigation.navigate('Main', {
        screen: 'MoreTab',
        params: { screen: 'ProjectsList' },
      } as never);
    }
  };

  const markAllRead = async () => {
    try {
      await api.notifications.markAllRead(workspace?.id);
      setNotifications((prev) => prev.map((n) => ({ ...n, read_at: new Date().toISOString() })));
    } catch {}
  };

  const unreadCount = notifications.filter((n) => !n.read_at).length;

  if (loading) return <LoadingSpinner />;
  if (loadError) return <LoadError onRetry={() => run(load)} />;

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <ScreenHeader
        title="Notifications"
        subtitle={unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
        showBack
        right={
          unreadCount > 0 ? (
            <TouchableOpacity onPress={markAllRead}>
              <Text style={s.markAll}>Mark all read</Text>
            </TouchableOpacity>
          ) : undefined
        }
      />

      <FlatList
        data={notifications}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={s.list}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <EmptyState icon="notifications-outline" title="No notifications" subtitle="You're all caught up!" />
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[s.item, !item.read_at && s.unread]}
            onPress={() => handleTap(item)}
            activeOpacity={0.8}
          >
            <View style={[s.iconWrap, !item.read_at && s.iconWrapUnread]}>
              <Ionicons
                name={TYPE_ICON[item.type] ?? 'notifications-outline'}
                size={18}
                color={!item.read_at ? colors.primary : colors.gray400}
              />
            </View>
            <View style={s.body}>
              <Text style={[s.notifTitle, !item.read_at && s.unreadText]} numberOfLines={1}>
                {item.title}
              </Text>
              <Text style={s.time}>{formatRelative(item.created_at)}</Text>
            </View>
            {!item.read_at && <View style={s.dot} />}
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

function makeStyles(c: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    markAll: { fontSize: 13, color: c.primary, fontWeight: '600' },
    list: { padding: 12, paddingBottom: 40 },
    item: {
      flexDirection: 'row', alignItems: 'flex-start', gap: 12,
      backgroundColor: c.surface, borderRadius: 12, padding: 14, marginBottom: 8,
      borderWidth: 1, borderColor: c.border,
      shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 2, elevation: 1,
    },
    unread: { backgroundColor: c.primaryLight, borderColor: c.primary },
    iconWrap: {
      width: 36, height: 36, borderRadius: 10, backgroundColor: c.gray100,
      alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    },
    iconWrapUnread: { backgroundColor: c.surface },
    body: { flex: 1 },
    notifTitle: { fontSize: 14, fontWeight: '500', color: c.textPrimary, marginBottom: 2 },
    unreadText: { fontWeight: '700' },
    preview: { fontSize: 13, color: c.gray500, lineHeight: 18, marginBottom: 4 },
    time: { fontSize: 12, color: c.gray400 },
    dot: {
      width: 8, height: 8, borderRadius: 4, backgroundColor: c.primary,
      marginTop: 4, flexShrink: 0,
    },
  });
}
