import { z } from 'zod';
import type { Organization } from '@prisma/client';
import { AnalyticsController } from '@contentfactory/backend/api/routes/analytics.controller';
import { IntegrationService } from '@contentfactory/nestjs-libraries/database/prisma/integrations/integration.service';
import { PostsService } from '@contentfactory/nestjs-libraries/database/prisma/posts/posts.service';
import {
  audienceMetricValue,
  audiencePeriodsOf,
  hasAudienceAnalytics,
} from '@contentfactory/nestjs-libraries/integrations/audience-analytics.rules';
import { defineCapability, door } from '../capability.types';
import { channelRow } from './channel.capabilities';
import { codedFailure } from './selection';

/**
 * «Аналитика» from the chat (spec §5.2, §5.8, `kcxz.24`): the two tabs the
 * analytics page has — «Производство» (what went out and what failed, from our
 * own rows) and a channel's audience (what the platform reports). Both are
 * reads on doors without a policy, like the page: any member reads them.
 *
 * `analytics.production` calls `PostsService.getProductionAnalytics`, the
 * door's step. `analytics.channel` calls `IntegrationService.checkAnalytics`,
 * the door's step, which asks the platform; which channels have it, for which
 * periods and the one number a metric shows are the screen's rules
 * (`audience-analytics.rules.ts`), not a copy of them.
 */

const channelId = z
  .string()
  .min(1)
  .max(128)
  .describe('Channel id from workspace.snapshot or channels.list');

type Production = {
  period: { days: number; from: string; to: string };
  summary: {
    publishedVolume: number;
    failureCount: number;
    failureRate: number;
    averageLeadTimeHours: number;
  };
  originMix: Array<{ origin: string; count: number; percentage: number }>;
  failureReasons: Array<{ reason: string; count: number }>;
};

export const analyticsProduction = defineCapability({
  id: 'analytics.production',
  group: 'analytics',
  label: { ru: 'Производство', en: 'Production' },
  description:
    'Read «Производство» of the analytics page: for the last `days` (7, 30 or 90; 30 if unnamed) — how many posts went out (`published`), how many failed and the share of failures, the average hours from drafting to the slot (`null` with a `leadTimeNote` when nothing went out), where posts came from (`origins`: `WEB` the editor, `MCP` an agent over MCP, `API`, `AUTOPOST`, `CLI`, `UNKNOWN`) and the failure reasons as the platforms gave them. `channelId` narrows to one channel. From our own records; free.',
  input: z.object({
    days: z
      .union([z.literal(7), z.literal(30), z.literal(90)])
      .optional()
      .describe('The period in days: 7, 30 or 90; 30 if unnamed'),
    channelId: channelId.optional().describe('Only this channel, when the person named one'),
  }),
  risk: 'read',
  door: door(AnalyticsController, 'getProductionAnalytics'),
  // Failure reasons are what the platforms answered.
  untrusted: ['channel-post'],
  run: async (ctx, input) => {
    if (input.channelId) await channelRow(ctx, input.channelId);
    const days = input.days ?? 30;
    const answer = (await ctx
      .service(PostsService)
      .getProductionAnalytics(ctx.organizationId, days, input.channelId)) as unknown as Production;
    return {
      days,
      channelId: input.channelId ?? null,
      published: answer.summary.publishedVolume,
      failed: answer.summary.failureCount,
      failureRatePercent: answer.summary.failureRate,
      // With nothing published there is no lead time to average: the service
      // answers 0, which the model read as «0 часов» (W4 walk P3-G).
      averageLeadTimeHours: answer.summary.publishedVolume > 0 ? answer.summary.averageLeadTimeHours : null,
      ...(answer.summary.publishedVolume > 0
        ? {}
        : {
            leadTimeNote:
              'Nothing went out in this period, so there is no drafting-to-slot time yet. Say that there is none yet; never say 0 hours.',
          }),
      origins: answer.originMix,
      failureReasons: answer.failureReasons.slice(0, 5),
    };
  },
  summarize: (output) => ({ ...output }),
});

/** The platform's metric, as the audience tab reads it. */
type PlatformMetric = {
  label: string;
  data: Array<{ total: number | string; date: string }>;
  average?: boolean;
  percentageChange?: number;
};

/** The longest period the platform answers that is not longer than asked. */
const periodFor = (platform: string, asked: number | undefined) => {
  const periods = audiencePeriodsOf(platform);
  if (!asked) return periods[0];
  return [...periods].reverse().find((one) => one <= asked) ?? periods[0];
};

export const analyticsChannel = defineCapability({
  id: 'analytics.channel',
  group: 'analytics',
  label: { ru: 'Аналитика канала', en: 'Channel analytics' },
  description:
    'Read a channel’s audience analytics, as the analytics page shows them: each metric the platform reports for the period with its number (a sum, or a percentage for a rate) and the change against the period before. The period is 7 days unless the person named a longer one; a platform that does not answer that long gets the longest it answers (Telegram answers 7) — `days` says which. Telegram gives bots no views or forwards: only reactions and discussion comments. Refused for a platform without analytics (`ANALYTICS_NOT_AVAILABLE`) or a channel switched off, waiting to be reconnected or not fully connected (`ANALYTICS_CHANNEL_OFF`). Never refreshes the channel’s access: when it has expired the answer is `ANALYTICS_CHANNEL_NEEDS_RECONNECT` (the person reconnects the channel or opens «Аналитика»), and a platform that failed to answer is `ANALYTICS_UNAVAILABLE` — neither means the channel had no activity. Asks the platform; free.',
  input: z.object({
    channelId,
    days: z
      .union([z.literal(7), z.literal(30), z.literal(90)])
      .optional()
      .describe('The period in days, only when the person named one'),
  }),
  risk: 'read',
  door: door(AnalyticsController, 'getIntegration'),
  // The channel's name was set on the platform.
  untrusted: ['workspace-text'],
  run: async (ctx, input) => {
    const row = await channelRow(ctx, input.channelId);
    const platform = row.providerIdentifier;
    if (!hasAudienceAnalytics(platform, { disableX: !!process.env.DISABLE_X_ANALYTICS })) {
      throw codedFailure(
        'ANALYTICS_NOT_AVAILABLE',
        'This platform gives no audience analytics here; «Производство» still counts what went out.'
      );
    }
    // A channel half connected (no page chosen yet) has nothing to ask the
    // platform about (review W4-24 F8).
    if (row.disabled || row.refreshNeeded || row.inBetweenSteps) {
      throw codedFailure(
        'ANALYTICS_CHANNEL_OFF',
        'The channel is switched off, waits to be reconnected or its connection is not finished, so the platform was not asked.'
      );
    }
    const days = periodFor(platform, input.days);
    // The door's step, without refreshing (review W4-24 F3, owner decision):
    // a read from the chat or MCP never rotates the channel's token, marks it
    // for reconnection or notifies anyone. An expired token is
    // `ANALYTICS_CHANNEL_NEEDS_RECONNECT`, a failed platform call
    // `ANALYTICS_UNAVAILABLE` — both the service's own refusals. The
    // organisation is the caller's; only its id is read.
    const metrics = (await ctx
      .service(IntegrationService)
      .checkAnalytics({ id: ctx.organizationId } as Organization, row.id, String(days), false, {
        mayRefresh: false,
      })) as unknown as
      | PlatformMetric[]
      | null;
    return {
      channelId: row.id,
      channel: row.name,
      platform,
      days,
      metrics: (metrics ?? []).map((metric) => ({
        label: metric.label,
        value: audienceMetricValue(metric),
        ...(typeof metric.percentageChange === 'number' ? { changePercent: metric.percentageChange } : {}),
      })),
    };
  },
  summarize: (output) => ({ ...output }),
});
