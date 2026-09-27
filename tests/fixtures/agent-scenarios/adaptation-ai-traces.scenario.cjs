'use strict';

/**
 * `kcxz.14` acceptance: «Убрать следы ИИ» on an adaptation, accepted on the
 * changes card through the adaptation's own accept door.
 */
const ROW = { id: 'a1', pieceId: 'p1', kind: 'post', platform: 'telegram', integrationId: 'c1', integrationName: 'Канал про работу', body: 'Текст', state: 'draft', mediaId: null };
const CHANGES = [
  { id: 's1', basket: 'show', excerpt: 'в современном мире', replacement: 'сейчас', why: 'Штамп' },
  { id: 's2', basket: 'show', excerpt: 'является ключевым', replacement: 'важен', why: 'Канцелярит' },
];

module.exports = {
  id: 'adaptation-ai-traces',
  title: '«Убрать следы ИИ» на адаптации → принятие по карточке',
  covers: ['adaptation.review'],
  world: { adaptations: [ROW], reviewChanges: CHANGES },
  turns: [
    {
      say: 'Убери следы ИИ в посте для Telegram',
      model: [[['tool', 'adaptation_review', { pieceId: 'p1', adaptationId: 'a1', check: 'ai_traces' }]]],
    },
    { resume: { changeIds: ['s1'] }, model: [[['text', 'Убрали один штамп.']]] },
    {
      say: 'А теперь проверь факты',
      model: [[['tool', 'adaptation_review', { pieceId: 'p1', adaptationId: 'a1', check: 'facts' }]]],
    },
    { resume: { changeIds: [] }, model: [[['text', 'Оставили как есть.']]] },
  ],
  check: (run) => {
    const [ask, answer, facts] = run.turns;
    // The page's bodies for the two checks (`adaptation-review.tsx` `run`).
    expect(run.requests.filter(([door]) => door === 'piece.review')).toEqual([
      ['piece.review', 'p1', 'a1', { mode: 'slop' }],
      ['piece.review', 'p1', 'a1', { mode: 'web', confirmWebSpend: true }],
    ]);
    expect(ask.suspended[0].payload).toMatchObject({ kind: 'selection', answerKey: 'changeIds', canDecideForPerson: true });
    expect(ask.suspended[0].payload.options.map((option) => [option.id, option.selected])).toEqual([
      ['s1', true],
      ['s2', true],
    ]);
    expect(ask.admissions.map(([operation]) => operation)).toEqual(['agent', 'text_generation']);
    expect(run.requests.filter(([door]) => door === 'piece.review.accept')).toEqual([
      ['piece.review.accept', 'p1', 'a1', { token: 'token-1', selectedIds: ['s1'] }],
    ]);
    expect(answer.admissions).toEqual([['agent', 'agent', 'user-1', 'succeeded']]);
    expect(answer.data.at(-1)).toEqual({
      type: 'data-adaptation',
      data: { kind: 'adaptation', id: 'a1', pieceId: 'p1' },
      transient: false,
    });
    // Final counts, nothing left waiting (kcxz.31 D10: the live stand's
    // «ещё одно изменение ждёт» after 1 of 1 applied).
    expect(answer.outputs[0].output.summary).toEqual({
      pieceId: 'p1',
      adaptationId: 'a1',
      outcome: 'applied',
      offered: 2,
      applied: 1,
      declined: 1,
      waitingOnCard: 0,
    });
    // Nothing kept on the facts card: kept as is, and nothing waits.
    expect(run.turns[3].outputs[0].output.summary).toMatchObject({
      outcome: 'kept-as-is',
      applied: 0,
      waitingOnCard: 0,
    });
    expect(facts.admissions.map(([operation]) => operation)).toEqual([
      'agent',
      'content_classification',
      'web_research',
      'text_generation',
    ]);
    expect(run.writes).toEqual([['piece.review.accepted', 'p1', ['s1']]]);
  },
};
