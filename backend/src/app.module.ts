import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';
import { TimeEventsModule } from './time-events/time-events.module';
import { MeModule } from './me/me.module';
import { SessionWorkerModule } from './session-worker/session-worker.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    HealthModule,
    TimeEventsModule,
    MeModule,
    SessionWorkerModule,
  ],
})
export class AppModule {}
