'use strict';

/**
 * «Дополнить ресерчем»: the agent confirms the web spend itself, the person
 * keeps facts on the card, and the same call posts the accept door's body.
 * The model never sees a fact, a key or the snapshot.
 */
const FACTS = [
  { factKey: 'r1', statement: 'Руководитель проводит на созвонах 23 часа в неделю', status: 'confirmed', selected: true, sourceUrl: 'https://hbr.org/x' },
  { factKey: 'r2', statement: 'Половина созвонов без повестки', status: 'unverified', selected: false, sourceUrl: null },
  // Without a key the accept door refuses the row: it is not offered.
  { statement: 'Строка без ключа', status: 'unverified', selected: false },
];

module.exports = {
  id: 'piece-research-accept',
  title: 'Ресерч сути → выбор опор человеком → принятие',
  covers: ['piece.research'],
  world: { coreResearchFacts: FACTS },
  turns: [
    {
      say: 'Найди глубоко факты к cnt-1, про время руководителей',
      model: [[['tool', 'piece_research', { pieceId: 'p1', level: 'deep', direction: 'время руководителей' }]]],
    },
    { resume: { factKeys: ['r2', 'nope'] }, model: [[['text', 'Суть дополнена выбранной опорой.']]] },
  ],
  check: (run) => {
    const [ask, answer] = run.turns;
    // The research door's body, as the page posts it.
    expect(run.requests.filter(([door]) => door === 'piece.research')).toEqual([
      ['piece.research', 'p1', 'user-1', { confirmWebSpend: true, level: 'deep', direction: 'время руководителей' }],
    ]);
    expect(ask.suspended).toEqual([
      {
        runId: expect.any(String),
        toolName: 'piece_research',
        payload: {
          kind: 'selection',
          question: expect.stringContaining('добавить в суть'),
          answerKey: 'factKeys',
          options: [
            { id: 'r1', label: FACTS[0].statement, selected: true, status: 'confirmed', source: 'hbr.org' },
            { id: 'r2', label: FACTS[1].statement, selected: false, status: 'unverified', source: null },
          ],
          canDecideForPerson: true,
          // The snapshot key stays on the server (review W2 F9).
          level: 'deep',
          cardId: expect.stringMatching(/^[0-9a-f]{32}$/),
        },
      },
    ]);
    expect(ask.outputs).toEqual([]);
    expect(ask.admissions).toEqual([
      ['agent', 'agent', 'user-1', 'succeeded'],
      ['web_research', expect.any(String), 'user-1', 'succeeded'],
      ['intake', 'extract', 'user-1', 'succeeded'],
    ]);
    // The snapshot key never left the server (review W2 F9): not on the live
    // stream, not in the stored transcript or the pending list a reload reads
    // while the card waits — and yet the accept below carries it, read from
    // the run's own snapshot.
    expect(ask.sse).not.toContain('core-snap-1');
    expect(answer.before).not.toBeNull();
    expect(JSON.stringify(answer.before)).not.toContain('core-snap-1');
    // Only what the card offered and the person named reaches the door.
    expect(run.requests.filter(([door]) => door === 'piece.research.accept')).toEqual([
      ['piece.research.accept', 'p1', 'user-1', { snapshotKey: 'core-snap-1', selectedKeys: ['r2'] }],
    ]);
    // Accepting writes the core: its own operation, as the accept door's.
    expect(answer.admissions).toEqual([
      ['agent', 'agent', 'user-1', 'succeeded'],
      ['intake', 'extract', 'user-1', 'succeeded'],
    ]);
    expect(answer.outputs[0].output).toMatchObject({
      ok: true,
      summary: { pieceId: 'p1', level: 'deep', offered: 2, kept: 1, applied: true },
      card: { kind: 'piece', id: 'p1' },
    });
    expect(JSON.stringify(answer.outputs)).not.toContain('Половина');
    expect(run.writes).toEqual([['piece.research.accepted', 'p1', ['r2']]]);
  },
};
