'use strict';
const React=require('react');
const {JSDOM}=require('jsdom');
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost/agents/thread'});
for(const key of ['window','document','navigator'])Object.defineProperty(global,key,{configurable:true,value:key==='window'?dom.window:dom.window[key]});
global.IS_REACT_ACT_ENVIRONMENT=true;
const {render,waitFor,act,cleanup,within,fireEvent}=require('@testing-library/react');
const {SWRConfig,useSWRConfig}=require('swr');
const {loadWithMocks}=require('./helpers/load-ts-with-mocks.cjs');
const {loadTypeScriptModule}=require('./helpers/load-tsx.cjs');
const contract=loadTypeScriptModule('apps/frontend/src/components/agents/agent.contract.ts');
const {artifactReadMatches}=loadTypeScriptModule('apps/frontend/src/components/agents/agent.revalidate.ts');
let saved,requests,mutate,language,requestResult;
const asset=(id,kind,url)=>({id,mediaId:id,kind,url,role:kind==='video'?'final_video':'carousel_slide'});
const detail=version=>({campaign:{id:'campaign-1',name:'Saved transformation',mode:'prepare_approve',state:'active',timeZone:'UTC',itemIds:['reel','carousel'],allocations:[]},items:[
 {id:'reel',channelId:'draft',platform:'instagram',format:'reel',state:'ready',scheduledAt:'2030-01-01T12:00:00Z',contentRevision:version,approvalDigest:`digest-${version}`,material:{title:'Saved Reel',body:'Exact caption',assets:[asset(`video-${version}`,'video',`/uploads/reel-v${version}.mp4`)]}},
 {id:'carousel',channelId:'draft',platform:'instagram',format:'carousel',state:'ready',scheduledAt:'2030-01-01T12:00:00Z',contentRevision:version,approvalDigest:`slides-${version}`,material:{title:'Saved carousel',body:'Caption',assets:[asset(`slide-a-${version}`,'image',`/uploads/slide-a-v${version}.png`),asset(`slide-b-${version}`,'image',`/uploads/slide-b-v${version}.png`)]}}
],findings:[],decisions:[]});
const {SocialFactoryCampaign}=loadWithMocks('apps/frontend/src/components/social-factory/campaign.tsx',{
 react:React,swr:require('swr'),
 '@contentfactory/helpers/utils/custom.fetch':{useFetch:()=>async(url,options)=>{requests.push({url,method:options?.method??'GET',body:options?.body});return requestResult?.(url,options)??{ok:true,json:async()=>structuredClone(saved)};}},
 '@contentfactory/react/translation/use-interface-language':{useInterfaceLanguage:()=>language},
 '@contentfactory/react/form/button':{Button:({children,onClick,disabled,loading})=>React.createElement('button',{onClick,disabled:disabled||loading,'aria-busy':loading||undefined},children)},
 '@contentfactory/react/form/button-link':{ButtonLink:({children,href})=>React.createElement('a',{href},children)},
 '@contentfactory/react/form/select':{Select:({children,name,value,onChange,disabled,label})=>React.createElement('select',{name,value,onChange,disabled,'aria-label':label},children)},
 '@contentfactory/react/form/textarea':{Textarea:()=>null},
 '../ui/surface':{Status:({children})=>React.createElement('span',null,children),SkeletonRows:()=>React.createElement('p',null,'loading'),ErrorState:({title,description,action})=>React.createElement('div',{role:'alert'},React.createElement('p',null,title),description?React.createElement('p',null,description):null,action),EmptyState:()=>null},
 '../agents/agent.cards':{AgentCard:({children,aside})=>React.createElement('section',null,aside,children)},
 '../agents/agent.markdown':{AgentMarkdown:({text})=>React.createElement('p',null,text)},
});
function Readers(){mutate=useSWRConfig().mutate;return null;}
function draw(){return render(React.createElement(SWRConfig,{value:{provider:()=>new Map(),dedupingInterval:0,loadingTimeout:0,revalidateOnFocus:false,errorRetryCount:0}},React.createElement(React.Fragment,null,React.createElement(Readers),React.createElement(SocialFactoryCampaign,{campaignId:'campaign-1'}))));}
beforeEach(()=>{saved=detail(1);requests=[];language='ru';requestResult=undefined;});afterEach(cleanup);

test('a persisted native campaign card opens saved MP4 and ordered carousel assets; exact revalidation and reload expose the new saved version',async()=>{
 const history=JSON.parse(JSON.stringify([{id:'rendered',role:'assistant',parts:[{type:'tool-campaign_render_local_reel',title:'Собрать локальный Reel',toolCallId:'render-call',state:'output-available',output:{ok:true,card:{kind:'campaign',id:'campaign-1'}}}]}]));
 const [artifact]=contract.artifactsOf(history);expect(contract.artifactHref(artifact)).toBe('/campaigns/campaign-1');
 const view=draw();
 await waitFor(()=>expect(view.container.querySelector('video')?.getAttribute('src')).toBe('/uploads/reel-v1.mp4'));
 expect(view.container.querySelector('video').controls).toBe(true);
 expect([...view.container.querySelectorAll('img')].map(img=>img.getAttribute('src'))).toEqual(['/uploads/slide-a-v1.png','/uploads/slide-b-v1.png']);
 saved=detail(2);
 const touch=contract.campaignTouchesOf(history)[0];
 await act(async()=>{await mutate(key=>artifactReadMatches(touch.artifact,key));});
 await waitFor(()=>expect(view.container.querySelector('video')?.getAttribute('src')).toBe('/uploads/reel-v2.mp4'));
 expect([...view.container.querySelectorAll('img')].map(img=>img.getAttribute('src'))).toEqual(['/uploads/slide-a-v2.png','/uploads/slide-b-v2.png']);
 view.unmount();const reloaded=draw();
 await waitFor(()=>expect(reloaded.container.querySelector('video')?.getAttribute('src')).toBe('/uploads/reel-v2.mp4'));
 expect(requests.every(row=>row.method==='GET'&&row.url==='/social-factory/campaigns/campaign-1')).toBe(true);
});

test.each(['ru','en'])('campaign decisions show outcomes and typed fact status without exposing any raw question or audit payload (%s)',async locale=>{
 language=locale;
 const internalQuestion='Resolve each supplied creative question. Previous editorial draft to revise: {"title":"Internal title","slides":[{"text":"Internal slide"}]}';
 const ordinaryQuestion=locale==='ru'?'Какую композицию выбрать?':'Which composition should we choose?';
 saved.decisions=[
  {kind:'editorial',question:internalQuestion,answer:'Keep one clear step on each slide.',factStatus:'inferred',model:{provider:'internal-provider',model:'internal-model',operationId:'private-operation-id'},evidenceIds:['private-evidence-id']},
  {kind:'editorial',question:ordinaryQuestion,answer:'Use a consistent hierarchy.',factStatus:'owner_asserted'},
  {kind:'missing_fact',question:'Technical fact prompt',missingFacts:['Technical fact prompt'],factStatus:'unknown'},
 ];
 const original=JSON.stringify(saved);const view=draw();
 await waitFor(()=>expect(view.container.textContent).toContain('Keep one clear step on each slide.'));
 const text=view.container.textContent;
 for(const hidden of [internalQuestion,ordinaryQuestion,'Technical fact prompt','Internal title','Internal slide','private-operation-id','private-evidence-id','internal-provider','internal-model'])expect(text).not.toContain(hidden);
 expect(text).toContain('Use a consistent hierarchy.');
 expect(text).toContain(locale==='ru'?'Редакторское решение':'Editorial decision');
 expect(text).toContain(locale==='ru'?'Предположение, а не подтверждённый факт':'Inferred, not a verified fact');
 expect(text).toContain(locale==='ru'?'Сообщено пользователем':'Reported by a person');
 expect(text).toContain(locale==='ru'?'Нужен ответ человека':'A person’s answer is needed');
 expect(JSON.stringify(saved)).toBe(original);
 expect(requests.every(row=>row.method==='GET')).toBe(true);
});

test('a legacy untyped decision retains its saved answer without guessing provenance or displaying its question',async()=>{
 saved.decisions=[{question:'Any language or internal syntax {"must":"stay stored"}',answer:'The original saved choice.'}];
 const view=draw();await waitFor(()=>expect(view.container.textContent).toContain('The original saved choice.'));
 expect(view.container.textContent).not.toContain('must');
 expect(view.container.textContent).toContain('Статус фактов не указан');
});

test.each(['ru','en'])('approved draft targets cannot schedule while a connected channel with a draft-like ID still can (%s)',async locale=>{
 language=locale;
 saved.items[0]={...saved.items[0],state:'approved',destination:{kind:'draft',id:'draft',publishable:false}};
 saved.items[1]={...saved.items[1],state:'approved',channelId:'draft-connected-channel'};
 const original=JSON.stringify(saved);const view=draw();
 await waitFor(()=>expect(view.container.querySelector('video')).toBeTruthy());
 const [draft,connected]=view.container.querySelectorAll('ol > li');
 const label=locale==='ru'?'Запланировать':'Schedule';
 expect(within(draft).queryByRole('button',{name:label})).toBeNull();
 expect(draft.textContent).toContain(locale==='ru'?'Для планирования нужен подключённый канал':'Scheduling requires a connected channel');
 const schedule=within(connected).getByRole('button',{name:label});expect(schedule.disabled).toBe(false);
 expect(JSON.stringify(saved)).toBe(original);expect(requests.every(row=>row.method==='GET')).toBe(true);
 await act(async()=>fireEvent.click(schedule));
 const writes=requests.filter(row=>row.method!=='GET');expect(writes).toHaveLength(1);
 expect(writes[0].url).toBe('/social-factory/campaigns/campaign-1/items/carousel/deliver');
 expect(JSON.parse(writes[0].body)).toMatchObject({action:'schedule',expectedContentRevision:1,approvalDigest:'slides-1'});
});

test.each([{kind:'draft',id:'target'},{kind:'channel',id:'target',publishable:false}])('either explicit destination restriction hides scheduling (%j)',async destination=>{
 saved.items=[{...saved.items[0],state:'approved',destination}];
 const view=draw();await waitFor(()=>expect(view.container.querySelector('video')).toBeTruthy());
 expect(within(view.container).queryByRole('button',{name:'Запланировать'})).toBeNull();
 expect(requests.every(row=>row.method==='GET')).toBe(true);
});

test.each(['ru','en'].flatMap(locale=>['collaborative','prepare_approve','autopilot'].map(mode=>[locale,mode])))
('an accepted mode change with failed readback offers a read-only retry (%s, %s)',async(locale,mode)=>{
 language=locale;
 saved.campaign.mode=mode==='prepare_approve'?'collaborative':'prepare_approve';
 saved.grant={id:'grant-1',mode:'autopilot',channelIds:['channel-1'],actions:['schedule'],
  expiresAt:new Date(Date.now()+86400000).toISOString()};
 let failReads=false,holdRetry=false,releaseRetry;
 requestResult=(_url,options)=>{
  if(options?.method==='PATCH'){
   saved.campaign.mode=JSON.parse(options.body).mode;
   failReads=true;
   return {ok:true,json:async()=>({accepted:true})};
  }
  if(failReads)return {ok:false,status:503,json:async()=>({message:'Synthetic read unavailable'})};
  if(holdRetry)return new Promise(resolve=>{releaseRetry=resolve;});
 };
 const view=draw();
 const select=await within(view.container).findByRole('combobox',{name:locale==='ru'?'Режим работы':'Working mode'});
 await act(async()=>fireEvent.change(select,{target:{value:mode}}));
 await waitFor(()=>expect(within(view.container).getByRole('alert').textContent).toMatch(locale==='ru'?/Запрос принят/:/request was accepted/));
 expect(saved.campaign.mode).toBe(mode);
 const writes=()=>requests.filter(row=>row.method!=='GET');
 expect(writes()).toHaveLength(1);
 expect(writes()[0].method).toBe('PATCH');
 expect(writes()[0].url).toBe('/social-factory/campaigns/campaign-1/mode');
 failReads=false;holdRetry=true;
 const retry=within(view.container).getByRole('button',{name:locale==='ru'?'Повторить':'Retry'});
 await act(async()=>fireEvent.click(retry));
 expect(retry.disabled).toBe(true);
 expect(retry.getAttribute('aria-busy')).toBe('true');
 expect(writes()).toHaveLength(1);
 await act(async()=>releaseRetry({ok:true,json:async()=>structuredClone(saved)}));
 await waitFor(()=>expect(within(view.container).getByRole('combobox',{name:locale==='ru'?'Режим работы':'Working mode'}).value).toBe(mode));
 expect(writes()).toHaveLength(1);
 expect(within(view.container).queryByRole('alert')).toBeNull();
 failReads=true;
 await act(async()=>{await mutate('/social-factory/campaigns/campaign-1');});
 await waitFor(()=>expect(within(view.container).getByRole('alert').textContent).toContain(locale==='ru'?'Не удалось загрузить кампанию':'Could not load campaign'));
 expect(view.container.textContent).not.toMatch(locale==='ru'?/Запрос принят/:/request was accepted/);
 expect(writes()).toHaveLength(1);
});

test.each(['ru','en'].flatMap(locale=>['network','refused'].map(kind=>[locale,kind])))
('an unaccepted mode change keeps its original failure and never claims acceptance (%s, %s)',async(locale,kind)=>{
 language=locale;
 const message=kind==='network'?'Controlled network failure':locale==='ru'?'Эта версия больше не актуальна.':'This revision is no longer current.';
 requestResult=(_url,options)=>{
  if(options?.method!=='PATCH')return;
  if(kind==='network')throw Error(message);
  return {ok:false,status:409,json:async()=>({message})};
 };
 const view=draw();
 const select=await within(view.container).findByRole('combobox',{name:locale==='ru'?'Режим работы':'Working mode'});
 await act(async()=>fireEvent.change(select,{target:{value:'collaborative'}}));
 await waitFor(()=>expect(within(view.container).getByRole('alert').textContent).toBe(message));
 expect(saved.campaign.mode).toBe('prepare_approve');
 expect(within(view.container).getByRole('combobox').value).toBe('prepare_approve');
 expect(view.container.textContent).not.toMatch(locale==='ru'?/Запрос принят/:/request was accepted/);
 expect(requests.filter(row=>row.method==='PATCH')).toHaveLength(1);
 expect(requests.filter(row=>row.method==='GET')).toHaveLength(1);
});

test.each(['ru','en'])('an initial read failure offers localized loading recovery without claiming an accepted action (%s)',async locale=>{
 language=locale;
 requestResult=()=>({ok:false,status:503,json:async()=>({message:'Synthetic unavailable read'})});
 const view=draw();
 await waitFor(()=>expect(within(view.container).getByRole('alert').textContent).toContain(locale==='ru'?'Не удалось загрузить кампанию':'Could not load campaign'));
 expect(view.container.textContent).not.toMatch(locale==='ru'?/Запрос принят/:/request was accepted/);
 requestResult=undefined;
 await act(async()=>fireEvent.click(within(view.container).getByRole('button',{name:locale==='ru'?'Повторить':'Retry'})));
 await waitFor(()=>expect(view.container.querySelector('video')?.getAttribute('src')).toBe('/uploads/reel-v1.mp4'));
 expect(requests.every(row=>row.method==='GET')).toBe(true);
});
