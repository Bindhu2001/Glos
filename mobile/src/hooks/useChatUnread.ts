import { useEffect, useRef, useState } from 'react';
import { Vibration } from 'react-native';
import { useAuth } from '@clerk/clerk-expo';
import { useAudioPlayer } from 'expo-audio';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useApi } from './useApi';
import { getSocket } from '../lib/socket';

const nudgeSound = require('../../assets/sounds/nudge.wav');

// Mirrors qa-production/frontend/src/components/workspace/Sidebar.jsx useChatUnread
// — including the app-wide nudge sound, so a nudge is heard no matter which
// screen you're on, not only while that specific chat thread is open.
export function useChatUnread(appId: number | undefined, myUserId: number | undefined) {
  const api = useApi();
  const { getToken } = useAuth();
  const [unread, setUnread] = useState(0);
  const apiRef = useRef(api);
  const appIdRef = useRef(appId);
  const myUserIdRef = useRef(myUserId);
  apiRef.current = api;
  appIdRef.current = appId;
  myUserIdRef.current = myUserId;
  const nudgePlayer = useAudioPlayer(nudgeSound);
  const nudgePlayerRef = useRef(nudgePlayer);
  nudgePlayerRef.current = nudgePlayer;
  // Clerk's getToken isn't reference-stable across renders — read via a ref
  // (see ChatThreadScreen/ChatListScreen) instead of the socket effect's deps,
  // so this hook — mounted app-wide for the whole signed-in session — doesn't
  // re-run on every render.
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  const refresh = useRef(() => {
    if (!appIdRef.current) return;
    apiRef.current.chat.listConversations(appIdRef.current)
      .then((res: any) => {
        const convs = res.data ?? [];
        const total = convs.reduce((s: number, c: any) => s + (c.unread_count || 0), 0);
        setUnread(total);
      })
      .catch(() => {});
  });

  useEffect(() => {
    if (!appId) return;
    refresh.current();
  }, [appId]);

  useEffect(() => {
    if (!appId) return;
    let cancelled = false;
    const onNewMsg = () => { if (!cancelled) refresh.current(); };
    const onRead = () => { if (!cancelled) refresh.current(); };
    const onNudge = async (payload: any) => {
      if (cancelled) return;
      if (myUserIdRef.current != null && String(payload.sender_id) === String(myUserIdRef.current)) return;
      try {
        const muted = await AsyncStorage.getItem(`chat_mute_${payload.conversation_id}`);
        if (muted === '1') return;
      } catch {}
      Vibration.vibrate([0, 120, 80, 120]);
      try {
        nudgePlayerRef.current.seekTo(0);
        nudgePlayerRef.current.play();
      } catch {}
    };

    const socket = getSocket(async () => (await getTokenRef.current()) ?? '');
    if (!socket) return;

    const doJoin = () => {
      socket.emit('join', { appId });
      socket.on('new_message', onNewMsg);
      socket.on('read_receipt', onRead);
      socket.on('nudge', onNudge);
    };

    if (socket.connected) doJoin();
    else socket.once('connect', doJoin);

    return () => {
      cancelled = true;
      // Without this, a still-pending `doJoin` from an earlier run of this
      // effect (e.g. one that fired while getToken/nudgePlayer briefly had a
      // new reference, before this ref-based fix) fires later and stacks a
      // duplicate set of listeners — the exact cause of nudges vibrating and
      // playing their sound more than once. See ChatThreadScreen for the
      // full write-up of this leak.
      socket.off('connect', doJoin);
      socket.off('new_message', onNewMsg);
      socket.off('read_receipt', onRead);
      socket.off('nudge', onNudge);
    };
  // getToken/nudgePlayer are read via refs above so this only (re)joins when
  // appId changes, not on every render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appId]);

  return unread;
}
