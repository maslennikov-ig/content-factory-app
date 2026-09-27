'use strict';

const { screenPieces } = require('../../helpers/agent-scenarios.cjs');

/**
 * `kcxz.32` N1 (live recheck 27.09.2026): an approval card that is no longer
 * the last message. The person talked on, then answered the card further up.
 * The live screen drew «ответ отправлен» and sent nothing; here «Нет» and
 * «Да» are sent the way the screen now sends them — `addToolApprovalResponse`
 * on that card, then `sendMessage()` through the screen's own transport — and
 * each reaches the door exactly once, for the message the card is in, and
 * the stored call is what runs.
 */
const ROW = {
  id: 'a1',
  pieceId: 'p1',
  kind: 'post',
  platform: 'telegram',
  integrationId: 'c1',
  integrationName: 'Канал про работу',
  body: 'Текст поста.',
  postId: 'post-1',
  state: 'draft',
  date: '2031-03-04T07:00:00.000Z',
  plan: { status: 'reserved', date: '2031-03-04T07:00:00.000Z', autopilot: false, current: true },
};
const CALL = { pieceId: 'p1', adaptationId: 'a1' };

/** The stored message id a card is in, from the thread as a reload shows it. */
const messageOfCard = (history, approvalId) =>
  (history?.messages ?? []).find((message) =>
    (message.parts ?? []).some((part) => part.toolCallId && approvalId.endsWith(`::${part.toolCallId}`))
  )?.id;

module.exports = {
  id: 'plan-publish-now-earlier-card',
  title: 'Карточка «Опубликовать сейчас» выше по ленте: «Нет» и «Да» уходят один раз',
  covers: ['plan.publish_now'],
  world: { adaptations: [ROW] },
  turns: [
    { say: 'Опубликуй cnt-1 сейчас', model: [[['tool', 'plan_publish_now', CALL]]] },
    { say: 'Подожди, а что вообще в плане?', model: [[['text', 'В плане одна бронь.']]] },
    { approve: false, approveCardOfTurn: 1, model: [[['text', 'Не публикуем.']]] },
    { say: 'Всё-таки опубликуй', model: [[['tool', 'plan_publish_now', CALL]]] },
    { say: 'Сколько сейчас времени?', model: [[['text', 'Сейчас 13:00.']]] },
    { approve: true, approveCardOfTurn: 4, model: [[['text', 'Опубликовали.']]] },
  ],
  check: (run) => {
    const [firstAsk, , no, secondAsk, , yes] = run.turns;
    // «Нет» on the earlier card: one request, carrying that card's message,
    // which is not the thread's last one.
    expect(no.sentBodies).toHaveLength(1);
    const noCard = firstAsk.approvals[0].approvalId;
    const [noMessage] = no.body.messages;
    expect(no.body.messages).toHaveLength(1);
    expect(noMessage.role).toBe('assistant');
    expect(noMessage.id).toBe(messageOfCard(no.before, noCard));
    expect(noMessage.id).not.toBe(no.before.messages.at(-1).id);
    expect(
      noMessage.parts.filter((part) => part.state === 'approval-responded').map((part) => part.approval)
    ).toEqual([expect.objectContaining({ id: noCard, approved: false })]);
    expect(no.types).toContain('tool-output-denied');
    // The answer landed on its own card, further up: it reads «не стали».
    expect(no.client.status).toBe('ready');
    const denied = no.client.messages.find((message) => message.id === noMessage.id);
    expect(denied.parts.some((part) => part.state === 'output-denied')).toBe(true);

    // «Да» on the earlier card: one request, the stored call runs once.
    expect(yes.sentBodies).toHaveLength(1);
    const yesCard = secondAsk.approvals[0].approvalId;
    expect(yes.body.messages[0].id).toBe(messageOfCard(yes.before, yesCard));
    expect(yes.body.messages[0].id).not.toBe(yes.before.messages.at(-1).id);
    expect(yes.outputs[0].output).toMatchObject({ ok: true, summary: { state: 'scheduled' } });
    expect(run.requests.filter(([door]) => door === 'plan.schedule')).toEqual([
      ['plan.schedule', 'p1', 'a1', screenPieces().buildSchedulePayload({ now: true })],
    ]);
    expect(run.writes).toEqual([['plan.scheduled', 'a1', 'now']]);

    // Nothing waits any more; a reload draws both cards settled, none asks.
    expect(run.pending).toBe(0);
    expect(run.pendingCards).toEqual([]);
    const contract = require('../../helpers/load-tsx.cjs').loadTypeScriptModule(
      'apps/frontend/src/components/agents/agent.contract.ts'
    );
    const reloaded = contract.readThreadHistory(run.history);
    const cards = reloaded.messages
      .filter((message) => message.role === 'assistant')
      .flatMap((message) => contract.readMessageBlocks(message, reloaded.pending))
      .filter((block) => block.type === 'approval');
    expect(cards.map((card) => card.state)).toEqual(['declined', 'approved']);
  },
};
