import { RequestUser } from '../auth/interfaces';
import { BatchSyncRequestDto, BatchSyncResponse } from './dto/batch-sync.dto';
import { TimeEventsService } from './time-events.service';
export declare class TimeEventsController {
    private readonly service;
    constructor(service: TimeEventsService);
    batchSync(user: RequestUser, dto: BatchSyncRequestDto): Promise<BatchSyncResponse>;
}
