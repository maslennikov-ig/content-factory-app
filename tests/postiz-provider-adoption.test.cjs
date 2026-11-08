const {Readable}=require('node:stream');
const {mkdtemp,writeFile,rm}=require('node:fs/promises');
const {tmpdir}=require('node:os');
const {join}=require('node:path');
const {loadTypeScriptModule}=require('./helpers/load-ts-module.cjs');
const BASE='libraries/nestjs-libraries/src/integrations/social/';
class Failure extends Error { constructor(id,json,body,message){super(message);this.details={id,json,body};} }
class Reconnect extends Failure {}
function provider(file,name,overrides={}){
 const module=loadTypeScriptModule(`${BASE}${file}.provider.ts`,{}, {resolve(request){
  if(request in overrides)return overrides[request];
  if(request==='./media-upload-sources')return {openMediaUploadBlobs:async files=>({files:files.map(()=>({blob:new Blob(['media'])})),close:async()=>{}})};
  if(request.endsWith('/social.abstract'))return {SocialAbstract:class{assetBoolean(v){return v===true||v==='true';} async runInConcurrent(fn){return fn();}},BadBody:Failure,RefreshToken:Reconnect};
  if(request.endsWith('/linkedin.provider'))return {LinkedinProvider:class{}};
  if(request.endsWith('/media.source'))return {readMediaSource:async()=>({stream:Readable.from(['media']),close:()=>{}})};
  if(request.endsWith('/has.extension'))return {hasExtension:(path,extension)=>new RegExp(`\\.${extension}(?:[?#]|$)`,'i').test(path)};
  if(request.endsWith('/timer'))return {timer:async()=>{}};
  if(request==='sharp')return ()=>{};
  if(request==='node-telegram-bot-api')return {__esModule:true,default:class{}};
  if(request.startsWith('@contentfactory/')&&!request.endsWith('/analytics.data'))return new Proxy({}, {get:(_,key)=>['Rules','Plug','PostPlug','Tool'].includes(key)?()=>target=>target:()=>{}});
 }});
 return new module[name]();
}
const json=body=>({json:async()=>body});
const post={id:'post',message:'Text',media:[],settings:{post_type:'post'}};
const diagnostic=loadTypeScriptModule(`${BASE}provider-error-diagnostic.ts`).providerErrorDiagnostic;
const originalFetch=global.fetch;
afterEach(()=>{global.fetch=originalFetch;});

test.each([
 ['vk',{error:{error_code:5}},'refresh-token'],
 ['vk',{error:{error_code:214}},'bad-body'],
 ['vk',{error:{error_code:6}},'retry'],
 ['meta',{error:{code:190}},'refresh-token'],
 ['meta',{error:{code:200}},'bad-body'],
 ['meta',{error:{code:4}},'retry'],
 ['meta',{error:{message:'An unknown error occurred'}},'bad-body'],
 ['telegram',{response:{body:{error_code:400,description:"can't parse entities"}}},'bad-body'],
 ['telegram',{response:{body:{error_code:403}}},'bad-body'],
 ['youtube',{error:{errors:[{reason:'quotaExceeded'}]}},'retry'],
])('%s produces a localized static %s diagnostic',(name,body,type)=>{
 body.secret='private-token-and-caption';const result=diagnostic(name,body);
 expect(result.type).toBe(type);expect(result.value).toMatch(/[А-Яа-я]/);expect(result.value).not.toContain('private-token-and-caption');
});

test.each(['post','comment'])('VK %s rejects HTTP200 errors and malformed receipts without false success',async method=>{
 const vk=provider('vk','VkProvider');
 const send=()=>method==='post'?vk.post('42','secret',[post]):vk.comment('42','123',undefined,'secret',[post],{});
 vk.fetch=jest.fn(async()=>json({error:{error_code:5,error_msg:'secret',request_params:[{key:'access_token',value:'secret'}]}}));
 await expect(send()).rejects.toBeInstanceOf(Reconnect);
 try{await send();}catch(error){expect(JSON.stringify(error)).not.toContain('secret');}
 vk.fetch=jest.fn(async()=>json({response:{}}));await expect(send()).rejects.toThrow(/не подтверждён/);
});

test('VK uses ru endpoints and confirmed photo owner/id in wall attachment',async()=>{
 const axios={get:jest.fn(async()=>({data:Readable.from(['image'])})),post:jest.fn(async()=>({data:{photo:'uploaded',server:2,hash:'hash'}}))};
 const vk=provider('vk','VkProvider',{axios:{__esModule:true,default:axios}});
 vk.fetch=jest.fn().mockResolvedValueOnce(json({response:{upload_url:'https://upload.invalid'}})).mockResolvedValueOnce(json({photo:'uploaded',server:2,hash:'hash'})).mockResolvedValueOnce(json({response:[{id:55,owner_id:42}]})).mockResolvedValueOnce(json({response:{post_id:88}}));
 const result=await vk.post('42','secret',[{...post,media:[{path:'https://media.invalid/a.jpg'}]}]);
 expect(result[0].postId).toBe('88');expect(vk.fetch.mock.calls[0][0]).toContain('api.vk.ru');expect(vk.fetch.mock.calls[3][1].body.get('attachments')).toBe('photo42_55');
 expect((await vk.generateAuthUrl()).url).toContain('id.vk.ru');
});

test('VK video upload uses video_file and requires matching confirmed video receipt',async()=>{
 const axios={get:jest.fn(async()=>({data:Readable.from(['video'])})),post:jest.fn(async()=>({data:{video_id:55,owner_id:42}}))};
 const vk=provider('vk','VkProvider',{axios:{__esModule:true,default:axios}});
 vk.fetch=jest.fn().mockResolvedValueOnce(json({response:{upload_url:'https://upload.invalid',video_id:55,owner_id:42}})).mockResolvedValueOnce(json({video_id:55,owner_id:42})).mockResolvedValueOnce(json({response:{post_id:88}}));
 await vk.post('42','secret',[{...post,media:[{path:'https://media.invalid/a.mp4'}]}]);
 expect(vk.fetch.mock.calls[1][1].body.get('video_file')).toBeInstanceOf(Blob);
 expect(vk.fetch.mock.calls[2][1].body.get('attachments')).toBe('video42_55');
 vk.fetch.mockResolvedValueOnce(json({response:{upload_url:'https://upload.invalid',video_id:55,owner_id:42}})).mockResolvedValueOnce(json({}));
 await expect(vk.post('42','secret',[{...post,media:[{path:'https://media.invalid/a.mp4'}]}])).rejects.toThrow(/не подтверждён/);
});

test('Instagram carousel applies collaborators only to parent, normalizes handles and uses shared Graph25',async()=>{
 const instagram=provider('instagram','InstagramProvider');
 instagram.fetch=jest.fn(async url=>json(url.includes('/media?')?{id:'container'}:url.includes('media_publish')?{id:'published'}:url.includes('status_code')?{status_code:'FINISHED'}:{permalink:'https://instagram.invalid/published'}));
 await instagram.post('42','token',[{...post,settings:{post_type:'post',collaborators:[{label:'@user'}]},media:[{path:'https://media.invalid/a.jpg',alt:'A & B'},{path:'https://media.invalid/b.jpg'}]}],{});
 const urls=instagram.fetch.mock.calls.map(([url])=>new URL(url));
 expect(urls.every(url=>url.pathname.includes('/v25.0/'))).toBe(true);
 const children=urls.filter(url=>url.searchParams.get('is_carousel_item')==='true');expect(children).toHaveLength(2);expect(children.every(url=>!url.searchParams.has('collaborators'))).toBe(true);
 expect(children[0].searchParams.get('alt_text')).toBe('A & B');
 const parent=urls.find(url=>url.searchParams.get('media_type')==='CAROUSEL');expect(JSON.parse(parent.searchParams.get('collaborators'))).toEqual(['user']);
});

test('Instagram Reels custom cover wins over timestamp while Stories omit custom cover',async()=>{
 const instagram=provider('instagram','InstagramProvider');instagram.fetch=jest.fn(async url=>json(url.includes('/media?')?{id:'container'}:url.includes('media_publish')?{id:'published'}:url.includes('status_code')?{status_code:'FINISHED'}:{permalink:'https://instagram.invalid/published'}));
 const media=[{path:'https://media.invalid/a.mp4',thumbnail:'https://media.invalid/c.jpg?a=1&b=2',thumbnailTimestamp:9000}];
 await instagram.post('42','token',[{...post,media}],{});
 let url=new URL(instagram.fetch.mock.calls[0][0]);expect(url.searchParams.get('cover_url')).toBe(media[0].thumbnail);expect(url.searchParams.has('thumb_offset')).toBe(false);
 instagram.fetch.mockClear();await instagram.post('42','token',[{...post,settings:{post_type:'story'},media}],{});url=new URL(instagram.fetch.mock.calls[0][0]);expect(url.searchParams.has('cover_url')).toBe(false);
});

test('TikTok Direct Post sends cover timestamp in post_info, preserving explicit zero and excluding photo/inbox',()=>{
 const tiktok=provider('tiktok','TiktokProvider',{'@contentfactory/nestjs-libraries/dtos/posts/providers-settings/tiktok.dto':{TikTokDto:class{},validTikTokDisclosure:()=>true}});
 const make=(path,method='DIRECT_POST')=>({...post,message:'Text',media:[{path,thumbnailTimestamp:0}],settings:{content_posting_method:method,privacy_level:'SELF_ONLY'}});
 expect(tiktok.buildTikokPostInfoBody(make('v.mp4')).post_info.video_cover_timestamp_ms).toBe(0);
 expect(tiktok.buildTikokPostInfoBody(make('v.jpg')).post_info.video_cover_timestamp_ms).toBeUndefined();
 expect(tiktok.buildTikokPostInfoBody(make('v.mp4','UPLOAD')).post_info.video_cover_timestamp_ms).toBeUndefined();
});

test('Pinterest reads observed summary metrics and never substitutes lifetime or missing data with zero',async()=>{
 global.fetch=jest.fn(async()=>json({all:{summary_metrics:{IMPRESSION:0,SAVE:4,OUTBOUND_CLICK:null},lifetime_metrics:{PIN_CLICK:999}}}));
 const result=await provider('pinterest','PinterestProvider').postAnalytics('id','token','pin',7);
 expect(result.map(({label,data})=>[label,data[0].total])).toEqual([['Impressions','0'],['Saves','4']]);
});

test('LinkedIn company selection includes approved Content Admins, filters others and deduplicates pages',async()=>{
 const page=(id,role,state='APPROVED')=>({organizationalTarget:`urn:li:organization:${id}`,role,state,'organizationalTarget~':{localizedName:id,vanityName:id}});
 global.fetch=jest.fn(async()=>json({elements:[page('1','ADMINISTRATOR'),page('1','CONTENT_ADMINISTRATOR'),page('2','CONTENT_ADMINISTRATOR'),page('3','ANALYST'),page('4','CONTENT_ADMINISTRATOR','REVOKED')]}));
 const result=await provider('linkedin.page','LinkedinPageProvider').companies('token');expect(result.map(p=>p.id)).toEqual(['1','2']);expect(global.fetch.mock.calls[0][0]).toContain('state=APPROVED');
});

async function ownedSpool(bytes,run){const dir=await mkdtemp(join(tmpdir(),'cf-provider-fixture-'));const path=join(dir,'owned');await writeFile(path,bytes);const dispose=jest.fn(async()=>{});try{return await run({path,size:bytes.length,dispose});}finally{await rm(dir,{recursive:true,force:true});}}

test('LinkedIn video upload honors every instructed range and URL and preserves etag ordering',async()=>ownedSpool(Buffer.from('abcdefghij'),async source=>{
 const linkedin=provider('linkedin','LinkedinProvider');linkedin.waitForMediaToBeReady=jest.fn();
 linkedin.fetch=jest.fn(async(url,options)=>url.includes('initializeUpload')?json({value:{video:'urn:li:video:v',uploadToken:'receipt',uploadInstructions:[{firstByte:0,lastByte:3,uploadUrl:'https://upload.invalid/one'},{firstByte:4,lastByte:9,uploadUrl:'https://upload.invalid/two'}]}}):({headers:{get:()=>url.endsWith('one')?'etag1':'etag2'}}));
 await linkedin.uploadPicture('video.mp4','token','id',source);
 expect(linkedin.fetch.mock.calls[1][0]).toBe('https://upload.invalid/one');expect(linkedin.fetch.mock.calls[1][1].body.toString()).toBe('abcd');expect(linkedin.fetch.mock.calls[2][1].body.toString()).toBe('efghij');
 expect(JSON.parse(linkedin.fetch.mock.calls[3][1].body).finalizeUploadRequest).toMatchObject({uploadToken:'receipt',uploadedPartIds:['etag1','etag2']});
}));

test('LinkedIn refuses incomplete ranges and never finalizes truncated content',async()=>ownedSpool(Buffer.from('abc'),async source=>{
 const linkedin=provider('linkedin','LinkedinProvider');linkedin.fetch=jest.fn(async()=>json({value:{video:'v',uploadInstructions:[{firstByte:0,lastByte:4,uploadUrl:'https://upload.invalid/one'}]}}));
 await expect(linkedin.uploadPicture('video.mp4','token','id',source)).rejects.toThrow('LINKEDIN_UPLOAD_RANGE_INVALID');expect(linkedin.fetch).toHaveBeenCalledTimes(1);
}));

test('X streams bounded v2 chunks and finalizes only after all append receipts, then disposes spool',async()=>ownedSpool(Buffer.alloc(1024*1024+7,7),async source=>{
 const x=provider('x','XProvider',{'@contentfactory/helpers/utils/media.source':{spoolMediaSource:async()=>source}});
 const client={v2:{post:jest.fn(async url=>url.endsWith('initialize')?{data:{id:'media'}}:{data:{}})}};
 expect(await x.uploadVideo(client,'owned.mp4')).toBe('media');
 const calls=client.v2.post.mock.calls;expect(calls.map(([url])=>url)).toEqual(['media/upload/initialize','media/upload/media/append','media/upload/media/append','media/upload/media/finalize']);expect(calls[1][1].media.length).toBe(1024*1024);expect(calls[2][1].media.length).toBe(7);expect(source.dispose).toHaveBeenCalledTimes(1);
}));

test('X append failure prevents finalize and still disposes owned spool',async()=>ownedSpool(Buffer.from('abc'),async source=>{
 const x=provider('x','XProvider',{'@contentfactory/helpers/utils/media.source':{spoolMediaSource:async()=>source}});const client={v2:{post:jest.fn(async url=>{if(url.endsWith('append'))throw new Error('upload rejected');return {data:{id:'media'}};})}};
 await expect(x.uploadVideo(client,'owned.mp4')).rejects.toThrow('upload rejected');expect(client.v2.post).toHaveBeenCalledTimes(2);expect(source.dispose).toHaveBeenCalledTimes(1);
}));

test('disk-backed multipart blob keeps source ownership until upload completes, then removes spool',async()=>{
 const fs=require('node:fs');const dir=await mkdtemp(join(tmpdir(),'cf-provider-blob-'));const path=join(dir,'owned');await writeFile(path,Buffer.alloc(1024*1024+7,3));
 const dispose=jest.fn(async()=>rm(dir,{recursive:true,force:true}));
 const helper=loadTypeScriptModule(`${BASE}media-upload-sources.ts`,{'@contentfactory/helpers/utils/media.source':{spoolMediaSource:async()=>({path,size:1024*1024+7,dispose})},'@contentfactory/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher':{getSsrfSafeDispatcher:()=>({})}});
 const opened=await helper.openMediaUploadBlobs([{path:'https://owned.invalid/video.mp4'}]);
 expect(opened.files[0].blob.size).toBe(1024*1024+7);expect(opened.files[0].blob.type).toBe('video/mp4');expect(fs.existsSync(path)).toBe(true);
 let size=0;for await(const chunk of opened.files[0].blob.stream()){size+=chunk.byteLength;expect(chunk.byteLength).toBeLessThanOrEqual(64*1024);}
 expect(size).toBe(1024*1024+7);await opened.close();expect(dispose).toHaveBeenCalledTimes(1);expect(fs.existsSync(path)).toBe(false);
});

test('opening multiple SDK media streams closes earlier sources when a later source fails',async()=>{
 const close=jest.fn();const helper=loadTypeScriptModule(`${BASE}media-upload-sources.ts`,{'@contentfactory/helpers/utils/media.source':{readMediaSource:async path=>{if(path==='second')throw Error('refused');return{stream:Readable.from(['first']),close};}},'@contentfactory/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher':{getSsrfSafeDispatcher:()=>({})}});
 await expect(helper.openMediaUploadStreams(['first','second'])).rejects.toThrow('refused');expect(close).toHaveBeenCalledTimes(1);
});

test('signed upload failure does not retry and uses redirect, timeout and SSRF guards',async()=>{
 const dispatcher={};const helper=loadTypeScriptModule(`${BASE}media-upload-sources.ts`,{'@contentfactory/helpers/utils/media.source':{},'@contentfactory/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher':{getSsrfSafeDispatcher:()=>dispatcher}});
 global.fetch=jest.fn(async()=>new Response('private-token-caption',{status:500}));
 await expect(helper.mediaUploadFetch('https://upload.invalid',{method:'PUT',body:'bytes'})).rejects.toThrow('MEDIA_UPLOAD_NOT_CONFIRMED');expect(global.fetch).toHaveBeenCalledTimes(1);expect(global.fetch.mock.calls[0][1]).toMatchObject({redirect:'error',dispatcher});expect(global.fetch.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
});

test('Telegram SDK consumes a guarded stream and closes it on rejection without leaking SDK details',async()=>{
 const close=jest.fn();const sendPhoto=jest.fn(async()=>{throw Object.assign(Error('secret caption token'),{response:{body:{error_code:403}}});});
 const telegram=provider('telegram','TelegramProvider',{'./media-upload-sources':{openMediaUploadStreams:async()=>({sources:[{stream:Readable.from(['synthetic']),close}],close})},'node-telegram-bot-api':{__esModule:true,default:class{sendPhoto=sendPhoto;}}});
 await expect(telegram.post('channel','token',[{...post,media:[{path:'https://media.invalid/image.jpg'}]}])).rejects.toThrow(/недостаточно прав/);expect(sendPhoto).toHaveBeenCalledTimes(1);expect(sendPhoto.mock.calls[0][1]).toBeInstanceOf(Readable);expect(close).toHaveBeenCalledTimes(1);
});

test('LinkedIn company OAuth placeholder cannot collide with the personal member channel',async()=>{
 const linkedin=provider('linkedin.page','LinkedinPageProvider');linkedin.checkScopes=jest.fn();
 global.fetch=jest.fn().mockResolvedValueOnce(json({access_token:'token',expires_in:300,scope:''})).mockResolvedValueOnce(json({sub:'same-member',name:'Member'})).mockResolvedValueOnce(json({vanityName:'member'}));
 const result=await linkedin.authenticate({code:'code',codeVerifier:'verifier'});expect(result.id).toBe('linkedin-page_same-member');expect(result.id).not.toBe('same-member');
});

test('Facebook OAuth and Instagram standalone capability requests share Graph25 without changing scopes',async()=>{
 const facebook=provider('facebook','FacebookProvider');expect((await facebook.generateAuthUrl()).url).toContain('/v25.0/dialog/oauth');
 const standalone=provider('instagram.standalone','InstagramStandaloneProvider',{'@contentfactory/nestjs-libraries/integrations/social/instagram.provider':{InstagramProvider:class{}}});
 global.fetch=jest.fn(async()=>({ok:true,json:async()=>({user_id:'owned',account_type:'BUSINESS'})}));
 expect(await standalone.readAccountType({internalId:'owned',token:'secret'})).toBe('business');expect(global.fetch.mock.calls[0][0]).toContain('graph.instagram.com/v25.0/');
});

test.each(['vk', 'pinterest', 'dribbble'])('%s sends actual multipart bytes through Node Request serialization', async name => {
 const bytes = Buffer.from('synthetic-media-bytes');
 const close = jest.fn(async () => {});
 const upload = async (url, options) => {
  const request = new Request(url, options);
  const body = await request.formData();
  const field = name === 'vk' ? 'video_file' : name === 'pinterest' ? 'file' : 'image';
  expect(Buffer.from(await body.get(field).arrayBuffer())).toEqual(bytes);
  expect(body.get(field).name).toBe(name === 'dribbble' ? 'a.jpg' : 'a.mp4');
  if (name === 'pinterest') expect(body.get('key')).toBe('signed-key');
  if (name === 'dribbble') expect(body.get('title')).toBe('Synthetic title');
  return new Response(name === 'vk' ? JSON.stringify({video_id:55,owner_id:42}) : '', {status:201,headers:{location:'https://dribbble.invalid/shots/88'}});
 };
 const helpers = {
  openMediaUploadBlobs: async files => ({files:files.map(file => ({blob:new Blob([bytes], {type:'application/octet-stream'})})),close}),
  mediaUploadFetch: upload,
 };
 const p = provider(name, {vk:'VkProvider',pinterest:'PinterestProvider',dribbble:'DribbbleProvider'}[name], {'./media-upload-sources':helpers});
 if (name === 'vk') p.fetch = jest.fn(async (url, options) => url === 'https://upload.invalid/' ? upload(url, options) : json(url.includes('video.save') ? {response:{upload_url:'https://upload.invalid/',video_id:55,owner_id:42}} : {response:{post_id:88}}));
 if (name === 'pinterest') p.fetch = jest.fn(async url => json(url.endsWith('/v5/media') ? {upload_url:'https://upload.invalid/',media_id:'media',upload_parameters:{key:'signed-key'}} : url.includes('/media/') ? {status:'succeeded'} : {id:'88'}));
 global.fetch = upload;
 await p.post('42','inert-token',[{...post,settings:{title:'Synthetic title'},media:[{path:`https://media.invalid/a.${name === 'dribbble' ? 'jpg' : 'mp4'}`}]}]);
 expect(close).toHaveBeenCalledTimes(1);
});

test('Telegram album retains guarded-stream filenames and MIME metadata for the real SDK', async () => {
 let sent;
 const telegram=provider('telegram','TelegramProvider',{'./media-upload-sources':{openMediaUploadStreams:async()=>({sources:[{stream:Readable.from(['one'])},{stream:Readable.from(['two'])}],close:()=>{}})},'node-telegram-bot-api':{__esModule:true,default:class{async sendMediaGroup(_chat, media){sent=media;return [{message_id:1}];}}}});
 await telegram.post('channel','token',[{...post,media:[{path:'https://media.invalid/one.jpg'},{path:'https://media.invalid/two.mp4'}]}]);
 expect(sent.map(media=>media.fileOptions)).toEqual([{filename:'one.jpg',contentType:'image/jpeg'},{filename:'two.mp4',contentType:'video/mp4'}]);
});
