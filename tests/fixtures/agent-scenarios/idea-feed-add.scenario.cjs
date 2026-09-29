'use strict';

const { ideaRows } = require('./idea-rows.cjs');

/**
 * A feed is subscribed without a card (kcxz.23): reading an address costs
 * nothing. The product names it after the site and checks it daily; the
 * answer tells the model the first check starts by itself.
 */
module.exports = {
  id: 'idea-feed-add',
  title: 'Подписка на ленту — без карточки, имя по сайту',
  covers: ['ideas.feed.add'],
  world: ideaRows(),
  turns: [
    {
      say: 'Подпишись на ленту https://www.habr.com/ru/rss/all/',
      model: [
        [['tool', 'ideas_feed_add', { url: 'https://www.habr.com/ru/rss/all/' }]],
        [['text', 'Подписались на habr.com.']],
      ],
    },
  ],
  check: (run) => {
    const [turn] = run.turns;
    expect(turn.approvals).toEqual([]);
    expect(turn.outputs[0].output).toMatchObject({
      ok: true,
      summary: { subscriptionId: 'sub-4', kind: 'feed', name: 'habr.com', checking: true },
      card: { kind: 'ideas', id: 'leads' },
    });
    expect(turn.outputs[0].output.summary.next).toMatch(/Do not run ideas.check right away/);
    // The periodic check starts with the subscription and reads the feed at
    // once (review W4-23 F5) — free, so nothing is admitted for it.
    expect(run.writes).toEqual([
      ['idea.subscribed', 'sub-4'],
      ['idea.checked', 'sub-4', 'ok'],
    ]);
    expect(run.requests.filter(([name]) => name.startsWith('idea.'))).toEqual([
      ['idea.periodic', 'sub-4'],
      ['idea.feed', expect.stringMatching(/habr\.com/), 'RSS'],
      ['idea.periodic.first', 'sub-4', 'checked'],
    ]);
    // Stored the way the door stores it: the canonical address, daily, by the person.
    expect(run.world.subscriptions.at(-1)).toMatchObject({
      organizationId: 'org-1',
      kind: 'RSS',
      displayName: 'habr.com',
      checkIntervalMinutes: 1440,
      createdByUserId: 'user-1',
    });
    expect(run.world.subscriptions.at(-1).canonicalUrl).toMatch(/^https:\/\/www\.habr\.com\/ru\/rss\/all/);
    // Nothing paid: only the turn's own operation.
    expect(run.admissions).toEqual([['agent', 'agent', 'user-1', 'succeeded']]);
  },
};
