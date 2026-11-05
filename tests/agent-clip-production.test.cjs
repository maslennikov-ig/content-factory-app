'use strict';
const React = require('react');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', {url: 'http://localhost/agents/original-thread'});
for (const key of ['window', 'document', 'navigator']) Object.defineProperty(global, key, {configurable: true, value: dom.window[key]});
global.IS_REACT_ACT_ENVIRONMENT = true;
const {render, cleanup, within, waitFor, fireEvent, act} = require('@testing-library/react');
const {SWRConfig} = require('swr');
const {loadWithMocks} = require('./helpers/load-ts-with-mocks.cjs');
const {loadTypeScriptModule} = require('./helpers/load-tsx.cjs');
const contract = loadTypeScriptModule('apps/frontend/src/components/agents/agent.clip-production.contract.ts');
const native = loadTypeScriptModule('apps/frontend/src/components/agents/agent.contract.ts');
const words = loadTypeScriptModule('apps/frontend/src/components/agents/agent.copy.ts').agentCopy.en;
const h = React.createElement;
const hash = 'a'.repeat(64), frameHash = 'b'.repeat(64);
const ref = {id: 'pilot', pieceId: 'piece', threadId: 'original-thread'};
const scope = {pilotId: ref.id, preflightId: 'first-preflight', approvalHash: hash};
let language, saved, actor, calls, failure, hold;
const makeStage = (stage = 'first_frame', state = 'ready') => ({
  version: 1, pilotId: ref.id, stage, preflightId: stage === 'first_frame' ? scope.preflightId : `${stage}-preflight`, state,
  bindingHash: hash, approvalHash: hash, canSubmit: true, localInputValidated: true, validationSource: 'cf_owned_source_and_assets', blockers: [], recoveryActions: [],
  quote: {amount: '12.345678', unit: 'higgsfield_credit', source: 'provider', capturedAt: '2026-11-04T10:00:00.000Z', observationSource: 'local_receive_clock', providerInputValidated: false, localAdmissionExpiresAt: '2026-11-04T10:15:00.000Z', providerBillingCap: false},
  ownerLimit: {authorizationId: 'budget', unit: 'higgsfield_credit', pilotLimit: '100', stageLimit: '100', includedStages: [...contract.clipStages], authorized: true, reserved: '12.345678', remaining: '87.654322', remainingSource: 'local_authorization', actualChargeUnknown: true},
  cost: {amount: null, unit: 'higgsfield_credit', certainty: 'unknown'}, result: null, errorCode: null,
});
const production = () => ({
  version: 1, outputLocale: 'en', stages: [makeStage()], visionReview: null,
  authorization: {state: 'authorized', unit: 'higgsfield_credit', pilotLimit: '100', includedStages: [...contract.clipStages], executionApproved: false},
  executionApproval: {scope: 'one_pilot', current: true, canApprove: true, approved: false, preflightId: scope.preflightId, approvalHash: hash, bindingHash: hash, includedStages: [...contract.clipStages], laterPricesUnknown: true, providerBillingCap: false}, blockers: [],
});
// Synthetic estimates for the browser contract; these are not live 1k/720p prices.
const delegatedProduction = () => ({...production(),
  settings: {image: {variant: 'flare', quality: 'high', resolution: '1k'}, video: {resolution: '720p', durationSeconds: 5, aspectRatio: '9:16'}},
  authorization: {...production().authorization, pilotLimit: '13', limitSource: 'owner_delegated_necessary_one_pilot',
    capBasis: {rule: 'ceil_125pct_two_first_plus_planning_clip/v1', firstFrameQuotedCredits: '1.25', estimatedLastFrameCredits: '1.25', clipPlanningQuotedCredits: '7.5', lastFrameTerm: 'estimate', bufferPercent: 25}},
});
const preproduction = () => ({pilotId: ref.id, pieceId: ref.pieceId, threadId: ref.threadId, state: 'reviewed', sourceCurrent: true, independentReviewAccepted: true, outputLocale: 'en', models: [], production: production()});
const mocks = {
  react: React, swr: require('swr'),
  '@contentfactory/react/translation/use-interface-language': {useInterfaceLanguage: () => language},
  '../layout/user.context': {useUser: () => actor},
  '@contentfactory/helpers/utils/custom.fetch': {useFetch: () => async (url, init) => {
    calls.push({url, method: init.method, body: JSON.parse(init.body)});
    if (hold) await new Promise(resolve => {hold = resolve;});
    return {ok: !failure, json: async () => structuredClone(saved)};
  }},
};
const {ClipProductionDetails, ClipProductionStages} = loadWithMocks('apps/frontend/src/components/agents/agent.clip-production.tsx', mocks);
const {ClipPreproductionCard} = loadWithMocks('apps/frontend/src/components/agents/agent.preproduction-card.tsx', mocks);
const {ApprovalCard} = loadWithMocks('apps/frontend/src/components/agents/agent.cards.tsx', mocks);
function drawApproval(extra = {}, cache = new Map()) {
  const onAnswer = jest.fn();
  const props = {title: 'Create the complete pilot', reason: 'Create first and last frames, review the images and create one video within 100 Higgsfield credits.', irreversible: false, toolName: 'video_pilot_launch', state: 'asked', busy: false, onAnswer, words, clipPilotApproval: scope, threadId: ref.threadId, ...extra};
  const wrap = props => h(SWRConfig, {value: {provider: () => cache, dedupingInterval: 0, loadingTimeout: 0, errorRetryCount: 0, focusThrottleInterval: 0}}, h(ApprovalCard, props));
  const view = render(wrap(props));
  return {...view, onAnswer, redraw: update => view.rerender(wrap({...props, ...update}))};
}
beforeEach(() => {language = 'en'; saved = preproduction(); actor = {id: 'actor', orgId: 'org'}; calls = []; failure = 0; hold = null;});
afterEach(cleanup);
afterAll(() => dom.window.close());

test('review script approval shows all exact directions and public copy with no video authorization', async () => {
  saved = preproduction();
  saved.production.executionV2 = {version: 2, mode: 'review', referenceApproval: {state: 'not_ready', referenceDigest: null, canApprove: false}};
  saved.scenario = {directionsLanguage: 'en', outputLocale: 'en', targetSeconds: 5, aspectRatio: '9:16', firstFrameDirections: 'EXACT FIRST BEAT', lastFrameDirections: 'EXACT LAST BEAT', motionDirections: 'EXACT MOTION BEATS', screenText: 'EXACT PUBLIC TEXT', spokenText: 'EXACT SPOKEN TEXT', captions: ['EXACT CAPTION'], unknownFacts: [], rightsConflicts: []};
  const view = drawApproval();
  await waitFor(() => expect(view.container.textContent).toContain('EXACT MOTION BEATS'));
  for (const text of ['EXACT FIRST BEAT','EXACT LAST BEAT','EXACT PUBLIC TEXT','EXACT SPOKEN TEXT','EXACT CAPTION']) expect(view.container.textContent).toContain(text);
  expect(view.container.textContent).toContain('Video waits for your separate approval');
});

test('reference approval renders both owned images and waits for their previews, preserving one exact bound pair', async () => {
  saved = preproduction();
  const images = ['first_frame', 'last_frame'].map((name, i) => ({...makeStage(name, 'saved'), jobId: `job-${name}`,
    result: {ownedMediaId: `owned-${name}`, path: `/media/${name}.png`, mime: 'image/png', width: 720, height: 1280, byteSha256: (i ? 'c' : 'b').repeat(64)}}));
  saved.production.stages = images;
  saved.production.authorization.executionApproved = true;
  saved.production.executionApproval.approved = true; saved.production.executionApproval.canApprove = false;
  saved.production.executionV2 = {version: 2, mode: 'review', referenceApproval: {state: 'awaiting_approval', referenceDigest: frameHash, canApprove: true}};
  saved.production.visionReview = {state:'reviewed',current:true,inputKind:'image_bytes',selectedModel:'review-model',actualModel:'review-model',sourceContentDigest:hash,scenarioDigest:hash,acceptedTextReviewDigest:hash,inputDigest:hash,
    frames:images.map((image,i)=>({slot:i?'last':'first',ownedMediaId:image.result.ownedMediaId,byteSha256:image.result.byteSha256})),verdict:'accept',findings:[],blocker:null};
  saved.scenario = {directionsLanguage: 'en', outputLocale: 'en', targetSeconds: 5, aspectRatio: '9:16', firstFrameDirections: 'FIRST', lastFrameDirections: 'LAST', motionDirections: 'MOTION', screenText: 'PUBLIC TEXT', spokenText: '', captions: [], unknownFacts: [], rightsConflicts: []};
  const reviewScope = {pilotId: ref.id, referenceDigest: frameHash};
  expect(contract.clipPilotApprovalCurrent(contract.readClipProduction(saved.production,ref.id,'en'), reviewScope)).toBe(true);
  const view = drawApproval({toolName:'video_pilot_launch_reviewed_clip_v2',clipPilotApproval:reviewScope});
  await waitFor(() => expect(view.container.querySelectorAll('img')).toHaveLength(2));
  const yes = within(view.container).getByRole('button',{name: words.approval.yes});
  expect(yes.disabled).toBe(true);
  const previews = view.container.querySelectorAll('img');
  expect([...previews].map(image=>image.getAttribute('src'))).toEqual(['/media/first_frame.png','/media/last_frame.png']);
  await act(async()=>{fireEvent.load(previews[0]);fireEvent.load(previews[1]);});
  await waitFor(()=>expect(yes.disabled).toBe(false));
  await act(async()=>fireEvent.error(previews[1]));
  await waitFor(()=>expect(yes.disabled).toBe(true));
});

test.each(['ru-RU', 'en-US', 'fr-FR'])('repair text follows the interface locale independently of output locale (%s)', locale => {
  language = locale;
  const data = production();
  data.lastFrameRepair = {id: 'repair', current: true, state: 'awaiting_approval', reason: 'EXACT saved review finding', approved: false, canApprove: true,
    preflightId: 'repair-preflight', approvalHash: frameHash, quote: {...makeStage().quote, amount: '1.5'}, remaining: '15'};
  const parsed = contract.readClipProduction(data, ref.id, 'en');
  expect(parsed.lastFrameRepair).toEqual(data.lastFrameRepair);
  const view = render(h(ClipProductionDetails, {production: parsed, current: true}));
  const section = view.container.querySelector('[data-clip-repair]');
  expect(section.textContent).toContain(locale === 'ru-RU' ? 'Сохранённый начальный кадр' : 'saved first frame');
  expect(section.textContent).toContain(locale === 'ru-RU' ? 'отдельное согласие' : 'separate approval');
  for (const value of ['1.5', '15', 'EXACT saved review finding']) expect(section.textContent).toContain(value);
  for (const value of ['repair-preflight', frameHash]) expect(section.textContent).not.toContain(value);
  expect(section.querySelectorAll('button,input')).toHaveLength(0);
  view.rerender(h(ClipProductionDetails, {production: {...parsed, lastFrameRepair: {...parsed.lastFrameRepair, approved: true, state: 'blocked'}}, current: true}));
  expect(section.textContent).toContain(locale === 'ru-RU' ? 'Исправление остановлено' : 'Correction stopped');
  expect(section.textContent).toContain(locale === 'ru-RU' ? 'Отдельное согласие на исправление сохранено' : 'Separate correction approval saved');
  view.rerender(h(ClipProductionDetails, {production: {...parsed, lastFrameRepair: {...parsed.lastFrameRepair, current: false}}, current: true}));
  expect(section.textContent).not.toContain('1.5'); expect(section.textContent).not.toContain('EXACT saved review finding');
});

test('missing or unknown translation uses the English dictionary without changing output content', () => {
  const {clipProductionWordsFor} = loadTypeScriptModule('apps/frontend/src/components/agents/agent.clip-production.copy.ts');
  expect(clipProductionWordsFor(undefined).repair).toBe('Last-frame correction');
  expect(clipProductionWordsFor('fr-FR').repair).toBe('Last-frame correction');
});

test.each([
  repair => {repair.state = 'complete';},
  repair => {repair.approvalHash = 'bad';},
  repair => {repair.quote.amount = 'Infinity';},
  repair => {repair.remaining = '-1';},
])('invalid correction readback cannot enter the card (%#)', change => {
  const data = production();
  data.lastFrameRepair = {id: 'repair', current: true, state: 'awaiting_approval', reason: 'finding', approved: false, canApprove: true,
    preflightId: 'repair-preflight', approvalHash: frameHash, quote: {...makeStage().quote}, remaining: '15'};
  change(data.lastFrameRepair); expect(contract.readClipProduction(data, ref.id, 'en')).toBeNull();
});

test.each(['ru', 'en'])('stages preserve exact credit amounts, local remaining and unknown provider charge (%s)', locale => {
  language = locale;
  const view = render(h(ClipProductionDetails, {production: production(), current: true}));
  expect(view.container.textContent).toContain('12.345678');
  expect(view.container.textContent).toContain('87.654322');
  expect(view.container.textContent).toContain(locale === 'ru' ? 'а не баланс аккаунта' : 'not the account balance');
  expect(view.container.textContent).toContain(locale === 'ru' ? 'Фактическое списание провайдера неизвестно' : 'actual provider charge is unknown');
  expect(view.container.textContent).toContain(locale === 'ru' ? 'Цены следующих этапов пока неизвестны' : 'Later stage prices are not known');
  expect(view.container.querySelectorAll('[data-clip-stage]')).toHaveLength(3);
  expect(view.container.querySelectorAll('button')).toHaveLength(0);
  for (const text of ['authorizationId', 'bindingHash', scope.preflightId, hash, 'USD']) expect(view.container.textContent).not.toContain(text);
});

test.each(['ru', 'en'])('delegated one-pilot cap displays current settings and explicit estimated basis without an owner-entered claim (%s)', locale => {
  language = locale;
  const parsed = contract.readClipProduction(delegatedProduction(), ref.id, 'en');
  expect(parsed).not.toBeNull();
  const view = render(h(ClipProductionDetails, {production: parsed, current: true}));
  const text = view.container.textContent;
  for (const value of ['1k', '720p', '9:16', '13', '1.25', '7.5', '25%']) expect(text).toContain(value);
  expect(text).toContain(locale === 'ru' ? 'по вашему поручению' : 'under your instruction');
  expect(text).toContain(locale === 'ru' ? 'Последний кадр — приблизительно' : 'Last frame — estimated');
  expect(text).toContain(locale === 'ru' ? 'Фактическое списание провайдера неизвестно' : 'actual provider charge is unknown');
  expect(text).not.toContain(locale === 'ru' ? 'Лимит, указанный вами' : 'Limit entered by you');
  expect(text).not.toContain('1080p'); expect(text).not.toContain('2k');
  view.rerender(h(ClipProductionDetails, {production: parsed, current: false}));
  expect(view.container.textContent).not.toContain('720p'); expect(view.container.textContent).not.toContain('1.25');
});

test('delegated cap calculation never asks the owner to enter another amount, including a waiting stage', () => {
  const data = delegatedProduction(); data.authorization.state = 'missing'; data.authorization.pilotLimit = null; delete data.authorization.capBasis;
  data.stages[0] = {...makeStage('first_frame', 'awaiting_budget'), blockers: ['VIDEO_PILOT_BUDGET_REQUIRED']};
  const view = render(h(ClipProductionDetails, {production: data, current: true}));
  expect(view.container.textContent).toContain('Calculating the operational cap');
  expect(view.container.textContent).not.toContain('Specify a finite'); expect(view.container.textContent).not.toContain('Waiting for your budget');
  expect(view.container.querySelectorAll('input,textarea,button')).toHaveLength(0);
});

test.each([
  value => {value.settings.video.resolution = '4k';},
  value => {value.settings.image.resolution = '720p';},
  value => {value.authorization.capBasis.clipPlanningQuotedCredits = 'Infinity';},
  value => {value.authorization.capBasis.lastFrameTerm = 'confirmed';},
  value => {value.authorization.capBasis.bufferPercent = 50;},
])('invalid production settings or delegated basis cannot enter the owned view (%#)', change => {
  const data = delegatedProduction(); change(data);
  expect(contract.readClipProduction(data, ref.id, 'en')).toBeNull();
});

test.each(['settings', 'basis'])('delegated approval stays disabled without visible %s even if the server reports canApprove', async missing => {
  saved.production = delegatedProduction();
  if (missing === 'settings') delete saved.production.settings; else delete saved.production.authorization.capBasis;
  const view = drawApproval();
  await waitFor(() => expect(view.container.textContent).toContain('unavailable or out of date'));
  expect(within(view.container).getByRole('button', {name: words.approval.yes}).disabled).toBe(true);
});

test('delegated approval uses the one retained server scope and shows estimates before the native answer', async () => {
  saved.production = delegatedProduction(); saved.production.stages[0].canSubmit = false;
  const view = drawApproval({reason: 'Create one pilot under the retained delegated instruction.'});
  await waitFor(() => expect(within(view.container).getByRole('button', {name: words.approval.yes}).disabled).toBe(false));
  expect(view.container.textContent).toContain('Operational cap for this pilot: 13 Higgsfield credits');
  expect(view.container.textContent).toContain('Last frame — estimated'); expect(view.container.textContent).toContain('720p');
  fireEvent.click(within(view.container).getByRole('button', {name: words.approval.yes}));
  expect(view.onAnswer.mock.calls).toEqual([[true]]);
  expect(calls.every(call => call.url === '/social-factory/clip-preproduction/open' && call.method === 'POST')).toBe(true);
});

test('owned first/end images and final video render only after saved; stale hides all results and estimates', () => {
  const stages = contract.clipStages.map((name, index) => ({...makeStage(name, 'saved'), result: {ownedMediaId: `media-${index}`, path: `/uploads/owned-${index}.${name === 'clip' ? 'mp4' : 'png'}`, mime: name === 'clip' ? 'video/mp4' : 'image/png', width: 1080, height: 1920, byteSha256: frameHash}}));
  const view = render(h(ClipProductionStages, {stages, current: true}));
  expect(view.container.querySelectorAll('img')).toHaveLength(2);
  const video = view.container.querySelector('video');
  expect(video.controls).toBe(true); expect(video.autoplay).toBe(false); expect(video.getAttribute('preload')).toBe('metadata');
  view.rerender(h(ClipProductionStages, {stages: stages.map(stage => ({...stage, state: 'saving'})), current: true}));
  expect(view.container.querySelectorAll('img,video')).toHaveLength(0);
  view.rerender(h(ClipProductionStages, {stages, current: false}));
  expect(view.container.querySelectorAll('img,video')).toHaveLength(0); expect(view.container.textContent).not.toContain('12.345678');
});

test('unknown submissions and recovery describe the existing job without presenting a new launch action', () => {
  const stage = {...makeStage('clip', 'submission_unknown'), blockers: ['PRIVATE_PROVIDER_DETAIL'], errorCode: 'PRIVATE_ERROR', recoveryActions: ['status_read', 'retry_save']};
  const view = render(h(ClipProductionStages, {stages: [stage], current: true}));
  expect(view.container.textContent).toContain('unknown outcome'); expect(view.container.textContent).toContain('Check the existing job'); expect(view.container.textContent).toContain('Retry saving the existing result');
  expect(view.container.textContent).not.toContain('PRIVATE_'); expect(view.container.querySelectorAll('button')).toHaveLength(0);
});

test.each(['ru', 'en'])('only the exact whole-pilot consent blocker is presented as waiting; unknown errors remain blocked (%s)', locale => {
  language = locale;
  const stage = {...makeStage('first_frame', 'awaiting_approval'), canSubmit: false, blockers: ['VIDEO_PILOT_EXECUTION_APPROVAL_REQUIRED']};
  const view = render(h(ClipProductionStages, {stages: [stage], current: true}));
  const waiting = locale === 'ru' ? 'Ожидается согласие на весь запуск.' : 'Awaiting approval for the whole pilot.';
  const blocked = locale === 'ru' ? 'Этап остановлен.' : 'This stage is blocked.';
  expect(view.container.textContent).toContain(waiting);
  expect(view.container.textContent).not.toContain(blocked);
  expect(view.container.querySelectorAll('button')).toHaveLength(0);
  view.rerender(h(ClipProductionStages, {stages: [{...stage, blockers: ['VIDEO_PILOT_UNAVAILABLE']}], current: true}));
  expect(view.container.textContent).toContain(blocked);
  expect(view.container.textContent).not.toContain(waiting);
});

test('saved without owned media has no success badge; a preview error does not invent another generation', () => {
  const stage = makeStage('first_frame', 'saved');
  const view = render(h(ClipProductionStages, {stages: [stage], current: true}));
  expect(view.container.textContent).not.toContain('Saved to the media library');
  expect(view.container.querySelectorAll('img')).toHaveLength(0);
  stage.result = {ownedMediaId: 'saved-frame', path: '/uploads/saved.png', mime: 'image/png', width: 1080, height: 1920, byteSha256: frameHash};
  view.rerender(h(ClipProductionStages, {stages: [{...stage}], current: true}));
  fireEvent.error(view.container.querySelector('img'));
  expect(view.container.textContent).toContain('preview could not be loaded');
  expect(view.container.querySelectorAll('button')).toHaveLength(0);
});

test('provider input changes are explicit and only describe supported recovery', () => {
  const value = production();
  value.stages[0] = {...makeStage('first_frame', 'input_changed'), errorCode: 'VIDEO_PILOT_INPUTS_CHANGED', recoveryActions: ['status_read']};
  expect(contract.readClipProduction(value, ref.id, 'en')).not.toBeNull();
  const view = render(h(ClipProductionStages, {stages: value.stages, current: true}));
  expect(view.container.textContent).toContain('Input changes require review');
  expect(view.container.textContent).toContain('previous approval cannot cover this version');
  expect(view.container.textContent).toContain('Check the existing job');
  expect(view.container.querySelectorAll('button')).toHaveLength(0);
});

test('image review cannot inherit text acceptance and needs the actual model and matching current saved pair', () => {
  const data = production();
  const view = render(h(ClipProductionDetails, {production: data, current: true}));
  expect(view.container.textContent).toContain('actual frame images have not been reviewed');
  data.stages = ['first_frame', 'last_frame'].map((stage, index) => ({...makeStage(stage, 'saved'), result: {ownedMediaId: `frame-${index}`, path: `/uploads/frame-${index}.png`, mime: 'image/png', width: 1080, height: 1920, byteSha256: frameHash}}));
  data.visionReview = {state: 'reviewed', current: true, inputKind: 'image_bytes', selectedModel: 'openai/gpt-6.1-terra', actualModel: null, sourceContentDigest: hash, scenarioDigest: hash, acceptedTextReviewDigest: hash, inputDigest: hash, frames: [{slot: 'first', ownedMediaId: 'frame-0', byteSha256: frameHash}, {slot: 'last', ownedMediaId: 'frame-1', byteSha256: frameHash}], verdict: 'accept', findings: [], blocker: null};
  view.rerender(h(ClipProductionDetails, {production: {...data}, current: true}));
  expect(view.container.textContent).not.toContain('Actual images reviewed');
  data.visionReview.actualModel = 'openai/gpt-6.1-terra';
  view.rerender(h(ClipProductionDetails, {production: {...data}, current: true}));
  expect(view.container.textContent).toContain('Actual images reviewed');
  data.visionReview.frames[1].byteSha256 = hash;
  view.rerender(h(ClipProductionDetails, {production: {...data}, current: true}));
  expect(view.container.textContent).not.toContain('Actual images reviewed');
});

test.each([
  value => {value.stages[0].pilotId = 'foreign';},
  value => {value.stages.push({...value.stages[0]});},
  value => {value.stages[0].cost.amount = 'NaN';},
  value => {value.authorization.pilotLimit = '0';},
  value => {value.stages[0].result = {ownedMediaId: 'media', path: 'javascript:alert(1)', mime: 'image/png', width: 1080, height: 1920, byteSha256: hash};},
])('unsafe or mismatched stage projection is denied (%#)', change => {
  const value = production(); change(value); expect(contract.readClipProduction(value, ref.id, 'en')).toBeNull();
});

test('RU interface and EN output remain independent inside the existing parent card', async () => {
  language = 'ru-RU';
  saved.scenario = {directionsLanguage: 'en', outputLocale: 'en', targetSeconds: 5, aspectRatio: '9:16', firstFrameDirections: 'First direction', lastFrameDirections: 'Last direction', motionDirections: 'One camera move', screenText: 'EXACT EN OUTPUT', spokenText: '', captions: [], unknownFacts: [], rightsConflicts: []};
  const view = render(h(SWRConfig, {value: {provider: () => new Map(), dedupingInterval: 0, loadingTimeout: 0}}, h(ClipPreproductionCard, {preproduction: ref, threadId: ref.threadId, onOpenSource: jest.fn()})));
  await waitFor(() => expect(view.container.textContent).toContain('Кадры и видео'));
  expect(view.container.querySelector('p[lang="en"]').textContent).toBe('EXACT EN OUTPUT');
  expect(view.container.textContent).toContain('Начальный кадр');
  expect(view.container.textContent).toContain('Используется текущая версия материала');
  expect(view.container.textContent).not.toContain('Кадры и видео ещё не созданы');
  expect(calls.every(call => call.url === '/social-factory/clip-preproduction/open' && call.method === 'POST')).toBe(true);
});

test('one whole-pilot Yes waits for owned matching readback, then answers through the existing callback once', async () => {
  hold = true; const view = drawApproval();
  const yes = () => within(view.container).getByRole('button', {name: words.approval.yes});
  expect(yes().disabled).toBe(true); expect(view.onAnswer).not.toHaveBeenCalled();
  await waitFor(() => expect(typeof hold).toBe('function'));
  await act(async () => {const release = hold; hold = null; release();});
  await waitFor(() => expect(yes().disabled).toBe(false));
  expect(view.container.textContent).toContain('One approval covers'); expect(view.container.textContent).toContain('100 Higgsfield credits');
  const approve = yes(); fireEvent.click(approve); fireEvent.click(approve); expect(view.onAnswer.mock.calls).toEqual([[true]]);
  expect(calls).toEqual([{url: '/social-factory/clip-preproduction/open', method: 'POST', body: {pilotId: ref.id, threadId: ref.threadId}}]);
});

test.each(['hash', 'source', 'scope', 'budget', 'canApprove', 'forbidden'])('whole-pilot Yes stays disabled for %s despite a ready stage', async invalid => {
  if (invalid === 'hash') saved.production.executionApproval.approvalHash = frameHash;
  if (invalid === 'source') saved.sourceCurrent = false;
  if (invalid === 'scope') saved.production.executionApproval.includedStages = ['first_frame'];
  if (invalid === 'budget') saved.production.authorization.state = 'missing';
  if (invalid === 'canApprove') saved.production.executionApproval.canApprove = false;
  if (invalid === 'forbidden') failure = 403;
  const view = drawApproval();
  await waitFor(() => expect(view.container.textContent).toContain('unavailable or out of date'));
  const yes = within(view.container).getByRole('button', {name: words.approval.yes});
  expect(yes.disabled).toBe(true); fireEvent.click(yes); expect(view.onAnswer).not.toHaveBeenCalled();
});

test('missing opaque approval scope fails closed without reading; native history preserves the real launch input', () => {
  const view = drawApproval({clipPilotApproval: undefined});
  expect(within(view.container).getByRole('button', {name: words.approval.yes}).disabled).toBe(true); expect(calls).toHaveLength(0);
  const blocks = native.readMessageBlocks({id: 'assistant', role: 'assistant', parts: [{type: 'tool-video_pilot_launch', toolCallId: 'call', state: 'approval-requested', input: scope, approval: {id: 'run::call', requestReason: 'Create the complete pilot'}}]});
  expect(blocks.find(block => block.type === 'approval').clipPilotApproval).toEqual(scope);
});

test('cache recheck and organization change hide the old approval before another Yes', async () => {
  const cache = new Map(), view = drawApproval({}, cache);
  const yes = () => within(view.container).getByRole('button', {name: words.approval.yes});
  await waitFor(() => expect(yes().disabled).toBe(false));
  actor = {id: 'actor', orgId: 'another-org'}; hold = true;
  view.redraw({}); expect(yes().disabled).toBe(true);
  await waitFor(() => expect(typeof hold).toBe('function'));
  failure = 403;
  await act(async () => {const release = hold; hold = null; release();});
  await waitFor(() => expect(view.container.textContent).toContain('unavailable or out of date'));
  expect(yes().disabled).toBe(true); expect(view.onAnswer).not.toHaveBeenCalled();
});

test('a focus recheck hides cached approval and keeps Yes disabled after a stale read', async () => {
  const view = drawApproval();
  const yes = () => within(view.container).getByRole('button', {name: words.approval.yes});
  await waitFor(() => expect(yes().disabled).toBe(false));
  hold = true;
  await act(async () => {window.dispatchEvent(new dom.window.Event('focus'));});
  await waitFor(() => expect(yes().disabled).toBe(true));
  await waitFor(() => expect(typeof hold).toBe('function'));
  saved.production.executionApproval.current = false;
  await act(async () => {const release = hold; hold = null; release();});
  await waitFor(() => expect(view.container.textContent).toContain('unavailable or out of date'));
  expect(yes().disabled).toBe(true);
});

test('async pair and native36 repair states expose real chat-owned request buttons without pseudo tool execution or duplicate sends', async () => {
  language='ru';actor.role='EDITOR';saved=preproduction();
  saved.production.executionV2={version:2,mode:'review',referenceApproval:{state:'awaiting_approval',referenceDigest:frameHash,canApprove:true}};
  saved.production.lastFrameRepair={id:'repair',current:true,state:'awaiting_approval',reason:'Saved finding',approved:false,canApprove:true,preflightId:'repair-price',approvalHash:hash,quote:makeStage().quote,remaining:'15'};
  const onRequest=jest.fn();const view=render(h(SWRConfig,{value:{provider:()=>new Map(),dedupingInterval:0,loadingTimeout:0,errorRetryCount:0,focusThrottleInterval:0}},h(ClipPreproductionCard,{preproduction:ref,threadId:ref.threadId,onOpenSource:jest.fn(),onRequest})));
  await waitFor(()=>expect(within(view.container).getByRole('button',{name:'Посмотреть кадры и запросить согласование'})).toBeTruthy());
  expect(view.container.textContent).toContain('только в настоящей карточке «Да/Нет»');
  const request=within(view.container).getByRole('button',{name:'Посмотреть кадры и запросить согласование'});
  await act(async()=>{fireEvent.click(request);fireEvent.click(request);});
  expect(onRequest).toHaveBeenCalledTimes(1);expect(onRequest.mock.calls[0][1]).toEqual({version:'assistant-work-context/v1',kind:'piece',id:ref.pieceId,clipPilotId:ref.id});
  expect(onRequest.mock.calls[0][0]).not.toContain(ref.id);expect(calls.every(c=>c.url.endsWith('/open'))).toBe(true);
});
test('a prepared scenario offers authored reference revisions with exact context and an explicit BOTH-new-images scope', async () => {
  language='ru';actor.role='EDITOR';saved=preproduction();
  saved.scenario={directionsLanguage:'en',outputLocale:'en',targetSeconds:5,aspectRatio:'9:16',firstFrameDirections:'FIRST',lastFrameDirections:'LAST',motionDirections:'MOTION',screenText:'EXACT COPY',spokenText:'',captions:[],unknownFacts:[],rightsConflicts:[]};
  saved.models=[{role:'author',selected:'writer',actual:'writer',state:'captured'},{role:'critic',selected:'reviewer',actual:'reviewer',state:'captured'}];saved.review={verdict:'accept',findings:[]};
  const onRequest=jest.fn(),view=render(h(SWRConfig,{value:{provider:()=>new Map(),dedupingInterval:0,loadingTimeout:0,errorRetryCount:0,focusThrottleInterval:0}},h(ClipPreproductionCard,{preproduction:ref,threadId:ref.threadId,onOpenSource:jest.fn(),onRequest})));
  await waitFor(()=>expect(within(view.container).getByRole('button',{name:'Править визуальные референсы'}).disabled).toBe(false));
  await act(async()=>fireEvent.click(within(view.container).getByRole('button',{name:'Править визуальные референсы'})));
  expect(view.container.textContent).toContain('ОБОИХ новых кадров');expect(onRequest).not.toHaveBeenCalled();
  await act(async()=>fireEvent.submit(view.container.querySelector('form')));expect(onRequest).not.toHaveBeenCalled();
  await act(async()=>fireEvent.change(within(view.container).getByRole('textbox',{name:'Ваши правки'}),{target:{value:'Реальная авторская правка: другой свет, точный текст оставить.'}}));
  await act(async()=>fireEvent.submit(view.container.querySelector('form')));
  expect(onRequest).toHaveBeenCalledTimes(1);expect(onRequest.mock.calls[0][0]).toContain('Реальная авторская правка: другой свет, точный текст оставить.');
  expect(onRequest.mock.calls[0][1].clipPilotId).toBe(ref.id);expect(calls.every(c=>c.url.endsWith('/open'))).toBe(true);
});

test.each(['prepare', 'review', 'autopilot'])('first-gate %s affordance sends one explicit user request with exact hidden selection and no launch side effect', async phase => {
  language='ru';actor.role='EDITOR';saved=preproduction();
  saved.scenario={directionsLanguage:'en',outputLocale:'en',targetSeconds:5,aspectRatio:'9:16',firstFrameDirections:'FIRST',lastFrameDirections:'LAST',motionDirections:'MOTION',screenText:'COPY',spokenText:'',captions:[],unknownFacts:[],rightsConflicts:[]};
  saved.models=[{role:'author',selected:'writer',actual:'writer',state:'captured'},{role:'critic',selected:'reviewer',actual:'reviewer',state:'captured'}];saved.review={verdict:'accept',findings:[]};
  if(phase==='prepare') delete saved.production;
  if(phase==='review') saved.production.executionV2={version:2,mode:'review',referenceApproval:{state:'not_ready',referenceDigest:null,canApprove:false}};
  const onRequest=jest.fn(),view=render(h(SWRConfig,{value:{provider:()=>new Map(),dedupingInterval:0,loadingTimeout:0,errorRetryCount:0,focusThrottleInterval:0}},h(ClipPreproductionCard,{preproduction:ref,threadId:ref.threadId,onOpenSource:jest.fn(),onRequest})));
  const label=phase==='prepare'?'Подготовить запуск кадров':'Запросить согласование сценария и запуска';
  await waitFor(()=>expect(within(view.container).getByRole('button',{name:label}).disabled).toBe(false));
  await act(async()=>{fireEvent.click(within(view.container).getByRole('button',{name:label}));fireEvent.click(within(view.container).getByRole('button',{name:label}));});
  expect(onRequest).toHaveBeenCalledTimes(1);
  expect(onRequest.mock.calls[0][1]).toEqual({version:'assistant-work-context/v1',kind:'piece',id:ref.pieceId,clipPilotId:ref.id});
  expect(onRequest.mock.calls[0][0]).not.toContain(ref.id);
  expect(onRequest.mock.calls[0][0]).toContain(phase==='prepare'?'фактическую первую цену':phase==='review'?'Видео требует отдельного согласия':'автопилота');
  expect(calls.every(c=>c.url.endsWith('/open'))).toBe(true);
});

test('first-gate preparation stays disabled while the chat is stopped/busy', async () => {
  language='ru';actor.role='EDITOR';saved=preproduction();delete saved.production;
  saved.scenario={directionsLanguage:'en',outputLocale:'en',targetSeconds:5,aspectRatio:'9:16',firstFrameDirections:'FIRST',lastFrameDirections:'LAST',motionDirections:'MOTION',screenText:'COPY',spokenText:'',captions:[],unknownFacts:[],rightsConflicts:[]};
  saved.models=[{role:'author',selected:'writer',actual:'writer',state:'captured'},{role:'critic',selected:'reviewer',actual:'reviewer',state:'captured'}];saved.review={verdict:'accept',findings:[]};
  const onRequest=jest.fn(),view=render(h(SWRConfig,{value:{provider:()=>new Map(),dedupingInterval:0,loadingTimeout:0,errorRetryCount:0,focusThrottleInterval:0}},h(ClipPreproductionCard,{preproduction:ref,threadId:ref.threadId,onOpenSource:jest.fn(),onRequest,busy:true})));
  await waitFor(()=>expect(within(view.container).getByRole('button',{name:'Подготовить запуск кадров'}).disabled).toBe(true));
  fireEvent.click(within(view.container).getByRole('button',{name:'Подготовить запуск кадров'}));expect(onRequest).not.toHaveBeenCalled();
});

test('native36 textual pseudo-call remains unmodified history and cannot become an approval card', () => {
  const text='I opened the approval card.\nCall: default_api:video_pilot_launch_last_frame_repair\n{"pilotId":"pilot","repairId":"repair"}';
  const message={id:'native36',role:'assistant',parts:[{type:'text',text}]},before=JSON.stringify(message);
  const blocks=native.readMessageBlocks(message,[]);
  expect(blocks).toEqual([{type:'text',key:'native36:0',text}]);expect(blocks.some(block=>block.type==='approval')).toBe(false);expect(JSON.stringify(message)).toBe(before);
});
