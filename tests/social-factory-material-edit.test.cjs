const {loadTypeScriptModule}=require('./helpers/load-ts-module.cjs');
class DomainError extends Error{constructor(code){super(code);this.code=code;}}
const base='libraries/nestjs-libraries/src/content-intelligence/social-factory/';
const repository={SocialFactoryRepository:class{},SocialFactoryError:DomainError,resourceRef:(kind,id)=>`resource:${kind}:${id}`,sourceRef:id=>`source:${id}`};
const {CampaignService}=loadTypeScriptModule(base+'campaign/campaign.service.ts',{'../social-factory.repository':repository});
const {SocialFactoryMaterialEditService}=loadTypeScriptModule(base+'material-edit.service.ts',{'./social-factory.repository':repository,'./campaign/campaign.service':{CampaignService},'./production.service':{SocialFactoryProductionService:class{}},'./editorial/native-material.service':{NativeEditorialMaterialService:class{}},'../pieces/piece.service':{PieceService:class{}}});
async function fixture(platform='telegram'){
 const rows=new Map(),key=(org,kind,id)=>JSON.stringify([org,kind,id]);
 const store={transact:async work=>work(store),read:async(org,kind,id)=>structuredClone(rows.get(key(org,kind,id))??null),list:async(org,kind,_limit,parent)=>structuredClone([...rows.values()].filter(row=>row.organizationId===org&&row.kind===kind&&(!parent||row.parentId===parent))),put:async input=>{const before=rows.get(key(input.organizationId,input.kind,input.id));if((before?.revision??0)!==input.expectedRevision)throw new DomainError('SOCIAL_FACTORY_CONFLICT');const row={...input,revision:input.expectedRevision+1,parentId:input.parentId??before?.parentId};rows.set(key(input.organizationId,input.kind,input.id),structuredClone(row));return row;}};
 const material={version:1,channelId:'channel',platform,format:platform==='threads'?'thread':'post',title:'Title',body:'Oldbody',caption:'Oldcaption',settings:{renderedText:'Old complete Telegram',renderedCaption:'Old media caption'},assets:[{id:'a',mediaId:'owned',kind:'image',provenance:{sourceIds:['source']}}],evidence:[],pieceId:'old-piece',derivationId:'old-derivation',...(platform==='threads'?{posts:[{index:1,text:'Partone'},{index:2,text:'Parttwo'}]}:{})};
 await store.put({organizationId:'org',kind:'campaign',id:'campaign',expectedRevision:0,payload:{id:'campaign',state:'active',itemIds:['one','two']}});
 for(const id of ['one','two'])await store.put({organizationId:'org',kind:'campaign_item',id,parentId:'campaign',expectedRevision:0,payload:{id,campaignId:'campaign',channelId:'channel',platform,format:material.format,state:'scheduled',scheduledAt:'2030-01-01T12:00:00Z',contentRevision:1,material,approval:{revision:1},sourceRecordRefs:['resource:editorial:original-production']}});
 const campaigns=new CampaignService(store),native={save:jest.fn(async(_org,_actor,input)=>({...input.material,pieceId:'new-piece',derivationId:'new-derivation'}))},pieces={unscheduleAdaptation:jest.fn(async()=>{})};
 return{store,campaigns,native,pieces,service:new SocialFactoryMaterialEditService(campaigns,native,pieces),input:{campaignId:'campaign',itemId:'one',expectedContentRevision:1,body:'Changed complete text'}};
}
test('complete Telegram caption edit revokes approval, preserves other item and lineage, saves actual new native text',async()=>{
 const f=await fixture();const before=(await f.campaigns.get('org','campaign')).items.find(item=>item.id==='two');
 const edited=await f.service.edit('org','actor',f.input);
 expect(edited.material.settings.renderedCaption).toBe(f.input.body);expect(edited.material.settings.renderedText).toBe(f.input.body);
 expect(edited.approval).toBeUndefined();expect(edited.material.pieceId).toBe('new-piece');expect(edited.sourceRecordRefs).toEqual(['resource:editorial:original-production']);
 expect(f.native.save.mock.calls[0][2].material.pieceId).toBeUndefined();expect(f.pieces.unscheduleAdaptation).toHaveBeenCalledWith('org','old-piece','old-derivation','ru');
 expect((await f.campaigns.get('org','campaign')).items.find(item=>item.id==='two')).toEqual(before);
});
test('thread edit changes only selected part and refuses stale revision before native save',async()=>{
 const f=await fixture('threads');const edited=await f.service.edit('org','actor',{...f.input,postIndex:1});
 expect(edited.material.posts.map(post=>post.text)).toEqual(['Partone',f.input.body]);
 await expect(f.service.edit('org','actor',{...f.input,postIndex:0})).rejects.toHaveProperty('code','CAMPAIGN_REVISION_CONFLICT');expect(f.native.save).toHaveBeenCalledTimes(1);
});
test('native persistence failure leaves no stale native IDs or approval on revised item',async()=>{
 const f=await fixture();f.native.save.mockRejectedValue(new Error('storage unavailable'));
 await expect(f.service.edit('org','actor',f.input)).rejects.toThrow('storage unavailable');
 const item=(await f.campaigns.get('org','campaign')).items.find(row=>row.id==='one');
 expect(item.approval).toBeUndefined();expect(item.material.pieceId).toBeUndefined();expect(item.material.derivationId).toBeUndefined();
});
