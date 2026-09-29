'use strict';

const { ideaRows } = require('./idea-rows.cjs');

/**
 * Review W4-23 F11: «Проверить сейчас» on a subscription whose periodic check
 * is not running restarts it, as the door always did — now held for one
 * interval, so its first iteration does not search a second time beside the
 * click's own search. One search, one operation.
 */
module.exports = {
  id: 'idea-check-restarts-periodic',
  title: 'Проверка перезапускает регулярную — один поиск, а не два',
  covers: ['ideas.check'],
  world: ideaRows({ periodicStopped: ['sub-2'] }),
  turns: [
    {
      say: 'Проверь тему про налоги',
      model: [[['tool', 'ideas_check', { subscriptionId: 'sub-2' }]], [['text', 'Проверили, нового нет.']]],
    },
  ],
  check: (run) => {
    const [checked] = run.turns[0].outputs.map((one) => one.output);
    expect(checked).toMatchObject({ ok: true, summary: { untrustedData: { value: { checked: true, spent: true } } } });
    expect(run.requests.filter(([name]) => name.startsWith('idea.'))).toEqual([
      ['idea.periodic', 'sub-2', { startDelay: 1440 * 60_000 }],
      ['idea.research', 'Налоги малого бизнеса', { task: 'discovery', windowDays: 30 }],
    ]);
    expect(run.admissions.filter(([operation]) => operation === 'web_research')).toHaveLength(1);
  },
};
