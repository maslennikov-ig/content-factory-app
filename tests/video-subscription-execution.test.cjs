const fixture = require('./helpers/video-subscription-domain.fixture.cjs');
const { codeOf } = require('./helpers/video-subscription-provider-fixture.cjs');
const databaseUrl = process.env.CF_VIDEO_DATABASE_URL;
if (databaseUrl) fixture.assertDisposableDatabaseV1(databaseUrl);
const domain = databaseUrl ? describe : describe.skip;
const withFixture = async run => { const f = await fixture.create(databaseUrl); try { return await run(f); } finally { await f.close(); } };

domain('subscription persisted execution and service restart over real MCP/Prisma/storage', () => {
  jest.setTimeout(30000);

  test.each(['age', 'poll-limit'])('explicit receipt recovery renews a bounded poll cycle after %s exhaustion without resubmission', reason => withFixture(async f => {
    const r = await f.readySubscription(); const job = await f.access.launch(r.org, r.actor, r.launch);
    await f.subscriptions.runStep(r.org, job.id);
    const before = await f.db.videoSubscriptionJob.findUniqueOrThrow({where: {id: job.id}});
    const createdAt = reason === 'age' ? new Date(f.provider.runtime.now().getTime() - 86400_001) : before.createdAt;
    await f.db.videoSubscriptionJob.update({where: {id: job.id}, data: {createdAt, ...(reason === 'poll-limit' ? {pollAttempts: 8640} : {})}});
    expect((await f.subscriptions.runStep(r.org, job.id)).state).toBe('status_delayed');
    expect(f.provider.state.polls).toHaveLength(0);
    await f.access.action(r.org, r.actor, job.id, 'resume');
    // A late expiry call from the previous workflow cannot end this new cycle.
    expect((await f.subscriptions.expire(r.org, job.id)).done).toBe(false);
    f.restartSubscriptions();
    expect((await f.runSubscriptionToTerminal(job.id)).state).toBe('completed');
    const after = await f.db.videoSubscriptionJob.findUniqueOrThrow({where: {id: job.id}});
    expect(after.createdAt).toEqual(createdAt); expect(after.receipt).toEqual(before.receipt);
    expect(after.submitAttempts).toBe(1); expect(after.pollAttempts).toBe(1); expect(after.runCycle).toBe(1);
    expect(f.provider.state.submits).toHaveLength(1); expect(f.provider.state.polls).toHaveLength(1);
  }));

  test('retry-save after reconnect refreshes the same receipt with the new wallet generation', () => withFixture(async f => {
    const r = await f.readySubscription(); const job = await f.access.launch(r.org, r.actor, r.launch);
    await f.subscriptions.runStep(r.org, job.id); await f.subscriptions.runStep(r.org, job.id);
    f.transport.downloadFailures = 2;
    expect((await f.runSubscriptionToTerminal(job.id)).state).toBe('save_failed');
    const before = await f.db.videoSubscriptionJob.findUniqueOrThrow({where: {id: job.id}});
    await f.connections.disconnect(r.org, r.actor, r.connectionId);
    const reconnected = await f.connect(); expect(reconnected.id).toBe(r.connectionId);
    f.transport.downloadFailures = 1;
    await f.access.action(r.org, r.actor, job.id, 'retry-save'); f.restartSubscriptions();
    expect((await f.runSubscriptionToTerminal(job.id)).state).toBe('completed');
    const after = await f.db.videoSubscriptionJob.findUniqueOrThrow({where: {id: job.id}});
    expect(after.generation).toBeGreaterThan(before.generation); expect(after.receipt).toEqual(before.receipt);
    expect(after.submitAttempts).toBe(1); expect(f.provider.state.submits).toHaveLength(1);
    expect(f.provider.state.polls).toHaveLength(3);
  }));

  test('retry-save can import a captured file while disconnected, without another credential call', () => withFixture(async f => {
    const r = await f.readySubscription(); const job = await f.access.launch(r.org, r.actor, r.launch);
    await f.subscriptions.runStep(r.org, job.id); await f.subscriptions.runStep(r.org, job.id);
    await f.db.videoSubscriptionJob.update({where: {id: job.id}, data: {state: 'save_failed'}});
    await f.connections.disconnect(r.org, r.actor, r.connectionId);
    const calls = f.provider.state.egress.length;
    f.provider.advance(86400_001);
    await f.access.action(r.org, r.actor, job.id, 'retry-save');
    expect((await f.subscriptions.expire(r.org, job.id)).done).toBe(false);
    expect((await f.runSubscriptionToTerminal(job.id)).state).toBe('completed');
    expect(f.provider.state.egress).toHaveLength(calls); expect(f.provider.state.submits).toHaveLength(1);
  }));

  test('the renewed receipt-only cycle still stops at its own deadline without another submit', () => withFixture(async f => {
    const r = await f.readySubscription(); const job = await f.access.launch(r.org, r.actor, r.launch);
    await f.subscriptions.runStep(r.org, job.id);
    await f.db.videoSubscriptionJob.update({where: {id: job.id}, data: {state: 'status_delayed'}});
    await f.access.action(r.org, r.actor, job.id, 'resume');
    const deadline = (await f.db.videoSubscriptionJob.findUniqueOrThrow({where: {id: job.id}})).statusDeadlineAt;
    expect(deadline.getTime()).toBe(f.provider.runtime.now().getTime() + 86400_000);
    f.provider.advance(86400_000); f.restartSubscriptions();
    expect((await f.subscriptions.runStep(r.org, job.id)).state).toBe('status_delayed');
    expect(f.provider.state.polls).toHaveLength(0); expect(f.provider.state.submits).toHaveLength(1);
  }));

  test('retry-save cannot adopt a different wallet even with the same local connection ID', () => withFixture(async f => {
    const r = await f.readySubscription(); const job = await f.access.launch(r.org, r.actor, r.launch);
    await f.subscriptions.runStep(r.org, job.id); await f.subscriptions.runStep(r.org, job.id);
    await f.db.videoSubscriptionJob.update({where: {id: job.id}, data: {state: 'save_failed'}});
    await f.db.videoSubscriptionConnection.update({where: {id: r.connectionId}, data: {walletDigest: 'different-wallet', generation: {increment: 1}}});
    let error; try { await f.access.action(r.org, r.actor, job.id, 'retry-save'); } catch (e) { error = e; }
    expect(codeOf(error)).toBe('VIDEO_CONNECTION_CHANGED');
    expect((await f.db.videoSubscriptionJob.findUniqueOrThrow({where: {id: job.id}})).runCycle).toBe(0);
    expect(f.provider.state.submits).toHaveLength(1);
  }));

  test.each(['higgsfield', 'heygen'])('%s completes with one submit, retained receipt and downloadable owned bytes after service restart', provider => withFixture(async f => {
    const r = await f.readySubscription({provider}); const job = await f.access.launch(r.org, r.actor, r.launch);
    await f.subscriptions.runStep(r.org, job.id);
    const accepted = await f.db.videoSubscriptionJob.findUniqueOrThrow({where: {id: job.id}});
    expect(accepted.state).toBe('queued'); expect(accepted.submitAttempts).toBe(1); expect(accepted.receipt.id).toMatch(/^fixture_/);
    f.restartSubscriptions();
    const completed = await f.runSubscriptionToTerminal(job.id);
    expect(completed.state).toBe('completed'); expect(completed.result.type).toBe('video');
    const bytes = await f.access.download(r.org, r.actor, job.id); expect(bytes.bytes.equals(f.mp4)).toBe(true);
    const saved = await f.db.videoSubscriptionJob.findUniqueOrThrow({where: {id: job.id}});
    expect(saved.receipt).toEqual(accepted.receipt); expect(saved.submitAttempts).toBe(1);
    expect(completed.cost).toEqual({amount: null, unit: `${provider}_credit`, certainty: 'unknown'});
    expect(f.provider.state.quotes).toHaveLength(1); expect(f.provider.state.submits).toHaveLength(1);
    expect(f.transport.submits).toHaveLength(0);
  }));

  test.each(['higgsfield', 'heygen'])('%s lost submit response remains unknown through restart, replay and status reload', provider => withFixture(async f => {
    const r = await f.readySubscription({provider});
    f.provider.script(provider, provider === 'heygen' ? 'create_video' : 'generate_clip', 'lost');
    const job = await f.access.launch(r.org, r.actor, r.launch);
    expect((await f.subscriptions.runStep(r.org, job.id)).state).toBe('submission_unknown');
    f.restartSubscriptions();
    expect((await f.subscriptions.runStep(r.org, job.id)).done).toBe(true);
    expect((await f.access.launch(r.org, r.actor, r.launch)).id).toBe(job.id);
    const read = await f.access.get(r.org, r.actor, job.id); expect(read.state).toBe('submission_unknown');
    expect(read.cost.amount).toBeNull(); expect(read.reserved).toBe('0.25');
    let error; try { await f.access.action(r.org, r.actor, job.id, 'retry-save'); } catch (e) { error = e; }
    expect(codeOf(error)).toBe('VIDEO_SAVE_RETRY_UNAVAILABLE');
    const row = await f.db.videoSubscriptionJob.findUniqueOrThrow({where: {id: job.id}});
    expect(row.submitAttempts).toBe(1); expect(row.receipt).toBeNull();
    expect(f.provider.state.submits).toHaveLength(1); expect(f.provider.state.polls).toHaveLength(0);
  }));

  test('crash after persisted before-send state is unknown after constructing a fresh service, with zero automatic sends', () => withFixture(async f => {
    const r = await f.readySubscription(); const job = await f.access.launch(r.org, r.actor, r.launch);
    await f.db.videoSubscriptionJob.update({where: {id: job.id}, data: {state: 'submitting', submitAttempts: 1, submittedAt: f.provider.runtime.now()}});
    f.restartSubscriptions();
    const result = await f.subscriptions.runStep(r.org, job.id);
    expect(result).toEqual({state: 'submission_unknown', done: true}); expect(f.provider.state.submits).toHaveLength(0);
  }));

  test('concurrent workers, failed file imports and save-only retry attach exactly one Media and never resubmit', () => withFixture(async f => {
    const r = await f.readySubscription(); const job = await f.access.launch(r.org, r.actor, r.launch);
    await Promise.all([f.subscriptions.runStep(r.org, job.id), f.subscriptions.runStep(r.org, job.id)]);
    expect(f.provider.state.submits).toHaveLength(1);
    await f.subscriptions.runStep(r.org, job.id); // Completed provider receipt, before storage.
    f.transport.downloadFailures = 2;
    const failed = await f.runSubscriptionToTerminal(job.id); expect(failed.state).toBe('save_failed'); expect(failed.result).toBeNull();
    expect(failed.reserved).toBe('0.25');
    await f.access.action(r.org, r.actor, job.id, 'retry-save'); f.restartSubscriptions();
    await Promise.all([f.subscriptions.runStep(r.org, job.id), f.subscriptions.runStep(r.org, job.id)]);
    const result = await f.runSubscriptionToTerminal(job.id); expect(result.state).toBe('completed');
    expect(await f.db.media.count({where: {organizationId: r.org, id: result.result.id}})).toBe(1);
    expect(await f.db.media.count({where: {organizationId: r.org, type: 'video'}})).toBe(1);
    expect(f.provider.state.submits).toHaveLength(1);
  }));

  test('expired saving lease cannot attach Media; a current worker later saves the same provider result', () => withFixture(async f => {
    const r = await f.readySubscription(); const job = await f.access.launch(r.org, r.actor, r.launch);
    await f.subscriptions.runStep(r.org, job.id); await f.subscriptions.runStep(r.org, job.id);
    const importer = f.subscriptions.media.importVideo.bind(f.subscriptions.media);
    let intercepted = false;
    f.subscriptions.media.importVideo = async url => {
      const file = await importer(url);
      if (!intercepted) { intercepted = true; await f.db.videoSubscriptionJob.update({where: {id: job.id}, data: {leaseOwner: 'fixture-other-worker', leaseUntil: new Date(f.provider.runtime.now().getTime() + 1000)}}); }
      return file;
    };
    await f.subscriptions.runStep(r.org, job.id);
    expect(await f.db.media.count({where: {organizationId: r.org, type: 'video'}})).toBe(0);
    f.provider.advance(1001); f.subscriptions.media.importVideo = importer;
    const result = await f.runSubscriptionToTerminal(job.id); expect(result.state).toBe('completed');
    expect(await f.db.media.count({where: {organizationId: r.org, type: 'video'}})).toBe(1);
    expect(f.provider.state.submits).toHaveLength(1);
  }));

  test('only a receipt-bound same-unit provider charge becomes provider-confirmed cost', () => withFixture(async f => {
    f.provider.state.confirmedCharge = '0.135';
    const r = await f.readySubscription(); const job = await f.access.launch(r.org, r.actor, r.launch);
    const result = await f.runSubscriptionToTerminal(job.id);
    expect(result.cost).toEqual({amount: '0.135', unit: 'higgsfield_credit', certainty: 'provider_confirmed'});
    const row = await f.db.videoSubscriptionJob.findUniqueOrThrow({where: {id: job.id}});
    expect(row.actualCost.toFixed()).toBe('0.135'); expect(row.reserved.toFixed()).toBe('0.25');
  }));

  test('saving an expired captured URL records receipt-bound cost from the refreshed status without another submit', () => withFixture(async f => {
    const r = await f.readySubscription(); const job = await f.access.launch(r.org, r.actor, r.launch);
    await f.subscriptions.runStep(r.org, job.id); await f.subscriptions.runStep(r.org, job.id);
    f.transport.downloadFailures = 1; f.provider.state.confirmedCharge = '0.2';
    const result = await f.runSubscriptionToTerminal(job.id);
    expect(result.state).toBe('completed'); expect(result.cost).toEqual({amount:'0.2',unit:'higgsfield_credit',certainty:'provider_confirmed'});
    expect(f.provider.state.submits).toHaveLength(1); expect(f.provider.state.polls).toHaveLength(2);
  }));

  test('disconnect before execution pauses credential use, with owned completed results still readable by a reader', () => withFixture(async f => {
    const r = await f.readySubscription(); const job = await f.access.launch(r.org, r.actor, r.launch);
    await f.connections.disconnect(r.org, r.actor, r.connectionId);
    const state = await f.subscriptions.runStep(r.org, job.id); expect(state.state).toBe('reauth_required'); expect(f.provider.state.submits).toHaveLength(0);
    const next = await f.readySubscription(); const completed = await f.access.launch(next.org, next.actor, next.launch); await f.runSubscriptionToTerminal(completed.id);
    await f.connections.disconnect(next.org, next.actor, next.connectionId);
    await f.db.userOrganization.updateMany({where: {organizationId: next.org, userId: f.otherUser.id}, data: {role: 'USER'}});
    const reader = await f.access.get(next.org, f.otherUser.id, completed.id);
    expect(reader.access).toEqual({kind: 'subscription', label: 'personal'});
    expect((await f.access.download(next.org, f.otherUser.id, completed.id)).bytes.equals(f.mp4)).toBe(true);
    let foreign; try { await f.access.get(f.otherOrg.id, f.user.id, completed.id); } catch (e) { foreign = e; }
    expect(codeOf(foreign)).toBe('VIDEO_JOB_NOT_FOUND');
  }));
});
