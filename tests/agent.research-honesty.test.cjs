'use strict';

/**
 * Промпт не притворяется, что материал был (`content-factory-next-fn33.130`).
 *
 * Прогон 05.09.2026: во всех пяти генерациях состояние графа несло
 * `fresearch = {summary:'', facts:[], sources:[]}` и при этом
 * `researchAvailable = true`. Модель получала пустой блок материала и ни
 * одного запрета — и писала уверенный текст без единого числа и без ссылок.
 *
 * Причина в том, что `start()` строит контекст всегда, поэтому первая ветка
 * `research()` («контекст есть») срабатывает и тогда, когда в контексте
 * ничего нет. Пустой контекст — это не «поиск прошёл», это «годного материала
 * нет»: детерминированный откат в `docs/product/content-memory-spec.md`
 * называет его UNAVAILABLE + ALLOW_USER_ONLY, то есть писать можно только из
 * того, что человек ввёл сам.
 *
 * Здесь проверяется ровно это: пустой контекст даёт `researchAvailable:
 * false`, а текст материала в промпте становится честной строкой запрета;
 * контекст с фактом остаётся доступным и приезжает в промпт с цитатой.
 */

const {
  loadAgentGraph,
} = require('../scripts/evidence/voice-eval/product-graph.cjs');

const NO_RESEARCH =
  'No web research was performed. Do not claim current or fresh data unless the user supplied it.';

const emptyContext = { facts: [], evidence: [] };

const contextWithFact = {
  facts: [
    {
      citationId: 'F1',
      statement: 'Продажи выросли на 12%',
      temporalKind: 'CURRENT',
      freshUntil: '2026-10-01T00:00:00.000Z',
      evidenceCitationIds: ['E1'],
    },
  ],
  evidence: [
    {
      citationId: 'E1',
      title: 'Отчёт',
      excerpt: 'Продажи выросли на 12%',
      url: 'https://example.test/report',
      retrievedAt: '2026-09-05T00:00:00.000Z',
      publishedAt: '2026-09-01T00:00:00.000Z',
    },
  ],
};

const graph = () => loadAgentGraph({ chatModel: {} }).service;

describe('the generator tells the model the truth about its material', () => {
  test('a context that carried nothing reads as no research at all', async () => {
    const service = graph();

    const state = await service.research({
      orgId: 'org',
      messages: [],
      contentContext: emptyContext,
    });

    expect(state.researchAvailable).toBe(false);
    expect(state.fresearch).toEqual({ summary: '', facts: [], sources: [] });
  });

  test('the prompt block for an empty context is the refusal, not an empty frame', () => {
    const service = graph();

    const text = service.researchText({
      contentContext: emptyContext,
      contextText: service.renderContext(emptyContext),
      researchAvailable: false,
    });

    expect(text).toBe(NO_RESEARCH);
  });

  test('a context with a fact stays available and reaches the prompt with its citation', async () => {
    const service = graph();

    const state = await service.research({
      orgId: 'org',
      messages: [],
      contentContext: contextWithFact,
    });

    expect(state.researchAvailable).toBe(true);
    expect(state.fresearch.summary).toContain('[F1] Продажи выросли на 12%');
    expect(state.fresearch.sources).toEqual([
      {
        title: '[E1] Отчёт',
        url: 'https://example.test/report',
        publishedAt: '2026-09-01T00:00:00.000Z',
      },
    ]);

    const text = service.researchText({
      ...state,
      contentContext: contextWithFact,
      contextText: service.renderContext(contextWithFact),
    });
    expect(text).toContain('[F1]');
    expect(text).not.toContain(NO_RESEARCH);
  });
});
