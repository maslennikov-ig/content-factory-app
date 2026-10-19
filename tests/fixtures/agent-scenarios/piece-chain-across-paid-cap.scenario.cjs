'use strict';

/** The requested answer, adaptation and reserve execute in one native task. */
module.exports = {
  id: 'piece-chain-across-paid-cap',
  title: 'Ответ, адаптация и бронь завершаются без обязательной новой реплики',
  covers: ['piece.answer', 'piece.adapt', 'plan.place'],
  turns: [{
    say: 'Решите за меня. Потом сделайте адаптацию для «Канал про работу» и поставьте её в план бронью.',
    model: [
      [['tool', 'piece_answer', { pieceId: 'p1' }]],
      [['tool', 'piece_adapt', { pieceId: 'p1', channelId: 'c1' }]],
      [['tool', 'plan_place', { pieceId: 'p1', adaptationId: 'a1', at: '2026-10-01T10:00:00+03:00' }]],
      [['text', 'Готово: адаптация для «Канал про работу» стоит в плане бронью.']],
    ],
  }],
  check: (run) => {
    const [turn] = run.turns;
    expect(run.firstCall.system).toContain('without asking «Продолжить?»');
    expect(turn.toolCalls.map(({ toolName }) => toolName)).toEqual(['piece_answer', 'piece_adapt', 'plan_place']);
    expect(turn.outputs.map(({ output }) => output.ok)).toEqual([true, true, true]);
    expect(turn.outputs[2].output.summary).toMatchObject({ state: 'reserve' });
    expect(turn.admissions.filter(([operation]) => operation !== 'agent')).toHaveLength(3);
  },
};
