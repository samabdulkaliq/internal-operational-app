"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var SessionWorkerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionWorkerService = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const prisma_service_1 = require("../prisma/prisma.service");
let SessionWorkerService = SessionWorkerService_1 = class SessionWorkerService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(SessionWorkerService_1.name);
    }
    async run() {
        this.logger.log('Session derivation job started');
        try {
            await this.deriveNewSessions();
            await this.closeExpiredSessions();
            await this.flagMissingClockIns();
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            this.logger.error(`Session derivation job failed: ${msg}`);
        }
        this.logger.log('Session derivation job finished');
    }
    async deriveNewSessions() {
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
                ? Math.round((matchingClockOut.deviceTimestamp.getTime() -
                    clockIn.deviceTimestamp.getTime()) /
                    60_000)
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
    async closeExpiredSessions() {
        const cutoff = new Date(Date.now() - SessionWorkerService_1.GRACE_PERIOD_MINS * 60_000);
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
                    durationMins: Math.round((Date.now() - session.startedAt.getTime()) / 60_000),
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
            await this.audit(session.tenantId, 'SESSION_FORCE_CLOSED', 'time_session', session.id, {
                reason: 'missing_clock_out',
                workerId: session.workerId,
            });
        }
        if (expiredSessions.length > 0) {
            this.logger.warn(`Force-closed ${expiredSessions.length} expired sessions`);
        }
    }
    async flagMissingClockIns() {
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
            await this.audit(shift.tenantId, 'EXCEPTION_CREATED', 'shift', shift.id, {
                exceptionType: 'missing_clock_in',
                workerId: shift.workerId,
            });
        }
        if (missedShifts.length > 0) {
            this.logger.warn(`Flagged ${missedShifts.length} missing clock-ins`);
        }
    }
    async audit(tenantId, eventType, targetType, targetId, payload) {
        await this.prisma.auditLog
            .create({
            data: {
                tenantId,
                eventType,
                actorRole: 'system',
                targetType,
                targetId,
                payload: payload,
            },
        })
            .catch((err) => {
            this.logger.error(`Audit log write failed: ${err.message}`);
        });
    }
};
exports.SessionWorkerService = SessionWorkerService;
SessionWorkerService.GRACE_PERIOD_MINS = 60;
__decorate([
    (0, schedule_1.Cron)(schedule_1.CronExpression.EVERY_5_MINUTES),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], SessionWorkerService.prototype, "run", null);
exports.SessionWorkerService = SessionWorkerService = SessionWorkerService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], SessionWorkerService);
//# sourceMappingURL=session-worker.service.js.map