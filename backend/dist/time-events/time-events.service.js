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
var TimeEventsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TimeEventsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
let TimeEventsService = TimeEventsService_1 = class TimeEventsService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(TimeEventsService_1.name);
    }
    async processBatch(tenantId, workerId, events) {
        const results = [];
        for (const event of events) {
            const result = await this.processOne(tenantId, workerId, event);
            results.push(result);
        }
        return { results };
    }
    async processOne(tenantId, workerId, input) {
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
        const assignmentFlags = await this.checkAssignment(tenantId, workerId, input.propertyId, deviceTs);
        flags.push(...assignmentFlags);
        const finalStatus = flags.length > 0 ? 'flagged' : validationStatus;
        const eventMetadata = {
            ...(input.metadata ?? {}),
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
                        eventType: input.eventType,
                        source: input.source,
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
                    this.logger.warn(`Shift update skipped: shift ${input.shiftId} not found for tenant ${tenantId} / worker ${workerId}`);
                }
            }
            return {
                clientEventId: input.clientEventId,
                status: finalStatus === 'flagged' ? 'flagged' : 'created',
                serverId: created.id,
            };
        }
        catch (err) {
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
            this.logger.error(`Failed to create time event ${input.clientEventId}: ${err instanceof Error ? err.message : err}`);
            return {
                clientEventId: input.clientEventId,
                status: 'rejected',
                reason: 'SERVER_ERROR',
            };
        }
    }
    validate(input) {
        const flags = [];
        if (input.isMockLocation) {
            flags.push('MOCK_LOCATION_DETECTED');
        }
        const needsLocation = TimeEventsService_1.LOCATION_EVENT_TYPES.has(input.eventType);
        if (needsLocation && (input.lat == null || input.lng == null)) {
            flags.push('MISSING_LAT_LNG');
        }
        if (needsLocation &&
            input.accuracyMeters != null &&
            input.accuracyMeters > TimeEventsService_1.MAX_ACCEPTABLE_ACCURACY_M) {
            flags.push('LOW_ACCURACY');
        }
        return {
            status: flags.length > 0 ? 'flagged' : 'pending',
            flags,
        };
    }
    async checkAssignment(tenantId, workerId, propertyId, deviceTs) {
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
    isUniqueConstraintError(err) {
        if (typeof err !== 'object' || err === null)
            return false;
        const code = err.code;
        return code === 'P2002';
    }
};
exports.TimeEventsService = TimeEventsService;
TimeEventsService.LOCATION_EVENT_TYPES = new Set([
    'clock_in',
    'clock_out',
]);
TimeEventsService.MAX_ACCEPTABLE_ACCURACY_M = 150;
exports.TimeEventsService = TimeEventsService = TimeEventsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], TimeEventsService);
//# sourceMappingURL=time-events.service.js.map