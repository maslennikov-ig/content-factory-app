'use strict';
const {
  IDS,
  DRAFT_SOURCE,
  PIECE,
  journeyRows,
  summary,
} = require('./native-journey-world.cjs');
const body = 'Committed owned text whose first reply was lost.';
module.exports = {
  id: 'native-source-artifact-uncertain',
  title:
    'Потеря ответа после реальной записи остаётся неопределённой; последующее чтение не повторяет правку',
  covers: ['source.edit_draft_artifact', 'source.resolve_artifact'],
  world: journeyRows(),
  turns: [
    {
      say: 'Сохрани мой точный текст только в выбранном автономном черновике.',
      before(rows) {
        rows.nativeJourney.loseSourceReplyAfterCommit = true;
      },
      model: [
        [
          [
            'tool',
            'source_edit_draft_artifact',
            {
              sourceArtifact: DRAFT_SOURCE,
              body,
              requestId: 'source-lost-reply',
            },
          ],
        ],
        [
          [
            'text',
            'Запись могла завершиться, но её ответ не подтверждён. Повторять изменение автоматически нельзя.',
          ],
        ],
      ],
    },
    {
      say: 'Только прочитай текущую адаптацию. Не повторяй запись.',
      model: [
        [
          [
            'tool',
            'source_resolve_artifact',
            {
              version: 1,
              kind: 'adaptation',
              pieceId: IDS.piece,
              adaptationId: IDS.adaptation,
            },
          ],
        ],
        [
          [
            'text',
            'Прочитан текущий сохранённый текст. Нового изменения не было.',
          ],
        ],
      ],
    },
  ],
  check(run) {
    const data = run.world.nativeJourney;
    expect(run.turns[0].outputs[0].output).toMatchObject({
      ok: false,
      code: 'CAPABILITY_OUTCOME_UNCERTAIN',
    });
    expect(run.turns[0].outputs[0].output.canReviseInput).toBeUndefined();
    expect(JSON.stringify(run.turns.flatMap((t) => t.outputs))).not.toContain(
      'PRIVATE_LOST_SOURCE_REPLY'
    );
    expect(data.lostSourceReplies).toBe(1);
    expect(data.source.adaptation.body).toBe(body);
    expect(data.source.nativeReceipts).toHaveLength(1);
    expect(data.source.piece).toEqual(JSON.parse(JSON.stringify(PIECE)));
    expect(summary(run.turns[1], 'source_resolve_artifact')).toMatchObject({
      text: body,
      organizationId: 'org-1',
      actorId: 'user-1',
      ref: { pieceId: IDS.piece, adaptationId: IDS.adaptation },
    });
    expect(
      run.requests.filter((r) => r[0] === 'journey.source.edit')
    ).toHaveLength(1);
    expect(run.writes).toEqual([
      ['journey.source.edited', IDS.adaptation, body],
    ]);
    expect(data.source.posts).toBe(0);
    expect(data.source.integrations).toBe(0);
    expect([data.providerCalls, data.modelCalls, data.renderCalls]).toEqual([
      0, 0, 0,
    ]);
  },
};
