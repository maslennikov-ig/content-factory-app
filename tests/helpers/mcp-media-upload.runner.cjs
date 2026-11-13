'use strict';
require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomUUID, randomBytes, createHash } = require('node:crypto');
const { Readable } = require('node:stream');
const { runInNewContext } = require('node:vm');
const { webcrypto } = require('node:crypto');
const { existsSync } = require('node:fs');
const fs = require('node:fs/promises');
const http = require('node:http');
const { Module, NotFoundException } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const { loadTypeScriptModule } = require('./load-ts-module.cjs');
const { loadRegistry, IDENTITY, permissionsService, exceptions } = require('./agent-capabilities.cjs');

const registry = loadRegistry();
const { MockRedis } = loadTypeScriptModule('libraries/nestjs-libraries/src/redis/redis.service.ts');
const redis = new MockRedis();
let disabled = false, activated = true, role = 'EDITOR', storageWrites = 0;
const rows = new Map();
const contents = new Map();
const spools = new Set();
const { openDiskUploadV1 } = loadTypeScriptModule('libraries/nestjs-libraries/src/upload/disk.upload.v1.ts');
const media = {
  async getMediaById(org, id) { const row = rows.get(id); return row && row.organizationId === org && !row.deletedAt ? row : null; },
  async saveFile(org, name, path, originalName) { const row = { id: randomUUID(), name, path, originalName, organizationId: org }; rows.set(row.id, row); return row; },
  async openOwnedMediaV1(org, id) { const row = await this.getMediaById(org, id); if(!row)throw new NotFoundException(); return { stream: Readable.from(contents.get(row.path)), contentType: 'image/png', close: async () => {} }; },
};
const organizations = { async getOrgsByUserId() { return [{id:'org-1',createdAt:new Date('2026-01-01'),users:[{disabled,role}]}]; } };
const users = { async getUserById() { return { activated }; } };
const permissions = permissionsService();
const serviceModule = loadTypeScriptModule('libraries/nestjs-libraries/src/chat/media/mcp-media-upload.service.v1.ts', {
  '@contentfactory/nestjs-libraries/database/prisma/media/media.service': { MediaService: class MediaService {} },
  '@contentfactory/nestjs-libraries/database/prisma/organizations/organization.service': { OrganizationService: class OrganizationService {} },
  '@contentfactory/nestjs-libraries/database/prisma/users/users.service': { UsersService: class UsersService {} },
  '@contentfactory/backend/services/auth/permissions/permissions.service': { PermissionsService: class PermissionsService {} },
  '@contentfactory/backend/services/auth/permissions/permission.exception.class': exceptions,
  '@contentfactory/nestjs-libraries/redis/redis.service': { ioRedis: redis },
  '@contentfactory/nestjs-libraries/upload/upload.factory': { UploadFactory: {createStorage:()=>({async uploadFileFromDiskV1(file){
    assert.equal(file.buffer,undefined);assert(spools.has(require('node:path').dirname(file.path)));
    const source=await openDiskUploadV1(file);try{const chunks=[];for await(const chunk of source.stream){assert(chunk.length<=64*1024);chunks.push(chunk);}storageWrites++;const path='private/'+randomUUID();contents.set(path,Buffer.concat(chunks));return {path,originalname:file.originalname,mimetype:source.mimetype};}finally{await source.close();}
  }})} },
});
const uploads = new serviceModule.McpMediaUploadServiceV1(media, organizations, users, permissions);
const controller = loadTypeScriptModule('apps/backend/src/api/routes/mcp-media.controller.ts', {
  '@contentfactory/nestjs-libraries/chat/media/mcp-media-upload.service.v1': serviceModule,
  'node:fs/promises': {...fs,mkdtemp:async(prefix)=>{const directory=await fs.mkdtemp(prefix);spools.add(directory);return directory;}},
});
const { McpServers } = loadTypeScriptModule('libraries/nestjs-libraries/src/chat/start.mcp.ts', {
  '@contentfactory/backend/services/auth/permissions/permissions.service': { PermissionsService: permissions.constructor },
  ...Object.fromEntries(['capability.registry','door-policy','capability.context','mcp.adapter','person-time'].map(file=>[
    '@contentfactory/nestjs-libraries/chat/capabilities/'+file, registry,
  ])),
});

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aM9sAAAAASUVORK5CYII=', 'base64');
const fileSpec = { name:'fixture.png',size:png.length,nonce:randomUUID() };
const unwrap = result => { const raw = result.structuredContent || JSON.parse(result.content.find(c=>c.type==='text').text); if(raw.ok===false)return raw; return raw.summary?.untrustedData?.value||raw.summary||raw; };
const report = {};
let app, client;
(async()=>{
  class TestModule {}
  Module({controllers:[controller.McpMediaControllerV1],providers:[
    {provide:serviceModule.McpMediaUploadServiceV1,useValue:uploads},controller.McpMediaTicketInterceptorV1,
  ]})(TestModule);
  app = await NestFactory.create(TestModule,{logger:false});
  const servers = new McpServers({get: token => token.name === 'PermissionsService' ? permissions : token.name === 'McpMediaUploadServiceV1' ? uploads : token.name === 'PieceService' ? {async editAdaptation(...args){report.attached = args;return {adaptation:{postId:'post-1'}};}} : media});
  app.use(async(req,res,next)=>{
    if(req.path !== '/mcp')return next();
    if(req.method !== 'POST')return res.status(405).end();
    if(req.headers.authorization !== 'Bearer test-oauth-actor')return res.status(401).end();
    const identity={...IDENTITY,role};req.auth={token:'grant:test',clientId:'test',scopes:['mcp'],extra:{identity}};
    try{await servers.handle(req,res,identity);}catch(error){next(error);}
  });
  await app.listen(0,'127.0.0.1');
  const base=await app.getUrl();process.env.NEXT_PUBLIC_BACKEND_URL=base;process.env.FRONTEND_URL='http://frontend.test';process.env.MCP_ENABLED='true';delete process.env.MCP_URL;
  client=new Client({name:'MCP media fixture',version:'1.0.0'},{capabilities:{extensions:{'io.modelcontextprotocol/ui':{}}}});
  await client.connect(new StreamableHTTPClientTransport(new URL(base+'/mcp'),{requestInit:{headers:{Authorization:'Bearer test-oauth-actor'}}}));
  const call=(name,args={})=>client.callTool({name,arguments:args});
  const list=await client.listTools();
  assert.equal(list.tools.find(t=>t.name==='media_upload')._meta.ui.resourceUri,'ui://content-factory/media-upload/v1');
  assert.deepEqual(list.tools.find(t=>t.name==='media_upload_ticket')._meta.ui.visibility,['app']);
  const resource=await client.readResource({uri:'ui://content-factory/media-upload/v1'});
  assert(resource.contents[0].text.includes('credentials:\'omit\''));
  assert(!resource.contents[0].text.includes('test-oauth-actor'));report.resource=true;
  const session=unwrap(await call('media_upload'));
  assert.equal(session.state,'waiting');assert.equal(session.manualUploadUrl,'http://frontend.test/media');
  assert.equal(unwrap(await call('media_upload_status',{sessionId:session.sessionId})).state,'waiting');
  const issued=await call('media_upload_ticket',{sessionId:session.sessionId,file:fileSpec});
  const privateTicket=issued._meta['contentFactory/upload'];
  assert(privateTicket.ticket);assert(!JSON.stringify(issued.content).includes(privateTicket.ticket));assert(!JSON.stringify(issued.structuredContent||{}).includes(privateTicket.ticket));report.privateEnvelope=true;
  const form=new FormData();form.append('file',new Blob([png],{type:'image/png'}),fileSpec.name);
  const uploaded=await fetch(privateTicket.uploadUrl,{method:'POST',headers:{Accept:'application/json; cf-upload-ticket='+privateTicket.ticket,Origin:'https://sandbox.example'},body:form});
  assert.equal(uploaded.status,201,await uploaded.clone().text());assert.equal(uploaded.headers.get('access-control-allow-origin'),'*');
  const ready=unwrap(await call('media_upload_status',{sessionId:session.sessionId}));
  assert.equal(ready.state,'ready');assert(ready.media.mediaId);assert(!('path' in ready.media));
  assert.equal(ready.sha256,createHash('sha256').update(png).digest('hex'));assert([...spools].every(directory=>!existsSync(directory)));
  const preview=await fetch(ready.media.previewUrl);assert.equal(preview.status,200);assert((await preview.arrayBuffer()).byteLength===png.length);assert.equal(preview.headers.get('cache-control'),'private, no-store');
  const replay=new FormData();replay.append('file',new Blob([png]),fileSpec.name);
  assert.equal((await fetch(privateTicket.uploadUrl,{method:'POST',headers:{Accept:'application/json; cf-upload-ticket='+privateTicket.ticket},body:replay})).status,403);
  assert.equal(storageWrites,1);report.uploadStatusPreview=true;
  await assert.rejects(()=>uploads.status({...IDENTITY,userId:'another'},session.sessionId));
  await assert.rejects(()=>uploads.status({...IDENTITY,organizationId:'foreign'},session.sessionId));
  const foreign=await media.saveFile('foreign','foreign.png','foreign/path','foreign.png');
  await assert.rejects(()=>uploads.metadata(IDENTITY,foreign.id));
  rows.get(ready.media.mediaId).deletedAt=new Date();assert.equal((await fetch(ready.media.previewUrl)).status,404);
  assert.equal(unwrap(await call('media_upload_status',{sessionId:session.sessionId})).state,'failed');
  rows.get(ready.media.mediaId).deletedAt=null;report.ownership=true;
  const mismatchSession=await uploads.create(IDENTITY);const mismatchTicket=await uploads.ticket(IDENTITY,mismatchSession.sessionId,fileSpec);const bound=await uploads.claim(mismatchTicket.ticket);
  assert.equal((await uploads.status(IDENTITY,mismatchSession.sessionId)).state,'uploading');
  await assert.rejects(()=>uploads.upload(bound,{originalname:'other.png',size:png.length,buffer:png,mimetype:'image/png'}));
  assert.equal((await uploads.status(IDENTITY,mismatchSession.sessionId)).state,'failed');assert.equal(storageWrites,1);
  const invalidSession=await uploads.create(IDENTITY);const invalid=Buffer.from('not an image');
  const invalidTicket=await uploads.ticket(IDENTITY,invalidSession.sessionId,{name:'fake.png',size:invalid.length,nonce:randomUUID()});
  const invalidForm=new FormData();invalidForm.append('file',new Blob([invalid]),'fake.png');
  assert.equal((await fetch(privateTicket.uploadUrl,{method:'POST',headers:{Accept:'application/json; cf-upload-ticket='+invalidTicket.ticket},body:invalidForm})).status,400);
  assert.equal((await uploads.status(IDENTITY,invalidSession.sessionId)).state,'failed');assert.equal(storageWrites,1);report.validation=true;
  assert([...spools].every(directory=>!existsSync(directory)));
  const consentSession=await uploads.create(IDENTITY);const revoked=await uploads.ticket(IDENTITY,consentSession.sessionId,fileSpec);disabled=true;
  await assert.rejects(()=>uploads.claim(revoked.ticket));disabled=false;
  activated=false;await assert.rejects(()=>uploads.create(IDENTITY));activated=true;
  role='USER';const denied=await call('media_upload');assert.equal(denied.isError,true);await assert.rejects(()=>uploads.create(IDENTITY));
  role='EDITOR';report.authorization=true;
  const metadata=unwrap(await call('media_inspect',{mediaId:ready.media.mediaId}));assert.equal(metadata.mediaId,ready.media.mediaId);
  const attachment=unwrap(await call('adaptation_image',{pieceId:'p1',adaptationId:'a1',mediaId:ready.media.mediaId,alt:'Alternative',thumbnailMediaId:null,thumbnailTimestamp:4000}));
  assert.equal(attachment.image,true);assert.equal(attachment.media.mediaId,ready.media.mediaId);
  assert.equal(attachment.previewUrl,'http://frontend.test/p/post-1');
  assert.deepEqual(report.attached[3],{image:{id:ready.media.mediaId,alt:'Alternative',thumbnailMediaId:null,thumbnailTimestamp:4000}});delete report.attached;
  assert.equal(registry.adaptationImage.input.safeParse({pieceId:'p1',adaptationId:'a1',mediaId:ready.media.mediaId,thumbnailTimestamp:0}).success,true);
  assert.equal(registry.adaptationImage.input.safeParse({pieceId:'p1',adaptationId:'a1',mediaId:ready.media.mediaId,thumbnailTimestamp:.5}).success,false);
  const invalidInput=unwrap(await call('media_upload_ticket',{sessionId:session.sessionId,file:{...fileSpec,buffer:'PRIVATE-BINARY',path:'/etc/passwd'}}));
  assert.equal(invalidInput.ok,false);assert(!JSON.stringify(invalidInput).includes('PRIVATE-BINARY'));report.attachmentAndInput=true;
  const expirySession=await uploads.create(IDENTITY);const expiring=await uploads.ticket(IDENTITY,expirySession.sessionId,fileSpec);
  const realNow=Date.now;
  try{Date.now=()=>realNow()+121000;await assert.rejects(()=>uploads.claim(expiring.ticket));}finally{Date.now=realNow;}
  const firstTicket=await uploads.ticket(IDENTITY,expirySession.sessionId,fileSpec),secondTicket=await uploads.ticket(IDENTITY,expirySession.sessionId,fileSpec);
  await assert.rejects(()=>uploads.ticket(IDENTITY,expirySession.sessionId,{...fileSpec,nonce:randomUUID()}));
  const claimed=await Promise.allSettled([uploads.claim(firstTicket.ticket),uploads.claim(secondTicket.ticket)]);
  assert.equal(claimed.filter(one=>one.status==='fulfilled').length,1);
  try{Date.now=()=>realNow()+16*60*1000;await assert.rejects(()=>uploads.status(IDENTITY,expirySession.sessionId));}finally{Date.now=realNow;}
  report.expiryAndSingleFile=true;

  // Execute the actual resource script, its host bridge and file event against
  // the same real SDK and validated HTTP uploader. DOM layout is not simulated.
  const elements=Object.fromEntries(['file','status','manual','another','title','hint','label'].map(id=>[id,{dataset:{},events:{},addEventListener(name,fn){this.events[name]=fn;}}]));
  const listeners={};let contextUpdate;
  const host={postMessage(message){if(message.method==='ui/update-model-context'){contextUpdate=message.params;return;}if(message.id===undefined)return;
    Promise.resolve(message.method==='tools/call'?call(message.params.name,message.params.arguments):{}).then(result=>listeners.message({source:host,data:{jsonrpc:'2.0',id:message.id,result}}));
  }};
  const window={parent:host,addEventListener(name,fn){listeners[name]=fn;}};
  assert(!resource.contents[0].text.includes('file.arrayBuffer'));
  runInNewContext(resource.contents[0].text.match(/<script>([\s\S]*)<\/script>/)[1],{
    window,document:{getElementById:id=>elements[id],body:{scrollHeight:320}},crypto:webcrypto,FormData,fetch,AbortSignal,
    setTimeout:(fn,ms)=>{const timer=setTimeout(fn,ms);timer.unref();return timer;},clearTimeout,
  });
  const widgetSession=await call('media_upload');
  listeners.message({source:host,data:{jsonrpc:'2.0',method:'ui/notifications/tool-result',params:widgetSession}});
  assert.equal(elements.file.disabled,false);
  elements.file.files=[new File([png],'widget.png',{type:'image/png'})];
  await elements.file.events.change();
  assert.equal(elements.status.dataset.error,'false');assert(elements.status.textContent.includes('widget.png'));assert(contextUpdate.content[0].text.includes('"state":"ready"'));
  assert(!JSON.stringify(contextUpdate).includes('cf-upload-ticket'));assert.equal(storageWrites,2);report.widget=true;
  const tooLargeSession=await uploads.create(IDENTITY),tooLargeTicket=await uploads.ticket(IDENTITY,tooLargeSession.sessionId,{...fileSpec,size:1,nonce:randomUUID()});
  const overLimit=new FormData();overLimit.append('file',new Blob([png]),fileSpec.name);
  assert.equal((await fetch(privateTicket.uploadUrl,{method:'POST',headers:{Accept:'application/json; cf-upload-ticket='+tooLargeTicket.ticket},body:overLimit})).status,400);
  assert.equal((await uploads.status(IDENTITY,tooLargeSession.sessionId)).state,'failed');assert([...spools].every(directory=>!existsSync(directory)));
  const abortSession=await uploads.create(IDENTITY),abortTicket=await uploads.ticket(IDENTITY,abortSession.sessionId,{...fileSpec,nonce:randomUUID()});
  const boundary='mcp-fixture-boundary';
  const interrupted=http.request(privateTicket.uploadUrl,{method:'POST',headers:{Accept:'application/json; cf-upload-ticket='+abortTicket.ticket,'Content-Type':'multipart/form-data; boundary='+boundary}});
  interrupted.on('error',()=>{});interrupted.write('--'+boundary+'\r\nContent-Disposition: form-data; name="file"; filename="fixture.png"\r\nContent-Type: image/png\r\n\r\n');interrupted.write(png.subarray(0,8));
  const until=async(predicate)=>{for(let attempt=0;attempt<100;attempt++){if(await predicate())return;await new Promise(resolve=>setTimeout(resolve,10));}throw new Error('Fixture deadline');};
  await until(async()=>(await uploads.status(IDENTITY,abortSession.sessionId)).state==='uploading');interrupted.destroy();
  await until(async()=>(await uploads.status(IDENTITY,abortSession.sessionId)).state==='failed'&&[...spools].every(directory=>!existsSync(directory)));
  assert.equal(storageWrites,2);report.diskSpool=true;
  const localPhoto = async (name, digest) => {
    const proof = randomBytes(32).toString('base64url');
    const prepared = await call('media_upload', { photo: {
      name, size: png.length, sha256: digest,
      uploadProofSha256: createHash('sha256').update(proof).digest('hex'),
    } });
    assert(!JSON.stringify(prepared).includes(proof));
    const session = unwrap(prepared);
    assert.equal(session.transport, 'multipart');
    assert.equal(session.uploadUrl, privateTicket.uploadUrl);
    await assert.rejects(() => uploads.ticket(IDENTITY, session.sessionId, { ...fileSpec, name }));
    const send = () => {
      const body = new FormData();
      body.append('file', new Blob([png], { type: 'image/png' }), name);
      return fetch(session.uploadUrl, {
        method: 'POST', headers: { Accept: 'application/json; cf-upload-ticket=' + proof }, body,
      });
    };
    return { session, send };
  };
  const local = await localPhoto('local.png', createHash('sha256').update(png).digest('hex'));
  assert.equal((await local.send()).status, 201);
  const localReceipt = unwrap(await call('media_upload_status', { sessionId: local.session.sessionId }));
  assert.equal(localReceipt.state, 'ready');
  assert.equal(localReceipt.media.name, 'local.png');
  assert.equal((await local.send()).status, 403);
  const mismatch = await localPhoto('different.png', '0'.repeat(64));
  assert.equal((await mismatch.send()).status, 400);
  assert.equal(unwrap(await call('media_upload_status', { sessionId: mismatch.session.sessionId })).state, 'failed');
  assert.equal(storageWrites, 3);
  assert([...spools].every(directory => !existsSync(directory)));
  report.directPhoto = true;
  await client.close();await app.close();console.log('REPORT '+JSON.stringify(report));
})().catch(async error=>{console.error(error);await client?.close().catch(()=>{});await app?.close().catch(()=>{});process.exitCode=1;});
