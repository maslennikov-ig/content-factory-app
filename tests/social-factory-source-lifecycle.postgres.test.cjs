const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {PrismaClient}=require('@prisma/client');
const {loadTypeScriptModule}=require('./helpers/load-ts-module.cjs');
const {SocialFactoryRepository,assertSourceAdmissionsV1,sourceRef,resourceRef}=loadTypeScriptModule('libraries/nestjs-libraries/src/content-intelligence/social-factory/social-factory.repository.ts');
const url=process.env.CF_SOCIAL_FACTORY_DATABASE_URL;
const NOW=new Date('2030-01-01T12:00:00Z');
async function fixture(){
 const db=new PrismaClient({datasourceUrl:url});const org=await db.organization.create({data:{name:'Synthetic source lifecycle test'}});
 const source=await db.contentSource.create({data:{organizationId:org.id,kind:'MANUAL',displayName:'Synthetic owned source',canonicalKey:randomUUID(),createdByUserId:randomUUID(),updatedByUserId:randomUUID(),desiredState:'ACTIVE',rightsState:'CONFIRMED',rightsConfirmedAt:NOW,usagePurpose:'EVIDENCE'}});
 const snapshot=await db.sourceSnapshot.create({data:{organizationId:org.id,sourceId:source.id,sequence:1,observedAt:NOW,validatedAt:NOW,contentHash:'synthetic',parser:'manual',parserVersion:'v1',normalizedText:'PRIVATE SOURCE TEXT',retentionUntil:new Date('2030-01-02T12:00:00Z')}});
 await db.contentSource.update({where:{id:source.id},data:{currentSnapshotId:snapshot.id}});
 const repo=new SocialFactoryRepository({model:db},{model:db});
 const stamp={sourceId:source.id,sourceConfigVersion:source.configVersion,snapshotId:snapshot.id,rightsConfirmedAt:NOW.toISOString(),permissionRevision:null};
 return{db,org,source,snapshot,repo,stamp,async close(){await db.sourceEvidence.deleteMany({where:{organizationId:org.id}});await db.contentSource.updateMany({where:{organizationId:org.id},data:{currentSnapshotId:null}});await db.sourceSnapshot.deleteMany({where:{organizationId:org.id}});await db.contentSource.deleteMany({where:{organizationId:org.id}});await db.organization.delete({where:{id:org.id}});await db.$disconnect();}};
}
test('raw permission tombstones cannot become an absent baseline after expiry/deletion',{skip:!url},async()=>{const f=await fixture();try{
 const p=await f.repo.put({organizationId:f.org.id,kind:'source_permission',id:f.source.id,payload:{expiresAt:'2000-01-01T00:00:00Z',revokedAt:'2000-01-01T00:00:00Z'},expectedRevision:0,expiresAt:new Date('2000-01-01T00:00:00Z')});
 assert.equal(await f.repo.read(f.org.id,'source_permission',f.source.id),null);
 assert.equal((await f.repo.readSourcePermissionState(f.org.id,f.source.id)).state,'present');
 await f.repo.remove(f.org.id,'source_permission',f.source.id,p.revision);
 assert.equal((await f.repo.readSourcePermissionState(f.org.id,f.source.id)).state,'present');
 await assert.rejects(f.db.$transaction(tx=>assertSourceAdmissionsV1(tx,f.org.id,[f.stamp],NOW),{isolationLevel:'Serializable'}),e=>e.code==='SOCIAL_FACTORY_SOURCE_PERMISSION_CHANGED');
 }finally{await f.close();}});
test('same transaction rechecks canonical retention, source purpose and grant payload expiry',{skip:!url},async()=>{const f=await fixture();try{
 await f.db.$transaction(tx=>assertSourceAdmissionsV1(tx,f.org.id,[f.stamp],NOW),{isolationLevel:'Serializable'});
 await assert.rejects(f.db.$transaction(tx=>assertSourceAdmissionsV1(tx,f.org.id,[f.stamp],new Date('2030-01-03T00:00:00Z')),{isolationLevel:'Serializable'}),e=>e.code==='SOCIAL_FACTORY_SOURCE_CHANGED');
 await f.db.contentSource.update({where:{id:f.source.id},data:{usagePurpose:'STYLE_REFERENCE'}});
 await assert.rejects(f.db.$transaction(tx=>assertSourceAdmissionsV1(tx,f.org.id,[f.stamp],NOW),{isolationLevel:'Serializable'}));
 await f.db.contentSource.update({where:{id:f.source.id},data:{usagePurpose:'EVIDENCE'}});
 await f.repo.put({organizationId:f.org.id,kind:'source_permission',id:f.source.id,payload:{expiresAt:'2000-01-01T00:00:00Z'},expectedRevision:0});
 await assert.rejects(f.db.$transaction(tx=>assertSourceAdmissionsV1(tx,f.org.id,[{...f.stamp,permissionRevision:1}],NOW),{isolationLevel:'Serializable'}),e=>e.code==='SOCIAL_FACTORY_SOURCE_PERMISSION_CHANGED');
 }finally{await f.close();}});
test('concurrent canonical revoke waits for the material fence and then redacts the committed descendant',{skip:!url},async()=>{const f=await fixture();try{
 let locked;const ready=new Promise(resolve=>locked=resolve);let release;const barrier=new Promise(resolve=>release=resolve);
 const writing=f.db.$transaction(async tx=>{await assertSourceAdmissionsV1(tx,f.org.id,[f.stamp],NOW);locked();await barrier;await tx.socialFactoryRecord.create({data:{organizationId:f.org.id,kind:'editorial',id:'derived',sourceIds:[sourceRef(f.source.id)],payload:{text:'PRIVATE SOURCE TEXT'}}});},{isolationLevel:'Serializable',timeout:10000});
 await ready;let revoked=false;
 const revoking=f.db.contentSource.update({where:{id:f.source.id},data:{rightsState:'DENIED',configVersion:{increment:1}}}).then(()=>{revoked=true;});
 await new Promise(resolve=>setTimeout(resolve,30));assert.equal(revoked,false);release();await writing;await revoking;
 await f.repo.invalidateBySource(f.org.id,f.source.id);
 assert.equal(await f.repo.read(f.org.id,'editorial','derived'),null);
 assert.deepEqual((await f.db.socialFactoryRecord.findUnique({where:{organizationId_kind_id:{organizationId:f.org.id,kind:'editorial',id:'derived'}}})).payload,{redacted:true});
 }finally{await f.close();}});

test('source revoke scrubs native copies and queues only derived owned media for physical deletion',{skip:!url},async()=>{const f=await fixture();try{
 const org=f.org.id, integration=await f.db.integration.create({data:{organizationId:org,internalId:randomUUID(),name:'Synthetic',providerIdentifier:'telegram',type:'social',token:'synthetic-only'}});
 const piece=await f.db.contentPiece.create({data:{organizationId:org,title:'PRIVATE SOURCE TEXT',body:'PRIVATE SOURCE TEXT',brief:{text:'PRIVATE SOURCE TEXT'},createdByUserId:randomUUID()}});
 const post=await f.db.post.create({data:{organizationId:org,integrationId:integration.id,group:randomUUID(),state:'QUEUE',publishDate:NOW,content:'PRIVATE SOURCE TEXT',image:'[]',settings:'{}'}});
 const derivation=await f.db.contentDerivation.create({data:{organizationId:org,contentPieceId:piece.id,postId:post.id,platform:'telegram',format:'post',body:'PRIVATE SOURCE TEXT'}});
 const original=await f.db.media.create({data:{organizationId:org,name:'original',path:'/uploads/2030/01/01/ab.png'}});
 const generated=await f.db.media.create({data:{organizationId:org,name:'generated',path:'/uploads/2030/01/01/cd.png'}});
 const material={pieceId:piece.id,derivationId:derivation.id,settings:{visualSourceMediaIds:[original.id]},assets:[original,generated].map(media=>({mediaId:media.id,provenance:{sourceIds:[f.source.id]}}))};
 await f.repo.put({organizationId:org,kind:'action',id:'receipt',expectedRevision:0,sourceIds:[sourceRef(f.source.id)],payload:{type:'native_material_receipt',material}});
 await f.repo.invalidateBySource(org,f.source.id);
 assert.equal((await f.db.contentPiece.findUnique({where:{id:piece.id}})).body,'');
 assert.equal((await f.db.contentDerivation.findUnique({where:{id:derivation.id}})).body,null);
 assert.equal((await f.db.post.findUnique({where:{id:post.id}})).content,'');
 assert.equal((await f.db.post.findUnique({where:{id:post.id}})).state,'DRAFT');
 assert.equal((await f.db.media.findUnique({where:{id:original.id}})).deletedAt,null);
 assert.ok((await f.db.media.findUnique({where:{id:generated.id}})).deletedAt);
 assert.deepEqual((await f.repo.list(org,'media_purge')).map(row=>row.payload.mediaId),[generated.id]);
 }finally{await f.close();}});

test('source freshness and discovery cache expiry preserve ready native history; retention expiry still purges',{skip:!url},async()=>{const f=await fixture();try{
 const org=f.org.id;
 await f.db.contentSource.update({where:{id:f.source.id},data:{kind:'URL',freshUntil:new Date('2029-12-31T00:00:00Z')}});
 const piece=await f.db.contentPiece.create({data:{organizationId:org,title:'SAVED HISTORY',body:'SAVED HISTORY',createdByUserId:randomUUID()}});
 const derivation=await f.db.contentDerivation.create({data:{organizationId:org,contentPieceId:piece.id,platform:'telegram',format:'post',body:'SAVED HISTORY'}});
 await f.repo.put({organizationId:org,kind:'discovery',id:'cache',expectedRevision:0,payload:{source:'cached'},sourceIds:[sourceRef(f.source.id)],expiresAt:new Date('2029-12-31T00:00:00Z')});
 await f.repo.put({organizationId:org,kind:'finding',id:'finding-cache',expectedRevision:0,payload:{statement:'OLD PLANNING GUIDANCE'},expiresAt:new Date('2029-12-31T00:00:00Z')});
 const op=await f.repo.put({organizationId:org,kind:'editorial',id:'ready',expectedRevision:0,payload:{material:{title:'SAVED HISTORY'}},sourceIds:[sourceRef(f.source.id),resourceRef('discovery','cache'),resourceRef('finding','finding-cache')]});
 assert.equal(op.expiresAt.toISOString(),f.snapshot.retentionUntil.toISOString());
 await f.repo.put({organizationId:org,kind:'action',id:'native',expectedRevision:0,payload:{type:'native_material_receipt',material:{pieceId:piece.id,derivationId:derivation.id}},sourceIds:[resourceRef('editorial','ready')]});
 await f.repo.purgeExpired(org,NOW);
 assert.equal(await f.repo.read(org,'discovery','cache'),null);
 assert.equal(await f.repo.read(org,'finding','finding-cache'),null);
 assert.ok(await f.repo.read(org,'editorial','ready'));
 assert.equal((await f.db.contentPiece.findUnique({where:{id:piece.id}})).body,'SAVED HISTORY');
 await assert.rejects(f.db.$transaction(tx=>assertSourceAdmissionsV1(tx,org,[f.stamp],NOW),{isolationLevel:'Serializable'}),e=>e.code==='SOCIAL_FACTORY_SOURCE_CHANGED');
 await f.repo.purgeExpired(org,new Date('2030-01-03T00:00:00Z'));
 assert.equal((await f.db.contentPiece.findUnique({where:{id:piece.id}})).body,'');
 }finally{await f.close();}});
