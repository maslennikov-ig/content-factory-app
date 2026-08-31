import { Command, Positional } from 'nestjs-command';
import { Injectable, Logger } from '@nestjs/common';
import {
  PRODUCT_EVENT_RETENTION_DAYS,
  ProductEventsRepository,
} from '@contentfactory/nestjs-libraries/database/prisma/product-events/product-events.repository';

@Injectable()
export class PruneProductEvents {
  private readonly _logger = new Logger(PruneProductEvents.name);

  constructor(private _productEventsRepository: ProductEventsRepository) {}

  @Command({
    command: 'product-events:prune [days]',
    describe: 'Delete product events older than the retention window',
  })
  async prune(
    @Positional({
      name: 'days',
      type: 'number',
      default: PRODUCT_EVENT_RETENTION_DAYS,
    })
    days: number
  ) {
    const window =
      Number(days) > 0 ? Number(days) : PRODUCT_EVENT_RETENTION_DAYS;
    const { deleted, before } =
      await this._productEventsRepository.pruneOlderThan(window);
    this._logger.log(
      `Deleted ${deleted} product events recorded before ${before.toISOString()}`
    );
    return true;
  }
}
