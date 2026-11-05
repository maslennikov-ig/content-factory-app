const {loadTypeScriptModule:load}=require('./helpers/load-ts-module.cjs');
const card=load('libraries/nestjs-libraries/src/chat/capabilities/question-card.ts');
const batch=load('libraries/nestjs-libraries/src/chat/conductor/native-question-batch.ts');
const frontend=require('./helpers/load-tsx.cjs').loadTypeScriptModule('apps/frontend/src/components/agents/agent.contract.ts');
const question='What is the actual product price and currency?';

test('untyped historical native fact questions keep their fingerprint and text resume while refusing delegation',()=>{
 const saved={question};const before=JSON.stringify(saved);const view=card.questionCardView(saved,'ask_user');
 expect(view.canDecideForPerson).toBe(false);expect(view.cardId).toBe(card.questionCardId(saved));
 expect(card.answerFitsCard(saved,{decideForPerson:true},'ask_user')).toBe(false);
 expect(card.answerFitsCard(saved,{answer:'Price is not available yet.'},'ask_user')).toBe(true);
 expect(frontend.readQuestion('ask_user',view,null).canDecideForPerson).toBe(false);
 expect(JSON.stringify(saved)).toBe(before);
});

test.each([undefined,'fact','creative'])('an explicit nondelegable native question rejects a forged delegation (%s)',questionPurpose=>{
 const saved={question,questionPurpose,canDecideForPerson:false};
 expect(card.answerFitsCard(saved,{decideForPerson:true},'ask_user')).toBe(false);
 expect(card.questionCardView(saved,'ask_user').canDecideForPerson).toBe(false);
});

test('only explicit creative native purpose permits delegation; non-native typed selection behavior remains',()=>{
 const creative={question:'Which structure?',questionPurpose:'creative',canDecideForPerson:true};
 expect(card.answerFitsCard(creative,{decideForPerson:true},'ask_user')).toBe(true);
 expect(card.questionCardView(creative,'ask_user').canDecideForPerson).toBe(true);
 expect(frontend.readQuestion('ask_user',creative,null).canDecideForPerson).toBe(true);
 const fact={...creative,questionPurpose:'fact'};
 expect(card.answerFitsCard(fact,{decideForPerson:true},'ask_user')).toBe(false);
 expect(frontend.readQuestion('ask_user',fact,null).canDecideForPerson).toBe(false);
 expect(card.questionCardView({kind:'selection',answerKey:'ids',canDecideForPerson:true,options:[]},'piece_select').canDecideForPerson).toBe(true);
});

test.each(['fact','creative'])('the actual native single wrapper saves purpose/policy instead of losing it in the SDK (%s)',async questionPurpose=>{
 let saved;const tool=batch.createNativeQuestionTool();
 const input=tool.inputSchema.parse({question,questionPurpose,canDecideForPerson:true});
 await tool.execute(input,{agent:{suspend:async value=>{saved=JSON.parse(JSON.stringify(value));}}});
 expect(saved.questionPurpose).toBe(questionPurpose);expect(saved.canDecideForPerson).toBe(questionPurpose==='creative');
 expect(card.questionCardView(saved,'ask_user').cardId).toBe(card.questionCardId(saved));
 const reply=await tool.execute(input,{agent:{resumeData:'Owner cannot provide the price yet.'}});
 expect(reply).toMatchObject({questionPurpose,resolution:'person_reply'});expect(reply.content).toContain('Owner cannot provide the price yet.');
});

test('creative delegation resumes with explicit provenance while forged direct fact delegation cannot execute',async()=>{
 const tool=batch.createNativeQuestionTool();
 const creative={question:'Which angle?',questionPurpose:'creative'};
 const result=await tool.execute(creative,{agent:{resumeData:{decideForPerson:true}}});
 expect(result).toMatchObject({questionPurpose:'creative',resolution:'editorial_delegation'});
 expect(result.content).not.toContain('User answered:');
 await expect(tool.execute({...creative,questionPurpose:'fact'},{agent:{resumeData:{decideForPerson:true}}})).rejects.toThrow();
});

test('mixed native batches preserve typed policy and accept only human replies/skips for unknown facts',async()=>{
 const input={questions:[{question,questionPurpose:'fact',canDecideForPerson:true},{question:'Which angle?',questionPurpose:'creative'}]};
 let saved;const tool=batch.createNativeQuestionTool();
 await tool.execute(input,{agent:{suspend:async value=>{saved=value;}}});
 expect(saved.questions.map(q=>q.canDecideForPerson)).toEqual([false,true]);
 expect(card.answerFitsCard(saved,{answers:[{answer:'Not available'},{decideForPerson:true}]},'ask_user')).toBe(true);
 expect(card.answerFitsCard(saved,{answers:[{decideForPerson:true},{answer:'Neutral'}]},'ask_user')).toBe(false);
 expect(card.answerFitsCard(saved,{answers:[{skipped:true},{decideForPerson:true}]},'ask_user')).toBe(true);
});
