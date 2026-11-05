'use strict';
const { IDS, draft, videoRows } = require('./video-world.cjs');
module.exports = {
  id: 'video-personal-draft-denied',
  title: 'Чужой черновик и ID видеопроекта не становятся карточкой подключения личной подписки',
  covers: ['video.access_v2'],
  world: videoRows({ drafts: [draft(), { ...draft(), id: IDS.foreignDraft, organizationId: 'org-foreign', brief: { script: 'Чужой закрытый текст' } },
    { ...draft(), id: IDS.otherActorDraft, userId: 'other-user', brief: { script: 'Другой владелец черновика' } }],
    productions: [{ id: IDS.productionOnly }] }),
  turns: [{ say: 'Проверь эти идентификаторы перед открытием личного подключения. Чужие черновики и ID производства использовать нельзя.', model: [
    [['tool', 'video_access_v2', { draftId: IDS.foreignDraft }]],
    [['tool', 'video_access_v2', { draftId: IDS.otherActorDraft }]],
    [['tool', 'video_access_v2', { draftId: IDS.productionOnly }]],
    [['text', 'Карточки не открыты: нет подходящего черновика этого пользователя в этой организации.']],
  ] }],
  check(run) {
    expect(run.turns[0].outputs.map(row => row.output.code)).toEqual(['VIDEO_DRAFT_NOT_FOUND', 'VIDEO_ACCESS_DENIED', 'VIDEO_DRAFT_NOT_FOUND']);
    expect(run.turns[0].data.filter(part => part.type === 'data-media')).toEqual([]);
    expect(run.requests.filter(([name]) => name === 'video.access-v2')).toEqual([]);
    expect(run.requests.filter(([name]) => name === 'video.access-draft-v2')).toHaveLength(3);
    expect(JSON.stringify(run.turns[0].outputs)).not.toContain('Чужой закрытый текст');
    expect(JSON.stringify(run.turns[0].outputs)).not.toContain('Другой владелец черновика');
    expect(run.writes).toEqual([]); expect(run.world.video.jobs).toEqual([]);
    expect(run.admissions.map(([operation]) => operation)).toEqual(['agent']);
  },
};
