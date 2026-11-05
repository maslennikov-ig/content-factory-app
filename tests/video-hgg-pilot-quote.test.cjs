const {contract, evidence, pins, source, owner, imageInput, videoInput} = require('./helpers/hgg-pilot-quote-fixture.cjs');
const {loadTypeScriptModule} = require('./helpers/load-ts-module.cjs');
const code = e => e?.getResponse?.()?.code;
const fails = (fn, expected) => {let error; try {fn();} catch (e) {error = e;} expect(code(error)).toBe(expected);};

test('cost-only exact actual model binding builds explicit image defaults and requested five-second ordered-keyframe video', () => {
  const i = contract.hggPilotQuoteRequestV1(imageInput, evidence, owner);
  expect(i.tool).toBe('generate_image');
  expect(i.arguments).toEqual({params: {model: 'synthetic-image', prompt: imageInput.prompt, count: 1, aspect_ratio: '9:16', variant: 'flare', quality: 'low', resolution: '1k', get_cost: true}});
  const v = contract.hggPilotQuoteRequestV1(videoInput, evidence, owner);
  expect(v.arguments).toEqual({params: {model: 'synthetic-video', prompt: videoInput.prompt, count: 1, aspect_ratio: '9:16', mode: 'image-to-video', resolution: '1080p', duration: 5, medias: [{role: 'start_image', value: videoInput.frames[0].providerMediaId}, {role: 'end_image', value: videoInput.frames[1].providerMediaId}], get_cost: true}});
  expect(Object.isFrozen(v.arguments.params.medias[0])).toBe(true);
});
test('planning price may omit unavailable frames but never claims generation or media validation', () => {
  const request = contract.hggPilotQuoteRequestV1({...videoInput, frames: []}, evidence, owner);
  expect(request.arguments.params.medias).toBeUndefined();
  const quote = contract.decodeHggPilotQuoteV1(request, {cost: {credits: 3, credits_exact: 3.75}});
  expect(quote).toMatchObject({inputValidated: false, generationReady: false, walletVerified: false, paidSubmitEnabled: false, cost: {credits: 3, creditsExact: 3.75}});
  expect(quote).not.toHaveProperty('expiresAt'); expect(quote).not.toHaveProperty('upperBound');
});
test.each([
  v => ({...v, get_cost: false}), v => ({...v, model: 'kling-4.0'}), v => ({...v, frames: [...v.frames].reverse()}),
  v => ({...v, frames: [v.frames[0]]}), v => ({...v, frames: [v.frames[0], {...v.frames[1], providerMediaId: 'https://example.com/frame.png'}]}),
])('unknown controls, aliases, partial/reordered frames and URL inputs fail locally', change => fails(() => contract.hggPilotQuoteRequestV1(change(videoInput), evidence, owner), 'VIDEO_PILOT_QUOTE_INVALID'));
test('changed evidence bytes and generation binding cannot select another model', () => {
  fails(() => contract.hggPilotQuoteRequestV1(videoInput, {...evidence, videoCatalogue: Buffer.from(Buffer.from(evidence.videoCatalogue).toString() + ' ')}, owner), 'VIDEO_PILOT_EVIDENCE_INVALID');
  expect(contract.hggPilotQuoteRequestV1(videoInput, evidence, owner).accountGeneration).toBe(1);
});
test.each([
  [{cost: {credits: -1, credits_exact: 1}}, 'VIDEO_PROVIDER_RESPONSE_INVALID'],
  [{cost: {credits: 1, credits_exact: Infinity}}, 'VIDEO_PROVIDER_RESPONSE_INVALID'],
  [{cost: {credits: 1, credits_exact: 1}, results: [{id: 'submitted'}]}, 'VIDEO_QUOTE_UNEXPECTED_JOB'],
  [{cost: {credits: 1, credits_exact: 1}, adjustments: {duration: {requested: 5, used: 10, reason: 'changed'}}}, 'VIDEO_QUOTE_ADJUSTED'],
  [{cost: {credits: 1, credits_exact: 1}, prepared_params: {duration: 10}}, 'VIDEO_QUOTE_ADJUSTED'],
  [{cost: {credits: 1, credits_exact: 1}, unlim_choice: {message: 'Choose'}}, 'VIDEO_FUNDING_CHOICE_REQUIRED'],
  [{error: 'private remote prose', next_step: {tool: 'buy'}}, 'VIDEO_PROVIDER_TOOL_ERROR'],
])('unsafe quote response fails without generation or recovery actions', (value, expected) => fails(() => contract.decodeHggPilotQuoteV1(contract.hggPilotQuoteRequestV1(videoInput, evidence, owner), value), expected));
test('same source/params preserves request hash; changed source, prompt or asset byte invalidates it', () => {
  const request = contract.hggPilotQuoteRequestV1(videoInput, evidence, owner);
  for (const input of [{...videoInput, prompt: 'Changed'}, {...videoInput, source: {...source, parentRevision: 2}}, {...videoInput, frames: [{...videoInput.frames[0], byteSha256: 'e'.repeat(64)}, videoInput.frames[1]]}]) expect(contract.hggPilotQuoteRequestV1(input, evidence, owner).requestHash).not.toBe(request.requestHash);
  expect(contract.hggPilotQuoteRequestV1(structuredClone(videoInput), evidence, owner).requestHash).toBe(request.requestHash);
});
test('jobs_wait mapping is receipt-bound, plural and never turns lookup failure into permission to resubmit', () => {
  const receipt = {profile: 'hgg_pilot_job_v1', requestHash: 'a'.repeat(64), kind: 'video', modelId: 'synthetic-video', jobId: '33333333-3333-4333-8333-333333333333'};
  expect(contract.hggPilotWaitRequestV1(receipt)).toEqual({tool: 'jobs_wait', arguments: {jobs: [{index: 0, job_id: receipt.jobId}], timeout_seconds: 15}});
  const result = contract.decodeHggPilotWaitV1(receipt, {jobs: [{index: 0, job_id: receipt.jobId, status: 'lookup_failed', retryable: false}], summary: {total: 1, completed: 0, failed: 0, active: 0, errors: 1}, all_terminal: true, timed_out: false});
  expect(result).toMatchObject({state: 'lookup_unknown', replayAllowed: false, actualCost: null});
});

test('production evidence pins reject invented metadata even if a test profile accepts it', () => {
  const real = loadTypeScriptModule('libraries/nestjs-libraries/src/videos/subscriptions/video-hgg-pilot-quote.v1.ts');
  fails(() => real.hggPilotQuoteRequestV1(videoInput, evidence, owner), 'VIDEO_PILOT_EVIDENCE_INVALID');
});
test('first reference must stay bound to the same confirmed provider connection/generation', () => {
  fails(() => contract.hggPilotQuoteRequestV1({...videoInput, frames: [{...videoInput.frames[0], accountGeneration: 2}, videoInput.frames[1]]}, evidence, owner), 'VIDEO_PILOT_QUOTE_INVALID');
});

test.each(['id', 'type', 'model'])('jobs_wait rejects a substituted %s even on a completed response', field => {
  const receipt = {profile: 'hgg_pilot_job_v1', requestHash: 'a'.repeat(64), kind: 'video', modelId: 'synthetic-video', jobId: '33333333-3333-4333-8333-333333333333'};
  const job = {index: 0, job_id: receipt.jobId, status: 'completed', type: 'video', model: 'synthetic-video', result_url: 'https://example.invalid/not-validated.mp4'};
  if (field === 'id') job.job_id = '44444444-4444-4444-8444-444444444444';
  if (field === 'type') job.type = 'image'; if (field === 'model') job.model = 'other';
  fails(() => contract.decodeHggPilotWaitV1(receipt, {jobs: [job], summary: {total: 1, completed: 1, failed: 0, active: 0, errors: 0}, all_terminal: true, timed_out: false}), 'VIDEO_PROVIDER_JOB_INVALID');
});

test('canonical adaptation source ref is retained losslessly with a SHA-256 revision distinct from content digest', () => {
  const canonical = {version: 1, kind: 'adaptation', pieceId: 'synthetic-piece', adaptationId: 'synthetic-adaptation', postId: 'synthetic-post', revision: '9'.repeat(64)};
  const request = contract.hggPilotQuoteRequestV1({...videoInput, source: {...source, sourceArtifactRef: canonical}}, evidence, owner);
  expect(request.input.source.sourceArtifactRef).toEqual(canonical);
  expect(request.input.source.sourceArtifactRef.revision).not.toBe(request.input.source.sourceContentDigest);
  expect(request.input.source).not.toHaveProperty('sourceRevision');
  expect(request.input.source.parentRevision).toBe(1);
});
test('integer source ref revision and separate conflicting sourceRevision are refused', () => {
  const canonical = {version: 1, kind: 'adaptation', pieceId: 'synthetic-piece', adaptationId: 'synthetic-adaptation', revision: '9'.repeat(64)};
  fails(() => contract.hggPilotQuoteRequestV1({...videoInput, source: {...source, sourceArtifactRef: {...canonical, revision: 1}}}, evidence, owner), 'VIDEO_PILOT_QUOTE_INVALID');
  fails(() => contract.hggPilotQuoteRequestV1({...videoInput, source: {...source, sourceArtifactRef: canonical, sourceRevision: '8'.repeat(64)}}, evidence, owner), 'VIDEO_PILOT_QUOTE_INVALID');
});
test.each(['revision', 'pieceId', 'adaptationId', 'postId'])('canonical source ref %s change invalidates quote binding', field => {
  const canonical = {version: 1, kind: 'adaptation', pieceId: 'synthetic-piece', adaptationId: 'synthetic-adaptation', postId: 'synthetic-post', revision: '9'.repeat(64)};
  const input = {...videoInput, source: {...source, sourceArtifactRef: canonical}};
  const request = contract.hggPilotQuoteRequestV1(input, evidence, owner);
  const changed = {...canonical, [field]: field === 'revision' ? '8'.repeat(64) : 'changed-synthetic-id'};
  expect(contract.hggPilotQuoteRequestV1({...input, source: {...input.source, sourceArtifactRef: changed}}, evidence, owner).requestHash).not.toBe(request.requestHash);
});
test('canonical piece source ref keeps its full native structural shape and string revision', () => {
  const canonical = {version: 1, kind: 'piece', pieceId: 'synthetic-native-piece', revision: '7'.repeat(64)};
  const request = contract.hggPilotQuoteRequestV1({...videoInput, source: {...source, sourceArtifactRef: canonical}}, evidence, owner);
  expect(request.input.source.sourceArtifactRef).toEqual(canonical);
  expect(typeof request.input.source.sourceArtifactRef.revision).toBe('string');
  expect(Object.isFrozen(request.input.source.sourceArtifactRef)).toBe(true);
});

test('explicit 720p binds a distinct real wire request while omitted resolution preserves the historical 1080p profile',()=>{
 const historical=contract.hggPilotQuoteRequestV1(videoInput,evidence,owner);
 const lower=contract.hggPilotQuoteRequestV1({...videoInput,resolution:'720p'},evidence,owner);
 expect(historical.arguments.params.resolution).toBe('1080p');expect(lower.arguments.params).toMatchObject({resolution:'720p',duration:5,aspect_ratio:'9:16',count:1,get_cost:true});
 expect(lower.settingsHash).not.toBe(historical.settingsHash);expect(lower.requestHash).not.toBe(historical.requestHash);
 const image=contract.hggPilotQuoteRequestV1({...imageInput,settings:{variant:'flare',quality:'high',resolution:'1k'}},evidence,owner);
 expect(image.arguments.params).toMatchObject({quality:'high',resolution:'1k',count:1});
});
