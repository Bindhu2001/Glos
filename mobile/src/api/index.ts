import { AxiosInstance } from 'axios';

// ── Workspace ───────────────────────────────────────────────
export const workspaceApi = (client: AxiosInstance) => ({
  listApps: () => client.get('/apps'),
  getApp: (appId: number) => client.get(`/apps/${appId}`),
  getStats: (appId: number) => client.get(`/apps/${appId}/hr/stats`),
  getMembers: (appId: number) => client.get(`/apps/${appId}/members`),
  createApp: (data: { type: string; name: string }) => client.post('/apps', data),
  adminListApps: () => client.get('/admin/apps'),
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
  pauseTimer: (appId: number, taskId: number) =>
    client.post(`/apps/${appId}/hr/tasks/${taskId}/timer`, { action: 'pause' }),
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
  // Reports
  timeLogReport: (appId: number, params: { month: string; user_id?: number }) =>
    client.get(`/apps/${appId}/hr/tasks/time-log-report`, { params }),
  detailsReport: (appId: number, params?: Record<string, unknown>) =>
    client.get(`/apps/${appId}/hr/tasks/details-report`, { params }),
});

// ── Feed ─────────────────────────────────────────────────────
export const feedApi = (client: AxiosInstance) => ({
  list: (appId: number) => client.get(`/apps/${appId}/hr/feed`),
  create: (appId: number, data: Record<string, unknown>) =>
    client.post(`/apps/${appId}/hr/feed`, data),
  delete: (appId: number, postId: number) =>
    client.delete(`/apps/${appId}/hr/feed/${postId}`),
  pin: (appId: number, postId: number) =>
    client.patch(`/apps/${appId}/hr/feed/${postId}/pin`),
  addReaction: (appId: number, postId: number, emoji: string) =>
    client.post(`/apps/${appId}/hr/feed/${postId}/react`, { emoji }),
  getComments: (appId: number, postId: number) =>
    client.get(`/apps/${appId}/hr/feed/${postId}/comments`),
  addComment: (appId: number, postId: number, content: string) =>
    client.post(`/apps/${appId}/hr/feed/${postId}/comments`, { content }),
  deleteComment: (appId: number, postId: number, commentId: number) =>
    client.delete(`/apps/${appId}/hr/feed/${postId}/comments/${commentId}`),
  // Feedback
  giveFeedback: (appId: number, data: { to_user_id: number; feedback_text: string; is_anonymous?: boolean; cycle_id?: number | null; type?: string }) =>
    client.post(`/apps/${appId}/hr/feedback`, data),
  getReceivedFeedback: (appId: number) =>
    client.get(`/apps/${appId}/hr/feedback/received`),
  getGivenFeedback: (appId: number) =>
    client.get(`/apps/${appId}/hr/feedback/given`),
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
  approveGoal: (appId: number, goalId: number) =>
    client.patch(`/apps/${appId}/hr/goals/${goalId}/approve`),
  rejectGoal: (appId: number, goalId: number, rejection_reason: string) =>
    client.patch(`/apps/${appId}/hr/goals/${goalId}/reject`, { rejection_reason }),
  listTeamGoals: (appId: number) =>
    client.get(`/apps/${appId}/hr/goals/team`),
  getAppraisals: (appId: number, params?: Record<string, unknown>) =>
    client.get(`/apps/${appId}/hr/appraisals`, { params }),
  listMyReviews: (appId: number) =>
    client.get(`/apps/${appId}/hr/performance-reviews`),
  listPendingForMe: (appId: number) =>
    client.get(`/apps/${appId}/hr/performance-reviews/pending-for-me`),
  listTeamReviews: (appId: number) =>
    client.get(`/apps/${appId}/hr/performance-reviews/team`),
  listAllReviews: (appId: number) =>
    client.get(`/apps/${appId}/hr/performance-reviews/all`),
  submitReview: (appId: number, reviewId: number, data: Record<string, unknown>) =>
    client.patch(`/apps/${appId}/hr/performance-reviews/${reviewId}`, data),
  getReview: (appId: number, reviewId: number) =>
    client.get(`/apps/${appId}/hr/performance-reviews/${reviewId}`),
  getReviewRatings: (appId: number, reviewId: number) =>
    client.get(`/apps/${appId}/hr/performance-reviews/${reviewId}/ratings`),
  getReviewAnalytics: (appId: number, reviewId: number) =>
    client.get(`/apps/${appId}/hr/performance-reviews/${reviewId}/analytics`),
  submitSelfRating: (appId: number, reviewId: number, data: Record<string, unknown>) =>
    client.post(`/apps/${appId}/hr/performance-reviews/${reviewId}/submit-self-rating`, data),
  submitManagerRating: (appId: number, reviewId: number, data: Record<string, unknown>) =>
    client.post(`/apps/${appId}/hr/performance-reviews/${reviewId}/submit-manager-rating`, data),
  submitFinalRating: (appId: number, reviewId: number, data: Record<string, unknown>) =>
    client.post(`/apps/${appId}/hr/performance-reviews/${reviewId}/submit-final-rating`, data),
  getAppraisal: (appId: number, appraisalId: number) =>
    client.get(`/apps/${appId}/hr/appraisals/${appraisalId}`),
  submitEmployeeResponse: (appId: number, appraisalId: number, data: Record<string, unknown>) =>
    client.post(`/apps/${appId}/hr/appraisals/${appraisalId}/employee-response`, data),
  submitManagerResponse: (appId: number, appraisalId: number, data: Record<string, unknown>) =>
    client.post(`/apps/${appId}/hr/appraisals/${appraisalId}/manager-response`, data),
  submitFinalDecision: (appId: number, appraisalId: number, data: Record<string, unknown>) =>
    client.post(`/apps/${appId}/hr/appraisals/${appraisalId}/final-decision`, data),
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
  getForUser: (appId: number, userId: number) =>
    client.get(`/apps/${appId}/hr/appreciations/for/${userId}`),
  getByCycle: (appId: number, cycleId: number) =>
    client.get(`/apps/${appId}/hr/appreciations/by-cycle/${cycleId}`),
});

// ── Time Logs ────────────────────────────────────────────────
export const timeLogsApi = (client: AxiosInstance) => ({
  getSummary: (appId: number, params?: { period?: string; start_date?: string; end_date?: string }) =>
    client.get(`/apps/${appId}/hr/time-logs/summary`, { params }),
});

// ── Departments ──────────────────────────────────────────────
export const departmentsApi = (client: AxiosInstance) => ({
  list: (appId: number) => client.get(`/apps/${appId}/hr/departments`),
});

// ── Members (platform-level) ─────────────────────────────────
export const membersApi = (client: AxiosInstance) => ({
  list: (appId: number) => client.get(`/apps/${appId}/members`),
  updateRole: (appId: number, userId: number, role: string) =>
    client.patch(`/apps/${appId}/members/${userId}`, { role }),
  remove: (appId: number, userId: number) =>
    client.delete(`/apps/${appId}/members/${userId}`),
});

// ── App Invitations ──────────────────────────────────────────
export const appInvitationsApi = (client: AxiosInstance) => ({
  list: (appId: number, status?: string) =>
    client.get(`/apps/${appId}/invitations`, { params: status ? { status } : undefined }),
  send: (appId: number, email: string, role: string) =>
    client.post(`/apps/${appId}/invitations`, { email, role }),
  revoke: (appId: number, invId: number) =>
    client.post(`/apps/${appId}/invitations/${invId}/revoke`),
});

// ── Organisation ─────────────────────────────────────────────
export const organisationApi = (client: AxiosInstance) => ({
  get: (appId: number) => client.get(`/apps/${appId}/hr/organisation`),
  update: (appId: number, data: Record<string, unknown>) =>
    client.put(`/apps/${appId}/hr/organisation`, data),
});

// ── Roles ────────────────────────────────────────────────────
export const rolesApi = (client: AxiosInstance) => ({
  list: (appId: number) => client.get(`/apps/${appId}/hr/roles`),
  get: (appId: number, roleId: number) => client.get(`/apps/${appId}/hr/roles/${roleId}`),
  create: (appId: number, data: Record<string, unknown>) =>
    client.post(`/apps/${appId}/hr/roles`, data),
  listAreas: (appId: number, roleId: number) =>
    client.get(`/apps/${appId}/hr/roles/${roleId}/areas`),
});

// ── Policies ─────────────────────────────────────────────────
export const policiesApi = (client: AxiosInstance) => ({
  list: (appId: number) => client.get(`/apps/${appId}/hr/policies`),
  get: (appId: number, policyId: number) => client.get(`/apps/${appId}/hr/policies/${policyId}`),
  create: (appId: number, data: Record<string, unknown>) =>
    client.post(`/apps/${appId}/hr/policies`, data),
  update: (appId: number, policyId: number, data: Record<string, unknown>) =>
    client.patch(`/apps/${appId}/hr/policies/${policyId}`, data),
  remove: (appId: number, policyId: number) =>
    client.delete(`/apps/${appId}/hr/policies/${policyId}`),
});
