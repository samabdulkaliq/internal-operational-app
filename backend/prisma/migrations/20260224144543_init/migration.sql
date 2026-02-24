-- AlterTable
ALTER TABLE "audit_log" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "compliance_rule" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "device_info" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "exception_event" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "geofence" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "property" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "shift" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "tenant" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "time_event" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "time_session" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "worker" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "worker_assignment" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- RenameForeignKey
ALTER TABLE "audit_log" RENAME CONSTRAINT "audit_actor_fkey" TO "audit_log_actor_id_fkey";

-- RenameForeignKey
ALTER TABLE "audit_log" RENAME CONSTRAINT "audit_tenant_fkey" TO "audit_log_tenant_id_fkey";

-- RenameForeignKey
ALTER TABLE "compliance_rule" RENAME CONSTRAINT "cr_tenant_fkey" TO "compliance_rule_tenant_id_fkey";

-- RenameForeignKey
ALTER TABLE "device_info" RENAME CONSTRAINT "di_worker_fkey" TO "device_info_worker_id_fkey";

-- RenameForeignKey
ALTER TABLE "exception_event" RENAME CONSTRAINT "ee_property_fkey" TO "exception_event_property_id_fkey";

-- RenameForeignKey
ALTER TABLE "exception_event" RENAME CONSTRAINT "ee_resolved_by_fkey" TO "exception_event_resolved_by_fkey";

-- RenameForeignKey
ALTER TABLE "exception_event" RENAME CONSTRAINT "ee_shift_fkey" TO "exception_event_shift_id_fkey";

-- RenameForeignKey
ALTER TABLE "exception_event" RENAME CONSTRAINT "ee_tenant_fkey" TO "exception_event_tenant_id_fkey";

-- RenameForeignKey
ALTER TABLE "exception_event" RENAME CONSTRAINT "ee_time_event_fkey" TO "exception_event_time_event_id_fkey";

-- RenameForeignKey
ALTER TABLE "exception_event" RENAME CONSTRAINT "ee_worker_fkey" TO "exception_event_worker_id_fkey";

-- RenameForeignKey
ALTER TABLE "shift" RENAME CONSTRAINT "shift_assignment_fkey" TO "shift_assignment_id_fkey";

-- RenameForeignKey
ALTER TABLE "shift" RENAME CONSTRAINT "shift_property_fkey" TO "shift_property_id_fkey";

-- RenameForeignKey
ALTER TABLE "shift" RENAME CONSTRAINT "shift_tenant_fkey" TO "shift_tenant_id_fkey";

-- RenameForeignKey
ALTER TABLE "shift" RENAME CONSTRAINT "shift_worker_fkey" TO "shift_worker_id_fkey";

-- RenameForeignKey
ALTER TABLE "time_event" RENAME CONSTRAINT "te_approved_by_fkey" TO "time_event_approved_by_fkey";

-- RenameForeignKey
ALTER TABLE "time_event" RENAME CONSTRAINT "te_compliance_rule_fkey" TO "time_event_compliance_rule_id_fkey";

-- RenameForeignKey
ALTER TABLE "time_event" RENAME CONSTRAINT "te_property_fkey" TO "time_event_property_id_fkey";

-- RenameForeignKey
ALTER TABLE "time_event" RENAME CONSTRAINT "te_shift_fkey" TO "time_event_shift_id_fkey";

-- RenameForeignKey
ALTER TABLE "time_event" RENAME CONSTRAINT "te_tenant_fkey" TO "time_event_tenant_id_fkey";

-- RenameForeignKey
ALTER TABLE "time_event" RENAME CONSTRAINT "te_worker_fkey" TO "time_event_worker_id_fkey";

-- RenameForeignKey
ALTER TABLE "time_session" RENAME CONSTRAINT "ts_enter_fkey" TO "time_session_enter_event_id_fkey";

-- RenameForeignKey
ALTER TABLE "time_session" RENAME CONSTRAINT "ts_exit_fkey" TO "time_session_exit_event_id_fkey";

-- RenameForeignKey
ALTER TABLE "worker_assignment" RENAME CONSTRAINT "wa_property_fkey" TO "worker_assignment_property_id_fkey";

-- RenameForeignKey
ALTER TABLE "worker_assignment" RENAME CONSTRAINT "wa_tenant_fkey" TO "worker_assignment_tenant_id_fkey";

-- RenameForeignKey
ALTER TABLE "worker_assignment" RENAME CONSTRAINT "wa_worker_fkey" TO "worker_assignment_worker_id_fkey";

-- AddForeignKey
ALTER TABLE "device_info" ADD CONSTRAINT "device_info_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "idx_audit_actor" RENAME TO "audit_log_actor_id_idx";

-- RenameIndex
ALTER INDEX "idx_audit_created" RENAME TO "audit_log_created_at_idx";

-- RenameIndex
ALTER INDEX "idx_audit_tenant_event" RENAME TO "audit_log_tenant_id_event_type_idx";

-- RenameIndex
ALTER INDEX "idx_compliance_active" RENAME TO "compliance_rule_is_active_idx";

-- RenameIndex
ALTER INDEX "idx_compliance_tenant" RENAME TO "compliance_rule_tenant_id_idx";

-- RenameIndex
ALTER INDEX "device_info_worker_platform_key" RENAME TO "device_info_worker_id_platform_key";

-- RenameIndex
ALTER INDEX "idx_device_tenant" RENAME TO "device_info_tenant_id_idx";

-- RenameIndex
ALTER INDEX "idx_device_worker" RENAME TO "device_info_worker_id_idx";

-- RenameIndex
ALTER INDEX "idx_exception_shift" RENAME TO "exception_event_shift_id_idx";

-- RenameIndex
ALTER INDEX "idx_exception_status" RENAME TO "exception_event_status_idx";

-- RenameIndex
ALTER INDEX "idx_exception_tenant" RENAME TO "exception_event_tenant_id_idx";

-- RenameIndex
ALTER INDEX "idx_exception_type" RENAME TO "exception_event_exception_type_idx";

-- RenameIndex
ALTER INDEX "idx_exception_worker" RENAME TO "exception_event_worker_id_idx";

-- RenameIndex
ALTER INDEX "idx_geofence_property" RENAME TO "geofence_property_id_idx";

-- RenameIndex
ALTER INDEX "idx_geofence_tenant" RENAME TO "geofence_tenant_id_idx";

-- RenameIndex
ALTER INDEX "idx_property_coords" RENAME TO "property_lat_lng_idx";

-- RenameIndex
ALTER INDEX "idx_property_tenant" RENAME TO "property_tenant_id_idx";

-- RenameIndex
ALTER INDEX "idx_shift_property" RENAME TO "shift_property_id_idx";

-- RenameIndex
ALTER INDEX "idx_shift_scheduled" RENAME TO "shift_scheduled_start_scheduled_end_idx";

-- RenameIndex
ALTER INDEX "idx_shift_status" RENAME TO "shift_status_idx";

-- RenameIndex
ALTER INDEX "idx_shift_tenant" RENAME TO "shift_tenant_id_idx";

-- RenameIndex
ALTER INDEX "idx_shift_worker" RENAME TO "shift_worker_id_idx";

-- RenameIndex
ALTER INDEX "idx_te_event_type" RENAME TO "time_event_event_type_idx";

-- RenameIndex
ALTER INDEX "idx_te_shift" RENAME TO "time_event_shift_id_idx";

-- RenameIndex
ALTER INDEX "idx_te_validation" RENAME TO "time_event_validation_status_idx";

-- RenameIndex
ALTER INDEX "uq_tenant_client_event" RENAME TO "time_event_tenant_id_client_event_id_key";

-- RenameIndex
ALTER INDEX "idx_session_status" RENAME TO "time_session_status_idx";

-- RenameIndex
ALTER INDEX "idx_session_tenant_property" RENAME TO "time_session_tenant_id_property_id_idx";

-- RenameIndex
ALTER INDEX "idx_session_tenant_worker" RENAME TO "time_session_tenant_id_worker_id_idx";

-- RenameIndex
ALTER INDEX "idx_worker_phone" RENAME TO "worker_phone_idx";

-- RenameIndex
ALTER INDEX "idx_worker_tenant" RENAME TO "worker_tenant_id_idx";

-- RenameIndex
ALTER INDEX "idx_assignment_property" RENAME TO "worker_assignment_property_id_idx";

-- RenameIndex
ALTER INDEX "idx_assignment_tenant" RENAME TO "worker_assignment_tenant_id_idx";

-- RenameIndex
ALTER INDEX "idx_assignment_worker" RENAME TO "worker_assignment_worker_id_idx";
