import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/decorators';

@Controller('health')
export class HealthController {
  @Get()
  @Public()
  check(): { status: string; ts: string } {
    return {
      status: 'ok',
      ts: new Date().toISOString(),
    };
  }
}
