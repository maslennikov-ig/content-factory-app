'use strict';

const { ideaRows } = require('./idea-rows.cjs');

/**
 * «Откуда идеи» read from the chat (kcxz.23): the subscriptions of this
 * workspace only, what each watches and whether it is checked; then the new
 * leads, newest first, as untrusted data. Both open the ideas screen beside
 * the chat and write nothing.
 */
module.exports = {
  id: 'idea-list-queue',
  title: 'Откуда идеи — подписки и новые поводы, только своей области',
  covers: ['ideas.list', 'ideas.queue'],
  world: ideaRows(),
  turns: [
    {
      say: 'На что мы подписаны и что нового?',
      model: [
        [['tool', 'ideas_list', {}]],
        [['tool', 'ideas_queue', {}]],
        [['text', 'Две подписки и два новых повода.']],
      ],
    },
  ],
  check: (run) => {
    const [turn] = run.turns;
    const [list, queue] = turn.outputs.map((one) => one.output);
    expect(list.ok).toBe(true);
    // Names and topics are people's words: the model reads them as data.
    const subscriptions = list.summary.untrustedData.value;
    expect(subscriptions.subscriptions).toEqual([
      expect.objectContaining({ id: 'sub-1', kind: 'feed', name: 'vc.ru', watches: 'https://vc.ru/rss', state: 'active', checking: true, leadsThisMonth: 2 }),
      expect.objectContaining({ id: 'sub-2', kind: 'topic', watches: 'Налоги малого бизнеса', checking: true }),
    ]);
    // The last check in the person's zone (Moscow), not UTC.
    expect(subscriptions.subscriptions[0].lastChecked).toMatch(/09:00/);
    expect(JSON.stringify(list)).not.toContain('Чужая лента');
    expect(queue.summary.untrustedData.sources).toEqual(['lead']);
    const leads = queue.summary.untrustedData.value;
    expect(leads).toMatchObject({ shown: 'new', total: 2 });
    expect(leads.leads.map((one) => one.id)).toEqual(['lead-1', 'lead-2']);
    expect(leads.leads[0]).toMatchObject({
      subscription: 'vc.ru',
      url: 'https://vc.ru/a/1',
      why: 'Свежая запись в ленте vc.ru.',
    });
    expect(JSON.stringify(queue)).not.toContain('Чужой повод');
    // The ideas screen opens beside the chat, by its one id.
    expect(turn.data.filter((part) => part.type === 'data-ideas').map((part) => part.data)).toEqual([
      { kind: 'ideas', id: 'leads' },
      { kind: 'ideas', id: 'leads' },
    ]);
    expect(run.writes).toEqual([]);
  },
};
