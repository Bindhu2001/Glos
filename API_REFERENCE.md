# API Reference — Great Leap Platform

**Base URL:** `https://glosonline.com`  
**App ID for testing:** `1` (Great Leap Test — type: hr)

---

## Authentication

All endpoints (except Public) require a Bearer token:

```
Authorization: Bearer <token>
```

**Roles (app-level):** `super_admin` | `admin` | `member`  
**Platform admin:** required for all `/api/admin/*` routes (flag set in users table)

### Dev test token (works when CLERK_JWKS_URL is not set on server)
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyXzNEZXJBY2JTOTVnWTVkSXg5aG5TZnhHdEw0ZCIsImVtYWlsIjoiYXRoaXJha3NhYnUyMjQ0QGdtYWlsLmNvbSIsImZpcnN0X25hbWUiOiJBVEhJUkEiLCJpYXQiOjE3Nzk0MzcxNjR9.d6Va3sXsnMO2akqYjcC7u9pzJoijc6bb9D7yFGgMc8c
```

---

## 1. Public Endpoints (no auth)

| Method | URL | Description |
|--------|-----|-------------|
| GET | `/health` | Health check — returns `{ status, service, timestamp }` |
| GET | `/api/public/apps/:appId/logo.:ext` | Org logo (jpg/png/webp/svg) |
| GET | `/api/public/apps/:appId/feed/:filename` | Feed image upload |

---

## 2. User / Me

Base: `/api/me`

| Method | URL | Auth | Body | Description |
|--------|-----|------|------|-------------|
| GET | `/api/me` | Bearer | — | Current user profile + `isPlatformAdmin` |
| PATCH | `/api/me` | Bearer | `{ firstName, lastName }` | Update name (email not allowed here) |
| POST | `/api/me/sync` | Bearer | `{ email, firstName, lastName }` | Bootstrap profile when JWT has no claims |
| GET | `/api/me/billing-summary` | Bearer | — | All apps + plans + credits for current user |

---

## 3. Apps

Base: `/api/apps`

| Method | URL | Auth | Body | Description |
|--------|-----|------|------|-------------|
| GET | `/api/apps` | Bearer | — | List apps the caller belongs to |
| POST | `/api/apps` | Bearer | `{ type: "hr", name: "My App" }` | Create new app (caller becomes super_admin) |
| GET | `/api/apps/:appId` | Bearer | — | App metadata + my role |
| DELETE | `/api/apps/:appId` | Bearer (super_admin) | — | Delete app + tenant DB |

---

## 4. Notifications

Base: `/api/notifications`

| Method | URL | Auth | Query | Description |
|--------|-----|------|-------|-------------|
| GET | `/api/notifications` | Bearer | `?limit=50&unread=1` | List notifications (newest first) |
| GET | `/api/notifications/unread-count` | Bearer | — | Badge count |
| PATCH | `/api/notifications/:id/read` | Bearer | — | Mark one as read |
| POST | `/api/notifications/read-all` | Bearer | — | Mark all as read |

---

## 5. Invitations (invitee side)

Base: `/api/invitations`

| Method | URL | Auth | Description |
|--------|-----|------|-------------|
| GET | `/api/invitations/me` | Bearer | Pending invitations for my email (all apps) |
| POST | `/api/invitations/:token/accept` | Bearer | Accept invitation by token |

---

## 6. App Members

Base: `/api/apps/:appId/members`

| Method | URL | Auth | Body | Description |
|--------|-----|------|------|-------------|
| GET | `/api/apps/:appId/members` | Bearer (any member) | — | List all members |
| PATCH | `/api/apps/:appId/members/:userId` | Bearer (super_admin) | `{ role: "admin"\|"member" }` | Change a member's role |
| DELETE | `/api/apps/:appId/members/:userId` | Bearer | — | Remove member (super_admin) or leave self |

---

## 7. App Invitations (admin side)

Base: `/api/apps/:appId/invitations`  
Requires `super_admin` or `admin` role.

| Method | URL | Auth | Body / Query | Description |
|--------|-----|------|-------------|-------------|
| POST | `/api/apps/:appId/invitations` | Bearer | `{ email, role: "admin"\|"member" }` | Send invitation |
| GET | `/api/apps/:appId/invitations` | Bearer | `?status=pending` | List invitations |
| POST | `/api/apps/:appId/invitations/:id/revoke` | Bearer | — | Revoke pending invitation |

---

## 8. Billing

Base: `/api/apps/:appId/billing`  
Read endpoints: any member. Write endpoints (checkout/verify): `super_admin` only.

| Method | URL | Auth | Body | Description |
|--------|-----|------|------|-------------|
| GET | `/api/apps/:appId/billing/current-plan` | Bearer | — | Current plan + subscription |
| GET | `/api/apps/:appId/billing/payments` | Bearer | — | Payment history (last 100) |
| POST | `/api/apps/:appId/billing/checkout` | Bearer (super_admin) | `{ plan_id, period_months? }` | Create Razorpay order |
| POST | `/api/apps/:appId/billing/verify` | Bearer (super_admin) | `{ razorpay_order_id, razorpay_payment_id, razorpay_signature }` | Verify payment signature (fast-path) |

---

## 9. HR Module

Base: `/api/apps/:appId/hr`  
App must be type `hr`. All HR endpoints require Bearer token.  
Write operations (POST/PATCH/DELETE) require `super_admin` or `admin` unless noted.

### Organisation
| Method | URL | Description |
|--------|-----|-------------|
| GET | `/api/apps/:appId/hr/organisation` | Get org profile |
| PUT | `/api/apps/:appId/hr/organisation` | Update org profile (admin+) |
| POST | `/api/apps/:appId/hr/organisation/logo` | Upload org logo (admin+) |
| DELETE | `/api/apps/:appId/hr/organisation/logo` | Delete org logo (admin+) |

### Locations
| Method | URL | Description |
|--------|-----|-------------|
| GET | `/api/apps/:appId/hr/locations` | List |
| GET | `/api/apps/:appId/hr/locations/:id` | Get one |
| POST | `/api/apps/:appId/hr/locations` | Create |
| PATCH | `/api/apps/:appId/hr/locations/:id` | Update |
| DELETE | `/api/apps/:appId/hr/locations/:id` | Delete |

### Branches
| Method | URL | Description |
|--------|-----|-------------|
| GET | `/api/apps/:appId/hr/branches` | List |
| GET | `/api/apps/:appId/hr/branches/:id` | Get one |
| POST | `/api/apps/:appId/hr/branches` | Create |
| PATCH | `/api/apps/:appId/hr/branches/:id` | Update |
| DELETE | `/api/apps/:appId/hr/branches/:id` | Delete |

### Departments
| Method | URL | Description |
|--------|-----|-------------|
| GET | `/api/apps/:appId/hr/departments` | List |
| GET | `/api/apps/:appId/hr/departments/:id` | Get one |
| POST | `/api/apps/:appId/hr/departments` | Create |
| PATCH | `/api/apps/:appId/hr/departments/:id` | Update |
| DELETE | `/api/apps/:appId/hr/departments/:id` | Delete |

### Roles
| Method | URL | Description |
|--------|-----|-------------|
| GET | `/api/apps/:appId/hr/roles` | List |
| GET | `/api/apps/:appId/hr/roles/:id` | Get one |
| POST | `/api/apps/:appId/hr/roles` | Create |
| PATCH | `/api/apps/:appId/hr/roles/:id` | Update |
| DELETE | `/api/apps/:appId/hr/roles/:id` | Delete |
| GET | `/api/apps/:appId/hr/roles/:roleId/full` | Full role detail (bulk) |
| PUT | `/api/apps/:appId/hr/roles/:roleId/full` | Full role save (bulk) |
| GET/POST/PATCH/DELETE | `/api/apps/:appId/hr/roles/:roleId/skills` | Required skills for a role |
| GET/POST/PATCH/DELETE | `/api/apps/:appId/hr/roles/:roleId/areas` | Role areas + perf params |
| GET/POST/PATCH/DELETE | `/api/apps/:appId/hr/roles/:roleId/education` | Education requirements |
| GET/POST/PATCH/DELETE | `/api/apps/:appId/hr/roles/:roleId/experience` | Experience requirements |

### Policies
| Method | URL | Description |
|--------|-----|-------------|
| GET | `/api/apps/:appId/hr/policies` | List |
| GET | `/api/apps/:appId/hr/policies/:id` | Get one |
| POST | `/api/apps/:appId/hr/policies` | Create |
| PATCH | `/api/apps/:appId/hr/policies/:id` | Update |
| DELETE | `/api/apps/:appId/hr/policies/:id` | Delete |

### Employees
| Method | URL | Description |
|--------|-----|-------------|
| GET | `/api/apps/:appId/hr/employees` | List |
| GET | `/api/apps/:appId/hr/employees/:id` | Get one |
| POST | `/api/apps/:appId/hr/employees` | Create |
| PATCH | `/api/apps/:appId/hr/employees/:id` | Update |
| DELETE | `/api/apps/:appId/hr/employees/:id` | Delete |

### Skills Catalogue
| Method | URL | Description |
|--------|-----|-------------|
| GET | `/api/apps/:appId/hr/skills` | List skill catalogue |
| GET | `/api/apps/:appId/hr/skills/:id` | Get one |
| POST | `/api/apps/:appId/hr/skills` | Create |
| PATCH | `/api/apps/:appId/hr/skills/:id` | Update |
| DELETE | `/api/apps/:appId/hr/skills/:id` | Delete |

### Org Chart
| Method | URL | Description |
|--------|-----|-------------|
| GET | `/api/apps/:appId/hr/org-chart` | Org chart tree |

### Role Assignments
| Method | URL | Description |
|--------|-----|-------------|
| GET | `/api/apps/:appId/hr/role-assignments` | List all assignments |
| GET | `/api/apps/:appId/hr/role-assignments/by-user/:userId` | Assignments for a user |
| GET | `/api/apps/:appId/hr/role-assignments/by-role/:roleId` | Assignments for a role |
| POST | `/api/apps/:appId/hr/role-assignments` | Assign user to role |
| DELETE | `/api/apps/:appId/hr/role-assignments/:id` | Remove assignment |

### Tasks
| Method | URL | Description |
|--------|-----|-------------|
| GET | `/api/apps/:appId/hr/tasks` | List tasks |
| GET | `/api/apps/:appId/hr/tasks/:id` | Get task |
| POST | `/api/apps/:appId/hr/tasks` | Create task |
| PATCH | `/api/apps/:appId/hr/tasks/:id` | Update task |
| DELETE | `/api/apps/:appId/hr/tasks/:id` | Delete task |
| POST | `/api/apps/:appId/hr/tasks/:id/timer` | Start/stop timer |

#### Task Sub-resources (replace `/tasks` path as shown)
| Method | URL | Description |
|--------|-----|-------------|
| GET/POST/PATCH/DELETE | `/api/apps/:appId/hr/tasks/:taskId/comments` | Task comments |
| GET/POST/PATCH/DELETE | `/api/apps/:appId/hr/tasks/:taskId/checklist` | Task checklist items |
| GET/POST/PATCH/DELETE | `/api/apps/:appId/hr/tasks/:taskId/time-logs` | Task time logs |
| GET/POST/DELETE | `/api/apps/:appId/hr/tasks/:taskId/quality` | Task quality ratings |
| GET | `/api/apps/:appId/hr/tasks/:taskId/timeline` | Task timeline/history |

### Time Summary
| Method | URL | Description |
|--------|-----|-------------|
| GET | `/api/apps/:appId/hr/time-logs/summary` | Time summary (per user/period) |
| GET | `/api/apps/:appId/hr/time-logs/summary/overview` | Overview across team |

### Stats
| Method | URL | Description |
|--------|-----|-------------|
| GET | `/api/apps/:appId/hr/stats` | HR app stats snapshot |

### Dashboard
| Method | URL | Description |
|--------|-----|-------------|
| GET | `/api/apps/:appId/hr/dashboard/me` | My personal dashboard |
| GET | `/api/apps/:appId/hr/dashboard/team` | Team dashboard |
| GET | `/api/apps/:appId/hr/dashboard/member/:userId` | Specific member's dashboard |

### Performance
| Method | URL | Description |
|--------|-----|-------------|
| GET | `/api/apps/:appId/hr/performance-review-cycles` | List review cycles |
| POST | `/api/apps/:appId/hr/performance-review-cycles` | Create cycle (admin+) |
| PATCH | `/api/apps/:appId/hr/performance-review-cycles/:id` | Update cycle (admin+) |
| POST | `/api/apps/:appId/hr/performance-review-cycles/:id/start-reviews` | Start reviews in cycle (admin+) |
| GET | `/api/apps/:appId/hr/goals` | List my goals |
| GET | `/api/apps/:appId/hr/goals/team` | List team goals |
| POST | `/api/apps/:appId/hr/goals` | Create goal |
| PATCH | `/api/apps/:appId/hr/goals/:id` | Update goal |
| POST | `/api/apps/:appId/hr/goals/:id/submit-for-approval` | Submit goal for approval |
| PATCH | `/api/apps/:appId/hr/goals/:id/approve` | Approve goal (admin+) |
| PATCH | `/api/apps/:appId/hr/goals/:id/reject` | Reject goal (admin+) |
| GET | `/api/apps/:appId/hr/performance-reviews` | My reviews |
| GET | `/api/apps/:appId/hr/performance-reviews/team` | Team reviews |
| GET | `/api/apps/:appId/hr/performance-reviews/all` | All reviews (admin+) |
| GET | `/api/apps/:appId/hr/performance-reviews/pending-for-me` | Reviews pending my action |
| POST | `/api/apps/:appId/hr/performance-reviews` | Create review |
| GET | `/api/apps/:appId/hr/performance-reviews/:id` | Get review |
| POST | `/api/apps/:appId/hr/performance-reviews/:id/submit-self-rating` | Self rating |
| POST | `/api/apps/:appId/hr/performance-reviews/:id/feedback-discussion` | Feedback discussion |
| POST | `/api/apps/:appId/hr/performance-reviews/:id/submit-manager-rating` | Manager rating |
| POST | `/api/apps/:appId/hr/performance-reviews/:id/submit-final-rating` | Final rating |
| GET | `/api/apps/:appId/hr/performance-reviews/:id/ratings` | Review ratings |
| GET | `/api/apps/:appId/hr/performance-reviews/:id/analytics` | Review analytics |
| GET | `/api/apps/:appId/hr/appraisals` | List appraisals |
| POST | `/api/apps/:appId/hr/appraisals` | Create appraisal (admin+) |
| GET | `/api/apps/:appId/hr/appraisals/:id` | Get appraisal |
| POST | `/api/apps/:appId/hr/appraisals/:id/employee-response` | Employee response |
| POST | `/api/apps/:appId/hr/appraisals/:id/manager-response` | Manager response |
| POST | `/api/apps/:appId/hr/appraisals/:id/final-decision` | Final decision (admin+) |
| GET | `/api/apps/:appId/hr/performance-settings` | Performance settings |
| PUT | `/api/apps/:appId/hr/performance-settings` | Update settings (admin+) |
| GET | `/api/apps/:appId/hr/workflow-status` | Workflow status (admin+) |

### Social
| Method | URL | Description |
|--------|-----|-------------|
| GET | `/api/apps/:appId/hr/feed` | Social feed posts |
| POST | `/api/apps/:appId/hr/feed` | Create post |
| DELETE | `/api/apps/:appId/hr/feed/:id` | Delete post |
| PATCH | `/api/apps/:appId/hr/feed/:id/pin` | Pin/unpin post (admin+) |
| POST | `/api/apps/:appId/hr/feed/upload-image` | Upload image for post |
| POST | `/api/apps/:appId/hr/feed/:id/react` | React to post |
| GET | `/api/apps/:appId/hr/feed/:postId/comments` | Get comments |
| POST | `/api/apps/:appId/hr/feed/:postId/comments` | Add comment |
| DELETE | `/api/apps/:appId/hr/feed/:postId/comments/:commentId` | Delete comment |
| GET | `/api/apps/:appId/hr/appreciations` | List appreciations |
| GET | `/api/apps/:appId/hr/appreciations/for/:userId` | Appreciations for a user |
| GET | `/api/apps/:appId/hr/appreciations/by-cycle/:cycleId` | Appreciations in a cycle |
| POST | `/api/apps/:appId/hr/appreciations` | Send appreciation |
| POST | `/api/apps/:appId/hr/feedback` | Give feedback |
| GET | `/api/apps/:appId/hr/feedback/received` | Feedback I received |
| GET | `/api/apps/:appId/hr/feedback/given` | Feedback I gave |

---

## 10. Admin (Platform Admin Only)

Base: `/api/admin`  
Requires platform admin flag (`is_platform_admin = 1`).

### Plans
| Method | URL | Query | Body | Description |
|--------|-----|-------|------|-------------|
| GET | `/api/admin/plans` | `?include_inactive=1` | — | List plans |
| GET | `/api/admin/plans/:id` | — | — | Plan detail |
| POST | `/api/admin/plans` | — | `{ code, name, price_paise, currency, interval, max_users?, included_credits?, features_json?, is_active?, is_default? }` | Create plan |
| PATCH | `/api/admin/plans/:id` | — | any plan fields | Update plan |

### Apps
| Method | URL | Body | Description |
|--------|-----|------|-------------|
| GET | `/api/admin/apps` | — | List all tenant apps |
| GET | `/api/admin/apps/payments` | — | All payments across tenants (last 500) |
| GET | `/api/admin/apps/subscriptions` | — | All subscriptions |
| GET | `/api/admin/apps/:appId` | — | App detail + subscription + usage |
| POST | `/api/admin/apps/:appId/change-plan` | `{ plan_id, period_months?, period_end? }` | Override plan (no payment) |
| PATCH | `/api/admin/apps/:appId/status` | `{ status: "active"\|"suspended"\|"cancelled", reason? }` | Change billing status |

### Credits
| Method | URL | Query | Body | Description |
|--------|-----|-------|------|-------------|
| GET | `/api/admin/credits/ledger` | `?app_id=&limit=` | — | Credit ledger entries |
| GET | `/api/admin/credits/totals` | — | — | Credit totals per app |
| GET | `/api/admin/credits/balance/:appId` | — | — | Current balance for an app |
| POST | `/api/admin/credits/adjust` | — | `{ app_id, delta, reason }` | Manual credit adjustment |

### Reconciliation
| Method | URL | Description |
|--------|-----|-------------|
| GET | `/api/admin/reconciliation/status` | Latest recon status |
| GET | `/api/admin/reconciliation/runs` | List recon runs |
| GET | `/api/admin/reconciliation/runs/:id` | Recon run detail |
| POST | `/api/admin/reconciliation/runs` | Trigger manual recon |
| GET | `/api/admin/reconciliation/findings` | List findings |
| GET | `/api/admin/reconciliation/findings/:id` | Finding detail |
| PATCH | `/api/admin/reconciliation/findings/:id` | Update finding |

### Reports
| Method | URL | Description |
|--------|-----|-------------|
| GET | `/api/admin/reports/revenue` | Revenue report |
| GET | `/api/admin/reports/payments/summary` | Payments summary |
| GET | `/api/admin/reports/invoices` | Invoice list |
| GET | `/api/admin/reports/tenants` | Tenant report |
| GET | `/api/admin/reports/tenants/over-limit` | Tenants over user limit |
| GET | `/api/admin/reports/tenants/payment-issues` | Tenants with payment issues |
| GET | `/api/admin/reports/usage/totals` | Usage totals |
| GET | `/api/admin/reports/usage/per-tenant` | Usage per tenant |

### Audit Log
| Method | URL | Description |
|--------|-----|-------------|
| GET | `/api/admin/audit` | Search audit log |
| GET | `/api/admin/audit/actions` | List distinct action types |

### Users
| Method | URL | Description |
|--------|-----|-------------|
| GET | `/api/admin/users` | List all platform users |
| POST | `/api/admin/users/:userId/toggle-active` | Activate / deactivate user |
| POST | `/api/admin/users/:userId/toggle-admin` | Grant / revoke platform admin |

---

## 11. Webhook

| Method | URL | Headers | Description |
|--------|-----|---------|-------------|
| POST | `/api/webhooks/razorpay` | `x-razorpay-signature` | Razorpay payment webhook (raw body, no JSON middleware) |

---

## Postman Setup

1. Create a collection variable `base_url` = `https://glosonline.com`
2. Set **Authorization** tab → type: **Bearer Token** → value: paste the dev token above
3. Set that auth at the **collection level** so all requests inherit it
4. For HR routes, set a collection variable `appId` = `1`
5. Use `{{base_url}}/api/me` etc. in request URLs
