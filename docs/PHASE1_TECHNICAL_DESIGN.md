# Phase 1 MVP: Automatic Geofence Clock-In — Technical Design

## Table of Contents
1. [Background Geofencing: iOS vs Android Reality](#1-background-geofencing-ios-vs-android-reality)
2. [Three Implementation Strategies (Ranked)](#2-three-implementation-strategies-ranked)
3. [Strategy Deep-Dives](#3-strategy-deep-dives)
4. [MVP Foundation (Schema, API, Event Architecture)](#4-mvp-foundation)
5. [Manager Summary and Phase Map](#5-manager-summary)
6. [Checklists: Day 1, Week 1, Phase 2+](#6-checklists)

---

## 1. Background Geofencing: iOS vs Android Reality

### iOS (CoreLocation + CLCircularRegion)

| Aspect | Detail |
|---|---|
| **Max geofences** | 20 per app (hard limit, OS-enforced) |
| **Minimum radius** | ~100m effective (Apple says 100m, but accuracy is ±65m in practice) |
| **Background trigger** | OS wakes your app for ~10 seconds when the device crosses a fence boundary. You get a `didEnterRegion` / `didExitRegion` callback. |
| **"Always" location** | Required. User must grant "Allow While Using" first, then separately grant "Always Allow" — this is a two-step prompt since iOS 13. Many users never complete step two. |
| **OS throttling** | iOS aggressively kills background processes. After a reboot, assume geofence monitoring will NOT resume reliably until the app runs again. Implement a self-heal path: on every app launch, re-register all active geofences and reconcile any missed events against the shift schedule. If the device is in Low Power Mode, fence events can be delayed significantly. |
| **Accuracy** | Uses Wi-Fi + cell tower + GPS opportunistically. In dense urban areas: good. In rural/industrial areas: can drift 100–200m. |
| **What "automatic" really means** | The OS will wake your app, but the wake is best-effort. Apple documents no SLA. Events can be missed due to OS throttling, permission state, Low Power Mode, and battery optimization. Assume a meaningful percentage of triggers will not fire. |

### Android (GeofencingClient via Google Play Services)

| Aspect | Detail |
|---|---|
| **Max geofences** | 100 per app |
| **Minimum radius** | ~100m recommended (works at 50m but false positives increase) |
| **Background trigger** | Fires a `BroadcastReceiver` or `PendingIntent`. Your app does NOT need to be running. |
| **Location permissions** | `ACCESS_FINE_LOCATION` + `ACCESS_BACKGROUND_LOCATION`. On Android 11+, background location requires a separate settings page visit — the in-app dialog no longer includes it. |
| **OS throttling** | Android 8+ limits background execution. Geofence triggers still fire, but OEM skins (Samsung, Xiaomi, Huawei) aggressively kill background services. Xiaomi/MIUI is the worst offender — it can prevent triggers entirely unless the app is whitelisted in battery settings. |
| **Doze mode** | When the device is stationary and screen-off for extended periods, geofence checks may be batched. Events can arrive 2–10 minutes late. |
| **What "automatic" really means** | Generally more reliable than iOS on stock Android. On OEM-skinned phones (Samsung, Xiaomi, Huawei), reliability drops significantly without explicit battery optimization whitelisting by the user. Do not assume triggers will fire on OEM devices without testing. |

### Honest Summary

**No mobile OS guarantees background geofence triggers will fire immediately or at all.** Both platforms treat background location as a battery-draining luxury and throttle it. Events can be missed due to OS throttling, permission state, device reboots, and battery optimization. Any system that relies solely on background geofencing MUST have a fallback, or it will silently fail for a non-trivial percentage of clock-in events.

---

## 2. Three Implementation Strategies (Ranked by Reliability)

| Rank | Strategy | Reliability | Complexity | User friction |
|---|---|---|---|---|
| **A** | Background Geofencing Only | Lowest — can miss events due to OS throttling, permission state, and battery optimization | Low | Low (if permissions granted) |
| **B** | Hybrid: Geofencing + Lightweight Fallback | Higher — multiple redundant triggers reduce misses substantially | Medium | Low-Medium |
| **C** | Site Verification (BLE/NFC/Wi-Fi) + Geofencing | Highest — hardware signal adds near-certain presence proof | High | Medium |

**Recommendation: Start with Strategy B for MVP.** It is the best trade-off of reliability, cost, and development speed. Strategy C components (BLE beacons) can be added at specific high-value sites in Phase 2.

---

## 3. Strategy Deep-Dives

### Strategy A: Background Geofencing Only

#### Required Permissions & OS Prompts

| Platform | Permission | User prompt |
|---|---|---|
| iOS | `NSLocationAlwaysAndWhenInUseUsageDescription` | Two-step: "While Using" then "Always" |
| Android | `ACCESS_FINE_LOCATION` + `ACCESS_BACKGROUND_LOCATION` | Two-step: fine location dialog, then redirect to Settings for background |

#### Trigger Flow

```
1. On worker assignment to a property:
   → App registers CLCircularRegion (iOS) / Geofence (Android)
     with property lat/lng and configured radius (default 150m).

2. Worker approaches job site (phone in pocket, app not open):
   → OS detects boundary crossing.
   → OS wakes app / fires BroadcastReceiver.

3. App callback fires:
   → Capture: timestamp, lat/lng, accuracy, battery level, whether Wi-Fi/cell/GPS.
   → Create TimeEvent locally with type=CLOCK_IN, source=GEOFENCE_AUTO.
   → Attempt server sync immediately.
   → If offline → enqueue in local SQLite/Realm queue.

4. Server receives TimeEvent:
   → Validate: is lat/lng within geofence + tolerance?
   → Apply compliance rule: is this within the worker's scheduled shift window?
   → Flag anomalies: spoofing indicators (jump distance, mock location API detected).
   → Write to TimeEvent table + AuditLog.
   → Return acknowledgment (or conflict if duplicate).
```

#### Failure Modes & Mitigation

| Failure | Likelihood | Mitigation |
|---|---|---|
| User never grants "Always" location | Common — many users skip the second prompt | Onboarding flow explaining why it's needed. Periodic in-app check with re-prompt. Manager alert if permission revoked. |
| OS kills app / delays trigger | Likely on many devices | Strategy B's fallback (see below) |
| GPS drift causes false trigger | Possible, especially at small radii | Use 150m radius + server-side re-validation against a tighter polygon. Log accuracy metadata. |
| Phone reboot (iOS/Android) | Every reboot | Assume monitoring does not resume reliably. On every app launch, re-register all fences and reconcile missed events. Push notification reminding worker to open app after reboot. |
| OEM battery optimization (Android) | Common on Samsung, Xiaomi, Huawei | Onboarding guide for whitelisting. Detect manufacturer and show specific instructions. |

#### Logging / Audit Trail

Every trigger writes an `AuditLog` entry:

```
{
  event_type: "CLOCK_IN_ATTEMPT",
  source: "GEOFENCE_AUTO",
  worker_id, property_id, tenant_id,
  device_timestamp, server_timestamp,
  lat, lng, accuracy_meters,
  location_provider: "fused" | "gps" | "network",
  battery_level, is_mock_location,
  permission_status: "always" | "when_in_use" | "denied",
  result: "ACCEPTED" | "REJECTED" | "FLAGGED",
  rejection_reason: null | "OUTSIDE_GEOFENCE" | "OUTSIDE_SHIFT_WINDOW" | "MOCK_DETECTED",
  compliance_rule_applied: "SHIFT_WINDOW_CHECK_V1",
  requires_manager_approval: false
}
```

#### Offline Queue + Sync

- Local DB table: `pending_sync_queue` with columns: `id`, `payload_json`, `created_at`, `retry_count`, `last_retry_at`, `status` (PENDING / SYNCING / SYNCED / FAILED).
- On trigger: insert into queue, attempt immediate sync.
- Background sync: every 5 minutes when app is alive, and on every app foreground event.
- Conflict resolution: server is authoritative. If server already has a CLOCK_IN for this worker+property+shift within a 30-minute window, it returns `409 Conflict` and the client marks the event as duplicate.
- Retention: keep synced events locally for 7 days, then prune.

---

### Strategy B: Hybrid (Geofencing + Lightweight Fallback) — RECOMMENDED

Everything from Strategy A, plus:

#### Additional Fallback Mechanisms

**Fallback 1: Silent push notification (iOS) / High-priority FCM (Android) — best-effort**
- Server knows the worker's shift schedule.
- 5 minutes before shift start, server sends a silent push / data-only FCM message.
- This wakes the app briefly. App checks current location.
- If within geofence radius → auto clock-in.
- If not → do nothing (worker hasn't arrived yet; geofence will catch them).
- **Important:** Silent pushes are best-effort. APNs may delay or drop them, especially in Low Power Mode or Doze. FCM high-priority data messages are more reliable but still not guaranteed. Do not treat this as a reliable trigger — it is a supplementary signal.

**Fallback 2: Significant Location Change monitoring (iOS) / Activity Recognition (Android)**
- iOS: `startMonitoringSignificantLocationChanges()` — wakes app on ~500m movement. Less precise but more reliable than geofencing in low-power states.
- Android: Activity Recognition API detects "ON_FOOT" → "STILL" transition. When worker transitions from moving to still, check location against assigned geofences.
- If within fence → create clock-in event.

**Fallback 3: Manual "I'm here" button (last resort)**
- If no automatic trigger fires within 10 minutes of shift start and worker is in the app, show a banner: "Tap to confirm you're at [Property Name]."
- This tap still captures GPS and validates server-side. It is NOT a free-text self-report.
- Marked as `source=MANUAL_CHECKIN` in the audit log — managers can filter and review these.

#### Trigger Priority

```
Priority 1: GEOFENCE_AUTO      → fires silently, no user action
Priority 2: PUSH_WAKE_LOCATION → fires on server-initiated push, no user action
Priority 3: SIGNIFICANT_CHANGE → fires on movement pattern, no user action
Priority 4: MANUAL_CHECKIN     → user taps a button (GPS still captured)
```

Each has its own `source` tag in the audit log. Managers can see what percentage of clock-ins are automatic vs. manual, per worker.

#### Additional Permissions

| Platform | Additional Permission | Purpose |
|---|---|---|
| iOS | Push notification (silent) | Fallback 1 |
| Android | `com.google.android.gms.permission.ACTIVITY_RECOGNITION` | Fallback 2 |
| Both | Standard push notification | Fallback 3 banner |

#### Failure Modes (Beyond Strategy A)

| Failure | Mitigation |
|---|---|
| Silent push delayed or dropped (APNs/FCM are best-effort, especially in power-saving modes) | Redundant: Fallback 2 and Fallback 3 provide additional coverage. Expect silent push to be unreliable on a per-device basis. |
| Activity Recognition misclassifies | Only used as a supplementary trigger, not primary. |
| Worker ignores manual banner | After 30 minutes past shift start with no clock-in, auto-create an `EXCEPTION` event and notify manager. |

#### Exception Handling Flow

```
Shift start time arrives
  → Has CLOCK_IN been recorded?
     YES → normal flow
     NO  → wait 10 minutes
           → Still no CLOCK_IN?
              → Create ExceptionEvent(type=MISSING_CLOCK_IN)
              → Notify manager via push + in-portal alert
              → Manager can:
                 a) Approve a retroactive clock-in (creates TimeEvent with source=MANAGER_OVERRIDE)
                 b) Mark as no-show
                 c) Request worker explanation (Phase 2)
```

---

### Strategy C: Site Verification (BLE Beacon / NFC / Wi-Fi SSID)

#### Concept

Place a small BLE beacon (e.g., Estimote, Kontakt.io — ~$15–25/unit) or NFC tag (~$0.50/unit) at each job site. When the worker's phone detects the beacon or taps the NFC tag, it triggers clock-in.

#### BLE Beacon Flow

```
1. App scans for known beacon UUIDs in background (iBeacon on iOS, Eddystone on Android).
2. Phone detects beacon major/minor matching assigned property.
3. App creates CLOCK_IN with source=BLE_BEACON.
4. Server validates: beacon UUID matches property, worker is assigned to property, within shift window.
```

#### NFC Tag Flow

```
1. Worker arrives, taps phone on NFC tag mounted at entrance.
2. Tag contains a URL: https://app.example.com/nfc/PROPERTY_UUID
3. This opens the app (via deep link / universal link).
4. App captures GPS + NFC payload, creates CLOCK_IN with source=NFC_TAP.
```

#### Wi-Fi SSID Flow

```
1. App periodically checks nearby Wi-Fi SSIDs (does NOT need to connect).
2. If a known SSID associated with the property is detected → trigger clock-in.
```

**Platform constraints:**
- **Android**: Wi-Fi scan results are available via `WifiManager.getScanResults()` with location permission. Throttled to ~4 scans per 2 minutes on Android 9+. Usable as a background signal.
- **iOS**: Background Wi-Fi scanning requires the `NEHotspotHelper` entitlement, which Apple grants only to telecom/enterprise apps on a case-by-case basis. Without it, Wi-Fi SSID is only readable when the app is in the foreground and the user is connected to the network. **Do not rely on Wi-Fi SSID as a background signal on iOS.**

#### Required Permissions

| Method | iOS | Android |
|---|---|---|
| BLE | Bluetooth permission + "Always" location (for background scanning) | Bluetooth + `ACCESS_FINE_LOCATION` + `ACCESS_BACKGROUND_LOCATION` |
| NFC | No special permission (but requires user tap — not background) | NFC permission (user tap required) |
| Wi-Fi | `NEHotspotHelper` entitlement (requires Apple approval; rarely granted outside telecom/enterprise). Without it, foreground-only. | `ACCESS_FINE_LOCATION` + `CHANGE_WIFI_STATE` |

#### Reliability

| Method | Background? | Reliability | Hardware cost |
|---|---|---|---|
| BLE Beacon | Yes (both platforms) | High when beacon is powered and Bluetooth is enabled | $15–25/site |
| NFC | No (requires tap) | Very high (manual action guarantees intent) | $0.50/site |
| Wi-Fi SSID | Android only in background; iOS foreground-only without special entitlement | Moderate on Android; not viable as background signal on iOS | $0 (uses existing router) |

#### Failure Modes

| Failure | Mitigation |
|---|---|
| Beacon battery dies | Beacon battery monitoring dashboard. Geofence still works as fallback. |
| Worker's Bluetooth off | Prompt to enable. Fall back to geofence. |
| NFC tag damaged/removed | Replace. Fall back to geofence. |
| Worker forgets to tap NFC | This is "semi-automatic." Pair with geofence for truly automatic behavior. |

#### When to Use Strategy C

- **BLE beacons**: High-value properties where clock-in accuracy is critical (hospitals, secure facilities). Deploy in Phase 2.
- **NFC tags**: Extremely cheap. Good for sites where geofencing alone is unreliable (multi-tenant buildings where multiple properties share a GPS footprint). Deploy selectively in Phase 2.
- **Wi-Fi SSID**: Android-only as a background signal. Only useful if the property has a stable, known Wi-Fi network. On iOS, only available in foreground without special Apple entitlement. Opportunistic — add as a supplementary signal, never primary.

---

## 4. MVP Foundation

### 4.1 Database Schema

Designed for multi-tenancy from day one. Every table has `tenant_id`. All IDs are UUIDs.

See [`docs/schema.sql`](./schema.sql) for the full SQL. Summary of tables:

| Table | Purpose | Key relationships |
|---|---|---|
| `tenant` | Company / organization | Top-level entity |
| `property` | Job site / location | Belongs to tenant |
| `geofence` | Circular or polygon region around a property | Belongs to property |
| `worker` | Cleaner / employee | Belongs to tenant |
| `worker_assignment` | Links worker to property with schedule | Worker ↔ Property |
| `shift` | A scheduled work period | Worker + Property |
| `time_event` | Clock-in, clock-out, break-start, break-end | Worker + Property + Shift |
| `audit_log` | Immutable log of every action and decision | References any entity |
| `exception_event` | Missing clock-in, anomaly, flagged event | References time_event or shift |
| `sync_queue` | Offline events pending upload (client-side) | — |
| `compliance_rule` | Configurable rules (shift window tolerance, etc.) | Belongs to tenant |
| `device_info` | Worker's device metadata for debugging | Belongs to worker |

#### Extensibility hooks (empty now, used in Phase 2+):

| Future Table | Links to | Purpose |
|---|---|---|
| `proof_of_work_photo` | time_event, property | Photo capture |
| `supply_log` | property, worker | Inventory tracking |
| `incident_report` | property, worker, shift | Incident reports |
| `invoice` | property, tenant | Billing |
| `gamification_event` | worker, time_event | Points/rewards |

### 4.2 API Endpoints

Base: `POST /api/v1/...` — all endpoints are versioned and tenant-scoped via auth token.

#### Core (Phase 1)

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/time-events` | Create a clock-in/out event |
| `POST` | `/time-events/batch` | Sync offline queue (array of events) |
| `POST` | `/time-events/{id}/validate` | Server re-validates location against geofence |
| `GET` | `/me/assignments` | Get current worker's assigned properties + geofences |
| `GET` | `/me/shifts/today` | Get current worker's scheduled shifts for today |
| `GET` | `/properties/{id}/geofence` | Get geofence config for a property |
| `POST` | `/exceptions/{id}/resolve` | Manager approves/rejects an exception |
| `GET` | `/audit-log` | Query audit trail (filterable) |
| `POST` | `/device-info` | Register/update device metadata |

#### Auth

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/auth/login` | Phone number + OTP or email/password |
| `POST` | `/auth/refresh` | Refresh JWT |
| `GET` | `/auth/me` | Current user + role + tenant |

#### Sync Protocol

```
Client → POST /time-events/batch
Body: {
  events: [
    {
      client_event_id: "uuid-generated-on-device",
      type: "CLOCK_IN",
      source: "GEOFENCE_AUTO",
      device_timestamp: "2026-02-23T08:01:32Z",
      lat: 25.276987,
      lng: 55.296249,
      accuracy_meters: 12.5,
      battery_level: 0.78,
      is_mock_location: false,
      location_provider: "fused",
      property_id: "uuid",
      shift_id: "uuid",
      metadata: { ... }
    },
    ...
  ]
}

Server → 207 Multi-Status
Body: {
  results: [
    { client_event_id: "...", status: "CREATED", server_id: "..." },
    { client_event_id: "...", status: "DUPLICATE", existing_id: "..." },
    { client_event_id: "...", status: "REJECTED", reason: "OUTSIDE_GEOFENCE" }
  ]
}
```

### 4.3 Event-Driven Architecture

Every state change produces a domain event. In Phase 1, these are written to the `audit_log` table synchronously. In Phase 2+, these become messages on a queue (e.g., AWS SQS, Redis Streams, or a simple Postgres LISTEN/NOTIFY).

```
TimeEventCreated
  → triggers: AuditLog write
  → triggers: ComplianceRuleEvaluation
  → triggers: ExceptionCheck (is this within shift window?)
  → [Phase 2] triggers: ProofOfWorkPrompt (ask worker to take photo)
  → [Phase 2] triggers: GamificationPointAward

ExceptionCreated
  → triggers: ManagerNotification
  → triggers: AuditLog write

ExceptionResolved
  → triggers: AuditLog write (with manager decision)
  → triggers: TimeEvent creation (if manager approved retroactive clock-in)
```

This means every future module (photos, supplies, incidents, invoicing) simply subscribes to existing events and links to existing entities (Property, Worker, Shift, TimeEvent). No schema refactoring required.

### 4.4 Anti-Fraud Basics

Detected on the server during event ingestion:

| Check | How | Action |
|---|---|---|
| Mock location API | Android: `Location.isFromMockProvider()`. iOS: no direct API, but check for jailbreak indicators. | Flag event, log to AuditLog, still accept but mark `is_mock_location=true`. |
| Teleportation | Compare this event's lat/lng to previous event. If distance/time implies speed > 200 km/h, flag. | Flag as `TELEPORTATION_ANOMALY` in AuditLog. |
| Repeated exact coordinates | Same lat/lng to 6+ decimal places across multiple days — likely hardcoded. | Flag as `STATIC_COORDS_ANOMALY`. |
| Time manipulation | `device_timestamp` and `server_timestamp` differ by more than 5 minutes (after accounting for sync delay). | Flag as `CLOCK_SKEW_ANOMALY`. |
| Permission downgrade | Device was previously reporting "Always" location, now reports "When In Use." | Create exception, notify manager. |

All flags are logged but do NOT block clock-in in Phase 1. A human reviews flagged events. Automated blocking is Phase 2.

---

## 5. Manager Summary

### What We Can Promise in Phase 1

1. **Cleaners clock in automatically when they arrive at a job site.** Their phone detects the location and records the time — no app interaction needed in most cases.

2. **If the automatic system misses a clock-in** (phone restrictions, poor GPS, etc.), the system has three backup methods that trigger within minutes. If all fail, the cleaner sees a simple "I'm here" button. Every method still verifies GPS.

3. **Every clock-in is logged with full detail**: where, when, how it was triggered, and whether anything looked unusual. This audit trail is permanent and cannot be edited by workers.

4. **Managers are notified when something is wrong**: if a cleaner doesn't show up, if a clock-in looks suspicious, or if a worker's phone stops sharing location.

5. **It works offline.** If a cleaner is in a basement with no signal, the clock-in is recorded on the phone and uploaded when connectivity returns.

6. **Basic fraud detection is running from day one.** Fake GPS apps, teleportation, and suspicious patterns are flagged for review.

### What Is Deferred to Phase 2+

| Feature | Why deferred |
|---|---|
| Photo proof of work | Depends on stable clock-in/out events as anchors |
| AI quality scoring | Needs photo data to train on |
| Supply tracking | Needs property and worker foundation (built in Phase 1) |
| Incident reports | Needs property and worker foundation |
| Invoicing / payment | Needs accurate time records (Phase 1 produces these) |
| Payroll export | Needs clock-in/out + manager approval flow |
| Gamification | Needs stable event stream to award points |
| Multi-company full isolation | Schema supports it now; admin UI comes in Phase 2 |
| BLE beacons / NFC tags | Hardware procurement + per-site setup |
| Manager approval workflows (full) | Phase 1 has the gate; Phase 2 builds the UI + rules engine |
| Detailed analytics / dashboards | Phase 1 logs everything; Phase 2 visualizes it |

### Why This Architecture Avoids Rework

- **Every table has `tenant_id`** — multi-company is a filter, not a migration.
- **Every event is logged immutably** — adding dashboards or compliance reports later is just querying existing data.
- **The `time_event` is the anchor** — photos, incidents, supplies, and invoices all link to it. We built the anchor first.
- **The API is versioned** (`/v1/`) — we can evolve endpoints without breaking the mobile app.
- **The offline queue is generic** — any future module that needs offline support reuses the same sync pattern.
- **Compliance rules are data, not code** — adding a new rule (e.g., "clock-in must be within 15 minutes of shift start") is a database row, not a code deploy.

---

## 6. Checklists

### Day 1 Tasks

- [ ] Initialize React Native (Expo) project with TypeScript
- [ ] Set up Supabase (or PostgreSQL) with the Phase 1 schema
- [ ] Configure authentication (phone OTP via Supabase Auth or Firebase Auth)
- [ ] Set up the React Native background geolocation library (`react-native-background-geolocation` by Transistor Software — the only production-grade option)
- [ ] Create the local SQLite offline queue table
- [ ] Register a test geofence and verify `didEnterRegion` fires on both iOS simulator and a real Android device
- [ ] Set up the API project (Node.js/Express or Fastify, or Supabase Edge Functions)
- [ ] Create the `POST /time-events` endpoint with basic validation

### Week 1 Tasks

- [ ] Implement full geofence registration flow: app fetches worker assignments → registers geofences
- [ ] Implement all four trigger priorities (geofence, push wake, significant change, manual button)
- [ ] Build the offline queue + batch sync (`POST /time-events/batch`)
- [ ] Implement server-side geofence validation (point-in-circle check with accuracy tolerance)
- [ ] Implement basic anti-fraud checks (mock location, teleportation, clock skew)
- [ ] Build the exception detection cron: "shift started, no clock-in → create exception → notify manager"
- [ ] Build minimal manager portal page: list of today's clock-ins, exceptions, and flagged events
- [ ] Write the permission onboarding flow (explain location, handle denials, show device-specific battery optimization instructions)
- [ ] Test on real devices: stock Android, Samsung (OneUI), Xiaomi (MIUI), iPhone
- [ ] Set up CI/CD for mobile builds (EAS Build for Expo)

### Phase 2+ Additions (Backlog)

- [ ] Manager approval UI (approve/reject exceptions, retroactive clock-ins)
- [ ] Clock-out detection (geofence exit + manual fallback)
- [ ] Photo proof of work (camera capture linked to time_event + property)
- [ ] AI quality scoring pipeline (upload photos → score → store)
- [ ] Supply tracking module (supply_log table, barcode scanning)
- [ ] Incident report module (incident_report table, photo + description)
- [ ] BLE beacon integration for high-value sites
- [ ] NFC tag support for multi-tenant buildings
- [ ] Full multi-tenant admin portal
- [ ] Client/property management UI
- [ ] Invoicing and payment tracking
- [ ] Payroll export (CSV/API integration)
- [ ] Gamification engine (points, leaderboards, rewards)
- [ ] Analytics dashboards (attendance rates, punctuality, fraud flags)
- [ ] Full compliance rules engine (configurable per tenant)
