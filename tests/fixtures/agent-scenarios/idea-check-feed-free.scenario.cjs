'use strict';

const { ideaRows } = require('./idea-rows.cjs');

/**
 * «Проверить сейчас» on a feed spends nothing (kcxz.23): no search operation
 * is opened and the message's paid step is given back, so a topic check the
 * person asked for in the same message still runs.
 */
module.exports = {
  id: 'idea-check-feed-free',
  title: 'Проверка ленты бесплатна — платный шаг сообщения остаётся для темы',
  covers: ['ideas.check'],
  world: ideaRows({
    feedItems: {
      'https://vc.ru/rss': [
        { externalId: 'https://vc.ru/a/1', title: 'Созвоны без повестки: что показало исследование', excerpt: null, sourceUrl: 'https://vc.ru/a/1', publishedAt: '2026-09-26T08:00:00.000Z' },
        { externalId: 'https://vc.ru/a/3', title: 'Четырёхдневка: первые итоги', excerpt: 'Компании делятся цифрами.', sourceUrl: 'https://vc.ru/a/3', publishedAt: '2026-09-27T07:00:00.000Z' },
      ],
    },
    topicFound: [],
  }),
  turns: [
    {
      say: 'Проверь сейчас ленту vc.ru и тему про налоги',
      model: [
        [['tool', 'ideas_check', { subscriptionId: 'sub-1' }]],
        [['tool', 'ideas_check', { subscriptionId: 'sub-2' }]],
        [['text', 'В ленте один новый повод, по теме нового нет.']],
      ],
    },
  ],
  check: (run) => {
    const [turn] = run.turns;
    const [feed, topic] = turn.outputs.map((one) => one.output);
    // The item seen before is remembered, not brought back.
    expect(feed.summary.untrustedData.value).toMatchObject({ kind: 'feed', checked: true, newLeads: 1, spent: false });
    // The feed gave its slot back: the topic check was not refused by the cap.
    expect(topic.summary.untrustedData.value).toMatchObject({ kind: 'topic', checked: true, newLeads: 0, spent: true });
    expect(run.admissions).toEqual([
      ['agent', 'agent', 'user-1', 'succeeded'],
      ['web_research', expect.anything(), 'user-1', 'succeeded'],
    ]);
    expect(run.writes).toEqual([
      ['idea.leads', 'sub-1', 1],
      ['idea.checked', 'sub-1', 'ok'],
      ['idea.checked', 'sub-2', 'ok'],
    ]);
  },
};
