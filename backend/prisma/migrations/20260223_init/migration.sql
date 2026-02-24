-- CreateEnum
CREATE TYPE "WorkerRole" AS ENUM ('cleaner', 'supervisor', 'manager', 'admin');
CREATE TYPE "GeofenceType" AS ENUM ('circle', 'polygon');
CREATE TYPE "ShiftStatus" AS ENUM ('scheduled', 'in_progress', 'completed', 'no_show', 'cancelled');
CREATE TYPE "TimeEventType" AS ENUM ('clock_in', 'clock_out', 'break_start', 'break_end');
CREATE TYPE "TimeEventSource" AS ENUM ('geofence_auto', 'push_wake_location', 'significant_change', 'manual_checkin', 'ble_beacon', 'nfc_tap', 'wifi_ssid', 'manager_override');
CREATE TYPE "ValidationStatus" AS ENUM ('pending', 'valid', 'invalid', 'flagged');
CREATE TYPE "SessionStatus" AS ENUM ('open', 'closed', 'closed_by_system');
CREATE TYPE "ExceptionType" AS ENUM ('missing_clock_in', 'missing_clock_out', 'late_arrival', 'early_departure', 'mock_location_detected', 'teleportation_anomaly', 'static_coords_anomaly', 'clock_skew_anomaly', 'permission_downgrade', 'outside_geofence', 'manual_review_requested');
CREATE TYPE "Severity" AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE "ExceptionStatus" AS ENUM ('open', 'acknowledged', 'resolved', 'dismissed');
CREATE TYPE "Platform" AS ENUM ('ios', 'android');

-- CreateTable: tenant
CREATE TABLE "tenant" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "tenant_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "tenant_slug_key" ON "tenant"("slug");

-- CreateTable: worker
CREATE TABLE "worker" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "external_id" TEXT,
    "full_name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "role" "WorkerRole" NOT NULL DEFAULT 'cleaner',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "worker_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "idx_worker_tenant" ON "worker"("tenant_id");
CREATE INDEX "idx_worker_phone" ON "worker"("phone");

-- CreateTable: property
CREATE TABLE "property" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "timezone" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "property_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "idx_property_tenant" ON "property"("tenant_id");
CREATE INDEX "idx_property_coords" ON "property"("lat", "lng");

-- CreateTable: geofence
CREATE TABLE "geofence" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "property_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "label" TEXT NOT NULL DEFAULT 'main',
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "radius_meters" INTEGER NOT NULL DEFAULT 150,
    "geofence_type" "GeofenceType" NOT NULL DEFAULT 'circle',
    "polygon_coords" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "geofence_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "idx_geofence_property" ON "geofence"("property_id");
CREATE INDEX "idx_geofence_tenant" ON "geofence"("tenant_id");

-- CreateTable: worker_assignment
CREATE TABLE "worker_assignment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "worker_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "schedule" JSONB NOT NULL DEFAULT '{}',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "worker_assignment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "idx_assignment_worker" ON "worker_assignment"("worker_id");
CREATE INDEX "idx_assignment_property" ON "worker_assignment"("property_id");
CREATE INDEX "idx_assignment_tenant" ON "worker_assignment"("tenant_id");

-- CreateTable: shift
CREATE TABLE "shift" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "worker_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "assignment_id" UUID,
    "scheduled_start" TIMESTAMPTZ NOT NULL,
    "scheduled_end" TIMESTAMPTZ NOT NULL,
    "actual_start" TIMESTAMPTZ,
    "actual_end" TIMESTAMPTZ,
    "status" "ShiftStatus" NOT NULL DEFAULT 'scheduled',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "shift_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "idx_shift_worker" ON "shift"("worker_id");
CREATE INDEX "idx_shift_property" ON "shift"("property_id");
CREATE INDEX "idx_shift_tenant" ON "shift"("tenant_id");
CREATE INDEX "idx_shift_scheduled" ON "shift"("scheduled_start", "scheduled_end");
CREATE INDEX "idx_shift_status" ON "shift"("status");

-- CreateTable: time_event
CREATE TABLE "time_event" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "client_event_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "worker_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "shift_id" UUID,
    "event_type" "TimeEventType" NOT NULL,
    "source" "TimeEventSource" NOT NULL,
    "device_timestamp" TIMESTAMPTZ NOT NULL,
    "server_timestamp" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "accuracy_meters" DOUBLE PRECISION,
    "location_provider" TEXT,
    "battery_level" DOUBLE PRECISION,
    "is_mock_location" BOOLEAN NOT NULL DEFAULT false,
    "validation_status" "ValidationStatus" NOT NULL DEFAULT 'pending',
    "validation_details" JSONB NOT NULL DEFAULT '{}',
    "compliance_rule_id" UUID,
    "requires_approval" BOOLEAN NOT NULL DEFAULT false,
    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "time_event_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "uq_tenant_client_event" ON "time_event"("tenant_id", "client_event_id");
CREATE INDEX "idx_te_tenant_worker_ts" ON "time_event"("tenant_id", "worker_id", "device_timestamp" DESC);
CREATE INDEX "idx_te_tenant_property_ts" ON "time_event"("tenant_id", "property_id", "device_timestamp" DESC);
CREATE INDEX "idx_te_shift" ON "time_event"("shift_id");
CREATE INDEX "idx_te_event_type" ON "time_event"("event_type");
CREATE INDEX "idx_te_validation" ON "time_event"("validation_status");

-- CreateTable: time_session
CREATE TABLE "time_session" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "worker_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "shift_id" UUID,
    "enter_event_id" UUID NOT NULL,
    "exit_event_id" UUID,
    "status" "SessionStatus" NOT NULL DEFAULT 'open',
    "started_at" TIMESTAMPTZ NOT NULL,
    "ended_at" TIMESTAMPTZ,
    "duration_mins" INTEGER,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "time_session_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "idx_session_tenant_worker" ON "time_session"("tenant_id", "worker_id");
CREATE INDEX "idx_session_tenant_property" ON "time_session"("tenant_id", "property_id");
CREATE INDEX "idx_session_status" ON "time_session"("status");

-- CreateTable: audit_log
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "event_type" TEXT NOT NULL,
    "actor_id" UUID,
    "actor_role" TEXT,
    "target_type" TEXT,
    "target_id" UUID,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "idx_audit_tenant_entity" ON "audit_log"("tenant_id", "target_type", "target_id", "created_at" DESC);
CREATE INDEX "idx_audit_tenant_event" ON "audit_log"("tenant_id", "event_type");
CREATE INDEX "idx_audit_actor" ON "audit_log"("actor_id");
CREATE INDEX "idx_audit_created" ON "audit_log"("created_at" DESC);

-- CreateTable: exception_event
CREATE TABLE "exception_event" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "worker_id" UUID,
    "property_id" UUID,
    "shift_id" UUID,
    "time_event_id" UUID,
    "exception_type" "ExceptionType" NOT NULL,
    "severity" "Severity" NOT NULL DEFAULT 'medium',
    "status" "ExceptionStatus" NOT NULL DEFAULT 'open',
    "resolution" TEXT,
    "resolved_by" UUID,
    "resolved_at" TIMESTAMPTZ,
    "notes" TEXT,
    "details" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "exception_event_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "idx_exception_tenant" ON "exception_event"("tenant_id");
CREATE INDEX "idx_exception_worker" ON "exception_event"("worker_id");
CREATE INDEX "idx_exception_shift" ON "exception_event"("shift_id");
CREATE INDEX "idx_exception_status" ON "exception_event"("status");
CREATE INDEX "idx_exception_type" ON "exception_event"("exception_type");

-- CreateTable: compliance_rule
CREATE TABLE "compliance_rule" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "rule_type" TEXT NOT NULL,
    "parameters" JSONB NOT NULL DEFAULT '{}',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "compliance_rule_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "idx_compliance_tenant" ON "compliance_rule"("tenant_id");
CREATE INDEX "idx_compliance_active" ON "compliance_rule"("is_active");

-- CreateTable: device_info
CREATE TABLE "device_info" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "worker_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "platform" "Platform" NOT NULL,
    "os_version" TEXT,
    "device_model" TEXT,
    "app_version" TEXT,
    "push_token" TEXT,
    "location_permission" TEXT,
    "notification_permission" TEXT,
    "battery_optimization_exempt" BOOLEAN,
    "last_seen_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "device_info_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "device_info_worker_platform_key" ON "device_info"("worker_id", "platform");
CREATE INDEX "idx_device_worker" ON "device_info"("worker_id");
CREATE INDEX "idx_device_tenant" ON "device_info"("tenant_id");

-- Foreign Keys
ALTER TABLE "worker" ADD CONSTRAINT "worker_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "property" ADD CONSTRAINT "property_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "geofence" ADD CONSTRAINT "geofence_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "geofence" ADD CONSTRAINT "geofence_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "worker_assignment" ADD CONSTRAINT "wa_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "worker_assignment" ADD CONSTRAINT "wa_worker_fkey" FOREIGN KEY ("worker_id") REFERENCES "worker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "worker_assignment" ADD CONSTRAINT "wa_property_fkey" FOREIGN KEY ("property_id") REFERENCES "property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "shift" ADD CONSTRAINT "shift_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "shift" ADD CONSTRAINT "shift_worker_fkey" FOREIGN KEY ("worker_id") REFERENCES "worker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "shift" ADD CONSTRAINT "shift_property_fkey" FOREIGN KEY ("property_id") REFERENCES "property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "shift" ADD CONSTRAINT "shift_assignment_fkey" FOREIGN KEY ("assignment_id") REFERENCES "worker_assignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "time_event" ADD CONSTRAINT "te_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "time_event" ADD CONSTRAINT "te_worker_fkey" FOREIGN KEY ("worker_id") REFERENCES "worker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "time_event" ADD CONSTRAINT "te_property_fkey" FOREIGN KEY ("property_id") REFERENCES "property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "time_event" ADD CONSTRAINT "te_shift_fkey" FOREIGN KEY ("shift_id") REFERENCES "shift"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "time_event" ADD CONSTRAINT "te_compliance_rule_fkey" FOREIGN KEY ("compliance_rule_id") REFERENCES "compliance_rule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "time_event" ADD CONSTRAINT "te_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "worker"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "time_session" ADD CONSTRAINT "ts_enter_fkey" FOREIGN KEY ("enter_event_id") REFERENCES "time_event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "time_session" ADD CONSTRAINT "ts_exit_fkey" FOREIGN KEY ("exit_event_id") REFERENCES "time_event"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_actor_fkey" FOREIGN KEY ("actor_id") REFERENCES "worker"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "exception_event" ADD CONSTRAINT "ee_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "exception_event" ADD CONSTRAINT "ee_worker_fkey" FOREIGN KEY ("worker_id") REFERENCES "worker"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "exception_event" ADD CONSTRAINT "ee_property_fkey" FOREIGN KEY ("property_id") REFERENCES "property"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "exception_event" ADD CONSTRAINT "ee_shift_fkey" FOREIGN KEY ("shift_id") REFERENCES "shift"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "exception_event" ADD CONSTRAINT "ee_time_event_fkey" FOREIGN KEY ("time_event_id") REFERENCES "time_event"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "exception_event" ADD CONSTRAINT "ee_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "worker"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "compliance_rule" ADD CONSTRAINT "cr_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "device_info" ADD CONSTRAINT "di_worker_fkey" FOREIGN KEY ("worker_id") REFERENCES "worker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Tenant-consistency trigger for time_event
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
    BEFORE INSERT OR UPDATE ON "time_event"
    FOR EACH ROW
    EXECUTE FUNCTION enforce_time_event_tenant_consistency();

-- Immutable audit_log trigger
CREATE OR REPLACE FUNCTION prevent_audit_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'audit_log is append-only. Updates and deletes are not allowed.';
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_immutable
    BEFORE UPDATE OR DELETE ON "audit_log"
    FOR EACH ROW
    EXECUTE FUNCTION prevent_audit_modification();
