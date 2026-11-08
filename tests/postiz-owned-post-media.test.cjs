const {loadTypeScriptModule}=require('./helpers/load-ts-module.cjs');
const {resolveOwnedPostMediaV1}=loadTypeScriptModule('libraries/nestjs-libraries/src/database/prisma/media/owned-post-media.v1.ts');
const own={id:'own',organizationId:'a',path:'https://storage.test/uploads/own.png',alt:'default'};
const other={id:'foreign',organizationId:'b',path:'https://storage.test/uploads/foreign.png'};
const cover={id:'cover',organizationId:'a',path:'https://storage.test/uploads/cover.png'};
const lookup={byId:async(org,id)=>[own,other,cover].find(row=>row.id===id&&row.organizationId===org)||null,byPath:async(org,path)=>[own,other,cover].find(row=>row.path===path&&row.organizationId===org)||null,exists:async id=>[own,other,cover].some(row=>row.id===id)};
let before;
beforeEach(()=>{before=process.env.FRONTEND_URL;process.env.FRONTEND_URL='https://storage.test';});afterEach(()=>{if(before===undefined)delete process.env.FRONTEND_URL;else process.env.FRONTEND_URL=before;});
test('id+path cannot bypass organization lookup or override canonical source',async()=>{
 await expect(resolveOwnedPostMediaV1('a',[{id:'foreign',path:own.path}],lookup)).rejects.toThrow('MEDIA_NOT_OWNED');
 const r=await resolveOwnedPostMediaV1('a',[{id:'own',path:'/etc/passwd',alt:'post alt'}],lookup);expect(r.items[0]).toMatchObject({path:own.path,alt:'post alt'});expect(r.changed).toBe(true);
});
test('local/stored path-only references need an owned live row',async()=>{
 await expect(resolveOwnedPostMediaV1('a',[{path:other.path}],lookup)).rejects.toThrow('MEDIA_NOT_OWNED');
 await expect(resolveOwnedPostMediaV1('a',[{path:'/etc/passwd'}],lookup)).rejects.toThrow('MEDIA_NOT_OWNED');
 expect((await resolveOwnedPostMediaV1('a',[{path:own.path}],lookup)).items[0].id).toBe('own');
});
test('deleted rows refuse and cover metadata stays organization scoped',async()=>{
 await expect(resolveOwnedPostMediaV1('a',[{id:'gone'}],{...lookup,byId:async()=>({...own,deletedAt:new Date()})})).rejects.toThrow('MEDIA_NOT_OWNED');
 await expect(resolveOwnedPostMediaV1('a',[{id:'own',thumbnail:other.path}],lookup)).rejects.toThrow('MEDIA_COVER_NOT_OWNED');
 expect((await resolveOwnedPostMediaV1('a',[{id:'own',thumbnail:cover.path,thumbnailTimestamp:0}],lookup)).items[0]).toMatchObject({thumbnail:cover.path,thumbnailTimestamp:0});
});
test('DTO-valid external API attachment labels remain supported but foreign/deleted IDs never fall back',async()=>{
 const reference={id:'client-generated-label',path:'https://public-third-party.test/image.png',thumbnail:'https://public-third-party.test/cover.png'};
 expect((await resolveOwnedPostMediaV1('a',[reference],lookup)).items[0]).toMatchObject(reference);
 await expect(resolveOwnedPostMediaV1('a',[{...reference,id:'foreign'}],lookup)).rejects.toThrow('MEDIA_NOT_OWNED');
 await expect(resolveOwnedPostMediaV1('a',[{...reference,id:'deleted'}],{...lookup,exists:async()=>true})).rejects.toThrow('MEDIA_NOT_OWNED');
});
test('publication preparation never falls back to rejected original references',async()=>{
 const {loadPostsService}=require('./helpers/posts-service.module.cjs');const {PostsService}=loadPostsService();const service=Object.create(PostsService.prototype);
 service._mediaService={resolvePostMediaV1:async()=>{throw Error('MEDIA_NOT_OWNED');}};
 await expect(service.updateMedia('a','post',[{id:'foreign',path:'/etc/passwd'}])).rejects.toThrow('does not belong');
});
