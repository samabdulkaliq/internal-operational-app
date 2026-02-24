import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  TimeEventInput,
  BatchResultItem,
  BatchSyncResponse,
} from './dto/batch-sync.dto';
import {
  TimeEventSource,
  TimeEventType,
  ValidationStatus,
} from '@prisma/client';

interface ValidationResult {
  status: ValidationStatus;
  flags: string[];
}

@Injectable()
export class TimeEventsService {
  private readonly logger = new Logger(TimeEventsService.name);

  private static readonly LOCATION_EVENT_TYPES: ReadonlySet<string> = new Set([
    'clock_in',
    'clock_out',
  ]);

  private static readonly MAX_ACCEPTABLE_ACCURACY_M = 150;

  constructor(private readonly prisma: PrismaService) {}

  async processBatch(
    tenantId: string,
    workerId: string,
    events: TimeEventInput[],
  ): Promise<BatchSyncResponse> {
    const results: BatchResultItem[] = [];

    for (const event of events) {
      const result = await this.processOne(tenantId, workerId, event);
      results.push(result);
    }

    return { results };
  }

  private async processOne(
    tenantId: string,
    workerId: string,
    input: TimeEventInput,
  ): Promise<BatchResultItem> {
    const deviceTs = new Date(input.deviceTimestamp);
    if (isNaN(deviceTs.getTime())) {
      return {
        clientEventId: input.clientEventId,
        status: 'rejected',
        reason: 'INVALID_DEVICE_TIMESTAMP',
      };
    }

    const existing = await this.prisma.timeEvent.findUnique({
      where: {
        uq_tenant_client_event: {
          tenantId,
          clientEventId: input.clientEventId,
        },
      },
      select: { id: true },
    });

    if (existing) {
      return {
        clientEventId: input.clientEventId,
        status: 'duplicate',
        existingServerId: existing.id,
      };
    }

    const property = await this.prisma.property.findFirst({
      where: { id: input.propertyId, tenantId },
      select: { id: true },
    });

    if (!property) {
      return {
        clientEventId: input.clientEventId,
        status: 'rejected',
        reason: 'PROPERTY_NOT_FOUND_OR_WRONG_TENANT',
      };
    }

    const { status: validationStatus, flags } = this.validate(input);

    const assignmentFlags = await this.checkAssignment(
      tenantId,
      workerId,
      input.propertyId,
      deviceTs,
    );
    flags.push(...assignmentFlags);

    const finalStatus: ValidationStatus =
      flags.length > 0 ? 'flagged' : validationStatus;

    const eventMetadata = {
      ...((input.metadata as object) ?? {}),
      ...(flags.length > 0 ? { validationFlags: flags } : {}),
    };

    try {
      const receivedAt = new Date();

      const [created] = await this.prisma.$transaction([
        this.prisma.timeEvent.create({
          data: {
            clientEventId: input.clientEventId,
            tenantId,
            workerId,
            propertyId: input.propertyId,
            shiftId: input.shiftId ?? null,
            eventType: input.eventType as TimeEventType,
            source: input.source as TimeEventSource,
            deviceTimestamp: deviceTs,
            receivedAt,
            lat: input.lat ?? null,
            lng: input.lng ?? null,
            accuracyMeters: input.accuracyMeters ?? null,
            locationProvider: input.locationProvider ?? null,
            batteryLevel: input.batteryLevel ?? null,
            isMockLocation: input.isMockLocation ?? false,
            validationStatus: finalStatus,
            metadata: eventMetadata,
          },
        }),
        this.prisma.auditLog.create({
          data: {
            tenantId,
            eventType: 'TIME_EVENT_CREATED',
            actorId: workerId,
            actorRole: 'cleaner',
            targetType: 'time_event',
            payload: {
              clientEventId: input.clientEventId,
              source: input.source,
              eventType: input.eventType,
              lat: input.lat,
              lng: input.lng,
              accuracyMeters: input.accuracyMeters,
              isMockLocation: input.isMockLocation,
              deviceTimestamp: input.deviceTimestamp,
              validationStatus: finalStatus,
              flags,
            },
          },
        }),
      ]);

      await this.prisma.auditLog.updateMany({
        where: {
          tenantId,
          eventType: 'TIME_EVENT_CREATED',
          payload: { path: ['clientEventId'], equals: input.clientEventId },
          targetId: null,
        },
        data: { targetId: created.id },
      });

      if (input.shiftId && input.eventType === 'clock_in') {
        const updated = await this.prisma.shift.updateMany({
          where: { id: input.shiftId, tenantId, workerId },
          data: { actualStart: deviceTs, status: 'in_progress' },
        });

        if (updated.count === 0) {
          this.logger.warn(
            `Shift update skipped: shift ${input.shiftId} not found for tenant ${tenantId} / worker ${workerId}`,
          );
        }
      }

      return {
        clientEventId: input.clientEventId,
        status: finalStatus === 'flagged' ? 'flagged' : 'created',
        serverId: created.id,
      };
    } catch (err: unknown) {
      if (this.isUniqueConstraintError(err)) {
        const race = await this.prisma.timeEvent.findUnique({
          where: {
            uq_tenant_client_event: { tenantId, clientEventId: input.clientEventId },
          },
          select: { id: true },
        });
        if (race) {
          return {
            clientEventId: input.clientEventId,
            status: 'duplicate',
            existingServerId: race.id,
          };
        }
      }

      this.logger.error(
        `Failed to create time event ${input.clientEventId}: ${err instanceof Error ? err.message : err}`,
      );
      return {
        clientEventId: input.clientEventId,
        status: 'rejected',
        reason: 'SERVER_ERROR',
      };
    }
  }

  private validate(input: TimeEventInput): ValidationResult {
    const flags: string[] = [];

    if (input.isMockLocation) {
      flags.push('MOCK_LOCATION_DETECTED');
    }

    const needsLocation = TimeEventsService.LOCATION_EVENT_TYPES.has(
      input.eventType,
    );

    if (needsLocation && (input.lat == null || input.lng == null)) {
      flags.push('MISSING_LAT_LNG');
    }

    if (
      needsLocation &&
      input.accuracyMeters != null &&
      input.accuracyMeters > TimeEventsService.MAX_ACCEPTABLE_ACCURACY_M
    ) {
      flags.push('LOW_ACCURACY');
    }

    return {
      status: flags.length > 0 ? 'flagged' : 'pending',
      flags,
    };
  }

  /**
   * Soft check: is this worker assigned to this property covering deviceTs?
   * Returns flag strings (empty array = assigned, non-empty = not assigned).
   */
  private async checkAssignment(
    tenantId: string,
    workerId: string,
    propertyId: string,
    deviceTs: Date,
  ): Promise<string[]> {
    const assignment = await this.prisma.workerAssignment.findFirst({
      where: {
        tenantId,
        workerId,
        propertyId,
        isActive: true,
        startDate: { lte: deviceTs },
        OR: [{ endDate: null }, { endDate: { gte: deviceTs } }],
      },
      select: { id: true },
    });

    if (!assignment) {
      return ['WORKER_NOT_ASSIGNED_TO_PROPERTY'];
    }

    return [];
  }

  private isUniqueConstraintError(err: unknown): boolean {
    if (typeof err !== 'object' || err === null) return false;
    const code = (err as Record<string, unknown>).code;
    return code === 'P2002';
  }
}
