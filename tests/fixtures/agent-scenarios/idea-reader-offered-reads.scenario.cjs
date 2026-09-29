'use strict';

const { ideaRows } = require('./idea-rows.cjs');

/**
 * A «Пользователь» reads subscriptions and leads, and is offered nothing that
 * subscribes, checks, declines or takes (spec §4.2; kcxz.23).
 */
module.exports = {
  id: 'idea-reader-offered-reads',
  title: 'Пользователь — идеи только на чтение',
  role: 'USER',
  covers: ['ideas.queue'],
  world: ideaRows(),
  turns: [
    {
      say: 'Какие есть поводы?',
      model: [[['tool', 'ideas_queue', {}]], [['text', 'Два новых повода.']]],
    },
  ],
  check: (run) => {
    const offered = run.firstCall.tools;
    expect(offered).toEqual(expect.arrayContaining(['ideas_list', 'ideas_queue']));
    for (const tool of [
      'ideas_feed_add',
      'ideas_topic_add',
      'ideas_archive',
      'ideas_check',
      'ideas_dismiss',
      'ideas_take',
      'piece_create',
    ]) {
      expect(offered).not.toContain(tool);
    }
    expect(run.turns[0].outputs[0].output.ok).toBe(true);
    expect(run.writes).toEqual([]);
  },
};
