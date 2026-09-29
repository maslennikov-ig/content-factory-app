'use strict';

const { ideaRows } = require('./idea-rows.cjs');

/**
 * The acceptance of kcxz.23: тема → проверка → повод → заготовка несёт адрес
 * источника. A topic asks first (owner, 27.09: a standing paid search). Its
 * periodic check starts with it and searches at once under its own
 * `web_research` operation — as the workflow's first iteration does in
 * production (review W4-23 F5) — so a «проверь сейчас» right after is the
 * service's `CHECK_TOO_SOON`, which gives the message's paid step back
 * (F2), and the leads are read from the queue. The lead is taken through its
 * door and the piece is written from the lead the server reads — keeping
 * the lead's address as its source; the answer names the lead (F6).
 */
const FOUND = {
  url: 'https://example.org/news/ai-small-business',
  title: 'ИИ в малом бизнесе: треть владельцев считает налоги с ним',
  // Long enough for the gateway's own junk rule (`lead-junk.ts`: a row needs
  // readable text), which the world runs for real.
  excerpt:
    'Опрос: треть владельцев малого бизнеса уже используют ИИ для отчётности и расчёта налогов, ещё столько же собираются начать до конца года.',
  publishedAt: '2026-09-25T08:00:00.000Z',
  reason: {
    ru: 'Свежий опрос про ИИ в малом бизнесе.',
    en: 'A fresh survey on AI in small business.',
  },
};

module.exports = {
  id: 'idea-topic-to-piece',
  title: 'Тема → проверка → повод → заготовка с адресом источника',
  covers: ['ideas.topic.add', 'ideas.check', 'ideas.queue', 'ideas.take', 'piece.create'],
  world: ideaRows({ topicFound: [FOUND] }),
  turns: [
    {
      say: 'Следи за темой ИИ в малом бизнесе',
      model: [[['tool', 'ideas_topic_add', { topic: 'ИИ в малом бизнесе' }]]],
    },
    { approve: true, model: [[['text', 'Слежу за темой.']]] },
    {
      say: 'Проверь её сейчас и покажи, что нашлось',
      model: [
        [['tool', 'ideas_check', { subscriptionId: 'sub-4' }]],
        [['tool', 'ideas_queue', { subscriptionId: 'sub-4' }]],
        [['text', 'Её только что проверили сами — нашёлся один повод: опрос про ИИ в малом бизнесе.']],
      ],
    },
    {
      say: 'Возьми его в работу',
      model: [[['tool', 'ideas_take', { leadId: 'lead-4' }]]],
    },
    {
      // «Взять в работу» asks in the web chat (kcxz.45); «Да» takes and writes.
      approve: true,
      model: [
        [['tool', 'piece_create', { sourceLeadId: 'lead-4' }]],
        [['text', 'Заготовка cnt-9 написана по поводу «ИИ в малом бизнесе: треть владельцев считает налоги с ним».']],
      ],
    },
  ],
  check: (run) => {
    const [ask, approved, checked, takeCard, taken] = run.turns;
    // The card says what and what it costs, before anything is created.
    expect(ask.approvals[0].reason).toBe(
      'Следить за темой «ИИ в малом бизнесе»: сейчас и потом раз в сутки ищем в интернете свежее по теме, найденное попадает в поводы. Каждая проверка — платный поиск, одна операция ИИ, пока вы не отпишетесь'
    );
    expect(ask.outputs).toEqual([]);
    expect(approved.outputs[0].output).toMatchObject({
      ok: true,
      summary: { subscriptionId: 'sub-4', kind: 'topic', name: 'ИИ в малом бизнесе', checking: true },
    });
    // The periodic check started with the subscription and searched at once,
    // under its own operation — the one paid search of this story.
    expect(run.requests.filter(([name]) => name.startsWith('idea.'))).toEqual([
      ['idea.periodic', 'sub-4'],
      ['idea.research', 'ИИ в малом бизнесе', { task: 'discovery', windowDays: 30 }],
      ['idea.periodic.first', 'sub-4', 'checked'],
    ]);
    expect(approved.admissions).toEqual([
      ['agent', 'agent', 'user-1', 'succeeded'],
      ['web_research', expect.anything(), 'user-1', 'succeeded'],
    ]);

    // «Проверить сейчас» a moment later: the service's own minute, in words;
    // nothing searched again, and the paid step is given back.
    expect(checked.outputs[0].output).toMatchObject({ ok: false, code: 'CHECK_TOO_SOON' });
    expect(checked.admissions).toEqual([['agent', 'agent', 'user-1', 'succeeded']]);
    // The lead, with the judge's own sentence as its reason.
    const queue = checked.outputs[1].output.summary.untrustedData.value;
    expect(queue.leads).toEqual([
      expect.objectContaining({ id: 'lead-4', url: FOUND.url, why: FOUND.reason.ru, subscription: 'ИИ в малом бизнесе' }),
    ]);

    // «Взять в работу»: a card naming the lead, then taken and written.
    expect(takeCard.approvals[0]).toMatchObject({ toolName: 'ideas_take' });
    expect(takeCard.approvals[0].reason).toMatch(/^Взять в работу повод «ИИ в малом бизнесе: треть владельцев/);
    expect(taken.outputs[0].output).toMatchObject({ ok: true, summary: { untrustedData: { value: { leadId: 'lead-4', taken: true } } } });
    expect(taken.outputs[1].output).toMatchObject({
      ok: true,
      summary: { pieceId: 'p9', fromLead: { leadId: 'lead-4' } },
      card: { kind: 'piece', id: 'p9' },
    });
    const piece = run.world.pieces.find((one) => one.id === 'p9');
    expect(piece.leadSource).toEqual({ leadId: 'lead-4', url: FOUND.url, title: FOUND.title });
    // The intake text is the screen's: title, excerpt, address.
    expect(piece.body).toBe(`${FOUND.title}\n\n${FOUND.excerpt}\n\n${FOUND.url}`);
    const intake = run.requests.find(([name]) => name === 'intake')[1];
    expect(intake).toMatchObject({ sourceLeadId: 'lead-4', inputKind: 'thought', language: 'ru' });
    expect(run.world.leads.find((one) => one.id === 'lead-4').status).toBe('ACCEPTED');
    expect(run.writes).toEqual([
      ['idea.subscribed', 'sub-4'],
      // The automatic first check, not a click.
      ['idea.leads', 'sub-4', 1],
      ['idea.checked', 'sub-4', 'ok'],
      ['idea.taken', 'lead-4'],
      ['piece.created', 'p9'],
    ]);
  },
};
