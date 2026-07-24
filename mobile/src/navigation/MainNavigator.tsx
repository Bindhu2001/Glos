import React, { useState, useEffect } from 'react';
import { View, Text } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { HasTeamProvider } from '../contexts/HasTeamContext';
import { useChatUnread } from '../hooks/useChatUnread';
import { useApi } from '../hooks/useApi';
import {
  MainTabParamList, TasksStackParamList, FeedStackParamList,
  PerformanceStackParamList, AdminStackParamList, ChatStackParamList, MoreStackParamList,
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
import ChatListScreen from '../screens/chat/ChatListScreen';
import ChatThreadScreen from '../screens/chat/ChatThreadScreen';
import NewConversationScreen from '../screens/chat/NewConversationScreen';
import MoreHomeScreen from '../screens/more/MoreHomeScreen';
import ProjectsListScreen from '../screens/projects/ProjectsListScreen';
import ProjectDetailScreen from '../screens/projects/ProjectDetailScreen';
import AgreementsListScreen from '../screens/contracts/AgreementsListScreen';
import AgreementDetailScreen from '../screens/contracts/AgreementDetailScreen';
import RoutinesScreen from '../screens/routines/RoutinesScreen';
import BusinessReviewsListScreen from '../screens/businessReviews/BusinessReviewsListScreen';
import BusinessReviewDetailScreen from '../screens/businessReviews/BusinessReviewDetailScreen';
import MyOrganisationScreen from '../screens/organisation/MyOrganisationScreen';
import EmployeeHierarchyScreen from '../screens/organisation/EmployeeHierarchyScreen';
import ReportsListScreen from '../screens/reports/ReportsListScreen';

const Tab = createBottomTabNavigator<MainTabParamList>();
const TasksStack = createNativeStackNavigator<TasksStackParamList>();
const FeedStack = createNativeStackNavigator<FeedStackParamList>();
const PerformanceStack = createNativeStackNavigator<PerformanceStackParamList>();
const AdminStack = createNativeStackNavigator<AdminStackParamList>();
const ChatStack = createNativeStackNavigator<ChatStackParamList>();
const MoreStack = createNativeStackNavigator<MoreStackParamList>();

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

function ChatNavigator() {
  return (
    <ChatStack.Navigator screenOptions={{ headerShown: false }}>
      <ChatStack.Screen name="ChatList" component={ChatListScreen} />
      <ChatStack.Screen name="ChatThread" component={ChatThreadScreen} />
      <ChatStack.Screen name="NewConversation" component={NewConversationScreen} options={{ presentation: 'modal' }} />
    </ChatStack.Navigator>
  );
}

function MoreNavigator() {
  return (
    <MoreStack.Navigator screenOptions={{ headerShown: false }}>
      <MoreStack.Screen name="MoreHome" component={MoreHomeScreen} />
      <MoreStack.Screen name="ProjectsList" component={ProjectsListScreen} />
      <MoreStack.Screen name="ProjectDetail" component={ProjectDetailScreen} />
      <MoreStack.Screen name="AgreementsList" component={AgreementsListScreen} />
      <MoreStack.Screen name="AgreementDetail" component={AgreementDetailScreen} />
      <MoreStack.Screen name="Routines" component={RoutinesScreen} />
      <MoreStack.Screen name="BusinessReviewsList" component={BusinessReviewsListScreen} />
      <MoreStack.Screen name="BusinessReviewDetail" component={BusinessReviewDetailScreen} />
      <MoreStack.Screen name="MyOrganisation" component={MyOrganisationScreen} />
      <MoreStack.Screen name="EmployeeHierarchy" component={EmployeeHierarchyScreen} />
      <MoreStack.Screen name="ReportsList" component={ReportsListScreen} />
      <MoreStack.Screen name="TaskReports" component={TaskReportsScreen} />
    </MoreStack.Navigator>
  );
}

function MainTabs() {
  const { colors } = useTheme();
  const { workspace } = useWorkspace();
  const insets = useSafeAreaInsets();
  const isAdmin = workspace?.role === 'super_admin' || workspace?.role === 'admin';
  const [myUserId, setMyUserId] = useState<number | undefined>(undefined);
  const api = useApi();

  useEffect(() => {
    api.me.getProfile()
      .then((r) => setMyUserId(r.data?.id ?? r.data?.user_id))
      .catch(() => {});
  }, []);

  const chatUnread = useChatUnread(workspace?.id, myUserId);

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
            ChatTab: 'chatbubbles-outline',
            FeedTab: 'newspaper-outline',
            PerformanceTab: 'trending-up-outline',
            MoreTab: 'apps-outline',
            AdminTab: 'shield-outline',
            ProfileTab: 'person-outline',
          };
          const filledIcons: Record<string, keyof typeof Ionicons.glyphMap> = {
            DashboardTab: 'home',
            TasksTab: 'checkmark-circle',
            ChatTab: 'chatbubbles',
            FeedTab: 'newspaper',
            PerformanceTab: 'trending-up',
            MoreTab: 'apps',
            AdminTab: 'shield',
            ProfileTab: 'person',
          };
          const iconName = focused ? filledIcons[route.name] : outlineIcons[route.name];
          return (
            <View style={{ alignItems: 'center', gap: 2 }}>
              <View>
                <Ionicons name={iconName} size={iconSize} color={color} />
                {route.name === 'ChatTab' && chatUnread > 0 && (
                  <View style={{
                    position: 'absolute', top: -4, right: -8,
                    backgroundColor: colors.danger, borderRadius: 8,
                    minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
                  }}>
                    <Text style={{ fontSize: 9, fontWeight: '700', color: '#fff' }}>{chatUnread > 99 ? '99+' : chatUnread}</Text>
                  </View>
                )}
              </View>
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
      <Tab.Screen name="ChatTab" component={ChatNavigator} options={{ title: 'Chat' }} />
      <Tab.Screen name="FeedTab" component={FeedNavigator} options={{ title: 'Feed' }} />
      <Tab.Screen name="PerformanceTab" component={PerformanceNavigator} options={{ title: 'Performance' }} />
      <Tab.Screen name="MoreTab" component={MoreNavigator} options={{ title: 'More' }} />
      {isAdmin && (
        <Tab.Screen name="AdminTab" component={AdminNavigator} options={{ title: 'Admin' }} />
      )}
      <Tab.Screen name="ProfileTab" component={ProfileScreen} options={{ title: 'Profile' }} />
    </Tab.Navigator>
  );
}

export default function MainNavigator() {
  return (
    <HasTeamProvider>
      <MainTabs />
    </HasTeamProvider>
  );
}
