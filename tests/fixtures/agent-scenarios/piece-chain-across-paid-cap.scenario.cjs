'use strict';

/**
 * W3 live walk 28.09.2026, P2-D: «Решите за меня. Потом адаптацию для канала
 * и бронью» is one request. The walk's agent stopped after the answer and
 * asked «Продолжить в следующем сообщении?». Now it goes on to the adaptation
 * in the same turn; the message's one paid step is spent on the answer, so
 * the paid limit answers the adaptation (`PAID_CAP_REACHED`) with what to say
 * — what is done, what is left, «Напишите «дальше» — продолжим.», not a
 * question — and «дальше» carries on to the adaptation, which lands in the
 * plan as a reserve on a «Бронь» channel. Paid caps are unchanged.
 */
module.exports = {
  id: 'piece-chain-across-paid-cap',
  title: 'Цепочка «ответь → адаптируй → бронь» — без «Продолжить?», через предел платных шагов строкой «дальше»',
  covers: ['piece.answer', 'piece.adapt', 'plan.place'],
  turns: [
    {
      say: 'Решите за меня. Потом сделайте адаптацию для «Канал про работу» и поставьте её в план бронью.',
      model: [
        [['tool', 'piece_answer', { pieceId: 'p1' }]],
        [['tool', 'piece_adapt', { pieceId: 'p1', channelId: 'c1' }]],
        [['text', 'Ответили за вас. Дальше — адаптация для «Канал про работу» и бронь. Напишите «дальше» — продолжим.']],
      ],
    },
    {
      say: 'дальше',
      model: [
        [['tool', 'piece_adapt', { pieceId: 'p1', channelId: 'c1' }]],
        // The reserve is free: the same turn places it.
        [['tool', 'plan_place', { pieceId: 'p1', adaptationId: 'a1', at: '2026-10-01T10:00:00+03:00' }]],
        [['text', 'Готово: адаптация для «Канал про работу» стоит в плане бронью.']],
      ],
    },
  ],
  check: (run) => {
    const [chain, next] = run.turns;
    // The chain is the instruction's own rule, read on every turn.
    expect(run.firstCall.system).toContain('without asking «Продолжить?»');
    expect(chain.toolCalls.map(({ toolName }) => toolName)).toEqual(['piece_answer', 'piece_adapt']);
    const [answered, adapt] = chain.outputs.map(({ output }) => output);
    expect(answered.ok).toBe(true);
    expect(adapt).toMatchObject({ ok: false, code: 'PAID_CAP_REACHED' });
    // What to say is a statement with «дальше», never «ask whether to continue».
    expect(adapt.reason).toContain('Напишите «дальше» — продолжим.');
    expect(adapt.reason).not.toMatch(/ask the person whether/);
    // W3 recheck R-6: the line quotes what was left to the author.
    expect(adapt.reason).toContain('quote any questions left to the person');
    // Nothing of the adaptation ran in the first message.
    expect(chain.admissions.filter(([operation]) => operation !== 'agent')).toHaveLength(1);
    // «дальше»: the adaptation, then the reserve, in one turn, without asking.
    expect(next.toolCalls.map(({ toolName }) => toolName)).toEqual(['piece_adapt', 'plan_place']);
    expect(next.outputs.map(({ output }) => output.ok)).toEqual([true, true]);
    expect(next.outputs[1].output.summary).toMatchObject({ state: 'reserve' });
  },
};
