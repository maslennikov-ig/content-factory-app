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
const LENGTH_OPTIONS = [
  { id: 'brief', label: 'Кратко по сути', description: 'Главная мысль и один полезный вывод.', lengthRange: { idealMin: 300, idealMax: 600, hardMax: 800 }, recommended: false },
  { id: 'context', label: 'С контекстом', description: 'Главная мысль, объяснение и практический вывод.', lengthRange: { idealMin: 900, idealMax: 1300, hardMax: 1600 }, recommended: true },
];

module.exports = {
  id: 'piece-adapt-mode-switch',
  title: 'Канал ушёл на автопилот, пока ждали ответа: пост остаётся бронью',
  covers: ['piece.adapt'],
  world: { adaptQuestions: [{ key: 'hook', question: 'С чего начать?', suggested: 'С цифры' }] },
  turns: [
    { say: 'Адаптируй cnt-1 в Telegram', model: [[['tool', 'piece_adapt', { pieceId: 'p1', channelId: 'c1', lengthOptions: LENGTH_OPTIONS }]]] },
    { resume: { action: 'keep-channel' } },
    {
      before: (rows) => {
        rows.channels.find((one) => one.id === 'c1').planMode = 'autopilot';
      },
      resume: { decideForPerson: true },
      model: [[['text', 'Пост написан и стоит бронью: чтобы вышел, подтвердите дату.']]],
    },
  ],
  check: (run) => {
    const [size, ask, answered] = run.turns;
    expect(size.suspended[0].payload.kind).toBe('writing-settings');
    expect(size.admissions.map(([operation]) => operation)).toEqual(['agent']);
    // No consent card on a «Бронь» channel: the interview came first.
    expect(ask.suspended.map((one) => one.payload.kind)).toEqual(['domain-questions']);
    expect(answered.outputs[0].output.summary).toMatchObject({
      adaptationId: 'a1',
      state: 'draft',
      plan: 'reserved',
    });
    const [row] = run.world.adaptations;
    expect(row).toMatchObject({ id: 'a1', state: 'draft', plan: { status: 'reserved', note: 'consent-needed' } });
  },
};
