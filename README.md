# GreatLeap Mobile (glow-mob)

Mobile app for the **GreatLeap HR platform** — member perspective only.

## Structure

```
glow-mob/
├── mobile/          React Native (Expo) app
└── backend-java/    Java 21 + Spring Boot 3 API
```

---

## Mobile App (`/mobile`)

### Tech Stack
| Layer | Tech |
|---|---|
| Framework | React Native via Expo SDK 51 |
| Auth | `@clerk/clerk-expo` |
| Navigation | React Navigation 6 (Stack + Bottom Tabs) |
| HTTP | Axios |
| Dates | date-fns |
| Language | TypeScript |

### Screens

| Screen | Path |
|---|---|
| Sign In | `src/screens/auth/SignInScreen.tsx` |
| Sign Up | `src/screens/auth/SignUpScreen.tsx` |
| Workspace Select | `src/screens/workspace/WorkspaceSelectScreen.tsx` |
| Dashboard (Home tab) | `src/screens/dashboard/DashboardScreen.tsx` |
| Tasks List | `src/screens/tasks/TasksScreen.tsx` |
| Task Detail | `src/screens/tasks/TaskDetailScreen.tsx` |
| Create Task | `src/screens/tasks/CreateTaskScreen.tsx` |
| Feed | `src/screens/feed/FeedScreen.tsx` |
| Post Detail | `src/screens/feed/PostDetailScreen.tsx` |
| Create Post | `src/screens/feed/CreatePostScreen.tsx` |
| Notifications | `src/screens/notifications/NotificationsScreen.tsx` |
| People (Employees) | `src/screens/employees/EmployeesScreen.tsx` |
| Employee Detail | `src/screens/employees/EmployeeDetailScreen.tsx` |
| Profile + Performance | `src/screens/profile/ProfileScreen.tsx` |

### Navigation Flow

```
Not signed in  →  SignIn / SignUp  (Clerk)
Signed in, no workspace  →  WorkspaceSelect
Signed in + workspace  →  Main Bottom Tabs
  ├── Home        (Dashboard + quick stats)
  ├── Tasks       (list → detail → create)
  ├── Feed        (posts → post detail → create post)
  ├── People      (employee list → detail)
  └── Profile     (me + goals/appraisals + sign out)
```

### Setup

```bash
cd mobile
cp .env.example .env
# Fill in EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY and EXPO_PUBLIC_API_URL

npm install
npx expo start
```

---

## Java Backend (`/backend-java`)

### Tech Stack
| Layer | Tech |
|---|---|
| Language | Java 21 |
| Framework | Spring Boot 3.2 |
| Auth | Clerk JWT via JWKS (jjwt 0.12) |
| DB | SQLite (same files as Node backend) |
| Build | Maven |

### Key Design
- Shares the **same SQLite files** as the existing Node.js backend (`/data/platform.db` and `/data/tenants/<appId>.db`).
- `ClerkJwksService` fetches and caches Clerk's public keys for RS256 JWT verification.
- `UserSyncService` mirrors the Node `syncUser` middleware — upserts platform users on every request.
- `TenantDbConfig` manages per-tenant SQLite connections (mirrors Node's `src/db/tenant.js`).

### API Endpoints (port 8081)

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Health check |
| GET | `/api/me` | Current user profile |
| GET | `/api/apps` | List workspaces |
| GET | `/api/apps/:appId` | Workspace detail |
| GET | `/api/apps/:appId/members` | Members list |
| GET | `/api/notifications` | Notifications |
| GET | `/api/notifications/unread-count` | Unread count |
| PATCH | `/api/notifications/:id/read` | Mark read |
| POST | `/api/notifications/read-all` | Mark all read |
| GET | `/api/apps/:appId/hr/dashboard/me` | Personal dashboard |
| GET/POST | `/api/apps/:appId/hr/tasks` | Task CRUD |
| GET/PATCH | `/api/apps/:appId/hr/tasks/:id` | Task detail/update |
| POST | `/api/apps/:appId/hr/tasks/:id/timer/start` | Start timer |
| POST | `/api/apps/:appId/hr/tasks/:id/timer/stop` | Stop timer |
| GET/POST | `/api/apps/:appId/hr/tasks/:id/comments` | Comments |
| GET/POST/PATCH | `/api/apps/:appId/hr/tasks/:id/checklist` | Checklist |
| GET/POST | `/api/apps/:appId/hr/tasks/:id/time-logs` | Time logs |
| GET | `/api/apps/:appId/hr/feed` | Feed posts |
| POST | `/api/apps/:appId/hr/feed` | Create post |
| POST | `/api/apps/:appId/hr/feed/:id/reactions` | React to post |
| GET/POST | `/api/apps/:appId/hr/feed/:id/comments` | Post comments |
| GET | `/api/apps/:appId/hr/employees` | Employee list |
| GET | `/api/apps/:appId/hr/employees/:id` | Employee detail |
| GET | `/api/apps/:appId/hr/goals` | My goals |
| POST | `/api/apps/:appId/hr/goals` | Create goal |
| GET | `/api/apps/:appId/hr/appraisals` | My appraisals |
| GET | `/api/apps/:appId/hr/performance/cycles` | Review cycles |

### Setup

```bash
cd backend-java
# Edit src/main/resources/application.properties
# Set clerk.jwks-url and greatleap.data-root

mvn spring-boot:run
# Runs on http://localhost:8081
```

---

## Environment Variables

### Mobile (.env)
```
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
EXPO_PUBLIC_API_URL=http://localhost:8081/api
```

### Java (application.properties)
```
clerk.jwks-url=https://api.clerk.dev/v1/jwks
greatleap.data-root=/data
server.port=8081
```
