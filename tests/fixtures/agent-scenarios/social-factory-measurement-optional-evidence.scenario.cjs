'use strict';
const { measurementRows, summary } = require('./social-factory-measurement-world.cjs');
module.exports = {
  id: 'social-factory-measurement-optional-evidence', title: 'Лицензированная аналитика необязательна; чужая лицензия и YouTube не дают сравнительные метрики', covers: ['campaign.optional_evidence'], world: measurementRows(),
  turns: [
    { say: 'Есть ли внешняя аналитика без выбранного коннектора?', model: [[['tool', 'campaign_optional_evidence', { channelId: 'c2', sourceIds: [] }]], [['text', 'Коннектор не настроен; базовая работа доступна.']]] },
    { say: 'Открой разрешённую выгрузку и проверь остальные источники', model: [[['tool', 'campaign_optional_evidence', { channelId: 'c2', sourceIds: ['analytics-license', 'analytics-youtube', 'foreign-analytics'], connectorId: 'licensed_registry_export_v1' }]], [['text', 'Разрешена одна выгрузка. Метрики YouTube и чужой источник не использованы.']]] },
  ],
  check(run) {
    expect(summary(run.turns[0], 'campaign_optional_evidence')).toMatchObject({ status: 'not_configured', documents: [], baselineAvailable: true });
    const output = summary(run.turns[1], 'campaign_optional_evidence');
    expect(output.status).toBe('available'); expect(output.documents).toHaveLength(1);
    expect(output.documents[0].evidence).toMatchObject({ sourceId: 'analytics-license', access: 'licensed', rights: 'permitted', ownerScope: 'org-1' });
    expect(output.documents[0].performance).toMatchObject({ availability: 'unknown' });
    expect(output.gaps).toEqual(['youtube_comparable_use_case_not_approved', 'analytics_license_required']);
    expect(output.admissions).toEqual([expect.objectContaining({ sourceId: 'analytics-license', permissionRevision: 1 })]);
    expect(run.writes).toEqual([]);
  },
};
