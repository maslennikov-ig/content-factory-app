'use strict';

/**
 * `kcxz.37` (F9): «Решите за меня» on every question closes the link
 * question too.
 *
 * Final check 27.09.2026: the chat's «Решите за меня» on cnt-07 closed the
 * three experience questions and left «Какую ссылку поставить в пост?» open
 * on the panel. Everything handed over now answers it «Без ссылки» — a link
 * is never invented — and the agent is told so, to say it in a few words. A
 * link the person already gave stays as it is.
 */
const QUESTION = { field: 'facts', key: 'ask-1', question: 'Какой случай был у вас?' };
const GIVEN = { url: 'https://example.org/case', origin: 'author', answeredAt: '2026-09-26T09:00:00.000Z' };

module.exports = {
  id: 'piece-answer-decide-all-link',
  title: 'Вопросы заготовки — «Решите за меня» на все закрывает и вопрос о ссылке',
  covers: ['piece.answer'],
  world: {
    pieces: [
      { id: 'p1', code: 'cnt-1', title: 'Про созвоны', archivedAt: null, questions: [QUESTION], answers: [], linkQuestion: true },
      { id: 'p2', code: 'cnt-2', title: 'Про ретро', archivedAt: null, questions: [QUESTION], answers: [], linkQuestion: true, postLink: GIVEN },
    ],
  },
  turns: [
    {
      say: 'На вопросы cnt-1 решите за меня',
      model: [
        [['tool', 'piece_answer', { pieceId: 'p1' }]],
        [['text', 'Суть обновлена, пост пойдёт без ссылки.']],
      ],
    },
    {
      say: 'И на вопросы cnt-2 тоже решите за меня',
      model: [
        [['tool', 'piece_answer', { pieceId: 'p2' }]],
        [['text', 'Суть обновлена.']],
      ],
    },
  ],
  check: (run) => {
    const [first, second] = run.turns;
    const piece = (id) => run.world.pieces.find((one) => one.id === id);

    // Handed over entirely: the link question is answered «Без ссылки»…
    expect(piece('p1').postLink).toMatchObject({ url: null, origin: 'author' });
    expect(first.outputs[0].output.summary).toMatchObject({
      pieceId: 'p1',
      questions: 0,
      postLink: 'none',
      linkNote: expect.stringContaining('we never invent a link'),
    });

    // …and a link the person gave is kept, with nothing said about it.
    expect(piece('p2').postLink).toEqual(GIVEN);
    expect(second.outputs[0].output.summary).not.toHaveProperty('postLink');
    expect(second.outputs[0].output.summary).not.toHaveProperty('linkNote');
  },
};
