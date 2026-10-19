'use strict';

/** A native question resume continues requested work with tools still available. */
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
        ...Array.from({ length: 2 }, () => [LIST]),
        [['tool', 'piece_adapt', { pieceId: 'p1', channelId: 'c1' }]],
      ],
    },
    {
      resume: { answers: [], decideKeys: ['hook'] },
      model: [
        ...Array.from({ length: 2 }, () => [LIST]),
        [['text', 'Пост готов, каналы проверены.']],
      ],
    },
  ],
  check: (run) => {
    const [ask, answer] = run.turns;
    expect(ask.suspended).toHaveLength(1);
    // The answered call is followed by the requested reads and a normal final answer.
    expect(answer.steps.map((step) => step.toolChoice === 'none')).toEqual([
      false, false, false,
    ]);
    expect(answer.toolCalls.filter(({ toolName }) => toolName === 'channels_list')).toHaveLength(2);
    expect(answer.text).toBe('Пост готов, каналы проверены.');
  },
};
