const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

/**
 * One organ of voice control, not two.
 *
 * `GeneratorDto` inherited a required `tone: personal | company` switch from
 * upstream, and the brand profile carries `voice.pointOfView` for the same
 * question. Both reached the prompt: `Make sure it sounds ${state.tone}` and
 * `Use ${tone === 'personal' ? '1st' : '3rd'} person mode` sat beside a
 * server-resolved profile that had already answered. Which one won was visible
 * neither before generation nor after it.
 *
 * The profile wins. The switch survives as a DTO field so external callers do
 * not break, and it is read only when no profile is resolved. This guard fails
 * the moment both sources influence the prompt again.
 */

function loadTypeScriptModule(relativePath, mocks) {
  const filename = path.resolve(__dirname, '..', relativePath);
  const source = fs.readFileSync(filename, 'utf8');
  const compiled = ts.transpileModule(source, {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2021,
      esModuleInterop: true,
      experimentalDecorators: true,
    },
  }).outputText;
  const loaded = { exports: {} };
  const localRequire = (request) =>
    Object.prototype.hasOwnProperty.call(mocks, request)
      ? mocks[request]
      : require(request);
  const evaluate = new Function(
    'exports',
    'require',
    'module',
    '__filename',
    '__dirname',
    compiled
  );
  evaluate(
    loaded.exports,
    localRequire,
    loaded,
    filename,
    path.dirname(filename)
  );
  return loaded.exports;
}

let promptTemplate = '';
let modelResult;

const contentLanguage = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/dtos/content.language.ts',
  {}
);
const agentCategories = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/agent/agent.categories.ts',
  {}
);
const agentTopics = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/agent/agent.topics.ts',
  {}
);

/**
 * Настоящий, а не заглушка: у блока голоса он взят ради двух потолков —
 * сколько выученных правил уходит в промпт и какой длины каждое. Заглушка с
 * копией этих чисел означала бы, что набор проходит и тогда, когда продукт и
 * его собственный потолок разошлись.
 */
const voiceLearning = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/content-intelligence/brand-voice/voice-learning.ts',
  {}
);

const voiceDirectives = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/agent/voice-directives.ts',
  {
    '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice-learning':
      voiceLearning,
  }
);

/** Настоящий, а не заглушка: проверка длины арифметическая и модель не зовёт. */
const postLength = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/content-intelligence/brand-voice/post-length.ts',
  {}
);

/**
 * Тоже настоящий: правила отбора черновиков — чистая арифметика, а заглушка
 * здесь означала бы, что этот набор проходит и на сломанном правиле.
 */
const draftPick = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/agent/draft-pick.ts',
  {}
);

/**
 * Эти два — общим загрузчиком, а не местным.
 *
 * Местный не разбирает относительные импорты, а `draft-gaps` читает соседей
 * (`./post-habits`, `./segment`). Подменять их заглушками нельзя: узел графа
 * обязан считать привычку тем же кодом, что и продукт, иначе набор проверит
 * согласие двух заглушек между собой.
 */
const { loadTypeScriptModule: loadReal } = require('./helpers/load-tsx.cjs');
const BRAND_VOICE =
  'libraries/nestjs-libraries/src/content-intelligence/brand-voice';
const draftGaps = loadReal(`${BRAND_VOICE}/draft-gaps.ts`);
const localePack = loadReal(`${BRAND_VOICE}/locale-pack.ts`);

const { AgentGraphService } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/agent/agent.graph.service.ts',
  {
    '@langchain/core/messages': {
      BaseMessage: class {},
      HumanMessage: class {},
      ToolMessage: class {},
    },
    '@langchain/langgraph': {
      END: 'END',
      START: 'START',
      StateGraph: class {},
    },
    '@langchain/openai': {
      ChatOpenAI: class {},
      DallEAPIWrapper: class {},
    },
    '@langchain/tavily': { TavilySearch: class {} },
    '@langchain/langgraph/prebuilt': { ToolNode: class {} },
    '@langchain/core/prompts': {
      ChatPromptTemplate: {
        fromTemplate(template) {
          promptTemplate = template;
          return {
            pipe() {
              return {
                async invoke(input) {
                  // What the model actually receives, not the template alone.
                  // The voice stopped being interpolated into the template on
                  // 2026-08-25 and became a value, because it now carries the
                  // author's own prose and a brace in it would be read as a
                  // placeholder. A test that reads the template alone would
                  // from then on read `{voice}` and call it a pass.
                  promptTemplate = Object.entries(input || {}).reduce(
                    (text, [key, value]) =>
                      text.split(`{${key}}`).join(String(value)),
                    template
                  );
                  return modelResult;
                },
              };
            },
          };
        },
      },
    },
    '@contentfactory/nestjs-libraries/database/prisma/posts/posts.service': {
      PostsService: class {},
    },
    '@contentfactory/nestjs-libraries/database/prisma/media/media.service': {
      MediaService: class {},
    },
    '@contentfactory/nestjs-libraries/upload/upload.factory': {
      UploadFactory: { createStorage: () => ({}) },
    },
    '@contentfactory/nestjs-libraries/dtos/generator/generator.dto': {
      GeneratorDto: class {},
    },
    '@contentfactory/nestjs-libraries/openai/generation.error': {
      generationError: (error) => error,
    },
    '@contentfactory/nestjs-libraries/openai/ai.clients': {
      getChatModel: async () => ({ withStructuredOutput: () => ({}) }),
      getImageModel: async () => ({}),
    },
    '@contentfactory/nestjs-libraries/openai/ai.usage.service': {
      executeAiStreamOperation: (_organizationId, _operation, factory) =>
        factory(),
    },
    '@contentfactory/nestjs-libraries/agent/voice-directives': voiceDirectives,
    '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/post-length':
      postLength,
    /**
     * Предложение после черновика и словарь, по которому оно считается.
     *
     * Настоящие, а не заглушки: узел только читает их и должен читать то же,
     * что продукт. Заглушка здесь спрятала бы ровно то, ради чего этот набор
     * существует, — что граф берёт голос из одного источника.
     */
    '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/draft-gaps':
      draftGaps,
    '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/locale-pack':
      localePack,
    '@contentfactory/nestjs-libraries/agent/draft-pick': draftPick,
    '@contentfactory/nestjs-libraries/dtos/content.language': contentLanguage,
    '@contentfactory/nestjs-libraries/agent/agent.categories': agentCategories,
    '@contentfactory/nestjs-libraries/agent/agent.topics': agentTopics,
    '@contentfactory/nestjs-libraries/openai/web.research.service': {
      WebResearchService: class {},
      WebSearchNotConfigured: class extends Error {},
    },
    '@contentfactory/nestjs-libraries/content-intelligence/brand-profile/brand-profile.context.service':
      { BrandProfileContextService: class {} },
  }
);

const baseState = {
  orgId: 'org',
  language: 'en',
  format: 'one_long',
  messages: [{ content: 'Tell them about the new line' }],
  popularPosts: [{ hook: 'An existing hook', content: 'Body' }],
  hook: 'A new hook',
};

/** The exact upstream lines. If either survives, the switch still speaks. */
const LEGACY_TONE_LINE = 'Make sure it sounds';
const LEGACY_PERSON_LINE = 'person mode';

const PROMPT_METHODS = [
  ['generateHook', { hook: 'Hook' }],
  ['generateContent', { content: { content: 'Post' } }],
];

const withProfile = (pointOfView, formality) => ({
  ...baseState,
  // The switch is set to the value that used to win, so a passing test means
  // the profile beat it rather than that nothing disagreed.
  tone: 'personal',
  resolvedBrandProfile: {
    effectiveVoice: { pointOfView, formality },
  },
});

describe('generator voice has a single source', () => {
  beforeEach(() => {
    promptTemplate = '';
  });

  test.each(PROMPT_METHODS)(
    '%s drops the inherited tone switch once a profile is resolved',
    async (method, result) => {
      modelResult = result;
      const service = new AgentGraphService({}, {});

      await service[method](withProfile('company_we', 'neutral'));

      expect(promptTemplate).not.toContain(LEGACY_TONE_LINE);
      expect(promptTemplate).not.toContain(LEGACY_PERSON_LINE);
      expect(promptTemplate).not.toContain('personal');
    }
  );

  test.each(PROMPT_METHODS)(
    '%s states the point of view the profile chose, once',
    async (method, result) => {
      modelResult = result;
      const service = new AgentGraphService({}, {});

      await service[method]({
        ...withProfile('company_we', 'neutral'),
        format: 'one_long',
      });

      expect(promptTemplate).toContain('They write as "we"');
      // Exactly one point-of-view line for a single post. Two sources is the
      // defect this exists for, and they do not have to contradict each other
      // to be a defect. A thread deliberately repeats one source, which is the
      // next test.
      //
      // The wording changed on 2026-08-25 — the block states habits as
      // observations about a person rather than as orders to a model — but
      // what is counted did not: there is one place a point of view comes from.
      const mentions = promptTemplate.match(
        /They write as "I"|They write as "we"|They write about the organisation from outside/g
      );
      expect(mentions).toHaveLength(1);
    }
  );

  test.each([
    ['first_person', 'They write as "I"'],
    ['company_we', 'They write as "we"'],
    ['third_person', 'They write about the organisation from outside'],
  ])('maps %s to its own instruction', async (pointOfView, expected) => {
    modelResult = { hook: 'Hook' };
    const service = new AgentGraphService({}, {});

    await service.generateHook(withProfile(pointOfView, 'formal'));

    expect(promptTemplate).toContain(expected);
  });

  test('carries the formality the profile chose', async () => {
    modelResult = { hook: 'Hook' };
    const service = new AgentGraphService({}, {});

    await service.generateHook(withProfile('third_person', 'conversational'));

    expect(promptTemplate).toContain('They write the way they talk.');
  });

  test.each(PROMPT_METHODS)(
    '%s still reads the switch when no profile is resolved',
    async (method, result) => {
      modelResult = result;
      const service = new AgentGraphService({}, {});

      // No `resolvedBrandProfile`: the machine caller that only knows `tone`
      // must keep working exactly as before.
      await service[method]({ ...baseState, tone: 'company' });

      expect(promptTemplate).toContain('Make sure it sounds company');
      expect(promptTemplate).toContain('Use 3rd person mode');
    }
  );

  test('a thread restates the voice per item, a single post does not', async () => {
    modelResult = { content: [{ content: 'Post' }, { content: 'Post' }] };
    const service = new AgentGraphService({}, {});

    await service.generateContent({
      ...withProfile('company_we', 'neutral'),
      format: 'thread_long',
    });
    const thread = promptTemplate;

    await service.generateContent({
      ...withProfile('company_we', 'neutral'),
      format: 'one_long',
    });
    const single = promptTemplate;

    // By the third item the opening instructions are out of the model's
    // effective attention — the drift every comparable product reports.
    expect(thread.match(/They write as "we"/g).length).toBeGreaterThan(1);
    expect(thread).toContain('before writing each item');
    // A single post has no boundary, so restating would only cost tokens.
    expect(single.match(/They write as "we"/g)).toHaveLength(1);
  });

  test('falls back to the previous default when the switch is absent too', async () => {
    modelResult = { hook: 'Hook' };
    const service = new AgentGraphService({}, {});

    await service.generateHook({ ...baseState });

    expect(promptTemplate).toContain('Make sure it sounds personal');
    expect(promptTemplate).toContain('Use 1st person mode');
  });
});

describe('generator DTO keeps the external contract', () => {
  const source = fs.readFileSync(
    path.resolve(
      __dirname,
      '..',
      'libraries/nestjs-libraries/src/dtos/generator/generator.dto.ts'
    ),
    'utf8'
  );

  test('still declares tone with the same allowed values', () => {
    expect(source).toContain("@IsIn(['personal', 'company'])");
    expect(source).toMatch(/tone\?*:\s*'personal'\s*\|\s*'company'/);
  });

  test('no longer requires tone, so a caller may omit it', () => {
    const tone = source.slice(
      source.lastIndexOf('@', source.indexOf('tone?:') - 1) - 400,
      source.indexOf('tone?:')
    );
    expect(tone).toContain('@IsOptional()');
  });
});

describe('generator screen shows one voice control', () => {
  const read = (relativePath) =>
    fs.readFileSync(path.resolve(__dirname, '..', relativePath), 'utf8');

  const generator = read(
    'apps/frontend/src/components/launches/generator/generator.tsx'
  );
  const editor = read(
    'apps/frontend/src/components/new-launch/manage.modal.tsx'
  );
  const line = read(
    'apps/frontend/src/components/new-launch/applied-voice.line.tsx'
  );
  const ribbon = read(
    'apps/frontend/src/components/brand-voice/voice-ribbon.tsx'
  );
  const provenanceLine = read(
    'apps/frontend/src/components/new-launch/provenance.line.tsx'
  );

  test('has no personal/company select left to disagree with the profile', () => {
    // Hidden is not enough: while the control is visible the user believes it
    // works, and it does not.
    expect(generator).not.toContain("form.register('tone')");
    expect(generator).not.toContain('personal_voice_i_am_happy_to_announce');
    expect(generator).not.toContain('company_voice_we_are_happy_to_announce');
  });

  test('the strip names the version, and can say it is no longer the one in force', () => {
    // `36r.13` replaced the line's body with the four-state ribbon. The rule
    // did not change — the reader must know what wrote this text — so the
    // guard moved to the new subject rather than being dropped with the old.
    expect(ribbon).toContain('versionLabel');
    expect(ribbon).toContain('currentVersionLabel');
    expect(line).toContain('VoiceRibbon');
    // One component, two hosts. A second one doing nearly this is how two
    // screens start disagreeing about what "applied" means.
    expect(line).toContain('AppliedVoiceLine');
  });

  test('the four states exist and only one of them is a failure', () => {
    for (const state of [
      'fresh',
      'stale-context',
      'voice-moved',
      'no-profile',
    ]) {
      expect(ribbon).toContain(`'${state}'`);
    }
    // Working without a profile is a working mode. The strip says so and
    // borrows nothing from an error: no alert role, no danger colour.
    expect(ribbon).not.toMatch(/role="alert"/);
    expect(ribbon).not.toMatch(/bg-cf-danger|border-cf-danger/);
  });

  test('the generator reads the active profile and shows the line', () => {
    expect(generator).toContain('/content-intelligence/brand-profile');
    expect(generator).toContain('<AppliedVoiceLine');
  });

  /**
   * Окно поста отвечает на тот же вопрос, но одной строкой.
   *
   * 04.09.2026 владелец убрал из окна ленту аватара и панель контекста: они
   * говорили о происхождении дважды и языком отладчика. Правило не изменилось
   * — читатель должен знать, чем написан текст, — изменилось место ответа:
   * в генераторе это `AppliedVoiceLine`, в окне поста `ProvenanceLine`, и обе
   * читают одно и то же `brandProfileSelection`.
   */
  test('the post window answers the same question in one line', () => {
    expect(editor).toContain('<ProvenanceLine');
    expect(provenanceLine).toContain('brandProfileSelection');
    expect(editor).not.toContain('<VoiceRibbonContainer');
    expect(editor).not.toContain('<AppliedVoiceLine');
  });

  test('the generator keeps the shared line rather than its own copy', () => {
    expect(generator).toContain(
      '@contentfactory/frontend/components/new-launch/applied-voice.line'
    );
  });
});
