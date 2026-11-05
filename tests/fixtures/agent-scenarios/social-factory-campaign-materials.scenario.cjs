'use strict';
const { IDS, campaignRows, readyItem, materialFor, approvalDigest, identity, summary, payload } = require('./social-factory-world.cjs');
const instruction = 'Один практический совет для руководителя.';
const requestId = 'scenario-prepare';
const operationId = identity('scenario-production', requestId, IDS.first);
const preparation = { campaignId: IDS.campaign, requestId, instruction, itemIds: [IDS.first] };
const selected = { ...preparation, itemOverrides: { [IDS.first]: { lengthChoiceId: 'short', lengthGuidance: 'Один практический шаг' } } };
const ready = readyItem();
ready.material = { ...materialFor(ready, `Созвон с повесткой. ${instruction}`), pieceId: `native-${operationId}`, derivationId: `adaptation-${operationId}` };
const revision = { campaignId: IDS.campaign, itemId: IDS.first, expectedContentRevision: 5, requestId: 'scenario-author-revision', instruction: 'Новая версия с примером повестки.', lengthChoiceId: 'standard' };
module.exports = {
  id: 'social-factory-campaign-materials',
  title: 'Длина выбирается до подготовки; правки меняют только выбранный материал, повтор сохраняет результат',
  covers: ['campaign.plan_materials', 'campaign.prepare', 'campaign.edit', 'campaign.reinspect', 'campaign.revise'],
  world: campaignRows({ seed: 'planned' }),
  turns: [
    { say: 'Предложи длину первого поста и проверь, можно ли уже подготовить его', model: [
      [['tool', 'campaign_plan_materials', preparation]],
      [['tool', 'campaign_prepare', preparation]],
      [['text', 'Перед подготовкой нужно выбрать длину первого материала.']],
    ] },
    { say: 'Выбираю короткий вариант. Повтор запроса использует тот же результат.', model: [
      [['tool', 'campaign_prepare', selected]],
      [['tool', 'campaign_prepare', selected]],
      [['text', 'Первый материал подготовлен один раз. Второй не менялся.']],
    ] },
    { say: 'Согласуй показанную версию первого материала', model: [[['tool', 'campaign_approve', { campaignId: IDS.campaign, itemId: IDS.first, expectedContentRevision: 2, digest: approvalDigest(ready) }]]] },
    { approve: true, model: [[['text', 'Показанная версия согласована.']]] },
    { say: 'Повтори проверку известного сохранённого результата без модели', model: [
      [['tool', 'campaign_reinspect', { operationId, expectedContentRevision: 2 }]],
      [['text', 'Известный результат проверен без новой генерации.']],
    ] },
    { say: 'Теперь измени только текст первого поста. Прежний checkpoint не должен затереть новую подпись.', model: [
      [['tool', 'campaign_edit', { campaignId: IDS.campaign, itemId: IDS.first, expectedContentRevision: 3, body: 'Исправленная подпись для первого материала.' }]],
      [['tool', 'campaign_reinspect', { operationId, expectedContentRevision: 5 }]],
      [['text', 'Новая версия сохранена, прежнее согласование больше не действует. Старый checkpoint отклонён.']],
    ] },
    { say: 'Заказываю новую версию только первого материала с примером повестки', model: [[['tool', 'campaign_revise', revision]], [['text', 'Новая версия первого материала сохранена.']]] },
    { say: 'Повтори этот же запрос новой версии, не создавая ещё одну. Тот же requestId с другим материалом использовать нельзя.', model: [
      [['tool', 'campaign_revise', revision]],
      [['tool', 'campaign_revise', { ...revision, itemId: IDS.second, instruction: 'Несогласованная замена второго материала.' }]],
      [['text', 'Возвращена сохранённая версия первого материала. Конфликтующий повтор отклонён.']],
    ] },
    { say: 'Старую вторую версию править нельзя; отсутствующий или неизвестный результат повторно генерировать нельзя', before(rows) { rows.socialFactory.operations[0].state = 'uncertain'; }, model: [
      [['tool', 'campaign_edit', { campaignId: IDS.campaign, itemId: IDS.first, expectedContentRevision: 2, body: 'Устаревшая правка' }]],
      [['tool', 'campaign_reinspect', { operationId: 'foreign-operation', expectedContentRevision: 7 }]],
      [['tool', 'campaign_reinspect', { operationId, expectedContentRevision: 7 }]],
      [['text', 'Все запросы отклонены. Сохранённый материал не изменён.']],
    ] },
  ],
  check(run) {
    expect(summary(run.turns[0], 'campaign_plan_materials').items[0]).toMatchObject({ itemId: IDS.first, lengthOptions: [{ id: 'short' }, { id: 'standard' }] });
    expect(summary(run.turns[0], 'campaign_prepare').items).toEqual([expect.objectContaining({ itemId: IDS.first, state: 'needs_length', regenerated: false, lengthOptions: expect.any(Array) })]);
    for (const [index, output] of run.turns[1].outputs.entries()) expect(output.output.summary.untrustedData.value.items).toEqual([expect.objectContaining({ operationId, itemId: IDS.first, state: 'ready', regenerated: index === 0, material: { ...ready.material } })]);
    expect(run.turns[2].approvals).toHaveLength(1);
    expect(summary(run.turns[4], 'campaign_reinspect')).toMatchObject({ state: 'ready', regenerated: false, material: { body: ready.material.body } });
    expect(run.turns[5].outputs.at(-1).output).toMatchObject({ ok: false, code: 'CAMPAIGN_PRODUCTION_CONTENT_CHANGED' });
    const revised = summary(run.turns[6], 'campaign_revise').revision;
    expect(revised).toMatchObject({ campaignId: IDS.campaign, itemId: IDS.first, contentRevision: 6, production: { campaignId: IDS.campaign, items: [{ state: 'ready', regenerated: true, material: { body: revision.instruction } }] }, resumeInput: { requestId: identity('production_revision_request', 'org-1', 'user-1', revision.requestId), itemIds: [IDS.first] } });
    expect(revised.resumeInput.instruction).toContain(revision.instruction);
    expect(summary(run.turns[7], 'campaign_revise').revision).toEqual({ ...revised, production: { ...revised.production, items: revised.production.items.map((one) => ({ ...one, regenerated: false })) } });
    expect(run.turns[7].outputs.at(-1).output).toMatchObject({ ok: false, code: 'CAMPAIGN_REVISION_IDEMPOTENCY_CONFLICT' });
    expect(run.turns[8].outputs.map((one) => one.output)).toEqual([
      expect.objectContaining({ ok: false, code: 'CAMPAIGN_REVISION_CONFLICT' }),
      expect.objectContaining({ ok: false, code: 'CAMPAIGN_PRODUCTION_MISSING' }),
      expect.objectContaining({ ok: false, code: 'CAMPAIGN_REINSPECTION_OUTPUT_REQUIRED' }),
    ]);
    expect(payload(run, 'campaign_item', IDS.first)).toMatchObject({ contentRevision: 7, state: 'ready', material: { body: revision.instruction } });
    expect(payload(run, 'campaign_item', IDS.first).approval).toBeUndefined();
    expect(payload(run, 'campaign_item', IDS.second)).toMatchObject({ contentRevision: 1, state: 'planned' });
    expect(payload(run, 'campaign_item', IDS.second).material).toBeUndefined();
    expect(run.world.socialFactory.attempts).toEqual([
      { operationId, itemId: IDS.first, instruction }, { revisionRequestId: revision.requestId, itemId: IDS.first, instruction: revision.instruction },
    ]);
    expect(run.world.socialFactory.operations[0].output.body).toBe(`Созвон с повесткой. ${instruction}`);
    expect(run.world.socialFactory.native).toHaveLength(4);
    expect(run.requests.filter(([name]) => name === 'campaign.prepare').every(([, org, actor, input]) => org === 'org-1' && actor === 'user-1' && input.requestId === requestId)).toBe(true);
    expect(run.writes.filter(([name]) => name === 'campaign.revised')).toHaveLength(1);
    expect(run.writes.filter(([name]) => name === 'campaign.scheduled')).toEqual([]);
  },
};
