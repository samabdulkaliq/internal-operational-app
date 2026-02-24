import { BadRequestException, Body, Controller, HttpCode, Post } from '@nestjs/common';
import { CurrentUser, Roles } from '../auth/decorators';
import { RequestUser } from '../auth/interfaces';
import { BatchSyncRequestDto, BatchSyncResponse } from './dto/batch-sync.dto';
import { TimeEventsService } from './time-events.service';

const MAX_BATCH_SIZE = 200;

@Controller('time-events')
export class TimeEventsController {
  constructor(private readonly service: TimeEventsService) {}

  @Post('batch')
  @Roles('cleaner', 'supervisor')
  @HttpCode(207)
  async batchSync(
    @CurrentUser() user: RequestUser,
    @Body() dto: BatchSyncRequestDto,
  ): Promise<BatchSyncResponse> {
    if (dto.events.length > MAX_BATCH_SIZE) {
      throw new BadRequestException('BATCH_TOO_LARGE');
    }

    return this.service.processBatch(user.tenantId, user.workerId, dto.events);
  }
}
