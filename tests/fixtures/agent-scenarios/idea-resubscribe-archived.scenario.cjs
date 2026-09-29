'use strict';

const { ideaRows } = require('./idea-rows.cjs');

/**
 * Review W4-23 F3: subscribing again to what was unsubscribed revives the
 * archived row instead of refusing it as `SUBSCRIPTION_CONFLICT` — the same
 * id, live and `ACTIVE`, its periodic check started again, and the leads it
 * brought keep their statuses (a declined one stays declined). An archived
 * subscription's leads are still read by its id (F9). A topic goes the same
 * way, after its card.
 */
const rows = ideaRows();
Object.assign(rows.subscriptions[0], { deletedAt: '2026-09-20T09:00:00.000Z', state: 'PAUSED' });
rows.leads[0].status = 'DISMISSED';

module.exports = {
  id: 'idea-resubscribe-archived',
  title: 'Повторная подписка на то, от чего отписались, — та же подписка снова живая',
  covers: ['ideas.queue', 'ideas.feed.add', 'ideas.archive', 'ideas.topic.add'],
  world: rows,
  turns: [
    {
      say: 'Что было отклонено из vc.ru? И подпишись на неё снова: https://vc.ru/rss',
      model: [
        [['tool', 'ideas_queue', { subscriptionId: 'sub-1', shown: 'dismissed' }]],
        [['tool', 'ideas_feed_add', { url: 'https://vc.ru/rss' }]],
        [['text', 'Снова подписаны на vc.ru.']],
      ],
    },
    {
      say: 'Отпишись от темы про налоги',
      model: [[['tool', 'ideas_archive', { subscriptionId: 'sub-2' }]]],
    },
    // Unsubscribing asks in the web chat (kcxz.45).
    { approve: true, model: [[['text', 'Отписались.']]] },
    {
      say: 'Нет, следи за ней снова: Налоги малого бизнеса',
      model: [[['tool', 'ideas_topic_add', { topic: 'Налоги малого бизнеса' }]]],
    },
    { approve: true, model: [[['text', 'Снова следим за темой.']]] },
  ],
  check: (run) => {
    const [feed, , archived, , topic] = run.turns;
    const queue = feed.outputs[0].output.summary.untrustedData.value;
    expect(queue.leads.map((lead) => lead.id)).toEqual(['lead-1']);
    expect(feed.outputs[1].output).toMatchObject({ ok: true, summary: { subscriptionId: 'sub-1', kind: 'feed' } });
    expect(archived.outputs[0].output).toMatchObject({ ok: true });
    expect(topic.outputs[0].output).toMatchObject({ ok: true, summary: { subscriptionId: 'sub-2', kind: 'topic' } });

    // The same rows, live again; nothing new was created.
    expect(run.world.subscriptions.filter((one) => one.organizationId === 'org-1')).toHaveLength(2);
    for (const id of ['sub-1', 'sub-2']) {
      expect(run.world.subscriptions.find((one) => one.id === id)).toMatchObject({ deletedAt: null, state: 'ACTIVE' });
    }
    // The declined lead stays declined.
    expect(run.world.leads.find((one) => one.id === 'lead-1').status).toBe('DISMISSED');
    // Each revived subscription's periodic check starts again and checks at once.
    expect(run.requests.filter(([name]) => name === 'idea.periodic')).toEqual([
      ['idea.periodic', 'sub-1'],
      ['idea.periodic', 'sub-2'],
    ]);
    expect(run.writes.filter(([name]) => name === 'idea.revived' || name === 'idea.unsubscribed')).toEqual([
      ['idea.revived', 'sub-1'],
      ['idea.unsubscribed', 'sub-2'],
      ['idea.revived', 'sub-2'],
    ]);
  },
};
