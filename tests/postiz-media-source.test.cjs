const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const validator = loadTypeScriptModule('libraries/nestjs-libraries/src/dtos/webhooks/webhook.url.validator.ts');
const safe = loadTypeScriptModule('libraries/helpers/src/utils/media.source.ts', {
  '@contentfactory/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher': {ssrfSafeDispatcher: {}},
  '@contentfactory/nestjs-libraries/dtos/webhooks/webhook.url.validator': {
    isSafePublicHttpsUrl: url => new URL(url).hostname === 'public.test' ? Promise.resolve(true) : validator.isSafePublicHttpsUrl(url),
  },
});
let directory, outside, saved;
beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'cf-media-test-'));
  outside = await fs.mkdtemp(path.join(os.tmpdir(), 'cf-media-outside-'));
  saved = {UPLOAD_DIRECTORY:process.env.UPLOAD_DIRECTORY, FRONTEND_URL:process.env.FRONTEND_URL, STORAGE_PROVIDER:process.env.STORAGE_PROVIDER, fetch:global.fetch};
  process.env.UPLOAD_DIRECTORY=directory;process.env.FRONTEND_URL='http://127.0.0.1:4999';process.env.STORAGE_PROVIDER='local';
  await fs.mkdir(path.join(directory,'2026'));await fs.writeFile(path.join(directory,'2026','ok.mp4'),Buffer.alloc(3*1024*1024,7));
  await fs.writeFile(path.join(outside,'secret'),'private');
});
afterEach(async()=>{for(const k of ['UPLOAD_DIRECTORY','FRONTEND_URL','STORAGE_PROVIDER']){if(saved[k]===undefined)delete process.env[k];else process.env[k]=saved[k];}global.fetch=saved.fetch;await fs.rm(directory,{recursive:true,force:true});await fs.rm(outside,{recursive:true,force:true});});
const collect=async media=>{try{const chunks=[];for await(const chunk of media.stream)chunks.push(Buffer.from(chunk));return Buffer.concat(chunks);}finally{media.close();}};
test.each(['../secret','%2e%2e/secret','x/%2e%2e/secret','x\\secret','file:///etc/passwd','/etc/passwd'])('local path %s cannot escape',async source=>{await expect(safe.readMediaSource(source)).rejects.toThrow();});
test('directory and file symlinks refuse read and delete without touching outside bytes',async()=>{
 await fs.symlink(outside,path.join(directory,'link'));await fs.symlink(path.join(outside,'secret'),path.join(directory,'secret'));
 for(const source of ['link/secret','secret']){await expect(safe.readMediaSource(source)).rejects.toThrow();await expect(safe.removeConfinedMediaFile(source)).rejects.toThrow();}
 expect(await fs.readFile(path.join(outside,'secret'),'utf8')).toBe('private');
});
test('own loopback uploads use confined file streaming, not network or whole buffer',async()=>{
 global.fetch=jest.fn(()=>{throw Error('must not fetch own storage')});
 const media=await safe.readMediaSource('http://127.0.0.1:4999/uploads/2026/ok.mp4');expect(media.size).toBe(3*1024*1024);
 let bytes=0,max=0;for await(const chunk of media.stream){bytes+=chunk.length;max=Math.max(max,chunk.length);}media.close();
 expect(bytes).toBe(3*1024*1024);expect(max).toBeLessThan(1024*1024);expect(global.fetch).not.toHaveBeenCalled();
});
test('valid delete and bounded local read work',async()=>{
 await expect(safe.readMediaSource('2026/ok.mp4',{maxBytes:12})).rejects.toThrow('MEDIA_TOO_LARGE');
 await safe.removeConfinedMediaFile('2026/ok.mp4');await expect(fs.stat(path.join(directory,'2026/ok.mp4'))).rejects.toThrow();
});
test.each(['https://127.0.0.1/x','https://[::1]/x','https://169.254.169.254/x','http://public.test/x'])('private/insecure URL refused: %s',async url=>{global.fetch=jest.fn();await expect(safe.readMediaSource(url)).rejects.toThrow();expect(global.fetch).not.toHaveBeenCalled();});
test('redirect is revalidated and its body cancelled',async()=>{
 const cancel=jest.fn(async()=>{});global.fetch=jest.fn(async()=>({status:302,headers:new Headers({location:'https://127.0.0.1/private'}),body:{cancel}}));
 await expect(safe.readMediaSource('https://public.test/x')).rejects.toThrow('MEDIA_URL_UNSAFE');expect(global.fetch).toHaveBeenCalledTimes(1);expect(cancel).toHaveBeenCalledTimes(1);
});
test('remote oversized chunk and truncated declared body fail',async()=>{
 global.fetch=async()=>new Response(new Uint8Array(20));await expect(collect(await safe.readMediaSource('https://public.test/x',{maxBytes:10}))).rejects.toThrow('MEDIA_TOO_LARGE');
 global.fetch=async()=>new Response(new Uint8Array(2),{headers:{'content-length':'9'}});await expect(collect(await safe.readMediaSource('https://public.test/x'))).rejects.toThrow('MEDIA_BODY_INCOMPLETE');
});
test('stalled response body and cancellation are bounded',async()=>{
 let cancelled=0;global.fetch=async()=>new Response(new ReadableStream({cancel(){cancelled++;}}));
 await expect(collect(await safe.readMediaSource('https://public.test/x',{idleTimeoutMs:15}))).rejects.toThrow('MEDIA_READ_TIMEOUT');expect(cancelled).toBeGreaterThan(0);
 const controller=new AbortController();controller.abort();await expect(safe.readMediaSource('https://public.test/x',{signal:controller.signal})).rejects.toThrow();
});
test('private spool has exact size and removes only its own file',async()=>{
 const spool=await safe.spoolMediaSource('2026/ok.mp4');expect(spool.size).toBe(3*1024*1024);expect((await fs.stat(spool.path)).mode&0o777).toBe(0o600);await spool.close();await expect(fs.stat(spool.path)).rejects.toThrow();expect((await fs.stat(path.join(directory,'2026/ok.mp4'))).size).toBe(spool.size);
});
test('single local ranges stream exact bytes and reject unsatisfiable ranges',async()=>{
 const media=await safe.readMediaSource('2026/ok.mp4',{range:'bytes=3-9'});expect(media.status).toBe(206);expect(media.size).toBe(7);expect(media.contentRange).toBe('bytes 3-9/3145728');expect((await collect(media)).length).toBe(7);
 await expect(safe.readMediaSource('2026/ok.mp4',{range:'bytes=9999999-'})).rejects.toThrow('MEDIA_RANGE_INVALID');
});
test('single remote range is forwarded and response size is checked',async()=>{
 global.fetch=jest.fn(async()=>new Response(new Uint8Array([1,2,3]),{status:206,headers:{'content-range':'bytes 2-4/10','content-length':'3'}}));
 const media=await safe.readMediaSource('https://public.test/video.mp4',{range:'bytes=2-4'});expect(global.fetch.mock.calls[0][1].headers).toEqual({Range:'bytes=2-4'});expect(await collect(media)).toEqual(Buffer.from([1,2,3]));
 await expect(safe.readMediaSource('https://public.test/video.mp4',{range:'bytes=1-2,3-4'})).rejects.toThrow('MEDIA_RANGE_INVALID');
 global.fetch=async()=>new Response(null,{status:416});await expect(safe.readMediaSource('https://public.test/video.mp4',{range:'bytes=999-'})).rejects.toThrow('MEDIA_RANGE_INVALID');
});
