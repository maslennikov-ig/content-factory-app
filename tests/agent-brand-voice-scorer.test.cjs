'use strict';

require('reflect-metadata');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const React = require('react');
const h = React.createElement;
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost/agents/new',
});
for (const key of ['window', 'document', 'navigator']) {
  Object.defineProperty(global, key, {
    configurable: true,
    value: key === 'window' ? dom.window : dom.window[key],
  });
}
global.IS_REACT_ACT_ENVIRONMENT = true;

const { act, render, cleanup } = require('@testing-library/react');
const { loadTypeScriptModule: loadTsx } = require('./helpers/load-tsx.cjs');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const {
  IDENTITY,
  loadCapabilityModule,
  loadRegistry,
  servicesFrom,
  requestContextFor,
  executeTool,
} = require('./helpers/agent-capabilities.cjs');

afterEach(() => cleanup());

const scorerMod = loadCapabilityModule('../scorers/brand-voice-facts.scorer.ts');
const { ru } = loadTsx(
  'apps/frontend/src/components/agents/agent.copy.ts'
).agentCopy;

describe('MastraScorer brand-voice-and-facts (bxeb.3)', () => {
  test('brandVoiceAndFactsScorer is a native MastraScorer that runs deterministically with zero model calls (including real @mastra/core/evals runtime)', async () => {
    expect(scorerMod.BRAND_VOICE_SCORER_ID).toBe('brand-voice-and-facts');
    expect(scorerMod.brandVoiceAndFactsScorer.id).toBe('brand-voice-and-facts');
    expect(typeof scorerMod.brandVoiceAndFactsScorer.run).toBe('function');

    const result = await scorerMod.brandVoiceAndFactsScorer.run({
      input: {
        organizationId: 'org-1',
        locale: 'ru',
        platform: 'telegram',
        facts: [
          { statement: 'Запуск 20 октября 2026 года', verified: true },
          { statement: 'Рост конверсии на 18%', verified: true },
        ],
        voiceCheck: {
          inCorridor: 7,
          total: 8,
          verdict: 'CLOSE',
          summary: 'Похоже на ваш обычный стиль',
        },
      },
      output: {
        text: 'Мы обновили модуль расписания 20 октября и увидели рост конверсии на 18%.',
        entityId: 'adapt-1',
        entityType: 'adaptation',
      },
    });

    expect(result.notScorable).toBeUndefined();
    expect(typeof result.score).toBe('number');
    expect(result.score).toBeGreaterThan(0.7);
    expect(result.analyzeStepResult).toMatchObject({
      rulesMatched: 7,
      rulesTotal: 8,
      factsCount: 2,
      verdict: 'CLOSE',
    });
    expect(result.reason).toContain('Голос 7/8 · Факты 2');

    // Also verify against real @mastra/core/evals in plain Node (bypassing Jest's CJS VM).
    const loaderPath = path.join(__dirname, 'helpers', 'load-ts-module.cjs');
    const nativeReport = JSON.parse(
      execFileSync(
        process.execPath,
        [
          '-e',
          `
          const { loadTypeScriptModule } = require(process.argv[1]);
          const mod = loadTypeScriptModule('libraries/nestjs-libraries/src/chat/scorers/brand-voice-facts.scorer.ts');
          mod.brandVoiceAndFactsScorer.run({
            input: {
              organizationId: 'org-1',
              locale: 'ru',
              platform: 'telegram',
              facts: ['Факт 1', 'Факт 2'],
              voiceCheck: { inCorridor: 8, total: 8, verdict: 'CLOSE' },
            },
            output: {
              text: 'Чистый текст для проверки настоящего MastraScorer.',
              entityId: 'a-native',
              entityType: 'adaptation',
            },
          }).then((res) => {
            process.stdout.write(JSON.stringify({
              id: mod.brandVoiceAndFactsScorer.id,
              score: res.score,
              reason: res.reason,
              analysis: res.analyzeStepResult,
            }));
          });
        `,
          loaderPath,
        ],
        { encoding: 'utf8', timeout: 30_000 }
      )
    );
    expect(nativeReport).toMatchObject({
      id: 'brand-voice-and-facts',
      score: 1,
      analysis: {
        rulesMatched: 8,
        rulesTotal: 8,
        factsCount: 2,
        verdict: 'CLOSE',
      },
    });
  });

  test('scoreBrandVoiceAndFacts persists score payload into ScoresStorage (mastra_scores)', async () => {
    const saved = [];
    const scoresStore = {
      saveScore: jest.fn(async (payload) => {
        saved.push(payload);
        return { score: payload };
      }),
    };

    const summary = await scorerMod.scoreBrandVoiceAndFacts(
      {
        organizationId: 'org-1',
        locale: 'ru',
        platform: 'telegram',
        facts: ['Факт 1', 'Факт 2', 'Факт 3'],
        voiceCheck: {
          inCorridor: 6,
          total: 6,
          verdict: 'CLOSE',
        },
      },
      {
        text: 'Короткий и чистый пост по делу без штампов.',
        entityId: 'piece-42',
        entityType: 'piece',
      },
      {
        scoresStore,
        resourceId: 'conductor:org-1:user-1',
        threadId: 'thread-9',
      }
    );

    expect(summary).toMatchObject({
      scorerId: 'brand-voice-and-facts',
      rulesMatched: 6,
      rulesTotal: 6,
      factsCount: 3,
      verdict: 'CLOSE',
    });
    expect(scoresStore.saveScore).toHaveBeenCalledTimes(1);
    expect(saved[0]).toMatchObject({
      scorerId: 'brand-voice-and-facts',
      entityId: 'piece-42',
      entityType: 'piece',
      resourceId: 'conductor:org-1:user-1',
      threadId: 'thread-9',
      organizationId: 'org-1',
      source: 'LIVE',
      metadata: expect.objectContaining({
        rulesMatched: 6,
        rulesTotal: 6,
        factsCount: 3,
        verdict: 'CLOSE',
      }),
    });
  });

  test('piece.create and piece.adapt attach voiceScore to their emitted cards when checks/core are present', async () => {
    const registry = loadRegistry();
    const catalogue = registry.CAPABILITY_CATALOGUE;
    const find = (id) => catalogue.find((c) => c.id === id);

    const createTool = registry.buildCapabilityTool(find('piece.create'), {
      services: servicesFrom({
        IntakeService: {
          prepare: async () => ({}),
          run: async function* () {
            yield {
              name: 'piece',
              pieceId: 'p-scored',
              code: 'cnt-77',
              core: {
                text: 'Чистый текст заготовки по фактам.',
                slop: { findings: [] },
                brief: {
                  facts: [
                    { statement: 'Факт А', verified: true },
                    { statement: 'Факт Б', verified: true },
                  ],
                },
              },
            };
            yield { name: 'done', pieceId: 'p-scored' };
          },
        },
      }),
      language: 'ru',
      entrance: 'chat',
    });

    const created = await executeTool(
      createTool,
      { text: 'Заготовка по двум фактам' },
      { requestContext: requestContextFor(registry, IDENTITY) }
    );
    const pieceCard = created.parts.find((p) => p.type === 'data-piece');
    expect(pieceCard).toBeDefined();
    expect(pieceCard.data.voiceScore).toMatchObject({
      scorerId: 'brand-voice-and-facts',
      rulesMatched: 5,
      rulesTotal: 5,
      factsCount: 2,
    });

    const adaptTool = registry.buildCapabilityTool(find('piece.adapt'), {
      services: servicesFrom({
        PieceService: {
          adaptPlanMode: async () => 'draft',
          prepareAdapt: async () => ({}),
          adapt: async function* () {
            yield {
              name: 'adapt-started',
              channel: { id: 'c1', name: 'Telegram-канал', providerIdentifier: 'telegram' },
            };
            yield {
              name: 'adaptation',
              adaptation: { id: 'a-scored', state: 'draft' },
            };
          },
          detail: async () => ({
            piece: { id: 'p-scored', code: 'cnt-77', title: 'Заготовка' },
            core: {
              text: 'Суть заготовки',
              brief: {
                facts: [{ statement: 'Подтверждённый факт 1', verified: true }],
              },
            },
            adaptations: [
              {
                id: 'a-scored',
                integrationId: 'c1',
                platform: 'telegram',
                body: 'Готовый пост для канала.',
                checks: {
                  slop: { findings: [] },
                  voice: { verdict: 'CLOSE', inCorridor: 8, total: 8 },
                },
              },
            ],
          }),
        },
      }),
      language: 'ru',
      entrance: 'chat',
    });

    const adapted = await executeTool(
      adaptTool,
      { pieceId: 'p-scored', channelId: 'c1' },
      { requestContext: requestContextFor(registry, IDENTITY) }
    );
    const adaptCard = adapted.parts.find((p) => p.type === 'data-adaptation');
    expect(adaptCard).toBeDefined();
    expect(adaptCard.data.voiceScore).toMatchObject({
      scorerId: 'brand-voice-and-facts',
      rulesMatched: 8,
      rulesTotal: 8,
      factsCount: 1,
      verdict: 'CLOSE',
    });
  });

  test('ArtifactLine renders the Голос N/M · Факты K badge when voiceScore is present', async () => {
    const cards = loadWithMocks('apps/frontend/src/components/agents/agent.cards.tsx', {
      './agent.piece-data': {
        usePieceArtifact: (artifact) => ({ artifact, loaded: true }),
      },
    });

    const artifact = {
      kind: 'adaptation',
      id: 'a-1',
      title: null,
      code: null,
      data: {
        pieceId: 'p-1',
        channel: { id: 'c-1', name: 'Инженерный блог', provider: 'telegram' },
        variant: 1,
        voiceScore: {
          scorerId: 'brand-voice-and-facts',
          score: 0.875,
          rulesMatched: 7,
          rulesTotal: 8,
          factsCount: 3,
          slopCount: 0,
          verdict: 'CLOSE',
        },
      },
    };

    await act(async () => {
      render(
        h(cards.ArtifactLine, {
          artifact,
          open: false,
          onOpen: () => {},
          words: ru,
        })
      );
    });

    const badge = document.querySelector('[data-agent-voice-score="brand-voice-and-facts"]');
    expect(badge).not.toBeNull();
    expect(badge.textContent).toBe('Голос 7/8 · Факты 3');
  });
});
