'use strict';
const {
  IDS,
  OLD_REPAIR_HASH,
  FRESH_REPAIR_HASH,
  journeyRows,
  summary,
} = require('./native-journey-world.cjs');
const fresh = {
  pilotId: IDS.repairPilot,
  repairId: IDS.repair,
  preflightId: IDS.repairPreflight,
  approvalHash: FRESH_REPAIR_HASH,
};
module.exports = {
  id: 'native-pilot-last-frame-repair',
  title:
    'Цена одной правки обновляется отдельным поручением; старое согласование закрыто, новое подтверждение сохраняет первый кадр и лимит',
  covers: [
    'video.pilot_prepare_last_frame_repair',
    'video.pilot_refresh_last_frame_repair_quote',
    'video.pilot_launch_last_frame_repair',
  ],
  world: journeyRows(),
  turns: [
    {
      say: 'Новое поручение: исправь только текст отклонённого последнего кадра. Первый кадр и сценарий сохранить.',
      model: [
        [
          [
            'tool',
            'video_pilot_prepare_last_frame_repair',
            { pilotId: IDS.repairPilot },
          ],
        ],
        [
          [
            'text',
            'Сохранено отдельное поручение для одной правки; цена учебного предложения истекла. Запуска нет.',
          ],
        ],
      ],
    },
    {
      say: 'Обнови только истёкшую цену этой уже сохранённой правки, без новой попытки и без изменения лимита.',
      model: [
        [
          [
            'tool',
            'video_pilot_refresh_last_frame_repair_quote',
            { pilotId: IDS.repairPilot, repairId: IDS.repair },
          ],
        ],
        [
          [
            'tool',
            'video_pilot_launch_last_frame_repair',
            { ...fresh, approvalHash: OLD_REPAIR_HASH },
          ],
        ],
        [
          [
            'text',
            'Цена обновлена в той же правке. Старый реквизит согласования отклонён; новое подтверждение ещё требуется.',
          ],
        ],
      ],
    },
    {
      say: 'Покажи новое подтверждение только этой правки по свежим реквизитам.',
      model: [[['tool', 'video_pilot_launch_last_frame_repair', fresh]]],
    },
    {
      approve: false,
      model: [[['text', 'Отказ принят, правка не запускалась.']]],
    },
    {
      say: 'Ещё раз покажи подтверждение той же правки с текущей ценой.',
      before(rows) {
        rows.nativeJourney.afterRepairDecline = [
          ...rows.nativeJourney.repairIntents,
        ];
      },
      model: [[['tool', 'video_pilot_launch_last_frame_repair', fresh]]],
    },
    {
      approve: true,
      model: [
        [
          [
            'text',
            'Сохранено одно локальное намерение правки. Генерации и новой проверки изображений в учебном сценарии не было.',
          ],
        ],
      ],
    },
  ],
  check(run) {
    const data = run.world.nativeJourney,
      pilot = data.pilots.find((p) => p.id === IDS.repairPilot);
    expect(
      summary(run.turns[0], 'video_pilot_prepare_last_frame_repair')
    ).toMatchObject({
      pilotId: IDS.repairPilot,
      production: {
        lastFrameRepair: {
          id: IDS.repair,
          approvalHash: OLD_REPAIR_HASH,
          canApprove: false,
        },
      },
    });
    expect(
      summary(run.turns[1], 'video_pilot_refresh_last_frame_repair_quote')
    ).toMatchObject({
      production: {
        lastFrameRepair: {
          id: IDS.repair,
          approvalHash: FRESH_REPAIR_HASH,
          canApprove: true,
        },
        authorization: { pilotLimit: '10' },
      },
    });
    expect(run.turns[1].outputs[1].output).toMatchObject({
      ok: false,
      code: 'CLIP_REPAIR_APPROVAL_CHANGED',
    });
    expect(run.turns[1].approvals).toEqual([]);
    expect(run.turns[2].approvals[0]).toMatchObject({
      toolName: 'video_pilot_launch_last_frame_repair',
    });
    expect(run.turns[2].approvals[0].reason).toContain(
      'остаток прежнего лимита 6 из 10'
    );
    expect(run.turns[3].outputs.some((r) => r.output?.ok === true)).toBe(false);
    expect(
      summary(run.turns[5], 'video_pilot_launch_last_frame_repair')
    ).toMatchObject({
      production: {
        lastFrameRepair: { id: IDS.repair, state: 'queued', approved: true },
      },
    });
    expect(pilot.repair.request).toMatchObject({
      messageId: 'msg-user-1',
      text: module.exports.turns[0].say,
    });
    expect(pilot.repair.refreshRequest).toMatchObject({
      messageId: 'msg-user-2',
      text: module.exports.turns[1].say,
    });
    expect(pilot.repair.previousHash).toBe(OLD_REPAIR_HASH);
    expect(pilot.repair.hash).toBe(FRESH_REPAIR_HASH);
    expect(pilot.repair.oldFrames).toEqual(data.originalAssets);
    expect(pilot.oldFrames).toEqual(data.originalAssets);
    expect(pilot.cap).toBe('10');
    expect(data.repairIntents).toEqual([IDS.repair]);
    expect(data.afterRepairDecline).toEqual([]);
    expect(data.launchIntents).toEqual([]);
    expect(
      run.requests
        .filter((r) => r[0].startsWith('journey.repair.'))
        .every(
          (r) => r[1] === 'org-1' && r[2] === 'user-1' && r[3] === run.threadId
        )
    ).toBe(true);
    expect([data.providerCalls, data.modelCalls, data.renderCalls]).toEqual([
      0, 0, 0,
    ]);
  },
};
