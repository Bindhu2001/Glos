import { AxiosInstance } from 'axios';

// ── Workspace ───────────────────────────────────────────────
export const workspaceApi = (client: AxiosInstance) => ({
  listApps: () => client.get('/apps'),
  getApp: (appId: number) => client.get(`/apps/${appId}`),
  getStats: (appId: number) => client.get(`/apps/${appId}/hr/stats`),
  getMembers: (appId: number) => client.get(`/apps/${appId}/members`),
  createApp: (data: { type: string; name: string }) => client.post('/apps', data),
  adminListApps: () => client.get('/admin/apps'),
  hasTeam: (appId: number) => client.get(`/apps/${appId}/hr/org-chart/has-team`),
});

// ── Attachments ─────────────────────────────────────────────
// Shared presign endpoint used by chat/task_comment/task_description/feed —
// see src/utils/attachments.ts for the full upload flow.
export const attachmentsApi = (client: AxiosInstance) => ({
  presign: (appId: number, data: { file_name: string; content_type: string; file_size: number; context: string }) =>
    client.post(`/apps/${appId}/attachments/presign`, data),
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
  // app_id scopes both endpoints to the workspace the user is currently in —
  // without it the backend returns notifications across every app the user
  // belongs to, which is what web's cross-app NotificationBell wants but not
  // mobile's single-workspace-at-a-time view.
  list: (params?: { unread?: boolean; limit?: number; app_id?: number }) =>
    client.get('/notifications', { params }),
  unreadCount: (appId?: number) =>
    client.get('/notifications/unread-count', { params: appId != null ? { app_id: appId } : undefined }),
  markRead: (id: number) => client.patch(`/notifications/${id}/read`),
  markAllRead: (appId?: number) =>
    client.post('/notifications/read-all', appId != null ? { app_id: appId } : undefined),
});

// ── Dashboard ────────────────────────────────────────────────
export const dashboardApi = (client: AxiosInstance) => ({
  getMyDashboard: (appId: number) =>
    client.get(`/apps/${appId}/hr/dashboard/me`),
  getTeamDashboard: (appId: number) =>
    client.get(`/apps/${appId}/hr/dashboard/team`),
  getManagerDashboard: (appId: number, scope: 'direct' | 'all' | 'admin' = 'direct', month?: string, viewAs?: number) =>
    client.get(`/apps/${appId}/hr/dashboard/manager`, { params: { scope, ...(month ? { month } : {}), ...(viewAs ? { view_as: viewAs } : {}) } }),
  getManagerTaskStats: (appId: number, params?: Record<string, unknown>) =>
    client.get(`/apps/${appId}/hr/dashboard/manager-task-stats`, { params }),
  getManagerActivityByMember: (appId: number, params?: Record<string, unknown>) =>
    client.get(`/apps/${appId}/hr/dashboard/manager-activity-by-member`, { params }),
  getTeamActivityByMember: (appId: number, params?: Record<string, unknown>) =>
    client.get(`/apps/${appId}/hr/dashboard/team-activity-by-member`, { params }),
  isTopHierarchy: (appId: number) =>
    client.get(`/apps/${appId}/hr/dashboard/is-top-hierarchy`),
  getLeaderboard: (appId: number) =>
    client.get(`/apps/${appId}/hr/dashboard/leaderboard`),
  getMonthHours: (appId: number, month: string) =>
    client.get(`/apps/${appId}/hr/dashboard/month-hours`, { params: { month } }),
  getUpcomingEvents: (appId: number) =>
    client.get(`/apps/${appId}/hr/members/upcoming-events`),
  sendWish: (appId: number, userId: number, type: 'birthday' | 'work_anniversary') =>
    client.post(`/apps/${appId}/hr/members/${userId}/wish`, { type }),
});

// ── Projects ─────────────────────────────────────────────────
export const projectsApi = (client: AxiosInstance) => ({
  list: (appId: number, params?: Record<string, unknown>) =>
    client.get(`/apps/${appId}/hr/projects`, { params }),
  listSimple: (appId: number) => client.get(`/apps/${appId}/hr/projects/simple`),
  dashboard: (appId: number) => client.get(`/apps/${appId}/hr/projects/dashboard`),
  get: (appId: number, id: number) => client.get(`/apps/${appId}/hr/projects/${id}`),
  create: (appId: number, data: Record<string, unknown>) =>
    client.post(`/apps/${appId}/hr/projects`, data),
  update: (appId: number, id: number, data: Record<string, unknown>) =>
    client.patch(`/apps/${appId}/hr/projects/${id}`, data),
  delete: (appId: number, id: number) => client.delete(`/apps/${appId}/hr/projects/${id}`),
  listMilestones: (appId: number, id: number) =>
    client.get(`/apps/${appId}/hr/projects/${id}/milestones`),
  createMilestone: (appId: number, id: number, data: Record<string, unknown>) =>
    client.post(`/apps/${appId}/hr/projects/${id}/milestones`, data),
  updateMilestone: (appId: number, id: number, mid: number, data: Record<string, unknown>) =>
    client.patch(`/apps/${appId}/hr/projects/${id}/milestones/${mid}`, data),
  deleteMilestone: (appId: number, id: number, mid: number) =>
    client.delete(`/apps/${appId}/hr/projects/${id}/milestones/${mid}`),
  financialsSummary: (appId: number, params?: Record<string, unknown>) =>
    client.get(`/apps/${appId}/hr/projects/financials-summary`, { params }),
  getFinancials: (appId: number, id: number) =>
    client.get(`/apps/${appId}/hr/projects/${id}/financials`),
  listCosts: (appId: number, id: number) => client.get(`/apps/${appId}/hr/projects/${id}/costs`),
  createCost: (appId: number, id: number, data: Record<string, unknown>) =>
    client.post(`/apps/${appId}/hr/projects/${id}/costs`, data),
  deleteCost: (appId: number, id: number, cid: number) =>
    client.delete(`/apps/${appId}/hr/projects/${id}/costs/${cid}`),
  requestJoin: (appId: number, id: number) =>
    client.post(`/apps/${appId}/hr/projects/${id}/join-requests`),
  acceptJoin: (appId: number, id: number, reqId: number) =>
    client.post(`/apps/${appId}/hr/projects/${id}/join-requests/${reqId}/accept`),
  rejectJoin: (appId: number, id: number, reqId: number) =>
    client.post(`/apps/${appId}/hr/projects/${id}/join-requests/${reqId}/reject`),
  listComments: (appId: number, id: number) => client.get(`/apps/${appId}/hr/projects/${id}/comments`),
  createComment: (appId: number, id: number, body: string) =>
    client.post(`/apps/${appId}/hr/projects/${id}/comments`, { body }),
  deleteComment: (appId: number, id: number, cid: number) =>
    client.delete(`/apps/${appId}/hr/projects/${id}/comments/${cid}`),
});

// ── Contracts / Agreements ───────────────────────────────────
export const contractsApi = (client: AxiosInstance) => ({
  listAgreements: (appId: number, params?: Record<string, unknown>) =>
    client.get(`/apps/${appId}/hr/contracts/agreements`, { params }),
  getAgreement: (appId: number, id: number) =>
    client.get(`/apps/${appId}/hr/contracts/agreements/${id}`),
  createAgreement: (appId: number, data: Record<string, unknown>) =>
    client.post(`/apps/${appId}/hr/contracts/agreements`, data),
  updateAgreement: (appId: number, id: number, data: Record<string, unknown>) =>
    client.patch(`/apps/${appId}/hr/contracts/agreements/${id}`, data),
  deleteAgreement: (appId: number, id: number) =>
    client.delete(`/apps/${appId}/hr/contracts/agreements/${id}`),
  addAgreementService: (appId: number, id: number, data: Record<string, unknown>) =>
    client.post(`/apps/${appId}/hr/contracts/agreements/${id}/services`, data),
  updateAgreementService: (appId: number, id: number, casId: number, data: Record<string, unknown>) =>
    client.patch(`/apps/${appId}/hr/contracts/agreements/${id}/services/${casId}`, data),
  deleteAgreementService: (appId: number, id: number, casId: number) =>
    client.delete(`/apps/${appId}/hr/contracts/agreements/${id}/services/${casId}`),
  listServices: (appId: number, params?: Record<string, unknown>) =>
    client.get(`/apps/${appId}/hr/contracts/services`, { params }),
  getService: (appId: number, id: number) =>
    client.get(`/apps/${appId}/hr/contracts/services/${id}`),
  createService: (appId: number, data: Record<string, unknown>) =>
    client.post(`/apps/${appId}/hr/contracts/services`, data),
  updateService: (appId: number, id: number, data: Record<string, unknown>) =>
    client.patch(`/apps/${appId}/hr/contracts/services/${id}`, data),
  deleteService: (appId: number, id: number) =>
    client.delete(`/apps/${appId}/hr/contracts/services/${id}`),
  listClients: (appId: number, params?: Record<string, unknown>) =>
    client.get(`/apps/${appId}/hr/contracts/clients`, { params }),
  getClient: (appId: number, id: number) =>
    client.get(`/apps/${appId}/hr/contracts/clients/${id}`),
  createClient: (appId: number, data: Record<string, unknown>) =>
    client.post(`/apps/${appId}/hr/contracts/clients`, data),
  updateClient: (appId: number, id: number, data: Record<string, unknown>) =>
    client.patch(`/apps/${appId}/hr/contracts/clients/${id}`, data),
  deleteClient: (appId: number, id: number) =>
    client.delete(`/apps/${appId}/hr/contracts/clients/${id}`),
  getReports: (appId: number, params?: Record<string, unknown>) =>
    client.get(`/apps/${appId}/hr/contracts/reports`, { params }),
  getComplianceBoard: (appId: number, params: { month: number; year: number; client_id?: number }) =>
    client.get(`/apps/${appId}/hr/contracts/compliance`, { params }),
  getComplianceLogs: (appId: number, agreementId: number, params?: Record<string, unknown>) =>
    client.get(`/apps/${appId}/hr/contracts/compliance/logs/${agreementId}`, { params }),
  submitComplianceTask: (appId: number, data: Record<string, unknown>) =>
    client.post(`/apps/${appId}/hr/contracts/compliance/task`, data),
  checkContractTask: (appId: number, taskId: number, data: { check_status: 'approved' | 'rejected'; check_remarks?: string | null }) =>
    client.post(`/apps/${appId}/hr/contracts/tasks/${taskId}/check`, data),
});

// ── Routines ─────────────────────────────────────────────────
export const routinesApi = (client: AxiosInstance) => ({
  getAvailable: (appId: number, assigneeId?: number) =>
    client.get(`/apps/${appId}/hr/routines/available`, { params: assigneeId ? { assigneeId } : undefined }),
  getDashboard: (appId: number, params?: { period?: string; mode?: 'month'; month?: string; userId?: number }) =>
    client.get(`/apps/${appId}/hr/routines/dashboard`, { params }),
  getTeamDashboard: (appId: number, params?: { period?: string; mode?: 'month'; month?: string; scope?: 'direct' | 'all' | 'admin'; view_as?: number }) =>
    client.get(`/apps/${appId}/hr/routines/team-dashboard`, { params }),
});

// ── Other Reports (Areas & Routines) ──────────────────────────
export const otherReportsApi = (client: AxiosInstance) => ({
  getAreaReport: (appId: number, params: { month: string; user_id?: number; area_ids?: string }) =>
    client.get(`/apps/${appId}/hr/other-reports/areas`, { params }),
  getRoutineReport: (appId: number, params: { month: string; user_id?: number; routine_ids?: string }) =>
    client.get(`/apps/${appId}/hr/other-reports/routines`, { params }),
});

// ── Chat ─────────────────────────────────────────────────────
export const chatApi = (client: AxiosInstance) => ({
  listConversations: (appId: number) => client.get(`/apps/${appId}/chat`),
  createConversation: (appId: number, data: { type: 'direct' | 'group' | 'note'; name?: string; member_ids?: number[] }) =>
    client.post(`/apps/${appId}/chat`, data),
  editGroup: (appId: number, convId: number, data: { name?: string; add_member_ids?: number[]; remove_member_ids?: number[] }) =>
    client.patch(`/apps/${appId}/chat/${convId}`, data),
  deleteGroup: (appId: number, convId: number) => client.delete(`/apps/${appId}/chat/${convId}`),
  pinMessage: (appId: number, convId: number, messageId: number) =>
    client.post(`/apps/${appId}/chat/${convId}/pin`, { message_id: messageId }),
  getMessages: (appId: number, convId: number, params?: { limit?: number; before?: number; after?: number }) =>
    client.get(`/apps/${appId}/chat/${convId}/messages`, { params }),
  // HTTP-first send path — the primary way messages leave the device now (see
  // ChatThreadScreen's send()). The socket emit is a best-effort speed
  // optimization on top of this, not a requirement for delivery: unlike a
  // dropped socket emit, a failed HTTP POST is visible to axios and can be
  // retried from the outbox.
  sendMessage: (appId: number, convId: number, data: { body: string; reply_to_id: number | null; attachments: Record<string, unknown>[]; _tempId: string }) =>
    client.post(`/apps/${appId}/chat/${convId}/messages`, data),
  deleteMessage: (appId: number, msgId: number) => client.delete(`/apps/${appId}/chat/messages/${msgId}`),
  editMessage: (appId: number, msgId: number, body: string) =>
    client.patch(`/apps/${appId}/chat/messages/${msgId}`, { body }),
  reactToMessage: (appId: number, msgId: number, emoji: string) =>
    client.post(`/apps/${appId}/chat/messages/${msgId}/react`, { emoji }),
  toggleGroupAdmin: (appId: number, convId: number, userId: number) =>
    client.post(`/apps/${appId}/chat/${convId}/members/${userId}/admin`, {}),
});

// ── Business Reviews ─────────────────────────────────────────
export const businessReviewsApi = (client: AxiosInstance) => ({
  list: (appId: number, params?: Record<string, unknown>) =>
    client.get(`/apps/${appId}/hr/business-reviews`, { params }),
  get: (appId: number, id: number) => client.get(`/apps/${appId}/hr/business-reviews/${id}`),
  create: (appId: number, data: Record<string, unknown>) =>
    client.post(`/apps/${appId}/hr/business-reviews`, data),
  update: (appId: number, id: number, data: Record<string, unknown>) =>
    client.patch(`/apps/${appId}/hr/business-reviews/${id}`, data),
  delete: (appId: number, id: number) => client.delete(`/apps/${appId}/hr/business-reviews/${id}`),
  close: (appId: number, id: number, data?: Record<string, unknown>) =>
    client.post(`/apps/${appId}/hr/business-reviews/${id}/close`, data ?? {}),
  dashboard: (appId: number, params?: Record<string, unknown>) =>
    client.get(`/apps/${appId}/hr/business-reviews/dashboard`, { params }),
  scopeOptions: (appId: number) => client.get(`/apps/${appId}/hr/business-reviews/scope-options`),
  addActionItem: (appId: number, id: number, data: Record<string, unknown>) =>
    client.post(`/apps/${appId}/hr/business-reviews/${id}/action-items`, data),
  updateActionItem: (appId: number, id: number, aiId: number, data: Record<string, unknown>) =>
    client.patch(`/apps/${appId}/hr/business-reviews/${id}/action-items/${aiId}`, data),
  deleteActionItem: (appId: number, id: number, aiId: number) =>
    client.delete(`/apps/${appId}/hr/business-reviews/${id}/action-items/${aiId}`),
  addMemberComment: (appId: number, id: number, forUserId: number | string, body: string) =>
    client.post(`/apps/${appId}/hr/business-reviews/${id}/member-comments`, { for_user_id: forUserId, body }),
  deleteMemberComment: (appId: number, id: number, commentId: number) =>
    client.delete(`/apps/${appId}/hr/business-reviews/${id}/member-comments/${commentId}`),
  saveTaskStatuses: (appId: number, id: number, taskStatuses: { task_id: number; status: string }[]) =>
    client.put(`/apps/${appId}/hr/business-reviews/${id}/task-statuses`, { taskStatuses }),
  upsertAssessment: (appId: number, id: number, forUserId: number | string, data: Record<string, unknown>) =>
    client.put(`/apps/${appId}/hr/business-reviews/${id}/assessments/${forUserId}`, data),
});

// ── Task Planner (daily planned-time blocks) ──────────────────
export const taskPlannerApi = (client: AxiosInstance) => ({
  getBlocks: (appId: number, params: { user_id?: number | string; date?: string }) =>
    client.get(`/apps/${appId}/hr/task-planner/blocks`, { params }),
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
  getWorkload: (appId: number, userId: number) =>
    client.get(`/apps/${appId}/hr/tasks/workload/${userId}`),
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
  addComment: (appId: number, taskId: number, body: string, attachments?: Record<string, unknown>[]) =>
    client.post(`/apps/${appId}/hr/tasks/${taskId}/comments`, { body, ...(attachments?.length ? { attachments } : {}) }),
  updateComment: (appId: number, taskId: number, commentId: number, body: string) =>
    client.patch(`/apps/${appId}/hr/tasks/${taskId}/comments/${commentId}`, { body }),
  deleteComment: (appId: number, taskId: number, commentId: number) =>
    client.delete(`/apps/${appId}/hr/tasks/${taskId}/comments/${commentId}`),
  // Description attachments
  addDescriptionAttachment: (appId: number, taskId: number, attachment: Record<string, unknown>) =>
    client.post(`/apps/${appId}/hr/tasks/${taskId}/description-attachments`, attachment),
  removeDescriptionAttachment: (appId: number, taskId: number, attachmentId: number) =>
    client.delete(`/apps/${appId}/hr/tasks/${taskId}/description-attachments/${attachmentId}`),
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
  // Author-only, and the server rejects this after 15 minutes from creation.
  update: (appId: number, postId: number, content: string) =>
    client.patch(`/apps/${appId}/hr/feed/${postId}`, { content }),
  delete: (appId: number, postId: number) =>
    client.delete(`/apps/${appId}/hr/feed/${postId}`),
  pin: (appId: number, postId: number) =>
    client.patch(`/apps/${appId}/hr/feed/${postId}/pin`),
  addReaction: (appId: number, postId: number, emoji: string) =>
    client.post(`/apps/${appId}/hr/feed/${postId}/react`, { emoji }),
  votePoll: (appId: number, postId: number, optionIds: number[]) =>
    client.post(`/apps/${appId}/hr/feed/${postId}/vote`, { option_ids: optionIds }),
  getComments: (appId: number, postId: number) =>
    client.get(`/apps/${appId}/hr/feed/${postId}/comments`),
  addComment: (appId: number, postId: number, content: string) =>
    client.post(`/apps/${appId}/hr/feed/${postId}/comments`, { content }),
  deleteComment: (appId: number, postId: number, commentId: number) =>
    client.delete(`/apps/${appId}/hr/feed/${postId}/comments/${commentId}`),
  // Feedback
  giveFeedback: (appId: number, data: { to_user_ids: number[]; feedback_text: string; is_anonymous?: boolean; cycle_id?: number | null; type?: string }) =>
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
  getWorkflowStatus: (appId: number, params?: Record<string, unknown>) =>
    client.get(`/apps/${appId}/hr/workflow-status`, { params }),
  getGoals: (appId: number, params?: Record<string, unknown>) =>
    client.get(`/apps/${appId}/hr/goals`, { params }),
  createGoal: (appId: number, data: Record<string, unknown>) =>
    client.post(`/apps/${appId}/hr/goals`, data),
  updateGoal: (appId: number, goalId: number, data: Record<string, unknown>) =>
    client.patch(`/apps/${appId}/hr/goals/${goalId}`, data),
  toggleGoalActive: (appId: number, goalId: number) =>
    client.patch(`/apps/${appId}/hr/goals/${goalId}/toggle-active`),
  submitGoalForApproval: (appId: number, goalId: number) =>
    client.post(`/apps/${appId}/hr/goals/${goalId}/submit-for-approval`),
  approveGoal: (appId: number, goalId: number) =>
    client.patch(`/apps/${appId}/hr/goals/${goalId}/approve`),
  rejectGoal: (appId: number, goalId: number, rejection_reason: string) =>
    client.patch(`/apps/${appId}/hr/goals/${goalId}/reject`, { rejection_reason }),
  approveGoalsBatch: (appId: number, goal_ids: number[]) =>
    client.patch(`/apps/${appId}/hr/goals/approve-batch`, { goal_ids }),
  rejectGoalsBatch: (appId: number, goal_ids: number[], rejection_reason: string) =>
    client.patch(`/apps/${appId}/hr/goals/reject-batch`, { goal_ids, rejection_reason }),
  listTeamGoals: (appId: number) =>
    client.get(`/apps/${appId}/hr/goals/team`),
  getAppraisals: (appId: number, params?: Record<string, unknown>) =>
    client.get(`/apps/${appId}/hr/appraisals`, { params }),
  createAppraisal: (appId: number, data: Record<string, unknown>) =>
    client.post(`/apps/${appId}/hr/appraisals`, data),
  listMyReviews: (appId: number) =>
    client.get(`/apps/${appId}/hr/performance-reviews`),
  listPendingForMe: (appId: number) =>
    client.get(`/apps/${appId}/hr/performance-reviews/pending-for-me`),
  listTeamReviews: (appId: number, params?: Record<string, unknown>) =>
    client.get(`/apps/${appId}/hr/performance-reviews/team`, { params }),
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
  saveEmployeeResponseDraft: (appId: number, appraisalId: number, data: Record<string, unknown>) =>
    client.post(`/apps/${appId}/hr/appraisals/${appraisalId}/employee-response/save-draft`, data),
  submitManagerResponse: (appId: number, appraisalId: number, data: Record<string, unknown>) =>
    client.post(`/apps/${appId}/hr/appraisals/${appraisalId}/manager-response`, data),
  saveManagerResponseDraft: (appId: number, appraisalId: number, data: Record<string, unknown>) =>
    client.post(`/apps/${appId}/hr/appraisals/${appraisalId}/manager-response/save-draft`, data),
  managerReject: (appId: number, appraisalId: number, data: { rejection_reason: string }) =>
    client.post(`/apps/${appId}/hr/appraisals/${appraisalId}/manager-reject`, data),
  submitFinalDecision: (appId: number, appraisalId: number, data: Record<string, unknown>) =>
    client.post(`/apps/${appId}/hr/appraisals/${appraisalId}/final-decision`, data),
  saveFinalDecisionDraft: (appId: number, appraisalId: number, data: Record<string, unknown>) =>
    client.post(`/apps/${appId}/hr/appraisals/${appraisalId}/final-decision/save-draft`, data),
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
  give: (appId: number, data: { to_user_ids: number[]; message: string; badge?: string }) =>
    client.post(`/apps/${appId}/hr/appreciations`, data),
  listReceived: (appId: number) =>
    client.get(`/apps/${appId}/hr/appreciations`),
  getForUser: (appId: number, userId: number) =>
    client.get(`/apps/${appId}/hr/appreciations/for/${userId}`),
  getByCycle: (appId: number, cycleId: number) =>
    client.get(`/apps/${appId}/hr/appreciations/by-cycle/${cycleId}`),
  getTeamStats: (appId: number, params: { scope: 'direct' | 'all' | 'admin' | 'team'; month?: string; view_as?: number }) =>
    client.get(`/apps/${appId}/hr/appreciations/team-stats`, { params }),
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
  uploadLogo: (appId: number, uri: string, mimeType: string) => {
    const fd = new FormData();
    fd.append('logo', { uri, name: 'logo.jpg', type: mimeType } as any);
    return client.post(`/apps/${appId}/hr/organisation/logo`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  deleteLogo: (appId: number) =>
    client.delete(`/apps/${appId}/hr/organisation/logo`),
});

// ── Roles ────────────────────────────────────────────────────
export const rolesApi = (client: AxiosInstance) => ({
  list: (appId: number) => client.get(`/apps/${appId}/hr/roles`),
  get: (appId: number, roleId: number) => client.get(`/apps/${appId}/hr/roles/${roleId}`),
  create: (appId: number, data: Record<string, unknown>) =>
    client.post(`/apps/${appId}/hr/roles`, data),
  listAreas: (appId: number, roleId: number) =>
    client.get(`/apps/${appId}/hr/roles/${roleId}/areas`),
  listAssignmentsForUser: (appId: number, userId: number) =>
    client.get(`/apps/${appId}/hr/role-assignments/by-user/${userId}`),
});

// ── Policies ─────────────────────────────────────────────────
export const policiesApi = (client: AxiosInstance) => ({
  list: (appId: number, params?: Record<string, unknown>) => client.get(`/apps/${appId}/hr/policies`, { params }),
  get: (appId: number, policyId: number) => client.get(`/apps/${appId}/hr/policies/${policyId}`),
  create: (appId: number, data: Record<string, unknown>) =>
    client.post(`/apps/${appId}/hr/policies`, data),
  update: (appId: number, policyId: number, data: Record<string, unknown>) =>
    client.patch(`/apps/${appId}/hr/policies/${policyId}`, data),
  remove: (appId: number, policyId: number) =>
    client.delete(`/apps/${appId}/hr/policies/${policyId}`),
});
