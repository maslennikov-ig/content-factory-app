'use strict';

/**
 * «Решите за меня» for every open question: the answer tool with no answers,
 * the piece page's body with nothing in it — every question delegated.
 */
module.exports = {
  id: 'piece-answer-decide-all',
  title: 'Вопросы заготовки — «Решите за меня» на все',
  covers: ['piece.answer'],
  turns: [
    {
      say: 'На вопросы cnt-1 решите за меня',
      model: [
        [['tool', 'piece_answer', { pieceId: 'p1' }]],
        [['text', 'Решили за вас, суть обновлена.']],
      ],
    },
  ],
  check: (run) => {
    const [turn] = run.turns;
    expect(run.requests.filter(([door]) => door === 'piece.answer')).toEqual([
      ['piece.answer', 'p1', {}],
    ]);
    expect(run.world.pieces.find((piece) => piece.id === 'p1').answers).toEqual([
      { field: 'audience', text: '', origin: 'model' },
      { field: 'facts', key: 'ask-1', text: '', origin: 'model' },
    ]);
    // wffi: the question about the author's own case was not invented, and the
    // agent is told so — it must not say it was decided.
    expect(turn.outputs[0].output.summary).toEqual({
      pieceId: 'p1',
      code: 'cnt-1',
      questions: 0,
      leftToAuthor: ['Какой случай был у вас?'],
      note: expect.stringContaining('Do not say they were decided'),
    });
    // release check 27.09 P3-b: the agent must quote the question and say the
    // person can add their own experience in their own words.
    expect(turn.outputs[0].output.summary.note).toEqual(
      expect.stringMatching(/quotes each question verbatim.*own experience.*in their own words/)
    );
    expect(turn.admissions).toEqual([
      ['agent', 'agent', 'user-1', 'succeeded'],
      ['intake', 'extract', 'user-1', 'succeeded'],
    ]);
  },
};
