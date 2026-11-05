'use strict';
const {
  IDS,
  DRAFT_SOURCE,
  PIECE,
  ADAPTATION,
  journeyRows,
  summary,
} = require('./native-journey-world.cjs');
const selection = {
  version: 1,
  kind: 'adaptation',
  pieceId: IDS.piece,
  adaptationId: IDS.adaptation,
};
const edit = {
  sourceArtifact: DRAFT_SOURCE,
  body: 'Exact owner-authored replacement for this standalone draft.',
  requestId: 'owned-draft-edit',
};
module.exports = {
  id: 'native-source-artifact-edit',
  title:
    'Точный исходник и правка своего черновика: повтор идемпотентен, устаревшая версия и чужой источник закрыты',
  covers: ['source.resolve_artifact', 'source.edit_draft_artifact'],
  world: journeyRows(),
  turns: [
    {
      say: 'Прочитай выбранную адаптацию. Замени только её текст моим точным текстом; повтор ответа не должен повторять запись.',
      model: [
        [['tool', 'source_resolve_artifact', selection]],
        [['tool', 'source_edit_draft_artifact', edit]],
        [['tool', 'source_edit_draft_artifact', edit]],
        [
          [
            'tool',
            'source_edit_draft_artifact',
            {
              ...edit,
              requestId: 'stale-new-edit',
              body: 'Must not overwrite the current revision.',
            },
          ],
        ],
        [
          [
            'tool',
            'source_resolve_artifact',
            { version: 1, kind: 'piece', pieceId: 'foreign-source' },
          ],
        ],
        [['tool', 'source_resolve_artifact', selection]],
        [
          [
            'text',
            'Текст своего черновика сохранён один раз. Ядро исходника сохранено; устаревшая правка и чужой источник отклонены.',
          ],
        ],
      ],
    },
  ],
  check(run) {
    const turn = run.turns[0],
      data = run.world.nativeJourney;
    expect(summary(turn, 'source_resolve_artifact')).toMatchObject({
      ref: DRAFT_SOURCE,
      text: ADAPTATION.body,
      organizationId: 'org-1',
      actorId: 'user-1',
    });
    const edits = turn.outputs.filter(
      (r) => r.toolName === 'source_edit_draft_artifact'
    );
    const first = edits[0].output.summary.untrustedData.value;
    expect(first).toMatchObject({
      ref: selection,
      text: edit.body,
      organizationId: 'org-1',
      actorId: 'user-1',
    });
    expect(first.ref.revision).not.toBe(DRAFT_SOURCE.revision);
    expect(edits[1].output.summary.untrustedData.value).toEqual(first);
    // A known transactional refusal is distinct from a lost post-commit reply.
    expect(edits[2].output).toMatchObject({
      ok: false,
      code: 'SOURCE_ARTIFACT_STALE',
      canReviseInput: true,
    });
    expect(turn.outputs[4].output).toMatchObject({
      ok: false,
      code: 'SOURCE_ARTIFACT_NOT_FOUND',
      canReviseInput: true,
    });
    expect(data.sourceRefusals).toEqual([
      {
        organizationId: 'org-1',
        actorId: 'user-1',
        input: {
          ...edit,
          requestId: 'stale-new-edit',
          body: 'Must not overwrite the current revision.',
        },
        code: 'SOURCE_ARTIFACT_STALE',
      },
      {
        organizationId: 'org-1',
        actorId: 'user-1',
        input: { version: 1, kind: 'piece', pieceId: 'foreign-source' },
        code: 'SOURCE_ARTIFACT_NOT_FOUND',
      },
    ]);
    expect(turn.outputs.at(-1).output.summary.untrustedData.value).toEqual(
      first
    );
    expect(run.writes).toEqual([
      ['journey.source.edited', IDS.adaptation, edit.body],
    ]);
    expect(data.source.piece).toEqual(JSON.parse(JSON.stringify(PIECE)));
    expect(data.source.adaptation.body).toBe(edit.body);
    expect(data.source.nativeReceipts).toHaveLength(1);
    expect(data.source.nativeReceipts[0]).toMatchObject({
      organizationId: 'org-1',
      kind: 'action',
    });
    expect(data.source.integrations).toBe(0);
    expect(data.source.posts).toBe(0);
    expect(
      run.requests
        .filter((r) => r[0].startsWith('journey.source.'))
        .every((r) => r[1] === 'org-1' && r[2] === 'user-1')
    ).toBe(true);
    expect([data.providerCalls, data.modelCalls, data.renderCalls]).toEqual([
      0, 0, 0,
    ]);
  },
};
