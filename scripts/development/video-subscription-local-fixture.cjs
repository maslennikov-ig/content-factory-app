#!/usr/bin/env node
'use strict';
/** Real Nest controllers/policies + Prisma/storage and real local OAuth/MCP transport.
 * Synthetic sessions and external providers only. Not a deployable mode. */
require('reflect-metadata');
const fs = require('node:fs');
const path = require('node:path');
const jwt = require('jsonwebtoken');
const express = require('express');
const cookieParser = require('cookie-parser');
const {Module, ValidationPipe} = require('@nestjs/common');
const {NestFactory, Reflector} = require('@nestjs/core');
const {create} = require('../../tests/helpers/video-subscription-domain.fixture.cjs');
const {loadTypeScriptModule} = require('../../tests/helpers/load-ts-module.cjs');

async function startLocalSubscriptionFixture(options = {}) {
  const port = options.port || Number(process.env.CF_VIDEO_FIXTURE_PORT || 43321);
  const frontend = options.frontend || process.env.CF_VIDEO_FIXTURE_FRONTEND || 'http://localhost:43320';
  if (!Number.isInteger(port) || port < 1024 || !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(frontend)) throw new Error('Loopback fixture ports required');
  const api = `http://localhost:${port}`;
  const f = await create(options.databaseUrl || process.env.CF_VIDEO_DATABASE_URL, {frontendUrl: frontend, backendUrl: api, textKey: true});
  await f.db.userOrganization.update({where:{userId_organizationId:{userId:f.otherUser.id,organizationId:f.org.id}},data:{role:'USER'}});
  const policy = loadTypeScriptModule('apps/backend/src/services/auth/permissions/permissions.ability.ts');
  const permissions = loadTypeScriptModule('apps/backend/src/services/auth/permissions/permission.exception.class.ts');
  const mocks = {
    '@contentfactory/backend/services/auth/permissions/permissions.ability': policy,
    '@contentfactory/backend/services/auth/permissions/permission.exception.class': permissions,
    '@contentfactory/nestjs-libraries/videos/video-access.service': {VideoAccessService: f.access.constructor},
    '@contentfactory/nestjs-libraries/videos/subscriptions/video-connection.service': {VideoConnectionService: f.connections.constructor},
  };
  const {VideoConnectionsController} = loadTypeScriptModule('apps/backend/src/api/routes/video-connections.controller.ts', mocks);
  const {VideoAccessController} = loadTypeScriptModule('apps/backend/src/api/routes/video-access.controller.ts', mocks);
  const {MediaRepository} = loadTypeScriptModule('libraries/nestjs-libraries/src/database/prisma/media/media.repository.ts');
  const mediaRepository = new MediaRepository({model: f.db});
  const mediaBoundary = {getMedia: (...args) => mediaRepository.getMedia(...args), saveFile: (...args) => mediaRepository.saveFile(...args)};
  const controllers = [VideoConnectionsController, VideoAccessController, f.controller.constructor];
  const values = [[f.connections], [f.access], [mediaBoundary, f.service, f.credentials]];
  const providers = controllers.flatMap((controller,index) => Reflect.getMetadata('design:paramtypes', controller).map((token,i) => ({provide: token, useValue: values[index][i]})));
  class LocalFixtureModule {}
  Module({controllers, providers})(LocalFixtureModule);
  const app = await NestFactory.create(LocalFixtureModule, {logger: false});
  app.enableCors({origin: [frontend, frontend.replace('localhost', '127.0.0.1')], credentials: true});
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({transform: true, whitelist: true}));
  app.useGlobalGuards(new f.PoliciesGuard(new Reflector(), f.permissions));
  const server = app.getHttpAdapter().getInstance();
  const identities = {admin: [f.user.id, f.org.id], reader: [f.otherUser.id, f.org.id], foreign: [f.otherUser.id, f.otherOrg.id]};
  const counters = () => ({quotes: f.provider.state.quotes.length, submits: f.provider.state.submits.length, polls: f.provider.state.polls.length,
    apiSubmits: f.transport.submits.length, downloads: f.transport.downloads.length, registrations: f.provider.state.registrations.length, refreshes: f.provider.state.refreshes.length});
  server.get('/__fixture/signin/:role', (req,res) => {
    const identity = identities[req.params.role]; if (!identity) return res.sendStatus(404);
    const token = jwt.sign({id: identity[0], purpose: 'session'}, process.env.JWT_SECRET, {expiresIn: '2h'});
    res.cookie('auth', token, {sameSite: 'lax', path: '/'}); res.cookie('showorg', identity[1], {sameSite: 'lax', path: '/'});
    res.cookie('i18next','ru',{sameSite:'lax',path:'/'}); return res.json({pieceId: f.pieceId, orgId: identity[1]});
  });
  server.get('/__fixture/info', (_req,res) => res.json({pieceId: f.pieceId, orgId: f.org.id, providerOrigin: f.provider.origin, fixture: true}));
  server.get('/__fixture/counters', (_req,res) => res.json(counters()));
  server.get('/__fixture/receipts', async (_req,res) => res.json({
    jobs: await f.db.videoSubscriptionJob.findMany({where:{organizationId:f.org.id},select:{id:true,state:true,submitAttempts:true,receipt:true,resultMediaId:true,actualCost:true,costCertainty:true}}),
    manual: await f.db.videoManualAttachment.count({where:{organizationId:f.org.id}}), routeIntents: await f.db.videoRouteIntent.count({where:{organizationId:f.org.id}}), counters: counters()}));
  server.use('/uploads', express.static(f.uploadDirectory));
  server.use(async (req,res,next) => {
    try {
      const token = req.headers.auth || req.cookies.auth; const principal = jwt.verify(token || '', process.env.JWT_SECRET);
      const orgId = req.headers.showorg || req.cookies.showorg || f.org.id;
      const member = await f.db.userOrganization.findFirst({where:{userId:principal.id,organizationId:orgId,disabled:false}, include:{organization:true,user:true}});
      if (!member) return res.sendStatus(401);
      req.user = member.user; req.org = {...member.organization,users:[member]}; req.fixtureRole = member.role;
      const {assertCookieMutationOrigin} = loadTypeScriptModule('libraries/nestjs-libraries/src/auth/same-origin-mutation.ts');
      // The application frontend origin can differ from owned-storage origin in this loopback fixture.
      const previous = process.env.FRONTEND_URL; process.env.FRONTEND_URL = frontend;
      try { assertCookieMutationOrigin(req); } finally { process.env.FRONTEND_URL = previous; }
      return f.authenticatedSession.withAuthenticatedSession(principal.id, token, next);
    } catch (error) { return res.status(error?.getStatus?.() || 401).json(error?.getResponse?.() || {code:'VIDEO_ACCESS_DENIED'}); }
  });
  const self = req => ({...req.user,language:'ru',orgId:req.org.id,role:req.fixtureRole,tier:'PRO',publicApi:'',totalChannels:0,picture:null,impersonate:false,allowTrial:false,isTrailing:false,streakSince:null});
  server.get('/user/self',(req,res)=>res.json(self(req)));
  server.get('/user/organizations',(req,res)=>res.json([{...req.org,role:req.fixtureRole}]));
  server.get('/content-intelligence/pieces',async(req,res)=>res.json({pieces:await f.db.contentPiece.findMany({where:{organizationId:req.org.id},select:{id:true,title:true}})}));
  server.get('/notifications',(_req,res)=>res.json({total:0}));
  server.get('/notifications/list',(_req,res)=>res.json({notifications:[]}));
  server.get('/onboarding/progress',(_req,res)=>res.json({complete:true,dismissed:true}));
  server.get('/onboarding',(_req,res)=>res.json({complete:true,dismissed:true}));
  for (const route of ['/announcements','/third-party','/integrations/list','/agent/threads']) server.get(route,(_req,res)=>res.json([]));
  server.get('/agent/work-context',(_req,res)=>res.json({version:1,kind:'workspace'}));
  server.get('/settings/ai',async(req,res)=>res.json({usageMode:'workspace_key',video:await f.credentials.getSettings(req.org.id)}));
  await app.listen(port, '127.0.0.1');
  let stepping = false;
  const timer = setInterval(async()=>{
    if(stepping)return;stepping=true;
    try {
      // Browser time advances; only deterministic domain tests freeze the injected provider clock.
      f.provider.setNow(new Date());
      const jobs = await f.db.videoSubscriptionJob.findMany({where:{organizationId:{in:f.organizations},state:{in:['accepted','submitting','queued','running','saving']}}});
      for(const job of jobs) await f.subscriptions.runStep(job.organizationId,job.id);
      for(const job of await f.service.recoverPending()) if(f.organizations.includes(job.organizationId)) await f.service.runStep(job.organizationId,job.id);
    } catch {process.stderr.write('VIDEO_LOCAL_FIXTURE_STEP_FAILED\n');} finally {stepping=false;}
  },150);
  const close = async()=>{clearInterval(timer);await app.close();while(stepping)await new Promise(r=>setTimeout(r,25));await f.close();};
  return {f,app,api,frontend,counters,close};
}
if(require.main===module)startLocalSubscriptionFixture().then(instance=>{
  let closing=false;const close=async()=>{if(closing)return;closing=true;await instance.close();process.exit(0);};process.once('SIGINT',close);process.once('SIGTERM',close);
  const info = {api:instance.api,frontend:instance.frontend,uploadDirectory:instance.f.uploadDirectory,pieceId:instance.f.pieceId,fixture:true};
  if(process.env.CF_VIDEO_FIXTURE_INFO)fs.writeFileSync(process.env.CF_VIDEO_FIXTURE_INFO,JSON.stringify(info));
  process.stdout.write(JSON.stringify(info)+'\n');
}).catch(error=>{console.error(error);process.exitCode=1;});
module.exports={startLocalSubscriptionFixture};
