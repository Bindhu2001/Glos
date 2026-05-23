import { AxiosInstance } from 'axios';

// ── Workspace ───────────────────────────────────────────────
export const workspaceApi = (client: AxiosInstance) => ({
  listApps: () => client.get('/apps'),
  getApp: (appId: number) => client.get(`/apps/${appId}`),
  getStats: (appId: number) => client.get(`/apps/${appId}/hr/stats`),
  getMembers: (appId: number) => client.get(`/apps/${appId}/members`),
});

// ── Me ──────────────────────────────────────────────────────
export const meApi = (client: AxiosInstance) => ({
  getProfile: () => client.get('/me'),
  updateProfile: (data: { first_name?: string; last_name?: string }) =>
    client.patch('/me', data),
});

// ── Invitations ──────────────────────────────────────────────
export const invitationsApi = (client: AxiosInstance) => ({
  listMine: () => client.get('/invitations/me'),
  accept: (token: string) => client.post(`/invitations/${token}/accept`),
  decline: (token: string) => client.post(`/invitations/${token}/decline`),
});

// ── Notifications ────────────────────────────────────────────
export const notificationsApi = (client: AxiosInstance) => ({
  list: (params?: { unread?: boolean; limit?: number }) =>
    client.get('/notifications', { params }),
  unreadCount: () => client.get('/notifications/unread-count'),
  markRead: (id: number) => client.patch(`/notifications/${id}/read`),
  markAllRead: () => client.post('/notifications/read-all'),
});

// ── Dashboard ────────────────────────────────────────────────
export const dashboardApi = (client: AxiosInstance) => ({
  getMyDashboard: (appId: number) =>
    client.get(`/apps/${appId}/hr/dashboard/me`),
  getTeamDashboard: (appId: number) =>
    client.get(`/apps/${appId}/hr/dashboard/team`),
});

// ── Tasks ────────────────────────────────────────────────────
export const tasksApi = (client: AxiosInstance) => ({
  list: (appId: number, params?: Record<string, unknown>) =>
    client.get(`/apps/${appId}/hr/tasks`, { params }),
  get: (appId: number, taskId: number) =>
    client.get(`/apps/${appId}/hr/tasks/${taskId}`),
  create: (appId: number, data: Record<string, unknown>) =>
    client.post(`/apps/${appId}/hr/tasks`, data),
  update: (appId: number, taskId: number, data: Record<string, unknown>) =>
    client.patch(`/apps/${appId}/hr/tasks/${taskId}`, data),
  delete: (appId: number, taskId: number) =>
    client.delete(`/apps/${appId}/hr/tasks/${taskId}`),
  // Timer
  startTimer: (appId: number, taskId: number) =>
    client.post(`/apps/${appId}/hr/tasks/${taskId}/timer`, { action: 'start' }),
  stopTimer: (appId: number, taskId: number) =>
    client.post(`/apps/${appId}/hr/tasks/${taskId}/timer`, { action: 'stop' }),
  // Timeline
  getTimeline: (appId: number, taskId: number) =>
    client.get(`/apps/${appId}/hr/tasks/${taskId}/timeline`),
  // Comments
  getComments: (appId: number, taskId: number) =>
    client.get(`/apps/${appId}/hr/tasks/${taskId}/comments`),
  addComment: (appId: number, taskId: number, body: string) =>
    client.post(`/apps/${appId}/hr/tasks/${taskId}/comments`, { body }),
  deleteComment: (appId: number, taskId: number, commentId: number) =>
    client.delete(`/apps/${appId}/hr/tasks/${taskId}/comments/${commentId}`),
  // Checklist
  getChecklist: (appId: number, taskId: number) =>
    client.get(`/apps/${appId}/hr/tasks/${taskId}/checklist`),
  addChecklistItem: (appId: number, taskId: number, label: string) =>
    client.post(`/apps/${appId}/hr/tasks/${taskId}/checklist`, { text: label }),
  toggleChecklistItem: (appId: number, taskId: number, itemId: number, checked: boolean) =>
    client.patch(`/apps/${appId}/hr/tasks/${taskId}/checklist/${itemId}`, { is_done: checked }),
  deleteChecklistItem: (appId: number, taskId: number, itemId: number) =>
    client.delete(`/apps/${appId}/hr/tasks/${taskId}/checklist/${itemId}`),
  // Time logs
  getTimeLogs: (appId: number, taskId: number) =>
    client.get(`/apps/${appId}/hr/tasks/${taskId}/time-logs`),
  addTimeLog: (appId: number, taskId: number, data: Record<string, unknown>) =>
    client.post(`/apps/${appId}/hr/tasks/${taskId}/time-logs`, data),
  deleteTimeLog: (appId: number, taskId: number, logId: number) =>
    client.delete(`/apps/${appId}/hr/tasks/${taskId}/time-logs/${logId}`),
});

// ── Feed ─────────────────────────────────────────────────────
export const feedApi = (client: AxiosInstance) => ({
  list: (appId: number) => client.get(`/apps/${appId}/hr/feed`),
  create: (appId: number, data: Record<string, unknown>) =>
    client.post(`/apps/${appId}/hr/feed`, data),
  delete: (appId: number, postId: number) =>
    client.delete(`/apps/${appId}/hr/feed/${postId}`),
  addReaction: (appId: number, postId: number, emoji: string) =>
    client.post(`/apps/${appId}/hr/feed/${postId}/react`, { emoji }),
  getComments: (appId: number, postId: number) =>
    client.get(`/apps/${appId}/hr/feed/${postId}/comments`),
  addComment: (appId: number, postId: number, content: string) =>
    client.post(`/apps/${appId}/hr/feed/${postId}/comments`, { content }),
  deleteComment: (appId: number, postId: number, commentId: number) =>
    client.delete(`/apps/${appId}/hr/feed/${postId}/comments/${commentId}`),
});

// ── Performance ──────────────────────────────────────────────
export const performanceApi = (client: AxiosInstance) => ({
  getCycles: (appId: number) =>
    client.get(`/apps/${appId}/hr/performance-review-cycles`),
  getGoals: (appId: number, params?: Record<string, unknown>) =>
    client.get(`/apps/${appId}/hr/goals`, { params }),
  createGoal: (appId: number, data: Record<string, unknown>) =>
    client.post(`/apps/${appId}/hr/goals`, data),
  submitGoalForApproval: (appId: number, goalId: number) =>
    client.post(`/apps/${appId}/hr/goals/${goalId}/submit-for-approval`),
  getAppraisals: (appId: number, params?: Record<string, unknown>) =>
    client.get(`/apps/${appId}/hr/appraisals`, { params }),
  listMyReviews: (appId: number) =>
    client.get(`/apps/${appId}/hr/performance-reviews`),
  listPendingForMe: (appId: number) =>
    client.get(`/apps/${appId}/hr/performance-reviews/pending-for-me`),
});

// ── Employees ────────────────────────────────────────────────
export const employeesApi = (client: AxiosInstance) => ({
  list: (appId: number) => client.get(`/apps/${appId}/hr/employees`),
  get: (appId: number, employeeId: number) =>
    client.get(`/apps/${appId}/hr/employees/${employeeId}`),
  getOrgChart: (appId: number) => client.get(`/apps/${appId}/hr/org-chart`),
});

// ── Appreciations ────────────────────────────────────────────
export const appreciationsApi = (client: AxiosInstance) => ({
  give: (appId: number, data: { to_user_id: number; message: string; badge?: string }) =>
    client.post(`/apps/${appId}/hr/appreciations`, data),
  listReceived: (appId: number) =>
    client.get(`/apps/${appId}/hr/appreciations`),
});

// ── Time Logs ────────────────────────────────────────────────
export const timeLogsApi = (client: AxiosInstance) => ({
  getSummary: (appId: number, params?: { period?: string; start_date?: string; end_date?: string }) =>
    client.get(`/apps/${appId}/hr/time-logs/summary`, { params }),
});
