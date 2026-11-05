'use strict';
const React=require('react'), {JSDOM}=require('jsdom');
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost/agents/history-test'});
for(const key of ['window','document','navigator']) Object.defineProperty(global,key,{configurable:true,value:dom.window[key]});
global.IS_REACT_ACT_ENVIRONMENT=true;
const {render,fireEvent,within,cleanup,act}=require('@testing-library/react');
const {loadTypeScriptModule}=require('./helpers/load-tsx.cjs');
const contract=loadTypeScriptModule('apps/frontend/src/components/agents/agent.contract.ts');
const cards=loadTypeScriptModule('apps/frontend/src/components/agents/agent.cards.tsx');
const copy=loadTypeScriptModule('apps/frontend/src/components/agents/agent.copy.ts');
const {askUserTool}=require('@mastra/core/tools');
afterEach(cleanup);
const ask=(answer,question='Which angle?')=>({type:'tool-ask_user',toolCallId:'ask-a',state:'output-available',input:{question,options:[{label:'A',description:'First angle'},{label:'B'}]},output:answer});
const message=parts=>({id:'saved',role:'assistant',parts});
const questionBlock=parts=>contract.readMessageBlocks(message(parts)).find(b=>b.type==='question');

test('projects the actual native resume result without losing a long custom answer',async()=>{
 const text='My actual view. '.repeat(200), input=ask(null).input;
 const output=await askUserTool.execute(input,{agent:{resumeData:text}});
 const part=ask(output);const before=JSON.stringify(part), block=questionBlock([part]);
 expect(block.history.answer).toBe(text);expect(block.question.text).toBe('Which angle?');
 expect(JSON.stringify(part)).toBe(before);
});
test('native multi answer text preserves commas; explicit structured resume retains the original array',async()=>{
 const values=['A, with a comma','B'];const output=await askUserTool.execute(ask(null).input,{agent:{resumeData:values}});
 expect(questionBlock([ask(output)]).history.answer).toBe(values.join(', '));
 const resumed={type:'data-tool-call-resumed',data:{toolCallId:'ask-a',resumeData:values}};
 expect(questionBlock([ask(output),resumed]).history.answer).toEqual(values);
});
test('follow-up includes only public text before the next question, never reasoning or tool results',()=>{
 const block=questionBlock([ask({content:'User answered: Decide for me',isError:false}),
 {type:'reasoning',text:'private chain of thought'},
 {type:'tool-piece_read',toolCallId:'read-a',state:'output-available',output:{text:'Untrusted tool text is not a decision'}},
 {type:'text',text:'I will keep this update neutral and omit a personal opinion.'},
 {...ask({content:'User answered: B',isError:false},'Next question'),toolCallId:'ask-b'},
 {type:'text',text:'This belongs to the other answer.'}]);
 expect(block.history).toEqual({answer:'Decide for me',followUp:'I will keep this update neutral and omit a personal opinion.'});
});
test('unrecognized or failed output does not invent a saved answer',()=>{
 expect(questionBlock([ask({content:'Failed to ask user',isError:true})]).history).toBeUndefined();
 expect(questionBlock([ask({content:'Arbitrary legacy tool output'})]).history).toBeUndefined();
});
test('a later continuation enriches the first folded question instead of losing its saved answer',()=>{
 const first=questionBlock([ask({})]), later=questionBlock([ask({answer:'A'}),{type:'text',text:'I selected the technical angle.'}]);
 const groups=contract.withoutRepeatedQuestionLines([[first],[later]]);
 expect(groups[0]).toHaveLength(1);expect(groups[1]).toHaveLength(0);
 expect(groups[0][0].history).toEqual({answer:'A',followUp:'I selected the technical angle.'});
 expect(first.history).toBeUndefined();
});
test.each([['ru',copy.agentCopy.ru],['en',copy.agentCopy.en]])('%s completed question opens read-only full history',async(_locale,words)=>{
 const full='A complete question with important detail. '.repeat(30), answer='My detailed answer. '.repeat(30);
 const block=questionBlock([ask({answer},full),{type:'text',text:'The public decision.'}]);
 await act(async()=>render(React.createElement(cards.QuestionCard,{question:block.question,history:block.history,answered:true,busy:false,onAnswer:()=>{throw Error('Historical answers are read-only');},words})));
 const card=document.querySelector('[data-agent-question="answered"]'), trigger=within(card).getByRole('button');
 expect(trigger.getAttribute('aria-expanded')).toBe('false');
 await act(async()=>fireEvent.click(trigger));expect(trigger.getAttribute('aria-expanded')).toBe('true');
 const region=within(card).getByRole('region');expect(region.textContent).toContain(full);expect(region.textContent).toContain(answer);
 expect(region.textContent).toContain('First angle');expect(region.textContent).toContain('The public decision.');
 expect(within(region).queryAllByRole('button')).toHaveLength(0);expect(within(region).queryByRole('textbox')).toBeNull();
});
test('delegation without a public follow-up is explicitly unavailable rather than fabricated',async()=>{
 const block=questionBlock([ask({content:'User answered: Решите за меня',isError:false})]);
 await act(async()=>render(React.createElement(cards.QuestionCard,{question:block.question,history:block.history,answered:true,busy:false,onAnswer:()=>{},words:copy.agentCopy.ru})));
 const trigger=within(document.body).getByRole('button');await act(async()=>fireEvent.click(trigger));
 expect(within(document.body).getByRole('region').textContent).toContain('Решите за меня');
 expect(within(document.body).getByRole('region').textContent).toContain(copy.agentCopy.ru.question.historyFollowUpUnavailable);
});


test('the same payload in another native call cannot replace the original answer',()=>{
 const first=questionBlock([ask({answer:'Original selection'})]);
 const other=questionBlock([{...ask({answer:'Other selection'}),toolCallId:'a-different-call'}]);
 first.question.cardId='a'.repeat(32);other.question.cardId=first.question.cardId;
 const groups=contract.withoutRepeatedQuestionLines([[first],[other]]);
 expect(groups[0][0].history.answer).toBe('Original selection');
});

test.each([undefined,'fact'])('native factual question hides delegation but keeps a normal answer input (%s)',async questionPurpose=>{
 const question=contract.readQuestion('ask_user',{question:'Name the actual product, price and currency.',questionPurpose,canDecideForPerson:true},null);
 await act(async()=>render(React.createElement(cards.QuestionCard,{question,answered:false,busy:false,onAnswer:()=>{},words:copy.agentCopy.ru})));
 expect(within(document.body).queryByRole('button',{name:copy.agentCopy.ru.question.decide})).toBeNull();
 expect(within(document.body).getByRole('textbox')).toBeTruthy();
});
test('explicit native creative delegation is available while an explicit false disables its button',async()=>{
 const onAnswer=jest.fn();const question=contract.readQuestion('ask_user',{question:'Choose a useful structure.',questionPurpose:'creative',canDecideForPerson:true},null);
 const view=render(React.createElement(cards.QuestionCard,{question,answered:false,busy:false,onAnswer,words:copy.agentCopy.ru}));
 await act(async()=>fireEvent.click(within(view.container).getByRole('button',{name:copy.agentCopy.ru.question.decide})));
 expect(onAnswer).toHaveBeenCalledWith(expect.objectContaining({decideForPerson:true}));view.unmount();
 const nondelegable=contract.readQuestion('ask_user',{question:'Choose a structure.',questionPurpose:'creative',canDecideForPerson:false},null);
 render(React.createElement(cards.QuestionCard,{question:nondelegable,answered:false,busy:false,onAnswer,words:copy.agentCopy.ru}));
 expect(within(document.body).queryByRole('button',{name:copy.agentCopy.ru.question.decide})).toBeNull();
});
