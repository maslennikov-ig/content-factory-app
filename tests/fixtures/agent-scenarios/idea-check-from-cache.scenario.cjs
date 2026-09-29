'use strict';

const { ideaRows } = require('./idea-rows.cjs');

/**
 * Review W4-23 F4: a topic check the research cache answered searched
 * nothing and opened no operation. It says `spent: false` and gives the
 * message's paid step back, so the piece asked for in the same message is
 * written.
 */
module.exports = {
  id: 'idea-check-from-cache',
  title: 'Проверка темы из кэша поиска — не потрачено, заготовка в той же реплике',
  covers: ['ideas.check', 'piece.create'],
  world: ideaRows({ topicCached: true }),
  turns: [
    {
      say: 'Проверь тему про налоги и напиши пост из мысли: налоговый вычет не так страшен',
      model: [
        [['tool', 'ideas_check', { subscriptionId: 'sub-2' }]],
        [['tool', 'piece_create', { text: 'Налоговый вычет не так страшен' }]],
        [['text', 'Нового по теме нет; заготовка готова.']],
      ],
    },
  ],
  check: (run) => {
    const [checked, written] = run.turns[0].outputs.map((one) => one.output);
    expect(checked).toMatchObject({
      ok: true,
      summary: { untrustedData: { value: { subscriptionId: 'sub-2', checked: true, spent: false } } },
    });
    expect(written).toMatchObject({ ok: true, card: { kind: 'piece' } });
    expect(run.requests.filter(([name]) => name.startsWith('idea.research'))).toEqual([
      ['idea.research.cached', 'Налоги малого бизнеса'],
    ]);
    expect(run.admissions.filter(([operation]) => operation === 'web_research')).toEqual([]);
  },
};
