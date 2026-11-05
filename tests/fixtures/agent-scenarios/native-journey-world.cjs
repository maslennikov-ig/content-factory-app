'use strict';

// Registry/HTTP/approval scenarios, not provider or account certification.
// Source reads/edits, draft destinations and local descriptor CAS use actual
// domain code; clip/model/renderer ports expose explicit offline checkpoints.
const { createHash } = require('node:crypto');
const {
  fixture,
  loadTypeScriptModule,
  base,
  copy,
} = require('../../helpers/source-artifact.fixture.cjs');
const sf = base + 'content-intelligence/social-factory/';
const fail = (code) => {
  throw Object.assign(new Error(code), { code });
};
const repo = loadTypeScriptModule(sf + 'social-factory.repository.ts');
const mocks = {
  './social-factory.repository': repo,
  '../social-factory.repository': repo,
};
const { DraftDestinationServiceV1 } = loadTypeScriptModule(
  sf + 'draft-destination.v1.ts',
  mocks
);
const { LocalCompositionOperationV2 } = loadTypeScriptModule(
  sf + 'local-composition.operation.v2.ts',
  mocks
);
const { identity } = loadTypeScriptModule(sf + 'campaign/domain.ts', mocks);
const { clipProductionBudgetAnswerV1, clipVisionVerdictV1 } = loadTypeScriptModule(
  sf + 'contracts/native-clip-production.v1.ts'
);
const {clipRevisionInputV2} = loadTypeScriptModule(sf + 'contracts/native-clip-revision.v2.ts');
const {clipReferenceLaunchV2} = loadTypeScriptModule(sf + 'contracts/native-clip-execution.v2.ts');
const canonical = (x) =>
  x instanceof Date
    ? x.toISOString()
    : Array.isArray(x)
    ? x.map(canonical)
    : x && typeof x === 'object'
    ? Object.fromEntries(
        Object.keys(x)
          .filter((k) => x[k] !== undefined)
          .sort()
          .map((k) => [k, canonical(x[k])])
      )
    : x;
const hash = (x) =>
  createHash('sha256')
    .update(typeof x === 'string' ? x : JSON.stringify(canonical(x)))
    .digest('hex');
const IDS = {
  piece: 'journey-piece',
  adaptation: 'journey-adaptation',
  sourceDraft: 'journey-source-draft',
  operation: 'journey-local-operation',
  campaign: 'journey-campaign',
  item: 'journey-item',
  text: 'journey-text',
  manual: 'journey-manual',
  delegated: 'journey-delegated',
  repairPilot: 'journey-repair-pilot',
  repair: 'journey-last-repair',
  preflight: 'journey-first-preflight',
  repairPreflight: 'journey-repair-preflight',
  reviewPilot: 'journey-reviewed-pair',
  revision: 'journey-linked-reference-revision',
};
const STAMP = new Date('2026-01-01T00:00:00Z');
const PIECE = {
  id: IDS.piece,
  organizationId: 'org-1',
  kind: 'CORE',
  title: 'Owned synthetic source',
  body: 'Keep the original source core.',
  brief: {
    version: 'social-factory-material/v1',
    material: {
      channelId: IDS.sourceDraft,
      platform: 'instagram',
      destination: { kind: 'draft', id: IDS.sourceDraft, publishable: false },
    },
  },
  language: 'en',
  archivedAt: null,
  updatedAt: STAMP,
};
const ADAPTATION = {
  id: IDS.adaptation,
  organizationId: 'org-1',
  contentPieceId: IDS.piece,
  postId: null,
  integrationId: null,
  title: 'Owned standalone draft',
  body: 'Initial owned standalone text.',
  platform: 'instagram',
  format: 'post',
  kind: 'post',
  updatedAt: STAMP,
};
const refFor = (kind) => {
  const title = kind === 'piece' ? PIECE.title : ADAPTATION.title,
    text = kind === 'piece' ? PIECE.body : ADAPTATION.body;
  return {
    version: 1,
    kind,
    pieceId: IDS.piece,
    ...(kind === 'adaptation' ? { adaptationId: IDS.adaptation } : {}),
    revision: hash({
      version: 1,
      kind,
      identity:
        kind === 'piece'
          ? { piece: PIECE }
          : { piece: PIECE, adaptation: ADAPTATION, post: null },
      title,
      text,
      locale: 'en',
    }),
  };
};
const SOURCE = refFor('piece'),
  DRAFT_SOURCE = refFor('adaptation');
const COMPOSITION = identity(
  'local_composition_v2',
  'org-1',
  IDS.operation,
  'journey-compose'
);
const DESTINATION = identity('draft', 'org-1', 'user-1', 'journey-destination');
const PILOT_HASH = hash('server-pilot-approval'),
  OLD_REPAIR_HASH = hash('server-expired-repair-approval'),
  FRESH_REPAIR_HASH = hash('server-refreshed-repair-approval');
// Explicit offline captures; these do not certify any provider or image quality.
const REVIEW_SCENARIO = {directionsLanguage: 'en', outputLocale: 'ru', targetSeconds: 5, aspectRatio: '9:16',
  firstFrameDirections: 'Retained first visual direction.', lastFrameDirections: 'Retained last visual direction.',
  motionDirections: 'Retained five-second camera move.', screenText: 'Точный текст', spokenText: '', captions: ['Точная подпись'],
  claims: [], unknownFacts: [], rightsConflicts: []};
const REVIEW_FRAMES = ['first', 'last'].map(slot => ({slot, ownedMediaId: `offline-owned-${slot}`,
  byteSha256: hash(`offline-owned-${slot}-bytes`), path: `/uploads/offline-owned-${slot}.png`}));
const REFERENCE_HASH = hash({source: SOURCE, scenario: REVIEW_SCENARIO, frames: REVIEW_FRAMES});
const manifest = () => ({
  version: 3,
  kind: 'local_owned_composition',
  source: {
    pieceId: IDS.piece,
    revision: SOURCE.revision,
    textSha256: hash(PIECE.body),
  },
  title: 'Offline owned composition',
  locale: 'en',
  funding: { kind: 'local_compute', scope: 'final_only' },
  settings: {
    width: 1080,
    height: 1920,
    fps: 30,
    fit: 'contain_pad',
    transition: 'hard_cut',
    captions: 'none',
  },
  scenes: [
    {
      id: 'one',
      mediaId: 'already-owned-clip',
      durationSeconds: 2,
      sourceAudio: 'silent',
    },
  ],
});
const journeyRows = () => ({
  nativeJourney: {
    records: [],
    pilots: [],
    pendingReviews: [],
    localDispatch: [],
    providerCalls: 0,
    modelCalls: 0,
    renderCalls: 0,
    launchIntents: [],
    repairIntents: [],
    sourceRefusals: [],
    originalAssets: ['already-owned-first', 'already-owned-rejected-last'],
    source: {},
  },
});
const reviewJourneyRows = (visionNeedsRecovery = false) => ({...journeyRows(),
  pieces: [{id: IDS.piece, code: 'native-owned-source', title: PIECE.title, body: PIECE.body}],
  nativeJourney: {...journeyRows().nativeJourney, reviewV2: true, visionNeedsRecovery},
});
const selectedPilot = pilotId => ({version: 'assistant-work-context/v1', kind: 'piece', id: IDS.piece, clipPilotId: pilotId});
const summary = (turn, tool) =>
  turn.outputs.find((r) => r.toolName === tool)?.output.summary?.untrustedData
    ?.value;

function nativeJourneyServices({ rows, requests, writes, scoped }) {
  if (!rows.nativeJourney) return {};
  const data = rows.nativeJourney,
    f = fixture();
  for (const table of Object.values(f.tables)) table.clear();
  Object.assign(f.ids, {
    org: 'org-1',
    actor: 'user-1',
    piece: IDS.piece,
    adaptation: IDS.adaptation,
  });
  f.tables.user.set('user-1', { id: 'user-1', activated: true });
  f.tables.userOrganization.set('member', {
    id: 'member',
    organizationId: 'org-1',
    userId: 'user-1',
    role: 'EDITOR',
    disabled: false,
    updatedAt: STAMP,
  });
  f.tables.contentPiece.set(IDS.piece, copy(PIECE));
  f.tables.contentDerivation.set(IDS.adaptation, copy(ADAPTATION));
  f.tables.contentPiece.set('foreign-source', {
    ...copy(PIECE),
    id: 'foreign-source',
    organizationId: 'org-foreign',
  });
  f.tables.socialFactoryRecord.set(IDS.sourceDraft, {
    organizationId: 'org-1',
    kind: 'draft_destination',
    id: IDS.sourceDraft,
    revision: 1,
    deletedAt: null,
    invalidatedAt: null,
    expiresAt: null,
    updatedAt: STAMP,
    payload: {
      version: 1,
      id: IDS.sourceDraft,
      kind: 'draft',
      publishable: false,
      actorId: 'user-1',
      platform: 'instagram',
      locale: 'en',
      name: 'Owned draft',
      requestDigest: hash('draft'),
    },
  });
  const sync = () => {
    data.source = {
      piece: copy(f.tables.contentPiece.get(IDS.piece)),
      adaptation: copy(f.tables.contentDerivation.get(IDS.adaptation)),
      nativeReceipts: [...f.tables.socialFactoryRecord.values()]
        .filter((r) => r.kind === 'action')
        .map(copy),
      integrations: f.tables.integration.size,
      posts: f.tables.post.size,
    };
  };
  sync();
  const call = (name, org, actor, thread, ...args) => {
    scoped(name, org);
    if (actor !== null && actor !== 'user-1') fail('SCENARIO_ACTOR_SCOPE');
    requests.push([name, org, actor, thread, ...copy(args)]);
  };
  const sourceRefusal = (org, actor, input, error) => {
    data.sourceRefusals.push({
      organizationId: org,
      actorId: actor,
      input: copy(input),
      code:
        error.getResponse?.()?.code ?? error.code ?? 'UNNAMED_FIXTURE_ERROR',
    });
    throw error;
  };
  const sourceService = {
    resolve: async (org, actor, input) => {
      call('journey.source.resolve', org, actor, null, input);
      try {
        return await f.service.resolve(org, actor, input);
      } catch (error) {
        sourceRefusal(org, actor, input, error);
      }
    },
    editDraft: async (org, actor, input) => {
      call('journey.source.edit', org, actor, null, input);
      const before = [...f.tables.socialFactoryRecord.values()].filter(
        (r) => r.kind === 'action'
      ).length;
      try {
        const out = await f.service.editDraft(org, actor, input);
        sync();
        if (data.source.nativeReceipts.length > before)
          writes.push([
            'journey.source.edited',
            out.ref.adaptationId,
            out.text,
          ]);
        if (data.loseSourceReplyAfterCommit) {
          data.lostSourceReplies = (data.lostSourceReplies ?? 0) + 1;
          throw new Error('PRIVATE_LOST_SOURCE_REPLY');
        }
        return out;
      } catch (error) {
        sourceRefusal(org, actor, input, error);
      } finally {
        sync();
      }
    },
  };
  const store = {
    async transact(work) {
      const before = copy(data.records);
      try {
        return await work(store);
      } catch (e) {
        data.records = before;
        throw e;
      }
    },
    async read(org, kind, id) {
      return copy(
        data.records.find(
          (r) => r.organizationId === org && r.kind === kind && r.id === id
        ) ?? null
      );
    },
    async put(x) {
      const index = data.records.findIndex(
          (r) =>
            r.organizationId === x.organizationId &&
            r.kind === x.kind &&
            r.id === x.id
        ),
        old = data.records[index];
      if ((old?.revision ?? 0) !== x.expectedRevision)
        fail('SOCIAL_FACTORY_CONFLICT');
      const row = {
        ...copy(x),
        revision: x.expectedRevision + 1,
        parentId: x.parentId ?? null,
        sourceIds: x.sourceIds ?? [],
      };
      delete row.expectedRevision;
      if (index < 0) data.records.push(row);
      else data.records[index] = row;
      return copy(row);
    },
    async assertSourceAdmissions() {},
    async assertArtifactSource(org, actor, ref) {
      await f.service.resolve(org, actor, ref);
    },
  };
  const drafts = new DraftDestinationServiceV1(store);
  let initialized;
  const init = () =>
    (initialized ||= (async () => {
      const source = await f.service.resolve('org-1', 'user-1', SOURCE);
      const material = {
        version: 1,
        channelId: IDS.sourceDraft,
        platform: 'instagram',
        format: 'reel',
        destination: { kind: 'draft', id: IDS.sourceDraft, publishable: false },
        title: 'Saved source-bound local draft',
        hook: 'Synthetic',
        body: PIECE.body,
        script: 'Owned local screen copy',
        caption: 'Synthetic',
        assets: [],
        settings: {},
        evidence: [],
        sourceArtifact: source.ref,
      };
      await store.put({
        organizationId: 'org-1',
        kind: 'campaign',
        id: IDS.campaign,
        expectedRevision: 0,
        payload: {
          version: 1,
          id: IDS.campaign,
          state: 'active',
          mode: 'collaborative',
        },
      });
      await store.put({
        organizationId: 'org-1',
        kind: 'campaign_item',
        id: IDS.item,
        parentId: IDS.campaign,
        expectedRevision: 0,
        payload: {
          version: 1,
          id: IDS.item,
          campaignId: IDS.campaign,
          channelId: IDS.sourceDraft,
          platform: 'instagram',
          format: 'reel',
          state: 'needs_input',
          contentRevision: 1,
          scheduledAt: '2100-01-01T12:00:00.000Z',
          material,
        },
      });
      await store.put({
        organizationId: 'org-1',
        kind: 'editorial',
        id: IDS.operation,
        parentId: IDS.campaign,
        expectedRevision: 0,
        payload: {
          version: 2,
          id: IDS.operation,
          campaignId: IDS.campaign,
          itemId: IDS.item,
          state: 'needs_video',
          sourceContentRevision: 1,
          baseInput: { actorId: 'user-1', sourceArtifact: source },
          campaignAuthority: { mode: 'collaborative' },
          sourceAdmissions: [],
          material,
        },
      });
    })());
  const local = new LocalCompositionOperationV2(
    store,
    {
      produce: async () => {
        data.renderCalls++;
        fail('SCENARIO_RENDER_NOT_AUTHORIZED');
      },
    },
    {
      material: (op) => copy(op.material),
      current: async (org, op, s = store) => {
        await f.service.assertCurrent(
          org,
          'user-1',
          op.baseInput.sourceArtifact
        );
        const item = (await s.read(org, 'campaign_item', IDS.item)).payload;
        if (
          item.contentRevision !==
          (op.appliedContentRevision ?? op.sourceContentRevision)
        )
          fail('CAMPAIGN_PRODUCTION_CONTENT_CHANGED');
        return {
          campaign: (await s.read(org, 'campaign', IDS.campaign)).payload,
          item,
        };
      },
      preflight: async () => {},
      sourceProduction: async () => undefined,
      inspect: async () => fail('SCENARIO_RENDER_NOT_AUTHORIZED'),
      apply: async () => fail('SCENARIO_RENDER_NOT_AUTHORIZED'),
    },
    {
      start: async (org, op, id) => {
        data.localDispatch.push({
          organizationId: org,
          operationId: op,
          compositionId: id,
        });
        writes.push(['journey.local.queued', id]);
      },
    }
  );
  const detail = async (org, id, actor) => {
    call('journey.campaign.open', org, actor ?? null, null, id);
    await init();
    if (id !== IDS.campaign) fail('CAMPAIGN_NOT_FOUND');
    return {
      campaign: (await store.read(org, 'campaign', id)).payload,
      items: [(await store.read(org, 'campaign_item', IDS.item)).payload],
    };
  };
  const production = {
    get: async (org, id) => {
      call('journey.operation.open', org, null, null, id);
      await init();
      const row = await store.read(org, 'editorial', id);
      if (!row) fail('CAMPAIGN_PRODUCTION_MISSING');
      return copy(row.payload);
    },
    renderLocal: async (org, actor, input) => {
      call('journey.local.render', org, actor, null, input);
      await init();
      await f.service.resolve(org, actor, SOURCE);
      fail('LOCAL_REEL_UNAVAILABLE');
    },
    composeLocalVideoV2: async (org, actor, input) => {
      call('journey.local.compose', org, actor, null, input);
      await init();
      return local.start(org, actor, input);
    },
    localVideoCompositionV2: async (org, actor, op, id) => {
      call('journey.local.open', org, actor, null, op, id);
      await init();
      return local.open(org, actor, op, id);
    },
    stopLocalVideoCompositionV2: async (org, actor, op, id) => {
      call('journey.local.stop', org, actor, null, op, id);
      await init();
      return local.stop(org, actor, op, id);
    },
  };
  const parent = (org, actor, thread, id) => {
    if (id === 'foreign-pilot') fail('CLIP_PREPRODUCTION_ACCESS_DENIED');
    const found = data.pilots.find((p) => p.id === id);
    if (!found) fail('CLIP_PREPRODUCTION_NOT_FOUND');
    if (
      found.organizationId !== org ||
      found.actorId !== actor ||
      (found.threadId && found.threadId !== thread)
    )
      fail('CLIP_PREPRODUCTION_ACCESS_DENIED');
    found.threadId ??= thread;
    return found;
  };
  const quote = {
    amount: '2',
    unit: 'higgsfield_credit',
    source: 'synthetic_offline_fixture',
  };
  const view = (p) => ({
    pilotId: p.id,
    pieceId: IDS.piece,
    threadId: p.threadId,
    state: p.textState ?? 'reviewed',
    sourceArtifact: SOURCE,
    sourceCurrent: true,
    independentReviewAccepted: p.reviewedText ?? p.id !== IDS.text,
    contentOperations: 0,
    reviewCount: 0,
    scenario: p.scenario ? copy(p.scenario) : null,
    ...(p.revisionV2 ? {revisionV2: copy(p.revisionV2)} : {}),
    ...(p.executionMode ? {executionModeV2: {version: 2, mode: p.executionMode, canChange: !p.prepared}} : {}),
    blocker: p.textState === 'needs_input' ? 'OFFLINE_MODEL_BOUNDARY' : undefined,
    production: p.prepared
      ? {
          version: 1,
          outputLocale: 'ru',
          stages: p.reviewPair ? p.reviewPair.map(frame => ({stage: frame.slot === 'first' ? 'first_frame' : 'last_frame', state: 'saved', result: copy(frame)})) : p.queued
            ? [
                {
                  stage: 'first_frame',
                  state: 'queued',
                  recoveryActions: ['status_read'],
                },
              ]
            : [],
          visionReview: p.visionCapture ? {state: p.visionRecovered ? 'reviewed' : 'needs_input', current: true,
            evidenceOrigin: 'offline_fixture', verdict: p.visionRecovered ? 'accept' : null} : null,
          ...(p.executionMode === 'review' ? {executionV2: {version: 2, mode: 'review', referenceApproval: {
            state: p.clipIntent ? 'approved' : p.visionRecovered ? 'awaiting_approval' : 'not_ready',
            referenceDigest: p.visionRecovered ? REFERENCE_HASH : null, canApprove: !!p.visionRecovered && !p.clipIntent && !p.stopped,
          }}} : {}),
          authorization: {
            state: p.cap ? 'authorized' : 'missing',
            unit: 'higgsfield_credit',
            pilotLimit: p.cap ?? null,
            includedStages: ['first_frame', 'last_frame', 'clip'],
            executionApproved: !!p.approved,
            ...(p.delegated
              ? {
                  limitSource: 'owner_delegated_necessary_one_pilot',
                  capBasis: {
                    rule: 'ceil_125pct_two_first_plus_planning_clip/v1',
                    firstFrameQuotedCredits: '2',
                    estimatedLastFrameCredits: '2',
                    clipPlanningQuotedCredits: '3',
                    lastFrameTerm: 'estimate',
                    bufferPercent: 25,
                  },
                }
              : {}),
          },
          executionApproval: {
            scope: 'one_pilot',
            current: !p.stopped,
            canApprove: !!p.cap && !p.approved && !p.stopped,
            approved: !!p.approved,
            preflightId: IDS.preflight,
            approvalHash: PILOT_HASH,
            bindingHash: hash('fixture-binding'),
            includedStages: ['first_frame', 'last_frame', 'clip'],
            laterPricesUnknown: true,
            providerBillingCap: false,
          },
          blockers: p.stopped ? ['CLIP_STOPPED'] : [],
          ...(p.repair
            ? {
                lastFrameRepair: {
                  id: IDS.repair,
                  current: true,
                  state: p.repair.queued ? 'queued' : 'quoted',
                  reason: 'Correct only the rejected last-frame copy.',
                  approved: !!p.repair.queued,
                  canApprove: !p.repair.expired && !p.repair.queued,
                  preflightId: IDS.repairPreflight,
                  approvalHash: p.repair.hash,
                  quote,
                  remaining: '6',
                },
              }
            : {}),
        }
      : undefined,
  });
  for (const id of [IDS.manual, IDS.delegated, IDS.repairPilot])
    data.pilots.push({
      id,
      organizationId: 'org-1',
      actorId: 'user-1',
      originalRequest: {
        messageId: 'saved-creative-brief',
        text: 'Retained synthetic scenario',
      },
      originalSource: copy(SOURCE),
      prepared: id === IDS.repairPilot,
      cap: id === IDS.repairPilot ? '10' : undefined,
      approved: id === IDS.repairPilot,
      oldFrames: copy(data.originalAssets),
    });
  if (data.reviewV2) {
    const result = {inputDigest: hash('offline-vision-input'), sourceContentDigest: hash(PIECE.body), scenarioDigest: hash(REVIEW_SCENARIO),
      acceptedTextReviewDigest: hash('offline-text-review'), frameDigests: REVIEW_FRAMES.map(({slot,byteSha256})=>({slot,byteSha256})), verdict: 'accept', findings: []};
    data.pilots.push({id: IDS.reviewPilot, organizationId: 'org-1', actorId: 'user-1', originalSource: copy(SOURCE),
      originalRequest: {messageId: 'saved-review-brief', text: 'Retained source-bound scenario'}, scenario: copy(REVIEW_SCENARIO),
      executionMode: 'review', prepared: true, cap: '10', approved: true, oldFrames: copy(data.originalAssets), reviewPair: copy(REVIEW_FRAMES),
      visionRecovered: !data.visionNeedsRecovery,
      visionCapture: {raw: '```json\n'+JSON.stringify(result)+'\n```', bindings: result, selectedModel: 'offline-reviewer', actualModel: 'offline-reviewer',
        authorModel: 'offline-author', evidenceOrigin: 'offline_fixture', usageReceipt: {id: 'retained-offline-review', status: 'failed'}},
    });
  }
  const check = async (name, org, actor, thread, id, ...args) => {
    call(name, org, actor, thread, id, ...args);
    await f.service.resolve(org, actor, SOURCE);
    return parent(org, actor, thread, id);
  };
  const prep = {
    reviseV2: async (org, actor, thread, request, raw) => {
      const input = clipRevisionInputV2.parse(raw), p = await check('journey.clip.revise', org, actor, thread, input.pilotId, request, input);
      if (request.messageId !== input.requestMessageId || request.messageId === p.originalRequest.messageId || !request.text.trim()) fail('CLIP_NEW_REVISION_REQUEST_REQUIRED');
      if (!p.scenario || p.activeOperation) fail('CLIP_PREVIOUS_OPERATION_UNKNOWN');
      let child = data.pilots.find(one => one.id === IDS.revision);
      if (child) {
        if (child.originalRequest.messageId !== request.messageId || child.originalRequest.text !== request.text) fail('CLIP_REVISION_REQUEST_CHANGED');
        return view(child);
      }
      data.parentBeforeRevision = copy(p);
      child = {id: IDS.revision, organizationId: org, actorId: actor, threadId: thread, originalSource: copy(p.originalSource),
        originalRequest: copy(request), executionMode: 'review', textState: 'needs_input', reviewedText: false,
        revisionContext: {originalRequest: copy(p.originalRequest), previousScenario: copy(p.scenario)},
        revisionV2: {version: 2, parentPilotId: p.id, scope: input.scope, newImagePair: true},
        scenario: {...copy(p.scenario), firstFrameDirections: 'New offline direction for BOTH images; not generated.', lastFrameDirections: 'New offline end direction; exact public copy retained.'}};
      data.pilots.push(child); writes.push(['journey.clip.revision-checkpoint', child.id]);
      return view(child);
    },
    prepare: async (org, actor, thread, request, input) => {
      call('journey.clip.text.prepare', org, actor, thread, request, input);
      if (request.messageId !== input.requestMessageId || !request.text.trim())
        fail('CLIP_ORIGINAL_REQUEST_REQUIRED');
      await f.service.resolve(org, actor, input.sourceArtifact);
      let p = data.pilots.find((x) => x.id === IDS.text);
      if (!p) {
        p = {
          id: IDS.text,
          organizationId: org,
          actorId: actor,
          threadId: thread,
          originalRequest: copy(request),
          originalSource: copy(input.sourceArtifact),
          textState: 'needs_input',
          capturedAuthor:
            'Previously captured synthetic author text; no current generation.',
        };
        data.pilots.push(p);
        writes.push(['journey.clip.text.checkpoint', p.id]);
      }
      return view(p);
    },
    open: async (org, actor, thread, id) =>
      view(await check('journey.clip.open', org, actor, thread, id)),
    resumeReview: async (org, actor, thread, id) => {
      const p = await check(
        'journey.clip.review.resume',
        org,
        actor,
        thread,
        id
      );
      if (!p.capturedAuthor) fail('CLIP_PREPRODUCTION_NOT_FOUND');
      data.pendingReviews.push({
        pilotId: id,
        capturedAuthor: p.capturedAuthor,
      });
      fail('OFFLINE_MODEL_BOUNDARY');
    },
  };
  const pilots = {
    referenceApprovalV2: async (org, actor, raw) => {
      const input = clipReferenceLaunchV2.parse(raw), p = parent(org, actor, data.pilots.find(one => one.id === input.pilotId)?.threadId, input.pilotId);
      call('journey.references.approval', org, actor, p.threadId, input);
      await f.service.resolve(org, actor, p.originalSource);
      if (p.executionMode !== 'review' || !p.visionRecovered || p.stopped || !p.cap || input.referenceDigest !== REFERENCE_HASH || hash({source:p.originalSource,scenario:p.scenario,frames:p.reviewPair}) !== input.referenceDigest)
        fail('CLIP_REFERENCE_APPROVAL_CHANGED');
      return {version: 2, pilotId: p.id, mode: 'review', sourceArtifact: copy(p.originalSource), scenario: copy(p.scenario), frames: copy(p.reviewPair),
        referenceDigest: REFERENCE_HASH, quote: null, priceCheckedAfterApproval: true, maximumVideos: 1, authorization: view(p).production.authorization};
    },
    launchReviewedClipV2: async (org, actor, thread, input) => {
      const p = await check('journey.references.launch', org, actor, thread, input.pilotId, input);
      await pilots.referenceApprovalV2(org, actor, input);
      if (!p.clipIntent) {p.clipIntent = true; data.launchIntents.push(p.id); writes.push(['journey.references.local-clip-intent', p.id]);}
      return view(p);
    },
    recoverVisionFencedV1: async (org, actor, thread, request, input) => {
      const p = await check('journey.vision.recover-fenced', org, actor, thread, input.pilotId, request);
      const saved = p.visionCapture;
      if (!saved || !request.messageId || !request.text.trim()) fail('CLIP_VISION_RECOVERY_INELIGIBLE');
      data.visionBefore ??= copy(saved);
      if (p.visionRecovery && p.visionRecovery.messageId !== request.messageId) fail('CLIP_VISION_RECOVERY_CONFLICT');
      const fenced = /^```json\s*\n([\s\S]*?)\n```$/i.exec(saved.raw.trim());
      if (!fenced) fail('CLIP_VISION_RECOVERY_INELIGIBLE');
      const result = clipVisionVerdictV1.parse(JSON.parse(fenced[1]));
      if (saved.selectedModel !== saved.actualModel || saved.actualModel === saved.authorModel ||
          hash(result) !== hash(saved.bindings) || hash(result.frameDigests) !== hash(p.reviewPair.map(({slot,byteSha256})=>({slot,byteSha256}))) ||
          result.sourceContentDigest !== hash(PIECE.body) || result.scenarioDigest !== hash(p.scenario)) fail('CLIP_VISION_BINDING_CHANGED');
      if (p.visionRecovery && (p.visionRecovery.messageId !== request.messageId || p.visionRecovery.rawSha256 !== hash(saved.raw))) fail('CLIP_VISION_RECOVERY_CONFLICT');
      p.visionRecovery ??= {messageId: request.messageId, text: request.text, rawSha256: hash(saved.raw)};
      p.visionRecovered = true; data.visionRecoveryReads = (data.visionRecoveryReads ?? 0) + 1;
      return view(p);
    },
    credentialRenewalApproval: async(org,actor,input,thread) => {
      const p=await check('journey.credentials.approval',org,actor,thread,input.pilotId);
      return {pilotId:p.id,threadId:thread,scope:'same_oauth_grant_only',quote:false,generation:false};
    },
    renewCredentialsV2: async(org,actor,thread,request,input) => {
      const p=await check('journey.credentials.renew',org,actor,thread,input.pilotId,request);
      data.renewalRequests??=[];data.renewalRequests.push({pilotId:p.id,request:copy(request)});
      return {...view(p),production:{...view(p).production,credentialRenewal:{state:'completed',requiresFreshQuote:true}}};
    },
    prepare: async (org, actor, thread, request, input, mode) => {
      const p = await check(
        'journey.pilot.prepare',
        org,
        actor,
        thread,
        input.pilotId,
        request,
        mode ?? 'owner_entered'
      );
      if (
        request.messageId === p.originalRequest.messageId ||
        !request.text.trim()
      )
        fail('CLIP_NEW_PRODUCTION_REQUEST_REQUIRED');
      p.prepared = true;
      p.productionRequest = copy(request);
      if (mode === 'delegated_quote_bound') {
        p.delegated = true;
        p.cap = '9';
      }
      writes.push(['journey.pilot.prepared', p.id, mode ?? 'owner_entered']);
      return view(p);
    },
    open: prep.open,
    budgetQuestion: async (org, actor, thread, id, toolCallId, language) => {
      const p = await check(
        'journey.pilot.budget.question',
        org,
        actor,
        thread,
        id,
        toolCallId,
        language
      );
      if (!p.prepared) fail('CLIP_PRODUCTION_NOT_PREPARED');
      p.budgetTool = toolCallId;
      p.question = {
        question:
          'Какой общий лимит кредитов разрешён для этого учебного пилота?',
        options: [],
        questionPurpose: 'fact',
        canDecideForPerson: false,
      };
      return copy(p.question);
    },
    answerBudget: async (
      org,
      actor,
      thread,
      id,
      toolCallId,
      payload,
      answer
    ) => {
      const p = await check(
        'journey.pilot.budget.answer',
        org,
        actor,
        thread,
        id,
        toolCallId,
        payload,
        answer
      );
      if (
        p.budgetTool !== toolCallId ||
        JSON.stringify(payload) !== JSON.stringify(p.question)
      )
        fail('CLIP_PILOT_BUDGET_STALE');
      p.cap = clipProductionBudgetAnswerV1.parse(answer).answer;
      writes.push(['journey.pilot.budget', id, p.cap]);
      return view(p);
    },
    approval: async (org, actor, input) => {
      const p = parent(
        org,
        actor,
        data.pilots.find((p) => p.id === input.pilotId)?.threadId,
        input.pilotId
      );
      call('journey.pilot.approval', org, actor, p.threadId, input);
      if (
        !p.cap ||
        input.preflightId !== IDS.preflight ||
        input.approvalHash !== PILOT_HASH
      )
        fail('CLIP_PILOT_APPROVAL_CHANGED');
      return {
        ...view(p),
        executionApproval: view(p).production.executionApproval,
        authorization: view(p).production.authorization,
        firstQuote: quote,
        videoResolution: '720p',
        imageSettings: { resolution: '1k' },
      };
    },
    launch: async (org, actor, thread, input) => {
      const p = await check(
        'journey.pilot.launch',
        org,
        actor,
        thread,
        input.pilotId,
        input
      );
      if (
        !p.cap ||
        p.stopped ||
        input.preflightId !== IDS.preflight ||
        input.approvalHash !== PILOT_HASH
      )
        fail('CLIP_PILOT_APPROVAL_CHANGED');
      if (!p.queued) {
        p.approved = true;
        p.queued = true;
        data.launchIntents.push(p.id);
        writes.push(['journey.pilot.queued', p.id]);
      }
      return view(p);
    },
    recover: async (org, actor, thread, id, stage, action) => {
      const p = await check(
        'journey.pilot.recover',
        org,
        actor,
        thread,
        id,
        stage,
        action
      );
      if (!p.queued || stage !== 'first_frame' || action !== 'status_read')
        fail('CLIP_STAGE_RECOVERY_UNAVAILABLE');
      p.recoveryReads = (p.recoveryReads ?? 0) + 1;
      return view(p);
    },
    stop: async (org, actor, thread, id, messageId) => {
      const p = await check(
        'journey.pilot.stop',
        org,
        actor,
        thread,
        id,
        messageId
      );
      p.stopped = true;
      writes.push(['journey.pilot.stopped', id]);
      return view(p);
    },
    prepareLastFrameRepair: async (org, actor, thread, request, input) => {
      const p = await check(
        'journey.repair.prepare',
        org,
        actor,
        thread,
        input.pilotId,
        request
      );
      if (
        p.id !== IDS.repairPilot ||
        request.messageId === p.originalRequest.messageId
      )
        fail('CLIP_NEW_REPAIR_REQUEST_REQUIRED');
      p.repair ??= {
        request: copy(request),
        expired: true,
        hash: OLD_REPAIR_HASH,
        previousHash: OLD_REPAIR_HASH,
        oldFrames: copy(p.oldFrames),
      };
      writes.push(['journey.repair.prepared', p.id]);
      return view(p);
    },
    refreshLastFrameRepairQuote: async (org, actor, thread, request, input) => {
      const p = await check(
        'journey.repair.refresh',
        org,
        actor,
        thread,
        input.pilotId,
        request,
        input
      );
      if (
        input.repairId !== IDS.repair ||
        !p.repair ||
        !p.repair.expired ||
        p.repair.queued ||
        request.messageId === p.repair.request.messageId
      )
        fail('CLIP_REPAIR_QUOTE_REFRESH_UNAVAILABLE');
      p.repair.refreshRequest = copy(request);
      p.repair.expired = false;
      p.repair.hash = FRESH_REPAIR_HASH;
      writes.push(['journey.repair.quote-refreshed', p.id]);
      return view(p);
    },
    lastFrameRepairApproval: async (org, actor, input) => {
      const p = parent(
        org,
        actor,
        data.pilots.find((p) => p.id === input.pilotId)?.threadId,
        input.pilotId
      );
      call('journey.repair.approval', org, actor, p.threadId, input);
      if (
        !p.repair ||
        p.repair.expired ||
        input.repairId !== IDS.repair ||
        input.preflightId !== IDS.repairPreflight ||
        input.approvalHash !== p.repair.hash
      )
        fail('CLIP_REPAIR_APPROVAL_CHANGED');
      return {
        ...view(p),
        quote,
        ownerLimit: { remaining: '6', pilotLimit: p.cap },
        repairId: IDS.repair,
      };
    },
    launchLastFrameRepair: async (org, actor, thread, input) => {
      const p = await check(
        'journey.repair.launch',
        org,
        actor,
        thread,
        input.pilotId,
        input
      );
      if (
        !p.repair ||
        p.stopped ||
        p.repair.expired ||
        input.repairId !== IDS.repair ||
        input.preflightId !== IDS.repairPreflight ||
        input.approvalHash !== p.repair.hash
      )
        fail('CLIP_REPAIR_APPROVAL_CHANGED');
      if (!p.repair.queued) {
        p.repair.queued = true;
        data.repairIntents.push(IDS.repair);
        writes.push(['journey.repair.queued', IDS.repair]);
      }
      return view(p);
    },
  };
  return {
    SourceArtifactServiceV1: sourceService,
    DraftDestinationServiceV1: {
      create: async (org, actor, input) => {
        call('journey.destination.create', org, actor, null, input);
        return drafts.create(org, actor, input);
      },
    },
    SocialFactoryService: { detail },
    SocialFactoryProductionService: production,
    NativeClipPreproductionServiceV1: prep,
    NativeClipProductionServiceV1: pilots,
  };
}
module.exports = {
  IDS,
  SOURCE,
  DRAFT_SOURCE,
  COMPOSITION,
  DESTINATION,
  PILOT_HASH,
  OLD_REPAIR_HASH,
  FRESH_REPAIR_HASH,
  PIECE,
  ADAPTATION,
  manifest,
  journeyRows,
  reviewJourneyRows,
  selectedPilot,
  REVIEW_SCENARIO,
  REVIEW_FRAMES,
  REFERENCE_HASH,
  summary,
  nativeJourneyServices,
};
