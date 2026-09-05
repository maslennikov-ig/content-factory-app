import { Injectable } from '@nestjs/common';
import { zodResponseFormat } from 'openai/helpers/zod';
import {
  getModelForRole,
  getOpenAiClient,
} from '@contentfactory/nestjs-libraries/openai/ai.clients';
import { AiUsageService } from '@contentfactory/nestjs-libraries/openai/ai.usage.service';
import { mapResultSchema, reduceResultSchema } from './assist.contract';
import {
  REPAIR_SCHEMA_NAME,
  repairResultSchema,
  type RepairResult,
} from './sentence-repair';
import { runAssist, type AssistResult, type AssistTransport } from './assist.pipeline';
import {
  LEARNED_RULES_SCHEMA_NAME,
  learnedRulesSchema,
  type LearnedRulesAnswer,
} from './voice-learning';
import type {
  BrandVoiceMeasurementResult,
  BrandVoiceSampleInput,
} from './brand-voice.types';
import { VoiceError } from './voice-errors';

/**
 * The paid half of building a voice, and the two ways it is allowed to end.
 *
 * `assist.pipeline.ts` already does the work: map over samples, reduce into a
 * proposal, and drop every observation whose quote is not really in the sample
 * it names. What it does not do — deliberately, because it takes its transport
 * as an argument and never imports a client — is decide what happens when the
 * whole run comes back with nothing. That decision lives here, and it has one
 * rule.
 *
 * A refusal is a refusal. An empty profile is indistinguishable from a person
 * whose writing has no character, and handing one back tells a workspace
 * something false about its own texts. So a model that did not answer becomes
 * `VOICE_ASSIST_UNAVAILABLE`, a model that answered without a quote from the
 * corpus twice becomes `VOICE_ASSIST_UNGROUNDED`, and neither becomes a blank
 * proposal.
 *
 * Exactly one repeat. The pipeline retries a schema violation inside a single
 * sample; this is the outer repeat, for a run that produced no grounded
 * observation at all. Two would double the bill for the same answer.
 */

export type VoiceAssistOutcome = {
  observations: AssistResult['observations'];
  proposal: NonNullable<AssistResult['proposal']>;
  calls: AssistResult['calls'];
};

export type VoiceAssistInput = {
  organizationId: string;
  samples: readonly BrandVoiceSampleInput[];
  measurement: BrandVoiceMeasurementResult;
  locale?: 'ru' | 'en';
};

/**
 * Whether a finished run may be repeated, and what it becomes if not.
 *
 * Pulled out of the call so the policy can be read against recorded answers
 * instead of against a live model.
 */
export function classifyAssistResult(
  result: AssistResult
): 'ready' | 'ungrounded' | 'unavailable' {
  if (result.proposal && result.proposal.fields.length) return 'ready';
  const ungrounded = result.rejected.some(
    (rejection) => rejection.reason === 'QUOTE_NOT_GROUNDED'
  );
  // A run with grounded observations that still produced no usable proposal
  // failed at the reduce step, which is the model not answering rather than
  // the model inventing a quote.
  if (ungrounded && result.observations.length === 0) return 'ungrounded';
  return 'unavailable';
}

/**
 * One assist run with its single repeat, over any transport.
 *
 * The transport is a parameter here for the same reason it is one in the
 * pipeline: the retry rule is worth testing on answers that come back wrong,
 * and a test must never make a paid call to produce one.
 */
export async function runVoiceAssist(
  transport: AssistTransport,
  input: Omit<VoiceAssistInput, 'organizationId'>
): Promise<VoiceAssistOutcome> {
  let last: AssistResult | null = null;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const result = await runAssist({
      samples: input.samples,
      measurement: input.measurement,
      transport,
      locale: input.locale ?? 'ru',
    });
    last = result;
    const verdict = classifyAssistResult(result);
    if (verdict === 'ready') {
      return {
        observations: result.observations,
        proposal: result.proposal!,
        calls: result.calls,
      };
    }
    if (verdict === 'unavailable') {
      throw new VoiceError(
        'VOICE_ASSIST_UNAVAILABLE',
        'Модель не ответила. Числа разбора сохранены, предложение голоса не составлено.'
      );
    }
    // `ungrounded` on the first pass is the one case worth asking again for.
  }

  throw new VoiceError(
    'VOICE_ASSIST_UNGROUNDED',
    'Модель дважды ответила без цитаты из ваших текстов. Предложение отброшено.',
    last?.rejected[0]?.sampleCode
  );
}

@Injectable()
export class VoiceAssistService {
  constructor(private readonly _aiUsage: AiUsageService) {}

  /**
   * The transport, built per organisation because the key, the model and the
   * quota are all the organisation's.
   */
  private transport(organizationId: string): AssistTransport {
    return {
      complete: async ({ stage, prompt, schemaName }) =>
        this._aiUsage.executeAiOperation(
          organizationId,
          'text_generation',
          async () => {
            const client = await getOpenAiClient(organizationId);
            const completion = await client.chat.completions.parse({
              model: await getModelForRole(organizationId),
              messages: [
                {
                  role: 'system',
                  content:
                    'Ты объясняешь уже посчитанные числа о том, как пишет автор. Не оценивай и не хвали. Каждое наблюдение цитирует текст дословно.',
                },
                { role: 'user', content: prompt },
              ],
              response_format: zodResponseFormat(
                stage === 'map' ? mapResultSchema : reduceResultSchema,
                schemaName
              ),
            });
            const parsed = completion.choices[0]?.message?.parsed;
            if (!parsed) throw new Error('model returned no structured answer');
            return parsed;
          },
          // Explaining numbers already counted from the author's own text.
          // Nothing is written here, so this need not be the drafting model.
          'extract'
        ),
    };
  }

  propose(input: VoiceAssistInput): Promise<VoiceAssistOutcome> {
    return runVoiceAssist(this.transport(input.organizationId), {
      samples: input.samples,
      measurement: input.measurement,
      locale: input.locale,
    });
  }

  /**
   * One sentence, rewritten.
   *
   * A separate call rather than a stage of the assist pipeline, because it is
   * a different economy: the pipeline maps over a whole corpus once, this
   * carries a sentence and its two neighbours and runs while somebody waits.
   * The system line says what the boundary is, and the fact guard in
   * `sentence-repair.ts` enforces it afterwards — a rule stated to a model is a
   * request, not a guarantee.
   */
  async repair(input: VoiceRepairInput): Promise<RepairResult> {
    return this._aiUsage.executeAiOperation(
      input.organizationId,
      'text_generation',
      async () => {
        const client = await getOpenAiClient(input.organizationId);
        const completion = await client.chat.completions.parse({
          model: await getModelForRole(input.organizationId),
          messages: [
            {
              role: 'system',
              content:
                'Ты правишь одно предложение под манеру автора. Смысл, числа, имена и ссылки сохраняются дословно. Соседние предложения даны только для контекста и не переписываются.',
            },
            { role: 'user', content: input.prompt },
          ],
          response_format: zodResponseFormat(
            repairResultSchema,
            REPAIR_SCHEMA_NAME
          ),
        });
        const parsed = completion.choices[0]?.message?.parsed;
        if (!parsed) throw new Error('model returned no structured answer');
        return parsed;
      },
      // Weighing and rewriting one sentence against the author's manner: the
      // expensive half of the voice work, and the one worth a capable model.
      'judge'
    );
  }

  /**
   * Один вызов на пачку правок, и роль у него самая дешёвая из текстовых.
   *
   * `extract`, а не `judge`: здесь ничего не пишут и ничего не взвешивают —
   * из уже готовых пар «было/стало» вытаскивают то, что в них и так лежит,
   * ровно как разбор голоса по образцам двумя методами выше. Роль решает,
   * какая модель придёт (`ai.roles.ts`), и это единственный рычаг, которым
   * цену этого прогона можно опустить, не трогая код.
   *
   * Модель зовут раз на пачку и никогда на правку: см. `voice-learning.ts`.
   */
  async learn(input: VoiceLearnInput): Promise<LearnedRulesAnswer> {
    return this._aiUsage.executeAiOperation(
      input.organizationId,
      'text_generation',
      async () => {
        const client = await getOpenAiClient(input.organizationId);
        const completion = await client.chat.completions.parse({
          model: await getModelForRole(input.organizationId),
          messages: [
            {
              role: 'system',
              content:
                'Ты называешь привычки автора по тому, что он исправляет в чужих черновиках. Только про манеру письма, не про содержание. Короткими указаниями, без похвалы и без оценок.',
            },
            { role: 'user', content: input.prompt },
          ],
          response_format: zodResponseFormat(
            learnedRulesSchema,
            LEARNED_RULES_SCHEMA_NAME
          ),
        });
        const parsed = completion.choices[0]?.message?.parsed;
        if (!parsed) throw new Error('model returned no structured answer');
        return parsed;
      },
      'extract'
    );
  }
}

export type VoiceRepairInput = {
  organizationId: string;
  prompt: string;
};

export type VoiceLearnInput = {
  organizationId: string;
  prompt: string;
};

/** What `voice.service.ts` depends on, so it never imports a model client. */
export type VoiceAssistPort = {
  propose(input: VoiceAssistInput): Promise<VoiceAssistOutcome>;
  /** Optional: an older wiring without it simply cannot offer the repair. */
  repair?(input: VoiceRepairInput): Promise<RepairResult>;
  /**
   * Необязательный по той же причине: сборка без него просто не предлагает
   * учиться на правках, вместо того чтобы падать при старте.
   */
  learn?(input: VoiceLearnInput): Promise<LearnedRulesAnswer>;
};
