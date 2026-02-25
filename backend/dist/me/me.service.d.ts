import { PrismaService } from '../prisma/prisma.service';
export declare class MeService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    getAssignments(tenantId: string, workerId: string): Promise<{
        assignments: {
            id: string;
            propertyId: string;
            propertyName: string;
            propertyLat: number;
            propertyLng: number;
            propertyAddress: string | null;
            schedule: import("@prisma/client/runtime/library").JsonValue;
            geofences: {
                id: string;
                lat: number;
                lng: number;
                label: string;
                radiusMeters: number;
                geofenceType: import(".prisma/client").$Enums.GeofenceType;
            }[];
        }[];
    }>;
    getShiftsToday(tenantId: string, workerId: string): Promise<{
        shifts: {
            id: string;
            propertyId: string;
            propertyName: string;
            scheduledStart: string;
            scheduledEnd: string;
            status: import(".prisma/client").$Enums.ShiftStatus;
        }[];
    }>;
}
