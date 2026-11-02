'use strict';

const { loadTypeScriptModule } = require('../../helpers/load-ts-module.cjs');

const settings = {
  lengthPolicy: 'range',
  lengthRange: { idealMin: 700, idealMax: 1200, hardMax: 1400 },
  emojiLevel: 'none', hashtagPolicy: 'none', linkPolicy: 'end', ctaKind: 'question',
};
const answer = { action: 'apply', settings };

module.exports = {
  id: 'piece-writing-settings',
  title: 'Настройки поста: согласование и восстановление ответа после перезагрузки',
  covers: ['piece.adapt'],
  turns: [
    { say: 'Адаптируй материал и предложи другую длину', model: [[['tool', 'piece_adapt', {
      pieceId: 'p1', channelId: 'c1', presentation: 'single', skipInterview: true,
      lengthPolicy: 'auto', settingsReason: 'Подобрать длину по материалу',
    }]]] },
    { resume: answer, model: [[['text', 'Черновик сохранён.']]] },
  ],
  check: (run) => {
    const [ask, accepted] = run.turns;
    expect(ask.suspended).toHaveLength(1);
    expect(ask.suspended[0].payload).toMatchObject({kind: 'writing-settings', proposed: {lengthPolicy: 'auto'}});
    expect(ask.admissions.map(([operation]) => operation)).toEqual(['agent']);
    expect(accepted.outputs).toEqual(expect.arrayContaining([expect.objectContaining({output: expect.objectContaining({ok: true})})]));
    expect(run.requests.filter(([door]) => door === 'piece.adapt')).toHaveLength(1);
    expect(run.requests.find(([door]) => door === 'piece.adapt')[2].overrides).toMatchObject({
      lengthPolicy: 'range', lengthRange: settings.lengthRange, emojiLevel: 'none',
    });
    expect(accepted.admissions.map(([operation]) => operation)).toContain('text_generation');
    expect(run.writes.filter(([kind]) => kind === 'adaptation.created')).toHaveLength(1);
    expect(run.storedPartTypes).toContain('data-progress');
    expect(JSON.stringify(run.history)).toContain('writing-settings-confirmed');
    const contract = loadTypeScriptModule('apps/frontend/src/components/agents/agent.contract.ts');
    const history = contract.readThreadHistory(run.history);
    const blocks = history.messages.flatMap(message => contract.readMessageBlocks(message, history.pending));
    const saved = blocks.filter(block => block.type === 'question' && block.question.kind === 'writing-settings' && block.writingConfirmed);
    expect(saved).toHaveLength(1);
    expect(saved[0].history.writingAnswer).toEqual(answer);
    expect(saved[0].question.proposed.lengthPolicy).toBe('auto');
  },
};
