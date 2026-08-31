'use strict';

/**
 * The owner's voice, rebuilt through the product's own service.
 *
 * `pl1.20` cannot be paid for against a profile analysed before 2026-08-25:
 * that one carries no portrait, no examples of the author's own posts and no
 * measured post length, so three of the eight variants narrow to an empty
 * block, generate exactly what `none` generates, and return a null result that
 * looks like an answer. `generate.cjs` refuses such a run rather than billing
 * for it — and then the profile has to actually be rebuilt.
 *
 * There is no headless door to that in the product: rebuilding is four HTTP
 * routes behind a session. This drives `VoiceService` directly instead, with
 * only its database and model collaborators replaced — the same discipline
 * `product-graph.cjs` follows for generation, and for the same reason. A
 * script that assembled the profile itself would produce a voice the product
 * would never have produced, and the run measuring it would be measuring this
 * script.
 *
 * What it costs: one assist run over the corpus — a map call per sampled text
 * and one reduce — with the space's own key. Everything else is arithmetic.
 *
 *   node scripts/evidence/voice-eval/rebuild-voice.cjs --corpus owner
 *   node scripts/evidence/voice-eval/rebuild-voice.cjs --corpus owner --dry-run
 *   node scripts/evidence/voice-eval/rebuild-voice.cjs --corpus owner --activate-only
 *   node scripts/evidence/voice-eval/rebuild-voice.cjs --corpus owner --refresh-deviations
 *   node scripts/evidence/voice-eval/rebuild-voice.cjs --corpus owner --avatar 'Имя аватара'
 *
 * The avatar comes from the corpus entry; `--avatar` names one directly for an
 * avatar the registry does not describe yet.
 *
 * `--dry-run` reads the profile and says what is missing without calling
 * anything. `--activate-only` skips the paid half and activates the proposal
 * already stored on the latest measurement — which is what a rebuild that got
 * its answer and then failed to activate needs, and the reason the assist
 * result is written to the database before activation is attempted.
 *
 * `--refresh-deviations` is the same trick for a different gap: the positions
 * against the norm are arithmetic over texts the space already has, so a
 * profile activated before the norm existed can gain them without asking the
 * model anything. It recomputes them onto the latest measurement and activates
 * the stored proposal again. Free, and the only way to get directions onto a
 * voice without paying twice for the portrait that is already in it.
 */

const path = require('node:path');
const { Client } = require('pg');
const { loadWithMocks, REPO } = require('../../../tests/helpers/load-ts-with-mocks.cjs');
const { resolveAiConfig } = require('./model.cjs');
const { resolveAvatar } = require('./corpora.cjs');

const VOICE_BASE =
  'libraries/nestjs-libraries/src/content-intelligence/brand-voice';
const PROFILE_BASE =
  'libraries/nestjs-libraries/src/content-intelligence/brand-profile';

const DEFAULT_DATABASE_URL =
  process.env.VOICE_EVAL_DATABASE_URL ||
  'postgresql://cf-dev:cf-dev-pwd@localhost:5433/cf-dev-db';

const registry = () => require('./corpora.json');

/**
 * Prisma, as the three repositories expect to receive it.
 *
 * They take `{ model }` and call `$transaction` on the transaction wrapper, so
 * one real client serves as both. `PrismaRepository` and `PrismaTransaction`
 * are Nest wrappers around exactly that.
 */
function prismaProviders(prisma) {
  return {
    '@contentfactory/nestjs-libraries/database/prisma/prisma.service': {
      PrismaRepository: class {},
      PrismaTransaction: class {},
    },
  };
}

/**
 * The assist port, wired to the space's own key.
 *
 * `VoiceAssistService` reaches for `getOpenAiClient` and `requireActiveAiConfig`
 * — both organisation-scoped in the product and both unavailable outside it —
 * and for `AiUsageService`, which counts a quota this run is not subject to.
 * The three are replaced and nothing else is: the prompt, the schema, the
 * grounding check that drops an unquoted observation and the two-strike rule
 * on an ungrounded run are all the shipped code.
 */
function loadAssist(aiConfig) {
  const OpenAI = require('openai');
  const client = new OpenAI({
    apiKey: aiConfig.apiKey,
    ...(aiConfig.baseUrl ? { baseURL: aiConfig.baseUrl } : {}),
  });
  const { VoiceAssistService } = loadWithMocks(
    `${VOICE_BASE}/voice-assist.service.ts`,
    {
      '@contentfactory/nestjs-libraries/openai/ai.clients': {
        getOpenAiClient: async () => client,
      },
      '@contentfactory/nestjs-libraries/openai/ai.provider.config': {
        requireActiveAiConfig: async () => ({ textModel: aiConfig.textModel }),
      },
      '@contentfactory/nestjs-libraries/openai/ai.usage.service': {
        AiUsageService: class {},
      },
    }
  );
  return new VoiceAssistService({
    executeAiOperation: (organizationId, kind, work) => work(),
  });
}

function loadService(prisma, assist) {
  const mocks = prismaProviders(prisma);
  const { BrandProfileRepository } = loadWithMocks(
    `${PROFILE_BASE}/brand-profile.repository.ts`,
    mocks
  );
  const { VoiceProfileRepository } = loadWithMocks(
    `${VOICE_BASE}/voice-profile.repository.ts`,
    mocks
  );
  const { VoiceSampleRepository } = loadWithMocks(
    `${VOICE_BASE}/voice-sample.repository.ts`,
    mocks
  );
  const { VoiceService } = loadWithMocks(`${VOICE_BASE}/voice.service.ts`, mocks);

  const database = { model: prisma };
  const transaction = { model: prisma };
  const profiles = new VoiceProfileRepository(
    new BrandProfileRepository(database, transaction),
    database
  );
  const samples = new VoiceSampleRepository(database, transaction);
  return new VoiceService(samples, profiles, assist, {});
}

/** What the factorial run needs and this profile does not have. */
function missingFields(content) {
  const missing = [];
  if (!content?.persona?.portrait) missing.push('persona.portrait');
  if (!(content?.examples ?? []).length) missing.push('examples');
  if (!content?.voice?.postLength?.median) missing.push('voice.postLength');
  return missing;
}

/**
 * The active version of one avatar's voice.
 *
 * Joining on `organizationId` alone returned any of the space's three since
 * `pl1.26`, and `rows[0]` then reported somebody else's portrait as the state
 * of the rebuild — before it as «nothing missing», after it as proof the paid
 * call worked. The avatar's own id is the only thing that identifies it.
 */
async function readState(sql, avatarId) {
  const { rows } = await sql.query(
    `select v.id, v."versionNumber", v.content
       from "ProjectBrandProfileVersion" v
       join "ProjectBrandProfile" p on p."activeVersionId" = v.id
      where p.id = $1`,
    [avatarId]
  );
  return rows[0] ?? null;
}

async function main() {
  const argv = process.argv.slice(2);
  const at = (flag) => {
    const index = argv.indexOf(flag);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const corpusName = at('--corpus') || 'owner';
  const dryRun = argv.includes('--dry-run');
  const refreshDeviations = argv.includes('--refresh-deviations');
  const refreshExamples = argv.includes('--refresh-examples');
  const activateOnly =
    argv.includes('--activate-only') || refreshDeviations || refreshExamples;

  const corpus = registry()[corpusName];
  if (!corpus) {
    throw new Error(
      `unknown corpus "${corpusName}"; known: ${Object.keys(registry()).join(', ')}`
    );
  }
  const organizationId = corpus.organizationId;
  /**
   * Whose voice is being rebuilt.
   *
   * `--avatar` overrides the registry by name, for the one case the registry
   * cannot cover: an avatar that exists on the stand and has no corpus entry
   * yet. Everything else reads it from the corpus, so a rebuild and the run
   * that measures it cannot disagree about the author.
   */
  const avatarName = at('--avatar') || corpus.avatar;

  const sql = new Client({
    connectionString: corpus.databaseUrl || DEFAULT_DATABASE_URL,
  });
  await sql.connect();
  let aiSetting;
  let avatar;
  try {
    avatar = await resolveAvatar(sql, { ...corpus, name: corpusName, avatar: avatarName });
    console.log(`avatar: ${avatar.name}${avatar.isDefault ? ' (по умолчанию)' : ''}`);
    const before = await readState(sql, avatar.id);
    console.log(
      `before: version ${before?.versionNumber ?? '—'}, missing ${
        missingFields(before?.content).join(', ') || 'nothing'
      }`
    );
    if (dryRun) return;
    if (
      !missingFields(before?.content).length &&
      !refreshDeviations &&
      !refreshExamples
    ) {
      console.log('nothing to rebuild; the active voice already carries all three');
      return;
    }
    if (!activateOnly) {
      const setting = await sql.query(
        `select provider, "apiKey", "textModel", "usageMode"
           from "AiProviderSetting"
          where "organizationId" = $1
          order by "createdAt" desc
          limit 1`,
        [organizationId]
      );
      aiSetting = setting.rows[0];
    }
  } finally {
    await sql.end();
  }

  const aiConfig = activateOnly ? null : resolveAiConfig(aiSetting);
  if (aiConfig) console.log(`model: ${aiConfig.provider} · ${aiConfig.textModel}`);

  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient({
    datasources: { db: { url: corpus.databaseUrl || DEFAULT_DATABASE_URL } },
  });
  try {
    const service = loadService(prisma, aiConfig ? loadAssist(aiConfig) : null);
    // The rebuild is the owner's own, so it runs as an administrator of the
    // space it belongs to. The user id is read from the space rather than
    // invented: every version records who activated it.
    const owner = await prisma.userOrganization.findFirst({
      where: { organizationId, role: { in: ['SUPERADMIN', 'ADMIN'] } },
      orderBy: { createdAt: 'asc' },
    });
    if (!owner) throw new Error('this space has no administrator to act as');
    // `avatarId` on the actor is how the product itself says whose voice a
    // request is about; leaving it off would resolve to the space's default
    // and rebuild the wrong author without saying so.
    const actor = {
      organizationId,
      userId: owner.userId,
      canManage: true,
      avatarId: avatar.id,
    };
    const scope = { avatarId: avatar.id, inherited: Boolean(avatar.isDefault) };

    if (!activateOnly) {
      console.log('analysing and asking the model for the portrait…');
      const analysed = await service.runAnalysis(actor, { withAssist: true });
      if (analysed.outcome !== 'ready') {
        throw new Error(
          `the corpus is not ready: ${JSON.stringify(analysed.readiness ?? {})}`
        );
      }
    }

    if (refreshDeviations) {
      // Arithmetic over the corpus the space already has: no model, no bill.
      const corpus = await service._samples.listActive(organizationId, scope);
      const measurement = await service._samples.latestMeasurement(
        organizationId,
        scope
      );
      if (!measurement) throw new Error('this space has no measurement yet');
      const deviations = service.deviationsFor(corpus, 'ru');
      if (!deviations) {
        throw new Error('no norm for this language; nothing to refresh');
      }
      await service._samples.updateMeasurement(organizationId, measurement.id, {
        metrics: {
          ...(measurement.metrics ?? {}),
          deviations,
        },
      });
      console.log(
        `отклонения посчитаны: ${Object.keys(deviations.byMetric).length} измерений, ` +
          `норма ${deviations.normVersion}`
      );
    }

    if (refreshExamples) {
      /**
       * Пересобрать цитаты автора по действующему разбору, ничего не оплачивая.
       *
       * Активация намеренно не трогает уже заполненное поле примеров — человек
       * мог их править, и `contentFrom` пишет туда только в пустое. Значит,
       * изменившийся отбор до профиля через активацию не доходит вовсе, и
       * стенд мерил бы старые цитаты новым кодом. Продуктовая дверь для этого
       * одна и та же: `setExamples` с `refresh`.
       */
      const before = await service.passport(actor);
      let after;
      try {
        after = await service.setExamples(actor, { refresh: true });
      } catch (error) {
        if (error && error.code) {
          throw new Error(
            `${error.code}${error.subject ? ` · ${JSON.stringify(error.subject)}` : ''}: ${error.message}`
          );
        }
        throw error;
      }
      const lengths = (list) =>
        (list ?? []).map((one) => one.text.length).join(', ');
      console.log(
        `цитаты пересобраны: было ${
          lengths(before?.voice?.examples) || '—'
        }; стало ${lengths(after?.voice?.examples) || '—'}`
      );
      return;
    }

    const proposal = await service.proposal(actor);
    if (proposal.state === 'empty' || !proposal.fields) {
      throw new Error('the model returned no proposal to accept');
    }
    console.log(
      `proposal: ${proposal.fields.length} fields, portrait ${
        proposal.portrait ? `${proposal.portrait.text.length} chars` : 'none'
      }`
    );

    // Accepted as they came. This is a rebuild of the owner's own voice for a
    // measurement, not an editing session: changing a line here would put this
    // script's wording into the profile the run then measures.
    if (proposal.portrait) {
      await service.proposalPortrait(actor, { action: 'ACCEPT' });
    }
    for (const field of proposal.fields) {
      await service.proposalField(actor, { key: field.key, action: 'ACCEPT' });
    }

    try {
      await service.activateProposal(actor, { consentGiven: true });
    } catch (error) {
      // The refusal names the fields it is about in `subject`, and the message
      // alone says only that some are missing. A rebuild that stops here has
      // already paid, so the reason has to be printed rather than summarised.
      if (error && error.code) {
        throw new Error(
          `${error.code}${error.subject ? ` · ${error.subject}` : ''}: ${
            error.message
          }`
        );
      }
      throw error;
    }
  } finally {
    await prisma.$disconnect();
  }

  const after = new Client({
    connectionString: corpus.databaseUrl || DEFAULT_DATABASE_URL,
  });
  await after.connect();
  try {
    const state = await readState(after, avatar.id);
    const still = missingFields(state?.content);
    console.log(
      `after: version ${state?.versionNumber ?? '—'}, portrait ${
        state?.content?.persona?.portrait?.length ?? 0
      } chars, examples ${(state?.content?.examples ?? []).length}, postLength ${
        JSON.stringify(state?.content?.voice?.postLength ?? null)
      }`
    );
    if (still.length) {
      throw new Error(`still missing: ${still.join(', ')}`);
    }
    console.log('the voice now answers every variant of the factorial run');
  } finally {
    await after.end();
  }
}

void REPO;
void path;

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
