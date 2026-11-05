const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const { SocialFactoryRepository, sourceRef, resourceRef } = loadTypeScriptModule('libraries/nestjs-libraries/src/content-intelligence/social-factory/social-factory.repository.ts');

function fixture() {
  const rows = [];
  const match = (row, where) => Object.entries(where).every(([key, value]) => {
    if (key === 'OR') return value.some(clause => match(row, clause));
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      if ('gt' in value) return row[key] != null && row[key] > value.gt;
      if ('lte' in value) return row[key] != null && row[key] <= value.lte;
      if ('has' in value) return row[key].includes(value.has);
    }
    return row[key] === value;
  });
  const model = {
    findFirst: async ({where}) => structuredClone(rows.find(row => match(row, where)) ?? null),
    findMany: async ({where, take}) => structuredClone(rows.filter(row => match(row, where)).sort((a,b) => a.id.localeCompare(b.id)).slice(0,take)),
    create: async ({data}) => {
      if (rows.some(r => r.organizationId === data.organizationId && r.kind === data.kind && r.id === data.id)) throw {code:'P2002'};
      const row = {revision:1,parentId:null,deletedAt:null,invalidatedAt:null,expiresAt:null,sourceIds:[],createdAt:new Date(),updatedAt:new Date(),...Object.fromEntries(Object.entries(data).filter(([,v])=>v!==undefined))};
      rows.push(structuredClone(row)); return structuredClone(row);
    },
    updateMany: async ({where,data}) => {
      const selected = rows.filter(row => match(row,where));
      for (const row of selected) for (const [k,v] of Object.entries(data)) row[k] = v?.increment ? row[k]+v.increment : structuredClone(v);
      return {count:selected.length};
    },
  };
  const client = {socialFactoryRecord:model};
  const repo = new SocialFactoryRepository({model:client},{model:{$transaction:async work=>work(client)}});
  return {repo,rows};
}
const put = (repo,kind,id,extra={}) => repo.put({organizationId:'a',kind,id,payload:{text:'private source'},expectedRevision:0,...extra});

test('tenant scope, CAS and tombstone reject stale recreation', async()=>{
  const {repo,rows}=fixture();
  await put(repo,'channel_profile','same');
  expect(await repo.read('b','channel_profile','same')).toBeNull();
  await expect(repo.put({organizationId:'b',kind:'channel_profile',id:'same',payload:{},expectedRevision:1})).rejects.toHaveProperty('code','SOCIAL_FACTORY_CONFLICT');
  await repo.remove('a','channel_profile','same',1);
  expect(rows[0].payload).toEqual({redacted:true});
  await expect(put(repo,'channel_profile','same')).rejects.toHaveProperty('code','SOCIAL_FACTORY_CONFLICT');
});
test('cursor pages preserve all records and never cross tenant or parent', async()=>{
  const {repo}=fixture();
  for (let i=0;i<5;i++) await put(repo,'campaign_item',String(i),{parentId:'p'});
  await put(repo,'campaign_item','other',{parentId:'q'});
  const a=await repo.page('a','campaign_item',{limit:2,parentId:'p'});
  const b=await repo.page('a','campaign_item',{limit:2,parentId:'p',cursor:a.nextCursor});
  const c=await repo.page('a','campaign_item',{limit:2,parentId:'p',cursor:b.nextCursor});
  expect([...a.items,...b.items,...c.items].map(r=>r.id)).toEqual(['0','1','2','3','4']);
  expect(c.nextCursor).toBeNull();
  await expect(repo.list('a','campaign_item',2,'p')).rejects.toHaveProperty('code','SOCIAL_FACTORY_PAGE_REQUIRED');
});
test('source revoke redacts descendants using typed refs and preserves other source/kind/tenant',async()=>{
  const {repo,rows}=fixture();
  await put(repo,'discovery','same',{sourceIds:[sourceRef('src')]});
  await put(repo,'editorial','child',{sourceIds:[resourceRef('discovery','same')]});
  await put(repo,'finding','grandchild',{sourceIds:[resourceRef('editorial','child')]});
  await put(repo,'campaign','same');
  await repo.put({organizationId:'b',kind:'discovery',id:'same',sourceIds:[sourceRef('src')],payload:{text:'other tenant'},expectedRevision:0});
  expect(await repo.invalidateBySource('a','src')).toBe(3);
  expect(rows.filter(r=>r.invalidatedAt).map(r=>r.payload)).toEqual(Array(3).fill({redacted:true}));
  expect(await repo.read('a','campaign','same')).not.toBeNull();
  expect((await repo.read('b','discovery','same')).payload.text).toBe('other tenant');
});
test('planning cache expiry clears only stale cache bytes and preserves derived history',async()=>{
  const {repo,rows}=fixture();
  await put(repo,'discovery','old',{expiresAt:new Date('2000-01-01'),sourceIds:[sourceRef('src')]});
  await put(repo,'editorial','derived',{sourceIds:[resourceRef('discovery','old')]});
  expect(await repo.read('a','discovery','old')).toBeNull();
  expect(await repo.purgeExpired('a',new Date('2020-01-01'))).toBe(1);
  expect(rows.map(r=>r.payload)).toEqual([{expired:true},{text:'private source'}]);
  expect(await repo.purgeExpired('a',new Date('2020-01-01'))).toBe(0);
});
test('explicit remove works after expiry and cascades derived data',async()=>{
  const {repo,rows}=fixture();
  await put(repo,'discovery','old',{expiresAt:new Date('2000-01-01')});
  await put(repo,'editorial','derived',{sourceIds:[resourceRef('discovery','old')]});
  await repo.remove('a','discovery','old',1);
  expect(rows.every(r=>r.payload.redacted)).toBe(true);
});
test('journal records refuse mutation',async()=>{
  const {repo}=fixture();
  await put(repo,'observation','o');
  await expect(repo.put({organizationId:'a',kind:'observation',id:'o',payload:{value:999},expectedRevision:1})).rejects.toHaveProperty('code','SOCIAL_FACTORY_IMMUTABLE');
});
test('source removal preserves manual profile and campaign allocation while clearing derived material',async()=>{
  const {repo,rows}=fixture();
  await put(repo,'channel_profile','channel',{payload:{audience:'owner audience',promise:'owner promise'},sourceIds:[sourceRef('src')]});
  await put(repo,'channel_profile_snapshot','snapshot',{sourceIds:[sourceRef('src')]});
  await put(repo,'campaign','campaign',{payload:{allocations:[{count:10,format:'story'}]},sourceIds:[resourceRef('channel_profile_snapshot','snapshot')]});
  await put(repo,'campaign_item','item',{payload:{id:'item',campaignId:'campaign',channelId:'channel',state:'scheduled',contentRevision:3,scheduledAt:'2027-01-02T00:00:00Z',material:{body:'source text'},approval:{digest:'old'}},sourceIds:[resourceRef('channel_profile_snapshot','snapshot')]});
  await repo.invalidateBySource('a','src');
  expect((await repo.read('a','channel_profile','channel')).payload.audience).toBe('owner audience');
  expect((await repo.read('a','campaign','campaign')).payload.allocations[0].count).toBe(10);
  const item=(await repo.read('a','campaign_item','item')).payload;
  expect(item.state).toBe('needs_input'); expect(item.material).toBeUndefined();expect(item.approval).toBeUndefined();
  expect(item.scheduledAt).toBe('2027-01-02T00:00:00Z'); expect(item.contentRevision).toBe(4);
  expect(rows.find(r=>r.id==='snapshot').payload).toEqual({redacted:true});
});

test('observation retention clears derived findings but stops expiry cascade before prepared content',async()=>{
 const {repo,rows}=fixture();
 await put(repo,'observation','metric',{expiresAt:new Date('2000-01-01')});
 await put(repo,'finding','guidance',{sourceIds:[resourceRef('observation','metric')]});
 await put(repo,'editorial','prepared',{sourceIds:[resourceRef('finding','guidance')]});
 expect(await repo.purgeExpired('a',new Date('2020-01-01'))).toBe(2);
 expect(await repo.read('a','finding','guidance')).toBeNull();
 expect((await repo.read('a','editorial','prepared')).payload.text).toBe('private source');
});
