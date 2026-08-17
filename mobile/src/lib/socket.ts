import { io, Socket } from 'socket.io-client';
import { API_BASE_URL } from '../utils/constants';

let _socket: Socket | null = null;
let _getToken: (() => Promise<string | null>) | null = null;

// Clerk's token fetch can stall (see useApi.ts for the full explanation) with
// no timeout of its own. Inside socket.io's `auth` callback that's worse than
// in a REST call: there's no outer ceiling watching it at all, so a stuck
// fetch here means the socket just sits "connecting" forever — chat looks
// broken with no error and no retry, since nothing ever calls cb(...) to let
// the handshake fail and trigger socket.io's own reconnection logic.
function getTokenWithTimeout(ms = 8000): Promise<string | null> {
  return Promise.race([
    _getToken ? _getToken() : Promise.resolve(null),
    new Promise<string | null>((resolve) => setTimeout(() => resolve(''), ms)),
  ]);
}

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
        const t = await getTokenWithTimeout();
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
        const newToken = await getTokenWithTimeout();
        _socket.auth = { token: newToken };
      } catch {}
      _socket.connect();
    }
  });

  // Auth failures (expired/stale token) surface as connect_error, not
  // disconnect — the `auth` callback above already re-fetches a token on
  // every (re)connect attempt, so the client's own reconnection logic will
  // pick up a fresh one automatically. Nothing else to do here beyond not
  // letting the error go unhandled and crash the app.
  _socket.on('connect_error', () => {});

  return _socket;
}
