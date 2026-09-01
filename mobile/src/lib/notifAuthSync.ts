import { Platform } from 'react-native';
import { API_BASE_URL } from '../utils/constants';
import { setCredentials, clearCredentials } from '../../modules/notif-actions';

// Feeds the `notif-actions` native module a short-lived Clerk token so it can
// reply / mark-read straight from the notification shade while the app process
// is dead — Android via a BroadcastReceiver, iOS via a NotificationDelegate in
// the OS-granted background window.
//
// The token comes from a dedicated Clerk JWT template ("notif_action") rather
// than the default session token — the default is a ~60s token, useless for a
// notification the user might act on minutes later. The template must be
// created in the Clerk dashboard with a longer lifetime (see docs); if it
// doesn't exist getToken() throws, we swallow it, and the receiver simply
// falls back to expo-notifications' buffer + JS replay.

const TEMPLATE = 'notif_action';
const MIN_RESYNC_INTERVAL_MS = 5 * 60 * 1000;
// Used only if the JWT has no readable `exp` — the receiver still won't use a
// token past this, so err on the short side.
const FALLBACK_TTL_MS = 55 * 60 * 1000;
const SUPPORTED = Platform.OS === 'android' || Platform.OS === 'ios';

type GetToken = (options: { template: string; skipCache?: boolean }) => Promise<string | null>;

let lastSyncAt = 0;

function decodeJwtExpMs(jwt: string): number | null {
  try {
    const payload = jwt.split('.')[1];
    if (!payload) return null;
    const b64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    // atob is available in Hermes (RN 0.74+).
    const json = JSON.parse(
      decodeURIComponent(
        atob(b64)
          .split('')
          .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join(''),
      ),
    );
    return typeof json?.exp === 'number' ? json.exp * 1000 : null;
  } catch {
    return null;
  }
}

/**
 * @param force  bypass the 5-minute throttle (use on sign-in / first launch).
 */
export async function syncNotifAuth(getToken: GetToken, force = false): Promise<void> {
  if (!SUPPORTED) return;

  const now = Date.now();
  if (!force && now - lastSyncAt < MIN_RESYNC_INTERVAL_MS) return;
  lastSyncAt = now;

  try {
    const token = await getToken({ template: TEMPLATE });
    if (!token) return;
    const expiresAtMs = decodeJwtExpMs(token) ?? now + FALLBACK_TTL_MS;
    await setCredentials({ token, apiBaseUrl: API_BASE_URL, expiresAtMs });
  } catch {
    // Template not configured, offline, or Clerk hiccup — the receiver's
    // no-credential fallback handles it. Reset the throttle so the next
    // trigger retries rather than waiting out the full interval.
    lastSyncAt = 0;
  }
}

export async function clearNotifAuth(): Promise<void> {
  if (!SUPPORTED) return;
  lastSyncAt = 0;
  try {
    await clearCredentials();
  } catch {
    /* ignore */
  }
}
