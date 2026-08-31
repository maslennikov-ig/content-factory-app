const { RunnableLambda } = require('@langchain/core/runnables');
const {
  loadAgentGraph,
} = require('../scripts/evidence/voice-eval/product-graph.cjs');

/**
 * Отбор стоит в собранном графе, а не только в методе.
 *
 * Проверки узла рядом (`agent.draft-pick.test.cjs`) зовут `pickDraft` и
 * `afterPick` руками, то есть повторяют ребро. Ребро само по себе может при
 * этом отсутствовать или вести не туда, и генерация тихо пошла бы дальше с
 * первым черновиком: узел зелёный, продукт без отбора. Здесь граф собирается и
 * прогоняется целиком — через `start`, как его зовёт маршрут.
 */

const envelope = {
  contractVersion: 'content-context/v1',
  contentContextSnapshotId: 'snap-1',
  status: 'READY',
  generationPolicy: 'ALLOW_USER_ONLY',
  profile: {
    mode: 'resolved',
    versionId: 'ver-1',
    versionNumber: 1,
    contentDigest: 'digest',
  },
  facts: [],
  evidence: [],
  selectionHash: 'hash',
};

const collaborators = ({ contents, judge }) => {
  const asked = [];
  const chatModel = {
    withStructuredOutput(schema) {
      return RunnableLambda.from(async () => {
        // Классификаторы категории, темы и хука отвечают одним полем; узел
        // контента — единственный, чей ответ здесь считается черновиком.
        const shape = schema?.shape ?? {};
        if (shape.category) return { category: 'категория' };
        if (shape.topic) return { topic: 'тема' };
        if (shape.hook) return { hook: 'Хук поста' };
        const next = contents[Math.min(asked.length, contents.length - 1)];
        asked.push(next);
        return { content: { content: next, usedCitationIds: [] } };
      });
    },
    invoke: async () => ({ content: '' }),
  };
  const { AgentGraphService } = loadAgentGraph({ chatModel });
  const service = new AgentGraphService(
    {
      findAllExistingCategories: async () => [],
      findAllExistingTopicsOfCategory: async () => [],
      findPopularPosts: async () => [],
      findFreeDateTime: async () => '2026-08-28T10:00:00.000Z',
    },
    {},
    {},
    {
      executeAiStreamOperation: (organizationId, operation, factory) =>
        factory(),
    },
    { build: async () => envelope },
    { resolve: async () => ({ effectiveVoice: {} }) },
    { draftJudge: async () => judge }
  );
  return { service, asked };
};

const runGraph = async (service) => {
  const seen = [];
  let last = null;
  for await (const event of service.start('org', {
    research: 'тема',
    format: 'one_long',
    tone: 'personal',
    language: 'ru',
    isPicture: false,
  })) {
    if (event?.name) seen.push(event.name);
    if (event?.data?.output?.content) last = event.data.output;
  }
  return { seen, last };
};

describe('узел отбора стоит в графе и умеет вернуть за вторым черновиком', () => {
  test('отбор выключен — граф проходит узел один раз и не платит второй', async () => {
    const { service, asked } = collaborators({
      contents: ['первый', 'второй'],
      judge: { accepts: 0.25, score: () => 0 },
    });

    const { seen } = await runGraph(service);

    expect(seen).toContain('pick-draft');
    expect(asked).toHaveLength(1);
  });

  test('отбор включён, первый не прошёл — граф возвращается за вторым', async () => {
    const { service, asked } = collaborators({
      contents: ['слабый', 'похожий'],
      judge: {
        accepts: 0.25,
        score: (text) => (text.includes('похожий') ? 0.4 : 0.05),
      },
    });
    service.draftPick = true;

    const { last } = await runGraph(service);

    expect(asked).toEqual(['слабый', 'похожий']);
    expect(last.content[0].content).toBe('похожий');
    expect(last.draftPick).toMatchObject({ attempts: 2, picked: 1 });
  });

  test('не прошёл ни один — граф останавливается на потолке, а не крутится', async () => {
    const votes = { первый: 0.05, второй: 0.2, третий: 0.1 };
    const { service, asked } = collaborators({
      contents: ['первый', 'второй', 'третий', 'четвёртый'],
      judge: {
        accepts: 0.25,
        score: (text) => {
          const key = Object.keys(votes).find((one) => text.includes(one));
          return key ? votes[key] : 0;
        },
      },
    });
    service.draftPick = true;

    const { last } = await runGraph(service);

    expect(asked).toEqual(['первый', 'второй', 'третий']);
    expect(last.content[0].content).toBe('второй');
    expect(last.draftPick).toMatchObject({ attempts: 3, passed: false });
  });

  test('хук пишется один раз на все попытки', async () => {
    const hooks = [];
    const { service } = collaborators({
      contents: ['первый', 'второй', 'третий'],
      judge: { accepts: 0.25, score: () => 0 },
    });
    service.draftPick = true;
    const original = service.generateHook.bind(service);
    service.generateHook = async (state) => {
      const answer = await original(state);
      hooks.push(answer.hook);
      return answer;
    };

    await runGraph(service);

    expect(hooks).toHaveLength(1);
  });
});
