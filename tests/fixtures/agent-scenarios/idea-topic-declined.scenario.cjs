'use strict';

const { ideaRows } = require('./idea-rows.cjs');

/** «Нет» on the topic card: nothing is subscribed, nothing searched (kcxz.23). */
module.exports = {
  id: 'idea-topic-declined',
  title: 'Тема — «Нет», подписки нет и поиска не было',
  covers: ['ideas.topic.add'],
  world: ideaRows({ topicCheck: false }),
  turns: [
    {
      say: 'Следи за темой найм в IT',
      model: [[['tool', 'ideas_topic_add', { topic: 'найм в IT' }]]],
    },
    { approve: false, model: [[['text', 'Хорошо, не подписываемся.']]] },
  ],
  check: (run) => {
    // With topic checking off the card says the topic would wait.
    expect(run.turns[0].approvals[0].reason).toMatch(
      /Проверка тем на сервере сейчас выключена — начнётся, когда её включат$/
    );
    expect(run.turns[1].outputs).toEqual([]);
    expect(run.writes).toEqual([]);
    expect(run.world.subscriptions.map((one) => one.id)).toEqual(['sub-1', 'sub-2', 'sub-foreign']);
    expect(run.requests.filter(([name]) => name === 'idea.research')).toEqual([]);
  },
};
