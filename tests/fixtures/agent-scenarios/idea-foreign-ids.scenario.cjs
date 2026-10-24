'use strict';

const { ideaRows } = require('./idea-rows.cjs');

/**
 * Ids of another workspace are refused (kcxz.23): its subscription is not
 * archived or checked, its lead is not taken and no piece is written from it;
 * a lead of this workspace not yet taken is not written from either.
 */
module.exports = {
  id: 'idea-foreign-ids',
  title: 'Чужие подписки и поводы — отказ, ничего не тронуто',
  covers: ['ideas.archive', 'ideas.check', 'ideas.take', 'piece.create', 'ideas.queue'],
  world: ideaRows(),
  refusedTurns: [1, 3],
  pending: 2,
  turns: [
    {
      say: 'Отпишись от sub-foreign и возьми lead-foreign в работу',
      model: [[['tool', 'ideas_archive', { subscriptionId: 'sub-foreign' }]]],
    },
    // Unknown metadata cannot authorize an unnamed action. Each foreign
    // target is attempted independently; a forged approval is refused409.
    {approve: true, model: []},
    {say: 'Возьми lead-foreign в работу', model: [[['tool', 'ideas_take', {leadId: 'lead-foreign'}]]]},
    {approve: true, model: []},
    {
      // An unknown or foreign subscription is a refusal, not «новых нет»
      // (review W4-23 F9).
      say: 'Покажи поводы sub-foreign и sub-nope',
      model: [
        [['tool', 'ideas_queue', { subscriptionId: 'sub-foreign' }]],
        [['tool', 'ideas_queue', { subscriptionId: 'sub-nope' }]],
        [['text', 'Таких подписок нет.']],
      ],
    },
    {
      say: 'Проверь sub-foreign',
      model: [[['tool', 'ideas_check', { subscriptionId: 'sub-foreign' }]], [['text', 'Такой подписки нет.']]],
    },
    {
      say: 'Напиши заготовку по lead-foreign',
      model: [[['tool', 'piece_create', { sourceLeadId: 'lead-foreign' }]], [['text', 'Такого повода нет.']]],
    },
    {
      say: 'Тогда по lead-1',
      model: [[['tool', 'piece_create', { sourceLeadId: 'lead-1' }]], [['text', 'Сначала возьмём его в работу.']]],
    },
  ],
  check: (run) => {
    const codes = run.turns.flatMap((turn) => turn.outputs.map((one) => one.output.code ?? 'ok'));
    expect(codes).toEqual([
      'SUBSCRIPTION_NOT_FOUND',
      'SUBSCRIPTION_NOT_FOUND',
      'SUBSCRIPTION_NOT_FOUND',
      'LEAD_NOT_FOUND',
      'IDEAS_LEAD_NOT_TAKEN',
    ]);
    expect(run.turns[1].refused).toEqual({status: 409, code: 'AGENT_RUN_NOT_PENDING'});
    expect(run.turns[3].refused).toEqual({status: 409, code: 'AGENT_RUN_NOT_PENDING'});
    expect(run.turns[0].approvals[0].reason).toBeNull();
    expect(run.turns[2].approvals[0].reason).toBeNull();
    expect(run.writes).toEqual([]);
    expect(run.world.subscriptions.find((one) => one.id === 'sub-foreign')).toMatchObject({ deletedAt: null, state: 'ACTIVE' });
    expect(run.world.leads.find((one) => one.id === 'lead-foreign').status).toBe('NEW');
    expect(run.world.leads.find((one) => one.id === 'lead-1').status).toBe('NEW');
    // Nothing was spent and no intake began.
    expect(run.requests.filter(([name]) => name === 'intake')).toEqual([]);
    expect(run.admissions.filter(([operation]) => operation !== 'agent')).toEqual([]);
  },
};
