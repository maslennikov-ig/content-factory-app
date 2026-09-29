'use strict';

const { ideaRows } = require('./idea-rows.cjs');

/**
 * The service's manual-check limit reaches the chat as its own refusal
 * (kcxz.23): a topic checked half a minute ago is not searched again, in the
 * person's language, and nothing is spent or written by the check. The
 * refusal gives the message's paid step back (review W4-23 F2): «проверь и
 * напиши» still writes the piece in the same turn.
 */
const rows = ideaRows();
rows.subscriptions[1].lastCheckedAt = '2026-09-27T09:59:30.000Z';

module.exports = {
  id: 'idea-check-too-soon',
  title: 'Проверка меньше чем через минуту — отказ сервиса словами, без трат',
  covers: ['ideas.check', 'piece.create'],
  world: rows,
  turns: [
    {
      say: 'Проверь тему про налоги ещё раз и напиши пост из мысли: вычет не так страшен',
      model: [
        [['tool', 'ideas_check', { subscriptionId: 'sub-2' }]],
        [['tool', 'piece_create', { text: 'Вычет не так страшен' }]],
        [['text', 'Тему только что проверяли — подождите минуту. Заготовка готова.']],
      ],
    },
  ],
  check: (run) => {
    const [output, written] = run.turns[0].outputs.map((one) => one.output);
    expect(output).toMatchObject({ ok: false, code: 'CHECK_TOO_SOON' });
    // The service's own sentence, in Russian.
    expect(output.reason).toMatch(/[а-я]/i);
    expect(run.requests.filter(([name]) => name === 'idea.research')).toEqual([]);
    // The paid step came back: the piece is written.
    expect(written).toMatchObject({ ok: true, card: { kind: 'piece' } });
    expect(run.writes.filter(([name]) => name.startsWith('idea.'))).toEqual([]);
  },
};
