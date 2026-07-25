import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, Platform,
  ActivityIndicator, TextInput, KeyboardAvoidingView, Modal, Animated, PanResponder,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '@clerk/clerk-expo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../contexts/ThemeContext';
import { useApi } from '../../hooks/useApi';
import { getSocket } from '../../lib/socket';
import { AppColors } from '../../utils/colors';
import { ChatStackParamList } from '../../navigation/types';
import { apiErrorMessage } from '../../utils/apiError';
import { showAlert } from '../../components/common/AlertModal';
import LoadError from '../../components/common/LoadError';
import Avatar from '../../components/common/Avatar';

type Nav = NativeStackNavigationProp<ChatStackParamList, 'ChatThread'>;
type Rt = RouteProp<ChatStackParamList, 'ChatThread'>;

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
const CHAR_LIMIT = 2000;
const COLLAPSE_LIMIT = 300;

function fmtTime(iso?: string) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function dayLabel(iso?: string) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(now) - startOf(d)) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return d.toLocaleDateString([], { month: 'long', day: 'numeric', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
}

function MessageRow({
  item, isMine, showAvatar, colors, s, onLongPress, onReactChip, onQuickReact, onSwipeReply, myUserId, isRead, isPinned,
}: {
  item: any; isMine: boolean; showAvatar: boolean; colors: AppColors; s: any;
  onLongPress: () => void; onReactChip: (emoji: string) => void; onQuickReact: () => void;
  onSwipeReply: () => void; myUserId: number | null; isRead: boolean; isPinned: boolean;
}) {
  const pan = useRef(new Animated.ValueXY()).current;
  const replyOpacity = pan.x.interpolate({ inputRange: [0, 50], outputRange: [0, 1], extrapolate: 'clamp' });
  const [expanded, setExpanded] = useState(false);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5 && g.dx > 0,
      onPanResponderMove: (_, g) => {
        pan.setValue({ x: Math.max(0, Math.min(g.dx, 70)), y: 0 });
      },
      onPanResponderRelease: (_, g) => {
        if (g.dx > 50) onSwipeReply();
        Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: true, friction: 6 }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: true, friction: 6 }).start();
      },
    })
  ).current;

  const body: string = item.deleted_at ? 'This message was deleted' : (item.body ?? '');
  const isLong = !item.deleted_at && body.length > COLLAPSE_LIMIT;
  const displayBody = isLong && !expanded ? `${body.slice(0, COLLAPSE_LIMIT)}…` : body;

  return (
    <View style={s.swipeWrap}>
      <Animated.View style={[s.swipeReplyIcon, { opacity: replyOpacity }]}>
        <Ionicons name="arrow-undo" size={16} color={colors.primary} />
      </Animated.View>
      <Animated.View
        {...panResponder.panHandlers}
        style={{ transform: pan.getTranslateTransform() }}
      >
        <View style={[s.bubbleRow, isMine ? s.bubbleRowMine : s.bubbleRowTheirs]}>
          {!isMine && (
            <View style={s.avatarSlot}>
              {showAvatar && <Avatar name={item.sender?.name ?? '?'} size={26} />}
            </View>
          )}
          <TouchableOpacity
            activeOpacity={0.85}
            onLongPress={onLongPress}
            style={[s.bubble, isMine ? s.bubbleMine : s.bubbleTheirs]}
          >
            {!isMine && showAvatar && item.sender?.name ? <Text style={s.senderName}>{item.sender.name}</Text> : null}
            {isPinned && (
              <View style={s.pinnedTag}>
                <Ionicons name="pin" size={10} color={isMine ? 'rgba(255,255,255,0.85)' : colors.warning} />
                <Text style={[s.pinnedTagTxt, isMine && s.metaTagMine]}>Pinned</Text>
              </View>
            )}
            {item.reply_to && (
              <View style={[s.replyQuote, isMine && s.replyQuoteMine]}>
                <Text style={[s.replyQuoteSender, isMine && s.metaTagMine]} numberOfLines={1}>{item.reply_to.sender?.name ?? 'Unknown'}</Text>
                <Text style={[s.replyQuoteBody, isMine && s.metaTagMine]} numberOfLines={1}>
                  {item.reply_to.deleted_at ? 'This message was deleted' : (item.reply_to.body ?? '')}
                </Text>
              </View>
            )}
            <Text style={[s.bubbleText, isMine && s.bubbleTextMine]}>{displayBody}</Text>
            {isLong && (
              <TouchableOpacity onPress={() => setExpanded((e) => !e)}>
                <Text style={[s.viewMoreTxt, isMine && s.metaTagMine]}>{expanded ? 'View less' : 'View more'}</Text>
              </TouchableOpacity>
            )}
            <View style={s.metaRow}>
              {item.edited_at && !item.deleted_at ? <Text style={[s.editedTag, isMine && s.metaTagMine]}>edited</Text> : null}
              <Text style={[s.timeTag, isMine && s.metaTagMine]}>{fmtTime(item.created_at)}</Text>
              {isMine && !item.deleted_at && (
                <Ionicons
                  name={isRead ? 'checkmark-done' : 'checkmark'}
                  size={13}
                  color={isRead ? '#7dd3fc' : 'rgba(255,255,255,0.75)'}
                />
              )}
            </View>
            {item.reactions?.length > 0 && (
              <View style={s.reactionsRow}>
                {item.reactions.map((r: any) => {
                  const reactedByMe = myUserId != null && r.user_ids?.some((uid: number) => String(uid) === String(myUserId));
                  return (
                    <TouchableOpacity
                      key={r.emoji}
                      style={[s.reactionChip, reactedByMe && s.reactionChipMine]}
                      onPress={() => onReactChip(r.emoji)}
                    >
                      <Text style={s.reactionChipTxt}>{r.emoji} {r.count}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </TouchableOpacity>
          {!item.deleted_at && (
            <TouchableOpacity style={s.quickReactBtn} onPress={onQuickReact}>
              <Ionicons name="happy-outline" size={16} color={colors.gray400} />
            </TouchableOpacity>
          )}
        </View>
      </Animated.View>
    </View>
  );
}

export default function ChatThreadScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Rt>();
  const { colors } = useTheme();
  const api = useApi();
  const { getToken } = useAuth();
  const insets = useSafeAreaInsets();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const listRef = useRef<FlatList>(null);
  const skipAutoScrollRef = useRef(false);

  const myUserIdRef = useRef<number | null>(null);
  const [myUserId, setMyUserId] = useState<number | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [connected, setConnected] = useState(false);
  const [reactionTargetId, setReactionTargetId] = useState<number | null>(null);
  const [nudging, setNudging] = useState(false);
  const [replyTo, setReplyTo] = useState<any | null>(null);
  const bellShake = useRef(new Animated.Value(0)).current;

  const [conv, setConv] = useState<any>(null);
  const [pinnedMessages, setPinnedMessages] = useState<any[]>([]);
  const [memberReadAt, setMemberReadAt] = useState<Record<string, string>>({});
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMoreOlder, setHasMoreOlder] = useState(true);

  const isGroup = conv?.type === 'group';
  const isNote = params.type === 'note' || conv?.type === 'note';
  const isGroupAdmin = !!conv?.is_group_admin;
  const otherMembers = (conv?.members ?? []).filter((m: any) => String(m.id) !== String(myUserId));

  const shakeBell = useCallback(() => {
    bellShake.setValue(0);
    Animated.sequence([
      Animated.timing(bellShake, { toValue: 1, duration: 60, useNativeDriver: true }),
      Animated.timing(bellShake, { toValue: -1, duration: 60, useNativeDriver: true }),
      Animated.timing(bellShake, { toValue: 1, duration: 60, useNativeDriver: true }),
      Animated.timing(bellShake, { toValue: -1, duration: 60, useNativeDriver: true }),
      Animated.timing(bellShake, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  }, [bellShake]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [meRes, msgRes, convRes] = await Promise.all([
        api.me.getProfile(),
        api.chat.getMessages(params.appId, params.conversationId, { limit: 50 }),
        api.chat.listConversations(params.appId),
      ]);
      const meId = meRes.data?.id ?? meRes.data?.user_id ?? null;
      myUserIdRef.current = meId;
      setMyUserId(meId);
      const initialMsgs = msgRes.data ?? [];
      setMessages(initialMsgs);
      setHasMoreOlder(initialMsgs.length >= 50);
      const thisConv = (convRes.data ?? []).find((c: any) => String(c.id) === String(params.conversationId)) ?? null;
      setConv(thisConv);
      setPinnedMessages(thisConv?.pinned_messages ?? []);
      const readMap: Record<string, string> = {};
      for (const m of thisConv?.members ?? []) {
        if (String(m.id) !== String(meId) && m.last_read_at) readMap[String(m.id)] = m.last_read_at;
      }
      setMemberReadAt(readMap);
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not load this conversation.'));
    } finally {
      setLoading(false);
    }
  }, [params.appId, params.conversationId]);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  useEffect(() => {
    AsyncStorage.getItem(`chat_mute_${params.conversationId}`).then((v) => {
      const m = v === '1';
      setMuted(m);
      mutedRef.current = m;
    });
  }, [params.conversationId]);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    mutedRef.current = next;
    AsyncStorage.setItem(`chat_mute_${params.conversationId}`, next ? '1' : '0').catch(() => {});
  };

  useEffect(() => {
    const socket = getSocket(async () => (await getToken()) ?? '');
    if (!socket) return;
    const convId = params.conversationId;

    const onNewMsg = (msg: any) => {
      if (msg.conversation_id !== convId) return;
      setMessages((prev) => [...prev, msg]);
    };
    const onEdited = (payload: any) => {
      if (payload.conversation_id !== convId) return;
      setMessages((prev) => prev.map((m) => (m.id === payload.message_id ? { ...m, body: payload.body, edited_at: payload.edited_at } : m)));
    };
    const onDeleted = (payload: any) => {
      if (payload.conversation_id !== convId) return;
      setMessages((prev) => prev.map((m) => (m.id === payload.message_id ? { ...m, deleted_at: new Date().toISOString() } : m)));
    };
    const onReaction = (payload: any) => {
      if (payload.conversation_id !== convId) return;
      setMessages((prev) => prev.map((m) => (m.id === payload.message_id ? { ...m, reactions: payload.reactions } : m)));
    };
    const onNudge = (payload: any) => {
      if (payload.conversation_id !== convId) return;
      if (myUserIdRef.current != null && String(payload.sender_id) === String(myUserIdRef.current)) return;
      if (!mutedRef.current) shakeBell();
    };
    const onPinned = (payload: any) => {
      if (payload.conversation_id !== convId) return;
      setPinnedMessages(payload.pinned_messages ?? []);
    };
    const onReadReceipt = (payload: any) => {
      if (payload.conversation_id !== convId) return;
      if (myUserIdRef.current != null && String(payload.reader_id) === String(myUserIdRef.current)) return;
      setMemberReadAt((prev) => ({ ...prev, [String(payload.reader_id)]: payload.read_at }));
    };
    const onPresence = (payload: any) => {
      setOnlineIds(new Set((payload.online ?? []).map((x: any) => String(x))));
    };

    const doJoin = () => {
      setConnected(true);
      socket.emit('join', { appId: params.appId });
      socket.emit('mark_read', { conversation_id: convId });
      socket.emit('get_presence');
      socket.on('new_message', onNewMsg);
      socket.on('message_edited', onEdited);
      socket.on('message_deleted', onDeleted);
      socket.on('message_reaction', onReaction);
      socket.on('nudge', onNudge);
      socket.on('message_pinned', onPinned);
      socket.on('read_receipt', onReadReceipt);
      socket.on('presence_update', onPresence);
    };
    if (socket.connected) doJoin();
    else socket.once('connect', doJoin);

    const onDisconnect = () => setConnected(false);
    socket.on('disconnect', onDisconnect);

    return () => {
      socket.off('new_message', onNewMsg);
      socket.off('message_edited', onEdited);
      socket.off('message_deleted', onDeleted);
      socket.off('message_reaction', onReaction);
      socket.off('nudge', onNudge);
      socket.off('message_pinned', onPinned);
      socket.off('read_receipt', onReadReceipt);
      socket.off('presence_update', onPresence);
      socket.off('disconnect', onDisconnect);
    };
  }, [params.appId, params.conversationId, getToken, shakeBell]);

  const loadOlder = useCallback(async () => {
    if (loadingMore || !hasMoreOlder || messages.length === 0) return;
    setLoadingMore(true);
    try {
      const oldestId = messages[0]?.id;
      const res = await api.chat.getMessages(params.appId, params.conversationId, { limit: 50, before: oldestId });
      const older = res.data ?? [];
      if (older.length > 0) skipAutoScrollRef.current = true;
      setMessages((prev) => [...older, ...prev]);
      setHasMoreOlder(older.length >= 50);
    } catch {
      // non-critical — leave hasMoreOlder as-is, user can retry by scrolling again
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMoreOlder, messages, params.appId, params.conversationId]);

  const sendNudge = () => {
    const socket = getSocket();
    if (!socket?.connected || nudging) return;
    socket.emit('nudge', { conversation_id: params.conversationId });
    setNudging(true);
    setTimeout(() => setNudging(false), 2000);
  };

  const send = () => {
    const trimmed = text.trim();
    if (!trimmed || trimmed.length > CHAR_LIMIT) return;
    if (editingId) {
      api.chat.editMessage(params.appId, editingId, trimmed)
        .catch((err) => showAlert('Could not edit message', apiErrorMessage(err)));
      setEditingId(null);
      setText('');
      return;
    }
    const socket = getSocket();
    if (!socket || !connected) {
      showAlert('Not connected', 'Chat connection is not ready yet. Please wait a moment and try again.');
      return;
    }
    socket.emit('send_message', { conversation_id: params.conversationId, body: trimmed, reply_to_id: replyTo?.id ?? null });
    setText('');
    setReplyTo(null);
  };

  // Only one reaction per user at a time — switching emoji removes the previous one first.
  const react = async (messageId: number, emoji: string) => {
    setReactionTargetId(null);
    const msg = messages.find((m) => m.id === messageId);
    const myReaction = (msg?.reactions ?? []).find((r: any) =>
      r.user_ids?.some((uid: number) => String(uid) === String(myUserIdRef.current)));
    try {
      if (myReaction && myReaction.emoji !== emoji) {
        await api.chat.reactToMessage(params.appId, messageId, myReaction.emoji);
      }
      await api.chat.reactToMessage(params.appId, messageId, emoji);
    } catch (err) {
      showAlert('Could not react', apiErrorMessage(err));
    }
  };

  const togglePin = (messageId: number) => {
    api.chat.pinMessage(params.appId, params.conversationId, messageId)
      .catch((err) => showAlert('Could not pin message', apiErrorMessage(err)));
  };

  const onLongPressMessage = (m: any) => {
    if (m.deleted_at) return;
    const isMine = myUserIdRef.current != null && String(m.sender_id) === String(myUserIdRef.current);
    const isPinned = pinnedMessages.some((p) => p.id === m.id);
    const options: Array<{ text: string; icon?: keyof typeof Ionicons.glyphMap; onPress?: () => void; style?: 'destructive' | 'cancel' }> = [
      { text: 'React', icon: 'happy-outline', onPress: () => setReactionTargetId(m.id) },
      { text: isPinned ? 'Unpin' : 'Pin', icon: 'pin-outline', onPress: () => togglePin(m.id) },
    ];
    if (isMine) {
      options.push({ text: 'Edit', icon: 'create-outline', onPress: () => { setEditingId(m.id); setText(m.body); } });
      options.push({
        text: 'Delete', icon: 'trash-outline', style: 'destructive',
        onPress: () => api.chat.deleteMessage(params.appId, m.id).catch((err) => showAlert('Could not delete message', apiErrorMessage(err))),
      });
    }
    options.push({ text: 'Cancel', style: 'cancel' });
    showAlert('Message', undefined, options);
  };

  const openMoreMenu = () => {
    const options: Array<{ text: string; icon?: keyof typeof Ionicons.glyphMap; onPress?: () => void; style?: 'destructive' | 'cancel' }> = [
      { text: muted ? 'Unmute bell' : 'Mute bell', icon: muted ? 'notifications-outline' : 'notifications-off-outline', onPress: toggleMute },
    ];
    if (isGroup) {
      options.push({ text: 'Group Info', icon: 'people-outline', onPress: () => navigation.navigate('GroupInfo', { appId: params.appId, conversationId: params.conversationId }) });
    }
    options.push({ text: 'Cancel', style: 'cancel' });
    showAlert(params.title ?? 'Conversation', undefined, options);
  };

  const isMessageRead = (msg: any) => {
    if (otherMembers.length === 0) return false;
    return otherMembers.every((m: any) => {
      const readAt = memberReadAt[String(m.id)];
      return readAt && new Date(readAt) >= new Date(msg.created_at);
    });
  };

  const someoneOnline = !isGroup && !isNote && otherMembers.some((m: any) => onlineIds.has(String(m.id)));
  const charCount = text.length;

  if (loading) return <View style={{ flex: 1, backgroundColor: colors.background }}><ActivityIndicator style={{ flex: 1 }} color={colors.primary} /></View>;
  if (error) return <LoadError message={error} onRetry={load} />;

  return (
    <KeyboardAvoidingView style={[s.container, { paddingTop: insets.top }]} behavior="padding">
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={{ flex: 1, alignItems: 'center' }}
          activeOpacity={isGroup ? 0.7 : 1}
          onPress={() => isGroup && navigation.navigate('GroupInfo', { appId: params.appId, conversationId: params.conversationId })}
        >
          <Text style={s.title} numberOfLines={1}>{params.title ?? conv?.display_name ?? 'Chat'}</Text>
          {!connected ? (
            <Text style={s.connStatus}>Connecting…</Text>
          ) : someoneOnline ? (
            <Text style={s.onlineStatus}>Online</Text>
          ) : null}
        </TouchableOpacity>
        <View style={s.headerActions}>
          {!isNote && (
            <TouchableOpacity style={s.bellBtn} onPress={sendNudge} disabled={nudging}>
              <Animated.View style={{
                transform: [{ translateX: bellShake.interpolate({ inputRange: [-1, 1], outputRange: [-4, 4] }) }],
              }}>
                <Ionicons name={nudging ? 'notifications' : 'notifications-outline'} size={19} color={nudging ? colors.warning : colors.textSecondary} />
              </Animated.View>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={s.bellBtn} onPress={openMoreMenu}>
            <Ionicons name="ellipsis-vertical" size={18} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>

      {pinnedMessages.length > 0 && (
        <TouchableOpacity style={s.pinBanner} onPress={() => togglePin(pinnedMessages[0].id)} activeOpacity={0.7}>
          <Ionicons name="pin" size={14} color={colors.warning} />
          <Text style={s.pinBannerTxt} numberOfLines={1}>
            {pinnedMessages[0].deleted_at ? 'This message was deleted' : pinnedMessages[0].body}
          </Text>
          {pinnedMessages.length > 1 && <Text style={s.pinBannerCount}>+{pinnedMessages.length - 1}</Text>}
        </TouchableOpacity>
      )}

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => String(m.id)}
        contentContainerStyle={s.list}
        onContentSizeChange={() => {
          if (skipAutoScrollRef.current) { skipAutoScrollRef.current = false; return; }
          listRef.current?.scrollToEnd({ animated: false });
        }}
        maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
        onStartReached={loadOlder}
        onStartReachedThreshold={0.3}
        ListHeaderComponent={
          loadingMore ? (
            <ActivityIndicator style={{ paddingVertical: 12 }} color={colors.primary} />
          ) : !hasMoreOlder && messages.length > 0 ? (
            <Text style={s.startOfChat}>Start of conversation</Text>
          ) : null
        }
        renderItem={({ item, index }) => {
          const isMine = myUserId != null && String(item.sender_id) === String(myUserId);
          const isSystem = item.message_type === 'system';
          const prev = messages[index - 1];
          const showDaySep = !prev || dayLabel(prev.created_at) !== dayLabel(item.created_at);
          const showAvatar = !isMine && !isSystem && (!prev || prev.sender_id !== item.sender_id || dayLabel(prev.created_at) !== dayLabel(item.created_at));

          if (isSystem) {
            return (
              <>
                {showDaySep && <Text style={s.daySep}>{dayLabel(item.created_at)}</Text>}
                <Text style={s.systemMsg}>{item.body}</Text>
              </>
            );
          }

          return (
            <View>
              {showDaySep && <Text style={s.daySep}>{dayLabel(item.created_at)}</Text>}
              <MessageRow
                item={item}
                isMine={isMine}
                showAvatar={showAvatar}
                colors={colors}
                s={s}
                myUserId={myUserId}
                isRead={isMine ? isMessageRead(item) : false}
                isPinned={pinnedMessages.some((p) => p.id === item.id)}
                onLongPress={() => onLongPressMessage(item)}
                onReactChip={(emoji) => react(item.id, emoji)}
                onQuickReact={() => setReactionTargetId(item.id)}
                onSwipeReply={() => { if (!item.deleted_at) setReplyTo(item); }}
              />
            </View>
          );
        }}
      />

      {editingId && (
        <View style={s.editingBar}>
          <Ionicons name="create-outline" size={14} color={colors.primary} />
          <Text style={s.editingTxt}>Editing message</Text>
          <TouchableOpacity onPress={() => { setEditingId(null); setText(''); }}>
            <Ionicons name="close" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
      )}

      {replyTo && !editingId && (
        <View style={s.replyBar}>
          <Ionicons name="arrow-undo" size={14} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={s.replyBarSender}>{replyTo.sender?.name ?? 'Unknown'}</Text>
            <Text style={s.replyBarBody} numberOfLines={1}>{replyTo.body}</Text>
          </View>
          <TouchableOpacity onPress={() => setReplyTo(null)}>
            <Ionicons name="close" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
      )}

      {charCount > 0 && (
        <Text style={[s.charCount, charCount >= CHAR_LIMIT ? s.charCountMax : charCount > CHAR_LIMIT * 0.9 ? s.charCountWarn : null]}>
          {charCount}/{CHAR_LIMIT}
        </Text>
      )}

      <View style={[s.inputBar, { paddingBottom: insets.bottom + 8 }]}>
        <TextInput
          style={s.input}
          placeholder={editingId ? 'Edit message...' : 'Message...'}
          placeholderTextColor={colors.textMuted}
          value={text}
          onChangeText={setText}
          multiline
          maxLength={CHAR_LIMIT}
        />
        <TouchableOpacity style={[s.sendBtn, !text.trim() && s.sendBtnDisabled]} onPress={send} disabled={!text.trim()}>
          <Ionicons name={editingId ? 'checkmark' : 'send'} size={16} color="#fff" />
        </TouchableOpacity>
      </View>

      <Modal visible={reactionTargetId != null} transparent animationType="fade" onRequestClose={() => setReactionTargetId(null)}>
        <TouchableOpacity style={s.reactOverlay} activeOpacity={1} onPress={() => setReactionTargetId(null)}>
          <View style={s.reactPicker}>
            {QUICK_REACTIONS.map((e) => (
              <TouchableOpacity key={e} style={s.reactPickerBtn} onPress={() => reactionTargetId != null && react(reactionTargetId, e)}>
                <Text style={s.reactPickerEmoji}>{e}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function makeStyles(c: AppColors) {
  const SERIF = Platform.OS === 'ios' ? 'Georgia' : 'serif';
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 16, paddingVertical: 12, gap: 8,
      backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border,
    },
    headerActions: { flexDirection: 'row', alignItems: 'center' },
    backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    bellBtn: { width: 32, height: 36, alignItems: 'center', justifyContent: 'center' },
    title: { fontSize: 17, fontFamily: SERIF, color: c.textPrimary, fontWeight: '700', textAlign: 'center' },
    connStatus: { fontSize: 10, color: c.warning, marginTop: 1 },
    onlineStatus: { fontSize: 10, color: c.success, marginTop: 1, fontWeight: '600' },
    pinBanner: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      paddingHorizontal: 16, paddingVertical: 8, backgroundColor: c.warningLight,
      borderBottomWidth: 1, borderBottomColor: c.border,
    },
    pinBannerTxt: { flex: 1, fontSize: 12, color: c.textPrimary, fontWeight: '600' },
    pinBannerCount: { fontSize: 11, color: c.warning, fontWeight: '700' },
    list: { padding: 16, paddingBottom: 8 },
    daySep: { textAlign: 'center', fontSize: 11, fontWeight: '700', color: c.textMuted, marginVertical: 12 },
    startOfChat: { textAlign: 'center', fontSize: 11, color: c.textMuted, paddingVertical: 10, fontStyle: 'italic' },
    systemMsg: { textAlign: 'center', fontSize: 11, color: c.textMuted, marginVertical: 6 },
    swipeWrap: { position: 'relative' },
    swipeReplyIcon: { position: 'absolute', left: 4, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
    pinnedTag: { flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 3 },
    pinnedTagTxt: { fontSize: 9, fontWeight: '700', color: c.warning },
    replyQuote: {
      backgroundColor: c.background, borderLeftWidth: 3, borderLeftColor: c.primary,
      borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, marginBottom: 6,
    },
    replyQuoteMine: { backgroundColor: 'rgba(255,255,255,0.15)', borderLeftColor: '#fff' },
    replyQuoteSender: { fontSize: 10, fontWeight: '700', color: c.primary },
    replyQuoteBody: { fontSize: 11, color: c.textSecondary, marginTop: 1 },
    replyBar: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      paddingHorizontal: 16, paddingVertical: 8, backgroundColor: c.gray50,
      borderTopWidth: 1, borderTopColor: c.border,
    },
    replyBarSender: { fontSize: 11, fontWeight: '700', color: c.primary },
    replyBarBody: { fontSize: 11, color: c.textSecondary, marginTop: 1 },
    bubbleRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, marginBottom: 6 },
    bubbleRowMine: { justifyContent: 'flex-end' },
    bubbleRowTheirs: { justifyContent: 'flex-start' },
    avatarSlot: { width: 26 },
    bubble: { maxWidth: '74%', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8 },
    bubbleMine: { backgroundColor: c.primary, borderBottomRightRadius: 4 },
    bubbleTheirs: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderBottomLeftRadius: 4 },
    senderName: { fontSize: 10, fontWeight: '700', color: c.primary, marginBottom: 2 },
    bubbleText: { fontSize: 14, color: c.textPrimary, lineHeight: 19 },
    bubbleTextMine: { color: '#fff' },
    viewMoreTxt: { fontSize: 11, fontWeight: '700', color: c.primary, marginTop: 2 },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3, alignSelf: 'flex-end' },
    editedTag: { fontSize: 9, color: c.textMuted, fontStyle: 'italic' },
    timeTag: { fontSize: 10, color: c.textMuted },
    metaTagMine: { color: 'rgba(255,255,255,0.75)' },
    reactionsRow: { flexDirection: 'row', gap: 4, marginTop: 6, flexWrap: 'wrap' },
    reactionChip: { backgroundColor: c.background, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: c.border },
    reactionChipMine: { backgroundColor: c.primaryLight, borderColor: c.primary },
    reactionChipTxt: { fontSize: 11, color: c.textPrimary },
    quickReactBtn: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
    editingBar: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      paddingHorizontal: 16, paddingVertical: 6, backgroundColor: c.primaryLight,
    },
    editingTxt: { flex: 1, fontSize: 11, color: c.primary, fontWeight: '600' },
    charCount: { textAlign: 'right', fontSize: 10, color: c.textMuted, paddingHorizontal: 16, paddingTop: 4, backgroundColor: c.surface },
    charCountWarn: { color: c.warning, fontWeight: '700' },
    charCountMax: { color: c.danger, fontWeight: '700' },
    inputBar: {
      flexDirection: 'row', alignItems: 'flex-end', gap: 8,
      paddingHorizontal: 16, paddingTop: 8,
      backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.border,
    },
    input: {
      flex: 1, backgroundColor: c.background, borderRadius: 20, borderWidth: 1, borderColor: c.border,
      paddingHorizontal: 14, paddingVertical: 9, fontSize: 14, color: c.textPrimary, maxHeight: 100,
    },
    sendBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' },
    sendBtnDisabled: { backgroundColor: c.gray300 },
    reactOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', alignItems: 'center', justifyContent: 'center' },
    reactPicker: {
      flexDirection: 'row', gap: 6, backgroundColor: c.surface, borderRadius: 28,
      paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: c.border,
      shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 8,
    },
    reactPickerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    reactPickerEmoji: { fontSize: 24 },
  });
}
