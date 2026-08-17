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
import CreateAppraisalScreen from '../screens/performance/CreateAppraisalScreen';
import ProfileScreen from '../screens/profile/ProfileScreen';
import AdminHomeScreen from '../screens/admin/AdminHomeScreen';
import MembersScreen from '../screens/admin/MembersScreen';
import InviteMemberScreen from '../screens/admin/InviteMemberScreen';
import ClientsListScreen from '../screens/admin/ClientsListScreen';
import CreateEditClientScreen from '../screens/admin/CreateEditClientScreen';
import ChatListScreen from '../screens/chat/ChatListScreen';
import ChatThreadScreen from '../screens/chat/ChatThreadScreen';
import NewConversationScreen from '../screens/chat/NewConversationScreen';
import GroupInfoScreen from '../screens/chat/GroupInfoScreen';
import ForwardMessageScreen from '../screens/chat/ForwardMessageScreen';
import MoreHomeScreen from '../screens/more/MoreHomeScreen';
import ProjectsListScreen from '../screens/projects/ProjectsListScreen';
import ProjectDetailScreen from '../screens/projects/ProjectDetailScreen';
import CreateEditProjectScreen from '../screens/projects/CreateEditProjectScreen';
import AgreementsListScreen from '../screens/contracts/AgreementsListScreen';
import AgreementDetailScreen from '../screens/contracts/AgreementDetailScreen';
import CreateEditAgreementScreen from '../screens/contracts/CreateEditAgreementScreen';
import ServicesListScreen from '../screens/contracts/ServicesListScreen';
import CreateEditServiceScreen from '../screens/contracts/CreateEditServiceScreen';
import RoutinesScreen from '../screens/routines/RoutinesScreen';
import BusinessReviewsListScreen from '../screens/businessReviews/BusinessReviewsListScreen';
import BusinessReviewDetailScreen from '../screens/businessReviews/BusinessReviewDetailScreen';
import CreateBusinessReviewScreen from '../screens/businessReviews/CreateBusinessReviewScreen';
import MyOrganisationScreen from '../screens/organisation/MyOrganisationScreen';
import ReportsListScreen from '../screens/reports/ReportsListScreen';
import GenericReportScreen from '../screens/reports/GenericReportScreen';
import PoliciesListScreen from '../screens/policies/PoliciesListScreen';
import PolicyDetailScreen from '../screens/policies/PolicyDetailScreen';

const Tab = createBottomTabNavigator<MainTabParamList>();
const TasksStack = createNativeStackNavigator<TasksStackParamList>();
const FeedStack = createNativeStackNavigator<FeedStackParamList>();
const PerformanceStack = createNativeStackNavigator<PerformanceStackParamList>();
const AdminStack = createNativeStackNavigator<AdminStackParamList>();
const ChatStack = createNativeStackNavigator<ChatStackParamList>();
const MoreStack = createNativeStackNavigator<MoreStackParamList>();

function TasksNavigator() {
  const { colors } = useTheme();
  return (
    <TasksStack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
      <TasksStack.Screen name="TasksList" component={TasksScreen} />
      <TasksStack.Screen name="TaskDetail" component={TaskDetailScreen} />
      <TasksStack.Screen name="CreateTask" component={CreateTaskScreen} />
    </TasksStack.Navigator>
  );
}

function FeedNavigator() {
  const { colors } = useTheme();
  return (
    <FeedStack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
      <FeedStack.Screen name="FeedList" component={FeedScreen} />
      <FeedStack.Screen name="PostDetail" component={PostDetailScreen} />
      <FeedStack.Screen name="CreatePost" component={CreatePostScreen} />
    </FeedStack.Navigator>
  );
}

function PerformanceNavigator() {
  const { colors } = useTheme();
  return (
    <PerformanceStack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
      <PerformanceStack.Screen name="PerformanceHome" component={PerformanceScreen} />
      <PerformanceStack.Screen name="TaskReports" component={TaskReportsScreen} />
      <PerformanceStack.Screen name="ReviewDetail" component={PerformanceReviewDetailScreen} />
      <PerformanceStack.Screen name="AppraisalDetail" component={AppraisalDetailScreen} />
      <PerformanceStack.Screen name="CreateAppraisal" component={CreateAppraisalScreen} />
    </PerformanceStack.Navigator>
  );
}

function AdminNavigator() {
  const { colors } = useTheme();
  return (
    <AdminStack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
      <AdminStack.Screen name="AdminHome" component={AdminHomeScreen} />
      <AdminStack.Screen name="Members" component={MembersScreen} />
      <AdminStack.Screen name="InviteMember" component={InviteMemberScreen} />
      <AdminStack.Screen name="ClientsList" component={ClientsListScreen} />
      <AdminStack.Screen name="CreateEditClient" component={CreateEditClientScreen} />
      <AdminStack.Screen name="MyOrganisation" component={MyOrganisationScreen} />
    </AdminStack.Navigator>
  );
}

function ChatNavigator() {
  const { colors } = useTheme();
  return (
    <ChatStack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
      <ChatStack.Screen name="ChatList" component={ChatListScreen} />
      <ChatStack.Screen name="ChatThread" component={ChatThreadScreen} />
      <ChatStack.Screen name="NewConversation" component={NewConversationScreen} options={{ presentation: 'modal' }} />
      <ChatStack.Screen name="GroupInfo" component={GroupInfoScreen} />
      <ChatStack.Screen name="ForwardMessage" component={ForwardMessageScreen} options={{ presentation: 'modal' }} />
    </ChatStack.Navigator>
  );
}

function MoreNavigator() {
  const { colors } = useTheme();
  return (
    <MoreStack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
      <MoreStack.Screen name="MoreHome" component={MoreHomeScreen} />
      <MoreStack.Screen name="ProjectsList" component={ProjectsListScreen} />
      <MoreStack.Screen name="ProjectDetail" component={ProjectDetailScreen} />
      <MoreStack.Screen name="CreateEditProject" component={CreateEditProjectScreen} />
      <MoreStack.Screen name="AgreementsList" component={AgreementsListScreen} />
      <MoreStack.Screen name="AgreementDetail" component={AgreementDetailScreen} />
      <MoreStack.Screen name="CreateEditAgreement" component={CreateEditAgreementScreen} />
      <MoreStack.Screen name="ServicesList" component={ServicesListScreen} />
      <MoreStack.Screen name="CreateEditService" component={CreateEditServiceScreen} />
      <MoreStack.Screen name="Routines" component={RoutinesScreen} />
      <MoreStack.Screen name="BusinessReviewsList" component={BusinessReviewsListScreen} />
      <MoreStack.Screen name="BusinessReviewDetail" component={BusinessReviewDetailScreen} />
      <MoreStack.Screen name="CreateBusinessReview" component={CreateBusinessReviewScreen} />
      <MoreStack.Screen name="MyOrganisation" component={MyOrganisationScreen} />
      <MoreStack.Screen name="ReportsList" component={ReportsListScreen} />
      <MoreStack.Screen name="TaskReports" component={TaskReportsScreen} />
      <MoreStack.Screen name="ReportView" component={GenericReportScreen} />
      <MoreStack.Screen name="PoliciesList" component={PoliciesListScreen} />
      <MoreStack.Screen name="PolicyDetail" component={PolicyDetailScreen} />
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
      sceneContainerStyle={{ backgroundColor: colors.background }}
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
