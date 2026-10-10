import { Command } from 'nestjs-command';
import { Injectable } from '@nestjs/common';
import { IntegrationService, TokenRefreshBatchResult } from '@contentfactory/nestjs-libraries/database/prisma/integrations/integration.service';

@Injectable()
export class RefreshTokens {
  constructor(private _integrationService: IntegrationService) {}
  @Command({
    command: 'refresh',
    describe: 'Refresh all tokens',
  })
  async refresh() {
    let result: TokenRefreshBatchResult;
    try {
      result = await this._integrationService.refreshTokens();
    } catch {
      throw new Error('Token refresh batch could not start');
    }
    console.log(JSON.stringify({ event: 'token_refresh_batch', ...result }));
    if (result.reconnectRequired || result.failed || result.notificationFailures) {
      process.exitCode = 1;
    }
    return result;
  }
}
