import React, { useEffect, useState, useMemo } from 'react';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '@clerk/clerk-expo';
import { RootStackParamList } from './types';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { ThemeProvider, useTheme } from '../contexts/ThemeContext';
import AuthNavigator from './AuthNavigator';
import MainNavigator from './MainNavigator';
import WorkspaceSelectScreen from '../screens/workspace/WorkspaceSelectScreen';
import NotificationsScreen from '../screens/notifications/NotificationsScreen';
import AccountSecurityScreen from '../screens/profile/AccountSecurityScreen';
import LoadingSpinner from '../components/common/LoadingSpinner';
import AlertModal, { alertRef } from '../components/common/AlertModal';

const Stack = createNativeStackNavigator<RootStackParamList>();

const LOAD_TIMEOUT_MS = 10000;

function Navigator() {
  const { isSignedIn, isLoaded } = useAuth();
  const { workspace, setWorkspace, isLoading: workspaceLoading } = useWorkspace();
  const [clerkTimedOut, setClerkTimedOut] = useState(false);
  const { colors, isDark } = useTheme();

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
  }, [isLoaded, isSignedIn]);

  // Only gate on Clerk loading; workspaceLoading resolves instantly (AsyncStorage)
  useEffect(() => {
    if (isLoaded) return;
    const timer = setTimeout(() => setClerkTimedOut(true), LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [isLoaded]);

  // Still waiting for workspace AsyncStorage (resolves in < 500ms normally)
  if (workspaceLoading) {
    return <LoadingSpinner />;
  }

  // Clerk loading: show spinner, but fall through to Auth after timeout
  if (!isLoaded && !clerkTimedOut) {
    return <LoadingSpinner />;
  }

  // Treat timed-out Clerk as unauthenticated — show login screen
  const effectivelySignedIn = isLoaded ? isSignedIn : false;

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <NavigationContainer theme={navTheme}>
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
