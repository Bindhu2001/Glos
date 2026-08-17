import { NavigatorScreenParams } from '@react-navigation/native';

export type RootStackParamList = {
  Auth: undefined;
  WorkspaceSelect: undefined;
  Main: NavigatorScreenParams<MainTabParamList> | undefined;
  Notifications: undefined;
  AccountSecurity: undefined;
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
  ChatThread: { conversationId: number; appId: number; title?: string; type?: 'direct' | 'group' | 'note' };
  NewConversation: { appId: number };
  GroupInfo: { conversationId: number; appId: number };
  ForwardMessage: { appId: number; body: string; attachments: any[] };
};

export type TasksStackParamList = {
  TasksList: undefined;
  TaskDetail: { taskId: number; appId: number };
  CreateTask: { appId: number; taskId?: number };
};

export type FeedStackParamList = {
  FeedList: { initialTab?: 'feed' | 'appreciations' | 'feedback' } | undefined;
  PostDetail: { postId: number; appId: number };
  CreatePost: { appId: number; postId?: number; initialContent?: string };
};

export type PerformanceStackParamList = {
  PerformanceHome: undefined;
  TaskReports: undefined;
  ReviewDetail: { reviewId: number; appId: number };
  AppraisalDetail: { appraisalId: number; appId: number };
  CreateAppraisal: { appId: number };
};

export type PeopleStackParamList = {
  EmployeesList: undefined;
  EmployeeDetail: { employeeId: number; appId: number };
};

export type AdminStackParamList = {
  AdminHome: undefined;
  Members: undefined;
  InviteMember: undefined;
  ClientsList: undefined;
  CreateEditClient: { clientId?: number };
  MyOrganisation: undefined;
};

export type MoreStackParamList = {
  MoreHome: undefined;
  ProjectsList: undefined;
  ProjectDetail: { projectId: number; appId: number };
  CreateEditProject: { appId: number; projectId?: number };
  AgreementsList: undefined;
  AgreementDetail: { agreementId: number; appId: number };
  CreateEditAgreement: { appId: number; agreementId?: number };
  ServicesList: undefined;
  CreateEditService: { serviceId?: number };
  ComplianceBoard: undefined;
  Routines: undefined;
  BusinessReviewsList: undefined;
  BusinessReviewDetail: { reviewId: number; appId: number };
  CreateBusinessReview: { appId: number; date?: string };
  MyOrganisation: undefined;
  ReportsList: undefined;
  TaskReports: undefined;
  OtherReports: undefined;
  ReportView: { reportType: 'projects' | 'financial' | 'goals' | 'performance' | 'appraisals' | 'contracts' };
  PoliciesList: undefined;
  PolicyDetail: { policyId: number; appId: number };
};
