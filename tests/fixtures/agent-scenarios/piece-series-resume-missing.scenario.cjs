'use strict';

/** An unknown saved run must never restart generation or create draft posts. */
module.exports = {
  id: 'piece-series-resume-missing',
  title: 'Неизвестную серию нельзя восстановить или создать заново',
  covers: ['piece.series.resume'],
  incompleteTurns: [0],
  turns: [{
    say: 'Сохрани ранее подготовленную серию.',
    model: [
      [['tool', 'piece_series_resume', { pieceId: 'p1', runId: 'unknown-series-run' }]],
      [['text', 'Сохранённая серия недоступна.']],
    ],
  }],
  check: (run) => {
    const [turn] = run.turns;
    expect(turn.outputs).toEqual([{ toolName: 'piece_series_resume',
      output: expect.objectContaining({ ok: false, code: 'ADAPTATION_SERIES_UNAVAILABLE' }) }]);
    expect(turn.execution).toMatchObject({ state: 'settled', outcome: 'failed' });
    expect(run.writes).toEqual([]);
    expect(run.requests.filter(([name]) => name === 'piece.adapt')).toEqual([]);
  },
};
