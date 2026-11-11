'use strict';

const makeFixtures = require('../../helpers/agent-heygen-fixtures.cjs');
const { toolNameOf } = require('../../helpers/agent-scenarios.cjs');

const quotation = 'Смотрите в камеру.';
const identity = { organizationId: 'org-1', userId: 'user-1' };

const message = (say, capabilities, approval, chatMode) => ({ say, capabilities, approval, chatMode });
const approve = (capability) => ({ approve: true, capability });

function heygenScenario(id, title, plan) {
  const fixtures = makeFixtures(quotation, identity);
  return {
    id,
    title,
    covers: plan.flatMap(step => step.capabilities ?? []),
    services: () => makeFixtures(quotation, identity)['video.person_profiles'].services,
    turns: plan.map((step, index) => {
      if (step.approve) return { approve: true, model: [[['text', 'Решение сохранено.']]] };
      return {
        say: step.say,
        chatMode: step.chatMode,
        model: step.capabilities.map(capability => {
          const input = { ...fixtures[capability].input };
          if (input.requestMessageId) input.requestMessageId = `msg-user-${index + 1}`;
          return [['tool', toolNameOf(capability), input]];
        }),
      };
    }),
    check(run) {
      for (const [index, step] of plan.entries()) {
        const turn = run.turns[index];
        expect(turn.approvals.map(card => card.toolName)).toEqual(step.approval ? [toolNameOf(step.approval)] : []);
        const completed = step.approve ? [step.capability] : step.capabilities.filter(capability => capability !== step.approval);
        expect(turn.outputs.map(({ toolName, output }) => [toolName, output.ok])).toEqual(
          completed.map(capability => [toolNameOf(capability), true])
        );
      }
    },
  };
}

module.exports = { heygenScenario, message, approve, quotation };
