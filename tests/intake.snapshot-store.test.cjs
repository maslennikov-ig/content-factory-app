'use strict';
const {loadWithMocks}=require('./helpers/load-ts-with-mocks.cjs');
const {MockRedis}=loadWithMocks('libraries/nestjs-libraries/src/redis/redis.service.ts',{'ioredis':{Redis:class{}}});
const {redisIntakeSnapshotStore,INTAKE_CLAIM_MANY_LUA}=loadWithMocks('libraries/nestjs-libraries/src/content-intelligence/intake/intake-snapshot.store.ts');

test('current Redis stand-in claims all bundle/member keys or none against a singleton, with NX and TTL',async()=>{
  const redis=new MockRedis(),store=redisIntakeSnapshotStore(redis);
  expect(await store.claim('owned:a:continuation','singleton',60)).toBe(true);
  expect(await store.claimMany(['owned:bundle:continuation','owned:a:continuation','owned:b:continuation'],'bundle',60)).toBe(false);
  expect(await store.get('owned:bundle:continuation')).toBeUndefined();
  expect(await store.get('owned:b:continuation')).toBeUndefined();
  expect(await store.get('owned:a:continuation')).toBe('singleton');
  const keys=['owned:next:continuation','owned:b:continuation','owned:c:continuation'];
  expect(await store.claimMany(keys,'bundle',60)).toBe(true);
  for(const key of keys){expect(await store.get(key)).toBe('bundle');expect(await redis.ttl(key)).toBeGreaterThan(0);}
  expect(await store.claim('owned:b:continuation','singleton',60)).toBe(false);
  expect(await store.claimMany(['owned:overlap:continuation','owned:c:continuation','owned:d:continuation'],'other',60)).toBe(false);
  expect(await store.get('owned:overlap:continuation')).toBeUndefined();
  expect(await store.get('owned:d:continuation')).toBeUndefined();
});

test('real Redis binding sends the bounded all-or-none Lua command instead of sequential SETs',async()=>{
  const redis={get:jest.fn(),set:jest.fn(),del:jest.fn(),eval:jest.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(0)};
  const store=redisIntakeSnapshotStore(redis),keys=['owned:bundle:continuation','owned:a:continuation','owned:b:continuation'];
  expect(await store.claimMany(keys,'claim',60)).toBe(true);
  expect(redis.eval).toHaveBeenCalledWith(INTAKE_CLAIM_MANY_LUA,3,...keys,'claim',60);
  expect(await store.claimMany(keys,'claim',60)).toBe(false);
  expect(redis.set).not.toHaveBeenCalled();
  for(const invalid of [[],['duplicate','duplicate'],Array.from({length:10},(_,i)=>String(i))])
    await expect(store.claimMany(invalid,'claim',60)).rejects.toThrow(/bounded/);
  expect(redis.eval).toHaveBeenCalledTimes(2);
});
