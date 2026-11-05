'use strict';
const {IDS, SOURCE, REVIEW_SCENARIO, REVIEW_FRAMES, REFERENCE_HASH, reviewJourneyRows, selectedPilot, summary} = require('./native-journey-world.cjs');
const launch = {pilotId: IDS.reviewPilot, referenceDigest: REFERENCE_HASH};
module.exports = {
  id: 'native-pilot-reviewed-clip',
  title: 'Точная сохранённая пара получает отдельную настоящую карточку: Нет не запускает, Да сохраняет одно локальное намерение без вызова провайдера',
  covers: ['video.pilot_launch_reviewed_clip_v2'], world: reviewJourneyRows(),
  turns: [
    {say: 'Проверь старый реквизит пары; без настоящего согласия видео не запускать.', workContext: selectedPilot(IDS.reviewPilot),
      model: [[['tool', 'video_pilot_launch_reviewed_clip_v2', {...launch, referenceDigest: 'f'.repeat(64)}]], [['text', 'Устаревшая пара не даёт разрешения.']]]},
    {say: 'Покажи отдельное согласование обоих сохранённых кадров для одного видео, цену не выдумывай.', workContext: selectedPilot(IDS.reviewPilot),
      model: [[['tool', 'video_pilot_launch_reviewed_clip_v2', launch]]]},
    {approve: false, model: [[['text', 'Отказ принят, намерения видео не создано.']]]},
    {say: 'Снова покажи согласование той же пары в прежнем конечном лимите.', before(rows) {rows.nativeJourney.afterPairDecline = [...rows.nativeJourney.launchIntents];},
      model: [[['tool', 'video_pilot_launch_reviewed_clip_v2', launch]]]},
    {approve: true, model: [[['text', 'В учебной среде записано ровно одно локальное намерение. Это не созданное провайдером видео.']]]},
    {say: 'Перечитай сохранённый результат и кадры без повторной генерации.', model: [[['tool', 'video_preproduction_open', {pilotId: IDS.reviewPilot}]]]},
  ],
  check(run) {
    const data = run.world.nativeJourney, pilot = data.pilots.find(p => p.id === IDS.reviewPilot);
    expect(run.turns[0].outputs[0].output).toMatchObject({ok: false, code: 'CLIP_REFERENCE_APPROVAL_CHANGED'});
    expect(run.turns[0].approvals).toEqual([]);
    expect(run.turns[1].approvals[0]).toMatchObject({toolName: 'video_pilot_launch_reviewed_clip_v2'});
    expect(run.turns[1].approvals[0].reason).toContain('ОДНО видео');
    expect(run.turns[1].approvals[0].reason).toContain('10');
    expect(run.turns[1].approvals[0].reason).toContain('после вашего согласия');
    expect(run.turns[1].outputs).toEqual([]);
    expect(run.turns[2].outputs.some(r => r.output?.ok === true)).toBe(false);
    expect(data.afterPairDecline).toEqual([]);
    expect(data.launchIntents).toEqual([IDS.reviewPilot]);
    expect(run.requests.filter(r => r[0] === 'journey.references.launch')).toHaveLength(1);
    expect(summary(run.turns[4], 'video_pilot_launch_reviewed_clip_v2')).toMatchObject({production: {executionV2: {mode: 'review', referenceApproval: {state: 'approved'}}, authorization: {pilotLimit: '10'}}});
    expect(summary(run.turns[5], 'video_preproduction_open')).toEqual(summary(run.turns[4], 'video_pilot_launch_reviewed_clip_v2'));
    expect(pilot.originalSource).toEqual(SOURCE); expect(pilot.scenario).toEqual(REVIEW_SCENARIO); expect(pilot.reviewPair).toEqual(REVIEW_FRAMES); expect(pilot.cap).toBe('10');
    expect(run.requests.filter(r => r[0] === 'journey.references.approval').every(r => r[1] === 'org-1' && r[2] === 'user-1' && r[3] === run.threadId)).toBe(true);
    expect([data.providerCalls, data.modelCalls, data.renderCalls]).toEqual([0, 0, 0]);
  },
};
