# notif-actions (local module — Android + iOS)

Makes the chat push notification's **Reply** and **Mark as read** buttons work
WhatsApp-style — serviced natively straight from the notification shade, even
when the app process is **fully killed**.

## Why it exists

`expo-notifications` (managed) can't reliably act on a notification *action
response* when the process is dead:

- **Android** — the response isn't delivered to JS at all until the app is next
  opened.
- **iOS** — the OS *does* background-launch the app for the action, but
  expo-notifications calls the OS completion handler immediately, so iOS can
  suspend the app before an async JS `fetch` finishes.

The JS-only fallback in `src/lib/pushNotifications.ts` buffers the action and
replays it on next app open. This module does the send natively instead, so it
lands immediately — the same mechanism WhatsApp uses.

## How it works — Android



```
push arrives (app killed)
  └─ expo-notifications shows it with Reply / Mark-as-read buttons
       └─ user taps a button  (opensAppToForeground: false → OS broadcast)
            └─ ChatActionReceiver  ← wins the broadcast (intent-filter priority 1
               │                      vs expo-notifications' own -1)
               ├─ chat action + valid token  → HTTP POST to the chat API,
               │                                dismiss the notification. Done.
               │                                (JS never runs, no app open)
               └─ anything else / no token / HTTP failed
                                              → forward the broadcast verbatim to
                                                expo-notifications' NotificationsService
                                                (→ existing JS replay-on-open path)
```

Worst case (priority tie-break loses, keystore unavailable, offline, token
expired) is **exactly today's behaviour** — replay on next app open.

## How it works — iOS

`NotifActionsModule.swift` registers a `NotificationDelegate` with
expo-notifications' `NotificationCenterManager` (same hook its own
`EmitterModule` uses). When the user taps **Reply** / **Mark as read**:

```
iOS background-launches the app for the action (~30s window)
  └─ NotifActionsModule.didReceive(response)
       ├─ chat action + valid token
       │     → beginBackgroundTask (holds the window open)
       │     → URLSession POST to the chat API, remove the delivered notification
       │     → the JS response event still fires but sees wasHandledNatively → routes only
       └─ no token / expired  → returns without claiming → JS replay-on-open path
```

Force-quit (user swiped the app away) is **included** — iOS still launches the
app for a *user-initiated* notification action (only silent/background pushes
are blocked for a force-quit app).

## Dedup between native and JS

Both platforms record a `${notifId}:${actionId}:${userText}` key
(`wasHandledNatively`) the instant they commit to sending, and roll it back if
every attempt fails. `pushNotifications.ts` checks that key before sending, so
the JS replay-on-open path never double-sends what native already sent — and
still sends it itself if native rolled back after failing.

## Credential

The native side needs a bearer token while no JS runs. The default Clerk
session token (~60 s) is useless for that, so `src/lib/notifAuthSync.ts` mints
one from a dedicated **Clerk JWT template** and stores it (Android:
EncryptedSharedPreferences, iOS: Keychain). Synced on sign-in, on every
foreground (throttled 5 min), and forced on background (the last moment before
a possible kill). Wiped on sign-out.

## One-time setup — Clerk dashboard (qa instance)

Create a JWT template so `getToken({ template: 'notif_action' })` works:

1. Clerk dashboard → **JWT Templates** → **New template** → *Blank*.
2. Name: **`notif_action`** (exact — matches `TEMPLATE` in `notifAuthSync.ts`).
3. **Token lifetime**: `3600` s (1 h) is plenty. The receiver refuses the token
   past its `exp` anyway and falls back to replay-on-open.
4. Claims: leave default. `sub` is enough — the backend
   (`backend/src/middleware/auth.js` → `verifyClerkToken`) only verifies the
   RS256 signature + `exp` and reads `sub`. Optionally add
   `{ "email": "{{user.primary_email_address}}",
      "first_name": "{{user.first_name}}",
      "last_name": "{{user.last_name}}" }`
   so the receiver can send `x-user-*` headers (cosmetic; the backend keeps
   existing values via `COALESCE`).
5. Save.

If the template is missing, `getToken` throws, nothing is stored, and the
feature silently degrades to replay-on-open — no crash.

## Build & test

Needs a native build (not Expo Go / not OTA):

```
npx expo prebuild --clean            # picks up modules/notif-actions (both platforms)
eas build --profile development --platform android   # and/or --platform ios
```

Smoke test on a **physical device** (per platform):

1. Sign in, open a chat so a token syncs, then **force-quit** the app
   (Android: Settings → Apps → Glos → Force stop; iOS: swipe it away in the
   app switcher).
2. From another account, send a message to that conversation.
3. On the notification: type in **Reply**, send.
   - ✅ message appears in the thread (check the other device) within ~1–3 s
   - ✅ the notification clears itself
   - ✅ opening the app does **not** re-send it
4. Repeat with **Mark as read** → conversation shows read on web too, no app open.
5. Airplane mode on, tap Reply → nothing visible; airplane mode off, open the
   app → the buffered reply sends once (replay path, ≤10 min old).
6. Logs: Android `adb logcat -s GlosNotifActions`; iOS — Console.app filtered to
   the app process / `glos-notif-action` background task.

## iOS limits

- **Force-quit is covered** for the notification action itself. What iOS still
  won't do for a force-quit app is deliver *silent* pushes / background refresh
  — irrelevant here.
- The background window is ~30 s. Two sequential API calls (mark-read does
  GET newest id + POST) fit comfortably; a very slow network can still miss it,
  in which case native rolls back and the JS replay-on-open path takes over.
