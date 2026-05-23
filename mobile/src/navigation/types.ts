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
  FeedTab: NavigatorScreenParams<FeedStackParamList> | undefined;
  PerformanceTab: NavigatorScreenParams<PerformanceStackParamList> | undefined;
  ProfileTab: undefined;
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
};

export type PeopleStackParamList = {
  EmployeesList: undefined;
  EmployeeDetail: { employeeId: number; appId: number };
};
