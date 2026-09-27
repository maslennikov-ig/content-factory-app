'use strict';

const { screenPieces } = require('../../helpers/agent-scenarios.cjs');

/**
 * Writing into an autopilot channel (spec §1.4, premortem A1): the post would
 * go out by itself, so the person consents on a card before anything is
 * spent — no «Решите за меня». «Нет» ends the call with nothing written;
 * «Да» adapts, the interview may still follow, and the post waits in the
 * queue.
 */
const AUTOPILOT = [
  { id: 'c1', name: 'Канал про работу', providerIdentifier: 'telegram', disabled: false, refreshNeeded: false, planMode: 'autopilot', posts: 0 },
];

module.exports = {
  id: 'piece-adapt-autopilot',
  title: 'Автопилот: согласие до траты — «нет» и «да»',
  covers: ['piece.adapt'],
  world: {
    channels: AUTOPILOT,
    adaptQuestions: [{ key: 'hook', question: 'С чего начать?', suggested: 'С цифры' }],
  },
  turns: [
    { say: 'Адаптируй cnt-1 в канал', model: [[['tool', 'piece_adapt', { pieceId: 'p1', channelId: 'c1' }]]] },
    { resume: { consentGiven: false }, model: [[['text', 'Не пишем.']]] },
    { say: 'Ладно, пиши', model: [[['tool', 'piece_adapt', { pieceId: 'p1', channelId: 'c1' }]]] },
    { resume: { consentGiven: true } },
    { resume: { decideForPerson: true }, model: [[['text', 'Пост ждёт в очереди канала.']]] },
  ],
  check: (run) => {
    const [ask, no, askAgain, yes, decided] = run.turns;
    const consent = {
      runId: expect.any(String),
      toolName: 'piece_adapt',
      payload: {
        kind: 'consent',
        subject: 'autopilot',
        question: 'Канал «Канал про работу» на автопилоте: адаптация сразу встанет в очередь и выйдет сама. Писать?',
        answerKey: 'consentGiven',
        canDecideForPerson: false,
        channel: { id: 'c1', name: 'Канал про работу', provider: 'telegram' },
        cardId: expect.stringMatching(/^[0-9a-f]{32}$/),
      },
    };
    expect(ask.suspended).toEqual([consent]);
    // Asked before anything was spent or written.
    expect(ask.admissions).toEqual([['agent', 'agent', 'user-1', 'succeeded']]);
    // «Нет»: nothing spent, nothing written, no card.
    expect(no.outputs[0].output).toMatchObject({ ok: true, summary: { pieceId: 'p1', channelId: 'c1', declined: true } });
    expect(no.admissions).toEqual([['agent', 'agent', 'user-1', 'succeeded']]);
    expect(no.data.filter((part) => part.type === 'data-adaptation')).toEqual([]);
    // «Да»: the adapt door runs; the interview may still follow.
    expect(askAgain.suspended).toEqual([consent]);
    expect(yes.suspended.map((one) => one.payload.kind)).toEqual(['interview']);
    expect(yes.admissions.map(([operation]) => operation)).toEqual(['agent', 'intake']);
    const screen = screenPieces();
    expect(run.requests.filter(([door]) => door === 'piece.adapt')).toEqual([
      ['piece.adapt', 'p1', screen.buildAdaptPayload({ integrationId: 'c1', kind: 'post' })],
      ['piece.adapt', 'p1', screen.buildAdaptPayload({ integrationId: 'c1', kind: 'post', skipInterview: true })],
    ]);
    expect(decided.outputs[0].output.summary).toMatchObject({ adaptationId: 'a1', state: 'queued' });
    expect(run.writes).toEqual([['adaptation.created', 'a1', 'c1']]);
  },
};
