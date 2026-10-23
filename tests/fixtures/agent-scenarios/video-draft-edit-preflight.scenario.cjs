'use strict';

const { IDS, SOURCE, SETTINGS, videoRows, summary } = require('./video-world.cjs');
const PROMPT = 'Команда закрывает календарь лишних созвонов.';

module.exports = {
  id: 'video-draft-edit-preflight',
  title: 'Сохранённый сырой сценарий редактируется и проверяется без генерации',
  covers: ['video.prepare', 'video.edit', 'video.preflight', 'video.draft'],
  world: videoRows({ drafts: [] }),
  turns: [
    { say: 'Сохрани сырой редактируемый сценарий без ИИ и без запуска видео', model: [
      [['tool', 'video_prepare', { pieceId: IDS.piece, settings: SETTINGS, prepareWithAi: false }]],
      [['tool', 'video_preflight', { draftId: IDS.draft }]],
      [['text', 'Сценарий сохранён, запуск требует отдельного согласия.']],
    ] },
    { say: 'Замени визуальный промпт и открой новую версию', model: [
      [['tool', 'video_edit', { draftId: IDS.draft, version: 1, prompt: PROMPT }]],
      [['tool', 'video_draft', { draftId: IDS.draft }]],
      [['text', 'Новая версия сохранена, прежняя проверка запуска больше не действует.']],
    ] },
  ],
  check: (run) => {
    expect(summary(run.turns[0], 'video_prepare')).toMatchObject({ id: IDS.draft, version: 1, preparedWithAi: false });
    expect(summary(run.turns[0], 'video_preflight')).toMatchObject({ version: 1, preflightId: IDS.apiPreflight, payer: 'workspace_key', estimate: { usd: 0.25 } });
    expect(summary(run.turns[1], 'video_draft')).toMatchObject({ id: IDS.draft, version: 2, brief: { prompt: PROMPT, script: SOURCE } });
    expect(run.world.video.apiPreflight).toBeNull();
    expect(run.world.video.jobs).toEqual([]);
    expect(run.world.pieces[0].body).toBe(SOURCE);
    expect(run.writes).toEqual([['video.prepared', IDS.draft], ['video.preflight', IDS.apiPreflight], ['video.edited', IDS.draft, 2]]);
    expect(run.requests.find(([name]) => name === 'video.prepare')).toEqual(['video.prepare', 'org-1', 'user-1', { pieceId: IDS.piece, settings: SETTINGS, prepareWithAi: false }]);
    expect(run.admissions.map(([operation]) => operation)).toEqual(['agent', 'agent']);
    expect(run.turns.flatMap((turn) => turn.approvals)).toEqual([]);
  },
};
