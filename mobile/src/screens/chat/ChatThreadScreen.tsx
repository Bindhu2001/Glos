import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, Platform, ScrollView,
  ActivityIndicator, TextInput, KeyboardAvoidingView, Modal, Animated, PanResponder, Dimensions,
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
import UserProfileModal, { ProfileUser } from '../../components/common/UserProfileModal';
import AttachmentChips from '../../components/common/AttachmentChips';
import AttachmentList from '../../components/common/AttachmentList';
import {
  pickAttachmentFiles, uploadAttachments, downloadAttachment, stripAttachmentMarkers, pickedFileFromLocalUri,
  isForwardedBody, stripForwardMarker, PickedFile,
} from '../../utils/attachments';
import { getDraft, setDraft, clearDraft } from '../../utils/chatDrafts';
import { OutboxItem, loadOutbox, addToOutbox, removeFromOutbox } from '../../utils/chatOutbox';
import {
  useAudioRecorder, useAudioRecorderState, RecordingPresets,
  requestRecordingPermissionsAsync, setAudioModeAsync,
} from 'expo-audio';

type Nav = NativeStackNavigationProp<ChatStackParamList, 'ChatThread'>;
type Rt = RouteProp<ChatStackParamList, 'ChatThread'>;

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
const CHAR_LIMIT = 2000;
const COLLAPSE_LIMIT = 300;
const PAGE_SIZE = 30;

// Web's chat bubble uses `white-space: pre-wrap`, so pasted spreadsheet-style
// text (tabs or space-padded columns) stays visually aligned. RN's <Text> already
// preserves whitespace, but with a proportional font, padded columns still don't
// line up — so tabular-looking messages get a monospace font + horizontal scroll
// instead, which is the only way to actually make the columns line up on mobile.
function looksTabular(body: string): boolean {
  const lines = body.split('\n').filter((l) => l.trim().length > 0);
  if (lines.length < 2) return false;
  const gappyLines = lines.filter((l) => /\t| {2,}/.test(l));
  return gappyLines.length >= 2;
}

function fmtTime(iso?: string) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function fmtRecDuration(ms: number) {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

const REACT_PICKER_WIDTH = 300;
const REACT_PICKER_HEIGHT = 60;

// Positions the reaction picker right next to the tapped message instead of
// dead-centering it on the screen, clamped so it never runs off an edge.
function reactPickerPosition(anchor: { x: number; y: number } | null) {
  if (!anchor) return { top: '40%' as any, alignSelf: 'center' as const };
  const { width, height } = Dimensions.get('window');
  const left = Math.min(Math.max(anchor.x - REACT_PICKER_WIDTH / 2, 12), width - REACT_PICKER_WIDTH - 12);
  const top = anchor.y - REACT_PICKER_HEIGHT - 16 > 60
    ? anchor.y - REACT_PICKER_HEIGHT - 16
    : Math.min(anchor.y + 24, height - REACT_PICKER_HEIGHT - 40);
  return { position: 'absolute' as const, left, top };
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
  item, isMine, showAvatar, colors, s, onMenuPress, onReactChip, onQuickReact, onSwipeReply, myUserId, isRead, isPinned, isHighlighted, onAvatarPress, onRetry,
}: {
  item: any; isMine: boolean; showAvatar: boolean; colors: AppColors; s: any;
  onMenuPress: () => void; onReactChip: (emoji: string) => void; onQuickReact: (e: any) => void;
  onSwipeReply: () => void; myUserId: number | null; isRead: boolean; isPinned: boolean; isHighlighted: boolean;
  onAvatarPress: () => void; onRetry: () => void;
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

  const forwarded = !item.deleted_at && isForwardedBody(item.body ?? '');
  const body: string = item.deleted_at ? 'This message was deleted' : stripAttachmentMarkers(stripForwardMarker(item.body ?? ''));
  const isLong = !item.deleted_at && body.length > COLLAPSE_LIMIT;
  const displayBody = isLong && !expanded ? `${body.slice(0, COLLAPSE_LIMIT)}…` : body;

  return (
    <View style={[s.swipeWrap, isHighlighted && s.swipeWrapHighlighted]}>
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
              {showAvatar && <Avatar name={item.sender?.name ?? '?'} photoUrl={item.sender?.photo_url} size={26} onPress={onAvatarPress} />}
            </View>
          )}
          <TouchableOpacity
            activeOpacity={0.85}
            onLongPress={onMenuPress}
            onPress={item._failed ? onRetry : undefined}
            style={[s.bubble, isMine ? s.bubbleMine : s.bubbleTheirs]}
          >
            {!isMine && showAvatar && item.sender?.name ? <Text style={s.senderName}>{item.sender.name}</Text> : null}
            {forwarded && (
              <View style={s.forwardedTag}>
                <Ionicons name="arrow-redo-outline" size={10} color={isMine ? 'rgba(255,255,255,0.85)' : colors.textMuted} />
                <Text style={[s.forwardedTagTxt, isMine && s.metaTagMine]}>Forwarded</Text>
              </View>
            )}
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
                  {item.reply_to.deleted_at ? 'This message was deleted' : stripAttachmentMarkers(stripForwardMarker(item.reply_to.body ?? ''))}
                </Text>
              </View>
            )}
            {!!displayBody && (
              looksTabular(displayBody) ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <Text style={[s.bubbleText, s.bubbleTextMono, isMine && s.bubbleTextMine]}>{displayBody}</Text>
                </ScrollView>
              ) : (
                <Text style={[s.bubbleText, isMine && s.bubbleTextMine]}>{displayBody}</Text>
              )
            )}
            {isLong && (
              <TouchableOpacity onPress={() => setExpanded((e) => !e)}>
                <Text style={[s.viewMoreTxt, isMine && s.metaTagMine]}>{expanded ? 'View less' : 'View more'}</Text>
              </TouchableOpacity>
            )}
            {!item.deleted_at && item.attachments?.length > 0 && (
              <AttachmentList attachments={item.attachments} imageMaxWidth={180} imageMaxHeight={130} />
            )}
            <View style={s.metaRow}>
              {item.edited_at && !item.deleted_at ? <Text style={[s.editedTag, isMine && s.metaTagMine]}>edited</Text> : null}
              {item._failed ? (
                <TouchableOpacity onPress={onRetry} style={s.failedRow}>
                  <Ionicons name="alert-circle" size={13} color="#fca5a5" />
                  <Text style={s.failedText}>Not sent · Tap to retry</Text>
                </TouchableOpacity>
              ) : (
                <>
                  <Text style={[s.timeTag, isMine && s.metaTagMine]}>{fmtTime(item.created_at)}</Text>
                  {isMine && !item.deleted_at && !item._pending && (
                    <Ionicons
                      name={isRead ? 'checkmark-done' : 'checkmark'}
                      size={13}
                      color={isRead ? '#7dd3fc' : 'rgba(255,255,255,0.75)'}
                    />
                  )}
                  {isMine && item._pending && (
                    <Ionicons name="time-outline" size={12} color="rgba(255,255,255,0.75)" />
                  )}
                </>
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
          {!item.deleted_at && !item._pending && !item._failed && (
            <View style={s.rowActions}>
              <TouchableOpacity style={s.quickReactBtn} onPress={(e) => onQuickReact(e)}>
                <Ionicons name="happy-outline" size={16} color={colors.gray400} />
              </TouchableOpacity>
              <TouchableOpacity style={s.quickReactBtn} onPress={onMenuPress}>
                <Ionicons name="ellipsis-vertical" size={16} color={colors.gray400} />
              </TouchableOpacity>
            </View>
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
  // Clerk's `getToken` is a fresh function reference on most renders. Reading it
  // through a ref (kept current below) instead of listing it in the socket
  // effect's deps stops that effect from re-running on every keystroke/render —
  // it should only (re)join the room when the conversation itself changes.
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;
  const insets = useSafeAreaInsets();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const listRef = useRef<FlatList>(null);
  // Suppresses the auto-scroll-to-bottom below while older messages are being
  // prepended (Load more / search / jump-to-pinned) — a timestamp rather than
  // a one-shot boolean, because onContentSizeChange can fire more than once
  // while the newly-prepended content (esp. attachment/image bubbles) settles
  // its height. A boolean that resets on the first firing let a *second*
  // firing slip through and jump the list to the bottom right after Load
  // more, undoing the whole point of prepending above the current view.
  const autoScrollSuppressUntilRef = useRef(0);
  const suppressAutoScroll = (ms = 700) => {
    autoScrollSuppressUntilRef.current = Date.now() + ms;
  };
  const jumpingToMessageRef = useRef(false);
  // Bounded retry budget for onScrollToIndexFailed below — reset at the start
  // of each new jump (scrollToMessage/jumpToMatch/goToOlderMatch) so a fresh
  // jump always gets its full retry allowance rather than inheriting a
  // near-exhausted count left over from a previous one.
  const scrollRetryCountRef = useRef(0);
  // Guards against duplicate sends from rapid double-taps on the Send button —
  // `uploadingAttachments` state alone isn't enough since React doesn't re-render
  // (and disable the button) synchronously, leaving a window where a second tap
  // starts a second upload+emit before the first one's state update lands.
  const sendingRef = useRef(false);
  // Per-optimistic-message failure timer (keyed by its temp id) — see send()
  // and the reconciliation in the socket effect below.
  const pendingTimeoutsRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  // True only after the server has ack'd 'join' (socket 'connect' alone just
  // means the TCP/websocket handshake finished — the room/tenant-pool join is
  // a separate async step server-side). Sending over the socket before this
  // is true would silently race the join, so queueSend below gates on this
  // ref rather than the `connected` state, which flips true immediately on
  // 'connect' purely for the "Connecting…" header text.
  const socketJoinedRef = useRef(false);
  // Every not-yet-confirmed outgoing message, keyed by tempId — mirrors what's
  // persisted to the outbox. An entry is removed the moment either the socket
  // ack or the HTTP POST confirms the server has it; sendViaHttp checks this
  // before doing any work so a message already confirmed via one path is
  // never redundantly re-sent via the other.
  const failedQueueRef = useRef<Record<string, OutboxItem>>({});
  const inFlightRef = useRef<Record<string, boolean>>({});
  // Lets the socket effect (which intentionally excludes fast-changing
  // callbacks from its deps — see the eslint-disable below it) always call
  // the latest sendViaHttp without re-subscribing on every render.
  const sendViaHttpRef = useRef<(tempId: string, body: string, replyToId: number | null, attachments: Record<string, unknown>[]) => void>(() => {});

  const myUserIdRef = useRef<number | null>(null);
  const [myUserId, setMyUserId] = useState<number | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [pendingFiles, setPendingFiles] = useState<PickedFile[]>([]);
  const [uploadingAttachments, setUploadingAttachments] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  // Stashes whatever the user had been composing before they tapped "Edit" on
  // an older message (which repurposes `text` for the edit body), so cancelling
  // or finishing that edit restores it instead of losing an in-progress draft.
  const preEditTextRef = useRef('');
  const [connected, setConnected] = useState(false);
  const [reactionTargetId, setReactionTargetId] = useState<number | null>(null);
  const [reactionAnchor, setReactionAnchor] = useState<{ x: number; y: number } | null>(null);
  const [nudging, setNudging] = useState(false);
  const [replyTo, setReplyTo] = useState<any | null>(null);
  const [profileUser, setProfileUser] = useState<ProfileUser | null>(null);
  const bellShake = useRef(new Animated.Value(0)).current;

  const [conv, setConv] = useState<any>(null);
  const [pinnedMessages, setPinnedMessages] = useState<any[]>([]);
  const [highlightedMessageId, setHighlightedMessageId] = useState<number | null>(null);
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchIndex, setSearchIndex] = useState(0);
  const [searchingOlder, setSearchingOlder] = useState(false);
  const [memberReadAt, setMemberReadAt] = useState<Record<string, string>>({});
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMoreOlder, setHasMoreOlder] = useState(true);

  // Voice message recording — recorder is a single hook-managed instance
  // reused across multiple record sessions (prepareToRecordAsync is called
  // fresh each time in startRecording, so this is the intended usage pattern).
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 100);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [sendingVoiceNote, setSendingVoiceNote] = useState(false);
  const recordPulse = useRef(new Animated.Value(1)).current;

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

  // Pulsing record dot while a voice message is being recorded.
  useEffect(() => {
    if (!isRecordingVoice) {
      recordPulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(recordPulse, { toValue: 0.3, duration: 600, useNativeDriver: true }),
        Animated.timing(recordPulse, { toValue: 1, duration: 600, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [isRecordingVoice, recordPulse]);

  // Best-effort: don't leave a live recording session dangling if the screen
  // unmounts mid-recording (navigating away, backgrounding into a tab switch).
  // Wrapped in try/catch (not just .catch() on stop()) because the property
  // read itself — recorder.isRecording — throws synchronously with "shared
  // object that was already released" if expo-audio's own internal teardown
  // has already disposed the native recorder by the time this fires, which
  // happens on every screen unmount, not just ones where recording was used.
  // Nothing to clean up in that case anyway, so silently no-op-ing is correct.
  useEffect(() => () => {
    try {
      if (recorder.isRecording) recorder.stop().catch(() => {});
    } catch {
      // already released — nothing to clean up
    }
  }, [recorder]);

  const hasLoadedRef = useRef(false);

  // useFocusEffect below re-runs this every time the thread regains focus (e.g.
  // coming back from Group Info, or switching tabs and back), not just on mount —
  // so this must (a) only show the full-screen spinner on the very first load,
  // and (b) not blindly replace `messages` with just the latest page, which would
  // silently discard any older history the user had paged in via "Load more".
  const load = useCallback(async () => {
    const isRefocus = hasLoadedRef.current;
    if (!isRefocus) setLoading(true);
    try {
      const [meRes, msgRes, convRes] = await Promise.all([
        api.me.getProfile(),
        api.chat.getMessages(params.appId, params.conversationId, { limit: PAGE_SIZE }),
        api.chat.listConversations(params.appId),
      ]);
      const meId = meRes.data?.id ?? meRes.data?.user_id ?? null;
      myUserIdRef.current = meId;
      setMyUserId(meId);
      const initialMsgs = msgRes.data ?? [];
      if (isRefocus && initialMsgs.length > 0) {
        // Keep already-loaded older history above this window; only refresh the
        // recent tail (also picks up anything missed while the socket was away).
        suppressAutoScroll();
        setMessages((prev) => {
          const earliestNew = new Date(initialMsgs[0].created_at).getTime();
          const olderKept = prev.filter((m) => new Date(m.created_at).getTime() < earliestNew);
          return [...olderKept, ...initialMsgs];
        });
      } else {
        setMessages(initialMsgs);
        setHasMoreOlder(initialMsgs.length >= PAGE_SIZE);
      }
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
      hasLoadedRef.current = true;
    }
  }, [params.appId, params.conversationId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  useEffect(() => {
    AsyncStorage.getItem(`chat_mute_${params.conversationId}`).then((v) => {
      const m = v === '1';
      setMuted(m);
      mutedRef.current = m;
    });
  }, [params.conversationId]);

  // Restore whatever was left unsent the last time this thread was open.
  useEffect(() => {
    let cancelled = false;
    getDraft(params.conversationId).then((draft) => {
      if (!cancelled && draft) setText((prev) => prev || draft);
    });
    return () => { cancelled = true; };
  }, [params.conversationId]);

  // Restore any messages that never got confirmed by the server the last time
  // this thread was open — e.g. the app was killed mid-send, or the HTTP
  // fallback was still in flight. Without this, those messages simply vanish
  // on next launch even though the user watched them "send". Shown as failed
  // immediately (rather than sending) so the retry affordance is visible right
  // away instead of the bubble looking like it's silently trying forever.
  useEffect(() => {
    let cancelled = false;
    loadOutbox(params.conversationId).then((pending) => {
      if (cancelled || pending.length === 0) return;
      setMessages((prev) => {
        const existingIds = new Set(prev.map((m) => m.id));
        const fresh = pending.filter((item) => !existingIds.has(item.tempId));
        fresh.forEach((item) => { failedQueueRef.current[item.tempId] = item; });
        if (fresh.length === 0) return prev;
        return [
          ...prev,
          ...fresh.map((item) => ({
            id: item.tempId,
            conversation_id: params.conversationId,
            sender_id: myUserIdRef.current,
            body: item.body,
            attachments: item.attachments,
            reply_to: null,
            created_at: item.createdAt,
            message_type: 'text',
            reactions: [],
            _pending: false,
            _failed: true,
          })),
        ];
      });
      // Give the screen a beat to settle before hammering the network.
      setTimeout(() => {
        if (cancelled) return;
        pending.forEach((item) => {
          if (!failedQueueRef.current[item.tempId]) return; // already confirmed while we waited
          sendViaHttpRef.current(item.tempId, item.body, item.replyToId, item.attachments);
        });
      }, 1000);
    });
    return () => { cancelled = true; };
  }, [params.conversationId]);

  // Persists the compose box as a draft while typing — skipped while editing
  // a past message, since `text` is repurposed for the edit body then, and
  // debounced so it doesn't hit AsyncStorage on every keystroke.
  useEffect(() => {
    if (editingId) return;
    const id = setTimeout(() => { setDraft(params.conversationId, text); }, 400);
    return () => clearTimeout(id);
  }, [text, editingId, params.conversationId]);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    mutedRef.current = next;
    AsyncStorage.setItem(`chat_mute_${params.conversationId}`, next ? '1' : '0').catch(() => {});
  };

  // HTTP fallback / primary-when-offline send path. Guaranteed-delivery
  // counterpart to the socket emit in queueSend below — a dropped socket emit
  // just silently vanishes, but a failed axios POST is a real rejected
  // promise that lands in the catch below and gets marked failed (retried on
  // next reconnect, app relaunch, or a manual tap) instead of disappearing.
  const sendViaHttp = useCallback(async (tempId: string, body: string, replyToId: number | null, attachments: Record<string, unknown>[]) => {
    if (inFlightRef.current[tempId]) return;
    if (!failedQueueRef.current[tempId]) return; // already confirmed via the socket path
    inFlightRef.current[tempId] = true;
    try {
      const res = await api.chat.sendMessage(params.appId, params.conversationId, {
        body, reply_to_id: replyToId, attachments, _tempId: tempId,
      });
      delete failedQueueRef.current[tempId];
      removeFromOutbox(params.conversationId, tempId);
      if (pendingTimeoutsRef.current[tempId]) {
        clearTimeout(pendingTimeoutsRef.current[tempId]);
        delete pendingTimeoutsRef.current[tempId];
      }
      const saved = res.data?.message;
      setMessages((prev) => prev.map((m) => {
        // If the socket echo already reconciled this bubble to the real
        // message (see onNewMsg), its id is no longer the tempId — leave it
        // alone rather than reintroducing a second copy.
        if (m.id !== tempId) return m;
        return saved ? { ...saved, _pending: false, _failed: false } : { ...m, _pending: false, _failed: false };
      }));
    } catch (err) {
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, _pending: false, _failed: true } : m)));
    } finally {
      delete inFlightRef.current[tempId];
    }
  }, [params.appId, params.conversationId]);
  useEffect(() => { sendViaHttpRef.current = sendViaHttp; }, [sendViaHttp]);

  // Sends over the socket when it's actually joined (fast path, with a
  // server ack), otherwise goes straight to HTTP — this is what makes a
  // message sent while offline or mid-reconnect go out immediately via HTTP
  // instead of silently queuing forever behind a socket that may never come
  // back. An 8s safety net covers the case where the socket ack itself never
  // arrives (dropped ack, not just a dropped connection).
  const queueSend = useCallback((tempId: string, body: string, replyToId: number | null, attachments: Record<string, unknown>[]) => {
    const socket = getSocket();
    if (socket?.connected && socketJoinedRef.current) {
      socket.emit('send_message', { conversation_id: params.conversationId, body, reply_to_id: replyToId, attachments, _tempId: tempId }, (ack: any) => {
        if (!ack?.ok) {
          sendViaHttpRef.current(tempId, body, replyToId, attachments);
        } else {
          // onNewMsg's echo reconciles the bubble itself; just stop treating
          // this as unconfirmed so nothing double-sends it via HTTP later.
          delete failedQueueRef.current[tempId];
          removeFromOutbox(params.conversationId, tempId);
        }
      });
    } else {
      sendViaHttpRef.current(tempId, body, replyToId, attachments);
    }
    setTimeout(() => {
      if (failedQueueRef.current[tempId]) sendViaHttpRef.current(tempId, body, replyToId, attachments);
    }, 8000);
  }, [params.conversationId]);

  useEffect(() => {
    const socket = getSocket(async () => (await getTokenRef.current()) ?? '');
    if (!socket) return;
    const convId = params.conversationId;

    const onNewMsg = (msg: any) => {
      if (msg.conversation_id !== convId) return;
      setMessages((prev) => {
        // Defensive de-dupe by id — belt-and-braces alongside the listener-leak
        // fix above, in case any other path (reconnect, etc.) ever double-emits.
        if (prev.some((m) => m.id === msg.id)) return prev;
        // Reconcile against our own optimistically-shown message (see send()
        // below) instead of just appending — this is what lets it "become"
        // the real one in place rather than appearing a second time. Matched
        // by sender + body + reply target, oldest unreconciled first, since
        // there's no server-provided correlation id and socket.io preserves
        // send order on one connection — that ordering is what keeps two
        // identical messages sent back-to-back resolving to the right ones.
        if (myUserIdRef.current != null && String(msg.sender_id) === String(myUserIdRef.current)) {
          const pendingIdx = prev.findIndex((m) => m._pending && m.body === msg.body && (m.reply_to?.id ?? null) === (msg.reply_to?.id ?? null));
          if (pendingIdx !== -1) {
            const pendingId = prev[pendingIdx].id;
            if (pendingTimeoutsRef.current[pendingId]) {
              clearTimeout(pendingTimeoutsRef.current[pendingId]);
              delete pendingTimeoutsRef.current[pendingId];
            }
            const next = [...prev];
            next[pendingIdx] = msg;
            return next;
          }
        }
        return [...prev, msg];
      });
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

    // Message listeners are registered exactly once per effect run, independent
    // of connect/reconnect timing — doJoin below must not re-register them (it
    // fires on every reconnect too), or a flaky connection piles up duplicate
    // listeners and every message starts rendering multiple times.
    socket.on('new_message', onNewMsg);
    socket.on('message_edited', onEdited);
    socket.on('message_deleted', onDeleted);
    socket.on('message_reaction', onReaction);
    socket.on('nudge', onNudge);
    socket.on('message_pinned', onPinned);
    socket.on('read_receipt', onReadReceipt);
    socket.on('presence_update', onPresence);

    const doJoin = () => {
      setConnected(true);
      socketJoinedRef.current = false; // server hasn't ack'd this join yet
      socket.emit('join', { appId: params.appId });
      socket.emit('mark_read', { conversation_id: convId });
      socket.emit('get_presence');
    };
    if (socket.connected) doJoin();
    // Persistent (not .once) — socket.io auto-reconnects after any drop
    // (backgrounding, a network blip), firing 'connect' again each time, and
    // the room/read-receipt/presence state needs re-establishing on every one
    // of those, not just the first. `.once` here was the "Connecting…" stuck
    // bug: after the first reconnect, nothing was listening for 'connect'
    // anymore, so `connected` never flipped back to true.
    socket.on('connect', doJoin);

    // Server-ack'd join (tenant pool ready, room actually joined) — distinct
    // from the raw 'connect' above, which only means the socket handshake
    // finished. On every join (including reconnects), catch up on whatever
    // was missed while disconnected and flush anything still waiting to send.
    const onJoined = () => {
      socketJoinedRef.current = true;
      setMessages((prev) => {
        const lastReal = [...prev].reverse().find((m) => typeof m.id === 'number');
        if (lastReal) {
          api.chat.getMessages(params.appId, convId, { after: lastReal.id })
            .then((res) => {
              const missed: any[] = res.data ?? [];
              if (missed.length === 0) return;
              setMessages((cur) => {
                const existingIds = new Set(cur.map((m) => m.id));
                const fresh = missed.filter((m) => !existingIds.has(m.id));
                return fresh.length ? [...cur, ...fresh] : cur;
              });
            })
            .catch(() => {});
        }
        return prev;
      });
      Object.values(failedQueueRef.current).forEach((item) => {
        sendViaHttpRef.current(item.tempId, item.body, item.replyToId, item.attachments);
      });
    };
    socket.on('joined', onJoined);

    const onDisconnect = () => {
      setConnected(false);
      socketJoinedRef.current = false;
    };
    socket.on('disconnect', onDisconnect);

    return () => {
      socket.off('connect', doJoin);
      socket.off('joined', onJoined);
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
  // getToken/shakeBell are intentionally excluded — read via getTokenRef and a
  // stable useCallback respectively — so this only (re)joins on conversation change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.appId, params.conversationId]);

  const loadOlder = useCallback(async () => {
    if (loadingMore || !hasMoreOlder || messages.length === 0) return;
    setLoadingMore(true);
    try {
      const oldestId = messages[0]?.id;
      const res = await api.chat.getMessages(params.appId, params.conversationId, { limit: PAGE_SIZE, before: oldestId });
      const older = res.data ?? [];
      if (older.length > 0) suppressAutoScroll();
      setMessages((prev) => [...older, ...prev]);
      setHasMoreOlder(older.length >= PAGE_SIZE);
    } catch {
      // non-critical — leave hasMoreOlder as-is, user can retry by tapping Load More again
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

  const pickFiles = async () => {
    try {
      const files = await pickAttachmentFiles();
      if (files.length) setPendingFiles((prev) => [...prev, ...files]);
    } catch (err) {
      showAlert('Could not pick file', apiErrorMessage(err));
    }
  };

  const removePendingFile = (i: number) => setPendingFiles((prev) => prev.filter((_, idx) => idx !== i));

  // requestRecordingPermissionsAsync/setAudioModeAsync/prepareToRecordAsync are
  // all real awaits (permission dialog, native session setup) — recorder.record()
  // itself is fire-and-forget, so isRecordingVoice flips as soon as that's called.
  // startingRecordingRef guards the window before that flip: the mic button is
  // still the one rendered (isRecordingVoice is still false) until those awaits
  // resolve, so a fast double-tap could otherwise fire prepareToRecordAsync/
  // record() twice concurrently on the same recorder instance.
  const startingRecordingRef = useRef(false);
  const startRecording = async () => {
    if (startingRecordingRef.current || isRecordingVoice) return;
    startingRecordingRef.current = true;
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        showAlert('Microphone Access Needed', 'Please allow microphone access to record a voice message.');
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setIsRecordingVoice(true);
    } catch (err) {
      showAlert('Could Not Start Recording', apiErrorMessage(err));
    } finally {
      startingRecordingRef.current = false;
    }
  };

  const discardRecording = async () => {
    setIsRecordingVoice(false);
    try {
      if (recorder.isRecording) await recorder.stop();
    } catch {
      // best-effort cleanup — the row is already gone, nothing to show the user
    } finally {
      setAudioModeAsync({ allowsRecording: false }).catch(() => {});
    }
  };

  // Kept as its own explicit step (isRecordingVoice stays true, with a
  // sendingVoiceNote sub-state) rather than flipping isRecordingVoice off
  // immediately — the row would otherwise briefly show the idle mic button
  // again (text/pendingFiles are both still empty) while the upload+emit in
  // send() is in flight, inviting a second tap that starts a new recording.
  const stopAndSendRecording = async () => {
    setSendingVoiceNote(true);
    // Read before stop() — currentTime is the recorder's own live position,
    // more trustworthy at this exact instant than recorderState.durationMillis
    // (that's only refreshed on its own 100ms poll tick, purely for the timer
    // text — could be up to ~100ms stale right when the stop button is tapped).
    // Guarded like the unmount cleanup above: if the user backs out of the
    // screen right after tapping send, expo-audio's own teardown can release
    // the native recorder concurrently, and any property read on it after
    // that throws "shared object that was already released".
    let durationMs = 0;
    try {
      durationMs = recorder.currentTime * 1000;
    } catch {
      // already released — nothing left to send
    }
    try {
      await recorder.stop();
    } catch {
      // fall through — duration/uri checks below handle a recorder that
      // never actually started, already stopped, or was already released
    }
    setAudioModeAsync({ allowsRecording: false }).catch(() => {});
    let uri: string | null = null;
    try {
      uri = recorder.uri;
    } catch {
      // already released
    }
    try {
      if (durationMs < 1000 || !uri) {
        if (durationMs < 1000) showAlert('Recording Too Short', 'Hold the mic a little longer to record a voice message.');
        return;
      }
      const voiceFile = pickedFileFromLocalUri(uri, `voice-${Date.now()}.m4a`, 'audio/mp4');
      await send(voiceFile);
    } catch (err) {
      showAlert('Could Not Send Recording', apiErrorMessage(err));
    } finally {
      setIsRecordingVoice(false);
      setSendingVoiceNote(false);
    }
  };

  const send = async (overrideFile?: PickedFile) => {
    if (sendingRef.current) return;
    const filesToSend = overrideFile ? [overrideFile] : pendingFiles;
    const trimmed = overrideFile ? '' : text.trim();
    if ((!trimmed && filesToSend.length === 0) || trimmed.length > CHAR_LIMIT) return;
    if (editingId) {
      api.chat.editMessage(params.appId, editingId, trimmed)
        .catch((err) => showAlert('Could not edit message', apiErrorMessage(err)));
      setEditingId(null);
      setText(preEditTextRef.current);
      return;
    }
    sendingRef.current = true;
    try {
      let attachments: Record<string, unknown>[] = [];
      if (filesToSend.length > 0) {
        setUploadingAttachments(true);
        try {
          attachments = await uploadAttachments(api, params.appId, 'chat', filesToSend);
        } catch (err) {
          showAlert('Could not upload attachment', apiErrorMessage(err));
          return;
        } finally {
          setUploadingAttachments(false);
        }
      }
      // Shown immediately instead of waiting for the server's echo — same
      // single/double-check tick web already uses (isMessageRead below reads
      // this exactly like a real message), it just quietly becomes the real
      // message in place once that echo arrives via onNewMsg above.
      const replyToSnapshot = replyTo ? { id: replyTo.id, sender: replyTo.sender, body: replyTo.body, deleted_at: replyTo.deleted_at } : null;
      const replyToId = replyTo?.id ?? null;
      const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setMessages((prev) => [...prev, {
        id: tempId,
        conversation_id: params.conversationId,
        sender_id: myUserIdRef.current,
        body: trimmed,
        attachments,
        reply_to: replyToSnapshot,
        created_at: new Date().toISOString(),
        message_type: 'text',
        reactions: [],
        _pending: true,
      }]);
      setText('');
      clearDraft(params.conversationId);
      setReplyTo(null);
      if (!overrideFile) setPendingFiles([]);

      // Persisted before any send attempt — this is what survives an app
      // kill mid-send. Sent regardless of current connection state: queueSend
      // below falls back to HTTP immediately when the socket isn't joined,
      // instead of the old behavior of just erroring out while offline.
      const outboxItem: OutboxItem = { tempId, body: trimmed, replyToId, attachments, createdAt: new Date().toISOString() };
      failedQueueRef.current[tempId] = outboxItem;
      addToOutbox(params.conversationId, outboxItem);
      queueSend(tempId, trimmed, replyToId, attachments);
    } finally {
      sendingRef.current = false;
    }
  };

  const retryFailedMessage = (m: any) => {
    if (!m._failed) return;
    setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, _failed: false, _pending: true } : x)));
    failedQueueRef.current[m.id] = { tempId: m.id, body: m.body, replyToId: m.reply_to?.id ?? null, attachments: m.attachments ?? [], createdAt: m.created_at };
    queueSend(m.id, m.body, m.reply_to?.id ?? null, m.attachments ?? []);
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
      const res = await api.chat.reactToMessage(params.appId, messageId, emoji);
      // Apply from this response immediately rather than waiting on the
      // message_reaction socket echo — that event can lag (or get missed on a
      // flaky connection), which made a reaction look like it silently failed
      // until the chat was reopened.
      if (res.data?.reactions) {
        setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, reactions: res.data.reactions } : m)));
      }
    } catch (err) {
      showAlert('Could not react', apiErrorMessage(err));
    }
  };

  const togglePin = (messageId: number) => {
    api.chat.pinMessage(params.appId, params.conversationId, messageId)
      .then((res) => {
        // Same reasoning as react() above — apply the server-confirmed result
        // directly instead of only waiting on the message_pinned socket echo.
        if (res.data?.pinned_messages) setPinnedMessages(res.data.pinned_messages);
      })
      .catch((err) => showAlert('Could not pin message', apiErrorMessage(err)));
  };

  const clearHighlightTimeout = () => {
    if (highlightTimeoutRef.current) {
      clearTimeout(highlightTimeoutRef.current);
      highlightTimeoutRef.current = null;
    }
  };
  useEffect(() => clearHighlightTimeout, []);

  useEffect(() => () => {
    Object.values(pendingTimeoutsRef.current).forEach(clearTimeout);
  }, []);

  // Brief flash used when jumping to a message (tapping the pin banner) —
  // auto-clears after a beat instead of staying highlighted forever.
  const flashHighlight = (messageId: number) => {
    clearHighlightTimeout();
    setHighlightedMessageId(messageId);
    highlightTimeoutRef.current = setTimeout(() => {
      setHighlightedMessageId((cur) => (cur === messageId ? null : cur));
      highlightTimeoutRef.current = null;
    }, 1500);
  };

  // Shared by "jump to pinned message" and in-chat search: both need to keep
  // fetching older pages automatically when the target isn't in the currently
  // loaded window, instead of asking the user to scroll up and retry. Tracks
  // its own local cursor/array rather than the `messages` state, since state
  // updates from setMessages don't land in this closure until a re-render —
  // relying on `messages` directly would re-fetch the same stale page forever.
  // Returns the found message + its index in the (now-updated) messages array,
  // or null if history ran out first.
  const loadOlderUntil = async (predicate: (m: any) => boolean): Promise<{ index: number; message: any } | null> => {
    if (jumpingToMessageRef.current) return null;
    jumpingToMessageRef.current = true;
    setLoadingMore(true);
    suppressAutoScroll();

    let localMessages = messages;
    let more = hasMoreOlder;
    let targetIndex = -1;

    try {
      while (more && localMessages.length > 0 && targetIndex === -1) {
        const oldestId = localMessages[0]?.id;
        const res = await api.chat.getMessages(params.appId, params.conversationId, { limit: PAGE_SIZE, before: oldestId });
        const older: any[] = res.data ?? [];
        more = older.length >= PAGE_SIZE;
        if (older.length === 0) break;

        localMessages = [...older, ...localMessages];
        // Refreshed on every page, not just once before the loop — a multi-page
        // fetch (searching far back into history) can easily take longer than
        // a single fixed suppression window, and letting it lapse mid-loop
        // would let a later page's setMessages call jump the list to the
        // bottom right as it's still working its way back to the target.
        suppressAutoScroll();
        setMessages(localMessages);
        setHasMoreOlder(more);
        targetIndex = localMessages.findIndex(predicate);
      }
    } catch {
      showAlert('Could Not Load Messages', 'Something went wrong loading older messages. Please try again.');
      return null;
    } finally {
      setLoadingMore(false);
      jumpingToMessageRef.current = false;
    }

    return targetIndex === -1 ? null : { index: targetIndex, message: localMessages[targetIndex] };
  };

  // Tapping the pin banner should take you to the pinned message in the
  // thread (matching WhatsApp), not silently unpin it — unpinning is still
  // available from the message's own long-press menu below.
  const scrollToMessage = async (messageId: number) => {
    scrollRetryCountRef.current = 0;
    const existingIndex = messages.findIndex((m) => m.id === messageId);
    if (existingIndex !== -1) {
      listRef.current?.scrollToIndex({ index: existingIndex, animated: true, viewPosition: 0.4 });
      flashHighlight(messageId);
      return;
    }
    const found = await loadOlderUntil((m) => m.id === messageId);
    if (!found) {
      showAlert('Message Not Found', 'This message could not be located — it may have been deleted.');
      return;
    }
    // Give the list a frame to commit the newly-prepended rows before
    // scrolling — onScrollToIndexFailed below already retries if this fires
    // too early for the rows to be measured yet.
    requestAnimationFrame(() => {
      listRef.current?.scrollToIndex({ index: found.index, animated: true, viewPosition: 0.4 });
      flashHighlight(messageId);
    });
  };

  // In-chat search (WhatsApp-style: icon in the header, up/down between
  // matches). There's no server-side search endpoint, so this searches
  // whatever's currently loaded, and — matching scrollToMessage above — keeps
  // fetching older pages automatically when the user goes past the oldest
  // loaded match instead of just stopping there.
  const searchMatches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return messages.filter((m) => !m.deleted_at && (m.body ?? '').toLowerCase().includes(q));
  }, [messages, searchQuery]);

  const jumpToMatch = (index: number) => {
    scrollRetryCountRef.current = 0;
    const target = searchMatches[index];
    if (!target) return;
    setSearchIndex(index);
    const idx = messages.findIndex((m) => m.id === target.id);
    if (idx !== -1) {
      listRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.4 });
      flashHighlight(target.id);
    }
  };

  // Newest match is the most likely to be relevant, so land there first —
  // whenever the query text changes (not on every keystroke re-render for
  // the same text) and there's at least one hit.
  useEffect(() => {
    if (searchOpen && searchMatches.length > 0) jumpToMatch(searchMatches.length - 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  const goToOlderMatch = async () => {
    scrollRetryCountRef.current = 0;
    if (searchIndex > 0) {
      jumpToMatch(searchIndex - 1);
      return;
    }
    if (searchingOlder || !hasMoreOlder) {
      if (!hasMoreOlder) showAlert('No More Results', 'No earlier messages match your search.');
      return;
    }
    const q = searchQuery.trim().toLowerCase();
    setSearchingOlder(true);
    const found = await loadOlderUntil((m) => !m.deleted_at && (m.body ?? '').toLowerCase().includes(q));
    setSearchingOlder(false);
    if (!found) {
      showAlert('No More Results', 'No earlier messages match your search.');
      return;
    }
    setSearchIndex(0);
    requestAnimationFrame(() => {
      listRef.current?.scrollToIndex({ index: found.index, animated: true, viewPosition: 0.4 });
      flashHighlight(found.message.id);
    });
  };

  const goToNewerMatch = () => {
    if (searchIndex < searchMatches.length - 1) jumpToMatch(searchIndex + 1);
  };

  const closeSearch = () => {
    setSearchOpen(false);
    setSearchQuery('');
    setSearchIndex(0);
  };

  const onMenuPress = (m: any) => {
    // Still-optimistic message (temp id, not a real one from the server yet)
    // — Pin/Edit/Delete/Download would hit the API with a temp id and error.
    if (m.deleted_at || m._pending) return;
    const isMine = myUserIdRef.current != null && String(m.sender_id) === String(myUserIdRef.current);
    const isPinned = pinnedMessages.some((p) => p.id === m.id);
    const options: Array<{ text: string; icon?: keyof typeof Ionicons.glyphMap; onPress?: () => void; style?: 'destructive' | 'cancel' }> = [
      { text: isPinned ? 'Unpin' : 'Pin', icon: 'pin-outline', onPress: () => togglePin(m.id) },
      {
        text: 'Forward', icon: 'arrow-redo-outline',
        onPress: () => navigation.navigate('ForwardMessage', {
          appId: params.appId,
          body: stripAttachmentMarkers(stripForwardMarker(m.body ?? '')),
          attachments: m.attachments ?? [],
        }),
      },
    ];
    const attachments: any[] = m.attachments ?? [];
    if (attachments.length === 1) {
      options.push({ text: 'Download', icon: 'download-outline', onPress: () => downloadAttachment(attachments[0]) });
    } else if (attachments.length > 1) {
      for (const a of attachments) {
        options.push({ text: `Download ${a.file_name}`, icon: 'download-outline', onPress: () => downloadAttachment(a) });
      }
    }
    if (isMine) {
      options.push({ text: 'Edit', icon: 'create-outline', onPress: () => { preEditTextRef.current = text; setEditingId(m.id); setText(stripAttachmentMarkers(stripForwardMarker(m.body ?? ''))); setPendingFiles([]); } });
      options.push({
        text: 'Delete', icon: 'trash-outline', style: 'destructive',
        onPress: () => api.chat.deleteMessage(params.appId, m.id).catch((err) => showAlert('Could not delete message', apiErrorMessage(err))),
      });
    }
    options.push({ text: 'Cancel', style: 'cancel' });
    // Keep the tapped message highlighted (WhatsApp-style selected state)
    // for as long as the action sheet is open, whichever way it closes.
    clearHighlightTimeout();
    setHighlightedMessageId(m.id);
    showAlert('Message', undefined, options, () => {
      setHighlightedMessageId((cur) => (cur === m.id ? null : cur));
    });
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
    <KeyboardAvoidingView style={[s.container, { paddingTop: insets.top }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      {searchOpen ? (
        <View style={s.header}>
          <TouchableOpacity onPress={closeSearch} style={s.backBtn}>
            <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <TextInput
            style={s.searchInput}
            placeholder="Search in conversation…"
            placeholderTextColor={colors.gray400}
            value={searchQuery}
            onChangeText={(v) => { setSearchQuery(v); setSearchIndex(0); }}
            autoFocus
            returnKeyType="search"
          />
          {searchQuery.trim().length > 0 && (
            <View style={s.headerActions}>
              <Text style={s.searchCount}>
                {searchingOlder ? '…' : searchMatches.length > 0 ? `${searchIndex + 1}/${searchMatches.length}` : '0/0'}
              </Text>
              <TouchableOpacity style={s.bellBtn} onPress={goToOlderMatch} disabled={searchingOlder}>
                <Ionicons name="chevron-up" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
              <TouchableOpacity style={s.bellBtn} onPress={goToNewerMatch} disabled={searchIndex >= searchMatches.length - 1}>
                <Ionicons name="chevron-down" size={18} color={searchIndex >= searchMatches.length - 1 ? colors.gray300 : colors.textSecondary} />
              </TouchableOpacity>
            </View>
          )}
        </View>
      ) : (
        <View style={s.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
            <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={{ flex: 1, alignItems: 'center' }}
            activeOpacity={isGroup || (!isNote && otherMembers[0]) ? 0.7 : 1}
            onPress={() => {
              if (isGroup) navigation.navigate('GroupInfo', { appId: params.appId, conversationId: params.conversationId });
              else if (!isNote && otherMembers[0]) {
                const m = otherMembers[0];
                setProfileUser({ id: m.id, name: m.name, photoUrl: m.photo_url, email: m.email });
              }
            }}
          >
            <Text style={s.title} numberOfLines={1}>{params.title ?? conv?.display_name ?? 'Chat'}</Text>
            {!connected ? (
              <Text style={s.connStatus}>Connecting…</Text>
            ) : someoneOnline ? (
              <Text style={s.onlineStatus}>Online</Text>
            ) : null}
          </TouchableOpacity>
          <View style={s.headerActions}>
            <TouchableOpacity style={s.bellBtn} onPress={() => setSearchOpen(true)}>
              <Ionicons name="search-outline" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
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
      )}

      {pinnedMessages.length > 0 && (
        <TouchableOpacity style={s.pinBanner} onPress={() => scrollToMessage(pinnedMessages[0].id)} activeOpacity={0.7}>
          <Ionicons name="pin" size={14} color={colors.warning} />
          <Text style={s.pinBannerTxt} numberOfLines={1}>
            {pinnedMessages[0].deleted_at ? 'This message was deleted' : stripAttachmentMarkers(stripForwardMarker(pinnedMessages[0].body ?? ''))}
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
          if (Date.now() < autoScrollSuppressUntilRef.current) return;
          listRef.current?.scrollToEnd({ animated: false });
          // Image/attachment bubbles often finish loading (and change height)
          // slightly after this first pass, leaving the list short of the true
          // end — previously this landed mid-conversation instead of at the
          // last message. A couple of delayed re-corrections catch that late
          // settling; harmless no-ops if it was already at the bottom.
          setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 120);
          setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 400);
        }}
        // scrollToIndex can fail if the target row hasn't been measured yet
        // (no getItemLayout, variable-height bubbles). Retries with a bounded
        // budget per jump — a single 150ms retry wasn't enough once
        // loadOlderUntil had just prepended a large batch of older messages
        // (search "load more" / jump-to-pinned not actually landing on the
        // target), since RN needs several passes to render/measure that much
        // newly-prepended content before scrollToIndex can succeed.
        onScrollToIndexFailed={(info) => {
          if (scrollRetryCountRef.current >= 10) { scrollRetryCountRef.current = 0; return; }
          scrollRetryCountRef.current += 1;
          setTimeout(() => {
            listRef.current?.scrollToIndex({ index: info.index, animated: true, viewPosition: 0.4 });
          }, 250);
        }}
        maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
        ListHeaderComponent={
          loadingMore ? (
            <ActivityIndicator style={{ paddingVertical: 12 }} color={colors.primary} />
          ) : hasMoreOlder && messages.length > 0 ? (
            <TouchableOpacity style={s.loadMoreBtn} onPress={loadOlder}>
              <Text style={s.loadMoreTxt}>Load more</Text>
            </TouchableOpacity>
          ) : messages.length > 0 ? (
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
                isHighlighted={highlightedMessageId === item.id}
                onMenuPress={() => onMenuPress(item)}
                onReactChip={(emoji) => react(item.id, emoji)}
                onQuickReact={(e) => {
                  const { pageX, pageY } = e.nativeEvent;
                  setReactionAnchor({ x: pageX, y: pageY });
                  setReactionTargetId(item.id);
                }}
                onSwipeReply={() => { if (!item.deleted_at && !item._pending) setReplyTo(item); }}
                onAvatarPress={() => setProfileUser({
                  id: item.sender_id,
                  name: item.sender?.name ?? 'Unknown',
                  photoUrl: item.sender?.photo_url,
                  email: item.sender?.email,
                })}
                onRetry={() => retryFailedMessage(item)}
              />
            </View>
          );
        }}
      />

      {editingId && (
        <View style={s.editingBar}>
          <Ionicons name="create-outline" size={14} color={colors.primary} />
          <Text style={s.editingTxt}>Editing message</Text>
          <TouchableOpacity onPress={() => { setEditingId(null); setText(preEditTextRef.current); }}>
            <Ionicons name="close" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
      )}

      {replyTo && !editingId && (
        <View style={s.replyBar}>
          <Ionicons name="arrow-undo" size={14} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={s.replyBarSender}>{replyTo.sender?.name ?? 'Unknown'}</Text>
            <Text style={s.replyBarBody} numberOfLines={1}>{stripAttachmentMarkers(stripForwardMarker(replyTo.body ?? ''))}</Text>
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

      <AttachmentChips files={pendingFiles} onRemove={removePendingFile} uploading={uploadingAttachments} containerStyle={{ paddingHorizontal: 16, paddingBottom: 8 }} />

      {/* No insets.bottom — this screen sits inside the tab navigator, whose
          tabBarStyle already reserves the device's bottom safe area below it. */}
      <View style={[s.inputBar, { paddingBottom: 8 }]}>
        {isRecordingVoice ? (
          <>
            <TouchableOpacity style={s.attachBtn} onPress={discardRecording} disabled={sendingVoiceNote}>
              <Ionicons name="trash-outline" size={20} color={sendingVoiceNote ? colors.textMuted : colors.danger} />
            </TouchableOpacity>
            <View style={s.recordingIndicator}>
              {sendingVoiceNote
                ? <ActivityIndicator size="small" color={colors.primary} />
                : <Animated.View style={[s.recordDot, { opacity: recordPulse }]} />}
              <Text style={s.recordTimer}>{fmtRecDuration(recorderState.durationMillis || 0)}</Text>
            </View>
            <TouchableOpacity style={s.sendBtn} onPress={stopAndSendRecording} disabled={sendingVoiceNote}>
              {sendingVoiceNote
                ? <ActivityIndicator size="small" color="#fff" />
                : <Ionicons name="send" size={16} color="#fff" />}
            </TouchableOpacity>
          </>
        ) : (
          <>
            {!editingId && (
              <TouchableOpacity style={s.attachBtn} onPress={pickFiles} disabled={uploadingAttachments}>
                <Ionicons name="attach" size={20} color={colors.textMuted} />
              </TouchableOpacity>
            )}
            <TextInput
              style={s.input}
              placeholder={editingId ? 'Edit message...' : 'Message...'}
              placeholderTextColor={colors.textMuted}
              value={text}
              onChangeText={setText}
              multiline
              maxLength={CHAR_LIMIT}
            />
            {!editingId && !text.trim() && pendingFiles.length === 0 && !uploadingAttachments ? (
              <TouchableOpacity style={s.sendBtn} onPress={startRecording}>
                <Ionicons name="mic" size={18} color="#fff" />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[s.sendBtn, !text.trim() && pendingFiles.length === 0 && s.sendBtnDisabled]}
                onPress={() => send()}
                disabled={(!text.trim() && pendingFiles.length === 0) || uploadingAttachments}
              >
                {uploadingAttachments
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Ionicons name={editingId ? 'checkmark' : 'send'} size={16} color="#fff" />}
              </TouchableOpacity>
            )}
          </>
        )}
      </View>

      <Modal visible={reactionTargetId != null} transparent animationType="fade" onRequestClose={() => setReactionTargetId(null)}>
        <TouchableOpacity style={s.reactOverlayTop} activeOpacity={1} onPress={() => setReactionTargetId(null)}>
          <View style={[s.reactPicker, reactPickerPosition(reactionAnchor)]}>
            {QUICK_REACTIONS.map((e) => (
              <TouchableOpacity key={e} style={s.reactPickerBtn} onPress={() => reactionTargetId != null && react(reactionTargetId, e)}>
                <Text style={s.reactPickerEmoji}>{e}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
      <UserProfileModal user={profileUser} onClose={() => setProfileUser(null)} />
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
    searchInput: { flex: 1, fontSize: 15, color: c.textPrimary, padding: 0 },
    searchCount: { fontSize: 12, color: c.textMuted, marginRight: 2 },
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
    loadMoreBtn: { alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 14, backgroundColor: c.gray100, marginBottom: 10 },
    loadMoreTxt: { fontSize: 12, fontWeight: '700', color: c.primary },
    systemMsg: { textAlign: 'center', fontSize: 11, color: c.textMuted, marginVertical: 6 },
    swipeWrap: { position: 'relative' },
    // Full-bleed tint (like WhatsApp's selected/jumped-to message) — negative
    // margin cancels the list's own padding so the band spans edge-to-edge
    // instead of just tinting behind the bubble's own width.
    swipeWrapHighlighted: {
      backgroundColor: c.warningLight, marginHorizontal: -16, paddingHorizontal: 16, borderRadius: 8,
    },
    swipeReplyIcon: { position: 'absolute', left: 4, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
    pinnedTag: { flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 3 },
    pinnedTagTxt: { fontSize: 9, fontWeight: '700', color: c.warning },
    forwardedTag: { flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 3 },
    forwardedTagTxt: { fontSize: 11, fontStyle: 'italic', color: c.textMuted },
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
    bubbleTextMono: { fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', fontSize: 12, lineHeight: 17 },
    bubbleTextMine: { color: '#fff' },
    viewMoreTxt: { fontSize: 11, fontWeight: '700', color: c.primary, marginTop: 2 },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3, alignSelf: 'flex-end' },
    editedTag: { fontSize: 9, color: c.textMuted, fontStyle: 'italic' },
    timeTag: { fontSize: 10, color: c.textMuted },
    failedRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    failedText: { fontSize: 10, color: '#fca5a5', fontWeight: '600' },
    metaTagMine: { color: 'rgba(255,255,255,0.75)' },
    reactionsRow: { flexDirection: 'row', gap: 4, marginTop: 6, flexWrap: 'wrap' },
    reactionChip: { backgroundColor: c.background, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: c.border },
    reactionChipMine: { backgroundColor: c.primaryLight, borderColor: c.primary },
    reactionChipTxt: { fontSize: 11, color: c.textPrimary },
    rowActions: { flexDirection: 'column', marginBottom: 4 },
    quickReactBtn: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
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
    attachBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    recordingIndicator: {
      flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: c.background, borderRadius: 20, borderWidth: 1, borderColor: c.border,
      paddingHorizontal: 14, height: 36,
    },
    recordDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: c.danger },
    recordTimer: { fontSize: 13, color: c.textPrimary, fontVariant: ['tabular-nums'] },
    reactOverlayTop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.15)' },
    reactPicker: {
      flexDirection: 'row', gap: 6, backgroundColor: c.surface, borderRadius: 28,
      paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: c.border,
      shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 8,
    },
    reactPickerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    reactPickerEmoji: { fontSize: 24 },
  });
}
