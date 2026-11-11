const {loadTypeScriptModule:load}=require('./helpers/load-ts-module.cjs');
const {createHash}=require('node:crypto');
const sharp=require('sharp');
const {readHeygenSettingsQualificationV2:read}=load('libraries/nestjs-libraries/src/videos/subscriptions/video-heygen-settings-admission.v2.ts');
const {heygenAvatarArgsV2}=load('libraries/nestjs-libraries/src/videos/subscriptions/video-heygen-settings.v2.ts');
const {inspectCreativeImageBytesV1}=load('libraries/nestjs-libraries/src/videos/video-media.v1.ts');
const binding={connectionId:'connection_one',subjectDigest:'b'.repeat(64),accountGeneration:3};
const settings={sourceLookId:'photo_one',appearanceLookId:'photo_one',voiceId:'voice_one'};
const look=(id='photo_one',extra={})=>({id,groupId:'group_one',avatarType:'photo_avatar',ownership:'owned',selectableForDraft:true,state:'available',engines:['avatar_v','avatar_iv'],...extra});
function fixture({plan='creator',subjectDigest=binding.subjectDigest,looks=[look()],looksCount=looks.length}={}) {
  const mcp={readHeygenAccountV1:jest.fn(async()=>({plan,subjectDigest,billingType:'subscription'})),
    readHeygenOwnedCatalog:jest.fn(async()=>({catalog:{avatars:looks,voices:[{id:'voice_one',state:'available',ownership:'owned',locales:['ru']}]}})),
    readHeygenOwnedAvatarGroup:jest.fn(async()=>({consentState:'accepted',looksCount}))};
  return {mcp,guard:jest.fn(async()=>{})};
}
test.each([['creator',['720p','1080p']],['free',['720p']],['unrecognized_plan',['720p']]])('fresh %s subscription determines the documented OAuth resolution ceiling',async(plan,resolutions)=>{
  const {mcp,guard}=fixture({plan});
  const q=await read(mcp,{},'private-token',binding,settings,guard);
  expect(q.resolutions).toEqual(resolutions);
  expect(q.appearance.photoOnlyAnimation).toBe(true);
  expect(mcp.readHeygenAccountV1).toHaveBeenCalledTimes(1);
  expect(q.voice).not.toHaveProperty('engineTypes');
  expect(q.voice).not.toHaveProperty('noAutomaticFallback');
});
test.each([
  {looksCount:undefined}, {looksCount:2},
  {looks:[look(),look('motion_one',{avatarType:'digital_twin',state:'training',selectableForDraft:false})]},
  {looks:[look(),look('studio_one',{avatarType:'studio_avatar'})]},
])('incomplete catalogs or another animation candidate cannot imply photo-only rendering: %j',async(options)=>{
  const {mcp,guard}=fixture(options);
  if(Object.hasOwn(options,'looksCount')&&options.looksCount===undefined)mcp.readHeygenOwnedAvatarGroup.mockResolvedValue({consentState:'accepted'});
  const q=await read(mcp,{},'private-token',binding,settings,guard);
  expect(q.appearance.photoOnlyAnimation).not.toBe(true);
});
test('a changed account is rejected before look qualification or spending',async()=>{
  const {mcp,guard}=fixture({subjectDigest:'c'.repeat(64)});
  await expect(read(mcp,{},'private-token',binding,settings,guard)).rejects.toThrow();
  expect(mcp.readHeygenOwnedAvatarGroup).not.toHaveBeenCalled();
});

const exactSettings={...settings,version:2,sourceGroupId:'group_one',groupId:'group_one',sourceMode:'text',
  voiceSettings:{locale:'ru-RU'},engine:{type:'avatar_iv'},resolution:'720p',aspectRatio:'9:16',durationSeconds:10,
  outputFormat:'mp4',captions:'none'};
test('selected glossary and observed saved engine reach a frozen wire request without inventing a model or default',async()=>{
  const {mcp,guard}=fixture();
  const selected={...exactSettings,brandGlossaryId:'glossary_one',voiceSettings:{locale:'ru-RU',
    engineSettings:{engine_type:'elevenlabs',stability:0.4}}};
  mcp.readHeygenAdvancedOptionsV1=jest.fn(async()=>({glossary:{glossaryId:'glossary_one',owned:true},
    voice:{voice:{voiceId:'voice_one',ready:true,owned:true,engineTypes:['elevenlabs']},defaultEngine:'starfish'}}));
  const q=await read(mcp,{},'private-token',binding,selected,guard);
  expect(q.ownedGlossaryIds).toEqual(['glossary_one']);
  expect(q.voice).not.toHaveProperty('models');
  expect(q.voice).not.toHaveProperty('noAutomaticFallback');
  const args=heygenAvatarArgsV2(selected,'Проверенный текст.',q);
  expect(args).toMatchObject({brandGlossaryId:'glossary_one',voiceId:'voice_one',
    voiceSettings:{engine_settings:{engine_type:'elevenlabs',stability:0.4}}});
  const inventedModel={...selected,voiceSettings:{locale:'ru-RU',engineSettings:{engine_type:'elevenlabs',model:'eleven_v4'}}};
  expect(()=>heygenAvatarArgsV2(inventedModel,'Проверенный текст.',q)).toThrow();
});

test('a background qualifies only when the same-account provider bytes match the current owned image and pinned digest',async()=>{
  const {mcp,guard}=fixture();
  const png=color=>sharp({create:{width:2,height:2,channels:3,background:color}}).png().toBuffer();
  const local=await png('red'), other=await png('blue'), hash=createHash('sha256').update(local).digest('hex');
  const url='https://resource2.heygen.ai/signed.png?private=1', background={type:'image',assetId:'asset_one',mediaId:'media_one',contentDigest:hash};
  const selected={...exactSettings,background};
  mcp.readHeygenAdvancedOptionsV1=jest.fn(async(_def,_token,input,_guard,consume)=>{
    expect(input).toMatchObject({subjectDigest:binding.subjectDigest,backgroundAssetId:'asset_one'});
    await consume?.({assetId:'asset_one',url,name:'Owned image'});
    return {backgroundAsset:{assetId:'asset_one',owned:true,type:'image',renderQualified:false,
      limitation:{setting:'background_asset',reason:'local_media_asset_binding_unverified'}}};
  });
  const mediaRow=jest.fn(async()=>({type:'image',path:'owned-storage-path'}));
  const media={inspectOwnedImage:jest.fn(async()=>inspectCreativeImageBytesV1(local)),
    inspectRemoteImage:jest.fn(async()=>inspectCreativeImageBytesV1(local))};
  const context={organizationId:'org_one',mediaRow,media};
  const q=await read(mcp,{},'private-token',binding,selected,guard,context);
  expect(mediaRow).toHaveBeenCalledWith('org_one','media_one');
  expect(media.inspectRemoteImage).toHaveBeenCalledWith(url,'https://resource2.heygen.ai');
  expect(heygenAvatarArgsV2(selected,'Проверенный текст.',q).background).toEqual({type:'image',asset_id:'asset_one'});
  expect(JSON.stringify(q)).not.toContain(url);
  media.inspectRemoteImage.mockImplementation(async()=>inspectCreativeImageBytesV1(other));
  await expect(read(mcp,{},'private-token',binding,selected,guard,context))
    .rejects.toMatchObject({response:{reason:'background_asset_content_mismatch'}});
  mediaRow.mockResolvedValueOnce(null);
  await expect(read(mcp,{},'private-token',binding,selected,guard,context))
    .rejects.toMatchObject({response:{reason:'background_asset_content_mismatch'}});
  await expect(read(mcp,{},'private-token',binding,selected,guard))
    .rejects.toMatchObject({response:{reason:'local_media_asset_binding_unverified'}});
});
