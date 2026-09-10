import {
  mapResultSchema,
  mapResultSchemaV2,
  portraitCliches,
  quoteIsGrounded,
  reduceResultSchema,
  reduceResultSchemaV2,
  PORTRAIT_CLICHE_LIMIT,
  type AssistFailure,
  type MapResult,
  type MapResultV2,
  type Observation,
  type ObservationV2,
  type ProfileField,
  type ProfileFieldV2,
  type ReduceResult,
  type ReduceResultV2,
} from './assist.contract';
import type {
  BrandVoiceMeasurementResult,
  BrandVoiceSampleInput,
} from './brand-voice.types';
import { isScaleValue } from './brand-voice.types';
import { renderPostHabits } from './post-habits';
import { renderPostLayout } from './post-layout';

/**
 * The model's half: explain what was already counted.
 *
 * Map over samples, reduce into a proposal. Not because map-reduce is
 * fashionable but because attention falls off over a long input and a lost
 * observation costs more than the dedup a reduce step needs. The deterministic
 * layer runs first for a different reason again: the model receives the numbers
 * as given and explains them, instead of inventing a characterisation and
 * finding examples to fit it.
 *
 * Every observation is checked against the sample it names before it is
 * allowed into the proposal. A quote the model composed reads exactly like the
 * author — that is what it is good at — so the check is a string comparison
 * here rather than a second opinion from the same kind of system.
 *
 * The transport is injected. This file never imports a client, which is what
 * lets the whole pipeline be tested on recorded answers, including the ones
 * that come back malformed.
 */

export type AssistTransport = {
  /** One structured call. Throwing is allowed; the caller retries once. */
  complete: (input: {
    stage: 'map' | 'reduce';
    prompt: string;
    schemaName: string;
  }) => Promise<unknown>;
};

export type AssistRejection = {
  sampleCode: string;
  reason: AssistFailure;
  detail?: string;
};

export type AssistResult = {
  observations: (Observation & { sampleCode: string; ref: string })[];
  proposal: ReduceResult | null;
  rejected: AssistRejection[];
  /** One entry per model call, for the usage record. Never the prompt itself. */
  calls: { stage: 'map' | 'reduce'; attempt: number; ok: boolean }[];
};

export type AssistResultV2 = {
  observations: (ObservationV2 & { sampleCode: string; ref: string })[];
  proposal: ReduceResultV2 | null;
  rejected: AssistRejection[];
  /** One entry per model call, for the usage record. Never the prompt itself. */
  calls: { stage: 'map' | 'reduce'; attempt: number; ok: boolean }[];
};

/**
 * A call that has just happened, told to whoever is waiting.
 *
 * The same fact `calls` records, handed over while the run is still going
 * rather than after it: a corpus of 28 samples is 28 calls, and a person
 * watching a bar that cannot move until all of them finish is watching a
 * guess. `index` is the sample's own place in the chosen list, so the bar
 * measures work rather than attempts — a repaired schema violation does not
 * push it backwards.
 */
export type AssistProgressEvent = {
  stage: 'map' | 'reduce';
  index: number;
  total: number;
  ok: boolean;
};

/** The schema repair loop: one retry, then the sample is dropped and named. */
const MAX_ATTEMPTS = 2;

/**
 * How many samples are read at once, and why not one and not all of them.
 *
 * One at a time is what this did until 07.09.2026, and it is the reason the
 * owner's 88-sample run died on the ingress: twenty sequential calls at a few
 * seconds each is minutes of one waiting request. All at once is the other
 * extreme and buys a rate-limit refusal from the provider on the first
 * corpus large enough to matter, which loses the whole run rather than
 * slowing it.
 *
 * Three is the number that fits both: it divides the wait by three and keeps
 * the burst small enough that a per-organisation quota is checked three times
 * over rather than twenty. The results are still assembled in the samples'
 * own order — the reduce prompt names observations by `sampleCode#position`,
 * and a list whose order depends on which call answered first would renumber
 * them differently on every run.
 */
const MAP_CONCURRENCY = 3;

const SCALE_SENTENCE = (
  measurement: BrandVoiceMeasurementResult,
  locale: 'ru' | 'en'
): string =>
  Object.entries(measurement.scales)
    .filter(([, scale]) => isScaleValue(scale))
    .map(([key, scale]) => {
      const value = scale as Extract<typeof scale, { raw: number }>;
      return locale === 'ru'
        ? `${key}: ${value.raw} (коридор ${value.low}–${value.high}, ${value.observations} наблюдений)`
        : `${key}: ${value.raw} (corridor ${value.low}–${value.high}, ${value.observations} observations)`;
    })
    .join('\n');

/**
 * How many texts the model actually reads.
 *
 * It used to be twelve whatever the corpus was, so a channel of 153 posts was
 * described in words from twelve of them — eight per cent of the evidence, and
 * the profile then said what those twelve happened to be about. Each sample is
 * one paid call, so the number cannot simply be "all of them"; the research's
 * own floor for short posts is 15–25 items, and above a hundred posts this
 * takes 28.
 */
export function sampleLimitFor(count: number): number {
  if (count >= 100) return 28;
  if (count >= 40) return 20;
  return 12;
}

/**
 * Diversity, not the first N.
 *
 * Eder's result is that randomly excerpted samples attribute better than
 * consecutive passages. Taking the head of the corpus would measure whatever
 * the person happened to write first.
 */
export function selectSamples(
  samples: readonly BrandVoiceSampleInput[],
  limit: number
): BrandVoiceSampleInput[] {
  if (samples.length <= limit) return [...samples];
  const step = samples.length / limit;
  return Array.from(
    { length: limit },
    (unused, index) => samples[Math.floor(index * step)]
  );
}

export const mapPrompt = (
  sample: BrandVoiceSampleInput,
  measurement: BrandVoiceMeasurementResult,
  locale: 'ru' | 'en'
): string =>
  [
    locale === 'ru'
      ? 'Ниже — один текст автора и уже посчитанные по всему корпусу числа.'
      : 'Below is one text by the author and the numbers already computed over the whole corpus.',
    locale === 'ru'
      ? 'Объясните посчитанное. Не оценивайте, не хвалите и не описывайте прилагательными.'
      : 'Explain what was counted. Do not judge, praise, or describe with adjectives.',
    locale === 'ru'
      ? 'Каждое наблюдение обязано процитировать фразу из этого текста дословно и назвать метрику, которую оно объясняет. Метрикой может быть и привычка поста, и раскладка поста — ключ перед точкой в разделе ниже.'
      : 'Every observation must quote a phrase from this text verbatim and name the metric it explains. A post habit and a post layout measure both count as a metric too — their key is the one before the dot in the section below.',
    '',
    `SAMPLE ${sample.code}`,
    sample.text,
    '',
    'METRICS',
    SCALE_SENTENCE(measurement, locale),
    // One list, not two. The habits first arrived under a heading of their own
    // and the model read them as background: on the owner's channel it cited a
    // habit once in 168 observations and one of the eight scales in the rest.
    // A separate section is a footnote, and a footnote is not evidence.
    renderPostHabits(measurement.postHabits, locale),
    renderPostLayout(measurement.postLayout, locale),
  ]
    .filter((line) => line !== '')
    .join('\n');

/** V2 asks for one grounded subject observation without changing the V1 text. */
export const mapPromptV2 = (
  sample: BrandVoiceSampleInput,
  measurement: BrandVoiceMeasurementResult,
  locale: 'ru' | 'en'
): string => {
  const topicInstruction =
    locale === 'ru'
      ? 'Добавьте не больше одного наблюдения TOPICS: о чём именно этот текст. Для него metric = null; цитата всё равно обязательна.'
      : 'Add at most one TOPICS observation naming the subject of this text. Its metric is null; a verbatim quote is still required.';
  return mapPrompt(sample, measurement, locale).replace(
    '\nSAMPLE ',
    `\n${topicInstruction}\nSAMPLE `
  );
};

/**
 * The reduce prompt, and the one rule it must not break: an observation is
 * named here by the same `ref` it is stored under.
 *
 * It used to renumber them — `sampleCode#position-in-the-whole-list` — while
 * the stored ref is `sampleCode#position-within-its-own-sample`. The two agree
 * only for the first sample, so on a corpus of eight texts 32 of 37 references
 * the model was shown pointed at nothing. Every field resting on them was then
 * dropped by the grounding filter below as unfounded, and the path that
 * promises to read your texts handed back one field out of five
 * (`content-factory-next-vme.21.9`).
 */
export const reducePrompt = (
  observations: readonly (Observation & { sampleCode: string; ref: string })[],
  locale: 'ru' | 'en',
  /**
   * The corpus-level habits, where there are any.
   *
   * This is where they belong. A map observation explains one sample, and «41%
   * постов заканчиваются призывом» is not a fact about one sample; the reduce
   * step is the only place in the pipeline that is looking at the corpus as a
   * whole, and until now it was looking at it through observations alone.
   */
  habits?: BrandVoiceMeasurementResult['postHabits'],
  /** The corpus's layout, on the same terms as `habits` above and beside it. */
  layout?: BrandVoiceMeasurementResult['postLayout']
): string =>
  [
    locale === 'ru'
      ? 'Ниже — наблюдения по отдельным текстам одного автора. Соберите из них предложение голоса.'
      : 'Below are observations from individual texts by one author. Assemble a proposed voice.',
    locale === 'ru'
      ? 'Поле без наблюдения не предлагайте: пустое поле честнее выдуманного.'
      : 'Do not propose a field with no observation behind it: an empty field is honester than an invented one.',
    locale === 'ru'
      ? 'Одинаковые наблюдения из разных текстов объедините в одно.'
      : 'Merge identical observations from different texts into one.',
    '',
    /**
     * The portrait, and why the prompt spends this many words on what not to do.
     *
     * Asked plainly — "describe this author" — a model writes the same
     * paragraph about everybody: engaging, professional, a vibrant style. That
     * paragraph is worse than nothing, because it looks like an answer and
     * fills the field the real portrait was supposed to occupy. So the ask is
     * put as questions with factual answers, and the ban is explicit.
     */
    locale === 'ru'
      ? 'ПОРТРЕТ. Опишите этого человека прозой, 200–1200 знаков, на языке его текстов. Отвечайте на вопросы: чем он занят и что делает руками; что считает очевидным и не объясняет; что его раздражает; как он обращается с читателем — объясняет, спорит, зовёт, отчитывается. Пишите о нём в третьем лице.'
      : 'PORTRAIT. Describe this person in prose, 200–1200 characters, in the language of their texts. Answer: what they do with their hands; what they take for granted and never explain; what irritates them; how they treat a reader — explaining, arguing, inviting, reporting. Write about them in the third person.',
    locale === 'ru'
      ? 'В портрете запрещены оценки манеры: «увлекательный», «профессиональный», «живой язык», «глубокая экспертиза» и подобное. Такой портрет будет отвергнут. Пишите то, что следует из наблюдений, и сошлитесь минимум на два.'
      : 'The portrait may not rate the manner: "engaging", "professional", "a vibrant style", "deep expertise" and the like. Such a portrait is rejected. Write what follows from the observations, and cite at least two.',
    '',
    ...(habits || layout
      ? [
          locale === 'ru'
            ? 'ПОСЧИТАНО ПО ВСЕМУ КОРПУСУ:'
            : 'COUNTED OVER THE WHOLE CORPUS:',
          renderPostHabits(habits ?? null, locale),
          renderPostLayout(layout ?? null, locale),
          '',
        ].filter((line) => line !== '')
      : []),
    ...observations.map(
      (one) =>
        `[${one.ref}] ${one.field} ${
          one.metric ?? '-'
        } «${one.quote}» → ${one.claim}`
    ),
  ].join('\n');

/** V2 adds the grounded topics field while the exported V1 prompt stays stable. */
export const reducePromptV2 = (
  observations: readonly (ObservationV2 & { sampleCode: string; ref: string })[],
  locale: 'ru' | 'en',
  habits?: BrandVoiceMeasurementResult['postHabits'],
  layout?: BrandVoiceMeasurementResult['postLayout']
): string => {
  const topicInstruction =
    locale === 'ru'
      ? 'Верните поле TOPICS: о каких темах автор пишет и что считает важным говорить. Берите только темы, подтверждённые цитатами.'
      : 'Return the TOPICS field: what the author writes about and considers important to say. Include only topics grounded in quotes.';
  const portraitHeading =
    locale === 'ru' ? '\n\nПОРТРЕТ.' : '\n\nPORTRAIT.';
  return reducePrompt(
    observations as readonly (Observation & {
      sampleCode: string;
      ref: string;
    })[],
    locale,
    habits,
    layout
  ).replace(
    portraitHeading,
    `\n${topicInstruction}${portraitHeading}`
  );
};

/**
 * Deduplication across chunks, which map-reduce needs by construction: the
 * same habit shows up in most samples, and a proposal listing it eight times
 * has told the reader nothing eight times.
 */
const dedupe = <T extends Observation | ObservationV2>(
  observations: (T & { sampleCode: string; ref: string })[]
) => {
  const seen = new Set<string>();
  return observations.filter((one) => {
    const key = `${one.field}|${one.metric ?? ''}|${one.claim
      .toLowerCase()
      .replace(/\s+/gu, ' ')
      .trim()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

async function attempt<T>(
  transport: AssistTransport,
  stage: 'map' | 'reduce',
  prompt: string,
  schemaName: string,
  parse: (value: unknown) => T,
  calls: AssistResult['calls'],
  /** Where this call sits in the run, for the line a person is reading. */
  place: { index: number; total: number },
  onProgress?: (event: AssistProgressEvent) => void
): Promise<{ value: T } | { error: string }> {
  let lastError = 'unknown';
  for (let index = 1; index <= MAX_ATTEMPTS; index += 1) {
    try {
      const raw = await transport.complete({
        stage,
        // The repair loop hands the violation back rather than asking again in
        // the same words: a model that produced invalid output once will
        // usually produce it again from an identical prompt.
        prompt:
          index === 1
            ? prompt
            : `${prompt}\n\nSCHEMA VIOLATION: ${lastError}\nAnswer again, valid against the schema.`,
        schemaName,
      });
      const value = parse(raw);
      calls.push({ stage, attempt: index, ok: true });
      onProgress?.({ stage, ...place, ok: true });
      return { value };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      calls.push({ stage, attempt: index, ok: false });
      onProgress?.({ stage, ...place, ok: false });
    }
  }
  return { error: lastError };
}

/**
 * A bounded number of workers over one list, results in the list's order.
 *
 * Written here rather than reached for as a dependency: it is nine lines, and
 * the one property that matters — `results[i]` belongs to `items[i]` however
 * the calls interleaved — is easier to see than to look up.
 */
async function mapWithLimit<In, Out>(
  items: readonly In[],
  limit: number,
  run: (item: In, index: number) => Promise<Out>
): Promise<Out[]> {
  const results = new Array<Out>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    for (let at = next++; at < items.length; at = next++) {
      results[at] = await run(items[at], at);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker())
  );
  return results;
}

export async function runAssist({
  samples,
  measurement,
  transport,
  locale = 'ru',
  sampleLimit,
  onProgress,
}: {
  samples: readonly BrandVoiceSampleInput[];
  measurement: BrandVoiceMeasurementResult;
  transport: AssistTransport;
  locale?: 'ru' | 'en';
  /** Overridden only by a test that wants a shorter run. */
  sampleLimit?: number;
  /**
   * Told about each call as it happens, for a caller streaming to a person.
   *
   * Optional and never awaited: this pipeline decides nothing by it, and a
   * listener that throws must not be able to lose a run that is being paid
   * for.
   */
  onProgress?: (event: AssistProgressEvent) => void;
}): Promise<AssistResult> {
  const chosen = selectSamples(
    samples,
    sampleLimit ?? sampleLimitFor(samples.length)
  );
  const byCode = new Map(chosen.map((sample) => [sample.code, sample]));
  const calls: AssistResult['calls'] = [];
  const rejected: AssistRejection[] = [];
  const collected: (Observation & { sampleCode: string; ref: string })[] = [];

  // Three at a time, and every sample keeps its own call log, so the record
  // and the observations read in the corpus's order however the calls raced.
  const mapped = await mapWithLimit(chosen, MAP_CONCURRENCY, (sample, at) => {
    const own: AssistResult['calls'] = [];
    return attempt<MapResult>(
      transport,
      'map',
      mapPrompt(sample, measurement, locale),
      'brand-voice-observations',
      (raw) => mapResultSchema.parse(raw),
      own,
      { index: at + 1, total: chosen.length },
      onProgress
    ).then((outcome) => ({ sample, outcome, own }));
  });

  for (const { sample, outcome, own } of mapped) {
    calls.push(...own);

    if ('error' in outcome) {
      // One sample failing does not end the run: the others still describe
      // the same writer.
      rejected.push({
        sampleCode: sample.code,
        reason: 'SCHEMA_INVALID',
        detail: outcome.error,
      });
      continue;
    }

    const result = outcome.value;
    if (!byCode.has(result.sampleCode)) {
      rejected.push({
        sampleCode: result.sampleCode,
        reason: 'UNKNOWN_SAMPLE',
      });
      continue;
    }

    const source = byCode.get(result.sampleCode)!;
    const grounded = result.observations.filter((observation) =>
      quoteIsGrounded(observation.quote, source.text)
    );
    if (grounded.length === 0) {
      rejected.push({
        sampleCode: result.sampleCode,
        reason: 'QUOTE_NOT_GROUNDED',
      });
      continue;
    }
    if (grounded.length < result.observations.length) {
      rejected.push({
        sampleCode: result.sampleCode,
        reason: 'QUOTE_NOT_GROUNDED',
        detail: `${result.observations.length - grounded.length}`,
      });
    }

    grounded.forEach((observation, index) => {
      collected.push({
        ...observation,
        sampleCode: result.sampleCode,
        ref: `${result.sampleCode}#${index + 1}`,
      });
    });
  }

  const observations = dedupe(collected);
  if (observations.length === 0) {
    return { observations, proposal: null, rejected, calls };
  }

  const reduced = await attempt<ReduceResult>(
    transport,
    'reduce',
    reducePrompt(observations, locale, measurement.postHabits, measurement.postLayout),
    'brand-voice-proposal',
    (raw) => reduceResultSchema.parse(raw),
    calls,
    // One reduce for the whole corpus: the last step, and its own step.
    { index: 1, total: 1 },
    onProgress
  );

  if ('error' in reduced) {
    return { observations, proposal: null, rejected, calls };
  }

  // A field whose grounds did not survive the critic pass is dropped rather
  // than kept unfounded. The screen shows it as "нет основания", which is a
  // true statement about the corpus.
  const known = new Set(observations.map((one) => one.ref));
  const grounded = reduced.value.fields.filter((field) =>
    field.observationRefs.some((ref) => known.has(ref))
  );

  /**
   * One line per field, because the wizard shows one line per field.
   *
   * The schema bounds how many fields come back but not that they are
   * distinct, and a real corpus does produce two — the model finds two habits
   * worth stating about the same tone and states both. Downstream everything
   * is keyed by field name: `proposalField` takes the *first* match, so the
   * second copy could never be accepted and sat `UNDECIDED` forever, blocking
   * an activation that asks for every line to be decided; the screen keyed its
   * rows by field name too, so React saw two rows claiming to be one.
   *
   * The one kept is the line resting on the most grounded observations — it is
   * the one the corpus says most about — and the others' references are folded
   * into it rather than dropped, so the "why" panel still shows every quote
   * behind the claim.
   */
  const byField = new Map<string, (typeof grounded)[number]>();
  for (const field of grounded) {
    const existing = byField.get(field.field);
    const groundedRefs = (candidate: (typeof grounded)[number]) =>
      candidate.observationRefs.filter((ref) => known.has(ref)).length;
    if (!existing) {
      byField.set(field.field, field);
      continue;
    }
    const winner = groundedRefs(field) > groundedRefs(existing) ? field : existing;
    const loser = winner === field ? existing : field;
    byField.set(field.field, {
      ...winner,
      observationRefs: [
        ...new Set([...winner.observationRefs, ...loser.observationRefs]),
      ],
    });
  }
  const fields = [...byField.values()];

  return {
    observations,
    proposal: { ...reduced.value, fields, portrait: keptPortrait(reduced.value, known) },
    rejected,
    calls,
  };
}

export async function runAssistV2({
  samples,
  measurement,
  transport,
  locale = 'ru',
  sampleLimit,
  onProgress,
}: {
  samples: readonly BrandVoiceSampleInput[];
  measurement: BrandVoiceMeasurementResult;
  transport: AssistTransport;
  locale?: 'ru' | 'en';
  /** Overridden only by a test that wants a shorter run. */
  sampleLimit?: number;
  /**
   * Told about each call as it happens, for a caller streaming to a person.
   *
   * Optional and never awaited: this pipeline decides nothing by it, and a
   * listener that throws must not be able to lose a run that is being paid
   * for.
   */
  onProgress?: (event: AssistProgressEvent) => void;
}): Promise<AssistResultV2> {
  const chosen = selectSamples(
    samples,
    sampleLimit ?? sampleLimitFor(samples.length)
  );
  const byCode = new Map(chosen.map((sample) => [sample.code, sample]));
  const calls: AssistResultV2['calls'] = [];
  const rejected: AssistRejection[] = [];
  const collected: (ObservationV2 & { sampleCode: string; ref: string })[] = [];

  // Three at a time, and every sample keeps its own call log, so the record
  // and the observations read in the corpus's order however the calls raced.
  const mapped = await mapWithLimit(chosen, MAP_CONCURRENCY, (sample, at) => {
    const own: AssistResultV2['calls'] = [];
    return attempt<MapResultV2>(
      transport,
      'map',
      mapPromptV2(sample, measurement, locale),
      'brand-voice-observations-v2',
      (raw) => mapResultSchemaV2.parse(raw),
      own,
      { index: at + 1, total: chosen.length },
      onProgress
    ).then((outcome) => ({ sample, outcome, own }));
  });

  for (const { sample, outcome, own } of mapped) {
    calls.push(...own);

    if ('error' in outcome) {
      // One sample failing does not end the run: the others still describe
      // the same writer.
      rejected.push({
        sampleCode: sample.code,
        reason: 'SCHEMA_INVALID',
        detail: outcome.error,
      });
      continue;
    }

    const result = outcome.value;
    if (!byCode.has(result.sampleCode)) {
      rejected.push({
        sampleCode: result.sampleCode,
        reason: 'UNKNOWN_SAMPLE',
      });
      continue;
    }

    const source = byCode.get(result.sampleCode)!;
    const grounded = result.observations.filter((observation) =>
      quoteIsGrounded(observation.quote, source.text)
    );
    if (grounded.length === 0) {
      rejected.push({
        sampleCode: result.sampleCode,
        reason: 'QUOTE_NOT_GROUNDED',
      });
      continue;
    }
    if (grounded.length < result.observations.length) {
      rejected.push({
        sampleCode: result.sampleCode,
        reason: 'QUOTE_NOT_GROUNDED',
        detail: `${result.observations.length - grounded.length}`,
      });
    }

    grounded.forEach((observation, index) => {
      collected.push({
        ...observation,
        sampleCode: result.sampleCode,
        ref: `${result.sampleCode}#${index + 1}`,
      });
    });
  }

  const observations = dedupe(collected);
  if (observations.length === 0) {
    return { observations, proposal: null, rejected, calls };
  }

  const reduced = await attempt<ReduceResultV2>(
    transport,
    'reduce',
    reducePromptV2(
      observations,
      locale,
      measurement.postHabits,
      measurement.postLayout
    ),
    'brand-voice-proposal-v2',
    (raw) => reduceResultSchemaV2.parse(raw),
    calls,
    // One reduce for the whole corpus: the last step, and its own step.
    { index: 1, total: 1 },
    onProgress
  );

  if ('error' in reduced) {
    return { observations, proposal: null, rejected, calls };
  }

  // A field whose grounds did not survive the critic pass is dropped rather
  // than kept unfounded. The screen shows it as "нет основания", which is a
  // true statement about the corpus.
  const known = new Set(observations.map((one) => one.ref));
  const grounded = reduced.value.fields.filter((field) =>
    field.observationRefs.some(
      (ref) =>
        known.has(ref) &&
        (field.field !== 'TOPICS' ||
          observations.some(
            (observation) =>
              observation.ref === ref && observation.field === 'TOPICS'
          ))
    )
  );

  /**
   * One line per field, because the wizard shows one line per field.
   *
   * The schema bounds how many fields come back but not that they are
   * distinct, and a real corpus does produce two — the model finds two habits
   * worth stating about the same tone and states both. Downstream everything
   * is keyed by field name: `proposalField` takes the *first* match, so the
   * second copy could never be accepted and sat `UNDECIDED` forever, blocking
   * an activation that asks for every line to be decided; the screen keyed its
   * rows by field name too, so React saw two rows claiming to be one.
   *
   * The one kept is the line resting on the most grounded observations — it is
   * the one the corpus says most about — and the others' references are folded
   * into it rather than dropped, so the "why" panel still shows every quote
   * behind the claim.
   */
  const byField = new Map<string, (typeof grounded)[number]>();
  for (const field of grounded) {
    const existing = byField.get(field.field);
    const groundedRefs = (candidate: (typeof grounded)[number]) =>
      candidate.observationRefs.filter((ref) => known.has(ref)).length;
    if (!existing) {
      byField.set(field.field, field);
      continue;
    }
    const winner =
      groundedRefs(field) > groundedRefs(existing) ? field : existing;
    const loser = winner === field ? existing : field;
    byField.set(field.field, {
      ...winner,
      observationRefs: [
        ...new Set([...winner.observationRefs, ...loser.observationRefs]),
      ],
    });
  }
  const fields = [...byField.values()];

  return {
    observations,
    proposal: {
      ...reduced.value,
      fields,
      portrait: keptPortraitV2(reduced.value, known),
    },
    rejected,
    calls,
  };
}

/** V1 portrait validation remains available to V1 callers. */
export function keptPortrait(
  reduced: ReduceResult,
  known: Set<string>
): ReduceResult['portrait'] {
  const portrait = reduced.portrait;
  if (!portrait) return null;
  if (!portrait.observationRefs.some((ref) => known.has(ref))) return null;
  if (portraitCliches(portrait.text).length >= PORTRAIT_CLICHE_LIMIT) return null;
  return portrait;
}

/**
 * The portrait survives on the same terms as a field, and on one more.
 *
 * Grounding first: a portrait citing nothing the corpus contains is a portrait
 * of nobody, and it is dropped rather than shown. Then the clichés — the
 * failure prose has and quotes do not. Both rejections leave the profile
 * portrait-less, which the screens already handle, instead of failing an
 * analysis that produced four good fields.
 */
export function keptPortraitV2(
  reduced: ReduceResultV2,
  known: Set<string>
): ReduceResultV2['portrait'] {
  const portrait = reduced.portrait;
  if (!portrait) return null;
  if (!portrait.observationRefs.some((ref) => known.has(ref))) return null;
  if (portraitCliches(portrait.text).length >= PORTRAIT_CLICHE_LIMIT) return null;
  return portrait;
}

export type { ProfileField, ProfileFieldV2 };
