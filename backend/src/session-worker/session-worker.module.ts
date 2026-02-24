import { Module } from '@nestjs/common';
import { SessionWorkerService } from './session-worker.service';

@Module({
  providers: [SessionWorkerService],
})
export class SessionWorkerModule {}
