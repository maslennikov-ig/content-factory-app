import { Controller, Get, Res } from '@nestjs/common';
import { Response } from 'express';
import { WorkerReadinessService } from './worker-readiness.service';

@Controller('health')
export class HealthController {
  constructor(private readonly readiness: WorkerReadinessService) {}

  @Get('/status')
  async getHealthStatus(@Res() res: Response) {
    const ready = await this.readiness.isReady();
    return res.status(ready ? 200 : 503).json({ status: ready ? 'ok' : 'error' });
  }
}
