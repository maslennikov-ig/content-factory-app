const {loadTypeScriptModule}=require('./helpers/load-ts-module.cjs');
const base='libraries/nestjs-libraries/src/content-intelligence/social-factory/';
const wire=loadTypeScriptModule(base+'attribution/helixa-exchange.v1.ts');
const binding=loadTypeScriptModule(base+'attribution/helixa-binding.ts');
const repo=loadTypeScriptModule(base+'social-factory.repository.ts',{'../../database/prisma/prisma.service':{PrismaRepository:class{},PrismaTransaction:class{}}});
const {SocialFactoryHelixaExchangeService}=loadTypeScriptModule(base+'attribution/helixa-exchange.service.ts',{
 '../social-factory.repository':repo,'../learning/learning.service':{SocialFactoryLearningService:class{}},'./attribution.service':{SocialFactoryAttributionService:class{}},'./helixa-binding':binding,'./helixa-exchange.v1':wire});
const protocol=wire.HELIXA_EXCHANGE_PROTOCOL;
const scoped=()=>({contentFactoryOrganizationId:'org',helixaOrganizationId:'helixa-org',projectId:'project',origin:'https://helixa.example',sessionCookieVariable:'CF_HELIXA_SESSION_COOKIE_TEST',sessionCookie:'private-test-cookie',approvedOperations:['knowledge.read','crm.outcomes.read','knowledge.propose'],approvedBy:'human',expiresAt:'2099-01-01T00:00:00Z'});
const read={protocol,operation:'knowledge.read',projectId:'project',claimIds:['claim']};
const unavailable={id:'claim',status:'unavailable',eraseCurrentCopy:true};
function setup(response){const network=jest.fn(async()=>Response.json(response));const s=new SocialFactoryHelixaExchangeService({}, {},async()=>scoped(),network);return{s,network}}
test('missing and tenant/project/operation mismatched bindings never transmit a session',async()=>{
 const absent=new SocialFactoryHelixaExchangeService({}, {},async()=>null,jest.fn());expect((await absent.exchange('org',read)).status).toBe('not_connected');
 const {s,network}=setup({});expect((await s.exchange('another-org',read)).status).toBe('denied');expect(network).not.toHaveBeenCalled();
 expect((await s.exchange('org',{...read,projectId:'another-project'})).status).toBe('denied');
});
test('wire does not allow actor/tenant injection and pins native response tenant/resource order',async()=>{
 expect(wire.helixaRequestSchema.safeParse({...read,organizationId:'injected'}).success).toBe(false);
 const {s}=setup({protocol,operation:'knowledge.read',organizationId:'foreign',data:{claims:[unavailable]}});expect((await s.exchange('org',read)).status).toBe('unavailable');
 const b=setup({protocol,operation:'knowledge.read',organizationId:'helixa-org',data:{claims:[{...unavailable,id:'other'}]}});expect((await b.s.exchange('org',read)).status).toBe('unavailable');
});
test('current erasure is returned and no prior copy is used if the next native read fails',async()=>{
 const {s,network}=setup({protocol,operation:'knowledge.read',organizationId:'helixa-org',data:{claims:[unavailable]}});
 const r=await s.exchange('org',read);expect(r.status).toBe('available');expect(r.response.data.claims[0]).toEqual(unavailable);
 network.mockRejectedValueOnce(new Error('private internals'));expect(await s.exchange('org',read)).toEqual({status:'unavailable',reason:'helixa_fresh_evidence_unavailable',eraseCurrentCopy:true});
 expect(JSON.parse(network.mock.calls[0][1].body).expectedOrganizationId).toBe('helixa-org');
 expect(network.mock.calls[0][1]).toMatchObject({redirect:'error',cache:'no-store'});
});
test('won deal remains opportunity value with no fabricated payment or tracking attribution',async()=>{
 const outcome={id:'deal',status:'available',revision:1,statusClass:'won',attributionSourceRef:'kommo:lead_source:1',attributionSourceSemantics:'crm_lead_source',
 trackingAttribution:{status:'unavailable',reason:'canonical_tracking_link_absent'},openedAt:null,closedAt:'2026-11-01T00:00:00Z',effectiveAt:'2026-11-01T00:00:00Z',observedAt:'2026-11-01T01:00:00Z',
 dealValue:{amountMinor:150000,currency:'RUB',provenance:{currencySource:'account',currencyEvidenceRef:'currency-evidence',currencyObservedAt:'2026-11-01T00:00:00Z',minorUnitSource:'iso4217',minorUnitSourceVersion:'v1'}},
 payment:{status:'unavailable',reason:'canonical_payment_evidence_absent'},provenance:{sourceId:'crm',providerRecordRef:'1',evidenceRef:'e',sourceRevision:'r'},cache:'revalidate_before_use'};
 const {s}=setup({protocol,operation:'crm.outcomes.read',organizationId:'helixa-org',data:{outcomes:[outcome]}});const result=await s.exchange('org',{protocol,operation:'crm.outcomes.read',projectId:'project',recordIds:['deal']});
 expect(result.status).toBe('available');expect(result.response.data.outcomes[0]).toMatchObject({statusClass:'won',payment:{status:'unavailable'},trackingAttribution:{status:'unavailable'}});
 const bad=structuredClone(outcome);bad.payment={status:'received',amountMinor:150000};expect(wire.helixaResponseSchema.safeParse({protocol,operation:'crm.outcomes.read',organizationId:'helixa-org',data:{outcomes:[bad]}}).success).toBe(false);
});
test('feedback only submits exact accepted finding bytes with independently registered evidence receipt',async()=>{
 const finding={status:'accepted',channelIds:['channel'],statement:'Observed useful hook',uncertainty:'association only',interpretation:'association',observationIds:['o'],sourceIds:['source'],expiresAt:'2026-11-20T12:00:00Z'};
 const network=jest.fn(async()=>Response.json({protocol,operation:'knowledge.propose',organizationId:'helixa-org',data:{id:'new-claim',revision:1,reviewState:'candidate'}}));
 const s=new SocialFactoryHelixaExchangeService({read:async()=>({revision:2,payload:finding})},{forPlanning:async()=>({findingIds:['f']})},async()=>scoped(),network,()=>new Date('2026-11-03T12:00:00Z'));
 const prepared=await s.prepareFindingFeedback('org','f');expect(prepared.registrationRequired).toBe(true);
 const request={protocol,operation:'knowledge.propose',projectId:'project',commandId:'stable-command',occurredAt:'2026-11-03T12:00:00Z',validTo:'2026-11-20T12:00:00Z',basedOn:{claimId:'base',revision:1},statement:'model text ignored',feedbackEvidence:[{id:'receipt',organizationId:'helixa-org',sourceDomain:'content',sourceId:'registered',sourceRevisionId:'v1',artifactId:'artifact',evidenceHash:'a'.repeat(64),policyRevision:'policy',providerPermissionRequired:false}]};
 expect((await s.proposeFinding('org','f',request)).reason).toBe('exact_finding_artifact_registration_required');expect(network).not.toHaveBeenCalled();
 request.feedbackEvidence[0].evidenceHash=prepared.sha256;expect((await s.proposeFinding('org','f',request)).status).toBe('available');
 expect(JSON.parse(network.mock.calls[0][1].body).statement).toBe(finding.statement);
});

test('native mutation request includes the bound expected tenant before any side effect',async()=>{
 let nativeMutations=0;const fetcher=jest.fn(async(url,options)=>{const request=JSON.parse(options.body);const actualSessionOrganization='other-accessible-org';
 if(request.expectedOrganizationId!==actualSessionOrganization)return Response.json({error:{code:'denied'}},{status:403});nativeMutations++;return Response.json({})});
 const configured=scoped();configured.approvedOperations.push('knowledge.invalidate');
 const service=new SocialFactoryHelixaExchangeService({}, {},async()=>configured,fetcher);
 const result=await service.exchange('org',{protocol,operation:'knowledge.invalidate',projectId:'project',claimId:'same-id-in-two-orgs',expectedRevision:1,commandId:'command',occurredAt:'2026-11-03T12:00:00Z',reason:'owner revoked evidence'});
 expect(JSON.parse(fetcher.mock.calls[0][1].body).expectedOrganizationId).toBe('helixa-org');expect(nativeMutations).toBe(0);expect(result.status).toBe('denied');
});

function trackingFixture() {
 const linkId='c'.repeat(64), configured={...scoped(),crmTracking:{sourceId:'crm',fields:{link:'101',campaign:'102',source:'103',medium:'104',content:'105'}}};
 const local={status:'available',link:{id:linkId,level:'post'},fields:{link:linkId,campaign:'campaign',source:'telegram',medium:'social',content:'item'}};
 const attribution={trackingEvidence:jest.fn(async()=>local)};
 const network=jest.fn(async(url,options)=>{const request=JSON.parse(options.body),match=request.trackingMatch;
  return Response.json({protocol,operation:'crm.outcomes.read',organizationId:'helixa-org',data:{outcomes:[{
   id:'deal',status:'available',revision:1,statusClass:'won',attributionSourceRef:'kommo:lead_source:1',attributionSourceSemantics:'crm_lead_source',
   trackingAttribution:match?{status:'available',contractVersion:'content-factory.crm-tracking.v1',linkId:match.linkId,level:match.level,method:'exact_source_attributes',
    provenance:{organizationId:'helixa-org',projectId:'project',recordId:'deal',sourceId:'crm',providerRecordRef:'kommo:crm.leads:1',evidenceRef:'receipt',sourceRevision:'r1'},fields:Object.values(match.fields)}:
    {status:'unavailable',reason:'canonical_tracking_link_absent'},
   openedAt:null,closedAt:null,effectiveAt:'2026-11-03T12:00:00Z',observedAt:'2026-11-03T12:00:00Z',dealValue:null,
   payment:{status:'unavailable',reason:'canonical_payment_evidence_absent'},provenance:{sourceId:'crm',providerRecordRef:'kommo:crm.leads:1',evidenceRef:'receipt',sourceRevision:'r1'},cache:'revalidate_before_use'}]}});
 });
 const service=new SocialFactoryHelixaExchangeService({}, {},async()=>configured,network,()=>new Date('2026-11-04T12:00:00Z'),attribution);
 return{linkId,configured,local,attribution,network,service};
}
test('exact configured UTM mapping uses current local link and strict native receipt while old v1 read remains supported',async()=>{
 const f=trackingFixture();const input={projectId:'project',recordIds:['deal']};
 const result=await f.service.readAttributedOutcomes('org',f.linkId,input);
 expect(result.status).toBe('available');expect(result.response.data.outcomes[0]).toMatchObject({trackingAttribution:{status:'available',linkId:f.linkId,level:'post'},payment:{status:'unavailable'}});
 expect(JSON.parse(f.network.mock.calls[0][1].body).trackingMatch.fields).toEqual({link:{fieldRef:'101',value:f.linkId},campaign:{fieldRef:'102',value:'campaign'},source:{fieldRef:'103',value:'telegram'},medium:{fieldRef:'104',value:'social'},content:{fieldRef:'105',value:'item'}});
 expect(f.attribution.trackingEvidence).toHaveBeenCalledWith('org',f.linkId,new Date('2026-11-04T12:00:00Z'));
 const old=await f.service.exchange('org',{protocol,operation:'crm.outcomes.read',...input});expect(old.status).toBe('available');
 expect(JSON.parse(f.network.mock.calls[1][1].body)).not.toHaveProperty('trackingMatch');
 await expect(f.service.exchange('org',{protocol,operation:'crm.outcomes.read',...input,trackingMatch:JSON.parse(f.network.mock.calls[0][1].body).trackingMatch})).rejects.toMatchObject({code:'HELIXA_TRACKING_SERVER_CONTEXT_REQUIRED'});
});
test('unconfigured/missing/expired link authority never sends tracking claims, and account/campaign scope is retained',async()=>{
 const f=trackingFixture(),input={projectId:'project',recordIds:['deal']};delete f.configured.crmTracking;
 const disconnected=new SocialFactoryHelixaExchangeService({}, {},async()=>null,f.network);
 expect((await disconnected.readAttributedOutcomes('org',f.linkId,input)).status).toBe('not_connected');
 expect((await f.service.readAttributedOutcomes('org',f.linkId,input)).status).toBe('unavailable');expect(f.network).not.toHaveBeenCalled();
 f.configured.crmTracking={sourceId:'crm',fields:{link:'101',campaign:'102',source:'103',medium:'104'}};
 expect((await f.service.readAttributedOutcomes('org',f.linkId,input)).status).toBe('unavailable');expect(f.network).not.toHaveBeenCalled();
 for(const level of ['account','campaign']) {f.local.link.level=level;delete f.local.fields.content;
  expect((await f.service.readAttributedOutcomes('org',f.linkId,input)).response.data.outcomes[0].trackingAttribution.level).toBe(level);}
 f.attribution.trackingEvidence.mockResolvedValue({status:'unavailable',reason:'current_tracking_link_absent'});f.network.mockClear();
 expect((await f.service.readAttributedOutcomes('org',f.linkId,input)).status).toBe('unavailable');expect(f.network).not.toHaveBeenCalled();
});
test('local link revocation during native read cannot leave an available tracking copy',async()=>{
 const f=trackingFixture(),network=f.network.getMockImplementation();f.network.mockImplementation(async(...args)=>{
  const result=await network(...args);f.attribution.trackingEvidence.mockResolvedValue({status:'unavailable',reason:'current_tracking_link_absent'});return result;});
 expect(await f.service.readAttributedOutcomes('org',f.linkId,{projectId:'project',recordIds:['deal']})).toMatchObject({status:'unavailable',reason:'current_tracking_link_changed',eraseCurrentCopy:true});
});
test.each(['foreignTenant','wrongProject','staleParent','wrongLink','wrongLevel','wrongField','duplicateField','wrongSource','missingField'])(
 'strict CF consumer refuses %s tracking proof',async defect=>{
 const f=trackingFixture(),good=f.network.getMockImplementation();f.network.mockImplementation(async(...args)=>{const response=await good(...args),body=await response.json(),tracking=body.data.outcomes[0].trackingAttribution;
  if(defect==='foreignTenant')tracking.provenance.organizationId='foreign';if(defect==='wrongProject')tracking.provenance.projectId='foreign';
  if(defect==='staleParent')tracking.provenance.sourceRevision='old';if(defect==='wrongLink')tracking.linkId='a'.repeat(64);if(defect==='wrongLevel')tracking.level='account';
  if(defect==='wrongField')tracking.fields[0].value='different';if(defect==='duplicateField')tracking.fields[1]=tracking.fields[0];
  if(defect==='wrongSource')tracking.provenance.sourceId='another';if(defect==='missingField')tracking.fields.pop();return Response.json(body);});
 expect(await f.service.readAttributedOutcomes('org',f.linkId,{projectId:'project',recordIds:['deal']})).toMatchObject({status:'unavailable',eraseCurrentCopy:true});
});

test('native finding capability keeps the target ID outside the strict registered Helixa proposal',async()=>{
 const finding={status:'accepted',channelIds:['channel'],statement:'Observed useful hook',uncertainty:'association only',interpretation:'association',observationIds:['o'],sourceIds:['source'],expiresAt:'2026-11-20T12:00:00Z'};
 const reads=[];
 const store={read:async(org,kind,id)=>{reads.push([org,kind,id]);return org==='org'&&kind==='finding'&&id==='target-finding'?{revision:2,payload:finding}:null;}};
 const network=jest.fn(async(_url,options)=>{
  const request=wire.helixaRequestSchema.parse(JSON.parse(options.body));
  expect(request).not.toHaveProperty('findingId');
  expect(request).toMatchObject({expectedOrganizationId:'helixa-org',operation:'knowledge.propose',projectId:'project',statement:finding.statement,validTo:finding.expiresAt});
  return Response.json({protocol,operation:'knowledge.propose',organizationId:'helixa-org',data:{id:'new-candidate',revision:1,reviewState:'candidate'}});
 });
 const service=new SocialFactoryHelixaExchangeService(store,{forPlanning:async()=>({findingIds:['target-finding']})},async()=>scoped(),network,()=>new Date('2026-11-03T12:00:00Z'));
 const prepared=await service.prepareFindingFeedback('org','target-finding');
 const input={findingId:'target-finding',projectId:'project',commandId:'native-proposal',occurredAt:'2026-11-03T12:00:00Z',basedOn:{claimId:'base',revision:1},sensitive:false,
  feedbackEvidence:[{id:'registered-receipt',sourceDomain:'content',sourceId:'registered-source',sourceRevisionId:'v2',artifactId:'artifact',evidenceHash:prepared.sha256,policyRevision:'policy',providerPermissionRequired:false}]};
 const {findingId,...httpBody}=input;
 const {findingProposalSchema}=loadTypeScriptModule(base+'contracts/social-factory.production.schemas.v1.ts');
 expect(findingProposalSchema.omit({findingId:true}).safeParse(httpBody).success).toBe(true);
 expect(findingProposalSchema.omit({findingId:true}).safeParse(input).success).toBe(false);
 const capability=require('./helpers/agent-capabilities.cjs').loadRegistry().CAPABILITY_CATALOGUE.find(row=>row.id==='campaign.propose_finding');
 const result=await capability.run({organizationId:'org',service:token=>{expect(token.name).toBe('SocialFactoryHelixaExchangeService');return service;}},input);
 expect(result).toMatchObject({status:'available',response:{data:{id:'new-candidate',reviewState:'candidate'}}});
 expect(network).toHaveBeenCalledTimes(1);
 expect(reads.every(row=>JSON.stringify(row)===JSON.stringify(['org','finding',findingId]))).toBe(true);
 expect(JSON.parse(network.mock.calls[0][1].body).feedbackEvidence[0].organizationId).toBe('helixa-org');
});
