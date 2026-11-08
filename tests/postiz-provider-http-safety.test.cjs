const {loadTypeScriptModule}=require('./helpers/load-ts-module.cjs');
const {SocialAbstract,BadBody,RefreshToken}=loadTypeScriptModule('libraries/nestjs-libraries/src/integrations/social.abstract.ts',{
 '@contentfactory/helpers/utils/timer':{timer:async()=>{}},
 '@contentfactory/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher':{getSsrfSafeDispatcher:()=>({})},
});
let previous;
beforeEach(()=>{previous=global.fetch;});afterEach(()=>{global.fetch=previous;});
test('a 5xx publication write is attempted once and classified unknown',async()=>{
 global.fetch=jest.fn(async()=>new Response('secret-token private post',{status:500}));
 await expect(new SocialAbstract().fetch('https://platform.test/post',{method:'POST',body:'private post'})).rejects.toThrow('Результат запроса не подтверждён');expect(global.fetch).toHaveBeenCalledTimes(1);
});
test('a transport failure after write does not retry or expose exception',async()=>{
 global.fetch=jest.fn(async()=>{throw new Error('Bearer secret-token body private-post');});
 let error;try{await new SocialAbstract().fetch('https://platform.test/post',{method:'POST',body:'private-post'});}catch(e){error=e;}
 expect(global.fetch).toHaveBeenCalledTimes(1);expect(JSON.stringify(error)).not.toMatch(/secret-token|private-post/);expect(error.message).toContain('не подтверждён');
});
test('safe read may retry a transient server response',async()=>{
 global.fetch=jest.fn().mockResolvedValueOnce(new Response('{}',{status:500})).mockResolvedValueOnce(new Response('ok'));
 expect(await(await new SocialAbstract().fetch('https://platform.test/status')).text()).toBe('ok');expect(global.fetch).toHaveBeenCalledTimes(2);
});
test('a consumed streaming write is not automatically retried on rate limit',async()=>{
 global.fetch=jest.fn(async()=>new Response('{}',{status:429}));
 await expect(new SocialAbstract().fetch('https://platform.test/upload',{method:'POST',body:{stream:true}})).rejects.toThrow();expect(global.fetch).toHaveBeenCalledTimes(1);
});
test('failure details retain bounded diagnostics, not provider/request bodies',()=>{
 for(const Kind of [BadBody,RefreshToken]){const error=new Kind('vk','{"token":"secret-token"}','private-post','Reconnect required');expect(error.message).toBe('Reconnect required');expect(JSON.stringify(error.details)).not.toMatch(/secret-token|private-post/);}
});
