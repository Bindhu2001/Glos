import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '@clerk/clerk-expo';
import { RootStackParamList } from './types';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { ThemeProvider } from '../contexts/ThemeContext';
import AuthNavigator from './AuthNavigator';
import MainNavigator from './MainNavigator';
import WorkspaceSelectScreen from '../screens/workspace/WorkspaceSelectScreen';
import NotificationsScreen from '../screens/notifications/NotificationsScreen';
import LoadingSpinner from '../components/common/LoadingSpinner';
import AlertModal, { alertRef } from '../components/common/AlertModal';

const Stack = createNativeStackNavigator<RootStackParamList>();

const LOAD_TIMEOUT_MS = 10000;

function Navigator() {
  const { isSignedIn, isLoaded } = useAuth();
  const { workspace, setWorkspace, isLoading: workspaceLoading } = useWorkspace();
  const [clerkTimedOut, setClerkTimedOut] = useState(false);

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
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
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
