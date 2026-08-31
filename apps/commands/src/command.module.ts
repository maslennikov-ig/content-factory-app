import { Module } from '@nestjs/common';
import { CommandModule as ExternalCommandModule } from 'nestjs-command';
import { DatabaseModule } from '@contentfactory/nestjs-libraries/database/prisma/database.module';
import { RefreshTokens } from './tasks/refresh.tokens';
import { ConfigurationTask } from './tasks/configuration';
import { PruneProductEvents } from './tasks/prune.product.events';

@Module({
  imports: [ExternalCommandModule, DatabaseModule],
  controllers: [],
  providers: [RefreshTokens, ConfigurationTask, PruneProductEvents],
  get exports() {
    return [...this.imports, ...this.providers];
  },
})
export class CommandModule {}
