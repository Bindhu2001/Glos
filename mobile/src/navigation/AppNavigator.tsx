import React, { useEffect, useState, useMemo, useRef } from 'react';
import { Platform, AppState } from 'react-native';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '@clerk/clerk-expo';
import { RootStackParamList } from './types';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { ThemeProvider, useTheme } from '../contexts/ThemeContext';
import { useApi } from '../hooks/useApi';
import AuthNavigator from './AuthNavigator';
import MainNavigator from './MainNavigator';
import WorkspaceSelectScreen from '../screens/workspace/WorkspaceSelectScreen';
import NotificationsScreen from '../screens/notifications/NotificationsScreen';
import AccountSecurityScreen from '../screens/profile/AccountSecurityScreen';
import LaunchScreen from '../components/common/LaunchScreen';
import AlertModal, { alertRef } from '../components/common/AlertModal';
import { navigationRef } from '../lib/navigationRef';
import {
  registerForPushNotificationsAsync, addNotificationTapListener, checkLastNotificationResponse,
  registerChatReplyCategory, registerBackgroundNotificationTask,
} from '../lib/pushNotifications';
import { syncNotifAuth, clearNotifAuth } from '../lib/notifAuthSync';

const Stack = createNativeStackNavigator<RootStackParamList>();

const LOAD_TIMEOUT_MS = 10000;
// The launch animation runs once for ~4.2s on cold start — this floor keeps
// it playing to completion even when auth/workspace resolve instantly,
// so it reads as an intentional brand moment rather than a flickered spinner.
const MIN_SPLASH_MS = 4200;

function Navigator() {
  const { isSignedIn, isLoaded, getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;
  const { workspace, setWorkspace, isLoading: workspaceLoading } = useWorkspace();
  const [clerkTimedOut, setClerkTimedOut] = useState(false);
  const [minSplashElapsed, setMinSplashElapsed] = useState(false);
  const { colors, isDark } = useTheme();
  const api = useApi();
  const pushRegisteredRef = useRef(false);

  // React Navigation defaults to a light background for the native screen
  // container regardless of app theme — without this, every push/pop
  // transition flashes white behind the screen for a frame in dark mode.
  const navTheme = useMemo(() => {
    const base = isDark ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        background: colors.background,
        card: colors.surface,
        text: colors.textPrimary,
        border: colors.border,
        primary: colors.primary,
      },
    };
  }, [isDark, colors]);

  useEffect(() => {
    if (isLoaded && !isSignedIn && workspace) {
      setWorkspace(null);
    }
    // Wipe the native notification-action credential the moment we're signed
    // out so a stale token can never be used from the shade.
    if (isLoaded && !isSignedIn) {
      clearNotifAuth();
    }
  }, [isLoaded, isSignedIn]);

  // Only gate on Clerk loading; workspaceLoading resolves instantly (AsyncStorage)
  useEffect(() => {
    if (isLoaded) return;
    const timer = setTimeout(() => setClerkTimedOut(true), LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [isLoaded]);

  useEffect(() => {
    const timer = setTimeout(() => setMinSplashElapsed(true), MIN_SPLASH_MS);
    return () => clearTimeout(timer);
  }, []);

  // Tap handling is attached once, independent of auth state — a cold-start
  // tap can arrive before Clerk even finishes loading, and the routing
  // helper itself polls until navigationRef is ready rather than requiring
  // any particular screen to be mounted first. `api` is passed through so an
  // inline-reply submission can call the chat send endpoint directly.
  useEffect(() => addNotificationTapListener(api), []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { registerChatReplyCategory(); }, []);

  useEffect(() => { registerBackgroundNotificationTask(); }, []);

  // Registers this device's push token once signed in — the mobile-side half
  // of push support. Only ever registers once per app session (ref guard)
  // since it's tied to the device, not to which workspace is currently open.
  // registerForPushNotificationsAsync() resolves null for several different
  // reasons (simulator, permission denied, token-fetch failure) that all
  // look identical here — see MoreHomeScreen's "Check Push Registration"
  // debug row for a version that surfaces which one it actually was.
  useEffect(() => {
    if (!isSignedIn || pushRegisteredRef.current) return;
    pushRegisteredRef.current = true;
    registerForPushNotificationsAsync().then((token) => {
      if (!token) return;
      const platform = Platform.OS === 'ios' ? 'ios' : 'android';
      api.notifications.registerPushToken(token, platform).catch(() => {
        // Registration is best-effort — a failed call here just means the
        // next app open (or the manual debug retry) tries again.
      });
    });
  }, [isSignedIn]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keeps the notif-actions native module topped up with a fresh long-lived
  // token: once on sign-in, then on each foreground (throttled to 5 min inside
  // syncNotifAuth — a synced token is valid ~1h so this always covers the next
  // session). Fire-and-forget; never blocks a render. Lets "Reply" / "Mark as
  // read" from the shade work with the app fully killed — without a valid token
  // the native side just defers to the replay-on-open path.
  useEffect(() => {
    if (!isSignedIn) return;
    syncNotifAuth(getTokenRef.current, true);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') syncNotifAuth(getTokenRef.current);
    });
    return () => sub.remove();
  }, [isSignedIn]); // eslint-disable-line react-hooks/exhaustive-deps

  // Workspace/Clerk loading, or the launch animation still playing out —
  // one shared gate so the animation mounts once and never restarts.
  if (workspaceLoading || (!isLoaded && !clerkTimedOut) || !minSplashElapsed) {
    return <LaunchScreen />;
  }

  // Treat timed-out Clerk as unauthenticated — show login screen
  const effectivelySignedIn = isLoaded ? isSignedIn : false;

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <NavigationContainer
        ref={navigationRef}
        theme={navTheme}
        onReady={() => { checkLastNotificationResponse(api); }}
      >
        <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
          {!effectivelySignedIn ? (
            <Stack.Screen name="Auth" component={AuthNavigator} />
          ) : !workspace ? (
            <Stack.Screen name="WorkspaceSelect" component={WorkspaceSelectScreen} />
          ) : (
            <>
              <Stack.Screen name="Main" component={MainNavigator} />
              <Stack.Screen
                name="Notifications"
                component={NotificationsScreen}
                options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
              />
              <Stack.Screen name="AccountSecurity" component={AccountSecurityScreen} />
            </>
          )}
        </Stack.Navigator>
      </NavigationContainer>
      <AlertModal ref={alertRef} />
    </>
  );
}

export default function AppNavigator() {
  return (
    <ThemeProvider>
      <Navigator />
    </ThemeProvider>
  );
}
