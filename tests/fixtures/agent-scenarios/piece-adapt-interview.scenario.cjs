'use strict';

const { screenPieces } = require('../../helpers/agent-scenarios.cjs');

/**
 * `kcxz.14` acceptance: the first adaptation for a channel asks; the person
 * answers one question, gives another to us, and the same call sends the
 * page's second request — `buildAdaptPayload` with the answers and the
 * model's question riding with its `ask-N` key.
 */
const QUESTIONS = [
  { key: 'hook', question: 'С чего начать пост?', suggested: 'С цифры про три часа', options: ['С цифры', 'С вопроса'] },
  { key: 'ask-1', question: 'Какой случай был у вас?', suggested: null, why: 'Пост читают руководители' },
];

module.exports = {
  id: 'piece-adapt-interview',
  title: 'Адаптация с вопросами → ответ и «Решите за меня» → вариант 1',
  covers: ['piece.adapt'],
  world: { adaptQuestions: QUESTIONS },
  turns: [
    {
      say: 'Адаптируй cnt-1 в Telegram',
      model: [[['tool', 'piece_adapt', { pieceId: 'p1', channelId: 'c1' }]]],
    },
    {
      resume: {
        answers: [{ key: 'ask-1', text: 'Созвон на 40 минут без итога', origin: 'person' }],
        decideKeys: ['hook'],
      },
      model: [[['text', 'Пост для «Канал про работу» готов.']]],
    },
  ],
  check: (run) => {
    const [ask, answer] = run.turns;
    const screen = screenPieces();
    expect(ask.suspended).toEqual([
      {
        runId: expect.any(String),
        toolName: 'piece_adapt',
        payload: {
          kind: 'interview',
          question: expect.stringContaining('Пара вопросов'),
          questions: QUESTIONS,
          canDecideForPerson: true,
          channel: { id: 'c1', name: 'Канал про работу', provider: 'telegram' },
          cardId: expect.stringMatching(/^[0-9a-f]{32}$/),
        },
      },
    ]);
    expect(ask.outputs).toEqual([]);
    // Asking was paid for, as the door's interview is.
    expect(ask.admissions).toEqual([
      ['agent', 'agent', 'user-1', 'succeeded'],
      ['intake', 'extract', 'user-1', 'succeeded'],
    ]);
    // Both bodies are the page's.
    expect(run.requests.filter(([door]) => door === 'piece.adapt')).toEqual([
      ['piece.adapt', 'p1', screen.buildAdaptPayload({ integrationId: 'c1', kind: 'post' })],
      [
        'piece.adapt',
        'p1',
        screen.buildAdaptPayload({
          integrationId: 'c1',
          kind: 'post',
          answers: [
            { key: 'ask-1', text: 'Созвон на 40 минут без итога', origin: 'person', question: 'Какой случай был у вас?' },
          ],
          decideKeys: ['hook'],
        }),
      ],
    ]);
    expect(answer.admissions.map(([operation]) => operation)).toEqual(['agent', 'text_generation']);
    expect(answer.data.at(-1)).toEqual({
      type: 'data-adaptation',
      data: {
        kind: 'adaptation',
        id: 'a1',
        pieceId: 'p1',
        channel: { id: 'c1', name: 'Канал про работу', provider: 'telegram' },
        variant: 1,
      },
      transient: false,
    });
    expect(answer.outputs[0].output.summary).toEqual({
      pieceId: 'p1',
      adaptationId: 'a1',
      channelId: 'c1',
      variant: 1,
      state: 'draft',
      asked: 2,
    });
    expect(JSON.stringify(answer.outputs)).not.toContain('Текст поста');
    expect(run.storedPartTypes).toContain('data-adaptation');
  },
};
