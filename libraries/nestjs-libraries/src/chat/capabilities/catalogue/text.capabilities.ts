import { z } from 'zod';
import { ContentMaterialController } from '@contentfactory/backend/api/routes/content-material.controller';
import { ContentTextQualityController } from '@contentfactory/backend/api/routes/content-text-quality.controller';
import { ContentMaterialService } from '@contentfactory/nestjs-libraries/content-intelligence/materials/content-material.service';
import { slopCheck } from '@contentfactory/nestjs-libraries/content-intelligence/text-quality/slop-check';
import { defineCapability, door } from '../capability.types';
import { localTime } from '../person-time';
import { channelRow } from './channel.capabilities';

/**
 * Two free reads of the «Контент» row (spec §5.2, §5.8, `kcxz.24`): «Свои
 * тексты по теме» — the workspace's own published posts on a subject, which a
 * new text may link to — and the free cliché check («Проверка на штампы») of
 * a text the person gives. Neither calls a model, spends or writes.
 *
 * Each calls what its door calls: `ContentMaterialService.listRelated` behind
 * `GET /content-intelligence/materials/related`, and the pure `slopCheck`
 * behind `POST /content-intelligence/text-quality/slop-check` — the same
 * function, so the chat and the post window count the same findings. The
 * doors decide who may: the first is any member's, the check an editor's (a
 * reader has no draft to check).
 */

const channelId = z
  .string()
  .min(1)
  .max(128)
  .describe('Channel id from workspace.snapshot or channels.list');

/** Own texts the model is shown; the door's ceiling. */
const RELATED_MAX = 10;
const RELATED_DEFAULT = 5;

const cut = (text: string | null | undefined, max: number) => {
  const value = String(text ?? '').replace(/\s+/g, ' ').trim();
  return value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;
};

export const textsRelated = defineCapability({
  id: 'texts.related',
  group: 'content',
  label: { ru: 'Свои тексты по теме', en: 'Own texts on the topic' },
  description:
    'Find the workspace’s own published posts on a subject («Свои тексты по теме»): each with its title, the first lines, its address, the platform and when it went out (the person’s zone), best match first. Only posts that went out with an address are found — something a reader can open. `channelId` narrows to that channel’s platform. Use it when the person asks what they already wrote about something, or wants a link to an earlier post. Free.',
  input: z.object({
    topic: z.string().trim().min(1).max(200).describe('The subject, in the person’s words'),
    channelId: channelId.optional().describe('Only posts of this channel’s platform, when the person named one'),
    limit: z.number().int().min(1).max(RELATED_MAX).optional().describe('How many, 5 if unnamed'),
  }),
  risk: 'read',
  door: door(ContentMaterialController, 'related'),
  // Published posts: the workspace's words, which may rework a stranger's.
  untrusted: ['channel-post'],
  run: async (ctx, input) => {
    const platform = input.channelId
      ? (await channelRow(ctx, input.channelId)).providerIdentifier
      : undefined;
    const { related } = await ctx.service(ContentMaterialService).listRelated(ctx.organizationId, {
      q: input.topic,
      ...(platform ? { platform } : {}),
      limit: input.limit ?? RELATED_DEFAULT,
    });
    return {
      topic: input.topic,
      related: related.map((post) => ({
        title: cut(post.title, 200),
        excerpt: cut(post.excerpt, 280),
        url: post.url,
        platform: post.platform,
        published: post.publishedAt ? localTime(post.publishedAt, ctx.timeZone, ctx.language) : null,
      })),
    };
  },
  summarize: (output) => ({ ...output }),
});

/** Excerpts of findings the model is shown, each at most this long. */
const EXCERPT_MAX = 120;

/** Letters a text needs before its script decides its language. */
const SCRIPT_MIN_LETTERS = 20;

/**
 * The rule set for the text's own language (review W4-24 F9). The post
 * window checks what the person writes in their interface's language, by
 * design; the chat is where a stranger's post is pasted, so here the script
 * decides when it clearly can — mostly Cyrillic is Russian, mostly Latin is
 * English — and the interface language otherwise.
 */
const textLanguage = (text: string, fallback: 'ru' | 'en'): 'ru' | 'en' => {
  const cyrillic = (text.match(/\p{Script=Cyrillic}/gu) ?? []).length;
  const latin = (text.match(/\p{Script=Latin}/gu) ?? []).length;
  const letters = cyrillic + latin;
  if (letters < SCRIPT_MIN_LETTERS) return fallback;
  if (cyrillic >= letters * 0.7) return 'ru';
  if (latin >= letters * 0.7) return 'en';
  return fallback;
};

export const textSlopCheck = defineCapability({
  id: 'text.slop_check',
  group: 'content',
  label: { ru: 'Проверка на штампы', en: 'Cliché check' },
  description:
    'Check a text the person gave for the turns of phrase that give a machine-written text away («Проверка на штампы»): rules and word lists, no AI, free, the same text always gives the same report. Returns `verdict` (`clean`, `review`, `rewrite`), `score`, and up to 15 findings — the words found, a hint and how serious. It only shows: it changes nothing. `channelId` applies that channel’s platform thresholds. The rules are the text’s language: told by its script when clear, else the interface’s; `language` overrides when the person says which; the answer’s `language` says which rules ran. Pass the text verbatim. An adaptation already carries its own check (piece.open); a paid rewrite by these findings is «Убрать следы ИИ» (adaptation.review).',
  input: z.object({
    text: z.string().min(1).max(20_000).describe('The text to check, verbatim'),
    channelId: channelId.optional().describe('The channel the text is for, when the person named one'),
    language: z
      .enum(['ru', 'en'])
      .optional()
      .describe('The text’s language, only when the person said it or the script cannot tell'),
  }),
  risk: 'read',
  door: door(ContentTextQualityController, 'check'),
  // The text is whatever the person pasted, a stranger's post included.
  untrusted: ['foreign-post'],
  run: async (ctx, input) => {
    const platform = input.channelId
      ? (await channelRow(ctx, input.channelId)).providerIdentifier
      : undefined;
    const language = input.language ?? textLanguage(input.text, ctx.language);
    const report = slopCheck(input.text, { platform, locale: language });
    return {
      language,
      verdict: report.verdict,
      score: report.score,
      words: report.metrics.words,
      truncated: report.truncated,
      findings: report.findings.map((finding) => ({
        found: cut(finding.excerpt, EXCERPT_MAX),
        hint: finding.hint[ctx.language],
        severity: finding.severity,
        ...(finding.count ? { count: finding.count } : {}),
      })),
    };
  },
  summarize: (output) => ({ ...output }),
});
