import React from 'react';
import { View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import { useWorkspace } from '../contexts/WorkspaceContext';
import {
  MainTabParamList, TasksStackParamList, FeedStackParamList,
  PerformanceStackParamList, AdminStackParamList,
} from './types';

import DashboardScreen from '../screens/dashboard/DashboardScreen';
import TasksScreen from '../screens/tasks/TasksScreen';
import TaskDetailScreen from '../screens/tasks/TaskDetailScreen';
import CreateTaskScreen from '../screens/tasks/CreateTaskScreen';
import FeedScreen from '../screens/feed/FeedScreen';
import PostDetailScreen from '../screens/feed/PostDetailScreen';
import CreatePostScreen from '../screens/feed/CreatePostScreen';
import PerformanceScreen from '../screens/performance/PerformanceScreen';
import TaskReportsScreen from '../screens/performance/TaskReportsScreen';
import PerformanceReviewDetailScreen from '../screens/performance/PerformanceReviewDetailScreen';
import AppraisalDetailScreen from '../screens/performance/AppraisalDetailScreen';
import ProfileScreen from '../screens/profile/ProfileScreen';
import AdminHomeScreen from '../screens/admin/AdminHomeScreen';
import MembersScreen from '../screens/admin/MembersScreen';
import InviteMemberScreen from '../screens/admin/InviteMemberScreen';
import OrganisationScreen from '../screens/admin/OrganisationScreen';
import RolesScreen from '../screens/admin/RolesScreen';
import PoliciesScreen from '../screens/admin/PoliciesScreen';
import PolicyDetailScreen from '../screens/admin/PolicyDetailScreen';

const Tab = createBottomTabNavigator<MainTabParamList>();
const TasksStack = createNativeStackNavigator<TasksStackParamList>();
const FeedStack = createNativeStackNavigator<FeedStackParamList>();
const PerformanceStack = createNativeStackNavigator<PerformanceStackParamList>();
const AdminStack = createNativeStackNavigator<AdminStackParamList>();

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
      <PerformanceStack.Screen name="ReviewDetail" component={PerformanceReviewDetailScreen} />
      <PerformanceStack.Screen name="AppraisalDetail" component={AppraisalDetailScreen} />
    </PerformanceStack.Navigator>
  );
}

function AdminNavigator() {
  return (
    <AdminStack.Navigator screenOptions={{ headerShown: false }}>
      <AdminStack.Screen name="AdminHome" component={AdminHomeScreen} />
      <AdminStack.Screen name="Members" component={MembersScreen} />
      <AdminStack.Screen name="InviteMember" component={InviteMemberScreen} />
      <AdminStack.Screen name="Organisation" component={OrganisationScreen} />
      <AdminStack.Screen name="Roles" component={RolesScreen} />
      <AdminStack.Screen name="Policies" component={PoliciesScreen} />
      <AdminStack.Screen name="PolicyDetail" component={PolicyDetailScreen} />
    </AdminStack.Navigator>
  );
}

export default function MainNavigator() {
  const { colors } = useTheme();
  const { workspace } = useWorkspace();
  const insets = useSafeAreaInsets();
  const isAdmin = workspace?.role === 'super_admin' || workspace?.role === 'admin';

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
          paddingBottom: insets.bottom + 6,
          paddingTop: 6,
          height: 64 + insets.bottom,
          elevation: 0,
        },
        tabBarItemStyle: { paddingVertical: 0 },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.1, marginTop: -2 },
        tabBarIcon: ({ color, focused }) => {
          const iconSize = 24;
          const outlineIcons: Record<string, keyof typeof Ionicons.glyphMap> = {
            DashboardTab: 'home-outline',
            TasksTab: 'checkmark-circle-outline',
            FeedTab: 'newspaper-outline',
            PerformanceTab: 'trending-up-outline',
            AdminTab: 'shield-outline',
            ProfileTab: 'person-outline',
          };
          const filledIcons: Record<string, keyof typeof Ionicons.glyphMap> = {
            DashboardTab: 'home',
            TasksTab: 'checkmark-circle',
            FeedTab: 'newspaper',
            PerformanceTab: 'trending-up',
            AdminTab: 'shield',
            ProfileTab: 'person',
          };
          const iconName = focused ? filledIcons[route.name] : outlineIcons[route.name];
          return (
            <View style={{ alignItems: 'center', gap: 2 }}>
              <Ionicons name={iconName} size={iconSize} color={color} />
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
      {isAdmin && (
        <Tab.Screen name="AdminTab" component={AdminNavigator} options={{ title: 'Admin' }} />
      )}
      <Tab.Screen name="ProfileTab" component={ProfileScreen} options={{ title: 'Profile' }} />
    </Tab.Navigator>
  );
}
