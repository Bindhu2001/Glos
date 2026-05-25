import React from 'react';
import { View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { MainTabParamList, TasksStackParamList, FeedStackParamList, PerformanceStackParamList } from './types';

import DashboardScreen from '../screens/dashboard/DashboardScreen';
import TasksScreen from '../screens/tasks/TasksScreen';
import TaskDetailScreen from '../screens/tasks/TaskDetailScreen';
import CreateTaskScreen from '../screens/tasks/CreateTaskScreen';
import FeedScreen from '../screens/feed/FeedScreen';
import PostDetailScreen from '../screens/feed/PostDetailScreen';
import CreatePostScreen from '../screens/feed/CreatePostScreen';
import PerformanceScreen from '../screens/performance/PerformanceScreen';
import TaskReportsScreen from '../screens/performance/TaskReportsScreen';
import ProfileScreen from '../screens/profile/ProfileScreen';

const Tab = createBottomTabNavigator<MainTabParamList>();
const TasksStack = createNativeStackNavigator<TasksStackParamList>();
const FeedStack = createNativeStackNavigator<FeedStackParamList>();
const PerformanceStack = createNativeStackNavigator<PerformanceStackParamList>();

function TasksNavigator() {
  return (
    <TasksStack.Navigator screenOptions={{ headerShown: false }}>
      <TasksStack.Screen name="TasksList" component={TasksScreen} />
      <TasksStack.Screen name="TaskDetail" component={TaskDetailScreen} />
      <TasksStack.Screen name="CreateTask" component={CreateTaskScreen} />
    </TasksStack.Navigator>
  );
}

function FeedNavigator() {
  return (
    <FeedStack.Navigator screenOptions={{ headerShown: false }}>
      <FeedStack.Screen name="FeedList" component={FeedScreen} />
      <FeedStack.Screen name="PostDetail" component={PostDetailScreen} />
      <FeedStack.Screen name="CreatePost" component={CreatePostScreen} />
    </FeedStack.Navigator>
  );
}

function PerformanceNavigator() {
  return (
    <PerformanceStack.Navigator screenOptions={{ headerShown: false }}>
      <PerformanceStack.Screen name="PerformanceHome" component={PerformanceScreen} />
      <PerformanceStack.Screen name="TaskReports" component={TaskReportsScreen} />
    </PerformanceStack.Navigator>
  );
}

export default function MainNavigator() {
  const { colors } = useTheme();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.gray400,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          paddingBottom: 12,
          paddingTop: 8,
          height: 72,
          elevation: 0,
        },
        tabBarItemStyle: { paddingVertical: 2 },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.2 },
        tabBarIcon: ({ color, size, focused }) => {
          const outlineIcons: Record<string, keyof typeof Ionicons.glyphMap> = {
            DashboardTab: 'home-outline',
            TasksTab: 'checkmark-circle-outline',
            FeedTab: 'newspaper-outline',
            PerformanceTab: 'trending-up-outline',
            ProfileTab: 'person-outline',
          };
          const filledIcons: Record<string, keyof typeof Ionicons.glyphMap> = {
            DashboardTab: 'home',
            TasksTab: 'checkmark-circle',
            FeedTab: 'newspaper',
            PerformanceTab: 'trending-up',
            ProfileTab: 'person',
          };
          const iconName = focused ? filledIcons[route.name] : outlineIcons[route.name];
          return (
            <View style={{ alignItems: 'center', gap: 4 }}>
              <Ionicons name={iconName} size={size} color={color} />
              {focused && (
                <View style={{
                  width: 16, height: 3, borderRadius: 2,
                  backgroundColor: colors.primary,
                }} />
              )}
            </View>
          );
        },
      })}
    >
      <Tab.Screen name="DashboardTab" component={DashboardScreen} options={{ title: 'Home' }} />
      <Tab.Screen name="TasksTab" component={TasksNavigator} options={{ title: 'Tasks' }} />
      <Tab.Screen name="FeedTab" component={FeedNavigator} options={{ title: 'Feed' }} />
      <Tab.Screen name="PerformanceTab" component={PerformanceNavigator} options={{ title: 'Performance' }} />
      <Tab.Screen name="ProfileTab" component={ProfileScreen} options={{ title: 'Profile' }} />
    </Tab.Navigator>
  );
}
