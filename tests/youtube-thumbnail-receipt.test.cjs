const {youtubeFixture}=require('./helpers/youtube-post-fixture.cjs');
const {fixture}=require('./helpers/publication-v106.module.cjs');
const {loadTypeScriptModule}=require('./helpers/load-ts-module.cjs');
const {YOUTUBE_THUMBNAIL_FAILED_STATUS,publicationWarning,YOUTUBE_THUMBNAIL_WARNING}=loadTypeScriptModule('libraries/nestjs-libraries/src/integrations/publication-warnings.ts');
const call=f=>f.provider.post('owned-channel','private-fixture-token',[f.details]);

test.each(['none','success'])('YouTube keeps ordinary publication receipt when optional cover is %s',async mode=>{
 const f=youtubeFixture();if(mode==='none')delete f.details.settings.thumbnail;
 await expect(call(f)).resolves.toEqual([{id:'p1',postId:'accepted-video',releaseURL:'https://www.youtube.com/watch?v=accepted-video',status:'success'}]);
 expect(f.insert).toHaveBeenCalledTimes(1);expect(f.thumbnail).toHaveBeenCalledTimes(mode==='none'?0:1);
 expect(f.credentials).toHaveBeenCalledWith({access_token:'private-fixture-token'});
});

test.each(['auth','transport','cover-read'])('known upload + optional %s cover failure returns the exact accepted receipt with bounded warning',async kind=>{
 const error=Object.assign(new Error('private-provider-response token=secret-body'),{status:kind==='auth'?401:500});
 const f=youtubeFixture(kind==='cover-read'?{coverRead:error}:{cover:async()=>{throw error;}});
 const receipts=await call(f);
 expect(receipts).toEqual([{id:'p1',postId:'accepted-video',releaseURL:'https://www.youtube.com/watch?v=accepted-video',status:YOUTUBE_THUMBNAIL_FAILED_STATUS}]);
 expect(f.insert).toHaveBeenCalledTimes(1);expect(JSON.stringify(receipts)).not.toContain('secret-body');expect(publicationWarning(receipts)).toBe(YOUTUBE_THUMBNAIL_WARNING);
 if(kind==='transport'){
  expect(publicationWarning(receipts)).toContain('установка обложки не подтверждена');
  expect(publicationWarning(receipts)).not.toContain('обложка не установлена');
  expect(receipts[0].postId).toBe('accepted-video');expect(f.insert).toHaveBeenCalledTimes(1);
 }
});

test.each(['upload-failed','missing-id','blank-id'])('%s never creates a success receipt or attempts a cover',async kind=>{
 const f=youtubeFixture({upload:async()=>{if(kind==='upload-failed')throw Error('unknown upload outcome');return {data:{id:kind==='blank-id'?' ':undefined}};}});
 await expect(call(f)).rejects.toThrow();expect(f.insert).toHaveBeenCalledTimes(1);expect(f.thumbnail).not.toHaveBeenCalled();
});

test('actual V106 confirmation/restart replays the warning receipt without a second videos.insert or duplicate diagnostics',async()=>{
 const youtube=youtubeFixture({cover:async()=>{throw Error('sensitive rejected cover');}});
 const f=fixture(undefined,{write:(id,token,details)=>youtube.provider.post(id,token,details)});
 f.integration.providerIdentifier='youtube';f.client.row.settings=JSON.stringify(youtube.details.settings);f.service.updateMedia=async()=>youtube.details.media;
 const receipts=await f.activity.postSocialV106(f.integration,[f.client.row],'initial');
 expect(f.client.row).toMatchObject({state:'PUBLISHED',releaseId:'accepted-video',releaseURL:receipts[0].releaseURL,error:YOUTUBE_THUMBNAIL_WARNING});
 expect(f.client.row.publicationJournal.attempts[0]).toMatchObject({integrationId:'channel-a',status:'confirmed',receipts});
 const restarted=fixture(f.client,{write:()=>{throw Error('must not resend');}});
 await expect(restarted.activity.postSocialV106(restarted.integration,[restarted.client.row],'initial')).resolves.toEqual(receipts);
 await f.repository.recordPublicationStreakFailureV106(f.key);await f.repository.recordPublicationStreakFailureV106(f.key);
 expect(f.client.row.error.split(YOUTUBE_THUMBNAIL_WARNING)).toHaveLength(2);
 expect(f.client.row.error).toContain('не удалось обновить серию');
 expect(youtube.insert).toHaveBeenCalledTimes(1);
 expect(JSON.stringify(f.client.row)).not.toContain('sensitive rejected cover');
});

test('warning confirmation preserves a concurrent unrelated diagnostic and composes known warnings once',async()=>{
 const f=fixture();await f.repository.claimPublicationV106(f.key);f.client.row.error='Unrelated existing diagnostic';
 const receipts=[{id:'p1',postId:'accepted-video',releaseURL:'https://www.youtube.com/watch?v=accepted-video',status:YOUTUBE_THUMBNAIL_FAILED_STATUS}];
 await f.repository.confirmPublicationV106(f.key,receipts);
 await f.repository.confirmPublicationV106(f.key,receipts);
 expect(f.client.row.error).toBe(`Unrelated existing diagnostic\n${YOUTUBE_THUMBNAIL_WARNING}`);
 await f.repository.recordPublicationStreakFailureV106(f.key);await f.repository.recordPublicationStreakFailureV106(f.key);
 expect(f.client.row.error.split('\n')).toHaveLength(3);expect(f.client.row.publicationJournal.attempts[0].auxiliaryFailure).toBe('streak');
});

test('a lost YouTube upload response stays uncertain in V106 and cannot re-upload on replay',async()=>{
 const youtube=youtubeFixture({upload:async()=>{throw Error('unknown provider side effect');}});
 const f=fixture(undefined,{write:(id,token,details)=>youtube.provider.post(id,token,details)});
 f.client.row.settings=JSON.stringify(youtube.details.settings);f.service.updateMedia=async()=>youtube.details.media;
 for(let i=0;i<2;i++)await expect(f.activity.postSocialV106(f.integration,[f.client.row],'initial')).rejects.toHaveProperty('type','publication_uncertain');
 expect(youtube.insert).toHaveBeenCalledTimes(1);expect(f.client.row.releaseId).toBeNull();
 expect(f.client.row.publicationJournal.attempts[0].status).toBe('pending');
});
