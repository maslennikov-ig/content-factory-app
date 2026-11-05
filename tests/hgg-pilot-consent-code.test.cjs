const {loadTypeScriptModule}=require('./helpers/load-ts-module.cjs');
const {HttpException}=require('@nestjs/common');
const {Prisma}=require('@prisma/client');
const {SocialFactoryError}=require('./helpers/native-clip-production.fixture.cjs');
const root='libraries/nestjs-libraries/src/videos/subscriptions/';
const {hggPilotCodeV1}=loadTypeScriptModule(root+'video-hgg-pilot-policy.v1.ts');
const {HggPilotServiceV1}=loadTypeScriptModule(root+'video-hgg-pilot.service.v1.ts');

test.each([
 ['CLIP_WHOLE_PILOT_APPROVAL_REQUIRED','VIDEO_PILOT_EXECUTION_APPROVAL_REQUIRED'],
 ['CLIP_REPAIR_APPROVAL_REQUIRED','VIDEO_PILOT_REPAIR_APPROVAL_REQUIRED'],
 ['CLIP_REPAIR_APPROVAL_REQUIRED_EXTRA','VIDEO_PILOT_UNAVAILABLE'],
 ['CLIP_WHOLE_PILOT_APPROVAL_REQUIRED_EXTRA','VIDEO_PILOT_UNAVAILABLE'],
 ['CLIP_OTHER_BLOCKER','VIDEO_PILOT_UNAVAILABLE'],
 ['VIDEO_PILOT_STOPPED','VIDEO_PILOT_STOPPED'],
 ['SOURCE_ARTIFACT_STALE','SOURCE_ARTIFACT_STALE'],
 ['private remote prose','VIDEO_PILOT_UNAVAILABLE'],
])('maps only approved codes from HTTP and real domain errors (%s)',(code,expected)=>{
 expect(hggPilotCodeV1(new HttpException({code},409))).toBe(expected);
 expect(hggPilotCodeV1(new SocialFactoryError(code))).toBe(expected);
});

test.each([
 new Error('CLIP_REPAIR_APPROVAL_REQUIRED'),
 {code:'CLIP_REPAIR_APPROVAL_REQUIRED_EXTRA'},
 {code:['VIDEO_PILOT_STOPPED']},
 {code:{value:'VIDEO_PILOT_STOPPED'}},
 {getResponse:()=>({code:'CLIP_OTHER_BLOCKER'}),code:'CLIP_REPAIR_APPROVAL_REQUIRED'},
])('unknown, malformed, message-only or conflicting codes remain fail-closed (%#)',error=>{
 expect(hggPilotCodeV1(error)).toBe('VIDEO_PILOT_UNAVAILABLE');
});

test('qualified preview waits for real whole-pilot consent and retains its hash without enabling submit',async()=>{
 const stage={kind:'hgg-pilot-stage/v1',version:1,stage:'first_frame',publicOutputLocale:'en',references:[],requestHash:'a'.repeat(64),workspace:{bindingHash:'b'.repeat(64)},compiled:{input:{source:{pilotId:'synthetic-parent'}},modelBindingHash:'c'.repeat(64),settingsHash:'d'.repeat(64),inputOrderDigest:'e'.repeat(64)},capturedAt:'2026-01-01T00:00:00.000Z',localAdmissionExpiresAt:'2026-01-01T00:10:00.000Z'};
 const quote={quoteHash:'f'.repeat(64),cost:{credits:2.75,creditsExact:2.75}};
 const row={id:'synthetic-preflight',request:stage,quote,snapshot:{state:'quoted'}};
 const tx={};const repository={member:jest.fn(async()=>{}),transaction:async run=>run(tx),db:{videoAccessPreflight:{findFirst:async()=>row},videoSubscriptionJob:{findFirst:async()=>null}}};
 const parents={assertCurrentPilot:jest.fn(async()=>{throw new SocialFactoryError('CLIP_WHOLE_PILOT_APPROVAL_REQUIRED');})};
 const service=new HggPilotServiceV1(repository,{}, {},{},parents,{},{});
 const approvalHash='1'.repeat(64);
 // Isolate the read-time consent projection after existing local source/asset/budget qualification.
 service.assessment=jest.fn(async()=>({approvalHash,budget:{authorization:{id:'synthetic-authority',unit:'higgsfield_credit',pilotLimit:'10',stageLimit:'10',stages:['first_frame','last_frame','clip'],funding:'credits'},reserved:new Prisma.Decimal(0),remaining:new Prisma.Decimal(10),actualChargeUnknown:false}}));
 const view=await service.read('synthetic-org','synthetic-actor',row.id);
 expect(view).toMatchObject({state:'awaiting_approval',canSubmit:false,localInputValidated:true,approvalHash,blockers:['VIDEO_PILOT_EXECUTION_APPROVAL_REQUIRED']});
 expect(parents.assertCurrentPilot).toHaveBeenCalledWith(tx,expect.objectContaining({action:'admit',approvalHash}));
 expect(repository.db.videoSubscriptionJob).not.toHaveProperty('create');
});
