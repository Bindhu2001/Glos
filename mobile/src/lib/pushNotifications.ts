import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { navigationRef } from './navigationRef';
import { navigateForNotification, RoutableNotif } from '../utils/notificationRouting';
import { wasHandledNatively } from '../../modules/notif-actions';
import type { useApi } from '../hooks/useApi';

type Api = ReturnType<typeof useApi>;

const CHAT_REPLY_CATEGORY = 'chat_reply';
const REPLY_ACTION_ID = 'reply';
const MARK_READ_ACTION_ID = 'mark_read';
// getLastNotificationResponseAsync() returns the SAME response on every app
// launch until a newer one arrives — so a Reply/Mark-as-read serviced on cold
// start must be de-duped, or every subsequent launch re-sends it.
const PROCESSED_RESPONSE_KEY = 'push:lastProcessedResponse';
// Synchronous in-memory guard kills the same-session race where the live
// listener and checkLastNotificationResponse both fire for one cold-start
// response before either finishes its AsyncStorage write. Claiming here means
// "don't try again THIS session" — the persistent key (set only on a
// successful send, see markResponseProcessed) is what stops a *future* launch
// re-firing it, while still letting a failed send retry on the next launch.
const processedThisSession = new Set<string>();

async function claimResponse(key: string): Promise<boolean> {
  if (processedThisSession.has(key)) return false;
  processedThisSession.add(key);
  try {
    if ((await AsyncStorage.getItem(PROCESSED_RESPONSE_KEY)) === key) return false;
  } catch { /* storage unavailable — proceed */ }
  return true;
}

async function markResponseProcessed(key: string): Promise<void> {
  try { await AsyncStorage.setItem(PROCESSED_RESPONSE_KEY, key); } catch { /* ignore */ }
}

// Without this, Expo suppresses the OS banner/sound for a notification that
// arrives while the app is already open in the foreground — the app would
// silently update its badge/in-app list with nothing visible to the user.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// Android requires an explicit channel (API 26+) or notifications are
// dropped silently rather than shown with a default sound/importance.
async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name: 'default',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#1a56db',
  });
}

// Physical-device-only (per Expo's own requirement — simulators/emulators
// have no APNs/FCM registration) and requires the user to grant permission;
// returns null rather than throwing for either case so callers can just
// skip registration silently instead of surfacing an error for something
// that isn't actionable (can't push-register a simulator, and a denied
// permission isn't a bug).
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (!Device.isDevice) return null;

  await ensureAndroidChannel();

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== 'granted') {
    const requested = await Notifications.requestPermissionsAsync();
    status = requested.status;
  }
  if (status !== 'granted') return null;

  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const { data: token } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    return token;
  } catch {
    return null;
  }
}

// Registers the "Reply" + "Mark as read" actions shown on chat push
// notifications (matches WhatsApp's row of quick actions) — must be called
// once before any such notification arrives, or the OS falls back to a plain
// tap-only notification with no action buttons at all. Idempotent:
// re-registering the same category identifier just overwrites it, safe to
// call on every launch.
export async function registerChatReplyCategory(): Promise<void> {
  try {
    await Notifications.setNotificationCategoryAsync(CHAT_REPLY_CATEGORY, [
      {
        identifier: REPLY_ACTION_ID,
        buttonTitle: 'Reply',
        textInput: { submitButtonTitle: 'Send', placeholder: 'Type a message...' },
        // Matches WhatsApp: submitting an inline reply shouldn't yank the app
        // to the foreground. Per Expo's docs this only fails to fire the JS
        // response listener at all if the app is fully killed (not merely
        // backgrounded) — an acceptable silent no-op there, versus always
        // forcing the app open just to cover that one edge case.
        options: { opensAppToForeground: false },
      },
      {
        identifier: MARK_READ_ACTION_ID,
        buttonTitle: 'Mark as read',
        // Same reasoning as Reply above — tapping this shouldn't open the app.
        options: { opensAppToForeground: false },
      },
    ]);
  } catch {
    // category registration unsupported/unavailable on this device — the
    // notification still works, just without the inline action buttons
  }
}

// Fires for a tap (or an inline-reply submit) that arrives while some JS
// context is already running (app foregrounded, backgrounded-but-alive, or
// just launched and this listener got attached in time). The killed-app
// cold-start case is handled separately by checkLastNotificationResponse
// below, since this listener isn't guaranteed to be attached before that
// interaction already happened.
export function addNotificationTapListener(api?: Api): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    void dispatchResponse(response, api);
  });
  return () => sub.remove();
}

// Shared handling for a notification response, from either the live listener
// or the cold-start replay (checkLastNotificationResponse).
async function dispatchResponse(response: Notifications.NotificationResponse, api?: Api): Promise<void> {
  const data = response.notification.request.content.data;
  const action = response.actionIdentifier;
  const notifId = response.notification.request.identifier;

  if ((action === REPLY_ACTION_ID && response.userText && api) || (action === MARK_READ_ACTION_ID && api)) {
    const dedupKey = `${notifId}:${action}:${response.userText ?? ''}`;
    // The notif-actions native module (Android BroadcastReceiver / iOS
    // NotificationDelegate) sends these itself while the app is dead. If it
    // already did, don't send again from JS — just route.
    let nativeAlreadySent = false;
    try { nativeAlreadySent = await wasHandledNatively(dedupKey); } catch { /* module absent */ }
    if (nativeAlreadySent) { routeFromNotificationData(data); return; }
    if (!(await claimResponse(dedupKey))) { routeFromNotificationData(data); return; }
    // Staleness guard for a *replayed* Reply — firing off a chat message long
    // after it was typed (the app was never opened in between) is worse than
    // dropping it. A live reply is always fresh so this never trips; only a
    // cold-start replay of an old buffered response does. Mark-as-read has no
    // such downside, so it always runs.
    const rawDate = response.notification.date ?? Date.now();
    const notifMs = rawDate < 1e12 ? rawDate * 1000 : rawDate; // normalise s → ms
    if (action === REPLY_ACTION_ID && Date.now() - notifMs > 10 * 60 * 1000) {
      await markResponseProcessed(dedupKey); // don't reconsider it next launch
      routeFromNotificationData(data);
      return;
    }
    const ok = action === REPLY_ACTION_ID
      ? await handleInlineReply(api!, data, response.userText!, notifId)
      : await handleMarkAsRead(api!, data, notifId);
    // Persist the dedup key only on success — a failed send then retries on
    // the next launch (this session won't retry, which is fine).
    if (ok) await markResponseProcessed(dedupKey);
    return;
  }

  routeFromNotificationData(data);
}

// Sends the reply straight over the HTTP chat endpoint (same one
// ChatThreadScreen's send() uses) rather than the socket — no live socket
// connection is guaranteed to exist yet at this point, but the api client
// (and its auth token) already does, so this doesn't need a real-time
// connection to succeed. Best-effort: a failure here has no UI to surface
// into (the notification shade already dismissed the reply prompt), so it
// just gets logged.
async function handleInlineReply(api: Api, data: unknown, text: string, notificationId?: string): Promise<boolean> {
  if (!data || typeof data !== 'object') return false;
  const item = data as RoutableNotif;
  if (item.type !== 'chat_message' || !item.app_id || !item.conversation_id) return false;
  const body = text.trim();
  if (!body) return false;
  try {
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await api.chat.sendMessage(item.app_id, item.conversation_id, {
      body,
      reply_to_id: null,
      attachments: [],
      _tempId: tempId,
    });
    // Replying implies you've read the thread — mark it read and clear its
    // notification, like WhatsApp does after an inline reply. Best-effort:
    // the reply itself already succeeded, so don't fail the whole thing here.
    try { await handleMarkAsReadInternal(api, item.app_id, item.conversation_id); } catch { /* ignore */ }
    if (notificationId) await Notifications.dismissNotificationAsync(notificationId).catch(() => {});
    return true;
  } catch (err) {
    console.error('[push] inline reply failed:', err);
    return false;
  }
}

// Marks the conversation read via HTTP, resolving the newest message id first
// so the server moves the read *cursor* forward — a timestamp-only mark
// leaves the conversation showing unread wherever the unread count is
// computed off last_read_message_id (web).
async function handleMarkAsReadInternal(api: Api, appId: number, convId: number) {
  let lastId: number | null = null;
  try {
    const r = await api.chat.getMessages(appId, convId, { limit: 1 });
    const rows: any[] = r.data ?? [];
    const id = rows[rows.length - 1]?.id;
    if (typeof id === 'number') lastId = id;
  } catch { /* fall back to timestamp-only */ }
  await api.chat.markConversationRead(appId, convId, lastId);
}

// Same HTTP-not-socket reasoning as handleInlineReply above. Also dismisses
// this specific notification — "Mark as read" tapped from the shade should
// clear that entry immediately rather than waiting for the user to actually
// open the thread.
async function handleMarkAsRead(api: Api, data: unknown, notificationId: string): Promise<boolean> {
  if (!data || typeof data !== 'object') return false;
  const item = data as RoutableNotif;
  if (item.type !== 'chat_message' || !item.app_id || !item.conversation_id) return false;
  try {
    await handleMarkAsReadInternal(api, item.app_id, item.conversation_id);
    await Notifications.dismissNotificationAsync(notificationId).catch(() => {});
    return true;
  } catch (err) {
    console.error('[push] mark-as-read failed:', err);
    return false;
  }
}

// Cold start via notification tap: the tap happened before any JS was
// running, so there's no live event for it — Expo instead remembers it and
// hands it back via this call once the app finishes launching. Must run
// after the nav container is ready, or the navigate() call below is a no-op.
//
// Also covers the case where the app cold-starts with a buffered "Reply" /
// "Mark as read" action response (e.g. the OS did launch the app to service
// it) — without this the typed reply text is silently dropped, since the
// live addNotificationResponseReceivedListener wasn't attached when the
// action happened. Note: with opensAppToForeground:false a *killed* app is
// not launched by these actions at all, so that specific case still needs
// the app to be at least backgrounded-alive.
export async function checkLastNotificationResponse(api?: Api): Promise<void> {
  const response = await Notifications.getLastNotificationResponseAsync();
  if (!response) return;
  await dispatchResponse(response, api);
}

// Reading a conversation in-app doesn't automatically clear its OS
// notifications (tapping a notification does, via autoCancel, but marking
// read by just opening the thread doesn't fire that) — matches WhatsApp's
// behavior of clearing a chat's notifications once you've actually seen it.
// Best-effort: getPresentedNotificationsAsync/dismissNotificationAsync are
// Android/iOS-supported but not guaranteed on every OS version, and a
// failure here just leaves a stale notification in the tray rather than
// breaking anything.
export async function dismissNotificationsForConversation(conversationId: number): Promise<void> {
  try {
    const presented = await Notifications.getPresentedNotificationsAsync();
    const matches = presented.filter((n) => {
      const data = n.request.content.data as Record<string, unknown> | undefined;
      return data?.type === 'chat_message' && String(data.conversation_id) === String(conversationId);
    });
    await Promise.all(matches.map((n) => Notifications.dismissNotificationAsync(n.request.identifier)));
  } catch {
    // best-effort — see comment above
  }
}

function routeFromNotificationData(data: unknown) {
  if (!data || typeof data !== 'object') return;
  const item = data as RoutableNotif;
  if (!item.type) return;
  const tryNavigate = () => {
    if (navigationRef.isReady()) {
      navigateForNotification(navigationRef, item);
    } else {
      setTimeout(tryNavigate, 200);
    }
  };
  tryNavigate();
}
