'use strict';
require('reflect-metadata');
const fs=require('node:fs');
const {loadWithMocks}=require('./helpers/load-ts-with-mocks.cjs');
const {loadAgentGraph}=require('../scripts/evidence/voice-eval/product-graph.cjs');
const {ContentContextRepository}=loadWithMocks('libraries/nestjs-libraries/src/content-intelligence/context/content-context.repository.ts',{
  '@contentfactory/nestjs-libraries/database/prisma/prisma.service':{PrismaRepository:class{},PrismaTransaction:class{}},
});
const {ContentContextBuilderV1}=loadWithMocks('libraries/nestjs-libraries/src/content-intelligence/context/content-context.builder.ts',{
  './content-context.repository':{ContentContextRepository:class{}},
  '@contentfactory/nestjs-libraries/content-intelligence/brand-profile/brand-profile.context.service':{BrandProfileContextService:class{}},
});
const now=new Date('2026-10-20T12:00:00Z'),future=new Date('2027-10-20T12:00:00Z');
const mathUrl='https://example.org/progress-in-mathematics/';
const quote='The programme commits $5m to progress in mathematics.';
const row=(id,url,excerpt=quote,changes={})=>({id,organizationId:'org-a',sourceSnapshotId:'ss-'+id,excerpt,excerptHash:null,
  exposure:'PUBLIC',tombstone:null,observedAt:now,freshUntil:future,freshnessStatus:'FRESH',
  assessment:{status:'PROPOSED',trustTier:'UNRATED',trustPolicyVersion:1},
  snapshot:{id:'ss-'+id,organizationId:'org-a',kind:'SEARCH_PROVIDER_RESULT',normalizedTitle:'Source',finalCanonicalUrl:url,
    publishedAt:null,observedAt:now,freshUntil:future,purgedAt:null,source:null},...changes});
const input=(core,extra={})=>({consumer:'GENERATOR',purpose:'DRAFT_CREATE',query:core,language:'en',freshnessMode:'PREFER_FRESH',
  asOf:now.toISOString(),brandProfileSelection:{mode:'none'},pieceEvidence:{version:'piece-evidence/v1',core,quotes:[],sourceUrls:[mathUrl]},...extra});
function harness(rows){
  const lookups=[];
  const client={contentFact:{findMany:async()=>[]},contentSource:{findMany:async()=>[]},sourceEvidence:{findMany:async query=>{
    lookups.push(query);
    if(query.where.id)return rows.filter(r=>r.organizationId===query.where.organizationId&&query.where.id.in.includes(r.id));
    const target=query.where.snapshot?.finalCanonicalUrl;
    return rows.filter(r=>(typeof target==='string'?r.snapshot.finalCanonicalUrl===target:target?.in?.includes(r.snapshot.finalCanonicalUrl))).slice(0,query.take);
  }}};
  const repository=new ContentContextRepository({model:client},{});
  const saved=[];
  repository.createSnapshot=async(org,snapshot,items)=>{const result={...snapshot,id:'context-'+saved.length,organizationId:org,items};saved.push(result);return result;};
  const builder=new ContentContextBuilderV1(repository,{resolve:async()=>({schemaVersion:'brand-profile-context/v1',selection:'none',applied:{mode:'neutral_fallback',reason:'explicit_none'},warnings:[]})},()=>now);
  return{repository,builder,lookups,saved};
}

test.each(['core','wish','priority'])('actual %s URL producer binds an omitted source through the real repository and builder as literal proof, without search/model/source mutation',async mode=>{
  const raw='Introduction. '.repeat(120)+quote+' Supporting detail. '.repeat(25);
  const math=row('math',mathUrl,raw),h=harness([math]),before=JSON.stringify(math);
  const core=`Two independent topics. The mathematics programme commits $5m.${mode==='wish'?'':` [Source](${mathUrl})`}`;
  const wish=mode==='core'?'':`Review this existing source <a href="${mathUrl}">source</a>.${mode==='priority'?' Also https://example.org/unknown.':''}`;
  const paid=jest.fn(()=>{throw Error('No model invocation is allowed');});
  const {AgentGraphService}=loadAgentGraph({chatModel:{withStructuredOutput:paid}});
  let request,context;
  const stop=new Error('Stop after real proof pack');
  const search=jest.fn(()=>{throw Error('No source refetch/search is allowed');});
  const service=new AgentGraphService({}, {}, {research:search}, {}, {build:async(org,value)=>{
    request=value;context=await h.builder.build(org,{...value,asOf:now.toISOString()});throw stop;
  }},{},null,null);
  const run=service.start('org-a',{research:'A short thesis',format:'one_long',language:'en',isPicture:false,materialPolicy:'PIECE_ONLY',
    intake:{core,post:{wish},material:[],evidenceQuotes:[],channel:{providerIdentifier:'telegram',writingProfile:{},maxLength:4096,editor:'normal'}}},{draftOnly:true});
  await expect(run.next()).rejects.toBe(stop);
  expect(request.pieceEvidence.sourceUrls).toEqual(mode==='priority'?[mathUrl,'https://example.org/unknown']:[mathUrl]);
  expect(context.evidence).toEqual([expect.objectContaining({evidenceId:'math',url:mathUrl,provenance:'SEARCH',literalSpans:expect.arrayContaining([expect.stringContaining(quote)])})]);
  expect(context.facts).toEqual([]); // no claim or semantic confirmation manufactured
  const {materialSupport}=loadWithMocks('libraries/nestjs-libraries/src/agent/adaptation-coverage.ts');
  expect(materialSupport({evidenceId:'math',sourceUrl:mathUrl,quote},context)).toEqual(expect.objectContaining({quote}));
  expect(materialSupport({evidenceId:'math',sourceUrl:mathUrl,quote:'A fabricated $9m claim.'},context)).toBeNull();
  expect(materialSupport({evidenceId:'math',sourceUrl:mathUrl},context)).toBeNull();
  expect(context.renderedCharacterCount).toBeLessThanOrEqual(24_000);
  expect(JSON.stringify(math)).toBe(before);
  expect(search).not.toHaveBeenCalled();expect(paid).not.toHaveBeenCalled();
  expect(h.lookups[0].where).toMatchObject({organizationId:'org-a',exposure:'PUBLIC'});
});

test('core URL alone, foreign, empty, blocked, rejected, stale and internal rows supply no evidence or invented fact',async()=>{
  const rows=[row('foreign',mathUrl,quote,{organizationId:'org-b'}),row('empty',mathUrl,''),
    row('blocked',mathUrl,quote,{assessment:{status:'ACCEPTED',trustTier:'BLOCKED'}}),
    row('rejected',mathUrl,quote,{assessment:{status:'REJECTED',trustTier:'UNRATED'}}),
    row('stale',mathUrl,quote,{freshUntil:new Date('2026-10-19'),freshnessStatus:'STALE'}),
    row('internal',mathUrl,quote,{exposure:'INTERNAL_ONLY'})];
  for(const evidence of [[],...rows.map(r=>[r])]){
    const h=harness(evidence),request=input(`The core claims $5m: ${mathUrl}`);
    const candidates=await h.repository.findCandidates('org-a',request);
    expect(candidates.evidence).toEqual([]);expect(candidates.facts).toEqual([]);
    const result=await h.builder.build('org-a',request);
    expect(result.evidence).toEqual([]);expect(result.facts).toEqual([]);
    expect(JSON.stringify(result)).not.toContain('foreign');
  }
});

test('explicit selected ID and quote outrank URL lookup; duplicate URLs cannot waste proof slots',async()=>{
  const selected=row('selected',mathUrl,'The selected excerpt retains this exact statement.'),alternative=row('alternative',mathUrl,quote);
  const h=harness([selected,alternative]);
  const request=input(`A claim with source ${mathUrl}`,{userMaterialEvidenceIds:['selected']});
  request.pieceEvidence.quotes=[{evidenceId:'selected',sourceUrl:mathUrl,quote:selected.excerpt}];
  request.pieceEvidence.sourceUrls=[mathUrl,mathUrl+'#section',mathUrl];
  const result=await h.builder.build('org-a',request);
  expect(result.evidence.map(e=>e.evidenceId)).toEqual(['selected']);
  expect(result.evidence[0].literalSpans.join('\n')).toContain(selected.excerpt);
  expect(h.lookups).toHaveLength(1); // selected-id lookup only, no competing URL row
});

test('URL expansion respects remaining sixteen-source budget and deterministic actual body selection',async()=>{
  const explicit=Array.from({length:15},(_,i)=>row('selected-'+i,`https://example.org/selected-${i}`,'Selected source '+i));
  const a=row('a-short',mathUrl,'A short fragment.'),b=row('b-full',mathUrl,quote);
  const h=harness([...explicit,a,b,row('extra','https://example.org/extra','Extra')]);
  const request=input(`The mathematics programme commits $5m. ${mathUrl}`,{userMaterialEvidenceIds:explicit.map(r=>r.id)});
  request.pieceEvidence.sourceUrls=[mathUrl,mathUrl+'#part','https://example.org/extra'];
  const result=await h.builder.build('org-a',request);
  expect(result.evidence).toHaveLength(16);
  expect(result.evidence.map(e=>e.evidenceId)).toContain('b-full');
  expect(result.evidence.map(e=>e.evidenceId)).not.toContain('extra');
  expect(result.renderedCharacterCount).toBeLessThanOrEqual(24_000);
  const full=harness([...explicit,row('sixteenth','https://example.org/sixteenth'),b]);
  request.userMaterialEvidenceIds=[...explicit.map(r=>r.id),'sixteenth'];
  const candidates=await full.repository.findCandidates('org-a',request);
  expect(candidates.evidence).toHaveLength(16);
  expect(full.lookups).toHaveLength(1);
});

test('ordinary HTTP context DTO cannot acquire the server-only saved-piece URL policy',async()=>{
  const {plainToInstance}=require('class-transformer'),{validate}=require('class-validator');
  const {BuildContentContextDto}=loadWithMocks('libraries/nestjs-libraries/src/dtos/content-intelligence/content-context.dto.ts');
  const dto=plainToInstance(BuildContentContextDto,input('A source URL alone is not evidence.'));
  await validate(dto,{whitelist:true});
  expect(dto.pieceEvidence).toBeUndefined();
  expect(dto.sourceUrls).toBeUndefined();
  expect(fs.readFileSync('apps/backend/src/main.ts','utf8')).toMatch(/whitelist:\s*true/);
});


test('URL selection honors the existing active-source rights, freshness and current-snapshot admission',async()=>{
  const active=row('registered',mathUrl,quote,{assessment:{status:'ACCEPTED',trustTier:'OFFICIAL'},
    snapshot:{...row('registered',mathUrl).snapshot,kind:'SOURCE',source:{id:'source',organizationId:'org-a',
      currentSnapshotId:'ss-registered',desiredState:'ACTIVE',rightsState:'CONFIRMED',robotsState:'ALLOWED',
      freshUntil:future,archivedAt:null,purgedAt:null,usagePurpose:'EVIDENCE'}}});
  expect((await harness([active]).builder.build('org-a',input('Progress in mathematics: $5m.'))).evidence.map(e=>e.evidenceId)).toEqual(['registered']);
  for(const patch of [{rightsState:'UNKNOWN'},{usagePurpose:'STYLE_REFERENCE'},{currentSnapshotId:'superseded'},{desiredState:'PAUSED'},{freshUntil:new Date('2026-10-19')}]){
    const unusable={...active,snapshot:{...active.snapshot,source:{...active.snapshot.source,...patch}}};
    expect((await harness([unusable]).repository.findCandidates('org-a',input('Progress in mathematics: $5m.'))).evidence).toEqual([]);
  }
});
