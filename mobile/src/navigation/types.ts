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

// Shared so the Compliance Board (in MoreStack) can open the same task
// create/edit screen the Tasks tab uses, pre-filled to an agreement + service.
export type CreateTaskParams = {
  appId: number;
  taskId?: number;
  presetContractId?: number;
  presetAgreementServiceId?: number;
  // When set, the task-type selector is locked to "Agreement" (matches web's
  // lockTaskType="contract" when opened from the Compliance Board).
  lockContractType?: boolean;
};

export type TasksStackParamList = {
  TasksList: undefined;
  TaskDetail: { taskId: number; appId: number };
  CreateTask: CreateTaskParams;
};

export type FeedStackParamList = {
  FeedList: { initialTab?: 'feed' | 'appreciations' | 'feedback' } | undefined;
  PostDetail: { postId: number; appId: number };
  CreatePost: {
    appId: number;
    postId?: number;
    initialContent?: string;
    initialPostType?: 'post' | 'announcement' | 'poll';
    initialPoll?: { question: string; options: { id: number; option_text: string }[]; allow_multiple: boolean };
  };
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
  ProjectFinancials: { projectId: number; appId: number };
  AgreementsList: undefined;
  AgreementDetail: { agreementId: number; appId: number };
  CreateEditAgreement: { appId: number; agreementId?: number };
  ServicesList: undefined;
  CreateEditService: { serviceId?: number };
  ComplianceBoard: undefined;
  ComplianceTasks: undefined;
  // Registered in MoreStack too so the Compliance Board can open task
  // create/detail without leaving the More tab.
  CreateTask: CreateTaskParams;
  TaskDetail: { taskId: number; appId: number };
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
