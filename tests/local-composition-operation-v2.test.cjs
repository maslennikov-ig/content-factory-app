const {test}=require('node:test');const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {loadTypeScriptModule}=require('./helpers/load-ts-module.cjs');
const {LocalCompositionOperationV2}=loadTypeScriptModule('libraries/nestjs-libraries/src/content-intelligence/social-factory/local-composition.operation.v2.ts',{
 './social-factory.repository':{SocialFactoryRepository:class{},SocialFactoryError:class extends Error{constructor(code){super(code);this.code=code;}}},
});
const sha=x=>createHash('sha256').update(x).digest('hex');
class Store{
 constructor(parent){this.parent=parent;this.rows=parent?structuredClone(parent.rows):new Map();this.tail=Promise.resolve();}
 async transact(work){if(this.parent)return work(this);const before=this.tail;let release;this.tail=new Promise(r=>release=r);await before;try{const scoped=new Store(this),result=await work(scoped);this.rows=scoped.rows;return result;}finally{release();}}
 async read(org,kind,id){return structuredClone(this.rows.get(org+':'+kind+':'+id)||null);}
 async put(x){const key=x.organizationId+':'+x.kind+':'+x.id,before=this.rows.get(key);assert.equal(x.expectedRevision,before?.revision??0);const row={...structuredClone(x),revision:x.expectedRevision+1,sourceIds:x.sourceIds??[]};this.rows.set(key,row);return structuredClone(row);}
 async assertSourceAdmissions(){}
}
async function fixture(){
 const store=new Store(),source={organizationId:'org',actorId:'actor',ref:{version:1,kind:'piece',pieceId:'piece',revision:sha('rev')},contentDigest:sha('text'),locale:'en-US'};
 const material={version:1,channelId:'channel',platform:'youtube',format:'long_video',title:'Final',hook:'Hook',body:'Body',script:'Speech',caption:'Description',assets:[],settings:{},evidence:[],sourceArtifact:source.ref};
 const parent={version:2,id:'op',campaignId:'campaign',itemId:'item',state:'needs_video',sourceContentRevision:1,baseInput:{actorId:'actor',sourceArtifact:source},campaignAuthority:{mode:'collaborative'},material};
 await store.put({organizationId:'org',kind:'editorial',id:'op',parentId:'campaign',expectedRevision:0,payload:parent});
 await store.put({organizationId:'org',kind:'campaign',id:'campaign',expectedRevision:0,payload:{version:1,id:'campaign',state:'active',mode:'collaborative'}});
 await store.put({organizationId:'org',kind:'campaign_item',id:'item',expectedRevision:0,payload:{version:1,id:'item',campaignId:'campaign',channelId:'channel',platform:'youtube',format:'long_video',contentRevision:1,state:'needs_input',material}});
 const manifest={version:3,kind:'local_owned_composition',source:{pieceId:'piece',revision:source.ref.revision,textSha256:source.contentDigest},title:'Final',locale:'en-US',funding:{kind:'local_compute',scope:'final_only'},settings:{width:1920,height:1080,fps:30,fit:'contain_pad',transition:'hard_cut',captions:'none'},scenes:[{id:'one',mediaId:'clip',durationSeconds:600,sourceAudio:'silent'}]};
 let dispatch=0,renders=0,applied=0,current=true,blocked,failOnce=false;
 const host={material:op=>structuredClone(op.material),current:async(org,op,s=store)=>{assert.ok(current,'SOURCE_STALE');const item=(await s.read(org,'campaign_item','item')).payload;assert.equal(item.contentRevision,op.appliedContentRevision??op.sourceContentRevision);return {campaign:{id:'campaign',state:'active'},item};},
  preflight:async()=>{},sourceProduction:async()=>undefined,
  inspect:async(_org,m)=>({status:'ready',material:m,inspection:{complete:true}}),
  apply:async(org,actor,op,owner,complete)=>store.transact(async s=>{await host.current(org,op,s);const p=await s.read(org,'editorial','op');assert.equal(p.payload.owner,owner);const item=await s.read(org,'campaign_item','item');const next={...p.payload,state:'ready',appliedContentRevision:item.payload.contentRevision+1,owner:undefined,leaseUntil:undefined};await s.put({...item,expectedRevision:item.revision,payload:{...item.payload,contentRevision:next.appliedContentRevision,state:'ready',material:op.material}});await s.put({...p,expectedRevision:p.revision,payload:next});await complete(s,next);applied++;return {state:'ready'};})};
 const producer={produce:async(_org,_source,m,_manifest,checkpoint,onCheckpoint,options)=>{if(!checkpoint.asset)renders++;if(blocked)await blocked(options);await options.assertCurrent();await onCheckpoint({...checkpoint,asset:{mediaId:'final'},rendered:{renderKey:sha('render')}});if(failOnce){failOnce=false;throw Error('CONTROLLED_PROCESS_LOSS');}return {...m,assets:[{id:'final',mediaId:'final',kind:'video'}]};}};
 const operation=new LocalCompositionOperationV2(store,producer,host,{start:async()=>{dispatch++;}}),input={operationId:'op',expectedContentRevision:1,requestId:'request',manifest};
 return {store,operation,input,manifest,get dispatch(){return dispatch;},get renders(){return renders;},get applied(){return applied;},stale(){current=false;},block(fn){blocked=fn;},failAfterCheckpoint(){failOnce=true;}};
}
test('concurrent exact starts persist one descriptor/revision and completed retry never renders or applies twice',async()=>{
 const f=await fixture(),[a,b]=await Promise.all([f.operation.start('org','actor',f.input),f.operation.start('org','actor',f.input)]);assert.equal(a.id,b.id);
 const queued=(await f.store.read('org','campaign_item','item')).payload;assert.equal(queued.contentRevision,2);assert.equal(queued.state,'preparing');
 await Promise.all([f.operation.run('org','op',a.id),f.operation.run('org','op',a.id)]);const replay=await f.operation.start('org','actor',f.input);assert.equal(replay.state,'completed');assert.equal(f.renders,1);assert.equal(f.applied,1);
 assert.equal((await f.store.read('org','campaign_item','item')).payload.contentRevision,3);
});
test('an explicit retry resumes a saved checkpoint without another render or another claimed revision',async()=>{
 const f=await fixture(),job=await f.operation.start('org','actor',f.input);f.failAfterCheckpoint();
 assert.equal((await f.operation.run('org','op',job.id)).state,'failed');assert.equal(f.applied,0);
 const failed=await f.operation.open('org','actor','op',job.id);assert.deepEqual(failed.resumeInput,{operationId:'op',compositionId:job.id});
 await assert.rejects(f.operation.start('org','actor',{...failed.resumeInput,manifest:f.manifest}));
 await f.operation.start('org','actor',{...failed.resumeInput,expectedContentRevision:undefined,requestId:undefined,manifest:undefined});assert.equal((await f.store.read('org','campaign_item','item')).payload.contentRevision,2);
 await f.operation.run('org','op',job.id);assert.equal(f.renders,1);assert.equal(f.applied,1);
});
test('a newer item edit cannot be hidden by updating the parent revision while the old composition is queued',async()=>{
 const f=await fixture(),job=await f.operation.start('org','actor',f.input);
 const item=await f.store.read('org','campaign_item','item');await f.store.put({...item,expectedRevision:item.revision,payload:{...item.payload,contentRevision:3}});
 const parent=await f.store.read('org','editorial','op');await f.store.put({...parent,expectedRevision:parent.revision,payload:{...parent.payload,appliedContentRevision:3}});
 await f.operation.run('org','op',job.id);assert.equal(f.renders,0);assert.equal(f.applied,0);
});
test('Stop during a running render is durable and prevents attach while preserving the original material',async()=>{
 const f=await fixture();let release,entered;const gate=new Promise(r=>release=r),seen=new Promise(r=>entered=r);
 f.block(async()=>{entered();await gate;});const job=await f.operation.start('org','actor',f.input),run=f.operation.run('org','op',job.id);await seen;
 await f.operation.stop('org','actor','op',job.id);release();assert.equal((await run).state,'stopped');assert.equal(f.applied,0);assert.equal((await f.operation.open('org','actor','op',job.id)).state,'stopped');
 assert.equal((await f.store.read('org','editorial','op')).payload.material.title,'Final');
});
test('actor/input drift and stale source cannot dispatch a new composition or attach an old one',async()=>{
 const f=await fixture();await assert.rejects(f.operation.start('org','other',f.input));const job=await f.operation.start('org','actor',f.input);
 await assert.rejects(f.operation.start('org','actor',{...f.input,manifest:{...f.manifest,title:'Changed'}}),/INTENT_MISMATCH/);
 f.stale();await f.operation.run('org','op',job.id);assert.equal(f.applied,0);assert.equal((await f.operation.open('org','actor','op',job.id)).state,'failed');
});
