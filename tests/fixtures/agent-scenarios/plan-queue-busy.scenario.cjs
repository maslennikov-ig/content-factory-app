'use strict';

const fs = require('node:fs');
const path = require('node:path');

/**
 * The one-queue rule refuses (`CF_QUEUE_BUSY` from `PUT /posts/:id/date`,
 * `ADAPTATION_QUEUE_BUSY` from «Запланировать»): the model reads the refusal
 * in the words the calendar and the page show, and the post stays as it was.
 */
const ru = JSON.parse(
  fs.readFileSync(
    path.resolve(__dirname, '../../../libraries/react-shared-libraries/src/translation/locales/ru/translation.json'),
    'utf8'
  )
);
const QUEUED = {
  id: 'a1',
  pieceId: 'p1',
  kind: 'post',
  platform: 'telegram',
  integrationId: 'c1',
  integrationName: 'Канал про работу',
  body: 'Текст поста.',
  postId: 'post-1',
  state: 'queued',
  date: '2031-03-04T07:00:00.000Z',
  plan: { status: 'queued', date: '2031-03-04T07:00:00.000Z', autopilot: false, current: true },
};
const DRAFT = { ...QUEUED, id: 'a2', postId: 'post-2', state: 'draft', date: null, plan: null };

module.exports = {
  id: 'plan-queue-busy',
  title: 'Очередь занята: отказ человеческими словами, пост как был',
  covers: ['plan.move', 'plan.schedule'],
  world: { adaptations: [QUEUED, DRAFT], queueBusyPosts: ['post-1'], queueBusy: ['a2'] },
  turns: [
    { say: 'Перенеси cnt-1 на среду 12:00', model: [[['tool', 'plan_move', { pieceId: 'p1', adaptationId: 'a1', at: '2031-03-05T12:00:00+03:00' }]]] },
    { approve: true, model: [[['text', 'В этом канале уже запланирована другая версия этого поста.']]] },
    { say: 'Тогда запланируй вторую версию', model: [[['tool', 'plan_schedule', { pieceId: 'p1', adaptationId: 'a2', at: '2031-03-06T10:00:00+03:00' }]]] },
    { approve: true, model: [[['text', 'Другая версия уже выходит.']]] },
  ],
  check: (run) => {
    const moved = run.turns[1].outputs[0].output;
    expect(moved).toEqual({ ok: false, code: 'CF_QUEUE_BUSY', reason: ru.cf_queue_busy_refusal });
    const scheduled = run.turns[3].outputs[0].output;
    expect(scheduled).toEqual({
      ok: false,
      code: 'ADAPTATION_QUEUE_BUSY',
      reason: 'Другая версия этой заготовки уже выходит в этом канале. Дождитесь её выхода или выберите время позже.',
    });
    // Tried once each, nothing written, both rows as they were.
    expect(run.requests.filter(([door]) => ['post.date', 'plan.schedule'].includes(door)).map(([door]) => door)).toEqual([
      'post.date',
      'plan.schedule',
    ]);
    expect(run.writes).toEqual([]);
    expect(run.world.adaptations).toEqual([QUEUED, DRAFT]);
  },
};
