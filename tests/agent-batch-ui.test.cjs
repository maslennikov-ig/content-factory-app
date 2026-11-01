'use strict';
const React=require('react'),{JSDOM}=require('jsdom');
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost/agents/batch-test'});
for(const key of ['window','document','navigator'])Object.defineProperty(global,key,{configurable:true,value:dom.window[key]});
global.IS_REACT_ACT_ENVIRONMENT=true;
const {render,fireEvent,screen,cleanup,act,waitFor}=require('@testing-library/react');
const {loadTypeScriptModule}=require('./helpers/load-tsx.cjs');
const contract=loadTypeScriptModule('apps/frontend/src/components/agents/agent.contract.ts');
const {QuestionCard}=loadTypeScriptModule('apps/frontend/src/components/agents/agent.cards.tsx');
const {agentWordsFor}=loadTypeScriptModule('apps/frontend/src/components/agents/agent.copy.ts');
const words=agentWordsFor('ru');
const payload={kind:'question-batch',cardId:'saved-batch',questions:[
 {question:'Ваш взгляд на первую новость?',options:[{label:'Первое мнение',description:'Первый контекст'}]},
 {question:'Ваш взгляд на вторую новость?',options:[{label:'Второе мнение'}]},
 {question:'Ваш взгляд на третью новость?',options:[{label:'Третье мнение'}]},
]};
const question=()=>contract.readQuestion('ask_user',payload,null);
afterEach(()=>{cleanup();window.sessionStorage.clear();});
const card=(onAnswer,extra={})=>React.createElement(QuestionCard,{title:null,question:question(),answered:false,busy:false,onAnswer,words,draftStorageKey:'isolated-batch',...extra});
test('prepared questions advance instantly, allow back/edit and submit one ordered native answer',async()=>{
 const submit=jest.fn();await act(async()=>render(card(submit)));
 expect(await screen.findByText('Вопрос 1/3')).toBeTruthy();
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Первое мнение',exact:true})));
 expect(screen.getByText('Вопрос 2/3')).toBeTruthy();expect(submit).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:words.question.batch.back}));
 expect(screen.getByText('Вопрос 1/3')).toBeTruthy();
 fireEvent.change(screen.getByLabelText(words.question.ownAnswer),{target:{value:'Мой уточнённый ответ'}});
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:words.question.send,exact:true})));
 fireEvent.click(screen.getByRole('button',{name:words.question.batch.skip,exact:true}));
 expect(screen.getByText('Вопрос 3/3')).toBeTruthy();
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:words.question.decide,exact:true})));
 expect(screen.getByText(words.question.batch.review,{selector:'[id]'})).toBeTruthy();
 expect(submit).not.toHaveBeenCalled();
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:words.question.batch.submit,exact:true})));
 expect(submit).toHaveBeenCalledTimes(1);
 expect(submit.mock.calls[0][0]).toEqual({answers:[{answer:'Мой уточнённый ответ'},{skipped:true},{decideForPerson:true}]});
});
test('reload keeps scoped unsent answers; failure preserves complete answers for retry',async()=>{
 const submit=jest.fn().mockRejectedValueOnce(Error('disconnected')).mockResolvedValue(undefined);
 let ui;await act(async()=>{ui=render(card(submit));});
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Первое мнение',exact:true})));
 ui.unmount();await act(async()=>{ui=render(card(submit));});expect(screen.getByText('Вопрос 2/3')).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:words.question.batch.skipRest}));
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:words.question.batch.submit})));
 expect(screen.getByRole('status').textContent).toContain(words.question.answerFailed);
 expect(window.sessionStorage.getItem('isolated-batch:batch')).toContain('Первое мнение');
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:words.question.batch.submit})));
 expect(submit).toHaveBeenCalledTimes(2);expect(window.sessionStorage.getItem('isolated-batch:batch')).toBeNull();
});
test('saved native batch history exposes every actual answer without inventing delegated decisions',()=>{
 const answers=[{answer:'Первое мнение'},{skipped:true},{decideForPerson:true}];
 const blocks=contract.readMessageBlocks({id:'saved',role:'assistant',parts:[{type:'tool-ask_user',toolCallId:'native',state:'output-available',input:{questions:payload.questions},output:{questions:payload.questions,answers}}]});
 const block=blocks.find(b=>b.type==='question');expect(block.question.kind).toBe('question-batch');expect(block.history.batchAnswers).toEqual(answers);
 render(card(jest.fn(),{question:block.question,history:block.history,answered:true}));
 fireEvent.click(screen.getByRole('button',{expanded:false}));
 for(const item of payload.questions)expect(screen.getByText(item.question)).toBeTruthy();
 expect(screen.getByText(words.question.batch.skipped)).toBeTruthy();expect(screen.getByText(words.question.delegated)).toBeTruthy();
});
test('all supported locales have batch navigation and numeric series identity',()=>{
 const fs=require('node:fs'),path=require('node:path');
 for(const locale of fs.readdirSync(path.join(__dirname,'../libraries/react-shared-libraries/src/translation/locales'))){
  const w=agentWordsFor(locale);expect(w.card.series(12)).toContain('12');expect(w.card.seriesPart(2,12)).toContain('2/12');
  expect(w.question.batch.progress(3,10)).toContain('3/10');expect(w.question.batch.submit).toBeTruthy();
  if(!['en','ru'].includes(locale))expect(w.question.batch.submit).not.toBe(words.question.batch.submit);
 }
});
