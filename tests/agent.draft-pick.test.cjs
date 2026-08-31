const { RunnableLambda } = require('@langchain/core/runnables');
const {
  loadAgentGraph,
} = require('../scripts/evidence/voice-eval/product-graph.cjs');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

/**
 * Отбор черновиков по голосу — `content-factory-next-pl1.33`.
 *
 * Продукт пишет черновик, спрашивает у мерки этого автора, сколько тот набрал
 * голосов, и покупает следующий только если предыдущий не дошёл до
 * калиброванной точки. Из оплаченных берётся лучший по голосам, а не
 * последний.
 *
 * Проверяется здесь ровно то, за что платит пользователь: сколько черновиков
 * куплено, какой из них ушёл дальше и в каких случаях узел не тратит ничего.
 */

const rules = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/agent/draft-pick.ts'
);

/**
 * Модель, отдающая заранее заданные черновики по одному на вызов.
 *
 * Число вызовов — это и есть счёт: каждый лишний черновик оплачивается
 * пользователем, и любая проверка ниже, которая говорит «второй черновик не
 * куплен», говорит это числом обращений к модели.
 */
const draftingModel = (contents) => {
  const asked = [];
  return {
    asked,
    withStructuredOutput() {
      return RunnableLambda.from(async () => {
        const next = contents[Math.min(asked.length, contents.length - 1)];
        asked.push(next);
        return { content: { content: next, usedCitationIds: [] } };
      });
    },
    invoke: async () => ({ content: '' }),
  };
};

/** Мерка, отвечающая по тексту: сколько голосов и с какой точки «похоже». */
const judgeOf = (accepts, byText) => ({
  accepts,
  score: (text) => (typeof byText === 'function' ? byText(text) : byText),
});

const baseState = (extra = {}) => ({
  orgId: 'org',
  language: 'ru',
  format: 'one_long',
  tone: 'personal',
  messages: [{ content: 'тема' }],
  popularPosts: [],
  researchAvailable: false,
  hook: 'Короткий хук',
  ...extra,
});

/**
 * Один прогон узла в паре с генерацией — то, что делает ребро графа.
 *
 * Ребро проверяется отдельно, ниже, на собранном графе; здесь оно повторено
 * вызовами, чтобы каждая проверка называла свои числа, а не разбирала поток
 * событий.
 */
const runSelection = async (service, state) => {
  let current = { ...state };
  for (;;) {
    current = { ...current, ...(await service.generateContent(current)) };
    current = { ...current, ...(await service.pickDraft(current)) };
    if (service.afterPick(current) !== 'generate-content') return current;
  }
};

describe('правила отбора — что покупается и что выбирается', () => {
  test('точку «похоже» берут из калибровки, а не из вердикта', () => {
    expect(rules.draftPasses(0.4, 0.25)).toBe(true);
    expect(rules.draftPasses(0.25, 0.25)).toBe(true);
    expect(rules.draftPasses(0.2, 0.25)).toBe(false);
    // Мерка промолчала — это не «прошёл» и не «не прошёл».
    expect(rules.draftPasses(null, 0.25)).toBe(false);
    // Границ для этого автора нет — сравнивать не с чем.
    expect(rules.draftPasses(0.9, null)).toBe(false);
  });

  test('без калиброванной точки второй черновик не покупается никогда', () => {
    expect(rules.needsAnotherDraft([{ votes: 0 }], null)).toBe(false);
  });

  test('молчание мерки останавливает отбор, а не разгоняет его', () => {
    expect(rules.needsAnotherDraft([{ votes: null }], 0.25)).toBe(false);
  });

  test('потолок попыток — граница расхода, и она держит', () => {
    const low = [{ votes: 0 }, { votes: 0 }, { votes: 0 }];
    expect(rules.MAX_DRAFT_ATTEMPTS).toBe(3);
    expect(rules.needsAnotherDraft(low.slice(0, 2), 0.25)).toBe(true);
    expect(rules.needsAnotherDraft(low, 0.25)).toBe(false);
  });

  test('прошедший кандидат останавливает отбор, даже если он не последний', () => {
    expect(rules.needsAnotherDraft([{ votes: 0.4 }, { votes: 0 }], 0.25)).toBe(
      false
    );
  });

  test('берётся лучший по голосам, ничья достаётся раннему', () => {
    expect(rules.bestDraftIndex([{ votes: 0.1 }, { votes: 0.3 }])).toBe(1);
    expect(rules.bestDraftIndex([{ votes: 0.3 }, { votes: 0.1 }])).toBe(0);
    expect(rules.bestDraftIndex([{ votes: 0.2 }, { votes: 0.2 }])).toBe(0);
    // Неоценённый кандидат не обыгрывает оценённого: молчание не результат.
    expect(rules.bestDraftIndex([{ votes: 0 }, { votes: null }])).toBe(0);
    expect(rules.bestDraftIndex([{ votes: null }, { votes: 0 }])).toBe(1);
  });
});

describe('узел отбора в графе генерации', () => {
  test('без мерки узел прозрачен: один черновик и он же уходит дальше', async () => {
    const model = draftingModel(['первый черновик']);
    const { service } = loadAgentGraph({ chatModel: model });

    const state = await runSelection(
      service,
      baseState({ draftPickEnabled: true, draftJudge: null })
    );

    expect(model.asked).toHaveLength(1);
    expect(state.content.content).toBe('первый черновик');
    expect(state.draftPick).toBeUndefined();
  });

  test('мерка есть, но отбор выключен — второй черновик не оплачивается', async () => {
    const model = draftingModel(['первый', 'второй']);
    const { service } = loadAgentGraph({ chatModel: model });

    // Отгружаемое значение выключателя, а не значение по умолчанию в тесте:
    // сегодня отбор в продукте выключен, и это утверждение проверяется здесь.
    expect(rules.DRAFT_PICK_SHIPPED).toBe(false);
    const state = await runSelection(
      service,
      baseState({ draftJudge: judgeOf(0.25, 0) })
    );

    expect(model.asked).toHaveLength(1);
    expect(state.content.content).toBe('первый');
  });

  test('первый черновик прошёл точку — за второй не платят', async () => {
    const model = draftingModel(['первый', 'второй']);
    const { service } = loadAgentGraph({ chatModel: model });

    const state = await runSelection(
      service,
      baseState({ draftPickEnabled: true, draftJudge: judgeOf(0.25, 0.4) })
    );

    expect(model.asked).toHaveLength(1);
    expect(state.draftPick).toMatchObject({
      attempts: 1,
      accepts: 0.25,
      picked: 0,
      passed: true,
    });
  });

  test('первый не прошёл, второй прошёл — два черновика, уходит второй', async () => {
    const model = draftingModel(['слабый', 'похожий']);
    const { service } = loadAgentGraph({ chatModel: model });

    const state = await runSelection(
      service,
      baseState({
        draftPickEnabled: true,
        draftJudge: judgeOf(0.25, (text) =>
          text.includes('похожий') ? 0.4 : 0.05
        ),
      })
    );

    expect(model.asked).toHaveLength(2);
    expect(state.content.content).toBe('похожий');
    expect(state.draftPick).toMatchObject({
      attempts: 2,
      picked: 1,
      passed: true,
    });
  });

  test('не прошёл ни один — платим ровно потолок и берём лучшего', async () => {
    const votes = { первый: 0.05, второй: 0.2, третий: 0.1 };
    const model = draftingModel(['первый', 'второй', 'третий', 'четвёртый']);
    const { service } = loadAgentGraph({ chatModel: model });

    const state = await runSelection(
      service,
      baseState({
        draftPickEnabled: true,
        draftJudge: judgeOf(0.25, (text) => {
          const key = Object.keys(votes).find((one) => text.includes(one));
          return key ? votes[key] : 0;
        }),
      })
    );

    expect(model.asked).toHaveLength(3);
    expect(state.content.content).toBe('второй');
    expect(state.draftPick).toMatchObject({
      attempts: 3,
      cap: 3,
      picked: 1,
      passed: false,
      votes: [0.05, 0.2, 0.1],
    });
  });

  test('мерка промолчала о черновике — второй не покупается', async () => {
    const model = draftingModel(['первый', 'второй']);
    const { service } = loadAgentGraph({ chatModel: model });

    const state = await runSelection(
      service,
      baseState({ draftPickEnabled: true, draftJudge: judgeOf(0.25, null) })
    );

    expect(model.asked).toHaveLength(1);
    expect(state.draftPick).toMatchObject({ votes: [null], passed: false });
  });

  test('судится целый пост — хук вместе с контентом, а не поле контента', async () => {
    const seen = [];
    const model = draftingModel(['текст черновика']);
    const { service } = loadAgentGraph({ chatModel: model });

    await runSelection(
      service,
      baseState({
        hook: 'Хук поста',
        draftPickEnabled: true,
        draftJudge: judgeOf(0.25, (text) => {
          seen.push(text);
          return 0.4;
        }),
      })
    );

    expect(seen).toEqual(['Хук поста\n\nтекст черновика']);
  });

  test('тред узел не судит: точка снята на одиночных постах автора', async () => {
    const asked = [];
    const model = {
      withStructuredOutput() {
        return RunnableLambda.from(async () => ({
          content: [
            { content: 'первый пункт', usedCitationIds: [] },
            { content: 'второй пункт', usedCitationIds: [] },
          ],
        }));
      },
      invoke: async () => ({ content: '' }),
    };
    const { service } = loadAgentGraph({ chatModel: model });

    const state = await runSelection(
      service,
      baseState({
        format: 'thread_long',
        draftPickEnabled: true,
        draftJudge: judgeOf(0.25, (text) => {
          asked.push(text);
          return 0;
        }),
      })
    );

    expect(asked).toEqual([]);
    expect(state.draftPick).toMatchObject({ votes: [null], attempts: 1 });
  });

  test('отбор не роняет генерацию, когда мерка бросает', async () => {
    const model = draftingModel(['первый']);
    const { service } = loadAgentGraph({ chatModel: model });

    const state = await runSelection(
      service,
      baseState({
        draftPickEnabled: true,
        draftJudge: {
          accepts: 0.25,
          score: () => {
            throw new Error('мерка недоступна');
          },
        },
      })
    );

    expect(model.asked).toHaveLength(1);
    expect(state.content.content).toBe('первый');
  });
});
