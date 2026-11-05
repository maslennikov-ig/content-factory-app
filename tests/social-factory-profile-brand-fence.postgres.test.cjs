require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const { ChannelProfileServiceV1 } = loadTypeScriptModule('libraries/nestjs-libraries/src/content-intelligence/social-factory/profiles/channel-profile.v1.ts');
const repositorySource = process.env.CF_BRAND_FENCE_REPOSITORY_SOURCE || 'libraries/nestjs-libraries/src/content-intelligence/social-factory/social-factory.repository.ts';
const { SocialFactoryRepository } = loadTypeScriptModule(repositorySource);
const { digestBrandProfileContent } = loadTypeScriptModule('libraries/nestjs-libraries/src/content-intelligence/brand-profile/brand-profile.validation.ts');
const dbUrl = process.env.CF_BRAND_FENCE_DATABASE_URL;
const content = {project:{audiences:[{name:'owners'}],oneLineDescription:'Practical help',contentGoals:['educate']},voice:{defaultLanguage:'en'},guardrails:{prohibitedTopics:[],prohibitedClaims:[]}};
const channelProfile = audience => ({version:1,channelId:'test-channel',platform:'telegram',audience,promise:'',goals:[],expertise:[],pillars:[],languages:[],geography:[],exclusions:[],evidence:[],openQuestions:[]});
const gate = () => {let release;const wait = new Promise(resolve=>{release=resolve;});return {wait,release};};
async function fixture() {
  const db = new PrismaClient({datasourceUrl:dbUrl});
  const org = await db.organization.create({data:{name:'Brand fence isolated test'}});
  const profile = await db.projectBrandProfile.create({data:{organizationId:org.id,isDefault:true}});
  const version = await db.projectBrandProfileVersion.create({data:{organizationId:org.id,profileId:profile.id,versionNumber:1,lifecycle:'PUBLISHED',content,contentDigest:digestBrandProfileContent(content),createdByUserId:'fixture',updatedByUserId:'fixture'}});
  await db.projectBrandProfile.update({where:{organizationId_id:{organizationId:org.id,id:profile.id}},data:{activeVersionId:version.id}});
  const repo = new SocialFactoryRepository({model:db},{model:db});
  const brands = {getActiveRuntimeVersion:async()=>{const p=await db.projectBrandProfile.findFirst({where:{organizationId:org.id,id:profile.id,deletedAt:null},include:{activeVersion:true}});return p?.activeVersion?{profile:p,version:p.activeVersion}:null;}};
  const svc = new ChannelProfileServiceV1({store:repo,brands,integrations:{getIntegrationById:async(tenant,id)=>tenant===org.id&&id==='test-channel'?{id,providerIdentifier:'telegram',contentLanguage:'en',deletedAt:null,writingProfile:null}:null}});
  await svc.save(org.id,channelProfile('owner'),0);
  const close=async()=>{await db.socialFactoryRecord.deleteMany({where:{organizationId:org.id}});await db.projectBrandProfile.updateMany({where:{organizationId:org.id},data:{activeVersionId:null}});await db.projectBrandProfileVersion.deleteMany({where:{organizationId:org.id}});await db.projectBrandProfile.deleteMany({where:{organizationId:org.id}});await db.organization.delete({where:{id:org.id}});await db.$disconnect();};
  return {db,org,profile,version,repo,brands,svc,close};
}
for (const target of ['profile','version']) test(`real Postgres: ${target} removed after brand read cannot be resurrected by snapshot`,{skip:!dbUrl},async()=>{
  const f=await fixture();const read=gate(), proceed=gate();
  try {
    const get=f.brands.getActiveRuntimeVersion;f.brands.getActiveRuntimeVersion=async()=>{const result=await get();read.release();await proceed.wait;return result;};
    const pending=f.svc.saveDerived(f.org.id,channelProfile(''),1);
    await read.wait;
    if(target==='profile') await f.db.projectBrandProfile.update({where:{organizationId_id:{organizationId:f.org.id,id:f.profile.id}},data:{deletedAt:new Date(),activeVersionId:null}});
    else {await f.db.projectBrandProfile.update({where:{organizationId_id:{organizationId:f.org.id,id:f.profile.id}},data:{activeVersionId:null}});await f.db.projectBrandProfileVersion.delete({where:{organizationId_id:{organizationId:f.org.id,id:f.version.id}}});}
    proceed.release();await assert.rejects(pending, /SOCIAL_FACTORY_BRAND_VERSION_UNAVAILABLE/);
    const base=await f.repo.read(f.org.id,'channel_profile','test-channel');assert.equal(base.revision,1);assert.equal(base.payload.profile.audience,'owner');assert.equal(base.payload.snapshotId,undefined);
    assert.equal(await f.db.socialFactoryRecord.count({where:{organizationId:f.org.id,kind:'channel_profile_snapshot'}}),0);
  } finally {proceed.release();await f.close();}
});
for (const target of ['profile','version']) test(`real Postgres: snapshot fence holds native ${target} row until transaction commit`,{skip:!dbUrl},async()=>{
  const f=await fixture();const locked=gate(), proceed=gate();let deletion;
  try {
    const run=f.repo.transact.bind(f.repo);f.repo.transact=work=>run(async tx=>{const fence=tx.assertBrandProfileVersion.bind(tx);tx.assertBrandProfileVersion=async(...args)=>{await fence(...args);locked.release();await proceed.wait;};return work(tx);});
    const writing=f.svc.saveDerived(f.org.id,channelProfile(''),1);await locked.wait;
    let completed=false;const mutation=target==='profile' ? f.db.projectBrandProfile.update({where:{organizationId_id:{organizationId:f.org.id,id:f.profile.id}},data:{deletedAt:new Date(),activeVersionId:null}}) : f.db.projectBrandProfileVersion.update({where:{organizationId_id:{organizationId:f.org.id,id:f.version.id}},data:{lifecycle:'ARCHIVED'}});deletion=mutation.then(()=>{completed=true;});
    await new Promise(resolve=>setTimeout(resolve,100));assert.equal(completed,false,`${target} mutation must wait for its row fence`);
    proceed.release();await writing;await deletion;assert.equal(completed,true);
  } finally {proceed.release();if(deletion) await deletion.catch(()=>{});await f.close();}
});
