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
const draft=()=>({id:ids.draft,version:3,pieceId:'piece',pieceRevision:'b'.repeat(64),brief:{script:'Точные русские слова.',scriptPolicy:'exact'},settings:{provider:'heygen',model:'heygen-avatar',mode:'presenter',locale:'ru-RU',duration:8,aspectRatio:'9:16',resolution:'720p',audio:true,captions:false,avatarId:'look',voiceId:'voice',engine:'avatar_iv',
 heygenV2:{binding:{profileId:ids.profile,profileRevision:2,profileDigest:'a'.repeat(64),connectionId:ids.connection,sourcePin:{pieceId:'piece',sourceRevision:'b'.repeat(64)}},settings:{version:2,sourceLookId:'look',sourceGroupId:'group',appearanceLookId:'look',groupId:'group',voiceId:'voice',sourceMode:'text',engine:{type:'avatar_iv'},voiceSettings:{locale:'ru-RU',speed:0.9},durationSeconds:8,aspectRatio:'9:16',resolution:'720p',outputFormat:'mp4',captions:'none'}}}});
const basePlan=()=>({draftId:ids.draft,draftVersion:3,revision:0,values:{context:'invitation',delivery:'natural',gaze:'camera',facialIntensity:'low',gestures:'sparse',wish:''},lockedFields:[],origins:{context:'assistant',delivery:'assistant',gaze:'default',facialIntensity:'default',gestures:'assistant',wish:'default'},limitations:[],applied:false});
let calls,plan,saveError,readError,readReply,saveReply,language;
const response=value=>({ok:true,status:200,json:async()=>value});
const request=async(path,init={})=>{
 const call={path,method:init.method??'GET',body:init.body?JSON.parse(init.body):null};calls.push(call);
 if(path.includes('/person-profiles'))return response({items:[],nextCursor:null});
 if(!init.method)return readReply?readReply(call):readError?{ok:false,status:503,json:async()=>({})}:response(structuredClone(plan));
 if(saveReply)return saveReply(call);
 if(saveError)return {ok:false,status:saveError.status??400,json:async()=>saveError};
 if(path.endsWith('/performance-preference'))return response({...plan,preferenceSaved:true});
 const next=draft();next.version=plan.draftVersion+1;
 const values={...plan.values,...call.body.changes};for(const field of call.body.releaseFields??[])values[field]=basePlan().values[field];
 return response({...plan,draftVersion:next.version,revision:plan.revision+1,values,lockedFields:Object.keys(call.body.changes??{}),applied:true,draft:next});
};
const mocks={
 '@contentfactory/helpers/utils/custom.fetch':{useFetch:()=>request},
 '@contentfactory/react/translation/use-interface-language':{useInterfaceLanguage:()=>language},
};
const {VideoHeygenPerformanceControls}=loadWithMocks('apps/frontend/src/components/videos/video-heygen-performance-controls.tsx',mocks);
const {VideoHeygenPersonControls}=loadWithMocks('apps/frontend/src/components/videos/video-heygen-person-controls.tsx',mocks);
const draw=(extra={},Component=VideoHeygenPerformanceControls)=>{
 let props={actorKey:'org:actor',connectionId:ids.connection,connectionGeneration:1,draft:draft(),disabled:false,draftDirty:false,onDirtyChange:jest.fn(),onBusyChange:jest.fn(),onSaved:jest.fn(async()=>{}),avatars:[],voices:[],...extra};
 const cache=new Map(),tree=()=>React.createElement(SWRConfig,{value:{provider:()=>cache,dedupingInterval:0,loadingTimeout:0,focusThrottleInterval:0,errorRetryCount:0}},React.createElement(Component,props));
 const view=render(tree());return {...view,props,rerenderControls:changes=>{props={...props,...changes};view.rerender(tree());}};
};
const choose=async(name,value)=>act(async()=>fireEvent.change(screen.getByRole('combobox',{name}),{target:{value}}));
const posts=()=>calls.filter(call=>call.method==='POST');
beforeEach(()=>{calls=[];plan=basePlan();saveError=null;readError=false;readReply=null;saveReply=null;language='en';});
afterEach(cleanup);afterAll(()=>dom.window.close());

test('a new plan shows honest defaults, and selection or arrow navigation never submits',async()=>{
 const view=draw();await screen.findByRole('combobox',{name:'Delivery style'});
 expect(screen.getByText('Delivery has not been applied to the video settings yet.')).toBeTruthy();
 expect(screen.getByText(/do not create a preview/)).toBeTruthy();expect(screen.getAllByText('Selected by AI')).toHaveLength(3);
 expect(screen.getAllByText('Default')).toHaveLength(3);
 expect(screen.queryByRole('img')).toBeNull();expect(posts()).toHaveLength(0);
 await choose('Delivery style','restrained');
 await act(async()=>fireEvent.keyDown(screen.getByRole('combobox',{name:'Delivery style'}),{key:'ArrowRight'}));
 expect(posts()).toHaveLength(0);expect(view.props.onDirtyChange).toHaveBeenLastCalledWith(true);
 expect(screen.getByText('Set by you')).toBeTruthy();
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Apply delivery'})));
 await waitFor(()=>expect(view.props.onSaved).toHaveBeenCalledTimes(1));
 expect(posts()).toEqual([{path:'/media/video-v2/performance',method:'POST',body:{draftId:ids.draft,version:3,expectedRevision:0,changes:{delivery:'restrained'}}}]);
 const [saved,expected]=view.props.onSaved.mock.calls[0];expect(expected).toEqual({id:ids.draft,version:3});
 expect(saved.brief.script).toBe('Точные русские слова.');expect(saved.settings.heygenV2.binding).toEqual(draft().settings.heygenV2.binding);
 expect(view.props.onDirtyChange).toHaveBeenLastCalledWith(false);
});

test('only the selected manual field is released, on explicit apply, and discard makes no request',async()=>{
 plan.revision=2;plan.applied=true;plan.values.facialIntensity='high';plan.lockedFields=['facialIntensity'];plan.origins.facialIntensity='manual';
 const view=draw();await screen.findByRole('button',{name:'Restore automatic choice: Facial expression'});
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Restore automatic choice: Facial expression'})));
 expect(posts()).toHaveLength(0);expect(screen.getByText(/recalculated when applied/)).toBeTruthy();
 await choose('Gaze','partner');await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Discard delivery changes'})));
 expect(screen.getByRole('combobox',{name:'Gaze'}).value).toBe('camera');expect(view.props.onDirtyChange).toHaveBeenLastCalledWith(false);expect(posts()).toHaveLength(0);
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Restore automatic choice: Facial expression'})));
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Apply delivery'})));
 await waitFor(()=>expect(view.props.onSaved).toHaveBeenCalledTimes(1));
 expect(posts()[0].body).toEqual({draftId:ids.draft,version:3,expectedRevision:2,releaseFields:['facialIntensity']});
});

test('failed saves retain manual edits and never display provider text',async()=>{
 const view=draw();await screen.findByRole('combobox',{name:'Delivery style'});await choose('Facial expression','medium');
 saveError={code:'VIDEO_PERFORMANCE_INVALID',message:'PRIVATE_PROVIDER_DETAIL'};
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Apply delivery'})));
 await screen.findByText('Delivery could not be saved. Your edits are retained.');
 expect(screen.getByRole('combobox',{name:'Facial expression'}).value).toBe('medium');expect(screen.queryByText('PRIVATE_PROVIDER_DETAIL')).toBeNull();
 expect(view.props.onSaved).not.toHaveBeenCalled();expect(view.props.onDirtyChange).toHaveBeenLastCalledWith(true);expect(view.props.onBusyChange).toHaveBeenLastCalledWith(false);
});

test('a newer saved draft keeps dirty choices and requires explicit reload before saving',async()=>{
 const view=draw();await screen.findByRole('combobox',{name:'Delivery style'});await choose('Gaze','partner');
 plan={...plan,draftVersion:4,revision:2,values:{...plan.values,gaze:'natural'}};
 await act(async()=>view.rerenderControls({draft:{...draft(),version:4}}));
 await screen.findByText(/The video or delivery changed/);
 expect(screen.getByRole('combobox',{name:'Gaze'}).value).toBe('partner');expect(screen.getByRole('button',{name:'Apply delivery'}).disabled).toBe(true);
 expect(view.props.onDirtyChange).toHaveBeenLastCalledWith(true);
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Discard edits and load saved delivery'})));
 await waitFor(()=>expect(screen.getByRole('combobox',{name:'Gaze'}).value).toBe('natural'));
 expect(view.props.onDirtyChange).toHaveBeenLastCalledWith(false);expect(posts()).toHaveLength(0);
});

test('server revision conflicts keep changes and prevent another blind save',async()=>{
 const view=draw();await screen.findByRole('combobox',{name:'Delivery style'});await choose('Delivery style','energetic');
 saveError={status:409,code:'VIDEO_PERFORMANCE_STALE'};await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Apply delivery'})));
 await screen.findByText(/The video or delivery changed/);expect(screen.getByRole('combobox',{name:'Delivery style'}).value).toBe('energetic');
 expect(screen.getByRole('button',{name:'Apply delivery'}).disabled).toBe(true);expect(view.props.onSaved).not.toHaveBeenCalled();
});

test('future presenter preference is a separate explicit save without draft adoption',async()=>{
 plan.revision=2;plan.applied=true;const view=draw();await screen.findByRole('combobox',{name:'Delivery style'});
 expect(posts()).toHaveLength(0);await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Save for future videos with this person'})));
 await screen.findByText(/Delivery saved for future videos with this person/);
 expect(posts()).toEqual([{path:'/media/video-v2/performance-preference',method:'POST',body:{draftId:ids.draft,version:3,expectedRevision:2}}]);
 expect(view.props.onSaved).not.toHaveBeenCalled();await choose('Delivery style','restrained');
 expect(screen.getByRole('button',{name:'Save for future videos with this person'}).disabled).toBe(true);
});

test('loading and read failure offer a safe retry; other unsaved edits disable controls',async()=>{
 let release;readReply=()=>new Promise(resolve=>{release=resolve;});const view=draw({draftDirty:true});
 expect(screen.getByRole('status').textContent).toBe('Loading delivery…');
 await act(async()=>release({ok:false,status:503}));await screen.findByText(/Delivery could not be loaded/);
 readReply=null;await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Refresh delivery'})));
 await screen.findByRole('combobox',{name:'Delivery style'});expect(screen.getByRole('combobox',{name:'Delivery style'}).disabled).toBe(true);
 expect(screen.getByText('Save or discard the other video edits first.')).toBeTruthy();
 await act(async()=>view.rerenderControls({draftDirty:false}));expect(screen.getByRole('combobox',{name:'Delivery style'}).disabled).toBe(false);expect(posts()).toHaveLength(0);
});

test('limitations and Russian copy describe unsupported requests without claiming application',async()=>{
 language='ru-RU';plan.limitations=[{field:'gaze',code:'UNSUPPORTED_GAZE',message:'PRIVATE_PROVIDER_DETAIL'},{field:'gestures',code:'MOTION_DURATION',message:'PRIVATE_DURATION_DETAIL'}];
 draw();await screen.findByRole('combobox',{name:'Взгляд'});
 expect(screen.getByText(/Это пожелание, а не гарантированный результат/)).toBeTruthy();
 expect(screen.getByText(/Длинные сцены требуют отдельной поддержки/)).toBeTruthy();
 expect(screen.getByText('Подача ещё не применена к настройкам ролика.')).toBeTruthy();expect(screen.queryByText('PRIVATE_PROVIDER_DETAIL')).toBeNull();
 expect(screen.getByRole('combobox',{name:'Мимика'}).getAttribute('id')).toBe('heygen-performance-facialIntensity');
});

test('a changed saved recipe can be reapplied without inventing another manual change',async()=>{
 plan.revision=2;plan.limitations=[{field:'draft',code:'draft_changed',message:'PRIVATE_DRAFT_DETAIL'}];
 const view=draw();await screen.findByRole('combobox',{name:'Delivery style'});
 expect(screen.getByText('The script or video settings changed. Review delivery and apply it to this version before generation.')).toBeTruthy();
 expect(screen.getByRole('button',{name:'Apply delivery'}).disabled).toBe(false);
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Apply delivery'})));
 await waitFor(()=>expect(view.props.onSaved).toHaveBeenCalledTimes(1));
 expect(posts()[0].body).toEqual({draftId:ids.draft,version:3,expectedRevision:2});
});

test('compiled duration limitations are localized and an unrelated returned identity is rejected',async()=>{
 plan.limitations=[{field:'durationSeconds',code:'duration_target_unverified',message:'PRIVATE_DURATION_DETAIL'}];
 const view=draw();await screen.findByRole('combobox',{name:'Delivery style'});
 expect(screen.getByText(/Check actual audio duration before treating Avatar IV motion as applied/)).toBeTruthy();
 saveReply=()=>{const wrong=draft();wrong.version=4;wrong.settings.heygenV2.settings.voiceId='unapproved';return response({...plan,draftVersion:4,revision:1,draft:wrong});};
 await choose('Delivery style','restrained');await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Apply delivery'})));
 await screen.findByText(/The video or delivery changed/);expect(view.props.onSaved).not.toHaveBeenCalled();expect(view.props.onDirtyChange).toHaveBeenLastCalledWith(true);
});

test('actual stored settings remain distinct from unsaved creative intent',async()=>{
 plan.revision=2;plan.applied=true;plan.effectiveSettings={expressiveness:'low',motionPrompt:null};
 draw();await screen.findByText('Saved delivery settings');
 expect(screen.getByText('No separate motion direction is sent')).toBeTruthy();await choose('Facial expression','high');
 expect(screen.getByRole('combobox',{name:'Facial expression'}).value).toBe('high');
 const stored=screen.getByText('Model facial expression').parentElement;expect(stored.querySelector('dd').textContent).toBe('Restrained');
 expect(posts()).toHaveLength(0);
});

test('duplicate clicks submit once and a late previous-actor save cannot adopt a draft',async()=>{
 let release;saveReply=()=>new Promise(resolve=>{release=resolve;});const view=draw();await screen.findByRole('combobox',{name:'Delivery style'});
 await choose('Delivery style','restrained');await act(async()=>{const button=screen.getByRole('button',{name:'Apply delivery'});fireEvent.click(button);fireEvent.click(button);});
 expect(posts()).toHaveLength(1);expect(view.props.onBusyChange).toHaveBeenLastCalledWith(true);
 plan={...basePlan(),values:{...basePlan().values,context:'serious'}};
 await act(async()=>view.rerenderControls({actorKey:'other:actor'}));await waitFor(()=>expect(screen.getByRole('combobox',{name:'Context'}).value).toBe('serious'));
 await act(async()=>release(response({...basePlan(),revision:1,draftVersion:4,draft:{...draft(),version:4}})));
 expect(view.props.onSaved).not.toHaveBeenCalled();expect(view.props.onDirtyChange).toHaveBeenLastCalledWith(false);expect(view.props.onBusyChange).toHaveBeenLastCalledWith(false);
});

test('closing the panel while a save is pending prevents late draft adoption',async()=>{
 let release;saveReply=()=>new Promise(resolve=>{release=resolve;});const view=draw();await screen.findByRole('combobox',{name:'Delivery style'});
 await choose('Delivery style','restrained');await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Apply delivery'})));
 await act(async()=>view.unmount());
 await act(async()=>release(response({...basePlan(),revision:1,draftVersion:4,draft:{...draft(),version:4}})));
 expect(view.props.onSaved).not.toHaveBeenCalled();expect(view.props.onBusyChange).toHaveBeenLastCalledWith(false);
});

test('parent combines dirty state across draft refresh and hides delivery without a matching saved binding',async()=>{
 const view=draw({},VideoHeygenPersonControls);await screen.findByRole('combobox',{name:'Delivery style'});await choose('Gaze','partner');
 expect(view.props.onDirtyChange).toHaveBeenLastCalledWith(true);
 plan={...plan,draftVersion:4,revision:1};await act(async()=>view.rerenderControls({draft:{...draft(),version:4}}));
 await screen.findByText(/The video or delivery changed/);expect(view.props.onDirtyChange).toHaveBeenLastCalledWith(true);
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Discard delivery changes'})));
 expect(view.props.onDirtyChange).toHaveBeenLastCalledWith(false);
 const wrong=draft();wrong.settings.heygenV2.binding.connectionId='other';await act(async()=>view.rerenderControls({draft:wrong}));
 expect(screen.queryByRole('combobox',{name:'Delivery style'})).toBeNull();expect(posts()).toHaveLength(0);
});
