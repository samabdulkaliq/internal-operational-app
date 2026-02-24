-- ============================================================
-- Phase 1 MVP Schema — Automatic Geofence Clock-In Platform
-- Designed for multi-tenancy from day one.
-- All IDs are UUIDs. All timestamps are UTC.
-- ============================================================
--
-- RLS DECISION (Phase 1):
-- Row-Level Security is NOT enabled in this schema. The API server
-- (NestJS) is the only client that connects to the database and
-- enforces tenant isolation at the application layer via middleware
-- that injects tenant_id from the authenticated JWT into every query.
--
-- If a future phase introduces direct-to-DB access (e.g., Supabase
-- client SDK, PostgREST, or BI tools), add RLS policies at that time.
-- The tenant_id column is already on every table to support this.
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";  -- for geospatial queries in Phase 2+

-- ============================================================
-- TENANT (Company)
-- ============================================================
CREATE TABLE tenant (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            TEXT NOT NULL,
    slug            TEXT NOT NULL UNIQUE,
    timezone        TEXT NOT NULL DEFAULT 'UTC',
    is_active       BOOLEAN NOT NULL DEFAULT true,
    settings        JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tenant_slug ON tenant(slug);

-- ============================================================
-- WORKER
-- ============================================================
CREATE TABLE worker (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenant(id),
    external_id     TEXT,                    -- payroll system ID
    full_name       TEXT NOT NULL,
    phone           TEXT,
    email           TEXT,
    role            TEXT NOT NULL DEFAULT 'cleaner'
                        CHECK (role IN ('cleaner', 'supervisor', 'manager', 'admin')),
    is_active       BOOLEAN NOT NULL DEFAULT true,
    metadata        JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_worker_tenant ON worker(tenant_id);
CREATE INDEX idx_worker_phone ON worker(phone);

-- ============================================================
-- PROPERTY (Job Site)
-- ============================================================
CREATE TABLE property (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenant(id),
    name            TEXT NOT NULL,
    address         TEXT,
    lat             DOUBLE PRECISION NOT NULL,
    lng             DOUBLE PRECISION NOT NULL,
    timezone        TEXT,                    -- override tenant timezone if needed
    is_active       BOOLEAN NOT NULL DEFAULT true,
    metadata        JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_property_tenant ON property(tenant_id);
CREATE INDEX idx_property_coords ON property(lat, lng);

-- ============================================================
-- GEOFENCE
-- One property can have multiple geofences (e.g., main entrance + parking lot).
-- ============================================================
CREATE TABLE geofence (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    property_id     UUID NOT NULL REFERENCES property(id),
    tenant_id       UUID NOT NULL REFERENCES tenant(id),
    label           TEXT NOT NULL DEFAULT 'main',
    lat             DOUBLE PRECISION NOT NULL,
    lng             DOUBLE PRECISION NOT NULL,
    radius_meters   INTEGER NOT NULL DEFAULT 150,
    geofence_type   TEXT NOT NULL DEFAULT 'circle'
                        CHECK (geofence_type IN ('circle', 'polygon')),
    polygon_coords  JSONB,                   -- for polygon type, array of {lat, lng}
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_geofence_property ON geofence(property_id);
CREATE INDEX idx_geofence_tenant ON geofence(tenant_id);

-- ============================================================
-- WORKER_ASSIGNMENT
-- Links a worker to a property. Defines their schedule at that property.
-- ============================================================
CREATE TABLE worker_assignment (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenant(id),
    worker_id       UUID NOT NULL REFERENCES worker(id),
    property_id     UUID NOT NULL REFERENCES property(id),
    start_date      DATE NOT NULL,
    end_date        DATE,                    -- null = ongoing
    schedule        JSONB NOT NULL DEFAULT '{}',
    -- schedule example: {"mon": {"start": "08:00", "end": "16:00"}, "tue": {...}, ...}
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_assignment_worker ON worker_assignment(worker_id);
CREATE INDEX idx_assignment_property ON worker_assignment(property_id);
CREATE INDEX idx_assignment_tenant ON worker_assignment(tenant_id);
CREATE UNIQUE INDEX idx_assignment_unique_active
    ON worker_assignment(worker_id, property_id)
    WHERE is_active = true AND end_date IS NULL;

-- ============================================================
-- SHIFT
-- A specific scheduled work period. Created from worker_assignment schedule.
-- ============================================================
CREATE TABLE shift (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenant(id),
    worker_id       UUID NOT NULL REFERENCES worker(id),
    property_id     UUID NOT NULL REFERENCES property(id),
    assignment_id   UUID REFERENCES worker_assignment(id),
    scheduled_start TIMESTAMPTZ NOT NULL,
    scheduled_end   TIMESTAMPTZ NOT NULL,
    actual_start    TIMESTAMPTZ,
    actual_end      TIMESTAMPTZ,
    status          TEXT NOT NULL DEFAULT 'scheduled'
                        CHECK (status IN ('scheduled', 'in_progress', 'completed',
                                          'no_show', 'cancelled')),
    metadata        JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_shift_worker ON shift(worker_id);
CREATE INDEX idx_shift_property ON shift(property_id);
CREATE INDEX idx_shift_tenant ON shift(tenant_id);
CREATE INDEX idx_shift_scheduled ON shift(scheduled_start, scheduled_end);
CREATE INDEX idx_shift_status ON shift(status) WHERE status IN ('scheduled', 'in_progress');

-- ============================================================
-- TIME_EVENT
-- The core MVP table. Every clock-in, clock-out, break-start, break-end.
-- ============================================================
CREATE TABLE time_event (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_event_id     UUID NOT NULL,            -- idempotency key from device
    tenant_id           UUID NOT NULL REFERENCES tenant(id),
    worker_id           UUID NOT NULL REFERENCES worker(id),
    property_id         UUID NOT NULL REFERENCES property(id),
    shift_id            UUID REFERENCES shift(id),

    event_type          TEXT NOT NULL
                            CHECK (event_type IN ('clock_in', 'clock_out',
                                                   'break_start', 'break_end')),
    source              TEXT NOT NULL
                            CHECK (source IN ('geofence_auto', 'push_wake_location',
                                              'significant_change', 'manual_checkin',
                                              'ble_beacon', 'nfc_tap', 'wifi_ssid',
                                              'manager_override')),

    device_timestamp    TIMESTAMPTZ NOT NULL,
    server_timestamp    TIMESTAMPTZ NOT NULL DEFAULT now(),

    lat                 DOUBLE PRECISION,
    lng                 DOUBLE PRECISION,
    accuracy_meters     DOUBLE PRECISION,
    location_provider   TEXT,
    battery_level       DOUBLE PRECISION,
    is_mock_location    BOOLEAN NOT NULL DEFAULT false,

    validation_status   TEXT NOT NULL DEFAULT 'pending'
                            CHECK (validation_status IN ('pending', 'valid',
                                                          'invalid', 'flagged')),
    validation_details  JSONB NOT NULL DEFAULT '{}',

    compliance_rule_id  UUID,                    -- FK added via ALTER TABLE after compliance_rule is created
    requires_approval   BOOLEAN NOT NULL DEFAULT false,
    approved_by         UUID REFERENCES worker(id),
    approved_at         TIMESTAMPTZ,

    metadata            JSONB NOT NULL DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_time_event_worker ON time_event(worker_id);
CREATE INDEX idx_time_event_property ON time_event(property_id);
CREATE INDEX idx_time_event_shift ON time_event(shift_id);
CREATE INDEX idx_time_event_tenant ON time_event(tenant_id);
CREATE INDEX idx_time_event_type ON time_event(event_type);
CREATE INDEX idx_time_event_device_ts ON time_event(device_timestamp);
CREATE INDEX idx_time_event_validation ON time_event(validation_status)
    WHERE validation_status IN ('pending', 'flagged');
CREATE UNIQUE INDEX idx_time_event_idempotency
    ON time_event(tenant_id, client_event_id);

-- ============================================================
-- AUDIT_LOG
-- Immutable. Never updated or deleted. Append-only.
-- ============================================================
CREATE TABLE audit_log (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenant(id),

    event_type      TEXT NOT NULL,
    -- Examples: TIME_EVENT_CREATED, TIME_EVENT_VALIDATED, EXCEPTION_CREATED,
    --           EXCEPTION_RESOLVED, PERMISSION_CHANGED, FRAUD_FLAG_RAISED,
    --           MANAGER_OVERRIDE, WORKER_ASSIGNED, GEOFENCE_UPDATED

    actor_id        UUID,                        -- worker or manager who caused the event
    actor_role      TEXT,
    target_type     TEXT,                         -- 'time_event', 'shift', 'worker', 'property', etc.
    target_id       UUID,

    payload         JSONB NOT NULL DEFAULT '{}', -- full event data snapshot
    ip_address      TEXT,
    user_agent      TEXT,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_tenant ON audit_log(tenant_id);
CREATE INDEX idx_audit_event_type ON audit_log(event_type);
CREATE INDEX idx_audit_actor ON audit_log(actor_id);
CREATE INDEX idx_audit_target ON audit_log(target_type, target_id);
CREATE INDEX idx_audit_created ON audit_log(created_at);

-- Prevent any updates or deletes on audit_log
CREATE OR REPLACE FUNCTION prevent_audit_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'audit_log is append-only. Updates and deletes are not allowed.';
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_immutable
    BEFORE UPDATE OR DELETE ON audit_log
    FOR EACH ROW
    EXECUTE FUNCTION prevent_audit_modification();

-- ============================================================
-- EXCEPTION_EVENT
-- Auto-generated when something expected didn't happen, or something anomalous did.
-- ============================================================
CREATE TABLE exception_event (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenant(id),
    worker_id       UUID REFERENCES worker(id),
    property_id     UUID REFERENCES property(id),
    shift_id        UUID REFERENCES shift(id),
    time_event_id   UUID REFERENCES time_event(id),

    exception_type  TEXT NOT NULL
                        CHECK (exception_type IN (
                            'missing_clock_in', 'missing_clock_out',
                            'late_arrival', 'early_departure',
                            'mock_location_detected', 'teleportation_anomaly',
                            'static_coords_anomaly', 'clock_skew_anomaly',
                            'permission_downgrade', 'outside_geofence',
                            'manual_review_requested'
                        )),

    severity        TEXT NOT NULL DEFAULT 'medium'
                        CHECK (severity IN ('low', 'medium', 'high', 'critical')),

    status          TEXT NOT NULL DEFAULT 'open'
                        CHECK (status IN ('open', 'acknowledged', 'resolved', 'dismissed')),

    resolution      TEXT,
    -- 'approved_retroactive', 'marked_no_show', 'false_alarm', 'worker_counseled'

    resolved_by     UUID REFERENCES worker(id),
    resolved_at     TIMESTAMPTZ,
    notes           TEXT,

    details         JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_exception_tenant ON exception_event(tenant_id);
CREATE INDEX idx_exception_worker ON exception_event(worker_id);
CREATE INDEX idx_exception_shift ON exception_event(shift_id);
CREATE INDEX idx_exception_status ON exception_event(status) WHERE status IN ('open', 'acknowledged');
CREATE INDEX idx_exception_type ON exception_event(exception_type);

-- ============================================================
-- COMPLIANCE_RULE
-- Configurable per tenant. Evaluated server-side on time event ingestion.
-- ============================================================
CREATE TABLE compliance_rule (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID NOT NULL REFERENCES tenant(id),
    name            TEXT NOT NULL,
    description     TEXT,
    rule_type       TEXT NOT NULL,
    -- Examples: 'shift_window_tolerance', 'max_geofence_distance',
    --           'require_approval_for_manual', 'flag_mock_location'
    parameters      JSONB NOT NULL DEFAULT '{}',
    -- Example: {"tolerance_minutes": 15, "applies_to": "clock_in"}
    is_active       BOOLEAN NOT NULL DEFAULT true,
    priority        INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_compliance_tenant ON compliance_rule(tenant_id);
CREATE INDEX idx_compliance_active ON compliance_rule(is_active) WHERE is_active = true;

-- ============================================================
-- DEFERRED FK: time_event.compliance_rule_id → compliance_rule(id)
-- (compliance_rule is created after time_event, so we add the FK here)
-- ============================================================
ALTER TABLE time_event
    ADD CONSTRAINT fk_time_event_compliance_rule
    FOREIGN KEY (compliance_rule_id) REFERENCES compliance_rule(id);

-- ============================================================
-- TENANT-CONSISTENCY TRIGGER
-- Prevents cross-tenant references on time_event inserts/updates.
-- Validates that worker, property, and shift (if set) belong to
-- the same tenant as the time_event.
-- ============================================================
CREATE OR REPLACE FUNCTION enforce_time_event_tenant_consistency()
RETURNS TRIGGER AS $$
BEGIN
    IF (SELECT tenant_id FROM worker WHERE id = NEW.worker_id) <> NEW.tenant_id THEN
        RAISE EXCEPTION 'tenant_id mismatch: worker % belongs to a different tenant', NEW.worker_id;
    END IF;

    IF (SELECT tenant_id FROM property WHERE id = NEW.property_id) <> NEW.tenant_id THEN
        RAISE EXCEPTION 'tenant_id mismatch: property % belongs to a different tenant', NEW.property_id;
    END IF;

    IF NEW.shift_id IS NOT NULL THEN
        IF (SELECT tenant_id FROM shift WHERE id = NEW.shift_id) <> NEW.tenant_id THEN
            RAISE EXCEPTION 'tenant_id mismatch: shift % belongs to a different tenant', NEW.shift_id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER time_event_tenant_consistency
    BEFORE INSERT OR UPDATE ON time_event
    FOR EACH ROW
    EXECUTE FUNCTION enforce_time_event_tenant_consistency();

-- ============================================================
-- DEVICE_INFO
-- Track worker devices for debugging and fraud detection.
-- ============================================================
CREATE TABLE device_info (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    worker_id       UUID NOT NULL REFERENCES worker(id),
    tenant_id       UUID NOT NULL REFERENCES tenant(id),

    platform        TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
    os_version      TEXT,
    device_model    TEXT,
    app_version     TEXT,
    push_token      TEXT,

    location_permission TEXT,
    -- 'always', 'when_in_use', 'denied', 'not_determined'
    notification_permission TEXT,
    battery_optimization_exempt BOOLEAN,

    last_seen_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_device_worker ON device_info(worker_id);
CREATE INDEX idx_device_tenant ON device_info(tenant_id);
CREATE UNIQUE INDEX idx_device_worker_platform ON device_info(worker_id, platform);

-- ============================================================
-- UPDATED_AT TRIGGER
-- Automatically update the updated_at column.
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON tenant
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON worker
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON property
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON geofence
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON worker_assignment
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON shift
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON exception_event
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON compliance_rule
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON device_info
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- SEED: Default compliance rules for a new tenant
-- (Run after tenant creation)
-- ============================================================
-- INSERT INTO compliance_rule (tenant_id, name, rule_type, parameters) VALUES
-- ('<tenant_id>', 'Shift window tolerance', 'shift_window_tolerance',
--  '{"tolerance_before_minutes": 30, "tolerance_after_minutes": 15}'),
-- ('<tenant_id>', 'Max geofence distance', 'max_geofence_distance',
--  '{"max_meters": 200}'),
-- ('<tenant_id>', 'Flag mock locations', 'flag_mock_location',
--  '{"action": "flag", "severity": "high"}'),
-- ('<tenant_id>', 'Require approval for manual check-ins', 'require_approval_for_manual',
--  '{"applies_to": ["manual_checkin"]}');
