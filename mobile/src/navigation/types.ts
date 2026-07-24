import { NavigatorScreenParams } from '@react-navigation/native';

export type RootStackParamList = {
  Auth: undefined;
  WorkspaceSelect: undefined;
  Main: NavigatorScreenParams<MainTabParamList> | undefined;
  Notifications: undefined;
};

export type AuthStackParamList = {
  SignIn: undefined;
  SignUp: undefined;
};

export type MainTabParamList = {
  DashboardTab: undefined;
  TasksTab: NavigatorScreenParams<TasksStackParamList> | undefined;
  ChatTab: NavigatorScreenParams<ChatStackParamList> | undefined;
  FeedTab: NavigatorScreenParams<FeedStackParamList> | undefined;
  PerformanceTab: NavigatorScreenParams<PerformanceStackParamList> | undefined;
  MoreTab: NavigatorScreenParams<MoreStackParamList> | undefined;
  AdminTab: NavigatorScreenParams<AdminStackParamList> | undefined;
  ProfileTab: undefined;
};

export type ChatStackParamList = {
  ChatList: undefined;
  ChatThread: { conversationId: number; appId: number; title?: string };
  NewConversation: { appId: number };
};

export type TasksStackParamList = {
  TasksList: undefined;
  TaskDetail: { taskId: number; appId: number };
  CreateTask: { appId: number };
};

export type FeedStackParamList = {
  FeedList: undefined;
  PostDetail: { postId: number; appId: number };
  CreatePost: { appId: number };
};

export type PerformanceStackParamList = {
  PerformanceHome: undefined;
  TaskReports: undefined;
  ReviewDetail: { reviewId: number; appId: number };
  AppraisalDetail: { appraisalId: number; appId: number };
};

export type PeopleStackParamList = {
  EmployeesList: undefined;
  EmployeeDetail: { employeeId: number; appId: number };
};

export type AdminStackParamList = {
  AdminHome: undefined;
  Members: undefined;
  InviteMember: undefined;
  Organisation: undefined;
  Roles: undefined;
  Policies: undefined;
  PolicyDetail: { policyId: number; appId: number };
};

export type MoreStackParamList = {
  MoreHome: undefined;
  ProjectsList: undefined;
  ProjectDetail: { projectId: number; appId: number };
  AgreementsList: undefined;
  AgreementDetail: { agreementId: number; appId: number };
  Routines: undefined;
  BusinessReviewsList: undefined;
  BusinessReviewDetail: { reviewId: number; appId: number };
  MyOrganisation: undefined;
  EmployeeHierarchy: undefined;
  ReportsList: undefined;
  TaskReports: undefined;
};
