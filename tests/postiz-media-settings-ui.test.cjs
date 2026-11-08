const React=require('react');
const {loadTypeScriptModule}=require('./helpers/load-ts-module.cjs');
const BASE='apps/frontend/src/components/';
const fallback=(_key,value)=>value;
function nodes(element){if(!element||typeof element!=='object')return[];return[element,...React.Children.toArray(element.props?.children).flatMap(nodes)];}
function sectionFixture(state){
 const openModal=jest.fn();const useLaunchStore=selector=>selector(state);useLaunchStore.getState=()=>state;
 const {MediaSettingsSection}=loadTypeScriptModule(`${BASE}new-launch/media.settings.section.tsx`,{
  './store':{useLaunchStore},'zustand/react/shallow':{useShallow:selector=>selector},
  '@contentfactory/react/translation/get.transation.service.client':{useT:()=>fallback},
  '@contentfactory/frontend/components/layout/new-modal':{useModals:()=>({openModal})},
  '@contentfactory/react/helpers/use.media.directory':{useMediaDirectory:()=>({set:value=>value})},
  '@contentfactory/helpers/utils/has.extension':{hasExtension:()=>false},
  '@contentfactory/react/helpers/video.frame':{VideoFrame:()=>null},
  '@contentfactory/frontend/components/launches/helpers/media.settings.component':{MediaComponentInner:()=>null},
  '@contentfactory/react/form/button':{Button:'button'},
 });
 return {render:props=>MediaSettingsSection(props),openModal};
}
const values=[{id:'entry',media:[{id:'one',path:'/owned/a.jpg'},{id:'two',path:'/owned/b.mp4'}]}];
test('settings panel exposes media controls as keyboard buttons and preserves concurrent attachment edits',()=>{
 const state={current:'global',global:values,internal:[],setGlobalValueMedia:jest.fn()};const fixture=sectionFixture(state);
 const buttons=nodes(fixture.render({})).filter(node=>node.type==='button');expect(buttons).toHaveLength(2);expect(buttons.every(button=>button.props.disabled===false)).toBe(true);
 buttons[0].props.onClick();const edit=fixture.openModal.mock.calls[0][0].children(()=>{});
 state.global=[{...values[0],media:[values[0].media[0],{...values[0].media[1],alt:'Concurrent edit'}]}];
 edit.props.onSelect({id:'one',alt:'New alt'});expect(state.setGlobalValueMedia).toHaveBeenCalledWith(0,[{...values[0].media[0],alt:'New alt'},{...values[0].media[1],alt:'Concurrent edit'}]);
});
test('uncustomized channel and read-only users cannot edit shared media through settings',()=>{
 const state={current:'channel',global:values,internal:[]};const fixture=sectionFixture(state);
 expect(nodes(fixture.render({})).filter(node=>node.type==='button').every(node=>node.props.disabled)).toBe(true);
 state.current='global';expect(nodes(fixture.render({disabled:true})).filter(node=>node.type==='button').every(node=>node.props.disabled)).toBe(true);
});
test('customized channel updates only its own current attachment settings',()=>{
 const state={current:'channel',global:values,internal:[{integration:{id:'channel'},integrationValue:values}],setInternalValueMedia:jest.fn(),setGlobalValueMedia:jest.fn()};const fixture=sectionFixture(state);
 nodes(fixture.render({})).find(node=>node.type==='button').props.onClick();fixture.openModal.mock.calls[0][0].children(()=>{}).props.onSelect({id:'one',alt:'Channel alt'});
 expect(state.setInternalValueMedia).toHaveBeenCalledWith('channel',0,[{...values[0].media[0],alt:'Channel alt'},values[0].media[1]]);expect(state.setGlobalValueMedia).not.toHaveBeenCalled();
});
function editorFixture({fetchResult}={}){
 let states=[],index=0;const open=jest.fn();const close=jest.fn();const select=jest.fn();const request=jest.fn(fetchResult??(async()=>({ok:true,json:async()=>({id:'media',path:'/owned/v.mp4'})})));
 const react={...React,useState:initial=>{const at=index++;if(!(at in states))states[at]=initial;return[states[at],value=>{states[at]=typeof value==='function'?value(states[at]):value;}];},useEffect:()=>{},useCallback:fn=>fn};
 const {MediaComponentInner}=loadTypeScriptModule(`${BASE}launches/helpers/media.settings.component.tsx`,{
  react,'@contentfactory/frontend/components/launches/helpers/top.title.component':{TopTitle:()=>null},
  '@contentfactory/helpers/utils/custom.fetch':{useFetch:()=>request},
  '@contentfactory/helpers/utils/has.extension':{hasExtension:path=>path?.endsWith('.mp4')},
  '@contentfactory/frontend/components/new-launch/store':{useLaunchStore:selector=>selector({setActivateExitButton:()=>{}})},
  '@contentfactory/react/helpers/variable.context':{useVariables:()=>({})},
  '@contentfactory/frontend/components/media/media.component':{useOpenMediaBox:()=>open},
  '@contentfactory/react/form/button':{Button:'button'},'@contentfactory/react/form/input':{Input:'input'},
  '@contentfactory/react/translation/get.transation.service.client':{useT:()=>fallback},
 });
 const render=()=>{index=0;return MediaComponentInner({media:{id:'media',path:'/owned/v.mp4',thumbnailTimestamp:0},onSelect:select,onClose:close});};
 return{render,request,open,select,close};
}
test('owned cover gallery accepts JPEG/PNG, clears frame timestamp and persists only chosen path',async()=>{
 const fixture=editorFixture();nodes(fixture.render()).find(node=>node.props.children==='Media Library').props.onClick();
 expect(fixture.open.mock.calls[0][1]).toEqual({type:'image-static'});fixture.open.mock.calls[0][0]([{id:'cover',path:'/owned/cover.jpg'}]);
 const button=nodes(fixture.render()).find(node=>node.type==='button'&&node.props.children==='Save Changes');await button.props.onClick();
 expect(JSON.parse(fixture.request.mock.calls[0][1].body)).toMatchObject({id:'media',thumbnail:'/owned/cover.jpg',thumbnailTimestamp:null});expect(fixture.close).toHaveBeenCalledTimes(1);
});
test('existing zero frame remains zero and failed saves stay open with an actionable error',async()=>{
 const fixture=editorFixture({fetchResult:async()=>({ok:false})});await nodes(fixture.render()).find(node=>node.type==='button'&&node.props.children==='Save Changes').props.onClick();
 expect(JSON.parse(fixture.request.mock.calls[0][1].body).thumbnailTimestamp).toBe(0);expect(fixture.close).not.toHaveBeenCalled();expect(fixture.select).not.toHaveBeenCalled();
 expect(nodes(fixture.render()).find(node=>node.props.role==='alert').props.children).toMatch(/Could not save/);
});
