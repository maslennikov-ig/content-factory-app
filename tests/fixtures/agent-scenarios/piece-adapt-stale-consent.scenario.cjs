'use strict';

/**
 * Correctness review W2 F3: an answer lands only on the card it answers.
 *
 * Two tabs show the autopilot consent card. Tab A says «Да»; the same call
 * now waits on the adaptation interview. Tab B, still on the consent card,
 * says «Нет»: the door refuses it (409) — it was written for another card —
 * so nothing is spent and nothing is written in its name. The interview is
 * then answered from the card that waits, and the post takes the queue the
 * person consented to on this call.
 */
const AUTOPILOT = [
  { id: 'c1', name: 'Канал про работу', providerIdentifier: 'telegram', disabled: false, refreshNeeded: false, planMode: 'autopilot', posts: 0 },
];

module.exports = {
  id: 'piece-adapt-stale-consent',
  title: 'Устаревшая карточка: «Нет» со старой вкладки не отвечает на интервью',
  covers: ['piece.adapt'],
  world: {
    channels: AUTOPILOT,
    adaptQuestions: [{ key: 'hook', question: 'С чего начать?', suggested: 'С цифры' }],
  },
  // The third request is the stale tab's, refused at the door.
  refusedTurns: [2],
  turns: [
    { say: 'Адаптируй cnt-1 в канал', model: [[['tool', 'piece_adapt', { pieceId: 'p1', channelId: 'c1' }]]] },
    { resume: { consentGiven: true } },
    { resume: { consentGiven: false }, resumeCardOfTurn: 1 },
    { resume: { decideForPerson: true }, model: [[['text', 'Пост ждёт в очереди канала.']]] },
  ],
  check: (run) => {
    const [ask, yes, stale, decided] = run.turns;
    expect(ask.suspended.map((one) => one.payload.kind)).toEqual(['consent']);
    expect(yes.suspended.map((one) => one.payload.kind)).toEqual(['interview']);
    // The stale «Нет» names the consent card: not the card that waits.
    expect(stale.body.cardId).toBe(ask.suspended[0].payload.cardId);
    expect(stale.refused).toEqual({ status: 409, code: 'AGENT_RUN_NOT_PENDING' });
    expect(stale.admissions).toEqual([]);
    // The interview was answered from its own card, and the consent given on
    // this call lets the post take the queue.
    expect(decided.body.cardId).toBe(yes.suspended[0].payload.cardId);
    expect(decided.outputs[0].output.summary).toMatchObject({ adaptationId: 'a1', state: 'queued' });
    expect(run.writes).toEqual([['adaptation.created', 'a1', 'c1']]);
  },
};
