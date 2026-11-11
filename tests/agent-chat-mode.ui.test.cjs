'use strict';
const React=require('react');
const {JSDOM}=require('jsdom');
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost/agents/chat'});
for(const key of ['window','document','navigator'])Object.defineProperty(global,key,{configurable:true,value:key==='window'?dom.window:dom.window[key]});
global.self=dom.window;global.IS_REACT_ACT_ENVIRONMENT=true;
const {act,cleanup,fireEvent,render,screen}=require('@testing-library/react');
const {loadTypeScriptModule}=require('./helpers/load-tsx.cjs');
const {loadWithMocks}=require('./helpers/load-ts-with-mocks.cjs');
const {agentCopy}=loadTypeScriptModule('apps/frontend/src/components/agents/agent.copy.ts');
const {AgentComposer}=loadWithMocks('apps/frontend/src/components/agents/agent.composer.tsx',{
 react:React,
 '@contentfactory/frontend/components/ui/allowance-hint':{AllowanceHint:()=>null},
 '@contentfactory/frontend/components/media/library-image-compression':{compressLibraryImage:async file=>file},
});
afterEach(cleanup);
test.each(['ru','en'])('composer exposes exactly two whole-chat modes without sending a message (%s)',async locale=>{
 const change=jest.fn(),send=jest.fn();
 await act(async()=>render(React.createElement(AgentComposer,{busy:false,queued:false,onSubmit:send,onStop:()=>{},words:agentCopy[locale],chatModeControl:{value:'collaborative',onChange:change}})));
 const select=screen.getByRole('combobox',{name:locale==='ru'?'Режим чата':'Chat mode'});
 const attach=screen.getByRole('button',{name:agentCopy[locale].composer.attach});
 expect(attach.parentElement.contains(select)).toBe(true);
 expect(attach.textContent).toBe('');
 expect(document.body.textContent).not.toMatch(/Задаю рабочие вопросы|I ask working questions/);
 const picker=document.querySelector('input[type="file"]');
 const open=jest.spyOn(picker,'click').mockImplementation(()=>{});
 fireEvent.click(attach);
 expect(open).toHaveBeenCalledTimes(1);
 expect([...select.options].map(option=>option.textContent)).toEqual(locale==='ru'?['С согласованием','Автопилот']:['With approval','Autopilot']);
 expect(select.value).toBe('collaborative');
 await act(async()=>fireEvent.change(select,{target:{value:'autopilot'}}));
 expect(change).toHaveBeenCalledWith('autopilot');
 expect(send).not.toHaveBeenCalled();
});
test('saving and active work disable only the mode; failed save retains the previous choice and shows recovery',async()=>{
 const props={busy:false,queued:false,onSubmit:()=>{},onStop:()=>{},words:agentCopy.ru,chatModeControl:{value:'collaborative',onChange:()=>{},saving:true}};
 const view=render(React.createElement(AgentComposer,props));
 expect(screen.getByRole('combobox').disabled).toBe(true);
 expect(screen.getByRole('status').textContent).toContain('Сохраняю режим');
 view.rerender(React.createElement(AgentComposer,{...props,chatModeControl:{...props.chatModeControl,saving:false,error:true}}));
 expect(screen.getByRole('combobox').value).toBe('collaborative');
 expect(screen.getByRole('combobox').disabled).toBe(false);
 expect(screen.getByRole('alert').textContent).toContain('Попробуйте ещё раз');
 view.rerender(React.createElement(AgentComposer,{...props,busy:true,chatModeControl:{...props.chatModeControl,saving:false}}));
 expect(screen.getByRole('combobox').disabled).toBe(true);
 expect(document.querySelector('textarea').disabled).toBe(false);
});
test('transport contract sends user-selected mode only on a new human message and reads persisted metadata',()=>{
 const {buildChatBody,readThreadHistory}=loadTypeScriptModule('apps/frontend/src/components/agents/agent.contract.ts');
 const message={id:'user-message',role:'user',parts:[{type:'text',text:'Сделай материал'}]};
 expect(buildChatBody({threadId:null,messages:[message],chatMode:'autopilot'}).chatMode).toBe('autopilot');
 expect(buildChatBody({threadId:'thread',messages:[],chatMode:'autopilot',resume:{runId:'run',cardId:'card',resumeData:{answer:'Карусель'}}}).chatMode).toBeUndefined();
 expect(readThreadHistory({thread:{id:'thread',title:'Chat',chatMode:'prepare_approve'},messages:[],pending:[]}).thread.chatMode).toBe('collaborative');
});
