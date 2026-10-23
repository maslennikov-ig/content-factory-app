#!/usr/bin/env node
'use strict';
/** Local engineering fixture: real new HTTP doors/services/Prisma/storage;
 * synthetic identity and provider/Temporal transport. Never a production mode. */
require('reflect-metadata');
const fs = require('node:fs');
const path = require('node:path');
const jwt = require('jsonwebtoken');
const express = require('express');
const { Module, ValidationPipe } = require('@nestjs/common');
const { NestFactory, Reflector } = require('@nestjs/core');
const { create } = require('../../tests/helpers/video-domain-v1.fixture.cjs');
const { loadTypeScriptModule } = require('../../tests/helpers/load-ts-module.cjs');

async function main() {
  const port = Number(process.env.CF_VIDEO_FIXTURE_PORT || 43311);
  const frontend = process.env.CF_VIDEO_FIXTURE_FRONTEND || 'http://127.0.0.1:43310';
  if (!Number.isInteger(port) || port < 1024 || !/^http:\/\/127\.0\.0\.1:\d+$/.test(frontend)) throw new Error('Loopback fixture ports required');
  const fixture = await create(process.env.CF_VIDEO_DATABASE_URL, {frontendUrl: `http://127.0.0.1:${port}`, textKey: true});
  const controller = fixture.controller;
  const types = Reflect.getMetadata('design:paramtypes', controller.constructor);
  const {MediaRepository} = loadTypeScriptModule('libraries/nestjs-libraries/src/database/prisma/media/media.repository.ts');
  const mediaRepository = new MediaRepository({model: fixture.db});
  class FixtureModule {}
  Module({controllers: [controller.constructor], providers: types.map((token, index) => ({provide: token, useValue: index === 0 ? {getMedia: (...args) => mediaRepository.getMedia(...args)} : index === 1 ? fixture.service : fixture.credentials}))})(FixtureModule);
  const app = await NestFactory.create(FixtureModule, {logger: false});
  app.enableCors({origin: [frontend, frontend.replace('127.0.0.1', 'localhost')], credentials: true});
  app.useGlobalPipes(new ValidationPipe({transform: true, whitelist: true}));
  app.useGlobalGuards(new fixture.PoliciesGuard(new Reflector(), fixture.permissions));
  const server = app.getHttpAdapter().getInstance();
  const reader = await fixture.db.user.create({data: {email: `video-reader-${fixture.user.id}@example.invalid`, providerName: 'LOCAL', timezone: 0}});
  await fixture.db.userOrganization.create({data: {userId: reader.id, organizationId: fixture.org.id, role: 'USER'}});
  const identities = {admin: fixture.user.id, reader: reader.id, foreign: fixture.otherUser.id};
  server.get('/__fixture/signin/:role', (req, res) => {
    const id = identities[req.params.role];
    if (!id) return res.sendStatus(404);
    const token = jwt.sign({id}, process.env.JWT_SECRET, {expiresIn: '2h'});
    res.cookie('auth', token, {sameSite: 'lax', path: '/'});
    res.cookie('i18next', 'ru', {sameSite: 'lax', path: '/'});
    return res.json({pieceId: fixture.pieceId, orgId: fixture.org.id});
  });
  server.get('/__fixture/info', (_req, res) => res.json({pieceId: fixture.pieceId, orgId: fixture.org.id, boundary: 'synthetic identity and external transports; real video HTTP/service/repository/storage'}));
  server.get('/__fixture/counters', (_req, res) => res.json({submits: fixture.transport.submits.length, downloads: fixture.transport.downloads.length, polls: fixture.transport.polls.length}));
  // Match the existing public owned-storage URL used by <video>. Job lookup
  // and attachment download remain authenticated and tenant-scoped below.
  server.use('/uploads', express.static(fixture.uploadDirectory));
  server.use(async (req, res, next) => {
    try {
      const token = req.headers.auth || String(req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith('auth='))?.slice(5);
      const {id} = jwt.verify(token || '', process.env.JWT_SECRET);
      const membership = await fixture.db.userOrganization.findFirst({where: {userId: id, disabled: false}, include: {organization: true, user: true}});
      if (!membership) return res.sendStatus(401);
      req.user = membership.user;
      req.org = {...membership.organization, users: [membership]};
      req.fixtureRole = membership.role;
      return next();
    } catch { return res.sendStatus(401); }
  });
  server.get('/user/self', (req, res) => res.json({...req.user, language: 'ru', name: 'Видео V1', orgId: req.org.id, role: req.fixtureRole, tier: 'PRO', publicApi: '', totalChannels: 0, picture: null, impersonate: false, allowTrial: false, isTrailing: false, streakSince: null}));
  server.get('/user/organizations', (req, res) => res.json([{...req.org, role: req.fixtureRole}]));
  server.get('/content-intelligence/pieces', async (req, res) => res.json({pieces: await fixture.db.contentPiece.findMany({where: {organizationId: req.org.id}, select: {id: true, title: true}})}));
  server.get('/notifications', (_req, res) => res.json({total: 0}));
  server.get('/announcements', (_req, res) => res.json([]));
  server.get('/third-party', (_req, res) => res.json([]));
  server.get('/onboarding/progress', (_req, res) => res.json({complete: true, dismissed: true}));
  server.get('/notifications/list', (_req, res) => res.json({notifications: []}));
  server.get('/integrations/list', (_req, res) => res.json([]));
  server.get('/settings/ai', async (req, res) => res.json({usageMode: 'workspace_key', video: await fixture.credentials.getSettings(req.org.id)}));
  server.get('/onboarding', (_req, res) => res.json({complete: true, dismissed: true}));
  server.get('/agent/threads', (_req, res) => res.json([]));
  server.get('/agent/work-context', (_req, res) => res.json({version: 1, kind: 'workspace'}));
  await app.listen(port, '127.0.0.1');
  let stepping = false;
  const timer = setInterval(async () => {
    if (stepping) return;
    stepping = true;
    try { for (const job of await fixture.service.recoverPending()) {
      // Other acceptance fixtures may share this disposable cluster. This
      // local runner owns only the two synthetic workspaces it created.
      if (fixture.organizations.includes(job.organizationId)) await fixture.service.runStep(job.organizationId, job.id);
    } }
    catch (error) { process.stderr.write(`Fixture runner: ${error?.name || 'error'}\n`); }
    finally { stepping = false; }
  }, 200);
  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true;
    clearInterval(timer);
    await app.close();
    while (stepping) await new Promise(resolve => setTimeout(resolve, 25));
    try {
      await fixture.db.userOrganization.deleteMany({where: {userId: reader.id}});
      await fixture.db.user.delete({where: {id: reader.id}});
    } finally { await fixture.close(); }
    process.exit(0);
  };
  process.once('SIGINT', close); process.once('SIGTERM', close);
  const evidence = {api: `http://127.0.0.1:${port}`, frontend, pieceId: fixture.pieceId, orgId: fixture.org.id, fixture: true};
  if (process.env.CF_VIDEO_FIXTURE_INFO) fs.writeFileSync(path.resolve(process.env.CF_VIDEO_FIXTURE_INFO), JSON.stringify(evidence, null, 2));
  process.stdout.write(JSON.stringify(evidence) + '\n');
}
main().catch(error => {process.stderr.write(error.stack + '\n'); process.exitCode = 1;});
