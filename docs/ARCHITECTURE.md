# Architecture Overview

## System Diagram

```
┌─────────────────────────────────────────────────────────┐
│                    MOBILE APP (React Native)            │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  Geofence    │  │  Push Wake   │  │  Significant │  │
│  │  Monitor     │  │  Handler     │  │  Location    │  │
│  │  (Priority 1)│  │  (Priority 2)│  │  (Priority 3)│  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  │
│         │                 │                 │           │
│         └────────┬────────┴────────┬────────┘           │
│                  ▼                 ▼                     │
│         ┌──────────────┐  ┌──────────────┐              │
│         │  TimeEvent   │  │  Manual      │              │
│         │  Creator     │  │  Check-in    │              │
│         │              │  │  (Priority 4)│              │
│         └──────┬───────┘  └──────┬───────┘              │
│                │                 │                       │
│                └────────┬────────┘                       │
│                         ▼                               │
│              ┌────────────────────┐                      │
│              │  Offline Queue     │                      │
│              │  (SQLite)          │                      │
│              └────────┬───────────┘                      │
│                       │                                 │
│              ┌────────▼───────────┐                      │
│              │  Sync Engine       │                      │
│              │  (retry + dedup)   │                      │
│              └────────┬───────────┘                      │
└───────────────────────┼─────────────────────────────────┘
                        │ HTTPS
                        ▼
┌─────────────────────────────────────────────────────────┐
│                    API SERVER                            │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  Auth        │  │  Time Event  │  │  Exception   │  │
│  │  Middleware   │  │  Ingestion   │  │  Detection   │  │
│  │  (JWT+tenant)│  │  Pipeline    │  │  Cron        │  │
│  └──────────────┘  └──────┬───────┘  └──────────────┘  │
│                           │                             │
│                    ┌──────▼───────┐  ┌──────────────┐  │
│                    │  Validation  │  │  Background  │  │
│                    │  Engine      │  │  Worker      │  │
│                    │              │  │              │  │
│                    │ • Geofence   │  │ • Session    │  │
│                    │ • Compliance │  │   derivation │  │
│                    │ • Anti-fraud │  │   & reconcil.│  │
│                    └──────┬───────┘  │ • Close open │  │
│                           │         │   sessions   │  │
│                           │         │ • Flag       │  │
│                           │         │   anomalies  │  │
│                           │         └──────┬───────┘  │
│         ┌─────────────────┼────────────────┤           │
│         ▼                 ▼                ▼           │
│  ┌────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │ time_event │  │  audit_log   │  │  exception   │   │
│  │ table      │  │  table       │  │  _event      │   │
│  └────────────┘  └──────────────┘  └──────────────┘   │
│                                                        │
│  [Phase 2+ Event Bus: photos, supplies, incidents...]  │
└────────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│                  MANAGER PORTAL (Web)                    │
│                                                         │
│  • Today's clock-ins                                    │
│  • Open exceptions (approve / reject)                   │
│  • Flagged events (fraud indicators)                    │
│  • Worker status overview                               │
│  [Phase 2+: dashboards, reports, invoicing]             │
└─────────────────────────────────────────────────────────┘
```

## Background Worker: Session Derivation & Reconciliation

A scheduled background job (cron or queue consumer) that runs independently of the request path:

1. **Session derivation**: Pairs `clock_in` and `clock_out` events into logical work sessions. If a `clock_in` exists with no matching `clock_out` after the shift's `scheduled_end` + a configurable grace period, the worker auto-closes the session and creates an `exception_event` of type `missing_clock_out`.

2. **Reconciliation**: On each run, scans for shifts that have passed their `scheduled_start` with no associated `clock_in` event. Creates `exception_event` of type `missing_clock_in` and notifies the assigned manager.

3. **Anomaly flagging**: Runs anti-fraud heuristics on recent `time_event` records (e.g., repeated static coordinates across days, teleportation patterns). Writes findings to `audit_log` and creates `exception_event` entries for manager review.

This worker writes to `time_event`, `audit_log`, and `exception_event` — the same tables used by the API server — and acts as the system's self-healing layer for events that were missed, delayed, or incomplete.

---

## Data Flow: Clock-In Event Lifecycle

```
1. TRIGGER
   Worker enters geofence → OS wakes app → callback fires

2. CAPTURE (on device)
   {timestamp, lat, lng, accuracy, battery, source, property_id}

3. QUEUE (on device)
   Insert into local SQLite pending_sync_queue

4. SYNC (device → server)
   POST /time-events or POST /time-events/batch
   Retry with exponential backoff if offline

5. VALIDATE (on server)
   a) Is lat/lng within geofence + tolerance?     → valid / invalid
   b) Is timestamp within shift window?            → valid / exception
   c) Is mock location detected?                   → flag
   d) Is teleportation detected?                   → flag
   e) Does compliance rule require approval?       → requires_approval = true

6. STORE (on server)
   a) Insert time_event (validation_status set)
   b) Insert audit_log (immutable record)
   c) If flagged → insert exception_event
   d) Update shift.actual_start if clock_in

7. NOTIFY (if needed)
   a) Exception created → push to manager
   b) Approval required → push to manager
   c) Anomaly detected → log for batch review

8. RESPOND (server → device)
   {status: CREATED/DUPLICATE/REJECTED, server_id, validation_status}

9. CLEANUP (on device)
   Mark queue entry as SYNCED or FAILED
   Prune synced entries after 7 days
```

## Tech Stack (Recommended)

| Layer | Technology | Why |
|---|---|---|
| Mobile | React Native (Expo, bare workflow) | Cross-platform, access to native geofencing |
| Background Location | `react-native-background-geolocation` (Transistor Software) | Only production-grade background location library for RN. Licensed per app ($300 one-time). |
| Local DB (mobile) | WatermelonDB or SQLite via `expo-sqlite` | Offline queue + local caching |
| API Server | Node.js + Fastify (or Express) | Fast, TypeScript, good ecosystem |
| Database | PostgreSQL (via Supabase or self-hosted) | Multi-tenant RLS, JSONB, PostGIS ready |
| Auth | Supabase Auth or Firebase Auth | Phone OTP + JWT out of the box |
| Push Notifications | Firebase Cloud Messaging (both platforms) | Silent push for fallback triggers |
| Manager Portal | Next.js or React (SPA) | Can share types with API server |
| Hosting | Supabase (DB + Auth) + Railway/Fly.io (API) or fully Supabase Edge Functions | Low ops overhead for MVP |
