'use strict';
const React=require('react');
const {JSDOM}=require('jsdom');
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost/media?video=1'});
for(const key of ['window','document','navigator'])Object.defineProperty(global,key,{configurable:true,value:key==='window'?dom.window:dom.window[key]});
global.self=dom.window;global.IS_REACT_ACT_ENVIRONMENT=true;
const {act,cleanup,fireEvent,render,screen,waitFor}=require('@testing-library/react');
const {SWRConfig}=require('swr');
const {loadWithMocks}=require('./helpers/load-ts-with-mocks.cjs');
const ids={connection:'11111111-1111-4111-8111-111111111111',profile:'22222222-2222-4222-8222-222222222222',draft:'33333333-3333-4333-8333-333333333333'};
const avatars=[{id:'base-a',name:'Blue jacket',groupId:'group-a',engines:['avatar_iv'],avatarType:'photo_avatar',ownership:'owned',selectableForDraft:true,state:'available'},
{id:'base-b',name:'Grey jacket',groupId:'group-a',engines:['avatar_iv'],avatarType:'photo_avatar',ownership:'owned',selectableForDraft:true,state:'available'},
{id:'other',name:'Same name, different group',groupId:'group-b',engines:['avatar_iv'],avatarType:'photo_avatar',ownership:'owned',selectableForDraft:true,state:'available'}];
const voices=[{id:'voice',name:'Approved original voice',ownership:'owned',selectableForDraft:true,state:'available'}];
const profile=()=>({profileId:ids.profile,revision:2,digest:'a'.repeat(64),connectionId:ids.connection,displayName:'Ilya',setupReusable:true,
 preferredSourceLookId:'base-a',defaultAppearanceLookId:'base-a',sourceLooks:[{groupId:'group-a',lookId:'base-a',roles:['style_base','appearance']},{groupId:'group-a',lookId:'base-b',roles:['style_base','appearance']}],
 defaultVoice:{voiceId:'voice',baseline:{speed:0.9}},observations:{voice:{name:'Approved original voice'},looks:avatars.map(look=>({lookId:look.id,name:look.name}))}});
const draft=()=>({id:ids.draft,version:3,pieceId:'piece',pieceRevision:'b'.repeat(64),brief:{script:'Точные русские слова.',scriptPolicy:'exact'},settings:{provider:'heygen',model:'heygen-avatar',mode:'presenter',locale:'ru-RU',duration:8,aspectRatio:'9:16',resolution:'720p',audio:true,captions:false,avatarId:'base-a',voiceId:'voice',engine:'avatar_iv',
 heygenV2:{binding:{profileId:ids.profile,profileRevision:2,profileDigest:'a'.repeat(64),connectionId:ids.connection,sourcePin:{pieceId:'piece',sourceRevision:'b'.repeat(64)}},settings:{version:2,sourceLookId:'base-a',sourceGroupId:'group-a',appearanceLookId:'base-a',groupId:'group-a',voiceId:'voice',sourceMode:'text',engine:{type:'avatar_iv'},voiceSettings:{locale:'ru-RU',speed:0.9},durationSeconds:8,aspectRatio:'9:16',resolution:'720p',outputFormat:'mp4',captions:'none'}}}});
let calls,profiles,failSave,profilePage,settingsError;
const request=async(path,init={})=>{const body=init.body?JSON.parse(init.body):null;calls.push({path,method:init.method??'GET',body});
 if(path.includes('/person-profiles')&&!init.method&&!path.endsWith('/preview'))return profilePage?profilePage(path):{ok:true,json:async()=>({items:profiles,nextCursor:null})};
 if(path.endsWith('/person-profile-proposals'))return {ok:true,json:async()=>({profile:body,selectionDigest:'c'.repeat(64),name:body.displayName,looks:body.sourceLooks.map(ref=>({id:ref.lookId,name:avatars.find(look=>look.id===ref.lookId).name,groupId:ref.groupId})),voice:{id:'voice',name:'Approved original voice'},requiresHumanConfirmation:true})};
 if(path==='/media/video-v2/person-profiles')return {ok:!failSave,json:async()=>profile()};
 if(path==='/media/video-v2/heygen-settings')return settingsError?{ok:false,json:async()=>settingsError}:{ok:true,json:async()=>{const next=draft();next.version++;next.settings.heygenV2.settings.voiceSettings={locale:'ru-RU',...body.overrides.voiceSettings};return next;}};
 if(path.endsWith('/preview'))return {ok:true,json:async()=>({id:'owned-preview',path:'/owned/blue-jacket.png',type:'image'})};
 throw Error(`Unexpected ${path}`);
};
const {VideoHeygenPersonControls,patchHeygenVideoSettings}=loadWithMocks('apps/frontend/src/components/videos/video-heygen-person-controls.tsx',{
 '@contentfactory/helpers/utils/custom.fetch':{useFetch:()=>request},
 '@contentfactory/react/translation/use-interface-language':{useInterfaceLanguage:()=> 'en'},
});
const draw=(extra={})=>{const props={actorKey:'org:actor',connectionId:ids.connection,connectionGeneration:1,draft:draft(),avatars,voices,disabled:false,draftDirty:false,onDirtyChange:jest.fn(),onBusyChange:jest.fn(),onSaved:jest.fn(async()=>{}),...extra};
 const cache=new Map(),tree=values=>React.createElement(SWRConfig,{value:{provider:()=>cache,dedupingInterval:0,loadingTimeout:0,focusThrottleInterval:0,errorRetryCount:0}},React.createElement(VideoHeygenPersonControls,values));const view=render(tree(props));return {...view,props,rerenderControls:changes=>view.rerender(tree({...props,...changes}))};};
beforeEach(()=>{calls=[];profiles=[profile()];failSave=false;profilePage=null;settingsError=null;});afterEach(cleanup);afterAll(()=>dom.window.close());

test('expanded output and V controls form one exact new recipe without changing the saved identity or launching',async()=>{
 const source=draft();source.settings.heygenV2.settings.engine={type:'avatar_v',moreBlinking:false};
 const currentAvatars=avatars.map(look=>({...look,engines:['avatar_iv','avatar_v']}));
 const view=draw({draft:source,avatars:currentAvatars});await screen.findByText(/The identity and voice are already selected/);
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Settings for this video'})));
 await act(async()=>fireEvent.change(screen.getByRole('combobox',{name:'Video resolution'}),{target:{value:'1080p'}}));
 await act(async()=>fireEvent.change(screen.getByRole('combobox',{name:'Frame format'}),{target:{value:'4:5'}}));
 await act(async()=>fireEvent.change(screen.getByRole('spinbutton',{name:'Target duration, seconds'}),{target:{value:'73'}}));
 await act(async()=>fireEvent.change(screen.getByRole('combobox',{name:'Captions'}),{target:{value:'sidecar'}}));
 await act(async()=>fireEvent.click(screen.getByRole('checkbox',{name:'More natural blinking'})));
 expect(screen.queryByRole('textbox',{name:'Motion and gestures'})).toBeNull();
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Apply to this video'})));
 await waitFor(()=>expect(view.props.onSaved).toHaveBeenCalledTimes(1));
 const sent=calls.find(call=>call.path.endsWith('/heygen-settings')).body;
 expect(sent.overrides).toMatchObject({engine:{type:'avatar_v',moreBlinking:true},resolution:'1080p',aspectRatio:'4:5',durationSeconds:73,captions:'sidecar'});
 expect(sent).not.toHaveProperty('animationReferenceLookId');expect(sent).not.toHaveProperty('script');
 expect(source.settings.heygenV2.settings.engine.moreBlinking).toBe(false);
 expect(calls.filter(call=>call.method==='POST').map(call=>call.path)).toEqual(['/media/video-v2/heygen-settings']);
});

test('a setting refusal explains the specific limitation and retains edits for correction',async()=>{
 const view=draw();await screen.findByText(/The identity and voice are already selected/);
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Settings for this video'})));
 await act(async()=>fireEvent.change(screen.getByRole('combobox',{name:'Video resolution'}),{target:{value:'1080p'}}));
 settingsError={code:'VIDEO_HEYGEN_SETTING_UNAVAILABLE',setting:'resolution',remedy:'PRIVATE_PROVIDER_TEXT'};
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Apply to this video'})));
 await screen.findByText('This resolution is not qualified for the connected subscription and look.');
 expect(screen.getByRole('combobox',{name:'Video resolution'}).value).toBe('1080p');
 expect(screen.queryByText('PRIVATE_PROVIDER_TEXT')).toBeNull();expect(view.props.onSaved).not.toHaveBeenCalled();
});
test('saved human profile and voice are reused without creating setup or making a selection on mount',async()=>{
 draw();await screen.findByText(/The identity and voice are already selected/);
 expect(document.querySelector('#heygen-person-profile').value).toBe(ids.profile);
 expect(document.querySelector('#heygen-source-look').value).toBe('base-a');
 expect(screen.getByRole('button',{name:'Apply to this video'}).disabled).toBe(true);
 expect(calls.every(call=>call.method==='GET')).toBe(true);
 expect(document.querySelector('img')).toBeNull();
});
test('per-video overrides keep reusable defaults and exact speech unchanged and invalidate current approval on editing',async()=>{
 const view=draw();await screen.findByText(/The identity and voice are already selected/);
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Settings for this video'})));
 await act(async()=>fireEvent.change(screen.getByRole('spinbutton',{name:'Speech speed'}),{target:{value:'1.2'}}));
 expect(view.props.onDirtyChange).toHaveBeenCalledWith(true);
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Apply to this video'})));
 await waitFor(()=>expect(view.props.onSaved).toHaveBeenCalledTimes(1));
 const sent=calls.find(call=>call.path.endsWith('/heygen-settings')).body;
 expect(sent).toMatchObject({draftId:ids.draft,version:3,connectionId:ids.connection,profileId:ids.profile,sourceLookId:'base-a',appearanceLookId:'base-a',overrides:{voiceSettings:{speed:1.2}}});
 expect(profile().defaultVoice.baseline.speed).toBe(0.9);
 expect(sent).not.toHaveProperty('defaultVoice');expect(sent).not.toHaveProperty('script');
 expect(view.props.onSaved.mock.calls[0][0].brief.script).toBe('Точные русские слова.');
 expect(view.props.onSaved.mock.calls[0][1]).toEqual({id:ids.draft,version:3});
 expect(calls.some(call=>call.path==='/media/video-v2/person-profiles')).toBe(false);
});
test('new profile needs actual look and voice choices, exact review and a separate explicit human save',async()=>{
 draw();await screen.findByText(/The identity and voice are already selected/);
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Add a person'})));
 expect(document.querySelector('#heygen-new-person-look').value).toBe('');expect(document.querySelector('#heygen-new-person-voice').value).toBe('');
 expect(screen.getByRole('button',{name:'Review this choice'}).disabled).toBe(true);
 await act(async()=>fireEvent.change(screen.getByRole('textbox',{name:'Profile name'}),{target:{value:'Ilya'}}));
 await act(async()=>fireEvent.change(document.querySelector('#heygen-new-person-look'),{target:{value:'base-a'}}));
 await act(async()=>fireEvent.change(document.querySelector('#heygen-new-person-voice'),{target:{value:'voice'}}));
 expect(screen.queryByRole('checkbox',{name:'Same name, different group'})).toBeNull();
 await act(async()=>fireEvent.click(screen.getByRole('checkbox',{name:'Grey jacket'})));
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Review this choice'})));
 await screen.findByRole('region',{name:'Confirm person profile'});
 expect(calls.filter(call=>call.path==='/media/video-v2/person-profiles')).toHaveLength(0);
 const proposal=calls.find(call=>call.path.endsWith('/person-profile-proposals')).body;
 expect(proposal).toMatchObject({expectedRevision:0,groupIds:['group-a'],preferredGroupId:'group-a',preferredSourceLookId:'base-a',defaultVoice:{voiceId:'voice'}});
 expect(proposal.sourceLooks.map(look=>look.lookId)).toEqual(['base-a','base-b']);
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Confirm and save person profile'})));
 expect(calls.find(call=>call.path==='/media/video-v2/person-profiles').body).toEqual({profile:proposal,selectionDigest:'c'.repeat(64)});
 expect(calls.some(call=>/jobs|launch|preflight|heygen-settings/.test(call.path))).toBe(false);
});
test('owned preview is requested only for an actual saved previewMediaId',async()=>{
 profiles[0].sourceLooks[0].previewMediaId='44444444-4444-4444-8444-444444444444';draw();
 const image=await screen.findByRole('img',{name:'Blue jacket'});expect(image.getAttribute('src')).toBe('/owned/blue-jacket.png');
 expect(calls.filter(call=>call.path.endsWith('/preview'))).toHaveLength(1);
});
test('common per-video fields sync outer and frozen proposal settings without changing person, source, voice or defaults',()=>{
 const current=draft().settings,before=structuredClone(current);
 const next=patchHeygenVideoSettings(current,{duration:10,locale:'en-US',aspectRatio:'16:9',resolution:'1080p',captions:true});
 expect(next.heygenV2.settings).toMatchObject({durationSeconds:10,voiceSettings:{locale:'en-US',speed:0.9},aspectRatio:'16:9',resolution:'1080p',captions:'burned',voiceId:'voice',sourceLookId:'base-a'});
 expect(next.heygenV2.binding).toEqual(before.heygenV2.binding);expect(current).toEqual(before);
});

test('model choices come only from the selected owned look and changing model stays per-video',async()=>{
 avatars[0].engines=['avatar_iii','avatar_iv'];
 try{draw();await screen.findByText(/The identity and voice are already selected/);
  await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Settings for this video'})));
  const select=document.querySelector('#heygen-avatar-model');expect([...select.options].map(option=>option.value)).toEqual(['','avatar_iii','avatar_iv']);
  await act(async()=>fireEvent.change(select,{target:{value:'avatar_iii'}}));
  expect(screen.queryByRole('combobox',{name:'Expressiveness'})).toBeNull();
  await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Apply to this video'})));
  await waitFor(()=>expect(calls.some(call=>call.path.endsWith('/heygen-settings'))).toBe(true));
  expect(calls.find(call=>call.path.endsWith('/heygen-settings')).body.overrides.engine).toEqual({type:'avatar_iii'});
 }finally{avatars[0].engines=['avatar_iv'];}
});

const pageResponse=(items,nextCursor=null)=>({ok:true,json:async()=>({items,nextCursor})});
test('cursor pages deduplicate and retain the selected person, with one concurrent page read',async()=>{
 const cursor='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',second={...profile(),profileId:'55555555-5555-4555-8555-555555555555',displayName:'Second saved person'};let release;
 profilePage=path=>path.includes('?cursor=')?new Promise(resolve=>{release=resolve;}):pageResponse([profile()],cursor);
 draw();await screen.findByText(/The identity and voice are already selected/);
 const more=screen.getByRole('button',{name:'More profiles'});
 await act(async()=>{fireEvent.click(more);fireEvent.click(more);});
 await waitFor(()=>expect(calls.filter(call=>call.path.includes('?cursor='))).toHaveLength(1));
 expect(calls.find(call=>call.path.includes('?cursor=')).path).toBe(`/media/video-v2/connections/${ids.connection}/person-profiles?cursor=${cursor}`);
 await act(async()=>release(pageResponse([profile(),second])));
 await screen.findByRole('option',{name:'Second saved person'});
 expect(document.querySelector('#heygen-person-profile').value).toBe(ids.profile);
 expect([...document.querySelector('#heygen-person-profile').options].filter(option=>option.value===ids.profile)).toHaveLength(1);
 expect(screen.queryByRole('button',{name:'More profiles'})).toBeNull();
 expect(calls.every(call=>call.method==='GET')).toBe(true);
});
test('failed next page keeps loaded profiles and offers retry for the same cursor',async()=>{
 const cursor='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';let fail=true;
 const second={...profile(),profileId:'55555555-5555-4555-8555-555555555555',displayName:'Recovered person'};
 profilePage=path=>path.includes('?cursor=')?fail?{ok:false}:pageResponse([second]):pageResponse([profile()],cursor);
 draw();await screen.findByText(/The identity and voice are already selected/);
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'More profiles'})));
 await screen.findByText(/The next page could not be loaded/);
 expect(document.querySelector('#heygen-person-profile').value).toBe(ids.profile);
 expect(screen.getByRole('option',{name:'Ilya'})).toBeTruthy();
 fail=false;await act(async()=>fireEvent.click(screen.getByRole('button',{name:'More profiles'})));
 await screen.findByRole('option',{name:'Recovered person'});
 expect(calls.filter(call=>call.path.includes('?cursor=')).map(call=>call.path.split('?')[1])).toEqual([`cursor=${cursor}`,`cursor=${cursor}`]);
});
test.each([{actorKey:'org:other-actor'},{connectionId:'66666666-6666-4666-8666-666666666666'},{connectionGeneration:2}])('profile pages reset on actor/account scope change: %j',async change=>{
 const cursor='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',extra={...profile(),profileId:'55555555-5555-4555-8555-555555555555',displayName:'Private older page'};let nextScope=false;
 profilePage=path=>nextScope?pageResponse([{...profile(),profileId:'77777777-7777-4777-8777-777777777777',displayName:'Current scope person'}]):path.includes('?cursor=')?pageResponse([extra]):pageResponse([profile()],cursor);
 const view=draw();await screen.findByText(/The identity and voice are already selected/);
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'More profiles'})));
 await screen.findByRole('option',{name:'Private older page'});
 nextScope=true;await act(async()=>view.rerenderControls(change));
 await screen.findByRole('option',{name:'Current scope person'});
 expect(screen.queryByRole('option',{name:'Private older page'})).toBeNull();expect(screen.queryByRole('option',{name:'Ilya'})).toBeNull();
 expect(screen.queryByRole('button',{name:'More profiles'})).toBeNull();
});
test('a late page from the previous actor never enters the new actor list or loading state',async()=>{
 const cursor='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';let release,nextScope=false;
 profilePage=path=>nextScope?pageResponse([{...profile(),profileId:'77777777-7777-4777-8777-777777777777',displayName:'New actor person'}]):path.includes('?cursor=')?new Promise(resolve=>{release=resolve;}):pageResponse([profile()],cursor);
 const view=draw();await screen.findByText(/The identity and voice are already selected/);
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'More profiles'})));
 await waitFor(()=>expect(release).toBeDefined());
 nextScope=true;await act(async()=>view.rerenderControls({actorKey:'org:new-actor'}));
 await screen.findByRole('option',{name:'New actor person'});
 await act(async()=>release(pageResponse([{...profile(),displayName:'Previous actor late profile'}])));
 expect(screen.queryByRole('option',{name:'Previous actor late profile'})).toBeNull();
 expect(screen.getByRole('option',{name:'New actor person'})).toBeTruthy();expect(screen.queryByText('Loading more…')).toBeNull();
});
