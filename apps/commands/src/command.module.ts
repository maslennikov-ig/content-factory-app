import { Module } from '@nestjs/common';
import { CommandModule as ExternalCommandModule } from 'nestjs-command';
import { DatabaseModule } from '@contentfactory/nestjs-libraries/database/prisma/database.module';
import { getTemporalCommandModule } from '@contentfactory/nestjs-libraries/temporal/temporal.module';
import { RefreshTokens } from './tasks/refresh.tokens';
import { ConfigurationTask } from './tasks/configuration';
import { PruneProductEvents } from './tasks/prune.product.events';
import { RerenderAdaptationBold } from './tasks/rerender.adaptation.bold';

@Module({
  // `DatabaseModule` wires services that take a `TemporalService` — the
  // notification service among them — so without a Temporal module in this
  // graph no command could start at all, not only the ones that publish.
  // `getTemporalCommandModule()` is the client-only variant: it registers the
  // service globally, opens no socket before it is used, and leaves nothing
  // running that would keep a one-shot command alive after it has finished.
  imports: [ExternalCommandModule, DatabaseModule, getTemporalCommandModule()],
  controllers: [],
  providers: [
    RefreshTokens,
    ConfigurationTask,
    PruneProductEvents,
    RerenderAdaptationBold,
  ],
  get exports() {
    return [...this.imports, ...this.providers];
  },
})
export class CommandModule {}
