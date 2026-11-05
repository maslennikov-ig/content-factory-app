'use strict';
const {IDS, SOURCE, REVIEW_SCENARIO, reviewJourneyRows, selectedPilot, summary} = require('./native-journey-world.cjs');
const revise = {pilotId: IDS.reviewPilot, requestMessageId: 'msg-user-1', scope: 'references'};
module.exports = {
  id: 'native-clip-linked-revision',
  title: 'Авторская правка выбранной версии создаёт один связанный текстовый черновик без клонирования кадров, лимита или согласия',
  covers: ['video.preproduction_revise_v2'], world: reviewJourneyRows(),
  turns: [
    {say: 'Измени свет в ОБОИХ визуальных референсах. Точные публичные слова оставить; новую пару пока не создавать.',
      workContext: selectedPilot(IDS.reviewPilot), model: [[['tool', 'video_preproduction_revise_v2', revise]],
        [['text', 'Сохранена связанная текстовая версия. Новых изображений, независимой проверки и разрешения тратить пока нет.']]]},
    {say: 'Повторно открой именно сохранённый результат той же авторской правки и исходную версию, ничего не перегенерируй.',
      workContext: selectedPilot(IDS.reviewPilot), model: [[['tool', 'video_preproduction_revise_v2', revise]],
        [['tool', 'video_preproduction_open', {pilotId: IDS.revision}]]]},
    {say: 'Теперь выбрана новая версия. Не меняй прежний пилот по ошибочному идентификатору инструмента.',
      workContext: selectedPilot(IDS.revision), model: [[['tool', 'video_preproduction_revise_v2', {...revise, requestMessageId: 'msg-user-3'}]],
        [['text', 'Несовпадение выбранной версии отклонено, прежние результаты сохранены.']]]},
  ],
  check(run) {
    const data = run.world.nativeJourney, parent = data.pilots.find(p => p.id === IDS.reviewPilot), child = data.pilots.find(p => p.id === IDS.revision);
    expect(summary(run.turns[0], 'video_preproduction_revise_v2')).toMatchObject({pilotId: IDS.revision, sourceArtifact: SOURCE, state: 'needs_input',
      independentReviewAccepted: false, blocker: 'OFFLINE_MODEL_BOUNDARY', executionModeV2: {mode: 'review', canChange: true},
      revisionV2: {parentPilotId: IDS.reviewPilot, scope: 'references', newImagePair: true}});
    expect(summary(run.turns[1], 'video_preproduction_revise_v2')).toEqual(summary(run.turns[0], 'video_preproduction_revise_v2'));
    expect(run.turns[2].outputs[0].output).toMatchObject({ok: false, code: 'CLIP_SELECTED_PILOT_MISMATCH'});
    expect(data.pilots.filter(p => p.id === IDS.revision)).toHaveLength(1);
    expect(parent).toEqual(data.parentBeforeRevision);
    expect(child).toMatchObject({organizationId: 'org-1', actorId: 'user-1', threadId: run.threadId, originalSource: SOURCE,
      originalRequest: {messageId: 'msg-user-1', text: module.exports.turns[0].say},
      revisionContext: {originalRequest: parent.originalRequest, previousScenario: REVIEW_SCENARIO}});
    for (const key of ['screenText', 'spokenText', 'captions', 'claims', 'unknownFacts', 'rightsConflicts']) expect(child.scenario[key]).toEqual(REVIEW_SCENARIO[key]);
    for (const key of ['prepared', 'cap', 'approved', 'oldFrames', 'reviewPair', 'visionCapture']) expect(child).not.toHaveProperty(key);
    const calls = run.requests.filter(r => r[0] === 'journey.clip.revise');
    expect(calls).toHaveLength(2);
    expect(calls.every(r => r[1] === 'org-1' && r[2] === 'user-1' && r[3] === run.threadId)).toBe(true);
    expect(calls.every(r => r[5].messageId === 'msg-user-1' && r[5].text === module.exports.turns[0].say)).toBe(true);
    expect(run.turns[0].body.workContext.clipPilotId).toBe(IDS.reviewPilot);
    expect(run.turns[2].body.workContext.clipPilotId).toBe(IDS.revision);
    expect(data.launchIntents).toEqual([]); expect(data.repairIntents).toEqual([]);
    expect([data.providerCalls, data.modelCalls, data.renderCalls]).toEqual([0, 0, 0]);
  },
};
