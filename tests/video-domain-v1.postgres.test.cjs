const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const fixture = require('./helpers/video-domain-v1.fixture.cjs');

const databaseUrl = process.env.CF_VIDEO_DATABASE_URL;
if (databaseUrl) fixture.assertDisposableDatabaseV1(databaseUrl);
const domain = databaseUrl ? describe : describe.skip;
const responseCode = (code) => (error) => error?.getResponse?.()?.code === code;
const rejectsCode = async (promise, code) => {
  let error;
  try { await promise; } catch (caught) { error = caught; }
  expect(error).toBeDefined();
  expect(error?.getResponse?.()?.code).toBe(code);
};
const withFixture = async (options, run) => {
  const context = await fixture.create(databaseUrl, options);
  try { return await run(context); } finally { await context.close(); }
};

// Refusal happens before a PrismaClient or connection can be created.
test('real video fixtures refuse every unmarked, remote, redirected or different database target', () => {
  const marker = process.env.CF_VIDEO_DATABASE_DISPOSABLE;
  try {
    process.env.CF_VIDEO_DATABASE_DISPOSABLE = '1';
    for (const url of [
      'postgresql://u:p@production.invalid/cf_video_v1_test',
      'postgresql://u:p@127.0.0.1/content_factory',
      'postgresql://u:p@127.0.0.1/cf_video_v1_test?host=production.invalid',
      'postgresql://u:p@127.0.0.1/cf_video_v1_test?hostaddr=10.0.0.1',
      'postgresql://u:p@127.0.0.1/cf_video_v1_test?schema=foreign',
      'postgresql://u:p@127.0.0.1/cf_video_v1_test#target',
    ]) expect(() => fixture.assertDisposableDatabaseV1(url)).toThrow();
    process.env.CF_VIDEO_DATABASE_DISPOSABLE = '0';
    expect(() => fixture.assertDisposableDatabaseV1('postgresql://u:p@127.0.0.1/cf_video_v1_test')).toThrow();
  } finally {
    if (marker === undefined) delete process.env.CF_VIDEO_DATABASE_DISPOSABLE;
    else process.env.CF_VIDEO_DATABASE_DISPOSABLE = marker;
  }
});

domain('Video V1 real Prisma domain integration (isolated PostgreSQL; synthetic paid transport)', () => {
  jest.setTimeout(30_000);

  test('prepare/save/reopen preserves source revision, sourced date/decimal/negation and selected output locale', () =>
    withFixture({ textKey: true }, async (f) => {
      const original = await f.db.contentPiece.findUnique({ where: { id: f.pieceId } });
      const draft = await f.prepare({ prepareWithAi: true, settings: { ...f.clipSettings, locale: 'ru-RU' } });
      expect(draft.brief).toMatchObject({
        sourceLocale: 'ru', outputLocale: 'ru-RU', scriptPolicy: 'exact',
        script: fixture.SOURCE_TEXT,
        facts: [{ text: fixture.SOURCE_TEXT, sourceId: `evidence-${f.pieceId}`, policy: 'must_include' }],
      });
      expect(draft.brief.prompt).toContain('22.10.2026');
      expect(draft.brief.prompt).toContain('12,5');
      expect(draft.brief.prompt).toContain('не содержит');
      const reopened = await f.restart().readDraft(f.org.id, draft.id);
      expect(reopened).toEqual(draft);
      expect(reopened.pieceRevision).toMatch(/^[a-f0-9]{64}$/);
      expect(await f.db.contentPiece.findUnique({ where: { id: f.pieceId } })).toEqual(original);
      expect(f.transport.textCalls).toHaveLength(1);
      expect(f.transport.textCalls[0].messages[0].content).toContain('SOURCE DATA');
      expect(await f.db.aiUsageRecord.count({ where: { organizationId: f.org.id, operation: 'text_generation' } })).toBe(1);
      expect(f.transport.submits).toHaveLength(0);
    }));

  test('optimistic edits invalidate preflight; concurrent stale edits never overwrite the winner', () =>
    withFixture({}, async (f) => {
      const { draft, preflight, launch } = await f.ready();
      const edits = await Promise.allSettled([
        f.service.updateDraft(f.org.id, f.user.id, draft.id, { version: draft.version, prompt: `${draft.brief.prompt}\nПлавное движение камеры.` }),
        f.service.updateDraft(f.org.id, f.user.id, draft.id, { version: draft.version, prompt: `${draft.brief.prompt}\nСтатичная камера.` }),
      ]);
      expect(edits.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(edits.filter((r) => r.status === 'rejected').every((r) => responseCode('VIDEO_DRAFT_CHANGED')(r.reason))).toBe(true);
      const saved = await f.service.readDraft(f.org.id, draft.id);
      expect(saved.version).toBe(draft.version + 1);
      expect(saved.preflightId).toBeNull();
      await rejectsCode(f.service.getPreflight(f.org.id, f.user.id, draft.id, preflight.preflightId), 'VIDEO_PREFLIGHT_STALE');
      await rejectsCode(f.service.launch(f.org.id, f.user.id, launch), 'VIDEO_DRAFT_CHANGED');
      expect(await f.db.videoGenerationJob.count({ where: { organizationId: f.org.id } })).toBe(0);
      expect(f.transport.submits).toHaveLength(0);
    }));

  test('preparing a new variant preserves saved fact choices and forbidden implications without changing the source draft', () =>
    withFixture({textKey: true}, async f => {
      const draft = await f.prepare();
      const saved = await f.service.updateDraft(f.org.id, f.user.id, draft.id, {version: draft.version, brief: {...draft.brief,
        avoidImplications: ['Не обещать медицинский эффект.'], facts: draft.brief.facts.map(fact => ({...fact, policy: 'context_only'})),
      }});
      const variant = await f.service.prepare(f.org.id, f.user.id, {pieceId: f.pieceId, settings: f.clipSettings,
        fromDraftId: saved.id, fromDraftVersion: saved.version, prepareWithAi: true});
      expect(variant.id).not.toBe(saved.id);
      expect(variant.brief.facts).toEqual(saved.brief.facts);
      expect(variant.brief.avoidImplications).toEqual(saved.brief.avoidImplications);
      expect(JSON.parse(f.transport.textCalls[0].messages[1].content).brief.avoidImplications).toEqual(saved.brief.avoidImplications);
      expect(await f.service.readDraft(f.org.id, saved.id)).toEqual(saved);
      expect(f.transport.submits).toHaveLength(0);
    }));

  test.each([false, true])('a short edited output remains saveable with a long untouched source fact (presenter=%s)', (presenter) =>
    withFixture({}, async f => {
      const body = 'Подтверждённый исходный текст. '.repeat(500);
      await f.db.contentPiece.update({where: {id: f.pieceId}, data: {body, brief: {}}});
      const draft = await f.prepare({presenter});
      const field = presenter ? 'script' : 'prompt';
      const saved = await f.service.updateDraft(f.org.id, f.user.id, draft.id, {
        version: draft.version, [field]: 'Подтверждённый исходный текст.',
      });
      expect(saved.brief.facts).toEqual(draft.brief.facts);
      expect(saved.brief.facts[0].text).toBe(body.trim());
      expect(saved.brief[presenter ? 'prompt' : 'script']).toBe(draft.brief[presenter ? 'prompt' : 'script']);
      const preflight = await f.service.preflight(f.org.id, f.user.id, saved.id);
      expect(preflight.brief[field]).toBe('Подтверждённый исходный текст.');
      await rejectsCode(f.service.updateDraft(f.org.id, f.user.id, saved.id, {
        version: saved.version, [field]: 'Новый длинный текст. '.repeat(1000),
      }), 'VIDEO_INVALID_INPUT');
      expect(f.transport.submits).toHaveLength(0);
    }));

  test('changed source and unsupported route/options stop before a provider submit', () =>
    withFixture({}, async (f) => {
      const accepted = await f.ready();
      await f.db.contentPiece.update({ where: { id: f.pieceId }, data: { title: 'Изменённый первоисточник' } });
      await rejectsCode(f.service.launch(f.org.id, f.user.id, accepted.launch), 'VIDEO_SOURCE_CHANGED');
      await rejectsCode(f.service.preflight(f.org.id, f.user.id, accepted.draft.id), 'VIDEO_SOURCE_CHANGED');
      const unsupported = await f.prepare({ settings: { ...f.clipSettings, captions: true } });
      let refusal;
      try { await f.service.preflight(f.org.id, f.user.id, unsupported.id); } catch (error) { refusal = error; }
      expect(refusal?.code).toBe('video_unsupported_audio_or_captions');
      const invalidNumbers = await f.prepare();
      await f.service.updateDraft(f.org.id, f.user.id, invalidNumbers.id, { version: invalidNumbers.version, prompt: 'Запуск 22.10.2026. Масса 13 кг. Продукт содержит сахар.' });
      await rejectsCode(f.service.preflight(f.org.id, f.user.id, invalidNumbers.id), 'VIDEO_REQUIRED_NUMBER_MISSING');
      const missingNegation = await f.prepare();
      await f.service.updateDraft(f.org.id, f.user.id, missingNegation.id, {
        version: missingNegation.version, prompt: 'Запуск 22.10.2026. Масса 12,5 кг. Продукт содержит сахар.',
      });
      await rejectsCode(f.service.preflight(f.org.id, f.user.id, missingNegation.id), 'VIDEO_REQUIRED_NEGATION_MISSING');
      expect(f.transport.submits).toHaveLength(0);
    }));

  test('missing video key and missing monetary policy submit nothing despite configured text settings', () =>
    withFixture({ textKey: true }, async (f) => {
      const draft = await f.prepare();
      await f.db.aiProviderSetting.update({ where: { organizationId: f.org.id }, data: { videoApiKeys: {} } });
      await rejectsCode(f.service.preflight(f.org.id, f.user.id, draft.id), 'VIDEO_KEY_NOT_CONFIGURED');
      await f.credentials.saveWorkspace(f.org.id, { videoApiKeys: { higgsfield: 'synthetic:restored' } });
      await f.db.aiProviderSetting.update({ where: { organizationId: f.org.id }, data: { videoSpendPolicy: {} } });
      await rejectsCode(f.service.preflight(f.org.id, f.user.id, draft.id), 'VIDEO_SPEND_POLICY_UNAVAILABLE');
      expect(f.transport.estimates).toHaveLength(0);
      expect(f.transport.submits).toHaveLength(0);
    }));

  test('cross-tenant drafts/jobs/references/read/cancel never disclose or invoke a provider', () =>
    withFixture({}, async (f) => {
      const ready = await f.ready();
      const job = await f.service.launch(f.org.id, f.user.id, ready.launch);
      await rejectsCode(f.service.readDraft(f.otherOrg.id, ready.draft.id), 'VIDEO_DRAFT_NOT_FOUND');
      await rejectsCode(f.service.get(f.otherOrg.id, job.id), 'VIDEO_JOB_NOT_FOUND');
      await rejectsCode(f.service.cancel(f.otherOrg.id, f.otherUser.id, job.id), 'VIDEO_JOB_NOT_FOUND');
      expect(await f.service.list(f.otherOrg.id)).toEqual([]);
      expect(await f.service.listDrafts(f.otherOrg.id)).toEqual([]);
      const ref = await f.db.media.create({ data: { organizationId: f.otherOrg.id, name: 'foreign-reference.png', path: 'https://93.184.216.34/reference.png', type: 'image' } });
      await rejectsCode(f.prepare({ referenceMediaIds: [ref.id] }), 'VIDEO_REFERENCE_NOT_FOUND');
      expect(f.transport.submits).toHaveLength(0);
      expect(f.transport.cancels).toHaveLength(0);
    }));

  test('concurrent same intent and same immutable preflight create one durable job and one submit', () =>
    withFixture({}, async (f) => {
      const ready = await f.ready();
      const results = await Promise.all([
        f.service.launch(f.org.id, f.user.id, ready.launch),
        f.service.launch(f.org.id, f.user.id, ready.launch),
        f.service.launch(f.org.id, f.user.id, { ...ready.launch, intentId: randomUUID() }),
      ]);
      expect(new Set(results.map((result) => result.id)).size).toBe(1);
      expect(await f.db.videoGenerationJob.count({ where: { organizationId: f.org.id } })).toBe(1);
      expect(f.transport.submits).toHaveLength(0);
      await Promise.all(results.map((result) => f.service.runStep(f.org.id, result.id)));
      expect(f.transport.submits).toHaveLength(1);
      expect(await f.db.aiUsageRecord.count({ where: { organizationId: f.org.id, operation: 'video_generation' } })).toBe(1);
    }));

  test('concurrent monetary reservations serialize; uncertainty retains its reservation and actual overspend blocks new launch', () =>
    withFixture({ maxCostUsd: 2, monthlyBudgetUsd: 3 }, async (f) => {
      const first = await f.ready(); const second = await f.ready();
      const results = await Promise.allSettled([
        f.service.launch(f.org.id, f.user.id, first.launch),
        f.service.launch(f.org.id, f.user.id, second.launch),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter((r) => r.status === 'rejected').every((r) => responseCode('VIDEO_MONTHLY_BUDGET_EXHAUSTED')(r.reason))).toBe(true);
      const job = results.find((r) => r.status === 'fulfilled').value;
      await f.db.videoGenerationJob.update({ where: { id: job.id }, data: { state: 'uncertain' } });
      const third = await f.ready();
      await rejectsCode(f.service.launch(f.org.id, f.user.id, third.launch), 'VIDEO_MONTHLY_BUDGET_EXHAUSTED');
      const reserved = await f.db.videoGenerationJob.findUnique({ where: { id: job.id } });
      expect(Number(reserved.reservedUsd)).toBe(2); expect(reserved.costUsd).toBeNull();
      await f.db.videoGenerationJob.update({ where: { id: job.id }, data: { costUsd: 3.5 } });
      await rejectsCode(f.service.launch(f.org.id, f.user.id, third.launch), 'VIDEO_MONTHLY_BUDGET_EXHAUSTED');
      expect(Number((await f.db.videoGenerationJob.findUnique({ where: { id: job.id } })).costUsd)).toBe(3.5);
      expect(f.transport.submits).toHaveLength(0);
    }));

  test('restart resumes persisted provider ID with no replay, ingests owned bytes once and reopens the same Media', () =>
    withFixture({}, async (f) => {
      const ready = await f.ready(); const job = await f.service.launch(f.org.id, f.user.id, ready.launch);
      await f.service.runStep(f.org.id, job.id);
      const queued = await f.db.videoGenerationJob.findUnique({ where: { id: job.id } });
      expect(queued.state).toBe('queued'); expect(queued.receipt.id).toBeTruthy(); expect(queued.usageRecordId).toBeTruthy();
      f.restart();
      await f.service.runStep(f.org.id, job.id);
      expect(f.transport.polls[0].id).toBe(queued.receipt.id);
      await Promise.all([f.service.runStep(f.org.id, job.id), f.service.runStep(f.org.id, job.id)]);
      const result = await f.service.get(f.org.id, job.id);
      expect(result.state).toBe('completed'); expect(result.result.id).toBeTruthy();
      expect((await f.service.get(f.org.id, job.id)).result.id).toBe(result.result.id);
      expect(await f.db.media.count({ where: { organizationId: f.org.id, type: 'video' } })).toBe(1);
      const relative = new URL(result.result.path).pathname.replace(/^\/uploads\//, '');
      expect(fs.readFileSync(path.join(f.uploadDirectory, relative))).toEqual(f.mp4);
      expect(f.transport.submits).toHaveLength(1); expect(f.transport.downloads).toHaveLength(1);
      for (const providerJob of f.transport.jobs.values()) providerJob.url = 'https://expired.invalid/result.mp4';
      const download = await f.service.download(f.org.id, job.id);
      expect(download.name).toBe(`video-${job.id}.mp4`); expect(download.bytes).toEqual(f.mp4);
      await rejectsCode(f.service.download(f.otherOrg.id, job.id), 'VIDEO_OWNED_FILE_UNAVAILABLE');
      expect(f.transport.downloads).toHaveLength(1);
      expect(await f.db.aiUsageRecord.count({ where: { organizationId: f.org.id, operation: 'video_generation' } })).toBe(1);
      const usage = await f.db.aiUsageRecord.findUnique({ where: { id: queued.usageRecordId } });
      expect(usage).toMatchObject({ provider: 'higgsfield', usageMode: 'workspace_key', userId: f.user.id, operation: 'video_generation', status: 'succeeded' });
    }));

  test('a crash after durable submitting stays uncertain on restart and never submits a fresh request', () =>
    withFixture({}, async (f) => {
      const ready = await f.ready(); const job = await f.service.launch(f.org.id, f.user.id, ready.launch);
      await f.db.videoGenerationJob.update({ where: { id: job.id }, data: { state: 'submitting', submitAttempts: 1 } });
      f.restart();
      expect(await f.service.runStep(f.org.id, job.id)).toEqual({ state: 'uncertain', done: true });
      await f.service.runStep(f.org.id, job.id);
      expect(f.transport.submits).toHaveLength(0);
      expect(await f.service.get(f.org.id, job.id)).toMatchObject({ state: 'uncertain', costUsd: null, reservedUsd: 2, errorCode: 'VIDEO_SUBMIT_INTERRUPTED' });
    }));

  test('Higgsfield ambiguous response permits one immediate replay with identical endpoint/body/key only', () =>
    withFixture({}, async (f) => {
      const ready = await f.ready(); const job = await f.service.launch(f.org.id, f.user.id, ready.launch);
      f.transport.submitScript.higgsfield.push('transport');
      await f.service.runStep(f.org.id, job.id);
      expect(f.transport.submits).toHaveLength(2);
      expect(f.transport.submits[0]).toEqual(f.transport.submits[1]);
      expect(f.transport.jobs.size).toBe(1);
      expect((await f.db.videoGenerationJob.findUnique({ where: { id: job.id } })).submitAttempts).toBe(2);
      f.restart(); await f.runToTerminal(job.id);
      expect(f.transport.submits).toHaveLength(2);
    }));

  test('HeyGen lost submit response stays uncertain without paid replay or provider fallback', () =>
    withFixture({}, async (f) => {
      const ready = await f.ready({ presenter: true });
      const job = await f.service.launch(f.org.id, f.user.id, ready.launch);
      f.transport.submitScript.heygen.push('transport');
      expect(await f.service.runStep(f.org.id, job.id)).toEqual({ state: 'uncertain', done: true });
      f.restart(); await f.service.runStep(f.org.id, job.id);
      expect(f.transport.submits).toHaveLength(1);
      expect(f.transport.submits[0].provider).toBe('heygen');
      expect(f.transport.polls).toHaveLength(0);
      expect(await f.service.get(f.org.id, job.id)).toMatchObject({ state: 'uncertain', costUsd: null, reservedUsd: 2 });
    }));

  test('save failure retries download/status only, and duplicate completion produces one owned Media', () =>
    withFixture({}, async (f) => {
      const ready = await f.ready({ presenter: true });
      const job = await f.service.launch(f.org.id, f.user.id, ready.launch);
      await f.service.runStep(f.org.id, job.id); await f.service.runStep(f.org.id, job.id);
      f.transport.downloadFailures = 1;
      expect(await f.service.runStep(f.org.id, job.id)).toEqual({ state: 'save_failed', done: true });
      expect((await f.service.get(f.org.id, job.id)).costUsd).toBeNull();
      f.restart();
      const retries = await Promise.allSettled([
        f.service.retrySave(f.org.id, f.user.id, job.id),
        f.service.retrySave(f.org.id, f.user.id, job.id),
      ]);
      expect(retries.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      await Promise.all([f.service.runStep(f.org.id, job.id), f.service.runStep(f.org.id, job.id)]);
      const result = await f.service.get(f.org.id, job.id);
      expect(result.state).toBe('completed');
      expect(result.providerResult.duration).toBe(15.5);
      expect(await f.db.media.count({ where: { organizationId: f.org.id, type: 'video' } })).toBe(1);
      expect(f.transport.submits).toHaveLength(1); expect(f.transport.downloads).toHaveLength(2);
      expect((await f.db.videoGenerationJob.findUnique({ where: { id: job.id } })).runCycle).toBe(1);
      await f.service.runStep(f.org.id, job.id);
      expect(f.transport.submits).toHaveLength(1); expect(f.transport.downloads).toHaveLength(2);
    }));

  test('an importer that loses its lease rolls back Media instead of replacing the winning result', () =>
    withFixture({}, async f => {
      const ready = await f.ready();
      const accepted = await f.service.launch(f.org.id, f.user.id, ready.launch);
      const job = await f.db.videoGenerationJob.update({where: {id: accepted.id}, data: {state: 'saving'}});
      expect(await f.repository.claim(f.org.id, job.id, 'old-importer')).toBe(true);
      let resume, entered;
      const pause = new Promise(resolve => {resume = resolve;});
      const read = new Promise(resolve => {entered = resolve;});
      // A real interactive transaction, paused after its initial SELECT. The
      // scheduler alone is controlled; both Media inserts/CAS execute in PG.
      const stale = new f.repository.constructor({$transaction: run => f.db.$transaction(async tx => {
        const jobs = new Proxy(tx.videoGenerationJob, {get(target, property) {
          if (property !== 'findFirst') return target[property];
          return async args => {
            const value = await target.findFirst(args);
            entered(); await pause; return value;
          };
        }});
        return run(new Proxy(tx, {get(target, property) {return property === 'videoGenerationJob' ? jobs : target[property];}}));
      }, {timeout: 10000})});
      const file = {name: 'owned.mp4', path: 'https://owned.example/owned.mp4', size: 128};
      const pending = stale.attachResult(job, 'old-importer', file);
      try {
        await read;
        await f.db.videoGenerationJob.update({where: {id: job.id}, data: {leaseUntil: new Date(Date.now() - 1000)}});
        expect(await f.repository.claim(f.org.id, job.id, 'new-importer')).toBe(true);
        await f.repository.attachResult(job, 'new-importer', file);
        const winner = await f.db.videoGenerationJob.findUnique({where: {id: job.id}});
        resume();
        await expect(pending).rejects.toThrow('VIDEO_JOB_LEASE_LOST');
        expect(await f.db.media.count({where: {organizationId: f.org.id, type: 'video'}})).toBe(1);
        expect((await f.db.videoGenerationJob.findUnique({where: {id: job.id}})).resultMediaId).toBe(winner.resultMediaId);
        expect(f.transport.submits).toHaveLength(0);
      } finally {resume(); await pending.catch(() => {});}
    }));
});
