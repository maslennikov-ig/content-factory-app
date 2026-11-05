'use strict';

/** Native chat service boundaries. Campaign CAS, grants, approvals, action
 * journals and text edits run their real domain code over tenant-keyed rows.
 * Planning/model/native-editor/provider boundaries answer offline fixtures;
 * their calls, immutable checkpoints and effects remain observable. */
const { loadTypeScriptModule } = require('../../helpers/load-ts-module.cjs');
const ROOT = 'libraries/nestjs-libraries/src/content-intelligence/social-factory';
class ScenarioDomainError extends Error {
  constructor(code, message = code) { super(message); this.code = code; }
}
const repositoryPort = {
  SocialFactoryRepository: class {}, SocialFactoryError: ScenarioDomainError,
  sourceRef: (id) => `source:${id}`, resourceRef: (kind, id) => `resource:${kind}:${id}`,
};
const nest = { Injectable: () => (target) => target };
const coreMocks = { '@nestjs/common': nest, '../social-factory.repository': repositoryPort, './social-factory.repository': repositoryPort };
const { CampaignService, approvalDigest } = loadTypeScriptModule(`${ROOT}/campaign/campaign.service.ts`, coreMocks);
const { AutonomyService } = loadTypeScriptModule(`${ROOT}/autonomy/autonomy.service.ts`, coreMocks);
const { identity, digest, localInstant, initialCampaignSlot } = loadTypeScriptModule(`${ROOT}/campaign/domain.ts`, coreMocks);
const { resolveChannelProfileV1 } = loadTypeScriptModule(`${ROOT}/profiles/channel-profile.v1.ts`, coreMocks);
const { SocialFactoryMaterialEditService } = loadTypeScriptModule(`${ROOT}/material-edit.service.ts`, {
  ...coreMocks,
  './campaign/campaign.service': { CampaignService },
  './production.service': { SocialFactoryProductionService: class {} },
  './editorial/native-material.service': { NativeEditorialMaterialService: class {} },
  '../pieces/piece.service': { PieceService: class {} },
});
const copy = (value) => structuredClone(value);
const CREATION = {
  requestId: 'scenario-campaign', name: 'Два материала про рабочие созвоны',
  timeZone: 'Europe/Moscow', startsAt: '2100-01-01', endsAt: '2100-01-14',
  allocations: [{ channelId: 'c1', platform: 'telegram', format: 'post', count: 2 }],
};
const CAMPAIGN = identity('campaign', 'org-1', 'user-1', CREATION.requestId);
const IDS = {
  campaign: CAMPAIGN,
  first: identity('item', CAMPAIGN, '0', '0'),
  second: identity('item', CAMPAIGN, '0', '1'),
  grant: identity('grant', 'org-1', 'user-1', 'scenario-grant'),
  operation: 'scenario-production-checkpoint',
};
const GRANT = {
  requestId: 'scenario-grant', campaignId: IDS.campaign, channelIds: ['c1'],
  actions: ['prepare', 'editorial_decide', 'generate_paid', 'schedule', 'publish'],
  mode: 'autopilot', expiresAt: '2100-01-15T00:00:00.000Z',
  budget: { currency: 'USD', maximum: 5 }, platformConsentIds: [],
};
const materialFor = (item, body = 'Повестка помогает закончить созвон вовремя.') => ({
  version: 1, channelId: item.channelId, platform: item.platform, format: item.format,
  title: 'Созвон с повесткой', hook: 'Начните с результата.', body,
  caption: body, assets: [], evidence: [], settings: { renderedText: body },
  playbook: { version: 'scenario/v1', sourceDate: '2026-11-03' },
  pieceId: `piece-${item.id}`, derivationId: `derivation-${item.id}`,
});
const readyItem = (index = 0) => {
  const from = Date.parse(localInstant(CREATION.startsAt, CREATION.timeZone));
  const to = Date.parse(localInstant(CREATION.endsAt, CREATION.timeZone, true));
  const proposed = from + Math.floor((to - from) * (index + 0.5) / 2);
  const item = { version: 1, id: identity('item', CAMPAIGN, '0', String(index)), campaignId: CAMPAIGN,
    channelId: 'c1', platform: 'telegram', format: 'post', contentRevision: 2,
    scheduledAt: initialCampaignSlot(proposed, CREATION.timeZone, from, to) };
  return { ...item, material: materialFor(item) };
};
const campaignRows = (options = {}) => ({ socialFactory: {
  seed: 'ready', records: [], plans: [], operations: [], attempts: [], native: [],
  cancellations: [], ...copy(options),
} });
const summary = (turn, tool) => {
  const value = turn.outputs.find((one) => one.toolName === tool)?.output.summary;
  return value?.untrustedData?.value ?? value;
};
const payload = (run, kind, id) => run.world.socialFactory.records.find((row) => row.organizationId === 'org-1' && row.kind === kind && row.id === id)?.payload;

function socialFactoryServices({ rows, requests, writes, scoped }) {
  const call = (name, org, actor, ...args) => {
    scoped(name, org);
    if (actor !== null && actor !== 'user-1') throw new ScenarioDomainError('SOCIAL_FACTORY_ACTOR_SCOPE');
    requests.push([name, org, actor, ...copy(args)]);
  };
  const channel = async (org, id, platform) => {
    call('campaign.assertChannel', org, null, id, platform);
    const found = rows.channels.find((row) => row.id === id && (!row.organizationId || row.organizationId === org));
    const actual = found?.providerIdentifier === 'instagram-standalone' ? 'instagram' : found?.providerIdentifier;
    if (!found || found.deletedAt || platform && platform !== actual) throw new ScenarioDomainError('SOCIAL_FACTORY_CHANNEL_NOT_FOUND');
    return copy(found);
  };
  // Measurement-only scenarios also exercise the actual capability's channel
  // precondition; they need no campaign domain seed.
  if (!rows.socialFactory) return { SocialFactoryService: { assertChannel: channel } };
  const data = rows.socialFactory;
  const store = {
    async transact(work) {
      const backup = copy(data.records);
      try { return await work(store); } catch (error) { data.records.splice(0, data.records.length, ...backup); throw error; }
    },
    async read(org, kind, id) { return copy(data.records.find((one) => one.organizationId === org && one.kind === kind && one.id === id) ?? null); },
    async list(org, kind, limit = 10000, parentId) {
      const found = data.records.filter((one) => one.organizationId === org && one.kind === kind && (parentId === undefined || one.parentId === parentId));
      if (found.length > limit) throw new ScenarioDomainError('SOCIAL_FACTORY_QUERY_OVERFLOW');
      return copy(found);
    },
    async put(input) {
      const index = data.records.findIndex((one) => one.organizationId === input.organizationId && one.kind === input.kind && one.id === input.id);
      const previous = data.records[index];
      if (input.expectedRevision === 0 && previous || input.expectedRevision > 0 && previous?.revision !== input.expectedRevision) throw new ScenarioDomainError('SOCIAL_FACTORY_CONFLICT');
      if (previous && ['action', 'decision'].includes(input.kind)) throw new ScenarioDomainError('SOCIAL_FACTORY_IMMUTABLE');
      const saved = { ...copy(input), parentId: input.parentId ?? previous?.parentId ?? null,
        revision: (previous?.revision ?? 0) + 1, createdAt: previous?.createdAt ?? '2026-11-03T12:00:00.000Z', updatedAt: '2026-11-03T12:00:00.000Z' };
      delete saved.expectedRevision;
      if (index < 0) data.records.push(saved); else data.records[index] = saved;
      return copy(saved);
    },
  };
  const campaigns = new CampaignService(store);
  const autonomy = new AutonomyService(store);
  let initialized;
  const initialize = () => initialized ||= (async () => {
    if (data.seed === 'none') return;
    const campaign = await campaigns.create('org-1', { ...copy(CREATION), actorId: 'user-1' });
    if (data.seed === 'ready') {
      for (const item of (await campaigns.get('org-1', campaign.id)).items) {
        await campaigns.setMaterial('org-1', campaign.id, item.id, { material: materialFor(item), expectedContentRevision: item.contentRevision });
      }
    }
  })();
  const ready = (name, actor, work) => async (org, ...args) => {
    await initialize();
    const actorId = typeof actor === 'function' ? actor(args) : actor ? args[0]?.actorId : null;
    call(name, org, actorId, ...args);
    return work(org, ...args);
  };
  const getItem = async (org, campaignId, itemId) => {
    const detail = await campaigns.get(org, campaignId);
    const item = detail.items.find((one) => one.id === itemId);
    if (!item) throw new ScenarioDomainError('CAMPAIGN_ITEM_SCOPE');
    return { ...detail, item };
  };
  const native = {
    async save(org, actor, input) {
      call('campaign.native.save', org, actor, input);
      const saved = { ...copy(input.material), pieceId: `native-${input.requestId}`, derivationId: `adaptation-${input.requestId}` };
      data.native.push({ organizationId: org, actorId: actor, ...copy(input), material: saved });
      return saved;
    },
  };
  const editor = new SocialFactoryMaterialEditService(campaigns, native, {
    unscheduleAdaptation: async (org, pieceId, derivationId) => { call('campaign.unschedule', org, null, pieceId, derivationId); },
  });
  const detail = async (org, id) => {
    const result = await campaigns.get(org, id);
    return { ...result, items: result.items.map((item) => ({ ...item, approvalDigest: approvalDigest(item) })) };
  };
  const cancel = async (org, campaignId) => {
    call('campaign.cancelPending', org, null, campaignId);
    data.cancellations.push(campaignId); writes.push(['campaign.cancelled-pending', campaignId]);
    // These are unsent local schedule rows. No provider call is made.
    for (const record of data.records.filter((one) => one.organizationId === org && one.kind === 'campaign_item' && one.payload.campaignId === campaignId && one.payload.state === 'scheduled')) {
      record.payload.state = 'cancelled';
    }
  };
  const plan = async (org, actor, input) => {
    await initialize(); call('campaign.plan', org, actor, input);
    const current = await campaigns.get(org, input.campaignId);
    if (input.itemIds?.some((id) => !current.campaign.itemIds.includes(id))) throw new ScenarioDomainError('CAMPAIGN_ITEM_SCOPE');
    const prior = data.plans.find((one) => one.requestId === input.requestId);
    if (prior) return copy(prior.result);
    const selected = current.items.filter((one) => !input.itemIds || input.itemIds.includes(one.id));
    const result = { campaignId: input.campaignId, items: selected.map((one) => ({ itemId: one.id, state: 'needs_length', lengthOptions: [
      { id: 'short', label: 'Коротко', description: 'Один практический шаг', lengthRange: { idealMin: 500, idealMax: 800, hardMax: 1000 }, recommended: true },
      { id: 'standard', label: 'С примером', description: 'Шаг и рабочий пример', lengthRange: { idealMin: 900, idealMax: 1400, hardMax: 1600 }, recommended: false },
    ] })), questions: [] };
    result.questions = result.items.map((one) => ({ itemId: one.itemId, channelId: 'c1', question: 'Какую длину выбрать для этого материала?', lengthOptions: copy(one.lengthOptions) }));
    data.plans.push({ requestId: input.requestId, input: copy(input), result });
    writes.push(['campaign.planned', input.requestId, selected.map((one) => one.id)]);
    return copy(result);
  };
  const prepare = async (org, actor, input) => {
    await initialize(); call('campaign.prepare', org, actor, input);
    const planned = data.plans.find((one) => one.requestId === input.requestId);
    if (!planned) throw new ScenarioDomainError('CAMPAIGN_PLAN_REQUIRED');
    const { items } = await campaigns.get(org, input.campaignId);
    const selected = items.filter((one) => !input.itemIds || input.itemIds.includes(one.id));
    if (input.itemIds?.some((id) => !items.some((one) => one.id === id))) throw new ScenarioDomainError('CAMPAIGN_ITEM_SCOPE');
    const result = [];
    for (const item of selected) {
      const operationId = identity('scenario-production', input.requestId, item.id);
      const old = data.operations.find((one) => one.id === operationId);
      if (old) { result.push({ ...copy(old.result), regenerated: false }); continue; }
      const choice = input.itemOverrides?.[item.id]?.lengthChoiceId;
      if (!['short', 'standard'].includes(choice)) { result.push({ itemId: item.id, state: 'needs_length', lengthOptions: copy(planned.result.items.find((one) => one.itemId === item.id).lengthOptions), regenerated: false }); continue; }
      data.attempts.push({ operationId, itemId: item.id, instruction: input.instruction });
      const material = materialFor(item, `Созвон с повесткой. ${input.instruction}`);
      const saved = await native.save(org, actor, { campaignId: input.campaignId, itemId: item.id, requestId: operationId, material, scheduledAt: item.scheduledAt });
      const updated = await campaigns.setMaterial(org, input.campaignId, item.id, { material: saved, expectedContentRevision: item.contentRevision });
      const output = { operationId, itemId: item.id, state: 'ready', material: copy(saved), regenerated: true };
      data.operations.push({ id: operationId, organizationId: org, campaignId: input.campaignId, itemId: item.id, appliedContentRevision: updated.contentRevision, state: 'ready', output: copy(material), result: output });
      writes.push(['campaign.prepared', item.id, updated.contentRevision]); result.push(output);
    }
    return { campaignId: input.campaignId, items: result, questions: [] };
  };
  return {
    SocialFactoryService: {
      assertChannel: channel,
      create: ready('campaign.create', true, async (org, input) => {
        for (const allocation of input.allocations) await channel(org, allocation.channelId, allocation.platform);
        const result = await campaigns.create(org, input); writes.push(['campaign.created', result.id]); return result;
      }),
      detail: ready('campaign.detail', false, detail),
      grant: ready('campaign.grant', true, async (org, input) => {
        for (const id of input.channelIds) await channel(org, id);
        const result = await autonomy.grant(org, input); writes.push(['campaign.granted', result.id, input.authority, input.actorId]); return result;
      }),
      campaigns: {
        list: ready('campaign.list', false, (org) => campaigns.list(org)),
        stop: ready('campaign.stop', (args) => args[1], async (org, id, actor) => { const result = await campaigns.stop(org, id, actor); writes.push(['campaign.stopped', id, actor]); return result; }),
        setMode: ready('campaign.mode', (args) => args[1]?.actorId, async (org, id, input) => { const result = await campaigns.setMode(org, id, input); writes.push(['campaign.mode', id, input.mode, input.actorId]); return result; }),
        approve: ready('campaign.approve', (args) => args[2]?.actorId, async (org, id, itemId, input) => { const result = await campaigns.approve(org, id, itemId, input); writes.push(['campaign.approved', itemId, result.contentRevision, input.actorId]); return result; }),
      },
      autonomy: { revoke: ready('campaign.revoke', (args) => args[1], async (org, id, actor) => { const result = await autonomy.revoke(org, id, actor); writes.push(['campaign.revoked', id, actor]); return result; }) },
    },
    SocialFactoryPublishingService: {
      cancelPending: cancel,
      deliver: ready('campaign.deliver', true, async (org, input) => {
        const claim = await autonomy.admit(org, { ...input, action: 'publish', alsoRequire: ['schedule'], provider: 'telegram' });
        // Scheduling remains local; no external published receipt is invented.
        if (input.action !== 'schedule') throw new ScenarioDomainError('SCENARIO_SCHEDULE_ONLY');
        const item = await autonomy.bindPost(org, claim.id, { postId: `scheduled-${input.itemId}`, scheduled: true });
        writes.push(['campaign.scheduled', input.itemId, claim.id]);
        return { state: 'scheduled', actionId: claim.id, postId: item.postId };
      }),
      reconcile: ready('campaign.reconcile', false, async (org, campaignId, itemId) => {
        const { item } = await getItem(org, campaignId, itemId);
        return { itemId, state: item.state, receipt: item.publication ?? null, resent: false };
      }),
    },
    ChannelProfileServiceV1: { resolve: ready('channel.editorial_profile', false, async (org, channelId) => {
      await channel(org, channelId);
      const profile = { version: 1, channelId, platform: 'telegram', audience: 'Руководители команд', promise: 'Практические рабочие приёмы',
        goals: [], expertise: [], pillars: [], languages: ['ru'], geography: [], exclusions: [], evidence: [],
        openQuestions: [{ id: 'public-example', question: 'Какой пример можно назвать публично?', requiredFor: ['grounded_plan'] }] };
      return { revision: 1, ...resolveChannelProfileV1({ id: channelId, platform: 'telegram', contentLanguage: 'ru' }, profile, null) };
    }) },
    SocialFactoryPlanningService: { discover: ready('channel.discover', false, async (org, channelId, input) => {
      await channel(org, channelId);
      if (input.allowWebSearch !== false || input.sourceIds?.length) throw new ScenarioDomainError('SCENARIO_OFFLINE_DISCOVERY_REQUIRED');
      return { id: 'offline-discovery', candidates: [{ id: 'topic-agenda', channelId, title: 'Зачем созвону повестка', angle: 'Один полезный шаг',
        relevance: { score: 0.8, reason: 'Из явно заданного редакционного брифа.' }, performance: { availability: 'unknown' }, evidence: [] }],
        planningPrompts: [], gaps: ['No verified comparative metrics'], findingIds: [], recommendSources: true };
    }) },
    EditorialDecisionService: { answer: async (org, actor, input) => {
      await initialize(); call('campaign.decide', org, actor, input);
      const result = await autonomy.decide(org, { ...input, actorId: actor, authority: 'agent', kind: 'editorial',
        answer: 'Начать с одного практического шага.', factStatus: 'inferred', evidence: [],
        reason: 'Offline recorded model answer; no company facts are asserted.' });
      writes.push(['campaign.decision', result.id, actor]); return result;
    } },
    SocialFactoryProductionService: {
      plan, prepare,
      reinspect: async (org, actor, operationId, input) => {
        await initialize(); call('campaign.reinspect', org, actor, operationId, input);
        const operation = data.operations.find((one) => one.organizationId === org && one.id === operationId);
        if (!operation) throw new ScenarioDomainError('CAMPAIGN_PRODUCTION_MISSING');
        if (operation.state === 'uncertain' || !operation.output) throw new ScenarioDomainError('CAMPAIGN_REINSPECTION_OUTPUT_REQUIRED');
        const { item } = await getItem(org, operation.campaignId, operation.itemId);
        if (item.contentRevision !== operation.appliedContentRevision) throw new ScenarioDomainError('CAMPAIGN_PRODUCTION_CONTENT_CHANGED');
        if (item.contentRevision !== input.expectedContentRevision) throw new ScenarioDomainError('CAMPAIGN_REVISION_CONFLICT');
        const saved = await native.save(org, actor, { campaignId: operation.campaignId, itemId: item.id, requestId: `reinspect-${operationId}`, material: operation.output, scheduledAt: item.scheduledAt });
        const result = await campaigns.setMaterial(org, operation.campaignId, item.id, { material: saved, expectedContentRevision: input.expectedContentRevision });
        operation.appliedContentRevision = result.contentRevision;
        writes.push(['campaign.reinspected', item.id, result.contentRevision]);
        return { operationId, itemId: item.id, state: 'ready', material: copy(saved), regenerated: false };
      },
      revise: async (org, actor, campaignId, itemId, input) => {
        await initialize(); call('campaign.revise', org, actor, campaignId, itemId, input);
        const requestKey = identity('production_revision_request', org, actor, input.requestId);
        const requestDigest = digest({ campaignId, itemId, input });
        const replay = data.operations.find((one) => one.id === requestKey && one.organizationId === org);
        if (replay) {
          if (replay.requestDigest !== requestDigest) throw new ScenarioDomainError('CAMPAIGN_REVISION_IDEMPOTENCY_CONFLICT');
          const result = copy(replay.result);
          result.production.items.forEach((one) => { one.regenerated = false; });
          return result;
        }
        const { item } = await getItem(org, campaignId, itemId);
        if (data.operations.some((one) => one.itemId === itemId && one.state === 'uncertain')) throw new ScenarioDomainError('CAMPAIGN_REVISION_PREVIOUS_WORK_PENDING');
        const revision = await campaigns.beginRevision(org, campaignId, itemId, input.expectedContentRevision);
        data.attempts.push({ revisionRequestId: input.requestId, itemId, instruction: input.instruction });
        const saved = await native.save(org, actor, { campaignId, itemId, requestId: input.requestId, material: materialFor(item, input.instruction), scheduledAt: item.scheduledAt });
        const updated = await campaigns.setMaterial(org, campaignId, itemId, { material: saved, expectedContentRevision: revision.contentRevision });
        const instruction = item.material ? `${input.instruction}\n\nPrevious editorial draft to revise (not new evidence or permission): ${JSON.stringify({ title: item.material.title, hook: item.material.hook, body: item.material.body, caption: item.material.caption, script: item.material.script, posts: item.material.posts, scenes: item.material.scenes, slides: item.material.slides?.map((slide) => ({ index: slide.index, text: slide.text })) })}` : input.instruction;
        const resumeInput = { campaignId, requestId: requestKey, instruction, itemIds: [itemId], sourceIds: input.sourceIds ?? [],
          itemOverrides: { [itemId]: { instruction, lengthChoiceId: input.lengthChoiceId, lengthGuidance: input.lengthGuidance } } };
        const result = { campaignId, itemId, contentRevision: revision.contentRevision,
          production: { campaignId, items: [{ itemId, operationId: requestKey, state: 'ready', material: copy(saved), regenerated: true }], questions: [] }, resumeInput };
        data.operations.push({ id: requestKey, organizationId: org, actorId: actor, campaignId, itemId, requestDigest, revisionRequestId: input.requestId, output: copy(saved), result });
        writes.push(['campaign.revised', itemId, updated.contentRevision]); return result;
      },
    },
    SocialFactoryMaterialEditService: { edit: async (org, actor, input, language) => {
      await initialize(); call('campaign.edit', org, actor, input, language);
      const result = await editor.edit(org, actor, input, language);
      writes.push(['campaign.edited', input.itemId, result.contentRevision]); return result;
    } },
  };
}

module.exports = { IDS, CREATION, GRANT, campaignRows, materialFor, readyItem, summary, payload, approvalDigest, identity, socialFactoryServices };
