import { PrismaService } from '../prisma/prisma.service';
export declare class SessionWorkerService {
    private readonly prisma;
    private readonly logger;
    private static readonly GRACE_PERIOD_MINS;
    constructor(prisma: PrismaService);
    run(): Promise<void>;
    private deriveNewSessions;
    private closeExpiredSessions;
    private flagMissingClockIns;
    private audit;
}
