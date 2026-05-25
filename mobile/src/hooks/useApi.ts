import { useAuth, useClerk } from '@clerk/clerk-expo';
import { useMemo, useRef, useCallback } from 'react';
import { Alert } from 'react-native';
import { createApiClient } from '../api/client';
import { useWorkspace } from '../contexts/WorkspaceContext';
import {
  workspaceApi,
  meApi,
  invitationsApi,
  notificationsApi,
  dashboardApi,
  tasksApi,
  feedApi,
  performanceApi,
  employeesApi,
  appreciationsApi,
  timeLogsApi,
} from '../api';

export function useApi() {
  const { getToken } = useAuth();
  const { signOut } = useClerk();
  const { setWorkspace } = useWorkspace();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  const onDeactivated = useCallback(() => {
    Alert.alert(
      'Account Deactivated',
      'Your account has been deactivated. Please contact your administrator.',
      [{ text: 'OK', onPress: () => { setWorkspace(null); signOut(); } }],
    );
  }, [setWorkspace, signOut]);

  const onDeactivatedRef = useRef(onDeactivated);
  onDeactivatedRef.current = onDeactivated;

  const mkClient = useCallback(async () => {
    const t = await getTokenRef.current();
    return createApiClient(t ?? '', () => onDeactivatedRef.current());
  }, []);

  return useMemo(
    () => ({
      getClient: mkClient,
      workspace: {
        listApps: async () => {
          const client = await mkClient();
          return workspaceApi(client).listApps();
        },
        getApp: async (appId: number) => {
          const client = await mkClient();
          return workspaceApi(client).getApp(appId);
        },
        getStats: async (appId: number) => {
          const client = await mkClient();
          return workspaceApi(client).getStats(appId);
        },
        getMembers: async (appId: number) => {
          const client = await mkClient();
          return workspaceApi(client).getMembers(appId);
        },
      },
      me: {
        getProfile: async () => {
          const client = await mkClient();
          return meApi(client).getProfile();
        },
        updateProfile: async (data: { first_name?: string; last_name?: string }) => {
          const client = await mkClient();
          return meApi(client).updateProfile(data);
        },
      },
      invitations: {
        listMine: async () => {
          const client = await mkClient();
          return invitationsApi(client).listMine();
        },
        accept: async (token: string) => {
          const client = await mkClient();
          return invitationsApi(client).accept(token);
        },
        decline: async (token: string) => {
          const client = await mkClient();
          return invitationsApi(client).decline(token);
        },
      },
      notifications: {
        list: async (params?: { unread?: boolean; limit?: number }) => {
          const client = await mkClient();
          return notificationsApi(client).list(params);
        },
        unreadCount: async () => {
          const client = await mkClient();
          return notificationsApi(client).unreadCount();
        },
        markRead: async (id: number) => {
          const client = await mkClient();
          return notificationsApi(client).markRead(id);
        },
        markAllRead: async () => {
          const client = await mkClient();
          return notificationsApi(client).markAllRead();
        },
      },
      dashboard: {
        getMyDashboard: async (appId: number) => {
          const client = await mkClient();
          return dashboardApi(client).getMyDashboard(appId);
        },
        getTeamDashboard: async (appId: number) => {
          const client = await mkClient();
          return dashboardApi(client).getTeamDashboard(appId);
        },
      },
      tasks: {
        list: async (appId: number, params?: Record<string, unknown>) => {
          const client = await mkClient();
          return tasksApi(client).list(appId, params);
        },
        get: async (appId: number, taskId: number) => {
          const client = await mkClient();
          return tasksApi(client).get(appId, taskId);
        },
        create: async (appId: number, data: Record<string, unknown>) => {
          const client = await mkClient();
          return tasksApi(client).create(appId, data);
        },
        update: async (appId: number, taskId: number, data: Record<string, unknown>) => {
          const client = await mkClient();
          return tasksApi(client).update(appId, taskId, data);
        },
        delete: async (appId: number, taskId: number) => {
          const client = await mkClient();
          return tasksApi(client).delete(appId, taskId);
        },
        startTimer: async (appId: number, taskId: number) => {
          const client = await mkClient();
          return tasksApi(client).startTimer(appId, taskId);
        },
        stopTimer: async (appId: number, taskId: number) => {
          const client = await mkClient();
          return tasksApi(client).stopTimer(appId, taskId);
        },
        getTimeline: async (appId: number, taskId: number) => {
          const client = await mkClient();
          return tasksApi(client).getTimeline(appId, taskId);
        },
        getComments: async (appId: number, taskId: number) => {
          const client = await mkClient();
          return tasksApi(client).getComments(appId, taskId);
        },
        addComment: async (appId: number, taskId: number, body: string) => {
          const client = await mkClient();
          return tasksApi(client).addComment(appId, taskId, body);
        },
        deleteComment: async (appId: number, taskId: number, commentId: number) => {
          const client = await mkClient();
          return tasksApi(client).deleteComment(appId, taskId, commentId);
        },
        getChecklist: async (appId: number, taskId: number) => {
          const client = await mkClient();
          return tasksApi(client).getChecklist(appId, taskId);
        },
        addChecklistItem: async (appId: number, taskId: number, label: string) => {
          const client = await mkClient();
          return tasksApi(client).addChecklistItem(appId, taskId, label);
        },
        toggleChecklistItem: async (appId: number, taskId: number, itemId: number, checked: boolean) => {
          const client = await mkClient();
          return tasksApi(client).toggleChecklistItem(appId, taskId, itemId, checked);
        },
        getTimeLogs: async (appId: number, taskId: number) => {
          const client = await mkClient();
          return tasksApi(client).getTimeLogs(appId, taskId);
        },
        addTimeLog: async (appId: number, taskId: number, data: Record<string, unknown>) => {
          const client = await mkClient();
          return tasksApi(client).addTimeLog(appId, taskId, data);
        },
      },
      feed: {
        list: async (appId: number) => {
          const client = await mkClient();
          return feedApi(client).list(appId);
        },
        create: async (appId: number, data: Record<string, unknown>) => {
          const client = await mkClient();
          return feedApi(client).create(appId, data);
        },
        delete: async (appId: number, postId: number) => {
          const client = await mkClient();
          return feedApi(client).delete(appId, postId);
        },
        addReaction: async (appId: number, postId: number, emoji: string) => {
          const client = await mkClient();
          return feedApi(client).addReaction(appId, postId, emoji);
        },
        getComments: async (appId: number, postId: number) => {
          const client = await mkClient();
          return feedApi(client).getComments(appId, postId);
        },
        addComment: async (appId: number, postId: number, content: string) => {
          const client = await mkClient();
          return feedApi(client).addComment(appId, postId, content);
        },
      },
      performance: {
        getCycles: async (appId: number) => {
          const client = await mkClient();
          return performanceApi(client).getCycles(appId);
        },
        getGoals: async (appId: number, params?: Record<string, unknown>) => {
          const client = await mkClient();
          return performanceApi(client).getGoals(appId, params);
        },
        createGoal: async (appId: number, data: Record<string, unknown>) => {
          const client = await mkClient();
          return performanceApi(client).createGoal(appId, data);
        },
        submitGoalForApproval: async (appId: number, goalId: number) => {
          const client = await mkClient();
          return performanceApi(client).submitGoalForApproval(appId, goalId);
        },
        getAppraisals: async (appId: number, params?: Record<string, unknown>) => {
          const client = await mkClient();
          return performanceApi(client).getAppraisals(appId, params);
        },
        listMyReviews: async (appId: number) => {
          const client = await mkClient();
          return performanceApi(client).listMyReviews(appId);
        },
        listPendingForMe: async (appId: number) => {
          const client = await mkClient();
          return performanceApi(client).listPendingForMe(appId);
        },
      },
      employees: {
        list: async (appId: number) => {
          const client = await mkClient();
          return employeesApi(client).list(appId);
        },
        get: async (appId: number, employeeId: number) => {
          const client = await mkClient();
          return employeesApi(client).get(appId, employeeId);
        },
        getOrgChart: async (appId: number) => {
          const client = await mkClient();
          return employeesApi(client).getOrgChart(appId);
        },
      },
      appreciations: {
        give: async (appId: number, data: { to_user_id: number; message: string; badge?: string }) => {
          const client = await mkClient();
          return appreciationsApi(client).give(appId, data);
        },
        listReceived: async (appId: number) => {
          const client = await mkClient();
          return appreciationsApi(client).listReceived(appId);
        },
      },
      timeLogs: {
        getSummary: async (appId: number, params?: { period?: string; start_date?: string; end_date?: string }) => {
          const client = await mkClient();
          return timeLogsApi(client).getSummary(appId, params);
        },
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
}
