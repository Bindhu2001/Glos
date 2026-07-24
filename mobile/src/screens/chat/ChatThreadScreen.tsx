import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, Platform,
  ActivityIndicator, TextInput, KeyboardAvoidingView, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { useTheme } from '../../contexts/ThemeContext';
import { useApi } from '../../hooks/useApi';
import { getSocket } from '../../lib/socket';
import { AppColors } from '../../utils/colors';
import { ChatStackParamList } from '../../navigation/types';
import { apiErrorMessage } from '../../utils/apiError';
import { showAlert } from '../../components/common/AlertModal';
import LoadError from '../../components/common/LoadError';

type Nav = NativeStackNavigationProp<ChatStackParamList, 'ChatThread'>;
type Rt = RouteProp<ChatStackParamList, 'ChatThread'>;

export default function ChatThreadScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Rt>();
  const { colors } = useTheme();
  const api = useApi();
  const { getToken } = useAuth();
  const { user } = useUser();
  const insets = useSafeAreaInsets();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const listRef = useRef<FlatList>(null);

  const myUserIdRef = useRef<number | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [meRes, msgRes] = await Promise.all([
        api.me.getProfile(),
        api.chat.getMessages(params.appId, params.conversationId, { limit: 50 }),
      ]);
      myUserIdRef.current = meRes.data?.id ?? meRes.data?.user_id ?? null;
      setMessages(msgRes.data ?? []);
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not load this conversation.'));
    } finally {
      setLoading(false);
    }
  }, [params.appId, params.conversationId]);

  useEffect(() => { load(); }, [load]);

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

    const doJoin = () => {
      socket.emit('join', { appId: params.appId });
      socket.emit('mark_read', { conversation_id: convId });
      socket.on('new_message', onNewMsg);
      socket.on('message_edited', onEdited);
      socket.on('message_deleted', onDeleted);
      socket.on('message_reaction', onReaction);
    };
    if (socket.connected) doJoin();
    else socket.once('connect', doJoin);

    return () => {
      socket.off('new_message', onNewMsg);
      socket.off('message_edited', onEdited);
      socket.off('message_deleted', onDeleted);
      socket.off('message_reaction', onReaction);
    };
  }, [params.appId, params.conversationId, getToken]);

  const send = () => {
    if (!text.trim()) return;
    if (editingId) {
      api.chat.editMessage(params.appId, editingId, text.trim())
        .catch((err) => showAlert('Could not edit message', apiErrorMessage(err)));
      setEditingId(null);
      setText('');
      return;
    }
    const socket = getSocket();
    if (!socket) {
      showAlert('Not connected', 'Chat connection is not ready yet. Please wait a moment and try again.');
      return;
    }
    socket.emit('send_message', { conversation_id: params.conversationId, body: text.trim() });
    setText('');
  };

  const onLongPressMessage = (m: any) => {
    if (m.deleted_at) return;
    const isMine = myUserIdRef.current != null && String(m.sender_id) === String(myUserIdRef.current);
    const options: Array<{ text: string; onPress?: () => void; style?: 'destructive' | 'cancel' }> = [
      { text: '👍 React', onPress: () => api.chat.reactToMessage(params.appId, m.id, '👍').catch((err) => showAlert('Could not react', apiErrorMessage(err))) },
      { text: '❤️ React', onPress: () => api.chat.reactToMessage(params.appId, m.id, '❤️').catch((err) => showAlert('Could not react', apiErrorMessage(err))) },
    ];
    if (isMine) {
      options.push({ text: 'Edit', onPress: () => { setEditingId(m.id); setText(m.body); } });
      options.push({
        text: 'Delete', style: 'destructive',
        onPress: () => api.chat.deleteMessage(params.appId, m.id).catch((err) => showAlert('Could not delete message', apiErrorMessage(err))),
      });
    }
    options.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert('Message', undefined, options);
  };

  if (loading) return <ActivityIndicator style={{ flex: 1 }} color={colors.primary} />;
  if (error) return <LoadError message={error} onRetry={load} />;

  return (
    <KeyboardAvoidingView style={[s.container, { paddingTop: insets.top }]} behavior="padding">
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.title} numberOfLines={1}>{params.title ?? 'Chat'}</Text>
        <View style={{ width: 36 }} />
      </View>

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => String(m.id)}
        contentContainerStyle={s.list}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        renderItem={({ item }) => {
          const isMine = myUserIdRef.current != null && String(item.sender_id) === String(myUserIdRef.current);
          const isSystem = item.message_type === 'system';
          if (isSystem) {
            return <Text style={s.systemMsg}>{item.body}</Text>;
          }
          return (
            <TouchableOpacity
              activeOpacity={0.8}
              onLongPress={() => onLongPressMessage(item)}
              style={[s.bubbleRow, isMine ? s.bubbleRowMine : s.bubbleRowTheirs]}
            >
              <View style={[s.bubble, isMine ? s.bubbleMine : s.bubbleTheirs]}>
                {!isMine && item.sender?.name ? <Text style={s.senderName}>{item.sender.name}</Text> : null}
                <Text style={[s.bubbleText, isMine && s.bubbleTextMine]}>
                  {item.deleted_at ? 'This message was deleted' : item.body}
                </Text>
                {item.edited_at && !item.deleted_at ? <Text style={s.editedTag}>edited</Text> : null}
                {item.reactions?.length > 0 && (
                  <View style={s.reactionsRow}>
                    {item.reactions.map((r: any) => (
                      <Text key={r.emoji} style={s.reactionChip}>{r.emoji} {r.count}</Text>
                    ))}
                  </View>
                )}
              </View>
            </TouchableOpacity>
          );
        }}
      />

      <View style={[s.inputBar, { paddingBottom: insets.bottom + 8 }]}>
        <TextInput
          style={s.input}
          placeholder={editingId ? 'Edit message...' : 'Message...'}
          placeholderTextColor={colors.textMuted}
          value={text}
          onChangeText={setText}
          multiline
        />
        <TouchableOpacity style={s.sendBtn} onPress={send}>
          <Ionicons name={editingId ? 'checkmark' : 'send'} size={16} color="#fff" />
        </TouchableOpacity>
      </View>
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
    backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    title: { flex: 1, fontSize: 17, fontFamily: SERIF, color: c.textPrimary, fontWeight: '700', textAlign: 'center' },
    list: { padding: 16, gap: 8 },
    systemMsg: { textAlign: 'center', fontSize: 11, color: c.textMuted, marginVertical: 6 },
    bubbleRow: { flexDirection: 'row', marginBottom: 4 },
    bubbleRowMine: { justifyContent: 'flex-end' },
    bubbleRowTheirs: { justifyContent: 'flex-start' },
    bubble: { maxWidth: '78%', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8 },
    bubbleMine: { backgroundColor: c.primary, borderBottomRightRadius: 2 },
    bubbleTheirs: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderBottomLeftRadius: 2 },
    senderName: { fontSize: 10, fontWeight: '700', color: c.primary, marginBottom: 2 },
    bubbleText: { fontSize: 14, color: c.textPrimary },
    bubbleTextMine: { color: '#fff' },
    editedTag: { fontSize: 9, color: c.textMuted, marginTop: 2 },
    reactionsRow: { flexDirection: 'row', gap: 4, marginTop: 4, flexWrap: 'wrap' },
    reactionChip: { fontSize: 11, backgroundColor: c.background, borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1 },
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
  });
}
