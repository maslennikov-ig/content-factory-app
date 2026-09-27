'use strict';

/**
 * Correctness review W2 F2: no queue without a card, whatever happens while a
 * card waits.
 *
 * The channel is on «Бронь» when the person asks, so no consent is asked and
 * the interview card is shown. While it waits, somebody switches the channel
 * to autopilot. The answer writes the post — and the write, which re-reads the
 * mode under the channel lock, keeps it a reserve with the reason, because
 * nobody consented to the queue on this call. The model hears it and offers
 * the dated schedule, which the person approves.
 */
module.exports = {
  id: 'piece-adapt-mode-switch',
  title: 'Канал ушёл на автопилот, пока ждали ответа: пост остаётся бронью',
  covers: ['piece.adapt'],
  world: { adaptQuestions: [{ key: 'hook', question: 'С чего начать?', suggested: 'С цифры' }] },
  turns: [
    { say: 'Адаптируй cnt-1 в Telegram', model: [[['tool', 'piece_adapt', { pieceId: 'p1', channelId: 'c1' }]]] },
    {
      before: (rows) => {
        rows.channels.find((one) => one.id === 'c1').planMode = 'autopilot';
      },
      resume: { decideForPerson: true },
      model: [[['text', 'Пост написан и стоит бронью: чтобы вышел, подтвердите дату.']]],
    },
  ],
  check: (run) => {
    const [ask, answered] = run.turns;
    // No consent card on a «Бронь» channel: the interview came first.
    expect(ask.suspended.map((one) => one.payload.kind)).toEqual(['interview']);
    expect(answered.outputs[0].output.summary).toMatchObject({
      adaptationId: 'a1',
      state: 'draft',
      plan: 'reserved',
    });
    const [row] = run.world.adaptations;
    expect(row).toMatchObject({ id: 'a1', state: 'draft', plan: { status: 'reserved', note: 'consent-needed' } });
  },
};
