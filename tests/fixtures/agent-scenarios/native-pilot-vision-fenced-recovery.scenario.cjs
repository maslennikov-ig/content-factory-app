'use strict';
const {IDS, reviewJourneyRows, selectedPilot, summary} = require('./native-journey-world.cjs');
module.exports = {
  id: 'native-pilot-vision-fenced-recovery',
  title: 'Явное восстановление переиспользует сохранённый JSON-ответ и расход; повторный новый запрос не запускает новую проверку или видео',
  covers: ['video.pilot_recover_vision_fenced_v1'], world: reviewJourneyRows(true),
  turns: [
    {say: 'Восстанови только сохранённый ответ проверки кадров в JSON-блоке. Новую проверку модели, кадры и видео не создавать.', workContext: selectedPilot(IDS.reviewPilot),
      model: [[['tool', 'video_pilot_recover_vision_fenced_v1', {pilotId: IDS.reviewPilot}]],
        [['tool', 'video_pilot_recover_vision_fenced_v1', {pilotId: IDS.reviewPilot}]], [['text', 'Повторно прочитан тот же сохранённый ответ. Новая проверка изображений не запускалась; прежний расход сохранён.']]]},
    {say: 'Проверь, что новое сообщение не подменяет автора уже сохранённого восстановления.',
      model: [[['tool', 'video_pilot_recover_vision_fenced_v1', {pilotId: IDS.reviewPilot}]], [['text', 'Другое поручение не заменило сохранённое восстановление.']]]},
  ],
  check(run) {
    const data = run.world.nativeJourney, pilot = data.pilots.find(p => p.id === IDS.reviewPilot);
    const outputs = run.turns[0].outputs.filter(r => r.toolName === 'video_pilot_recover_vision_fenced_v1');
    expect(outputs).toHaveLength(2); expect(outputs.every(r => r.output.ok)).toBe(true);
    expect(summary(run.turns[0], 'video_pilot_recover_vision_fenced_v1')).toMatchObject({production: {visionReview: {state: 'reviewed', evidenceOrigin: 'offline_fixture'},
      executionV2: {mode: 'review', referenceApproval: {state: 'awaiting_approval'}}}});
    expect(run.turns[1].outputs[0].output).toMatchObject({ok: false, code: 'CLIP_VISION_RECOVERY_CONFLICT'});
    expect(pilot.visionCapture).toEqual(data.visionBefore);
    expect(pilot.visionCapture.usageReceipt).toEqual({id: 'retained-offline-review', status: 'failed'});
    expect(pilot.visionRecovery).toMatchObject({messageId: 'msg-user-1', text: module.exports.turns[0].say});
    expect(data.visionRecoveryReads).toBe(2);
    expect(run.requests.filter(r => r[0] === 'journey.vision.recover-fenced').every(r => r[1] === 'org-1' && r[2] === 'user-1' && r[3] === run.threadId)).toBe(true);
    expect(run.turns.flatMap(t => t.approvals)).toEqual([]); expect(data.launchIntents).toEqual([]); expect(data.repairIntents).toEqual([]);
    expect([data.providerCalls, data.modelCalls, data.renderCalls]).toEqual([0, 0, 0]);
  },
};
