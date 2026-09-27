'use strict';

/**
 * «Проверить факты»: the page's web check, spend confirmed by the agent; the
 * changes card offers the editable changes, all preselected as on the page;
 * «Решите за меня» accepts those through the core's accept door. Accepting
 * spends nothing, as the door's does not.
 */
const CHANGES = [
  { id: 'c1', basket: 'show', excerpt: '23 часа', replacement: '21 час', why: 'Источник называет 21 час', sourceUrls: ['https://www.hbr.org/x'] },
  { id: 'c2', basket: 'ask', excerpt: 'все', replacement: 'все', why: 'Уточните, кто все' },
  { id: 'c3', basket: 'silent', excerpt: 'созвон', replacement: 'созвон', why: 'Нечего менять' },
  { id: 'c4', basket: 'silent', excerpt: 'повеcтки', replacement: 'повестки', why: 'Опечатка' },
];

module.exports = {
  id: 'piece-check-facts',
  title: '«Проверить факты» → карточка правок → «Решите за меня»',
  covers: ['piece.check_facts'],
  world: { reviewChanges: CHANGES },
  turns: [
    { say: 'Проверь факты в cnt-1', model: [[['tool', 'piece_check_facts', { pieceId: 'p1' }]]] },
    { resume: { decideForPerson: true }, model: [[['text', 'Приняли две правки.']]] },
  ],
  check: (run) => {
    const [ask, answer] = run.turns;
    expect(run.requests.filter(([door]) => door === 'piece.review')).toEqual([
      ['piece.review', 'p1', null, { mode: 'web', confirmWebSpend: true }],
    ]);
    const card = ask.suspended[0].payload;
    expect(card).toMatchObject({
      kind: 'selection',
      answerKey: 'changeIds',
      canDecideForPerson: true,
      verdict: 'review',
      cardId: expect.stringMatching(/^[0-9a-f]{32}$/),
    });
    // The signed proposal stays on the server (review W2 F9): the accept
    // below still reaches the door with it, read from the run's snapshot.
    expect(card).not.toHaveProperty('token');
    expect(card.options).toEqual([
      { id: 'c1', label: '«23 часа» → «21 час» — Источник называет 21 час', selected: true, status: 'show', source: 'hbr.org' },
      { id: 'c4', label: '«повеcтки» → «повестки» — Опечатка', selected: true, status: 'silent', source: null },
    ]);
    expect(ask.admissions.map(([operation]) => operation)).toEqual([
      'agent',
      'content_classification',
      'web_research',
      'text_generation',
    ]);
    // Neither the live stream nor the stored transcript and pending list carry
    // the signed token (review W2 F9); the accept reads it from the snapshot.
    expect(ask.sse).not.toContain('token-1');
    expect(JSON.stringify(answer.before)).not.toContain('token-1');
    expect(run.requests.filter(([door]) => door === 'piece.review.accept')).toEqual([
      ['piece.review.accept', 'p1', null, { token: 'token-1', selectedIds: ['c1', 'c4'] }],
    ]);
    expect(answer.admissions).toEqual([['agent', 'agent', 'user-1', 'succeeded']]);
    expect(answer.outputs[0].output).toMatchObject({
      ok: true,
      summary: { pieceId: 'p1', outcome: 'applied', offered: 2, applied: 2, declined: 0, waitingOnCard: 0 },
    });
    expect(JSON.stringify(answer.outputs)).not.toContain('token-1');
    expect(JSON.stringify(answer.outputs)).not.toContain('21 час');
  },
};
