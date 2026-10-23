const { randomUUID } = require('node:crypto');
const baseFixture = require('./video-domain-v1.fixture.cjs');
const { createProviderFixture } = require('./video-subscription-provider-fixture.cjs');
const { loadTypeScriptModule } = require('./load-ts-module.cjs');

/** Actual Prisma/services/storage; only identity and provider/text transports are synthetic. */
async function create(db, options = {}) {
  baseFixture.assertDisposableDatabaseV1(typeof db === 'string' ? db : db?._engineConfig?.overrideDatasources?.db?.url || db?._engineConfig?.datasourceOverrides?.db?.url);
  const provider = await createProviderFixture(options.provider || {});
  let f;
  try { f = await baseFixture.create(db, options); } catch (error) { await provider.close(); throw error; }
  const oldBackend = process.env.BACKEND_INTERNAL_URL;
  const oldPublicBackend = process.env.NEXT_PUBLIC_BACKEND_URL;
  process.env.BACKEND_INTERNAL_URL = options.backendUrl || 'http://127.0.0.1:43118';
  process.env.NEXT_PUBLIC_BACKEND_URL = options.backendUrl || 'http://127.0.0.1:43118';
  const baseClose = f.close;
  let closed = false;
  try {
    // The same person can explicitly grant their personal wallet to two workspaces.
    // A second editor in the first workspace must still never borrow that wallet.
    await f.db.userOrganization.create({data: {organizationId: f.otherOrg.id, userId: f.user.id, role: 'ADMIN'}});
    await f.db.userOrganization.create({data: {organizationId: f.org.id, userId: f.otherUser.id, role: 'EDITOR'}});
    const modules = provider.modules;
    const repositoryModule = loadTypeScriptModule('libraries/nestjs-libraries/src/database/prisma/video-subscription/video-subscription.repository.ts', modules.mocks);
    modules.mocks['../../database/prisma/video-subscription/video-subscription.repository'] = repositoryModule;
    modules.mocks['../database/prisma/video-subscription/video-subscription.repository'] = repositoryModule;
    const jobsModule = modules.register('subscriptions/video-subscription-job.service', ['./subscriptions/video-subscription-job.service']);
    const accessModule = modules.register('video-access.service', []);
    const repository = new repositoryModule.VideoSubscriptionRepository(f.db);
    const dispatches = [];
    const execution = {start: async (organizationId, jobId, cycle = 0) => { dispatches.push({organizationId, jobId, cycle}); }};
    const restartSubscriptions = () => {
      const connections = new modules.connection.VideoConnectionService(repository, provider.runtime, provider.oauth);
      const subscriptions = new jobsModule.VideoSubscriptionJobService(repository, connections, provider.runtime, provider.mcp,
        provider.higgsfield, provider.heygen, f.service.media, f.repository, execution);
      const access = new accessModule.VideoAccessService(repository, f.repository, f.service, connections, subscriptions, f.service.media);
      Object.assign(f, {connections, subscriptions, access});
      return subscriptions;
    };
    Object.assign(f, {provider, authenticatedSession: modules.authenticatedSession, subscriptionRepository: repository, subscriptionDispatches: dispatches, subscriptionExecution: execution, restartSubscriptions});
    restartSubscriptions();
    for (const org of f.organizations) await f.connections.workspacePolicy(org, f.user.id, true);
    f.connect = async (name = 'higgsfield', input = {}) => {
      const org = input.org || f.org.id, actor = input.actor || f.user.id;
      const start = await f.connections.start(org, actor, name, input.returnPath);
      const callback = await provider.authorize(start.authorizationUrl);
      const result = await f.connections.callback(org, actor, name, Object.fromEntries(callback.searchParams));
      if (input.limits !== false) await f.connections.limits(org, actor, result.connectionId, input.perJob || '0.25', input.perMonth || '10');
      return {...result, id: result.connectionId};
    };
    f.readySubscription = async (input = {}) => {
      const org = input.org || f.org.id, actor = input.actor || f.user.id;
      const name = input.provider || (input.presenter ? 'heygen' : 'higgsfield');
      const connectionId = input.connectionId || (await f.connect(name, {org, actor})).connectionId;
      const settings = input.settings || (name === 'heygen' ? f.presenterSettings : f.clipSettings);
      const draft = await f.service.prepare(org, actor, {pieceId: input.pieceId || (org === f.org.id ? f.pieceId : f.otherPieceId), settings, intent: 'Показать подтверждённые факты'});
      const preflight = await f.access.preflight(org, actor, {draftId: draft.id, version: draft.version, access: {kind: 'subscription', connectionId}});
      return {draft, preflight, connectionId, org, actor, launch: {preflightId: preflight.id, intentId: randomUUID()}};
    };
    f.runSubscriptionToTerminal = async (jobId, input = {}) => {
      const org = input.org || f.org.id, actor = input.actor || f.user.id;
      for (let step = 0; step < (input.limit || 8); step++) {
        if ((await f.subscriptions.runStep(org, jobId)).done) return f.access.get(org, actor, jobId);
      }
      throw new Error('Subscription fixture runStep limit reached');
    };
    f.addOwnedVideo = async (input = {}) => {
      const stored = await f.service.media.importVideo(baseFixture.FIXTURE_CDN);
      return f.db.media.create({data: {organizationId: input.org || f.org.id, name: stored.name, path: stored.path, fileSize: stored.size, type: 'video', originalName: 'manual-fixture.mp4', ...input.data}});
    };
    f.close = async () => {
      if (closed) return; closed = true;
      try {
        const connections = await f.db.videoSubscriptionConnection.findMany({where: {ownerId: {in: f.users}}, select: {id: true}});
        const ids = connections.map(c => c.id);
        await f.db.videoSubscriptionJob.deleteMany({where: {organizationId: {in: f.organizations}}});
        await f.db.videoManualAttachment.deleteMany({where: {organizationId: {in: f.organizations}}});
        await f.db.videoRouteIntent.deleteMany({where: {organizationId: {in: f.organizations}}});
        await f.db.videoAccessPreflight.deleteMany({where: {organizationId: {in: f.organizations}}});
        await f.db.videoSubscriptionOAuthAttempt.deleteMany({where: {organizationId: {in: f.organizations}}});
        await f.db.videoSubscriptionGrant.deleteMany({where: {OR: [{organizationId: {in: f.organizations}}, {connectionId: {in: ids}}]}});
        await f.db.videoSubscriptionWorkspacePolicy.deleteMany({where: {organizationId: {in: f.organizations}}});
        await f.db.videoSubscriptionConnection.deleteMany({where: {id: {in: ids}}});
        await f.db.videoSubscriptionRegistration.deleteMany({where: {issuer: {in: ['higgsfield', 'heygen'].map(p => provider.runtime.definition(p).issuer)}}});
      } finally {
        if (oldBackend === undefined) delete process.env.BACKEND_INTERNAL_URL; else process.env.BACKEND_INTERNAL_URL = oldBackend;
        if (oldPublicBackend === undefined) delete process.env.NEXT_PUBLIC_BACKEND_URL; else process.env.NEXT_PUBLIC_BACKEND_URL = oldPublicBackend;
        await provider.close(); await baseClose();
      }
    };
    return f;
  } catch (error) {
    if (oldBackend === undefined) delete process.env.BACKEND_INTERNAL_URL; else process.env.BACKEND_INTERNAL_URL = oldBackend;
    if (oldPublicBackend === undefined) delete process.env.NEXT_PUBLIC_BACKEND_URL; else process.env.NEXT_PUBLIC_BACKEND_URL = oldPublicBackend;
    await provider.close(); await baseClose(); throw error;
  }
}

module.exports = {...baseFixture, create};
