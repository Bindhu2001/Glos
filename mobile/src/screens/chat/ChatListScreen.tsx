import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
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
import { stripAttachmentMarkers } from '../../utils/attachments';
import LoadError from '../../components/common/LoadError';
import Avatar from '../../components/common/Avatar';
import { getAllDrafts } from '../../utils/chatDrafts';

type Nav = NativeStackNavigationProp<ChatStackParamList, 'ChatList'>;

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
  // See ChatThreadScreen for why this is read via a ref rather than listed in
  // the socket effect's deps: Clerk's `getToken` isn't reference-stable across
  // renders, so including it there made the effect re-run constantly, which —
  // combined with the un-cleaned-up `once('connect', ...)` below — silently
  // accumulated duplicate listeners over the life of the screen.
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;
  const insets = useSafeAreaInsets();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const [conversations, setConversations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const hasLoadedRef = useRef(false);

  // useFocusEffect below already re-runs this on mount, so a plain mount effect
  // would double-fetch. It also re-runs on every return to this screen — only
  // the very first call should show the full-screen spinner; refocusing an
  // already-loaded list should refresh quietly instead of blanking the screen.
  const load = useCallback(async (isRefresh = false) => {
    if (!workspace?.id) return;
    if (!isRefresh && !hasLoadedRef.current) setLoading(true);
    try {
      const res = await api.chat.listConversations(workspace.id);
      setConversations(res.data ?? []);
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not load conversations.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
      hasLoadedRef.current = true;
    }
  }, [workspace?.id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Refreshed on every focus (not just mount) so coming back from a thread
  // where you typed something updates that row's preview immediately.
  useFocusEffect(useCallback(() => {
    getAllDrafts().then(setDrafts);
  }, []));

  const noteConv = conversations.find((c) => c.type === 'note');
  // Web bumps updated_at and re-sorts on every new_message (Chat.jsx) so the most
  // recently active conversation floats to top — the list endpoint here doesn't
  // guarantee that ordering itself, so sort client-side the same way.
  const regularConvs = conversations
    .filter((c) => c.type !== 'note')
    .filter((c) => {
      if (!search.trim()) return true;
      const name = (c.display_name ?? c.name ?? '').toLowerCase();
      return name.includes(search.trim().toLowerCase());
    })
    .sort((a, b) => {
      const at = new Date(a.updated_at ?? a.last_message?.created_at ?? 0).getTime();
      const bt = new Date(b.updated_at ?? b.last_message?.created_at ?? 0).getTime();
      return bt - at;
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
    const socket = getSocket(async () => (await getTokenRef.current()) ?? '');
    if (!socket) return;
    const appId = workspace.id;
    const onUpdate = () => load(true);
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
      // Cancels a still-pending `doJoin` if this effect re-runs (or unmounts)
      // before 'connect' fired — see ChatThreadScreen for the full explanation
      // of the leak this prevents.
      socket.off('connect', doJoin);
      socket.off('new_message', onUpdate);
      socket.off('read_receipt', onUpdate);
      socket.off('conversation_created', onUpdate);
      socket.off('conversation_updated', onUpdate);
      socket.off('conversation_deleted', onUpdate);
      socket.off('presence_update', onPresence);
    };
  // getToken is read via getTokenRef (see above) so this only (re)joins when
  // the workspace changes, not on every render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace?.id, load]);

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.pageHeader}>
        <Text style={s.breadcrumb}>{workspace?.name?.toUpperCase() ?? 'WORKSPACE'} · CHAT</Text>
        <View style={s.titleRow}>
          <Text style={s.pageTitle}>Chat</Text>
          <TouchableOpacity style={s.addBtn} onPress={() => navigation.navigate('NewConversation', { appId: workspace!.id })}>
            <Ionicons name="add" size={20} color={colors.primary} />
          </TouchableOpacity>
        </View>
        <Text style={s.subtitle}>Message your team, DMs and notes.</Text>
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
              const hasAttachment = !c.last_message?.deleted_at && !!c.last_message?.has_attachments;
              // Strip the [[att:N]] inline-attachment marker web can insert into
              // a body — otherwise a message that's e.g. "Check this [[att:0]]
              // out" shows the raw token here, and a message that's *just* an
              // attachment marker (no other text) would show as blank instead
              // of falling back to "Attachment".
              const strippedBody = c.last_message?.body ? stripAttachmentMarkers(c.last_message.body) : '';
              const lastBody = c.last_message?.deleted_at
                ? 'This message was deleted'
                : (strippedBody.trim() ? strippedBody : (hasAttachment ? 'Attachment' : 'No messages yet'));
              const draftText = drafts[c.id];
              const unread = c.unread_count > 0;
              const otherPhotoUrl = c.type === 'direct'
                ? c.members?.find((m: any) => String(m.id) === String(c.other_user_id))?.photo_url ?? null
                : null;
              return (
                <TouchableOpacity
                  key={c.id}
                  style={[s.card, unread && s.cardUnread]}
                  activeOpacity={0.7}
                  onPress={() => navigation.navigate('ChatThread', { conversationId: c.id, appId: workspace!.id, title: name, type: c.type })}
                >
                  <View style={s.avatarWrap}>
                    <Avatar name={name} photoUrl={otherPhotoUrl} size={44} />
                    {c.type === 'direct' && c.other_user_id != null && onlineIds.has(String(c.other_user_id)) && (
                      <View style={s.onlineDot} />
                    )}
                  </View>
                  <View style={s.cardBody}>
                    <View style={s.rowTop}>
                      <Text style={[s.name, unread && s.nameUnread]} numberOfLines={1}>{name}</Text>
                      <Text style={[s.time, unread && s.timeUnread]}>{timeAgo(c.last_message?.created_at)}</Text>
                    </View>
                    <View style={s.lastMsgRow}>
                      {draftText ? (
                        <>
                          <Text style={s.draftLabel}>Draft: </Text>
                          <Text style={s.lastMsg} numberOfLines={1}>{draftText}</Text>
                        </>
                      ) : (
                        <>
                          {hasAttachment && (
                            <Ionicons
                              name="attach"
                              size={12}
                              color={unread ? colors.primary : colors.gray400}
                              style={{ marginRight: 3 }}
                            />
                          )}
                          <Text style={[s.lastMsg, unread && s.lastMsgUnread]} numberOfLines={1}>{lastBody}</Text>
                        </>
                      )}
                    </View>
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
    pageHeader: {
      backgroundColor: c.surface, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 14,
      borderBottomWidth: 1, borderBottomColor: c.border,
    },
    breadcrumb: { fontSize: 10, fontWeight: '700', color: c.textMuted, letterSpacing: 1, marginBottom: 6 },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
    pageTitle: { fontSize: 30, fontFamily: SERIF, color: c.textPrimary, flex: 1 },
    addBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: c.primaryLight, alignItems: 'center', justifyContent: 'center' },
    subtitle: { fontSize: 12, color: c.textSecondary },
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
    lastMsgRow: { flexDirection: 'row', alignItems: 'center' },
    draftLabel: { fontSize: 12, fontWeight: '700', color: c.danger },
    lastMsg: { flexShrink: 1, fontSize: 12, color: c.textSecondary },
    lastMsgUnread: { color: c.textPrimary, fontWeight: '600' },
    badge: { backgroundColor: c.primary, borderRadius: 10, minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
    badgeText: { fontSize: 11, fontWeight: '700', color: '#fff' },
  });
}
