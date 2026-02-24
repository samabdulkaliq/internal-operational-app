import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MeService {
  constructor(private readonly prisma: PrismaService) {}

  async getAssignments(tenantId: string, workerId: string) {
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

  async getShiftsToday(tenantId: string, workerId: string) {
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
}
