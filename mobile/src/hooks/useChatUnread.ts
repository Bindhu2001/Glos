import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@clerk/clerk-expo';
import { useApi } from './useApi';
import { getSocket } from '../lib/socket';

// Mirrors qa-production/frontend/src/components/workspace/Sidebar.jsx useChatUnread.
export function useChatUnread(appId: number | undefined, myUserId: number | undefined) {
  const api = useApi();
  const { getToken } = useAuth();
  const [unread, setUnread] = useState(0);
  const apiRef = useRef(api);
  const appIdRef = useRef(appId);
  apiRef.current = api;
  appIdRef.current = appId;

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

    const socket = getSocket(async () => (await getToken()) ?? '');
    if (!socket) return;

    const doJoin = () => {
      socket.emit('join', { appId });
      socket.on('new_message', onNewMsg);
      socket.on('read_receipt', onRead);
    };

    if (socket.connected) doJoin();
    else socket.once('connect', doJoin);

    return () => {
      cancelled = true;
      socket.off('new_message', onNewMsg);
      socket.off('read_receipt', onRead);
    };
  }, [appId, getToken]);

  return unread;
}
