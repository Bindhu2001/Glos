import { useAuth } from '@clerk/clerk-expo';
import { useMemo, useRef } from 'react';
import { createApiClient } from '../api/client';
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
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  return useMemo(
    () => ({
      getClient: async () => {
        const token = await getToken();
        return createApiClient(token ?? '');
      },
      workspace: {
        listApps: async () => {
          const t = await getTokenRef.current();
          return workspaceApi(createApiClient(t ?? '')).listApps();
        },
        getApp: async (appId: number) => {
          const t = await getTokenRef.current();
          return workspaceApi(createApiClient(t ?? '')).getApp(appId);
        },
        getStats: async (appId: number) => {
          const t = await getTokenRef.current();
          return workspaceApi(createApiClient(t ?? '')).getStats(appId);
        },
        getMembers: async (appId: number) => {
          const t = await getTokenRef.current();
          return workspaceApi(createApiClient(t ?? '')).getMembers(appId);
        },
      },
      me: {
        getProfile: async () => {
          const t = await getTokenRef.current();
          return meApi(createApiClient(t ?? '')).getProfile();
        },
        updateProfile: async (data: { first_name?: string; last_name?: string }) => {
          const t = await getTokenRef.current();
          return meApi(createApiClient(t ?? '')).updateProfile(data);
        },
      },
      invitations: {
        listMine: async () => {
          const t = await getTokenRef.current();
          return invitationsApi(createApiClient(t ?? '')).listMine();
        },
        accept: async (token: string) => {
          const t = await getTokenRef.current();
          return invitationsApi(createApiClient(t ?? '')).accept(token);
        },
        decline: async (token: string) => {
          const t = await getTokenRef.current();
          return invitationsApi(createApiClient(t ?? '')).decline(token);
        },
      },
      notifications: {
        list: async (params?: { unread?: boolean; limit?: number }) => {
          const t = await getTokenRef.current();
          return notificationsApi(createApiClient(t ?? '')).list(params);
        },
        unreadCount: async () => {
          const t = await getTokenRef.current();
          return notificationsApi(createApiClient(t ?? '')).unreadCount();
        },
        markRead: async (id: number) => {
          const t = await getTokenRef.current();
          return notificationsApi(createApiClient(t ?? '')).markRead(id);
        },
        markAllRead: async () => {
          const t = await getTokenRef.current();
          return notificationsApi(createApiClient(t ?? '')).markAllRead();
        },
      },
      dashboard: {
        getMyDashboard: async (appId: number) => {
          const t = await getTokenRef.current();
          return dashboardApi(createApiClient(t ?? '')).getMyDashboard(appId);
        },
        getTeamDashboard: async (appId: number) => {
          const t = await getTokenRef.current();
          return dashboardApi(createApiClient(t ?? '')).getTeamDashboard(appId);
        },
      },
      tasks: {
        list: async (appId: number, params?: Record<string, unknown>) => {
          const t = await getTokenRef.current();
          return tasksApi(createApiClient(t ?? '')).list(appId, params);
        },
        get: async (appId: number, taskId: number) => {
          const t = await getTokenRef.current();
          return tasksApi(createApiClient(t ?? '')).get(appId, taskId);
        },
        create: async (appId: number, data: Record<string, unknown>) => {
          const t = await getTokenRef.current();
          return tasksApi(createApiClient(t ?? '')).create(appId, data);
        },
        update: async (appId: number, taskId: number, data: Record<string, unknown>) => {
          const t = await getTokenRef.current();
          return tasksApi(createApiClient(t ?? '')).update(appId, taskId, data);
        },
        delete: async (appId: number, taskId: number) => {
          const t = await getTokenRef.current();
          return tasksApi(createApiClient(t ?? '')).delete(appId, taskId);
        },
        startTimer: async (appId: number, taskId: number) => {
          const t = await getTokenRef.current();
          return tasksApi(createApiClient(t ?? '')).startTimer(appId, taskId);
        },
        stopTimer: async (appId: number, taskId: number) => {
          const t = await getTokenRef.current();
          return tasksApi(createApiClient(t ?? '')).stopTimer(appId, taskId);
        },
        getTimeline: async (appId: number, taskId: number) => {
          const t = await getTokenRef.current();
          return tasksApi(createApiClient(t ?? '')).getTimeline(appId, taskId);
        },
        getComments: async (appId: number, taskId: number) => {
          const t = await getTokenRef.current();
          return tasksApi(createApiClient(t ?? '')).getComments(appId, taskId);
        },
        addComment: async (appId: number, taskId: number, body: string) => {
          const t = await getTokenRef.current();
          return tasksApi(createApiClient(t ?? '')).addComment(appId, taskId, body);
        },
        deleteComment: async (appId: number, taskId: number, commentId: number) => {
          const t = await getTokenRef.current();
          return tasksApi(createApiClient(t ?? '')).deleteComment(appId, taskId, commentId);
        },
        getChecklist: async (appId: number, taskId: number) => {
          const t = await getTokenRef.current();
          return tasksApi(createApiClient(t ?? '')).getChecklist(appId, taskId);
        },
        addChecklistItem: async (appId: number, taskId: number, label: string) => {
          const t = await getTokenRef.current();
          return tasksApi(createApiClient(t ?? '')).addChecklistItem(appId, taskId, label);
        },
        toggleChecklistItem: async (appId: number, taskId: number, itemId: number, checked: boolean) => {
          const t = await getTokenRef.current();
          return tasksApi(createApiClient(t ?? '')).toggleChecklistItem(appId, taskId, itemId, checked);
        },
        getTimeLogs: async (appId: number, taskId: number) => {
          const t = await getTokenRef.current();
          return tasksApi(createApiClient(t ?? '')).getTimeLogs(appId, taskId);
        },
        addTimeLog: async (appId: number, taskId: number, data: Record<string, unknown>) => {
          const t = await getTokenRef.current();
          return tasksApi(createApiClient(t ?? '')).addTimeLog(appId, taskId, data);
        },
      },
      feed: {
        list: async (appId: number) => {
          const t = await getTokenRef.current();
          return feedApi(createApiClient(t ?? '')).list(appId);
        },
        create: async (appId: number, data: Record<string, unknown>) => {
          const t = await getTokenRef.current();
          return feedApi(createApiClient(t ?? '')).create(appId, data);
        },
        delete: async (appId: number, postId: number) => {
          const t = await getTokenRef.current();
          return feedApi(createApiClient(t ?? '')).delete(appId, postId);
        },
        addReaction: async (appId: number, postId: number, emoji: string) => {
          const t = await getTokenRef.current();
          return feedApi(createApiClient(t ?? '')).addReaction(appId, postId, emoji);
        },
        getComments: async (appId: number, postId: number) => {
          const t = await getTokenRef.current();
          return feedApi(createApiClient(t ?? '')).getComments(appId, postId);
        },
        addComment: async (appId: number, postId: number, content: string) => {
          const t = await getTokenRef.current();
          return feedApi(createApiClient(t ?? '')).addComment(appId, postId, content);
        },
      },
      performance: {
        getCycles: async (appId: number) => {
          const t = await getTokenRef.current();
          return performanceApi(createApiClient(t ?? '')).getCycles(appId);
        },
        getGoals: async (appId: number, params?: Record<string, unknown>) => {
          const t = await getTokenRef.current();
          return performanceApi(createApiClient(t ?? '')).getGoals(appId, params);
        },
        createGoal: async (appId: number, data: Record<string, unknown>) => {
          const t = await getTokenRef.current();
          return performanceApi(createApiClient(t ?? '')).createGoal(appId, data);
        },
        submitGoalForApproval: async (appId: number, goalId: number) => {
          const t = await getTokenRef.current();
          return performanceApi(createApiClient(t ?? '')).submitGoalForApproval(appId, goalId);
        },
        getAppraisals: async (appId: number, params?: Record<string, unknown>) => {
          const t = await getTokenRef.current();
          return performanceApi(createApiClient(t ?? '')).getAppraisals(appId, params);
        },
        listMyReviews: async (appId: number) => {
          const t = await getTokenRef.current();
          return performanceApi(createApiClient(t ?? '')).listMyReviews(appId);
        },
        listPendingForMe: async (appId: number) => {
          const t = await getTokenRef.current();
          return performanceApi(createApiClient(t ?? '')).listPendingForMe(appId);
        },
      },
      employees: {
        list: async (appId: number) => {
          const t = await getTokenRef.current();
          return employeesApi(createApiClient(t ?? '')).list(appId);
        },
        get: async (appId: number, employeeId: number) => {
          const t = await getTokenRef.current();
          return employeesApi(createApiClient(t ?? '')).get(appId, employeeId);
        },
        getOrgChart: async (appId: number) => {
          const t = await getTokenRef.current();
          return employeesApi(createApiClient(t ?? '')).getOrgChart(appId);
        },
      },
      appreciations: {
        give: async (appId: number, data: { to_user_id: number; message: string; badge?: string }) => {
          const t = await getTokenRef.current();
          return appreciationsApi(createApiClient(t ?? '')).give(appId, data);
        },
        listReceived: async (appId: number) => {
          const t = await getTokenRef.current();
          return appreciationsApi(createApiClient(t ?? '')).listReceived(appId);
        },
      },
      timeLogs: {
        getSummary: async (appId: number, params?: { period?: string; start_date?: string; end_date?: string }) => {
          const t = await getTokenRef.current();
          return timeLogsApi(createApiClient(t ?? '')).getSummary(appId, params);
        },
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
}
