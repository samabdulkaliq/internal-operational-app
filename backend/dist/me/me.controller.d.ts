import { RequestUser } from '../auth/interfaces';
import { MeService } from './me.service';
export declare class MeController {
    private readonly service;
    constructor(service: MeService);
    getAssignments(user: RequestUser): Promise<{
        assignments: {
            id: string;
            propertyId: string;
            propertyName: string;
            propertyLat: number;
            propertyLng: number;
            propertyAddress: string | null;
            schedule: import("@prisma/client/runtime/library").JsonValue;
            geofences: {
                lat: number;
                lng: number;
                id: string;
                label: string;
                radiusMeters: number;
                geofenceType: import(".prisma/client").$Enums.GeofenceType;
            }[];
        }[];
    }>;
    getShiftsToday(user: RequestUser): Promise<{
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
