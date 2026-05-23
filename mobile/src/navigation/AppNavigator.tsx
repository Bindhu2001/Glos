import React, { useEffect } from 'react';
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

const Stack = createNativeStackNavigator<RootStackParamList>();

function Navigator() {
  const { isSignedIn, isLoaded } = useAuth();
  const { workspace, setWorkspace, isLoading: workspaceLoading } = useWorkspace();

  useEffect(() => {
    if (isLoaded && !isSignedIn && workspace) {
      setWorkspace(null);
    }
  }, [isLoaded, isSignedIn]);

  if (!isLoaded || workspaceLoading) return <LoadingSpinner />;

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

export default function AppNavigator() {
  return (
    <ThemeProvider>
      <Navigator />
    </ThemeProvider>
  );
}
