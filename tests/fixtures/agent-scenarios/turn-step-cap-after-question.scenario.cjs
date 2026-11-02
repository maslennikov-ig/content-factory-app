'use strict';

/** A native question resume continues requested work with tools still available. */
const LIST = ['tool', 'channels_list', {}];

const LENGTH_OPTIONS = [
  { id: 'brief', label: 'Кратко по сути', description: 'Главная мысль и один полезный вывод.', lengthRange: { idealMin: 300, idealMax: 600, hardMax: 800 }, recommended: false },
  { id: 'context', label: 'С контекстом', description: 'Главная мысль, объяснение и практический вывод.', lengthRange: { idealMin: 900, idealMax: 1300, hardMax: 1600 }, recommended: true },
];

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
        [['tool', 'piece_adapt', { pieceId: 'p1', channelId: 'c1', lengthOptions: LENGTH_OPTIONS }]],
      ],
    },
    { resume: { action: 'keep-channel' } },
    {
      resume: { answers: [{key: 'hook', mode: 'delegate'}] },
      model: [
        ...Array.from({ length: 2 }, () => [LIST]),
        [['text', 'Пост готов, каналы проверены.']],
      ],
    },
  ],
  check: (run) => {
    const [size, ask, answer] = run.turns;
    expect(size.suspended[0].payload.kind).toBe('writing-settings');
    expect(size.admissions.map(([operation]) => operation)).toEqual(['agent']);
    expect(ask.suspended).toHaveLength(1);
    // The answered call is followed by the requested reads and a normal final answer.
    expect(answer.steps.map((step) => step.toolChoice === 'none')).toEqual([
      false, false, false,
    ]);
    expect(answer.toolCalls.filter(({ toolName }) => toolName === 'channels_list')).toHaveLength(2);
    expect(answer.text).toBe('Пост готов, каналы проверены.');
  },
};
