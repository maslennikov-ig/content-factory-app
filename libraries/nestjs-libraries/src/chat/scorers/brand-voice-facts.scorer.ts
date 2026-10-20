import { createScorer } from '@mastra/core/evals';
import type { ScoresStorage } from '@mastra/core/storage';
import type { BrandVoiceMeasurementResult } from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/brand-voice.types';
import { checkText } from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice-retention';
import { slopCheck } from '@contentfactory/nestjs-libraries/content-intelligence/text-quality/slop-check';
import type { BrandVoiceFactScoreSummary } from '../capabilities/agent-parts.contract';

export const BRAND_VOICE_SCORER_ID = 'brand-voice-and-facts' as const;

const DEFAULT_STYLE_RULES_TOTAL = 5;

export interface BrandVoiceScorerInput {
  organizationId?: string;
  locale?: 'ru' | 'en';
  platform?: string | null;
  measurement?: BrandVoiceMeasurementResult | null;
  voiceCheck?: {
    inCorridor?: number;
    total?: number;
    verdict?: 'CLOSE' | 'FAR' | 'UNKNOWN';
    summary?: string;
  } | null;
  facts?:
    | ReadonlyArray<string | { statement?: string; verified?: boolean; status?: string }>
    | number
    | null;
  grounded?: readonly string[];
  supported?: readonly string[];
}

export interface BrandVoiceScorerOutput {
  text: string;
  entityId?: string;
  entityType?: 'piece' | 'adaptation';
}

export interface BrandVoiceAnalyzeResult {
  rulesMatched: number;
  rulesTotal: number;
  factsCount: number;
  slopCount: number;
  verdict: 'CLOSE' | 'FAR' | 'UNKNOWN';
  summary: string;
}

const countFacts = (input?: BrandVoiceScorerInput): number => {
  if (!input) return 0;
  if (typeof input.facts === 'number' && Number.isFinite(input.facts)) {
    return Math.max(0, Math.floor(input.facts));
  }
  if (Array.isArray(input.facts)) {
    return input.facts.filter((item) => {
      if (typeof item === 'string') return item.trim().length > 0;
      return Boolean(item && typeof item === 'object' && String(item.statement ?? '').trim());
    }).length;
  }
  if (Array.isArray(input.supported)) {
    return input.supported.filter((s) => typeof s === 'string' && s.trim().length > 0).length;
  }
  return 0;
};

/**
 * Deterministic, zero-quota MastraScorer (`@mastra/core/evals`) that evaluates
 * brand voice retention (`checkText` across the author's style scales),
 * anti-slop cleanliness (`slopCheck`), and grounded fact count.
 */
export const brandVoiceAndFactsScorer = createScorer<
  BrandVoiceScorerInput,
  BrandVoiceScorerOutput,
  typeof BRAND_VOICE_SCORER_ID
>({
  id: BRAND_VOICE_SCORER_ID,
  name: 'Brand Voice & Fact Grounding',
  description:
    'Deterministic evaluation of brand-voice corridor retention, anti-slop hygiene, and grounded fact count.',
})
  .analyze(({ run }): BrandVoiceAnalyzeResult => {
    const input = (run.input ?? {}) as BrandVoiceScorerInput;
    const rawOutput = run.output as BrandVoiceScorerOutput | string | undefined;
    const text =
      typeof rawOutput === 'string'
        ? rawOutput
        : typeof rawOutput?.text === 'string'
          ? rawOutput.text
          : '';
    const locale: 'ru' | 'en' = input.locale === 'en' ? 'en' : 'ru';

    const slop = text.trim()
      ? slopCheck(text, {
          platform: input.platform ?? 'core',
          locale,
          html: false,
          grounded: input.grounded,
          supported: input.supported,
        })
      : null;
    const slopCount = slop?.findings?.length ?? 0;

    let rulesMatched = Math.max(0, DEFAULT_STYLE_RULES_TOTAL - Math.min(DEFAULT_STYLE_RULES_TOTAL, slopCount));
    let rulesTotal = DEFAULT_STYLE_RULES_TOTAL;
    let verdict: 'CLOSE' | 'FAR' | 'UNKNOWN' = 'UNKNOWN';
    let summary = '';

    if (input.measurement && text.trim()) {
      const check = checkText(text, input.measurement, locale);
      if (check.total > 0) {
        rulesMatched = check.inCorridor;
        rulesTotal = check.total;
      }
      verdict = check.similarity.verdict;
      summary = check.summary;
    } else if (input.voiceCheck) {
      if (
        typeof input.voiceCheck.total === 'number' &&
        input.voiceCheck.total > 0 &&
        typeof input.voiceCheck.inCorridor === 'number'
      ) {
        rulesMatched = Math.max(0, Math.min(input.voiceCheck.total, input.voiceCheck.inCorridor));
        rulesTotal = input.voiceCheck.total;
      }
      if (
        input.voiceCheck.verdict === 'CLOSE' ||
        input.voiceCheck.verdict === 'FAR' ||
        input.voiceCheck.verdict === 'UNKNOWN'
      ) {
        verdict = input.voiceCheck.verdict;
      }
      summary = input.voiceCheck.summary ?? '';
    }

    const factsCount = countFacts(input);

    return {
      rulesMatched,
      rulesTotal,
      factsCount,
      slopCount,
      verdict,
      summary,
    };
  })
  .generateScore(({ results }) => {
    const analysis = results.analyzeStepResult;
    if (!analysis) return 0;
    const voiceRatio =
      analysis.rulesTotal > 0 ? analysis.rulesMatched / analysis.rulesTotal : 1;
    const slopPenalty = Math.min(0.4, analysis.slopCount * 0.08);
    const raw = Math.max(0, Math.min(1, voiceRatio - slopPenalty));
    return Number(raw.toFixed(4));
  })
  .generateReason(({ results }) => {
    const analysis = results.analyzeStepResult;
    if (!analysis) return '';
    const base = `Голос ${analysis.rulesMatched}/${analysis.rulesTotal} · Факты ${analysis.factsCount}`;
    const tail = analysis.slopCount > 0 ? ` · Штампы ${analysis.slopCount}` : '';
    return analysis.summary ? `${base}${tail} — ${analysis.summary}` : `${base}${tail}`;
  });

export async function scoreBrandVoiceAndFacts(
  input: BrandVoiceScorerInput,
  output: BrandVoiceScorerOutput,
  options?: {
    scoresStore?: ScoresStorage | null;
    threadId?: string;
    resourceId?: string;
  }
): Promise<BrandVoiceFactScoreSummary> {
  const result = await brandVoiceAndFactsScorer.run({
    input,
    output,
  });
  const analysis = result.analyzeStepResult ?? {
    rulesMatched: 0,
    rulesTotal: DEFAULT_STYLE_RULES_TOTAL,
    factsCount: countFacts(input),
    slopCount: 0,
    verdict: 'UNKNOWN' as const,
    summary: '',
  };
  const scoreValue = typeof result.score === 'number' ? result.score : 0;
  const summary: BrandVoiceFactScoreSummary = {
    scorerId: BRAND_VOICE_SCORER_ID,
    score: scoreValue,
    rulesMatched: analysis.rulesMatched,
    rulesTotal: analysis.rulesTotal,
    factsCount: analysis.factsCount,
    slopCount: analysis.slopCount,
    verdict: analysis.verdict,
    ...(result.reason ? { reason: result.reason } : {}),
  };

  if (options?.scoresStore && output.entityId) {
    try {
      await options.scoresStore.saveScore({
        scorerId: BRAND_VOICE_SCORER_ID,
        entityId: output.entityId,
        entityType: (output.entityType ?? 'piece') as any,
        runId: result.runId,
        input: {
          locale: input.locale ?? 'ru',
          platform: input.platform ?? 'core',
          factsCount: analysis.factsCount,
        },
        output: {
          entityId: output.entityId,
          entityType: output.entityType ?? 'piece',
          textLength: output.text.length,
        },
        score: scoreValue,
        analyzeStepResult: analysis as unknown as Record<string, unknown>,
        reason: result.reason,
        scorer: {
          id: BRAND_VOICE_SCORER_ID,
          name: brandVoiceAndFactsScorer.name,
          description: brandVoiceAndFactsScorer.description,
        },
        metadata: {
          rulesMatched: analysis.rulesMatched,
          rulesTotal: analysis.rulesTotal,
          factsCount: analysis.factsCount,
          slopCount: analysis.slopCount,
          verdict: analysis.verdict,
        },
        source: 'LIVE',
        entity: {
          id: output.entityId,
          type: output.entityType ?? 'piece',
        },
        ...(options.resourceId ? { resourceId: options.resourceId } : {}),
        ...(options.threadId ? { threadId: options.threadId } : {}),
        ...(input.organizationId ? { organizationId: input.organizationId } : {}),
      });
    } catch {
      // Score persistence is non-blocking telemetry; never fail piece/adaptation delivery.
    }
  }

  return summary;
}
