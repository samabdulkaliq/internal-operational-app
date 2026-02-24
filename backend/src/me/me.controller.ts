import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators';
import { RequestUser } from '../auth/interfaces';
import { MeService } from './me.service';

@Controller('me')
export class MeController {
  constructor(private readonly service: MeService) {}

  @Get('assignments')
  async getAssignments(@CurrentUser() user: RequestUser) {
    return this.service.getAssignments(user.tenantId, user.workerId);
  }

  @Get('shifts/today')
  async getShiftsToday(@CurrentUser() user: RequestUser) {
    return this.service.getShiftsToday(user.tenantId, user.workerId);
  }
}
