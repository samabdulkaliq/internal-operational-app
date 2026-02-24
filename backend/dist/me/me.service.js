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
Object.defineProperty(exports, "__esModule", { value: true });
exports.MeService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
let MeService = class MeService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async getAssignments(tenantId, workerId) {
        const assignments = await this.prisma.workerAssignment.findMany({
            where: {
                tenantId,
                workerId,
                isActive: true,
            },
            include: {
                property: {
                    select: {
                        id: true,
                        name: true,
                        lat: true,
                        lng: true,
                        address: true,
                        geofences: {
                            where: { isActive: true },
                            select: {
                                id: true,
                                lat: true,
                                lng: true,
                                radiusMeters: true,
                                label: true,
                                geofenceType: true,
                            },
                        },
                    },
                },
            },
        });
        return {
            assignments: assignments.map((a) => ({
                id: a.id,
                propertyId: a.property.id,
                propertyName: a.property.name,
                propertyLat: a.property.lat,
                propertyLng: a.property.lng,
                propertyAddress: a.property.address,
                schedule: a.schedule,
                geofences: a.property.geofences,
            })),
        };
    }
    async getShiftsToday(tenantId, workerId) {
        const now = new Date();
        const startOfDay = new Date(now);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(now);
        endOfDay.setHours(23, 59, 59, 999);
        const shifts = await this.prisma.shift.findMany({
            where: {
                tenantId,
                workerId,
                scheduledStart: { lte: endOfDay },
                scheduledEnd: { gte: startOfDay },
            },
            include: {
                property: {
                    select: { id: true, name: true },
                },
            },
            orderBy: { scheduledStart: 'asc' },
        });
        return {
            shifts: shifts.map((s) => ({
                id: s.id,
                propertyId: s.property.id,
                propertyName: s.property.name,
                scheduledStart: s.scheduledStart.toISOString(),
                scheduledEnd: s.scheduledEnd.toISOString(),
                status: s.status,
            })),
        };
    }
};
exports.MeService = MeService;
exports.MeService = MeService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], MeService);
//# sourceMappingURL=me.service.js.map