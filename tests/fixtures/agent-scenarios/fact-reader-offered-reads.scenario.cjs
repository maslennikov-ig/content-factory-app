'use strict';

const { factRows } = require('./fact-rows.cjs');

/**
 * A «Пользователь» reads facts, own texts and analytics, and is offered
 * nothing that adds, retracts or restores a fact, nor the cliché check — its
 * door is the editor's (spec §4.2; kcxz.24).
 */
module.exports = {
  id: 'fact-reader-offered-reads',
  title: 'Пользователь — факты, свои тексты и аналитика только на чтение',
  role: 'USER',
  covers: ['facts.list', 'analytics.production'],
  world: factRows(),
  turns: [
    {
      say: 'Какие у нас факты и сколько постов вышло за месяц?',
      model: [[['tool', 'facts_list', {}]], [['tool', 'analytics_production', {}]], [['text', 'Два факта, три поста.']]],
    },
  ],
  check: (run) => {
    const offered = run.firstCall.tools;
    expect(offered).toEqual(
      expect.arrayContaining(['facts_list', 'texts_related', 'analytics_production', 'analytics_channel'])
    );
    for (const tool of ['facts_add', 'facts_retract', 'facts_restore', 'text_slop_check']) {
      expect(offered).not.toContain(tool);
    }
    expect(run.turns[0].outputs.map((one) => one.output.ok)).toEqual([true, true]);
    expect(run.writes).toEqual([]);
  },
};
