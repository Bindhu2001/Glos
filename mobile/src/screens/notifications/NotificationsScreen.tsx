import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useApi } from '../../hooks/useApi';
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
};

export default function NotificationsScreen() {
  const api = useApi();
  const { colors } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [notifications, setNotifications] = useState<Notif[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const { loading, loadError, run } = useLoadWithTimeout();

  const load = useCallback(async () => {
    const r = await api.notifications.list({ limit: 50 });
    setNotifications(r.data?.items ?? []);
  }, [api]);

  useEffect(() => { run(load); }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await run(load, true);
    setRefreshing(false);
  };

  const handleTap = async (item: Notif) => {
    if (!item.read_at) {
      try {
        await api.notifications.markRead(item.id);
        setNotifications((prev) =>
          prev.map((n) => (n.id === item.id ? { ...n, read_at: new Date().toISOString() } : n))
        );
      } catch {}
    }

    if (item.type === 'mention_task_comment' && item.task_id && item.app_id) {
      navigation.navigate('Main', {
        screen: 'TasksTab',
        params: { screen: 'TaskDetail', params: { taskId: item.task_id, appId: item.app_id } },
      });
    } else if (
      (item.type === 'mention_feed_comment' || item.type === 'mention_feed_post') &&
      item.app_id && item.entity_id
    ) {
      navigation.navigate('Main', {
        screen: 'FeedTab',
        params: { screen: 'PostDetail', params: { postId: item.entity_id, appId: item.app_id } },
      });
    } else if (
      (item.type === 'mention_feed_comment' || item.type === 'mention_feed_post') &&
      item.app_id
    ) {
      navigation.navigate('Main', { screen: 'FeedTab' });
    }
  };

  const markAllRead = async () => {
    try {
      await api.notifications.markAllRead();
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
              {item.preview && (
                <Text style={s.preview} numberOfLines={2}>{item.preview}</Text>
              )}
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
