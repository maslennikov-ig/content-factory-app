'use strict';
const {
  IDS,
  SOURCE,
  PILOT_HASH,
  journeyRows,
  summary,
} = require('./native-journey-world.cjs');
const launch = {
  pilotId: IDS.manual,
  preflightId: IDS.preflight,
  approvalHash: PILOT_HASH,
};
module.exports = {
  id: 'native-pilot-budget-launch',
  title:
    'Ручной бюджет проходит настоящий вопрос и единое подтверждение; отказ не запускает, остановка сохраняет чтение, порученный лимит обозначен оценкой',
  covers: [
    'video.pilot_prepare',
    'video.pilot_prepare_delegated',
    'video.pilot_budget',
    'video.pilot_launch',
    'video.pilot_recover',
    'video.pilot_stop',
  ],
  world: journeyRows(),
  turns: [
    {
      say: 'Это новое поручение: подготовь сохранённый текстовый пилот к производству и спроси мой общий лимит.',
      model: [
        [['tool', 'video_pilot_prepare', { pilotId: IDS.manual }]],
        [['tool', 'video_pilot_budget', { pilotId: IDS.manual }]],
      ],
    },
    {
      resume: { answer: '10' },
      model: [
        [
          [
            'text',
            'Сохранён введённый вами общий лимит 10 кредитов. Запуска ещё нет.',
          ],
        ],
      ],
    },
    {
      say: 'Покажи единое подтверждение этого пилота с сохранёнными ценой и лимитом.',
      model: [[['tool', 'video_pilot_launch', launch]]],
    },
    {
      approve: false,
      model: [[['text', 'Отказ принят. Работа провайдера не запускалась.']]],
    },
    {
      say: 'Теперь снова покажи подтверждение того же пилота с теми же серверными реквизитами.',
      before(rows) {
        rows.nativeJourney.afterDecline = [...rows.nativeJourney.launchIntents];
      },
      model: [[['tool', 'video_pilot_launch', launch]]],
    },
    {
      approve: true,
      model: [
        [
          [
            'text',
            'В учебном сценарии сохранено только локальное намерение запуска. Провайдер не вызывался.',
          ],
        ],
      ],
    },
    {
      say: 'Останови следующие стадии и прочитай только статус ранее поставленной стадии.',
      before(rows) {
        rows.nativeJourney.afterApproval = [
          ...rows.nativeJourney.launchIntents,
        ];
      },
      model: [
        [['tool', 'video_pilot_stop', { pilotId: IDS.manual }]],
        [
          [
            'tool',
            'video_pilot_recover',
            {
              pilotId: IDS.manual,
              stage: 'first_frame',
              action: 'status_read',
            },
          ],
        ],
        [
          [
            'text',
            'Новые стадии остановлены, сохранённый статус прочитан. Старые материалы остаются.',
          ],
        ],
      ],
    },
    {
      say: 'Отдельное новое поручение: для второго учебного пилота поручаю необходимые расходы в пределах одной попытки. Подготовь его, обозначив оценочный лимит.',
      model: [
        [['tool', 'video_pilot_prepare_delegated', { pilotId: IDS.delegated }]],
        [['tool', 'video_pilot_budget', { pilotId: IDS.delegated }]],
        [
          [
            'text',
            'Оценочный рабочий лимит второго пилота 9: это расчёт сервера по синтетическим ценам, а не сообщённая вами сумма. Запуск не подтверждён.',
          ],
        ],
      ],
    },
  ],
  check(run) {
    const data = run.world.nativeJourney,
      manual = data.pilots.find((p) => p.id === IDS.manual),
      delegated = data.pilots.find((p) => p.id === IDS.delegated);
    expect(summary(run.turns[0], 'video_pilot_prepare')).toMatchObject({
      pilotId: IDS.manual,
      threadId: run.threadId,
      sourceArtifact: SOURCE,
      production: {
        authorization: {
          state: 'missing',
          pilotLimit: null,
          executionApproved: false,
        },
      },
    });
    expect(run.turns[0].suspended).toHaveLength(1);
    expect(run.turns[0].suspended[0]).toMatchObject({
      toolName: 'video_pilot_budget',
      payload: { questionPurpose: 'fact', canDecideForPerson: false },
    });
    expect(manual.question).toMatchObject({
      questionPurpose: 'fact',
      canDecideForPerson: false,
      options: [],
    });
    expect(
      run.requests.find((r) => r[0] === 'journey.pilot.budget.answer').slice(4)
    ).toEqual([
      IDS.manual,
      manual.budgetTool,
      manual.question,
      { answer: '10' },
    ]);
    const approval = run.turns[2].approvals[0];
    expect(approval).toMatchObject({ toolName: 'video_pilot_launch' });
    expect(approval.reason).toContain('10');
    expect(approval.reason).toContain('не предел списания провайдера');
    expect(run.turns[2].outputs).toEqual([]);
    expect(run.turns[3].outputs.some((r) => r.output?.ok === true)).toBe(false);
    expect(run.turns[4].approvals).toHaveLength(1);
    expect(summary(run.turns[5], 'video_pilot_launch')).toMatchObject({
      pilotId: IDS.manual,
      production: {
        authorization: { pilotLimit: '10', executionApproved: true },
      },
    });
    expect(data.launchIntents).toEqual([IDS.manual]);
    expect(data.afterDecline).toEqual([]);
    expect(data.afterApproval).toEqual([IDS.manual]);
    expect(manual).toMatchObject({
      cap: '10',
      stopped: true,
      recoveryReads: 1,
      threadId: run.threadId,
    });
    expect(manual.productionRequest.messageId).toBe('msg-user-1');
    expect(manual.oldFrames).toEqual(data.originalAssets);
    expect(
      summary(run.turns[7], 'video_pilot_prepare_delegated')
    ).toMatchObject({
      pilotId: IDS.delegated,
      production: {
        authorization: {
          pilotLimit: '9',
          executionApproved: false,
          limitSource: 'owner_delegated_necessary_one_pilot',
          capBasis: { lastFrameTerm: 'estimate', bufferPercent: 25 },
        },
      },
    });
    expect(delegated.productionRequest.messageId).toBe('msg-user-8');
    expect(
      run.requests.filter((r) => r[0] === 'journey.pilot.budget.question')
    ).toHaveLength(1);
    expect(run.turns[7].approvals).toEqual([]);
    expect(
      run.requests
        .filter((r) => /^journey\.(pilot|clip)\./.test(r[0]))
        .every(
          (r) => r[1] === 'org-1' && r[2] === 'user-1' && r[3] === run.threadId
        )
    ).toBe(true);
    expect([data.providerCalls, data.modelCalls, data.renderCalls]).toEqual([
      0, 0, 0,
    ]);
  },
};
