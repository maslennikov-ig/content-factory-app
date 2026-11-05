'use strict';
const { IDS, SOURCE, videoRows, summary } = require('./video-world.cjs');
const settings = { provider: 'heygen', model: 'heygen-avatar', mode: 'presenter', locale: 'ru', duration: 30, aspectRatio: '9:16', audio: true, captions: true };
const selected = { ...settings, avatarId: 'owned-presenter', voiceId: 'owned-voice', engine: 'avatar_iv' };
const assets = { avatars: [{ id: selected.avatarId, name: 'Мой ведущий', ownership: 'owned', state: 'available', engines: ['avatar_iv'], locales: ['ru'] }],
  voices: [{ id: selected.voiceId, name: 'Мой голос', ownership: 'owned', state: 'available', engines: ['avatar_iv'], locales: ['ru'] }],
  engines: ['avatar_iv'], status: 'ready', blockers: [], ownedOnly: true, accountGeneration: 1, guidance: null };
const readiness = { connectionId: IDS.heygenConnection, provider: 'heygen', accountGeneration: 1, walletVerified: true, unit: 'heygen_credit',
  schema: { digest: 'a'.repeat(64), reviewed: false, observedToolNames: ['get_current_user', 'list_avatars', 'list_voices'] },
  operations: [{ kind: 'presenter', ready: false, blockers: ['VIDEO_SCHEMA_UNSUPPORTED', 'VIDEO_PRICE_UNAVAILABLE'] },
    { kind: 'final_composition', ready: false, blockers: ['VIDEO_SCHEMA_UNSUPPORTED', 'VIDEO_SUBSCRIPTION_OPERATION_UNAVAILABLE'] }] };
module.exports = {
  id: 'video-personal-draft-connection',
  title: 'Личная подписка открывается на настоящем черновике; свои ресурсы выбираются без платной подготовки и запуска',
  covers: ['video.prepare', 'video.draft', 'video.access_v2', 'video.personal_assets', 'video.personal_readiness', 'video.personal_discover', 'video.edit'],
  world: videoRows({ drafts: [], accessChoices: { workspaceEnabled: true,
    connections: [{ id: IDS.heygenConnection, provider: 'heygen', state: 'connected', generation: 1, unit: 'heygen_credit', perJob: '10', perMonth: '100', walletVerified: true, workspaceGranted: true, balance: null }],
    providers: [{ provider: 'heygen', enabled: false, connectReady: true, generationReady: false, blockers: ['VIDEO_SCHEMA_UNSUPPORTED'], trial: true }] },
    personalConnections: [{ id: IDS.heygenConnection, organizationId: 'org-1', ownerId: 'user-1', assets, readiness }] }),
  turns: [
    { say: 'Сохрани обычный редактируемый сценарий без ИИ. Открой его для подключения моей личной подписки и покажи моих ведущих и голоса, без API и запуска.', model: [
      [['tool', 'video_prepare', { pieceId: IDS.piece, settings, prepareWithAi: false }]],
      [['tool', 'video_draft', { draftId: IDS.draft }]],
      [['tool', 'video_access_v2', { draftId: IDS.draft }]],
      [['tool', 'video_personal_assets', { connectionId: IDS.heygenConnection }]],
      [['tool', 'video_personal_readiness', { connectionId: IDS.heygenConnection }]],
      [['text', 'Черновик открыт. Подключение доступно, но запуск пока не готов: схема и цена не подтверждены; финальная сборка недоступна.']],
    ] },
    { say: 'Выбираю из показанного списка моего ведущего и мой голос. Проверь обнаруженные операции ещё раз и сохрани выбор только в черновике.', model: [
      [['tool', 'video_personal_discover', { connectionId: IDS.heygenConnection }]],
      [['tool', 'video_edit', { draftId: IDS.draft, version: 1, settings: selected }]],
      [['tool', 'video_draft', { draftId: IDS.draft }]],
      [['tool', 'video_access_v2', { draftId: IDS.draft }]],
      [['text', 'Выбор сохранён в том же черновике. Обнаружение не подтвердило схему, цену и финальную сборку; генерация не запускалась.']],
    ] },
  ],
  check(run) {
    const [first, second] = run.turns;
    expect(summary(first, 'video_prepare')).toMatchObject({ id: IDS.draft, preparedWithAi: false, version: 1 });
    const choices = summary(first, 'video_access_v2');
    expect(choices).toMatchObject({ videoDraftId: IDS.draft, pieceId: IDS.piece, providers: [{ connectReady: true, generationReady: false }] });
    const card = first.data.filter(part => part.type === 'data-media').map(part => part.data);
    expect(card).toContainEqual({ kind: 'media', id: 'library', videoDraftId: IDS.draft, pieceId: IDS.piece });
    expect(summary(first, 'video_personal_assets')).toEqual(assets);
    expect(summary(first, 'video_personal_readiness')).toEqual(readiness);
    expect(summary(second, 'video_personal_discover')).toEqual(readiness);
    expect(summary(second, 'video_draft')).toMatchObject({ id: IDS.draft, version: 2, settings: selected, brief: { script: SOURCE } });
    expect(run.world.video.drafts).toHaveLength(1); expect(run.world.video.drafts[0]).toMatchObject({ id: IDS.draft, userId: 'user-1', settings: selected });
    expect(run.requests.find(([name]) => name === 'video.prepare')).toEqual(['video.prepare', 'org-1', 'user-1', { pieceId: IDS.piece, settings, prepareWithAi: false }]);
    for (const name of ['video.personal-assets', 'video.personal-readiness', 'video.personal-discover']) expect(run.requests.find(row => row[0] === name)).toEqual([name, 'org-1', 'user-1', IDS.heygenConnection]);
    expect(run.requests.filter(([name]) => ['video.launch', 'video.launch-v2', 'video.preflight', 'video.preflight-v2'].includes(name))).toEqual([]);
    expect(run.world.video.jobs).toEqual([]); expect(run.world.pieces[0].body).toBe(SOURCE);
    expect(run.writes).toEqual([['video.prepared', IDS.draft], ['video.personal-discovered', IDS.heygenConnection], ['video.edited', IDS.draft, 2]]);
    expect(run.admissions.map(([operation]) => operation)).toEqual(['agent', 'agent']);
    expect(run.turns.flatMap(turn => turn.approvals)).toEqual([]);
  },
};
