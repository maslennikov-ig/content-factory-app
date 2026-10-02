import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RuntimeMonitorService } from '@contentfactory/backend/services/monitor/runtime-monitor.service';

@ApiTags('Monitor')
@Controller('/monitor')
export class MonitorController {
  constructor(private readonly monitor: RuntimeMonitorService) {}

  @Get('/ready')
  async getReadiness() {
    if (!(await this.monitor.isReady())) {
      throw new ServiceUnavailableException({
        status: 'error',
        message: 'Runtime dependencies are unavailable.',
      });
    }
    return { status: 'success', message: 'Runtime dependencies are ready.' };
  }

  @Get('/queue/:name')
  async getMessagesGroup(@Param('name') name: string) {
    if (!this.monitor.isKnownQueue(name)) {
      throw new NotFoundException({
        status: 'error',
        message: 'Unknown queue.',
      });
    }
    if (!(await this.monitor.isQueueReady(name))) {
      throw new ServiceUnavailableException({
        status: 'error',
        message: 'Queue is unavailable.',
      });
    }
    return {
      status: 'success',
      message: `Queue ${name} is healthy.`,
    };
  }
}
