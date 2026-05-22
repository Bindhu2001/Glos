import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '@clerk/clerk-expo';
import { RootStackParamList } from './types';
import { useWorkspace } from '../contexts/WorkspaceContext';
import AuthNavigator from './AuthNavigator';
import MainNavigator from './MainNavigator';
import WorkspaceSelectScreen from '../screens/workspace/WorkspaceSelectScreen';
import NotificationsScreen from '../screens/notifications/NotificationsScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function AppNavigator() {
  const { isSignedIn, isLoaded } = useAuth();
  const { workspace, isLoading: workspaceLoading } = useWorkspace();

  console.log('[AppNavigator] isLoaded:', isLoaded, 'isSignedIn:', isSignedIn, 'workspace:', workspace?.id, 'workspaceLoading:', workspaceLoading);

  if (!isLoaded || workspaceLoading) return null;

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!isSignedIn ? (
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
  );
}
