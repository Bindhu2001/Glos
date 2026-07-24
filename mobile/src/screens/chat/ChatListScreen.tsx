import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, ActivityIndicator, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '@clerk/clerk-expo';
import { useTheme } from '../../contexts/ThemeContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useApi } from '../../hooks/useApi';
import { getSocket } from '../../lib/socket';
import { AppColors } from '../../utils/colors';
import { ChatStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<ChatStackParamList, 'ChatList'>;

function initials(name?: string) {
  if (!name) return '?';
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
}

function timeAgo(iso?: string) {
  if (!iso) return '';
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return 'now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

export default function ChatListScreen() {
  const navigation = useNavigation<Nav>();
  const { colors } = useTheme();
  const { workspace } = useWorkspace();
  const api = useApi();
  const { getToken } = useAuth();
  const insets = useSafeAreaInsets();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [conversations, setConversations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (!workspace?.id) return;
    if (!isRefresh) setLoading(true);
    try {
      const res = await api.chat.listConversations(workspace.id);
      setConversations(res.data ?? []);
    } catch {
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [workspace?.id]);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  useEffect(() => {
    if (!workspace?.id) return;
    const socket = getSocket(async () => (await getToken()) ?? '');
    if (!socket) return;
    const appId = workspace.id;
    const onUpdate = () => load();
    const doJoin = () => {
      socket.emit('join', { appId });
      socket.on('new_message', onUpdate);
      socket.on('read_receipt', onUpdate);
      socket.on('conversation_created', onUpdate);
      socket.on('conversation_updated', onUpdate);
      socket.on('conversation_deleted', onUpdate);
    };
    if (socket.connected) doJoin();
    else socket.once('connect', doJoin);
    return () => {
      socket.off('new_message', onUpdate);
      socket.off('read_receipt', onUpdate);
      socket.off('conversation_created', onUpdate);
      socket.off('conversation_updated', onUpdate);
      socket.off('conversation_deleted', onUpdate);
    };
  }, [workspace?.id, getToken, load]);

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <Text style={s.title}>Chat</Text>
        <TouchableOpacity style={s.addBtn} onPress={() => navigation.navigate('NewConversation', { appId: workspace!.id })}>
          <Ionicons name="add" size={22} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator style={{ flex: 1 }} color={colors.primary} />
      ) : (
        <ScrollView
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} />}
        >
          {conversations.length === 0 ? (
            <View style={s.empty}>
              <Ionicons name="chatbubbles-outline" size={40} color={colors.gray400} />
              <Text style={s.emptyText}>No conversations yet</Text>
            </View>
          ) : (
            conversations.map((c) => {
              const name = c.display_name ?? c.name ?? 'Conversation';
              const lastBody = c.last_message?.deleted_at ? 'This message was deleted' : (c.last_message?.body ?? 'No messages yet');
              return (
                <TouchableOpacity
                  key={c.id}
                  style={s.card}
                  activeOpacity={0.7}
                  onPress={() => navigation.navigate('ChatThread', { conversationId: c.id, appId: workspace!.id, title: name })}
                >
                  <View style={s.avatar}>
                    <Text style={s.avatarTxt}>{initials(name)}</Text>
                  </View>
                  <View style={s.cardBody}>
                    <View style={s.rowTop}>
                      <Text style={s.name} numberOfLines={1}>{name}</Text>
                      <Text style={s.time}>{timeAgo(c.last_message?.created_at)}</Text>
                    </View>
                    <Text style={s.lastMsg} numberOfLines={1}>{lastBody}</Text>
                  </View>
                  {c.unread_count > 0 && (
                    <View style={s.badge}>
                      <Text style={s.badgeText}>{c.unread_count > 99 ? '99+' : c.unread_count}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })
          )}
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
      paddingHorizontal: 20, paddingVertical: 12,
      backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border,
    },
    title: { fontSize: 26, fontFamily: SERIF, color: c.textPrimary },
    addBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: c.primaryLight, alignItems: 'center', justifyContent: 'center' },
    list: { padding: 16, gap: 8 },
    empty: { alignItems: 'center', gap: 12, paddingTop: 60 },
    emptyText: { fontSize: 14, color: c.textMuted },
    card: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: c.surface, borderRadius: 14, padding: 12,
      borderWidth: 1, borderColor: c.border,
    },
    avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.primaryLight, alignItems: 'center', justifyContent: 'center' },
    avatarTxt: { fontSize: 15, fontWeight: '900', color: c.primary },
    cardBody: { flex: 1, gap: 2 },
    rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    name: { flex: 1, fontSize: 14, fontWeight: '700', color: c.textPrimary },
    time: { fontSize: 11, color: c.textMuted, marginLeft: 8 },
    lastMsg: { fontSize: 12, color: c.textSecondary },
    badge: { backgroundColor: c.primary, borderRadius: 10, minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
    badgeText: { fontSize: 11, fontWeight: '700', color: '#fff' },
  });
}
