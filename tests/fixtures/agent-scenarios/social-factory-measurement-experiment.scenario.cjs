'use strict';
const { IDS, measurementRows, summary, experimentInput, publishExperimentEvidence } = require('./social-factory-measurement-world.cjs');
module.exports = {
  id: 'social-factory-measurement-experiment', title: 'Гипотеза сначала планируется; шесть сопоставимых наблюдений дают только предлагаемый вывод', covers: ['campaign.experiment', 'campaign.evaluate_experiment'], world: measurementRows(),
  turns: [
    { say: 'Запланируй ограниченное сравнение первых строк для шести материалов и проверь достаточность данных', model: [[['tool', 'campaign_experiment', experimentInput]], [['tool', 'campaign_evaluate_experiment', { experimentId: IDS.experiment }]], [['text', 'Эксперимент сохранён, публикаций для вывода пока недостаточно.']]] },
    { say: 'Публикации завершены, появились настоящие сопоставимые наблюдения за 48 часов; пересчитай', before(rows) { publishExperimentEvidence(rows.socialFactoryMeasurement); }, model: [[['tool', 'campaign_evaluate_experiment', { experimentId: IDS.experiment }]], [['text', 'Есть небольшая наблюдаемая ассоциация, не доказательство причины. Вывод пока предложен.']]] },
    { say: 'Прими этот вывод по версии 1 и покажи, что он поступил в следующие планы', model: [[['tool', 'campaign_finding_review', { findingId: `finding:${IDS.experiment}`, expectedRevision: 1, action: 'accept' }]], [['tool', 'campaign_findings', { channelId: 'c2' }]], [['text', 'Принят как временная рекомендация с дальнейшими экспериментами.']]] },
  ],
  check(run) {
    expect(summary(run.turns[0], 'campaign_experiment')).toMatchObject({ id: IDS.experiment, status: 'planned', channelId: 'c2', comparisonWindowHours: 48 });
    expect(summary(run.turns[0], 'campaign_evaluate_experiment')).toMatchObject({ state: 'insufficient', reason: 'need_three_distinct_publications_per_variant_at_comparable_age' });
    const evaluated = summary(run.turns[1], 'campaign_evaluate_experiment');
    expect(evaluated).toMatchObject({ state: 'finding', finding: { status: 'proposed', interpretation: 'association', sampleSize: 6, explorationShare: 0.25, comparison: { baseline: 10, candidate: 30, baselineCount: 3, candidateCount: 3 } } });
    expect(evaluated.finding.uncertainty).toContain('No guaranteed uplift');
    expect(summary(run.turns[2], 'campaign_findings').findingIds).toContain(`finding:${IDS.experiment}`);
    expect(run.world.socialFactoryMeasurement.experiments).toHaveLength(1);
    expect(run.writes).toContainEqual(['social.finding.proposed', `finding:${IDS.experiment}`]);
    expect(run.writes.some(([name]) => /publish|generate|launch/.test(name))).toBe(false);
  },
};
