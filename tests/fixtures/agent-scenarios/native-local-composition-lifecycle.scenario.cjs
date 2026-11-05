'use strict';
const {
  IDS,
  SOURCE,
  COMPOSITION,
  DESTINATION,
  PIECE,
  manifest,
  journeyRows,
  summary,
} = require('./native-journey-world.cjs');
const destination = {
  requestId: 'journey-destination',
  name: 'Учебный черновик без аккаунта',
  platform: 'instagram',
  locale: 'en',
};
const compose = {
  operationId: IDS.operation,
  expectedContentRevision: 1,
  requestId: 'journey-compose',
  manifest: manifest(),
};
const scope = { operationId: IDS.operation, compositionId: COMPOSITION };
module.exports = {
  id: 'native-local-composition-lifecycle',
  title:
    'Черновое назначение и очередь локальной сборки: точная версия исходника, чтение, остановка и безопасный повтор',
  covers: [
    'campaign.draft_destination_create',
    'campaign.render_local_reel',
    'campaign.compose_local_video',
    'campaign.local_video_open',
    'campaign.local_video_stop',
  ],
  world: journeyRows(),
  turns: [
    {
      say: 'Создай черновое назначение без подключения аккаунта. Подготовь локальную сборку сохранённого материала, затем покажи состояние.',
      model: [
        [['tool', 'campaign_draft_destination_create', destination]],
        [['tool', 'campaign_draft_destination_create', destination]],
        [
          [
            'tool',
            'campaign_render_local_reel',
            { operationId: IDS.operation, expectedContentRevision: 1 },
          ],
        ],
        [['tool', 'campaign_compose_local_video', compose]],
        [['tool', 'campaign_local_video_open', scope]],
        [
          [
            'text',
            'Назначение черновое. Старый рендерер недоступен; новая сборка только поставлена в локальную очередь. Готового видео ещё нет.',
          ],
        ],
      ],
    },
    {
      say: 'Останови только эту локальную сборку. Открой её снова и проверь повтор исходного запроса без новой очереди.',
      model: [
        [['tool', 'campaign_local_video_stop', scope]],
        [['tool', 'campaign_local_video_open', scope]],
        [['tool', 'campaign_compose_local_video', compose]],
        [
          [
            'tool',
            'campaign_local_video_open',
            { ...scope, operationId: 'foreign-operation' },
          ],
        ],
        [
          [
            'text',
            'Сборка остановлена. Исходник и прежние материалы сохранены; повтор не запустил рендер. Чужая операция недоступна.',
          ],
        ],
      ],
    },
  ],
  check(run) {
    const [first, second] = run.turns,
      data = run.world.nativeJourney;
    expect(summary(first, 'campaign_draft_destination_create')).toMatchObject({
      destination: {
        id: DESTINATION,
        actorId: 'user-1',
        kind: 'draft',
        publishable: false,
        platform: 'instagram',
      },
      profileRevision: 1,
    });
    expect(first.outputs[1].output).toEqual(first.outputs[0].output);
    expect(first.outputs[2].output).toMatchObject({
      ok: false,
      code: 'LOCAL_REEL_UNAVAILABLE',
    });
    expect(summary(first, 'campaign_compose_local_video')).toMatchObject({
      localComposition: {
        id: COMPOSITION,
        state: 'queued',
        expectedContentRevision: 2,
        source: manifest().source,
        publication: 'not_requested',
      },
    });
    expect(summary(first, 'campaign_local_video_open')).toMatchObject({
      localComposition: {
        id: COMPOSITION,
        operationId: IDS.operation,
        state: 'queued',
      },
    });
    expect(summary(second, 'campaign_local_video_stop')).toMatchObject({
      localComposition: { id: COMPOSITION, state: 'stopped' },
    });
    expect(summary(second, 'campaign_local_video_open')).toMatchObject({
      localComposition: { id: COMPOSITION, state: 'stopped' },
    });
    expect(summary(second, 'campaign_compose_local_video')).toMatchObject({
      localComposition: {
        id: COMPOSITION,
        state: 'stopped',
        expectedContentRevision: 2,
      },
    });
    expect(second.outputs.at(-1).output).toMatchObject({
      ok: false,
      code: 'LOCAL_COMPOSITION_ACCESS_DENIED',
    });
    expect(data.localDispatch).toEqual([
      {
        organizationId: 'org-1',
        operationId: IDS.operation,
        compositionId: COMPOSITION,
      },
    ]);
    const item = data.records.find(
      (r) => r.kind === 'campaign_item' && r.id === IDS.item
    ).payload;
    expect(item).toMatchObject({
      contentRevision: 2,
      state: 'needs_input',
      blocker: { code: 'LOCAL_COMPOSITION_STOPPED' },
      material: { sourceArtifact: SOURCE, assets: [] },
    });
    expect(
      data.records.filter((r) => r.kind === 'draft_destination')
    ).toHaveLength(1);
    expect(data.source.piece).toEqual(JSON.parse(JSON.stringify(PIECE)));
    expect(data.source.posts).toBe(0);
    expect(data.source.integrations).toBe(0);
    expect(
      run.requests
        .filter((r) => r[0].startsWith('journey.local.'))
        .every((r) => r[1] === 'org-1' && r[2] === 'user-1')
    ).toBe(true);
    expect([data.providerCalls, data.modelCalls, data.renderCalls]).toEqual([
      0, 0, 0,
    ]);
  },
};
