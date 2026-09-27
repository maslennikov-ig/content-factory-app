'use strict';

/**
 * Correctness review W1 F8: the real Mastra steps of one turn stay inside its
 * one admission. Three model steps — a read, a paid capability, the answer —
 * write exactly one `agent` row, carrying the tokens of all three steps, and
 * the paid capability's own `intake` row beside it. A step that resolved its
 * model outside the turn's `AsyncLocalStorage` would open a second `agent`
 * row and its tokens would miss the first.
 */
module.exports = {
  id: 'turn-single-admission',
  title: 'Один ход из трёх шагов — одна операция agent с токенами всех шагов',
  covers: ['workspace.snapshot', 'piece.create'],
  turns: [
    {
      say: 'Посмотри, что у нас есть, и напиши заготовку про созвоны',
      model: [
        [['tool', 'workspace_snapshot', {}]],
        [['tool', 'piece_create', { text: 'Мысль про созвоны', inputKind: 'thought' }]],
        [['text', 'Готово: заготовка про созвоны.']],
      ],
    },
  ],
  check: (run) => {
    const [turn] = run.turns;
    expect(turn.modelCalls).toBe(3);
    expect(run.modelCalls).toBe(3);
    expect(turn.toolCalls.map((call) => call.toolName)).toEqual([
      'workspace_snapshot',
      'piece_create',
    ]);
    const agentRows = run.ledger.filter((row) => row.operation === 'agent');
    expect(agentRows).toHaveLength(1);
    // The scripted model reports one prompt and one completion token a step.
    expect(agentRows[0]).toEqual({
      operation: 'agent',
      status: 'succeeded',
      promptTokens: 3,
      completionTokens: 3,
    });
    expect(run.ledger.map((row) => row.operation)).toEqual(['agent', 'intake']);
    // Progress reaches the browser transient; the thread keeps only the card.
    const progress = turn.data.filter((part) => part.type === 'data-progress');
    expect(progress.length).toBeGreaterThan(0);
    expect(progress.every((part) => part.transient)).toBe(true);
    expect(run.storedPartTypes).not.toContain('data-progress');
  },
};
