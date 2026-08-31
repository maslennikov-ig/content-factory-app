'use strict';

/**
 * The paid half of the stand: eight topics through every variant, saved.
 *
 * It writes the generations and the exact prompt text that produced them
 * before it writes anything else, so a run that dies halfway still leaves
 * behind the part that was paid for. Everything after this file is free and
 * offline.
 */

const fs = require('node:fs');
const path = require('node:path');

const { TOPICS, TOPICS_VERSION } = require('./topics.cjs');
const { loadAgentGraph } = require('./product-graph.cjs');
const { buildChatModel } = require('./model.cjs');
const { resolveEffectiveVoice } = require('./effective-voice.cjs');

/**
 * The prompt the model actually received.
 *
 * `ChatPromptTemplate.pipe(structuredOutput).invoke(values)` formats the
 * template and hands a prompt value to the runnable, so shadowing `invoke` on
 * that instance is the one place where the finished text exists. Recording it
 * is not decoration: `pl1.2` has to prove by the text of the prompt that no
 * part of the voice is inside the untrusted block, and a screenshot of a table
 * cannot prove that.
 */
function recordingModel(model, sink) {
  return {
    withStructuredOutput(...args) {
      const runnable = model.withStructuredOutput(...args);
      const original = runnable.invoke.bind(runnable);
      runnable.invoke = async (input, config) => {
        sink.push(typeof input?.toString === 'function' ? input.toString() : String(input));
        return original(input, config);
      };
      return runnable;
    },
  };
}

/** The empty content context a stand run generates against by default. */
const EMPTY_CONTEXT = { facts: [], evidence: [] };

const { materialFor } = require('./material.cjs');

/**
 * One generation: the product's hook node and its content node, in order, on
 * the same state — which is how a post is made. Measuring the content alone
 * would leave out the opening line, and the opening line is where a manner is
 * most visible.
 */
async function generateOne({
  service,
  sink,
  variant,
  topic,
  language,
  orgId,
  withMaterial = false,
}) {
  sink.length = 0;
  /**
   * The material, when the run carries any.
   *
   * Handed to the graph as a `contentContext`, which is what the product's own
   * generator builds before it calls this node: `research()` then reads the
   * facts instead of going to the web, `renderContext` puts them in the
   * untrusted block, and the output schema gains `usedCitationIds`. All three
   * are the shipped behaviour, which is the point — a run with material has to
   * measure the product with material, not a second prompt that resembles it.
   */
  const context = withMaterial ? materialFor(topic.id) : EMPTY_CONTEXT;
  const carries = Boolean(context.facts.length || context.evidence.length);
  const state = {
    orgId,
    language,
    format: 'one_long',
    tone: 'personal',
    messages: [{ content: topic.request }],
    popularPosts: [],
    researchAvailable: false,
    ...(carries ? { contentContext: context } : {}),
    ...(variant.state || {}),
  };
  state.contextText = service.renderContext(
    context,
    variant.withProfile ? { effectiveVoice: variant.effectiveVoice } : undefined
  );
  if (variant.withProfile) {
    state.resolvedBrandProfile = { effectiveVoice: variant.effectiveVoice };
  }
  if (carries) {
    // `research()` short-circuits on a context and fills these itself; calling
    // it here keeps the two nodes seeing the same state the product's do.
    Object.assign(state, await service.research(state));
  }

  const { hook } = await service.generateHook(state);
  const { content } = await service.generateContent({ ...state, hook });
  const body = Array.isArray(content) ? content[0] : content;
  return {
    hook,
    content: body?.content ?? '',
    text: [hook, body?.content ?? ''].filter(Boolean).join('\n\n'),
    prompts: { hook: sink[0] ?? null, content: sink[1] ?? null },
  };
}

/**
 * @param pulled the cached corpus payload from `corpora.cjs`
 * @param variants resolved variant descriptors
 * @param outDir the run directory; generations land in it as they arrive
 */
/**
 * What a field has to hold before a variant resting on it means anything.
 *
 * Keyed by the field name the variant shapes speak in, so the two cannot drift:
 * a shape that keeps `examples` is a shape that needs examples.
 */
const LOAD_BEARING = {
  examples: { holds: (voice) => Boolean((voice.examples ?? []).length), as: 'examples' },
  postLength: { holds: (voice) => Boolean(voice.postLength?.median), as: 'postLength' },
  persona: { holds: (voice) => Boolean(voice.persona?.portrait), as: 'persona.portrait' },
  directions: {
    holds: (voice) => Boolean((voice.directions ?? []).length),
    as: 'directions',
  },
};

/**
 * Refuses a run against a profile that cannot answer it.
 *
 * `show` and `examples` are the author's own posts and nothing else. Against a
 * voice analysed before 2026-08-25 those fields are empty, so both variants
 * narrow to an empty block, generate exactly what `none` generates, and the run
 * returns a null result that looks like an answer — after 96 paid calls. The
 * profile has to be rebuilt first, and the stand says so instead of billing.
 *
 * Asked of the shape rather than of a list of variant ids. The list was written
 * when `show`, `examples` and `portrait` were the only variants resting on a
 * field, and `avatar` — added on 2026-08-25 and resting on two of them — was
 * not in it. A run of `none,legacy,product,avatar` against a profile without a
 * portrait would have degraded `avatar` into `none` and reported the
 * difference as a finding, which is the exact failure this refusal exists to
 * prevent.
 */
function assertVariantsCanBeAnswered(variants, voice) {
  const probe = Object.fromEntries(
    Object.keys(LOAD_BEARING).map((field) => [field, true])
  );
  const missing = new Set();
  for (const variant of variants) {
    if (!variant.withProfile || typeof variant.shape !== 'function') continue;
    for (const field of Object.keys(variant.shape(probe))) {
      const rule = LOAD_BEARING[field];
      if (rule && !rule.holds(voice)) missing.add(rule.as);
    }
  }
  if (!missing.size) return;
  throw new Error(
    `this profile carries no ${[...missing].join(' and no ')}, so the ` +
      'variants resting on those fields would generate exactly what «none» ' +
      'generates and return a null result that looks like an answer; ' +
      're-analyse and re-activate the voice — every one of those fields is ' +
      'filled at activation'
  );
}

async function generate({
  pulled,
  variants,
  outDir,
  temperature = 0.7,
  withMaterial = false,
  serviceTier = null,
}) {
  const { corpus, profile, aiSetting } = pulled;
  const effectiveVoice = resolveEffectiveVoice(profile);
  assertVariantsCanBeAnswered(variants, effectiveVoice);
  const built = buildChatModel(aiSetting, temperature, { serviceTier });

  const graphs = new Map();
  const graphFor = (ref) => {
    const key = ref || 'worktree';
    if (!graphs.has(key)) {
      const prompts = [];
      const { service } = loadAgentGraph({
        chatModel: recordingModel(built.model, prompts),
        ref,
      });
      graphs.set(key, { service, prompts });
    }
    return graphs.get(key);
  };

  const outFile = path.join(outDir, 'generations.json');
  /**
   * What this run already paid for, if it was interrupted.
   *
   * Generations are flushed one at a time so that a run killed in the middle
   * does not lose what it bought — and until this, the next attempt started
   * from an empty array and overwrote them, which threw away exactly what the
   * flushing was protecting. A 128-call run is long enough to be interrupted
   * by an ordinary timeout, so resuming is the difference between one bill and
   * two.
   *
   * Only successes are kept. A generation that errored is re-attempted,
   * because the error is usually the reason the run was interrupted.
   */
  const generations = fs.existsSync(outFile)
    ? JSON.parse(fs.readFileSync(outFile, 'utf8')).filter(
        (one) => one && !one.error && one.variantId && one.topicId
      )
    : [];
  const done = new Set(
    generations.map((one) => `${one.variantId}/${one.topicId}`)
  );
  if (done.size) {
    process.stdout.write(`  продолжаем: ${done.size} уже оплачено\n`);
  }
  const flush = () =>
    fs.writeFileSync(outFile, `${JSON.stringify(generations, null, 2)}\n`);

  for (const variant of variants) {
    const { service, prompts } = graphFor(variant.ref);
    for (const topic of TOPICS) {
      if (done.has(`${variant.id}/${topic.id}`)) continue;
      const started = Date.now();
      try {
        const produced = await generateOne({
          service,
          sink: prompts,
          withMaterial,
          // A variant may narrow the voice to one of its parts. The resolver
          // still runs once for the whole run, so every variant narrows the
          // *same* resolved voice and the difference between two of them is the
          // fields, never a re-resolution that drifted.
          variant: {
            ...variant,
            effectiveVoice: variant.shape
              ? variant.shape(effectiveVoice)
              : effectiveVoice,
          },
          topic,
          language: corpus.language,
          orgId: corpus.organizationId,
        });
        generations.push({
          variantId: variant.id,
          topicId: topic.id,
          ms: Date.now() - started,
          ...produced,
        });
      } catch (error) {
        generations.push({
          variantId: variant.id,
          topicId: topic.id,
          ms: Date.now() - started,
          error: String(error?.message || error),
          prompts: { hook: prompts[0] ?? null, content: prompts[1] ?? null },
        });
        process.stderr.write(
          `  ! ${variant.id}/${topic.id}: ${error?.message || error}\n`
        );
      }
      flush();
      process.stdout.write(
        `  ${variant.id}/${topic.id} — ${
          generations[generations.length - 1].error ? 'ошибка' : 'готово'
        }\n`
      );
    }
  }

  return {
    generations,
    model: {
      provider: built.provider,
      textModel: built.textModel,
      temperature,
      // Which capacity wrote these texts. The same model either way, but a
      // reader a year from now should not have to infer it from the date.
      serviceTier: built.serviceTier ?? 'default',
    },
    topicsVersion: TOPICS_VERSION,
    ...(withMaterial
      ? { materialVersion: require('./material.cjs').MATERIAL_VERSION }
      : {}),
  };
}

module.exports = {
  generate,
  generateOne,
  recordingModel,
  assertVariantsCanBeAnswered,
  LOAD_BEARING,
};
