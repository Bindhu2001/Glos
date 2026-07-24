import { io, Socket } from 'socket.io-client';
import { API_BASE_URL } from '../utils/constants';

let _socket: Socket | null = null;
let _getToken: (() => Promise<string | null>) | null = null;

// Mirrors qa-production/frontend/src/lib/socket.js — same server, same events.
export function getSocket(getTokenFn?: () => Promise<string | null>): Socket | null {
  if (getTokenFn) _getToken = getTokenFn;
  if (_socket) return _socket;
  if (!_getToken) return null;

  const base = API_BASE_URL.replace(/\/api\/?$/, '');
  _socket = io(base, {
    path: '/socket.io',
    auth: async (cb) => {
      try {
        const t = _getToken ? await _getToken() : null;
        cb({ token: t });
      } catch {
        cb({ token: '' });
      }
    },
    transports: ['websocket', 'polling'],
    autoConnect: true,
  });

  _socket.on('disconnect', async (reason) => {
    if (reason === 'io server disconnect' && _getToken && _socket) {
      try {
        const newToken = await _getToken();
        _socket.auth = { token: newToken };
      } catch {}
      _socket.connect();
    }
  });

  return _socket;
}
