'use strict';

const { factRows } = require('./fact-rows.cjs');

/**
 * «Снять» asks on a card that quotes the fact, read in this workspace by id
 * (kcxz.24); «Да» takes it out of use, and «Вернуть» brings it back without
 * asking — the person's own word is in work again at once.
 */
module.exports = {
  id: 'fact-retract-restore',
  title: 'Снять факт — карточка с самим фактом, «Да»; вернуть без вопроса',
  covers: ['facts.retract', 'facts.restore'],
  world: factRows(),
  turns: [
    {
      say: 'Сними факт про пробный период',
      model: [[['tool', 'facts_retract', { factId: 'f1' }]]],
    },
    { approve: true, model: [[['text', 'Сняли.']]] },
    {
      say: 'Нет, верни его',
      model: [[['tool', 'facts_restore', { factId: 'f1' }]], [['text', 'Вернули.']]],
    },
  ],
  check: (run) => {
    const [ask, yes, back] = run.turns;
    expect(ask.approvals).toEqual([
      expect.objectContaining({
        toolName: 'facts_retract',
        reason:
          'Снять факт «Пробный период — 14 дней.»: новые тексты больше не будут на него опираться, написанные останутся как есть. Вернуть можно в «Откуда факты»',
      }),
    ]);
    expect(ask.outputs).toEqual([]);
    expect(yes.outputs[0].output).toMatchObject({ ok: true, capability: 'facts.retract' });
    expect(yes.outputs[0].output.summary.untrustedData.value).toMatchObject({ factId: 'f1', retracted: true });
    expect(back.outputs[0].output.summary.untrustedData.value).toMatchObject({
      factId: 'f1',
      inWork: true,
      wasRetracted: true,
    });
    expect(back.approvals).toEqual([]);
    expect(run.writes).toEqual([
      ['fact.status', 'f1', 'RETRACTED'],
      ['fact.status', 'f1', 'UNVERIFIED'],
      ['fact.status', 'f1', 'VERIFIED'],
    ]);
    expect(run.world.facts.find((one) => one.id === 'f1').status).toBe('VERIFIED');
    // «Откуда факты» beside the chat follows each change.
    expect(back.data.map((part) => part.type)).toContain('data-facts');
  },
};
