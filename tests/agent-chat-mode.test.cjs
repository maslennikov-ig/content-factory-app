'use strict';
const {loadTypeScriptModule:load} = require('./helpers/load-ts-module.cjs');
const base='libraries/nestjs-libraries/src/chat/conductor/';
const mode=load(`${base}chat-mode.ts`);
const {buildConductorContext}=load(`${base}conductor.context.ts`);
const {parseAgentChatBody}=load(`${base}agent-chat.request.ts`);
const {AgentThreadsService,threadView}=load(`${base}agent-threads.service.ts`,{
 '@contentfactory/nestjs-libraries/chat/mastra.service':{MastraService:class{}},
});
const identity={organizationId:'org',userId:'owner',role:'EDITOR',language:'ru'};
function harness(){
 const at=new Date('2026-11-06T09:00:00Z');
 const rows=new Map([['one',{id:'one',resourceId:'org:owner',title:'One',createdAt:at,updatedAt:at,metadata:{unrelated:'keep'}}],['two',{id:'two',resourceId:'org:owner',title:'Two',createdAt:at,updatedAt:at}],['foreign',{id:'foreign',resourceId:'org:other',createdAt:at,updatedAt:at}]]);
 const memory={getThreadById:async({threadId})=>rows.get(threadId)??null,
  updateThread:jest.fn(async({id,metadata})=>{const previous=rows.get(id);const next={...previous,metadata:{...previous.metadata,...metadata}};rows.set(id,next);return next;}),
  createThread:jest.fn(async(input)=>{const row={...input,id:input.threadId,createdAt:at,updatedAt:at};rows.set(input.threadId,row);return row;})};
 const mastra={conductor:async()=>({getMemory:async()=>memory}),sessionFor:jest.fn(async()=>undefined)};
 return {rows,memory,mastra,service:new AgentThreadsService(mastra)};
}
test('only the owned explicit endpoint saves the mode; another chat and native permissions stay untouched',async()=>{
 const h=harness();
 for(const chatMode of mode.AGENT_CHAT_MODES){
  await expect(h.service.switchChatMode(identity,'one',{chatMode})).resolves.toEqual({chatMode});
  expect(await h.service.chatModeForTurn(identity,'one')).toBe(chatMode);
  expect(threadView(h.rows.get('one')).chatMode).toBe(chatMode);
 }
 expect(h.rows.get('one').metadata).toEqual({unrelated:'keep',assistantChatModeV1:'autopilot'});
 expect(await h.service.chatModeForTurn(identity,'two')).toBe('collaborative');
 expect(await h.service.chatModeForTurn(identity,'one','collaborative')).toBe('autopilot');
 expect(h.mastra.sessionFor).not.toHaveBeenCalled();
 await expect(h.service.switchChatMode(identity,'foreign',{chatMode:'autopilot'})).rejects.toThrow();
 for(const bad of [{chatMode:'yolo'},{chatMode:'autopilot',grant:true},null])await expect(h.service.switchChatMode(identity,'one',bad)).rejects.toThrow();
});
test('new thread stores the explicitly selected mode on first admitted message, independently from workspace',async()=>{
 const h=harness();
 expect(await h.service.chatModeForTurn(identity,'new','autopilot')).toBe('autopilot');
 await h.service.threadForMessage(identity,'new','A new request',undefined,'autopilot');
 expect(h.rows.get('new').metadata).toEqual({assistantChatModeV1:'autopilot'});
 expect(await h.service.chatModeForTurn(identity,'new','collaborative')).toBe('autopilot');
});
test('legacy prepare_approve is review everywhere until an actual deliberate switch',async()=>{
 const h=harness();h.rows.get('one').metadata={unrelated:'keep',assistantChatModeV1:'prepare_approve'};
 expect(mode.AGENT_CHAT_MODES).toEqual(['collaborative','autopilot']);
 expect(mode.isAgentChatMode('prepare_approve')).toBe(false);
 expect(mode.readStoredChatMode(h.rows.get('one').metadata)).toBe('collaborative');
 expect(threadView(h.rows.get('one')).chatMode).toBe('collaborative');
 expect(await h.service.chatModeForTurn(identity,'one','autopilot')).toBe('collaborative');
 expect(h.rows.get('one').metadata.assistantChatModeV1).toBe('prepare_approve');
 await expect(h.service.switchChatMode(identity,'one',{chatMode:'prepare_approve'})).resolves.toEqual({chatMode:'collaborative'});
 expect(h.rows.get('one').metadata).toEqual({unrelated:'keep',assistantChatModeV1:'collaborative'});
 await h.service.switchChatMode(identity,'one',{chatMode:'autopilot'});
 expect(await h.service.chatModeForTurn(identity,'one')).toBe('autopilot');
});
test.each(mode.AGENT_CHAT_MODES)('all modes keep the person-owned format and expose no permission on selection: %s',chatMode=>{
 const context=buildConductorContext({identity,threadId:'one',chatMode,originalAuthorRequest:{messageId:'m',text:'Сделай материал из этого черновика'}});
 expect(context.get(mode.AGENT_CHAT_MODE_CONTEXT_KEY)).toBe(chatMode);
 expect(JSON.parse(context.get(mode.AGENT_MATERIAL_FORMAT_CONTEXT_KEY))).toEqual([]);
 expect(mode.chatModeInstructions(chatMode)).toContain('questionPurpose=format');
 expect(mode.chatModeInstructions(chatMode)).toContain('retain its saved user-selected format without asking again');
 expect(context.get('cf.approvals')??'').toBe('');
});
test('an explicit format is taken from the authored request and request parser validates mode',()=>{
 const context=buildConductorContext({identity,threadId:'one',chatMode:'autopilot',originalAuthorRequest:{messageId:'m',text:'Сделай из этого черновика Reels'}});
 expect(JSON.parse(context.get(mode.AGENT_MATERIAL_FORMAT_CONTEXT_KEY))).toEqual(['reel']);
 expect(mode.explicitMaterialFormats('Карусель')).toEqual(['carousel']);
 expect(mode.explicitMaterialFormats('Сделай материал из этого поста')).toEqual([]);
 expect(parseAgentChatBody({chatMode:'prepare_approve',messages:[{id:'message-1',role:'user',parts:[{type:'text',text:'Hello'}]}]}).chatMode).toBe('collaborative');
 expect(()=>parseAgentChatBody({chatMode:'yolo',messages:[]})).toThrow();
});
const {z}=require('zod/v4');
const questions=load(`${base}native-question-batch.ts`,{
 '@mastra/core/tools':{createTool:definition=>definition},
 '@mastra/core/agent-controller':{askUserTool:{description:'Ask',resumeSchema:z.object({answer:z.union([z.string(),z.array(z.string())])}),execute:async(_input,ctx)=>({content:ctx.agent.resumeData.answer})}},
});
test('format card refuses delegated answers and binds only a real human format to downstream context',async()=>{
 const tool=questions.createNativeQuestionTool(),values=new Map(),requestContext={set:(key,value)=>values.set(key,value)};
 const input={question:'Какой формат?',questionPurpose:'format',canDecideForPerson:true};
 const suspend=jest.fn(async payload=>payload);
 const payload=await tool.execute(input,{agent:{suspend},requestContext});
 expect(payload.canDecideForPerson).toBe(false);
 await expect(tool.execute(input,{agent:{resumeData:{decideForPerson:true}},requestContext})).rejects.toThrow();
 await tool.execute(input,{agent:{resumeData:{answer:'Карусель'}},requestContext});
 expect(JSON.parse(values.get(mode.AGENT_MATERIAL_FORMAT_CONTEXT_KEY))).toEqual(['carousel']);
});
const {loadCapabilityModule,servicesFrom}=require('./helpers/agent-capabilities.cjs');
const social=loadCapabilityModule('catalogue/social-factory.capabilities.ts');
const domain=load('libraries/nestjs-libraries/src/content-intelligence/social-factory/campaign/domain.ts');
function actionHarness(chatMode='autopilot'){
 const item={id:'item',campaignId:'campaign',channelId:'channel',platform:'instagram',format:'carousel',contentRevision:2,
  material:{title:'Saved material',body:'Text',assets:[],settings:{visibility:'public'}}};
 item.approval={revision:2,digest:domain.approvalDigest(item),actorId:'owner'};
 const campaign={id:'campaign',actorId:'owner',mode:'autopilot',grantId:'grant',state:'active',allocations:[item]};
 const grant={id:'grant',actorId:'owner',campaignId:'campaign',channelIds:['channel'],formats:['carousel'],mode:'autopilot',actions:['publish','schedule'],expiresAt:'2099-01-01T00:00:00.000Z'};
 const publisher={deliver:jest.fn(async()=>({state:'scheduled'}))};
 const factory={detail:jest.fn(async()=>({campaign,items:[item]})),create:jest.fn(async input=>input),autonomy:{getGrant:jest.fn(async()=>grant)}};
 const context=buildConductorContext({identity,threadId:'thread',chatMode});
 const ctx={...identity,entrance:'chat',requestContext:context,service:servicesFrom({SocialFactoryService:factory,SocialFactoryPublishingService:publisher})};
 const input={campaignId:'campaign',itemId:'item',requestId:'delivery-1',action:'publish',expectedContentRevision:2,grantId:'grant',approvalDigest:item.approval.digest};
 return {ctx,input,item,campaign,grant,publisher,factory};
}
test.each(mode.AGENT_CHAT_MODES)('server refuses model-selected format before creating any new campaign in %s',async chatMode=>{
 const h=actionHarness(chatMode);const input={allocations:[{format:'carousel'}]};
 await expect(Promise.resolve().then(()=>social.campaignCreate.run(h.ctx,input))).rejects.toMatchObject({code:'MATERIAL_FORMAT_REQUIRED',spentNothing:true});
 expect(h.factory.create).not.toHaveBeenCalled();
 h.ctx.requestContext.set(mode.AGENT_MATERIAL_FORMAT_CONTEXT_KEY,JSON.stringify(['carousel']));
 await social.campaignCreate.run(h.ctx,input);
 expect(h.factory.create).toHaveBeenCalledWith('org',expect.objectContaining({mode:chatMode,allocations:[{format:'carousel'}],actorId:'owner'}));
});
test('collaborative mode never buys an expert answer; autopilot uses the existing scoped editorial service',async()=>{
 const answer=jest.fn(async()=>({kind:'editorial',answer:'Use a clear introduction'}));
 const h=actionHarness('collaborative');
 h.ctx.service=servicesFrom({EditorialDecisionService:{answer},SocialFactoryService:h.factory});
 await expect(social.campaignDecide.run(h.ctx,{campaignId:'campaign',requestId:'decision',question:'Which angle?'})).rejects.toMatchObject({code:'CHAT_MODE_REQUIRES_PERSON'});
 expect(answer).not.toHaveBeenCalled();
 for(const chatMode of ['autopilot']){
  h.ctx.requestContext.set(mode.AGENT_CHAT_MODE_CONTEXT_KEY,chatMode);
  await social.campaignDecide.run(h.ctx,{campaignId:'campaign',grantId:'grant',requestId:`decision-${chatMode}`,question:'Which angle?'});
 }
 expect(answer).toHaveBeenCalledTimes(1);
});
test('the modes prepare concrete review options, reserve experts for complexity and reuse saved human setup',()=>{
 expect(mode.chatModeInstructions('collaborative')).toContain('concrete alternatives');
 const instructions=mode.chatModeInstructions('autopilot');
 expect(instructions).toContain('Routine creative');
 expect(instructions).toContain('complex');
 expect(instructions).toContain('distinct');
 expect(instructions).toContain('saved human-approved profile');
 expect(instructions).toContain('NEW or unresolved');
 expect(instructions).toMatch(/never synthesize/i);
});
test('the second editor returns a person-owned format gap without calling a model',async()=>{
 const {EditorialDecisionService}=load('libraries/nestjs-libraries/src/content-intelligence/social-factory/autonomy/editorial-decision.service.ts',{
  '../../../openai/ai.usage.service':{AiUsageService:class{}},
  '../../../openai/ai.provider.config':{loadAiConfig:jest.fn(),requireActiveAiConfig:jest.fn()},
  '../../../openai/ai.clients':{getMastraAgentModelEntries:jest.fn()},
 });
 const decide=jest.fn(async(_org,input)=>({kind:input.kind,missingFacts:input.missingFacts}));
 const service=new EditorialDecisionService({}, {decide}, {}, {transact:async callback=>callback({})}, {});
 service.authority=async()=>({grantId:'grant',campaignAuthority:{mode:'autopilot',grantId:'grant'}});
 service.answer=jest.fn(async()=>{throw new Error('No paid answer for format');});
 const result=await service.answerQuestions('org','owner',{campaignId:'campaign',requestId:'format-gap',questions:[{id:'format',type:'format',question:'Which format?'}]});
 expect(result.complete).toBe(false);expect(result.missingFacts).toEqual(['Which format?']);
 expect(service.answer).not.toHaveBeenCalled();
});
test.each([
 ['Сделай 5 рилсов и 10 сторис',['reel','story']],
 ['Сделай 3 поста и 2 карусели',['carousel','post']],
 ['Turn this post into a Reel',['reel']],
 ['Преврати этот пост в карусель',['carousel']],
 ['Сделай пост, не карусель',['post']],
 ['Сделай не карусель, а пост',['post']],
 ['Make a post, not a carousel',['post']],
 ['Create a carousel from this post',['carousel']],
 ['Сделай материал из Reels',[]],
 ['Сделай материал из этого поста',[]],
 ['Create material from this post',[]],
 ['Сделай материал о Reels',[]],
 ['Сделай пост или карусель',[]],
 ['Make a post or a Reel',[]],
 ['Приглашение для Telegram',[]],
 ['Приглашение для Telegram\n\nAvatar text: long video example',[]],
 ['Сделай материал из черновика: Long video example',[]],
 ['Сделай пост для Threads',['post']],
 ['Сделай из этого черновика Reels',['reel']],
 ['Карусель',['carousel']],
])('only an unambiguous target format is accepted: %s',(text,expected)=>{
 expect(mode.explicitMaterialFormats(text)).toEqual(expected);
});
test('generic video is explicit but never converted into a long-video choice',()=>{
 expect(mode.explicitMaterialFormats('Сделай видео')).toEqual(['video']);
 expect(mode.explicitMaterialFormats('Сделай длинное видео')).toEqual(['long_video']);
});
