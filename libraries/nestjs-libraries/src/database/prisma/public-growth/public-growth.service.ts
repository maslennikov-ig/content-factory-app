import { BadRequestException, Injectable } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { PublicGrowthRepository } from '@contentfactory/nestjs-libraries/database/prisma/public-growth/public-growth.repository';
import {
  parsePublicGrowthEvent,
  TRUSTED_GROWTH_EVENT_NAMES,
  TrustedGrowthEventName,
} from '@contentfactory/nestjs-libraries/dtos/growth/public-growth-event';

const TRUSTED_DEDUPE_DOMAIN =
  'content-factory/public-growth/trusted-dedupe/v1\0';
const CONTROLLED_TEST_DEDUPE_KEY =
  'content-factory-controlled-test-growth-dedupe-key';
const MAX_REPORT_RANGE_DAYS = 366;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function utcDate(value: string | undefined): Date | undefined {
  if (!value || !ISO_DATE.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    return undefined;
  }
  return date;
}

function zeroSafeRatio(numerator: number, denominator: number) {
  return denominator === 0 ? 0 : numerator / denominator;
}

function trustedDedupeKey(): string {
  const configured = process.env.PUBLIC_GROWTH_DEDUPE_KEY;
  if (configured !== undefined) {
    if (Buffer.byteLength(configured, 'utf8') >= 32) return configured;
    throw new Error('PUBLIC_GROWTH_DEDUPE_KEY must contain at least 32 bytes');
  }
  if (process.env.NODE_ENV === 'test') return CONTROLLED_TEST_DEDUPE_KEY;

  throw new Error(
    'PUBLIC_GROWTH_DEDUPE_KEY is required for trusted growth events'
  );
}

@Injectable()
export class PublicGrowthService {
  constructor(private readonly _repository: PublicGrowthRepository) {}

  recordPublic(value: unknown, now = new Date()) {
    const event = parsePublicGrowthEvent(value);
    if (!event) {
      throw new BadRequestException('Invalid public growth event');
    }
    return this._repository.recordPublic(event, now);
  }

  recordTrusted(
    name: TrustedGrowthEventName,
    rawDeduplicationKey: string,
    now = new Date()
  ) {
    if (!(TRUSTED_GROWTH_EVENT_NAMES as readonly string[]).includes(name)) {
      throw new BadRequestException('Invalid trusted growth event');
    }
    const deduplicationKey = createHmac('sha256', trustedDedupeKey())
      .update(TRUSTED_DEDUPE_DOMAIN)
      .update(rawDeduplicationKey)
      .digest('hex');
    return this._repository.recordTrusted(name, deduplicationKey, now);
  }

  async getAdminReport(from: string | undefined, to: string | undefined) {
    const fromDate = utcDate(from);
    const toDate = utcDate(to);
    const rangeDays =
      fromDate && toDate
        ? (toDate.getTime() - fromDate.getTime()) / (24 * 60 * 60 * 1000)
        : Number.NaN;

    if (
      !fromDate ||
      !toDate ||
      rangeDays < 0 ||
      rangeDays > MAX_REPORT_RANGE_DAYS
    ) {
      throw new BadRequestException('Invalid public growth report date range');
    }

    const totals = await this._repository.getAggregateTotals({
      from: fromDate,
      to: toDate,
    });
    return {
      totals,
      ratios: {
        demo_started_per_landing_view: zeroSafeRatio(
          totals.demo_started,
          totals.landing_view
        ),
        demo_completed_per_demo_started: zeroSafeRatio(
          totals.demo_completed,
          totals.demo_started
        ),
        signup_started_per_landing_view: zeroSafeRatio(
          totals.signup_started,
          totals.landing_view
        ),
        registration_completed_per_signup_started: zeroSafeRatio(
          totals.registration_completed,
          totals.signup_started
        ),
        workspace_activated_per_registration_completed: zeroSafeRatio(
          totals.workspace_activated,
          totals.registration_completed
        ),
      },
    };
  }
}
