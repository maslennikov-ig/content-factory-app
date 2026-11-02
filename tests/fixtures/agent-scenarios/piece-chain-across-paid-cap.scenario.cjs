'use strict';

/**
 * Answer, required size choice, adaptation and reserve stay in one native task.
 * The human size gate now splits paid work across resumes; the conductor unit
 * test "legacy paid limits do not become product completion rules" independently
 * retains the single-turn legacy paid-cap regression.
 */
const LENGTH_OPTIONS = [
  { id: 'brief', label: 'Кратко по сути', description: 'Главная мысль и один полезный вывод.', lengthRange: { idealMin: 300, idealMax: 600, hardMax: 800 }, recommended: false },
  { id: 'context', label: 'С контекстом', description: 'Главная мысль, объяснение и практический вывод.', lengthRange: { idealMin: 900, idealMax: 1300, hardMax: 1600 }, recommended: true },
];

module.exports = {
  id: 'piece-chain-across-paid-cap',
  title: 'Ответ, выбор объёма, адаптация и бронь завершаются в одной задаче',
  covers: ['piece.answer', 'piece.adapt', 'plan.place'],
  turns: [{
    say: 'Решите за меня. Потом сделайте адаптацию для «Канал про работу» и поставьте её в план бронью.',
    model: [
      [['tool', 'piece_answer', { pieceId: 'p1' }]],
    ],
  }, {resume: {decideForPerson: true}, model: [
      [['tool', 'piece_adapt', { pieceId: 'p1', channelId: 'c1', lengthOptions: LENGTH_OPTIONS }]],
    ],
  }, {resume: {action: 'keep-channel'}, model: [
      [['tool', 'plan_place', { pieceId: 'p1', adaptationId: 'a1', at: '2026-10-01T10:00:00+03:00' }]],
      [['text', 'Готово: адаптация для «Канал про работу» стоит в плане бронью.']],
    ],
  }],
  check: (run) => {
    const [asked, size, turn] = run.turns;
    expect(size.suspended[0].payload.kind).toBe('writing-settings');
    expect(size.admissions.filter(([operation]) => operation !== 'agent').map(([operation]) => operation)).toEqual(['intake']);
    expect(size.toolCalls.map(({toolName}) => toolName)).toEqual(['piece_adapt']);
    expect(asked.suspended[0].payload.kind).toBe('domain-questions');
    expect(asked.outputs).toEqual([]);
    expect(run.firstCall.system).toContain('without asking «Продолжить?»');
    expect(asked.toolCalls.map(({toolName}) => toolName)).toEqual(['piece_answer']);
    expect(turn.toolCalls.map(({ toolName }) => toolName)).toEqual(['plan_place']);
    expect(turn.outputs.map(({ output }) => output.ok)).toEqual([true, true]);
    expect(turn.outputs[1].output.summary).toMatchObject({ state: 'reserve' });
    expect(turn.admissions.filter(([operation]) => operation !== 'agent')).toHaveLength(2);
    expect([...size.admissions, ...turn.admissions].filter(([operation]) => operation !== 'agent')).toHaveLength(3);
    expect(turn.suspended).toEqual([]);
    expect(turn.approvals).toEqual([]);
  },
};
