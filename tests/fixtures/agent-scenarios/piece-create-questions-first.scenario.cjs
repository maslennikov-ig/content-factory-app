'use strict';

/**
 * The questions of a new piece are the person's (`kcxz.31`, D1). Live stand
 * 27.09.2026 (`http/s1a-sse-01.ndjson`): right after `piece_create` the model
 * opened the piece and called `piece_answer { answers: null, decide:
 * ["position","ask-1"] }` by itself; only the paid cap stopped it. Now the
 * answer is refused in the request that wrote the piece — before a paid slot
 * is taken — with words the model relays; the person's own «Решите за меня»
 * in the next message goes through.
 */
module.exports = {
  id: 'piece-create-questions-first',
  title: 'Новая заготовка: вопросы сначала видит человек, «Решите за меня» — только его',
  covers: ['piece.create', 'piece.open', 'piece.answer'],
  turns: [
    {
      say: 'мы в команде отказались от ежедневных созвонов-статусов',
      model: [
        [['tool', 'piece_create', { text: 'мы в команде отказались от ежедневных созвонов-статусов', inputKind: 'thought' }]],
        [['tool', 'piece_open', { pieceId: 'p9' }]],
        [['tool', 'piece_answer', { pieceId: 'p9', answers: null, decide: ['audience', 'ask-1'] }]],
        [['text', 'Заготовка cnt-9 готова, у неё два вопроса. Ответите здесь или на карточке — или «Решите за меня»?']],
      ],
    },
    {
      say: 'Решите за меня',
      model: [
        [['tool', 'piece_answer', { pieceId: 'p9', decide: ['audience', 'ask-1'] }]],
        [['text', 'Решили за вас, суть обновлена.']],
      ],
    },
  ],
  check: (run) => {
    const [create, decided] = run.turns;
    const refused = create.outputs.find((one) => one.toolName === 'piece_answer').output;
    expect(refused).toMatchObject({ ok: false, code: 'INPUT_NEEDS_PERSON' });
    expect(refused.reason).toMatch(/Only the person answers them/);
    // Refused before a slot: the only paid call of the first message is the piece.
    expect(create.admissions.map(([operation]) => operation)).toEqual(['agent', 'intake']);
    // The next message is the person's: their «Решите за меня» is the answer.
    expect(run.requests.filter(([door]) => door === 'piece.answer')).toEqual([
      ['piece.answer', 'p9', { decide: ['audience'] }],
    ]);
    expect(decided.outputs[0].output).toMatchObject({ ok: true, summary: { pieceId: 'p9', questions: 0 } });
    expect(run.writes).toEqual([
      ['piece.created', 'p9'],
      ['piece.answered', 'p9', 'user-1'],
    ]);
  },
};
