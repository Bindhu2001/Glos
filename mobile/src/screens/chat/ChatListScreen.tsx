import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, ActivityIndicator, RefreshControl, TextInput } from 'react-native';
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
import { apiErrorMessage } from '../../utils/apiError';
import { showAlert } from '../../components/common/AlertModal';
import LoadError from '../../components/common/LoadError';

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
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());

  const load = useCallback(async (isRefresh = false) => {
    if (!workspace?.id) return;
    if (!isRefresh) setLoading(true);
    try {
      const res = await api.chat.listConversations(workspace.id);
      setConversations(res.data ?? []);
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not load conversations.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [workspace?.id]);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const noteConv = conversations.find((c) => c.type === 'note');
  const regularConvs = conversations
    .filter((c) => c.type !== 'note')
    .filter((c) => {
      if (!search.trim()) return true;
      const name = (c.display_name ?? c.name ?? '').toLowerCase();
      return name.includes(search.trim().toLowerCase());
    });

  const openNotes = async () => {
    if (!workspace?.id) return;
    if (noteConv) {
      navigation.navigate('ChatThread', { conversationId: noteConv.id, appId: workspace.id, title: 'My Notes', type: 'note' });
      return;
    }
    try {
      const res = await api.chat.createConversation(workspace.id, { type: 'note' });
      const conv = res.data;
      navigation.navigate('ChatThread', { conversationId: conv.id, appId: workspace.id, title: 'My Notes', type: 'note' });
    } catch (err) {
      showAlert('Could not open notes', apiErrorMessage(err));
    }
  };

  useEffect(() => {
    if (!workspace?.id) return;
    const socket = getSocket(async () => (await getToken()) ?? '');
    if (!socket) return;
    const appId = workspace.id;
    const onUpdate = () => load();
    const onPresence = (payload: any) => setOnlineIds(new Set((payload.online ?? []).map((x: any) => String(x))));
    const doJoin = () => {
      socket.emit('join', { appId });
      socket.emit('get_presence');
      socket.on('new_message', onUpdate);
      socket.on('read_receipt', onUpdate);
      socket.on('conversation_created', onUpdate);
      socket.on('conversation_updated', onUpdate);
      socket.on('conversation_deleted', onUpdate);
      socket.on('presence_update', onPresence);
    };
    if (socket.connected) doJoin();
    else socket.once('connect', doJoin);
    return () => {
      socket.off('new_message', onUpdate);
      socket.off('read_receipt', onUpdate);
      socket.off('conversation_created', onUpdate);
      socket.off('conversation_updated', onUpdate);
      socket.off('conversation_deleted', onUpdate);
      socket.off('presence_update', onPresence);
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

      <View style={s.searchRow}>
        <Ionicons name="search" size={15} color={colors.gray400} />
        <TextInput
          style={s.searchInput}
          placeholder="Search conversations..."
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

      {loading ? (
        <ActivityIndicator style={{ flex: 1 }} color={colors.primary} />
      ) : error ? (
        <LoadError message={error} onRetry={() => load()} />
      ) : (
        <ScrollView
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} />}
        >
          <TouchableOpacity style={s.notesCard} activeOpacity={0.7} onPress={openNotes}>
            <View style={s.notesIconBox}>
              <Text style={s.notesIcon}>📝</Text>
            </View>
            <View style={s.cardBody}>
              <Text style={s.name}>My Notes</Text>
              <Text style={s.lastMsg} numberOfLines={1}>Personal notes &amp; reminders</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.gray400} />
          </TouchableOpacity>

          {regularConvs.length === 0 ? (
            <View style={s.empty}>
              <Ionicons name="chatbubbles-outline" size={40} color={colors.gray400} />
              <Text style={s.emptyText}>No conversations yet</Text>
            </View>
          ) : (
            regularConvs.map((c) => {
              const name = c.display_name ?? c.name ?? 'Conversation';
              const lastBody = c.last_message?.deleted_at ? 'This message was deleted' : (c.last_message?.body ?? 'No messages yet');
              const unread = c.unread_count > 0;
              return (
                <TouchableOpacity
                  key={c.id}
                  style={[s.card, unread && s.cardUnread]}
                  activeOpacity={0.7}
                  onPress={() => navigation.navigate('ChatThread', { conversationId: c.id, appId: workspace!.id, title: name, type: c.type })}
                >
                  <View style={s.avatarWrap}>
                    <View style={s.avatar}>
                      <Text style={s.avatarTxt}>{initials(name)}</Text>
                    </View>
                    {c.type === 'direct' && c.other_user_id != null && onlineIds.has(String(c.other_user_id)) && (
                      <View style={s.onlineDot} />
                    )}
                  </View>
                  <View style={s.cardBody}>
                    <View style={s.rowTop}>
                      <Text style={[s.name, unread && s.nameUnread]} numberOfLines={1}>{name}</Text>
                      <Text style={[s.time, unread && s.timeUnread]}>{timeAgo(c.last_message?.created_at)}</Text>
                    </View>
                    <Text style={[s.lastMsg, unread && s.lastMsgUnread]} numberOfLines={1}>{lastBody}</Text>
                  </View>
                  {unread && (
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
    searchRow: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      marginHorizontal: 16, marginTop: 12, marginBottom: 4,
      backgroundColor: c.surface, borderRadius: 10, borderWidth: 1, borderColor: c.border,
      paddingHorizontal: 12, paddingVertical: 8,
    },
    searchInput: { flex: 1, fontSize: 13, color: c.textPrimary },
    list: { padding: 16, gap: 8 },
    empty: { alignItems: 'center', gap: 12, paddingTop: 60 },
    emptyText: { fontSize: 14, color: c.textMuted },
    card: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: c.surface, borderRadius: 14, padding: 12,
      borderWidth: 1, borderColor: c.border,
    },
    cardUnread: { borderColor: c.primary + '55', backgroundColor: c.primaryLight + '18' },
    notesCard: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: c.warningLight, borderRadius: 14, padding: 12,
      borderWidth: 1, borderColor: c.warning + '55', marginBottom: 12,
    },
    notesIconBox: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' },
    notesIcon: { fontSize: 20 },
    avatarWrap: { position: 'relative' },
    avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.primaryLight, alignItems: 'center', justifyContent: 'center' },
    avatarTxt: { fontSize: 15, fontWeight: '900', color: c.primary },
    onlineDot: {
      position: 'absolute', bottom: 0, right: 0, width: 12, height: 12, borderRadius: 6,
      backgroundColor: c.success, borderWidth: 2, borderColor: c.surface,
    },
    cardBody: { flex: 1, gap: 2 },
    rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    name: { flex: 1, fontSize: 14, fontWeight: '700', color: c.textPrimary },
    nameUnread: { fontWeight: '800' },
    time: { fontSize: 11, color: c.textMuted, marginLeft: 8 },
    timeUnread: { color: c.primary, fontWeight: '700' },
    lastMsg: { fontSize: 12, color: c.textSecondary },
    lastMsgUnread: { color: c.textPrimary, fontWeight: '600' },
    badge: { backgroundColor: c.primary, borderRadius: 10, minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
    badgeText: { fontSize: 11, fontWeight: '700', color: '#fff' },
  });
}
