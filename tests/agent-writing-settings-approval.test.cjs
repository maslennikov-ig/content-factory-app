'use strict';
const { loadCapabilityModule, IDENTITY, servicesFrom } = require('./helpers/agent-capabilities.cjs');
const { pieceAdapt } = loadCapabilityModule('catalogue/adaptation.capabilities.ts');
const { answerFitsCard, questionCardView } = loadCapabilityModule('question-card.ts');
const baseProfile = { version: 'channel-writing-profile/v2', lengthPolicy: { idealMin: 500, idealMax: 1000, hardMax: 1500 },
  emojiLevel: 'few', hashtagPolicy: 'none', linkPolicy: 'end', ctaKind: 'question', formatPreference: 'auto', notes: null };
const input = { pieceId: 'piece', channelId: 'channel', lengthPolicy: 'auto', settingsReason: 'Сохранить подробности обзора.' };
const setup = (mode = 'manual') => {
  let profile = structuredClone(baseProfile), core = { text: 'Verified material' };
  const cards = [], requests = [], events = [];
  const pieces = {
    detail: jest.fn(async () => ({ core, adaptations: [{ id: 'adaptation', integrationId: 'channel', body: 'Saved text' }] })),
    adaptPlanMode: jest.fn(async () => mode),
    prepareAdapt: jest.fn(async (_org, _id, body) => { requests.push(body); return { body }; }),
    adapt: jest.fn(async function* () { yield { name: 'adaptation', adaptation: { id: 'adaptation', state: 'draft' } }; }),
  };
  const integrations = {
    getWritingProfile: jest.fn(async () => ({profile, providerIdentifier: 'telegram', provider: {maxLength: 4096}})),
    getIntegrationsForChannelList: jest.fn(async () => [{id: 'channel', name: 'Новости', providerIdentifier: 'telegram'}]),
    updateWritingProfile: jest.fn(),
  };
  const ctx = {...IDENTITY, entrance: 'chat', service: servicesFrom({PieceService: pieces, IntegrationService: integrations}),
    suspend: jest.fn(async card => cards.push(card)), resolveAuthorRequest: async () => ({text: 'Оригинальное задание', messageId: 'original'})};
  const run = (args = input) => pieceAdapt.run(ctx, args, async event => events.push(event));
  const resume = async (answer, card = cards.at(-1), args = input) => {
    ctx.suspendPayload = card; ctx.resumeData = answer; return run(args);
  };
  return {ctx, run, resume, cards, requests, events, pieces, integrations, setProfile: value => {profile = value;}, setCore: value => {core = value;}};
};

test('model auto proposal pauses before preparation; card has actual before/after and no model approval', async () => {
  const f = setup(); expect(await f.run()).toBeUndefined();
  expect(f.pieces.prepareAdapt).not.toHaveBeenCalled();
  expect(f.cards[0]).toMatchObject({kind: 'writing-settings', current: {lengthRange: baseProfile.lengthPolicy}, proposed: {lengthPolicy: 'auto'}, reason: input.settingsReason, canDecideForPerson: false});
  const view = questionCardView(f.cards[0]);
  expect(view.continuation).toBeUndefined(); expect(view.cardId).toMatch(/^[0-9a-f]{32}$/);
  expect(answerFitsCard(f.cards[0], {approved: true})).toBe(false);
  expect(answerFitsCard(f.cards[0], {action: 'apply', settings: f.cards[0].proposed, decideForPerson: true})).toBe(false);
});
test('human edits are the actual per-post DTO and result; channel defaults are never written', async () => {
  const f = setup(); await f.run();
  const settings = {...f.cards[0].proposed, lengthPolicy: 'range', lengthRange: {idealMin: null, idealMax: 1800, hardMax: 2000}, emojiLevel: 'medium'};
  const result = await f.resume({action: 'apply', settings});
  expect(f.requests[0].overrides).toEqual({lengthPolicy: 'range', lengthRange: settings.lengthRange, emojiLevel: 'medium'});
  expect(pieceAdapt.summarize(result).writingSettings).toEqual({scope: 'post', action: 'apply', current: f.cards[0].current, settings});
  expect(f.integrations.updateWritingProfile).not.toHaveBeenCalled();
  expect(f.events.find(event => event.data.stage === 'writing-settings-confirmed')).toMatchObject({kind: 'progress', data: {question: {cardId: expect.any(String)}, answer: {action: 'apply', settings}}});
});
test('rejection follows channel defaults without a silent auto override', async () => {
  const f = setup(); await f.run(); await f.resume({action: 'keep-channel'});
  expect(f.requests[0].overrides).toBeUndefined(); expect(f.integrations.updateWritingProfile).not.toHaveBeenCalled();
});
test('autopilot asks separately and retains the edited settings on cold resume', async () => {
  const f = setup('autopilot'); await f.run();
  const settings = {...f.cards[0].proposed, emojiLevel: 'many'};
  await f.resume({action: 'apply', settings});
  expect(f.cards.at(-1).kind).toBe('consent'); expect(f.requests).toHaveLength(0);
  const consent = JSON.parse(JSON.stringify(f.cards.at(-1)));
  await f.resume({consentGiven: true}, consent);
  expect(f.requests[0].overrides).toEqual({lengthPolicy: 'auto', emojiLevel: 'many'});
});
test.each(['profile', 'core'])('stale %s is refused before generation', async source => {
  const f = setup(); await f.run();
  if (source === 'profile') f.setProfile({...baseProfile, ctaKind: 'none'}); else f.setCore({text: 'Changed material'});
  await expect(f.resume({action: 'apply', settings: f.cards[0].proposed})).rejects.toMatchObject({code: 'INPUT_NEEDS_PERSON'});
  expect(f.requests).toHaveLength(0);
});
test('invalid range and MCP without a human card cannot spend', async () => {
  const f = setup(); await f.run();
  const answer = {action: 'apply', settings: {...f.cards[0].proposed, lengthPolicy: 'range', lengthRange: {idealMin: 1000, idealMax: 500, hardMax: 700}}};
  expect(answerFitsCard(f.cards[0], answer)).toBe(false);
  await expect(f.resume(answer)).rejects.toMatchObject({code: 'INPUT_NEEDS_PERSON'});
  const m = setup(); delete m.ctx.suspend; m.ctx.entrance = 'mcp'; m.ctx.confirmed = true;
  await expect(m.run()).rejects.toMatchObject({code: 'INPUT_NEEDS_PERSON'}); expect(m.requests).toHaveLength(0);
});
test('omitted settings and unchanged choices do not interrupt generation', async () => {
  const f = setup(); await f.run({pieceId: 'piece', channelId: 'channel'});
  expect(f.cards).toHaveLength(0); expect(f.requests).toHaveLength(1);
  const g = setup(); await g.run({pieceId: 'piece', channelId: 'channel', emojiLevel: 'few'});
  expect(g.cards).toHaveLength(0); expect(g.requests[0].overrides).toBeUndefined();
});

test('platform limit is shown and an impossible edited range cannot spend', async () => {
  const f = setup(); await f.run(); expect(f.cards[0].maxCharacters).toBe(4096);
  const answer = {action: 'apply', settings: {...f.cards[0].proposed, lengthPolicy: 'range', lengthRange: {idealMin: 5000, idealMax: 6000, hardMax: null}}};
  expect(answerFitsCard(f.cards[0], answer)).toBe(false);
  await expect(f.resume(answer)).rejects.toMatchObject({code: 'INPUT_NEEDS_PERSON'}); expect(f.requests).toHaveLength(0);
});
test('auto/series proposal states that settings cover this material and its draft parts', async () => {
  const f = setup(); await f.run({...input, presentation: 'auto'});
  expect(f.cards[0].scope).toBe('drafts'); expect(f.requests).toHaveLength(0);
});
