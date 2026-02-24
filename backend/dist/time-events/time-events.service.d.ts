import { PrismaService } from '../prisma/prisma.service';
import { TimeEventInput, BatchSyncResponse } from './dto/batch-sync.dto';
export declare class TimeEventsService {
    private readonly prisma;
    private readonly logger;
    private static readonly LOCATION_EVENT_TYPES;
    private static readonly MAX_ACCEPTABLE_ACCURACY_M;
    constructor(prisma: PrismaService);
    processBatch(tenantId: string, workerId: string, events: TimeEventInput[]): Promise<BatchSyncResponse>;
    private processOne;
    private validate;
    private checkAssignment;
    private isUniqueConstraintError;
}
