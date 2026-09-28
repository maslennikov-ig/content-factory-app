'use strict';

/**
 * Correctness review of the W3 walk fixes, F1 / residual risk: the same for a
 * run resumed with an answer on a question card (the adaptation's interview)
 * — the steps before the card do not count against the answer's request.
 */
const LIST = ['tool', 'channels_list', {}];

module.exports = {
  id: 'turn-step-cap-after-question',
  title: 'Предел шагов после ответа на вопросы — шаги до карточки не считаются',
  covers: ['channels.list', 'piece.adapt'],
  world: {
    adaptQuestions: [{ key: 'hook', question: 'С чего начать пост?', suggested: 'С цифры', options: [] }],
  },
  turns: [
    {
      say: 'Проверь каналы и адаптируй cnt-1 в Telegram',
      model: [
        ...Array.from({ length: 5 }, () => [LIST]),
        [['tool', 'piece_adapt', { pieceId: 'p1', channelId: 'c1' }]],
      ],
    },
    {
      resume: { answers: [], decideKeys: ['hook'] },
      model: [
        ...Array.from({ length: 5 }, () => [LIST]),
        [LIST, ['text', 'Пост готов, каналы проверены.']],
      ],
    },
  ],
  check: (run) => {
    const [ask, answer] = run.turns;
    expect(ask.suspended).toHaveLength(1);
    // Five model steps with tools after the answered one, the last speaks.
    expect(answer.steps.map((step) => step.toolChoice === 'none')).toEqual([
      false, false, false, false, false, true,
    ]);
    expect(answer.toolCalls.filter(({ toolName }) => toolName === 'channels_list')).toHaveLength(5);
    expect(answer.text).toBe('Пост готов, каналы проверены.');
  },
};
