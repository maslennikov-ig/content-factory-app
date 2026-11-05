'use strict';
const { IDS, measurementRows, summary } = require('./social-factory-measurement-world.cjs');
module.exports = {
  id: 'social-factory-measurement-observations', title: 'Метрики: Telegram недоступен, null не превращается в ноль; повтор и чужой материал не создают выборку', covers: ['campaign.measure'], world: measurementRows(),
  turns: [
    { say: 'Проверь показатели опубликованного Telegram-поста', model: [[['tool', 'campaign_measure', { itemId: IDS.telegram, requestId: 'measure-request' }]], [['text', 'Bot API не даёт просмотры этого поста; значение неизвестно.']]] },
    { say: 'Повтори тот же запрос и проверь также эти два ID', model: [[['tool', 'campaign_measure', { itemId: IDS.telegram, requestId: 'measure-request' }]], [['tool', 'campaign_measure', { itemId: IDS.foreignItem, requestId: 'foreign-measure' }]], [['tool', 'campaign_measure', { itemId: IDS.draft, requestId: 'draft-measure' }]], [['text', 'Повтор использует прежнюю запись. Чужой материал и черновик не измерены.']]] },
  ],
  check(run) {
    const first = summary(run.turns[0], 'campaign_measure').observations[0];
    expect(first).toMatchObject({ itemId: IDS.telegram, revision: 2, publicationId: `external:${IDS.telegram}`, availability: 'unsupported', value: null, source: 'provider:telegram:postAnalytics', window: { kind: 'lifetime' } });
    expect(first.evidence[0]).toMatchObject({ rights: 'permitted', factStatus: 'unknown', ownerScope: 'org-1', sourceRevision: `publication:${IDS.telegram}:2` });
    expect(summary(run.turns[1], 'campaign_measure').observations[0].id).toBe(first.id);
    expect(run.turns[1].outputs.slice(1).map(row => row.output)).toEqual([expect.objectContaining({ ok: false, code: 'MEASUREMENT_ITEM_NOT_FOUND' }), expect.objectContaining({ ok: false, code: 'MEASUREMENT_PUBLICATION_REQUIRED' })]);
    expect(run.writes.filter(([name]) => name === 'social.measurement.captured')).toHaveLength(1);
    expect(run.world.socialFactoryMeasurement.observations.filter(row => row.itemId === IDS.telegram)).toHaveLength(1);
    expect(run.requests.filter(([name]) => name === 'SocialFactoryMeasurementService.capture').every(row => row[1] === 'org-1')).toBe(true);
  },
};
