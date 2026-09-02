import { AxiosInstance } from 'axios';
import { useAuth, useClerk, useUser } from '@clerk/clerk-expo';
import { useMemo, useRef, useCallback } from 'react';
import { createApiClient } from '../api/client';
import { showAlert } from '../components/common/AlertModal';
import { useWorkspace } from '../contexts/WorkspaceContext';
import {
  attachmentsApi,
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
  membersApi,
  appInvitationsApi,
  organisationApi,
  rolesApi,
  policiesApi,
  departmentsApi,
  projectsApi,
  contractsApi,
  routinesApi,
  otherReportsApi,
  businessReviewsApi,
  taskPlannerApi,
  chatApi,
} from '../api';

// Lazily creates a client per call and proxies straight through to the given
// api-group factory — avoids hand-writing a wrapper method per endpoint for
// large modules (projects/contracts/routines/business reviews).
function bindApiGroup<T extends Record<string, (...args: any[]) => any>>(
  mkClient: () => Promise<AxiosInstance>,
  factory: (client: AxiosInstance) => T,
): T {
  return new Proxy({} as T, {
    get(_target, prop) {
      // Guard 'then'/symbols so this proxy is never mistaken for a thenable
      // (e.g. if a caller does `await api.projects` instead of a method call) —
      // otherwise JS's implicit thenable check would call a function that
      // throws instead of just returning undefined like a normal object would.
      if (typeof prop !== 'string' || prop === 'then') return undefined;
      return async (...args: any[]) => {
        const client = await mkClient();
        return (factory(client) as any)[prop](...args);
      };
    },
  });
}

export function useApi() {
  const { getToken } = useAuth();
  const { signOut } = useClerk();
  const { user } = useUser();
  const { setWorkspace } = useWorkspace();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  const onDeactivated = useCallback(() => {
    showAlert(
      'Account Deactivated',
      'Your account has been deactivated. Please contact your administrator.',
      [{ text: 'OK', onPress: () => { setWorkspace(null); signOut(); } }],
    );
  }, [setWorkspace, signOut]);

  const onDeactivatedRef = useRef(onDeactivated);
  onDeactivatedRef.current = onDeactivated;

  const onWorkspaceRevoked = useCallback(() => {
    showAlert(
      'Access Denied',
      'You have been deactivated or removed from this workspace.',
      [{ text: 'OK', onPress: () => { setWorkspace(null); } }],
    );
  }, [setWorkspace]);

  const onWorkspaceRevokedRef = useRef(onWorkspaceRevoked);
  onWorkspaceRevokedRef.current = onWorkspaceRevoked;

  // A 404 "App not found" means the workspace this session is pinned to has
  // been deleted (or its id in storage is stale) — retrying the same request
  // can never succeed, so offer a way straight to the workspace picker.
  // Throttled so a burst of parallel 404s doesn't stack the modal.
  const appMissingShownAtRef = useRef(0);
  const onAppMissing = useCallback(() => {
    const now = Date.now();
    if (now - appMissingShownAtRef.current < 3000) return;
    appMissingShownAtRef.current = now;
    showAlert(
      'Workspace unavailable',
      'This workspace may have been removed or is no longer available. Switch to another workspace to continue.',
      [
        { text: 'Switch Workspace', onPress: () => { setWorkspace(null); } },
        { text: 'Try Again', style: 'cancel' },
      ],
    );
  }, [setWorkspace]);

  const onAppMissingRef = useRef(onAppMissing);
  onAppMissingRef.current = onAppMissing;

  const inflightTokenRef = useRef<Promise<string> | null>(null);

  // Clerk's getToken() silently refreshes the session token over the network
  // when the cached one has expired — and that refresh call has no timeout of
  // its own. If it ever stalls (flaky connection, Clerk having a slow moment),
  // every api.* call built on top hangs right along with it: mkClient() never
  // resolves, so the actual HTTP request (which DOES have client.ts's 15s
  // timeout) never even starts. The only thing that eventually notices is
  // useLoadWithTimeout's unrelated 20s ceiling — so screens sat on a spinner
  // for a full 20s before falling back to a generic "check your connection"
  // message that had nothing to do with the network. Racing getToken() against
  // its own timeout here means a stuck refresh fails in ~8s with a real error
  // that the normal retry-with-fresh-token path (client.ts) or the caller's
  // own catch can react to immediately, instead of hanging silently.
  const TOKEN_TIMEOUT_MS = 8000;
  function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
    return Promise.race([
      p,
      new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out`)), ms)),
    ]);
  }

  // Dedupes concurrent getToken() calls (several requests firing at once on
  // mount), but must not hold onto the resolved token — Clerk session tokens
  // are short-lived, and serving a stale one from a long-lived cache is what
  // caused the "Invalid token" errors deep into a chat session.
  const getCachedToken = useCallback(async (): Promise<string> => {
    if (!inflightTokenRef.current) {
      inflightTokenRef.current = withTimeout(getTokenRef.current(), TOKEN_TIMEOUT_MS, 'getToken')
        .then(t => t ?? '')
        .finally(() => { inflightTokenRef.current = null; });
    }
    return inflightTokenRef.current;
  }, []);

  const getFreshToken = useCallback(async (): Promise<string> => {
    return (await withTimeout(getTokenRef.current(), TOKEN_TIMEOUT_MS, 'getToken')) ?? '';
  }, []);

  const userRef = useRef(user);
  userRef.current = user;

  const mkClient = useCallback(async () => {
    const t = await getCachedToken();
    const u = userRef.current;
    return createApiClient(
      t,
      () => onDeactivatedRef.current(),
      () => onWorkspaceRevokedRef.current(),
      {
        email: u?.primaryEmailAddress?.emailAddress ?? '',
        firstName: u?.firstName ?? '',
        lastName: u?.lastName ?? '',
        photoUrl: u?.imageUrl ?? '',
      },
      getFreshToken,
      () => onAppMissingRef.current(),
    );
  }, [getCachedToken, getFreshToken]);

  return useMemo(
    () => ({
      getClient: mkClient,
      attachments: bindApiGroup(mkClient, attachmentsApi),
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
        createApp: async (data: { type: string; name: string }) => {
          const client = await mkClient();
          return workspaceApi(client).createApp(data);
        },
        adminListApps: async () => {
          const client = await mkClient();
          return workspaceApi(client).adminListApps();
        },
        hasTeam: async (appId: number) => {
          const client = await mkClient();
          return workspaceApi(client).hasTeam(appId);
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
        list: async (params?: { unread?: boolean; limit?: number; app_id?: number }) => {
          const client = await mkClient();
          return notificationsApi(client).list(params);
        },
        unreadCount: async (appId?: number) => {
          const client = await mkClient();
          return notificationsApi(client).unreadCount(appId);
        },
        markRead: async (id: number) => {
          const client = await mkClient();
          return notificationsApi(client).markRead(id);
        },
        markAllRead: async (appId?: number) => {
          const client = await mkClient();
          return notificationsApi(client).markAllRead(appId);
        },
        registerPushToken: async (token: string, platform: 'ios' | 'android') => {
          const client = await mkClient();
          return notificationsApi(client).registerPushToken(token, platform);
        },
        unregisterPushToken: async (token: string) => {
          const client = await mkClient();
          return notificationsApi(client).unregisterPushToken(token);
        },
      },
      dashboard: bindApiGroup(mkClient, dashboardApi),
      projects: bindApiGroup(mkClient, projectsApi),
      contracts: bindApiGroup(mkClient, contractsApi),
      routines: bindApiGroup(mkClient, routinesApi),
      otherReports: bindApiGroup(mkClient, otherReportsApi),
      businessReviews: bindApiGroup(mkClient, businessReviewsApi),
      taskPlanner: bindApiGroup(mkClient, taskPlannerApi),
      chat: bindApiGroup(mkClient, chatApi),
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
        check: async (appId: number, taskId: number, data: { check_status: 'approved' | 'rejected'; check_remarks?: string | null }) => {
          const client = await mkClient();
          return tasksApi(client).check(appId, taskId, data);
        },
        getWorkload: async (appId: number, userId: number) => {
          const client = await mkClient();
          return tasksApi(client).getWorkload(appId, userId);
        },
        startTimer: async (appId: number, taskId: number) => {
          const client = await mkClient();
          return tasksApi(client).startTimer(appId, taskId);
        },
        pauseTimer: async (appId: number, taskId: number) => {
          const client = await mkClient();
          return tasksApi(client).pauseTimer(appId, taskId);
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
        addComment: async (appId: number, taskId: number, body: string, attachments?: Record<string, unknown>[]) => {
          const client = await mkClient();
          return tasksApi(client).addComment(appId, taskId, body, attachments);
        },
        updateComment: async (appId: number, taskId: number, commentId: number, body: string) => {
          const client = await mkClient();
          return tasksApi(client).updateComment(appId, taskId, commentId, body);
        },
        deleteComment: async (appId: number, taskId: number, commentId: number) => {
          const client = await mkClient();
          return tasksApi(client).deleteComment(appId, taskId, commentId);
        },
        addDescriptionAttachment: async (appId: number, taskId: number, attachment: Record<string, unknown>) => {
          const client = await mkClient();
          return tasksApi(client).addDescriptionAttachment(appId, taskId, attachment);
        },
        removeDescriptionAttachment: async (appId: number, taskId: number, attachmentId: number) => {
          const client = await mkClient();
          return tasksApi(client).removeDescriptionAttachment(appId, taskId, attachmentId);
        },
        deleteChecklistItem: async (appId: number, taskId: number, itemId: number) => {
          const client = await mkClient();
          return tasksApi(client).deleteChecklistItem(appId, taskId, itemId);
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
        deleteTimeLog: async (appId: number, taskId: number, logId: number) => {
          const client = await mkClient();
          return tasksApi(client).deleteTimeLog(appId, taskId, logId);
        },
        timeLogReport: async (appId: number, params: { month: string; user_id?: number }) => {
          const client = await mkClient();
          return tasksApi(client).timeLogReport(appId, params);
        },
        detailsReport: async (appId: number, params?: Record<string, unknown>) => {
          const client = await mkClient();
          return tasksApi(client).detailsReport(appId, params);
        },
      },
      feed: {
        list: async (appId: number, params?: { limit?: number; offset?: number; type?: string; month?: string }) => {
          const client = await mkClient();
          return feedApi(client).list(appId, params);
        },
        create: async (appId: number, data: Record<string, unknown>) => {
          const client = await mkClient();
          return feedApi(client).create(appId, data);
        },
        update: async (appId: number, postId: number, data: string | {
          content: string;
          poll_question?: string;
          poll_options?: { id: number | null; option_text: string }[];
          poll_multi?: boolean;
        }) => {
          const client = await mkClient();
          return feedApi(client).update(appId, postId, data);
        },
        delete: async (appId: number, postId: number) => {
          const client = await mkClient();
          return feedApi(client).delete(appId, postId);
        },
        addReaction: async (appId: number, postId: number, emoji: string) => {
          const client = await mkClient();
          return feedApi(client).addReaction(appId, postId, emoji);
        },
        votePoll: async (appId: number, postId: number, optionIds: number[]) => {
          const client = await mkClient();
          return feedApi(client).votePoll(appId, postId, optionIds);
        },
        getComments: async (appId: number, postId: number) => {
          const client = await mkClient();
          return feedApi(client).getComments(appId, postId);
        },
        addComment: async (appId: number, postId: number, content: string) => {
          const client = await mkClient();
          return feedApi(client).addComment(appId, postId, content);
        },
        deleteComment: async (appId: number, postId: number, commentId: number) => {
          const client = await mkClient();
          return feedApi(client).deleteComment(appId, postId, commentId);
        },
        pin: async (appId: number, postId: number) => {
          const client = await mkClient();
          return feedApi(client).pin(appId, postId);
        },
        giveFeedback: async (appId: number, data: { to_user_ids: number[]; feedback_text: string; is_anonymous?: boolean; cycle_id?: number | null; type?: string; frame_style?: string | null }) => {
          const client = await mkClient();
          return feedApi(client).giveFeedback(appId, data);
        },
        getReceivedFeedback: async (appId: number) => {
          const client = await mkClient();
          return feedApi(client).getReceivedFeedback(appId);
        },
        getGivenFeedback: async (appId: number) => {
          const client = await mkClient();
          return feedApi(client).getGivenFeedback(appId);
        },
      },
      performance: bindApiGroup(mkClient, performanceApi),
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
      appreciations: bindApiGroup(mkClient, appreciationsApi),
      timeLogs: {
        getSummary: async (appId: number, params?: { period?: string; start_date?: string; end_date?: string }) => {
          const client = await mkClient();
          return timeLogsApi(client).getSummary(appId, params);
        },
      },
      members: {
        list: async (appId: number) => {
          const client = await mkClient();
          return membersApi(client).list(appId);
        },
        updateRole: async (appId: number, userId: number, role: string) => {
          const client = await mkClient();
          return membersApi(client).updateRole(appId, userId, role);
        },
        remove: async (appId: number, userId: number) => {
          const client = await mkClient();
          return membersApi(client).remove(appId, userId);
        },
      },
      appInvitations: {
        list: async (appId: number, status?: string) => {
          const client = await mkClient();
          return appInvitationsApi(client).list(appId, status);
        },
        send: async (appId: number, email: string, role: string) => {
          const client = await mkClient();
          return appInvitationsApi(client).send(appId, email, role);
        },
        revoke: async (appId: number, invId: number) => {
          const client = await mkClient();
          return appInvitationsApi(client).revoke(appId, invId);
        },
      },
      organisation: {
        get: async (appId: number) => {
          const client = await mkClient();
          return organisationApi(client).get(appId);
        },
        update: async (appId: number, data: Record<string, unknown>) => {
          const client = await mkClient();
          return organisationApi(client).update(appId, data);
        },
        uploadLogo: async (appId: number, uri: string, mimeType: string) => {
          const client = await mkClient();
          return organisationApi(client).uploadLogo(appId, uri, mimeType);
        },
        deleteLogo: async (appId: number) => {
          const client = await mkClient();
          return organisationApi(client).deleteLogo(appId);
        },
      },
      roles: {
        list: async (appId: number) => {
          const client = await mkClient();
          return rolesApi(client).list(appId);
        },
        get: async (appId: number, roleId: number) => {
          const client = await mkClient();
          return rolesApi(client).get(appId, roleId);
        },
        create: async (appId: number, data: Record<string, unknown>) => {
          const client = await mkClient();
          return rolesApi(client).create(appId, data);
        },
        listAreas: async (appId: number, roleId: number) => {
          const client = await mkClient();
          return rolesApi(client).listAreas(appId, roleId);
        },
        listAssignmentsForUser: async (appId: number, userId: number) => {
          const client = await mkClient();
          return rolesApi(client).listAssignmentsForUser(appId, userId);
        },
      },
      departments: {
        list: async (appId: number) => {
          const client = await mkClient();
          return departmentsApi(client).list(appId);
        },
      },
      policies: {
        list: async (appId: number, params?: Record<string, unknown>) => {
          const client = await mkClient();
          return policiesApi(client).list(appId, params);
        },
        get: async (appId: number, policyId: number) => {
          const client = await mkClient();
          return policiesApi(client).get(appId, policyId);
        },
        create: async (appId: number, data: Record<string, unknown>) => {
          const client = await mkClient();
          return policiesApi(client).create(appId, data);
        },
        update: async (appId: number, policyId: number, data: Record<string, unknown>) => {
          const client = await mkClient();
          return policiesApi(client).update(appId, policyId, data);
        },
        remove: async (appId: number, policyId: number) => {
          const client = await mkClient();
          return policiesApi(client).remove(appId, policyId);
        },
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
}
