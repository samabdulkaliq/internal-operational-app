import { Module } from '@nestjs/common';
import { TimeEventsController } from './time-events.controller';
import { TimeEventsService } from './time-events.service';

@Module({
  controllers: [TimeEventsController],
  providers: [TimeEventsService],
  exports: [TimeEventsService],
})
export class TimeEventsModule {}
