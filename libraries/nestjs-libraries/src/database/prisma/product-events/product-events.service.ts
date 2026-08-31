import { BadRequestException, Injectable } from '@nestjs/common';
import dayjs from 'dayjs';
import {
  CLIENT_DAILY_ORGANIZATION_QUOTA,
  ProductEventsRepository,
} from '@contentfactory/nestjs-libraries/database/prisma/product-events/product-events.repository';
import {
  PRODUCT_EVENT_NAMES,
  ProductEventName,
  validateProductEventProperties,
} from '@contentfactory/nestjs-libraries/dtos/product-events/product-event.dto';

const CLIENT_PRODUCT_EVENT_NAMES = ['purchase', 'lifetime_claimed'] as const;
const CLIENT_BODY_KEYS = new Set(['name', 'properties', 'deduplicationKey']);
const DANGEROUS_BODY_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

export interface TrustedProductEvent {
  name: ProductEventName;
  properties?: Record<string, unknown>;
  deduplicationKey: string;
  organizationId: string;
  userId: string;
}

@Injectable()
export class ProductEventsService {
  constructor(private _productEventsRepository: ProductEventsRepository) {}

  recordAuthenticated(
    body: unknown,
    context: { userId: string; organizationId: string }
  ) {
    if (
      body === null ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      (Object.getPrototypeOf(body) !== Object.prototype &&
        Object.getPrototypeOf(body) !== null)
    ) {
      throw new BadRequestException('Invalid product event body');
    }

    const envelope = body as Record<string, unknown>;
    const keys = Object.getOwnPropertyNames(envelope);
    if (
      keys.some(
        (key) => DANGEROUS_BODY_KEYS.has(key) || !CLIENT_BODY_KEYS.has(key)
      )
    ) {
      throw new BadRequestException('Invalid product event body');
    }
    if (
      typeof envelope.name !== 'string' ||
      !CLIENT_PRODUCT_EVENT_NAMES.includes(envelope.name as any)
    ) {
      throw new BadRequestException('Unsupported client product event');
    }
    if (
      typeof envelope.deduplicationKey !== 'string' ||
      !envelope.deduplicationKey ||
      envelope.deduplicationKey.length > 200
    ) {
      throw new BadRequestException('Invalid deduplication key');
    }
    if (
      envelope.properties !== undefined &&
      (envelope.properties === null ||
        typeof envelope.properties !== 'object' ||
        Array.isArray(envelope.properties))
    ) {
      throw new BadRequestException('Invalid product event properties');
    }

    return this.recordTrusted(
      {
        name: envelope.name as ProductEventName,
        properties: envelope.properties as Record<string, unknown> | undefined,
        deduplicationKey: envelope.deduplicationKey,
        userId: context.userId,
        organizationId: context.organizationId,
      },
      { dailyQuota: CLIENT_DAILY_ORGANIZATION_QUOTA }
    );
  }

  recordTrusted(event: TrustedProductEvent, options?: { dailyQuota?: number }) {
    if (!PRODUCT_EVENT_NAMES.includes(event.name)) {
      throw new BadRequestException('Unsupported product event');
    }
    const properties = event.properties || {};
    const validation = validateProductEventProperties(properties);
    if (validation.valid === false) {
      throw new BadRequestException(validation.reason);
    }
    if (
      typeof event.deduplicationKey !== 'string' ||
      !event.deduplicationKey ||
      event.deduplicationKey.length > 200
    ) {
      throw new BadRequestException('Invalid deduplication key');
    }
    if (!event.organizationId || !event.userId) {
      throw new BadRequestException('Missing trusted event identity');
    }

    return this._productEventsRepository.record(
      {
        name: event.name,
        properties,
        deduplicationKey: event.deduplicationKey,
        organizationId: event.organizationId,
        userId: event.userId,
      },
      options
    );
  }

  getAdminReport(from?: string, to?: string) {
    const fromDate = from
      ? dayjs(from).startOf('day')
      : dayjs().subtract(30, 'day').startOf('day');
    const toDate = to ? dayjs(to).endOf('day') : dayjs().endOf('day');

    if (
      !fromDate.isValid() ||
      !toDate.isValid() ||
      fromDate.isAfter(toDate) ||
      toDate.diff(fromDate, 'day') > 366
    ) {
      throw new BadRequestException('Invalid product event date range');
    }

    return this._productEventsRepository.getAdminReport({
      from: fromDate.toDate(),
      to: toDate.toDate(),
    });
  }
}
