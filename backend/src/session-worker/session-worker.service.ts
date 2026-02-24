import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Background worker that runs on a schedule to:
 * 1. Pair clock_in / clock_out events into TimeSession records.
 * 2. Flag open sessions past their shift end as missing_clock_out.
 * 3. Write audit_log entries for every action taken.
 */
@Injectable()
export class SessionWorkerService {
  private readonly logger = new Logger(SessionWorkerService.name);

  private static readonly GRACE_PERIOD_MINS = 60;

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async run(): Promise<void> {
    this.logger.log('Session derivation job started');

    try {
      await this.deriveNewSessions();
      await this.closeExpiredSessions();
      await this.flagMissingClockIns();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Session derivation job failed: ${msg}`);
    }

    this.logger.log('Session derivation job finished');
  }

  /**
   * Find clock_in events that do not yet have a TimeSession and create one.
   */
  private async deriveNewSessions(): Promise<void> {
    const orphanedClockIns = await this.prisma.timeEvent.findMany({
      where: {
        eventType: 'clock_in',
        sessionEnterEvents: { none: {} },
      },
      select: {
        id: true,
        tenantId: true,
        workerId: true,
        propertyId: true,
        shiftId: true,
        deviceTimestamp: true,
      },
      take: 200,
      orderBy: { deviceTimestamp: 'asc' },
    });

    for (const clockIn of orphanedClockIns) {
      const matchingClockOut = await this.prisma.timeEvent.findFirst({
        where: {
          tenantId: clockIn.tenantId,
          workerId: clockIn.workerId,
          propertyId: clockIn.propertyId,
          eventType: 'clock_out',
          deviceTimestamp: { gt: clockIn.deviceTimestamp },
          sessionExitEvents: { none: {} },
        },
        orderBy: { deviceTimestamp: 'asc' },
        select: { id: true, deviceTimestamp: true },
      });

      const durationMins = matchingClockOut
        ? Math.round(
            (matchingClockOut.deviceTimestamp.getTime() -
              clockIn.deviceTimestamp.getTime()) /
              60_000,
          )
        : null;

      await this.prisma.timeSession.create({
        data: {
          tenantId: clockIn.tenantId,
          workerId: clockIn.workerId,
          propertyId: clockIn.propertyId,
          shiftId: clockIn.shiftId,
          enterEventId: clockIn.id,
          exitEventId: matchingClockOut?.id ?? null,
          status: matchingClockOut ? 'closed' : 'open',
          startedAt: clockIn.deviceTimestamp,
          endedAt: matchingClockOut?.deviceTimestamp ?? null,
          durationMins,
        },
      });

      await this.audit(clockIn.tenantId, 'SESSION_CREATED', 'time_session', clockIn.id, {
        enterEventId: clockIn.id,
        exitEventId: matchingClockOut?.id ?? null,
        status: matchingClockOut ? 'closed' : 'open',
      });
    }

    if (orphanedClockIns.length > 0) {
      this.logger.log(`Derived ${orphanedClockIns.length} new sessions`);
    }
  }

  /**
   * Find open sessions whose shift has ended (plus grace period) with no
   * clock_out, close them as closed_by_system, and flag for manager review.
   */
  private async closeExpiredSessions(): Promise<void> {
    const cutoff = new Date(
      Date.now() - SessionWorkerService.GRACE_PERIOD_MINS * 60_000,
    );

    const expiredSessions = await this.prisma.timeSession.findMany({
      where: {
        status: 'open',
        startedAt: { lt: cutoff },
      },
      select: {
        id: true,
        tenantId: true,
        workerId: true,
        propertyId: true,
        shiftId: true,
        startedAt: true,
        enterEventId: true,
      },
      take: 100,
    });

    for (const session of expiredSessions) {
      await this.prisma.timeSession.update({
        where: { id: session.id },
        data: {
          status: 'closed_by_system',
          endedAt: new Date(),
          durationMins: Math.round(
            (Date.now() - session.startedAt.getTime()) / 60_000,
          ),
        },
      });

      await this.prisma.exceptionEvent.create({
        data: {
          tenantId: session.tenantId,
          workerId: session.workerId,
          propertyId: session.propertyId,
          shiftId: session.shiftId,
          timeEventId: session.enterEventId,
          exceptionType: 'missing_clock_out',
          severity: 'medium',
          status: 'open',
          details: {
            sessionId: session.id,
            reason: 'Session open past grace period; closed by system.',
          },
        },
      });

      await this.audit(
        session.tenantId,
        'SESSION_FORCE_CLOSED',
        'time_session',
        session.id,
        {
          reason: 'missing_clock_out',
          workerId: session.workerId,
        },
      );
    }

    if (expiredSessions.length > 0) {
      this.logger.warn(`Force-closed ${expiredSessions.length} expired sessions`);
    }
  }

  /**
   * Find shifts whose scheduled_start has passed (by more than 30 min)
   * that have no associated clock_in event. Create an exception for each.
   */
  private async flagMissingClockIns(): Promise<void> {
    const thirtyMinAgo = new Date(Date.now() - 30 * 60_000);

    const missedShifts = await this.prisma.shift.findMany({
      where: {
        status: 'scheduled',
        scheduledStart: { lt: thirtyMinAgo },
        timeEvents: { none: { eventType: 'clock_in' } },
        exceptionEvents: { none: { exceptionType: 'missing_clock_in' } },
      },
      select: {
        id: true,
        tenantId: true,
        workerId: true,
        propertyId: true,
        scheduledStart: true,
      },
      take: 100,
    });

    for (const shift of missedShifts) {
      await this.prisma.exceptionEvent.create({
        data: {
          tenantId: shift.tenantId,
          workerId: shift.workerId,
          propertyId: shift.propertyId,
          shiftId: shift.id,
          exceptionType: 'missing_clock_in',
          severity: 'high',
          status: 'open',
          details: {
            scheduledStart: shift.scheduledStart.toISOString(),
            detectedAt: new Date().toISOString(),
          },
        },
      });

      await this.audit(
        shift.tenantId,
        'EXCEPTION_CREATED',
        'shift',
        shift.id,
        {
          exceptionType: 'missing_clock_in',
          workerId: shift.workerId,
        },
      );
    }

    if (missedShifts.length > 0) {
      this.logger.warn(`Flagged ${missedShifts.length} missing clock-ins`);
    }
  }

  private async audit(
    tenantId: string,
    eventType: string,
    targetType: string,
    targetId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.auditLog
      .create({
        data: {
          tenantId,
          eventType,
          actorRole: 'system',
          targetType,
          targetId,
          payload: payload as Prisma.InputJsonValue,
        },
      })
      .catch((err) => {
        this.logger.error(`Audit log write failed: ${err.message}`);
      });
  }
}
