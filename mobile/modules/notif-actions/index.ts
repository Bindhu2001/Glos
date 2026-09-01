import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';

// Native bridge for "reply / mark-as-read straight from the notification shade
// while the app is fully killed".
//
//  - Android: a BroadcastReceiver (ChatActionReceiver.kt) intercepts the action
//    before any JS runs.
//  - iOS: a NotificationDelegate (NotifActionsModule.swift) does the work in the
//    ~30s background-launch window the OS grants for a notification action,
//    holding it open with beginBackgroundTask.
//
// Both call the chat API directly with a short-lived Clerk token this module is
// fed from JS. If the native side can't complete (no token, offline, …) it
// leaves the response for the existing pushNotifications.ts replay-on-open path.

export interface NotifCredentials {
  /** Clerk JWT (from the long-lived `notif_action` template). */
  token: string;
  /** e.g. `https://login.glosonline.com/api` — same base the axios client uses. */
  apiBaseUrl: string;
  /** Epoch ms. The native side refuses the token past this. */
  expiresAtMs: number;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}

interface NotifActionsNativeModule {
  setCredentials(creds: NotifCredentials): Promise<void>;
  clearCredentials(): Promise<void>;
  /**
   * True if the native side already sent this exact notification response
   * (key = `${notifId}:${actionId}:${userText}`), so JS must not send it again
   * — only route. Always false where there's no native module.
   */
  wasHandledNatively(responseKey: string): Promise<boolean>;
}

const noop: NotifActionsNativeModule = {
  async setCredentials() {},
  async clearCredentials() {},
  async wasHandledNatively() {
    return false;
  },
};

const supported = Platform.OS === 'android' || Platform.OS === 'ios';

// requireOptionalNativeModule returns null (no throw, no warning) when the
// native side isn't in this build yet — so the app keeps working before the
// module is compiled in, and iOS/Expo Go just get the no-op.
const native: NotifActionsNativeModule =
  (supported && requireOptionalNativeModule<NotifActionsNativeModule>('NotifActions')) || noop;

export function setCredentials(creds: NotifCredentials): Promise<void> {
  return native.setCredentials(creds);
}

export function clearCredentials(): Promise<void> {
  return native.clearCredentials();
}

export function wasHandledNatively(responseKey: string): Promise<boolean> {
  return native.wasHandledNatively(responseKey);
}
