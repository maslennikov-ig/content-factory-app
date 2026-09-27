'use strict';

/**
 * `kcxz.38` (R1): «Убери следы ИИ в адаптации cnt-04 для канала «Кухня
 * продукта»» in a fresh chat. The live recheck of 27.09 saw piece.open return
 * only `adaptations: 2`, and the agent sent the person to the piece card to
 * pick one. The open tool now lists each adaptation with its id, channel and
 * state, so the check runs on the right one straight away.
 */
const FOUNDER = { id: 'a1', pieceId: 'p4', kind: 'post', platform: 'telegram', integrationId: 'c1', integrationName: 'Заметки основателя', body: 'Текст для заметок.', postId: 'post-1', state: 'draft', mediaId: null };
const KITCHEN = { id: 'a2', pieceId: 'p4', kind: 'post', platform: 'telegram', integrationId: 'c2', integrationName: 'Кухня продукта', body: 'В современном мире текст для кухни.', postId: 'post-2', state: 'queued', date: '2031-03-04T07:00:00.000Z', plan: { status: 'queued', date: '2031-03-04T07:00:00.000Z', autopilot: false, current: true }, mediaId: null };
const CHANGES = [{ id: 's1', basket: 'show', excerpt: 'В современном мире', replacement: '', why: 'Штамп' }];

module.exports = {
  id: 'adaptation-ai-traces-by-channel',
  title: '«Убери следы ИИ в адаптации для канала X»: адаптация находится через открытие заготовки',
  covers: ['piece.open', 'adaptation.review'],
  world: {
    pieces: [{ id: 'p4', code: 'cnt-04', title: 'Про короткие записи', archivedAt: null, questions: [], answers: [] }],
    adaptations: [FOUNDER, KITCHEN],
    reviewChanges: CHANGES,
  },
  turns: [
    {
      say: 'Убери следы ИИ в адаптации cnt-04 для канала «Кухня продукта»',
      model: [
        [['tool', 'piece_open', { pieceId: 'p4' }]],
        [['tool', 'adaptation_review', { pieceId: 'p4', adaptationId: 'a2', check: 'ai_traces' }]],
      ],
    },
    { resume: { changeIds: ['s1'] }, model: [[['text', 'Убрали штамп.']]] },
  ],
  check: (run) => {
    const [ask] = run.turns;
    const opened = ask.outputs[0].output.summary.untrustedData.value;
    expect(opened.adaptations).toBe(2);
    expect(opened.adaptationList).toEqual([
      { id: 'a1', channel: 'Заметки основателя', state: 'draft' },
      { id: 'a2', channel: 'Кухня продукта', state: 'scheduled' },
    ]);
    // No texts of the adaptations reach the model through the open tool.
    expect(JSON.stringify(opened)).not.toContain('текст для кухни');
    expect(run.requests.filter(([door]) => door === 'piece.review')).toEqual([
      ['piece.review', 'p4', 'a2', { mode: 'slop' }],
    ]);
    expect(run.writes).toEqual([['piece.review.accepted', 'p4', ['s1']]]);
  },
};
