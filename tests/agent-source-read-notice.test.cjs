'use strict';
const React=require('react'),{JSDOM}=require('jsdom');
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost/agents/read-notice'});
for(const key of ['window','document','navigator'])Object.defineProperty(global,key,{configurable:true,value:dom.window[key]});
global.IS_REACT_ACT_ENVIRONMENT=true;
const {render,within,fireEvent,act,cleanup}=require('@testing-library/react');
const {loadTypeScriptModule}=require('./helpers/load-tsx.cjs');
const contract=loadTypeScriptModule('apps/frontend/src/components/agents/agent.contract.ts');
const cards=loadTypeScriptModule('apps/frontend/src/components/agents/agent.cards.tsx');
const copy=loadTypeScriptModule('apps/frontend/src/components/agents/agent.copy.ts');
afterEach(cleanup);
const failed=(code='REMOTE_4XX',input={url:'https://public.example/news'})=>({type:'tool-piece_read',title:'Read material',toolCallId:'failed-read',state:'output-available',input,output:{ok:false,code,reason:'Source rejected the request (HTTP 403)'}});
const success={type:'tool-piece_read',title:'Read material',toolCallId:'retained-read',state:'output-available',input:{part:'research_source',researchId:'retained'},output:{ok:true,summary:{text:'Actual retained material'}}};
const blocks=parts=>contract.readMessageBlocks({id:'saved',role:'assistant',parts});
test('a refused source stays a failed native result with verified later read progress',()=>{
 const part=failed(),before=JSON.stringify(part),result=blocks([part,success]);
 expect(result[0]).toMatchObject({type:'error',code:'REMOTE_4XX',sourceRead:{kind:'remote',host:'public.example',status:403,continued:true}});
 expect(JSON.stringify(part)).toBe(before);expect(result[0].sourceRead.completed).toBeUndefined();
});
test('without a later successful read the notice cannot claim continuation',()=>{
 expect(blocks([failed(),{...success,output:{ok:false,code:'MATERIAL_NOT_AVAILABLE'}}])[0].sourceRead.continued).toBe(false);
});
test('historical source refusal has no invented exact HTTP status',()=>{
 const p=failed();p.output.reason='Source rejected the request';
 expect(blocks([p])[0].sourceRead.status).toBeUndefined();
});
test('robots policy refusal uses scoped source activity without inventing an HTTP rejection or task failure',async()=>{
 const p=failed('ROBOTS_DISALLOWED',{url:'https://x.com/example/status/123'});
 p.output.reason='Robots policy disallows this source';const original=JSON.stringify(p);
 const b=blocks([p,success])[0];
 expect(b).toMatchObject({type:'error',code:'ROBOTS_DISALLOWED',sourceRead:{kind:'remote',host:'x.com',continued:true}});
 expect(b.sourceRead.status).toBeUndefined();expect(JSON.stringify(p)).toBe(original);
 await act(async()=>render(React.createElement(cards.ErrorCard,{title:'Read material',code:b.code,sourceRead:b.sourceRead,refusal:true,words:copy.agentCopy.ru})));
 expect(document.querySelector('[data-agent-card="error"]')).toBeNull();
 expect(within(document.body).getByRole('button').textContent).toContain('x.com');
});
test('only source-reading availability failures get the source notice',()=>{
 for(const p of [{...failed(),type:'tool-piece_create'},failed('DNS_UNSAFE'),failed('PERMISSION_DENIED'),failed('MATERIAL_NOT_AVAILABLE',{pieceId:'core',part:'core'})])
  expect(blocks([p])[0].sourceRead).toBeUndefined();
 expect(blocks([failed('MATERIAL_NOT_AVAILABLE',{researchId:'retained',part:'research_sources'}),success])[0].sourceRead).toMatchObject({kind:'retained',continued:true});
});
test('source display reveals only hostname, never URL credentials/query or arbitrary error text',()=>{
 const p=failed('REMOTE_4XX',{url:'https://name:secret@public.example/news?token=sensitive#fragment'});
 p.output.reason='Source rejected the request (HTTP 403) hidden-token';
 const source=blocks([p])[0].sourceRead;
 expect(JSON.stringify(source)).not.toMatch(/secret|sensitive|hidden-token|token/);
 expect(source.host).toBe('public.example');
});
test.each([['ru',copy.agentCopy.ru],['en',copy.agentCopy.en]])('%s explains one unavailable source without a task-failure card',async(_language,words)=>{
 const b=blocks([failed(),success])[0];
 await act(async()=>render(React.createElement(cards.ErrorCard,{title:'Read material',code:b.code,sourceRead:b.sourceRead,refusal:true,words})));
 expect(document.querySelector('[data-agent-source-issue]')).not.toBeNull();
 expect(document.querySelector('[data-agent-card="error"]')).toBeNull();expect(within(document.body).queryByRole('alert')).toBeNull();
 const trigger=within(document.body).getByRole('button');expect(trigger.textContent).toContain('public.example');
 await act(async()=>fireEvent.click(trigger));const region=within(document.body).getByRole('region');
 expect(region.textContent).toContain('HTTP 403');expect(region.textContent).toContain('REMOTE_4XX');expect(region.textContent).toContain(words.error.sourceRead.continued);
 expect(within(region).queryByRole('button')).toBeNull();
});


test.each(['REMOTE_4XX','REMOTE_5XX','RATE_LIMITED','TIMEOUT'])('source availability code %s remains scoped to this read',code=>{
 expect(blocks([failed(code)])[0].sourceRead).toMatchObject({kind:'remote',continued:false});
});
test('a security refusal keeps the normal error and no invented continuation',async()=>{
 const b=blocks([failed('DNS_UNSAFE'),success])[0];
 await act(async()=>render(React.createElement(cards.ErrorCard,{title:'Read material',code:b.code,sourceRead:b.sourceRead,refusal:true,words:copy.agentCopy.en})));
 expect(document.querySelector('[data-agent-source-issue]')).toBeNull();
 expect(document.querySelector('[data-agent-card="error"]')).not.toBeNull();
 expect(within(document.body).getByRole('alert')).not.toBeNull();
});
