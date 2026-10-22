'use strict';
const {loadTypeScriptModule}=require('./helpers/load-ts-module.cjs');
const roles=loadTypeScriptModule('libraries/nestjs-libraries/src/openai/ai.roles.ts');
const chain=require('@contentfactory/nestjs-libraries/openai/ai.text-chain');
let config, choice, calls, classifierFailure, malformed;
const clients=loadTypeScriptModule('libraries/nestjs-libraries/src/openai/ai.clients.ts',{
 '@contentfactory/nestjs-libraries/openai/ai.provider.config':{
  requireActiveAiConfig:async()=>config,getActiveAiRole:()=>undefined,
 },
 '@contentfactory/nestjs-libraries/openai/ai.roles':roles,
 '@ai-sdk/openai':{createOpenAI:()=>({
  chat:modelId=>({modelId,api:'chat'}),responses:modelId=>({modelId,api:'responses'}),
 })},
 '@mastra/core/agent':{Agent:class {
  constructor(options){this.options=options;}
  async generate(messages,options){
   calls.push({messages,options,models:this.options.model});
   if(classifierFailure)throw new Error('classifier offline');
   return {object:{answers:{tier:malformed?choice:{choice}}},usage:{inputTokens:10,outputTokens:4}};
  }
 }},
});
const baseConfig=()=>({usageMode:'workspace_key',provider:'openrouter',apiKey:'private-test-key',
 textModel:'vendor/base',imageModel:'vendor/image',roleModels:{},
 modelRouting:{enabled:true,advancedModel:'vendor/advanced',advancedFlex:false},
 textChain:{flex:false,fallbackModel:'vendor/advanced'},
 search:{enabled:false,provider:'tavily',apiKey:'',topic:'general',depth:'basic'},
});
beforeEach(()=>{config=baseConfig();choice='base';calls=[];classifierFailure=false;malformed=false;});
const ids=result=>result.entries.map(e=>e.model.modelId);
test('native Classifier selects advanced with one unique ordered native fallback array',async()=>{
 choice='advanced';const r=await clients.getRoutedMastraModelEntries('tenant','draft','Competing evidence and an original editorial argument');
 expect(ids(r)).toEqual(['vendor/advanced','vendor/base']);
 expect(r.policy.fallbackModels).toEqual(['vendor/base']);
 expect(r.decision).toEqual({choice:'advanced',modelId:'vendor/advanced'});
 expect(calls).toHaveLength(1);expect(calls[0].models).toHaveLength(1);
 expect(calls[0].options.modelSettings.maxRetries).toBe(0);
});
test('native preflight reuses one decision per context/task and separates tenants and new tasks',async()=>{
 const context={};
 await Promise.all([clients.getRoutedMastraModelEntries('tenant','agent','one',{requestContext:context}),clients.getRoutedMastraModelEntries('tenant','agent','one',{requestContext:context})]);
 expect(calls).toHaveLength(1);
 await clients.getRoutedMastraModelEntries('tenant','agent','two',{requestContext:context});
 await clients.getRoutedMastraModelEntries('other','agent','one',{requestContext:context});
 expect(calls).toHaveLength(3);
});
test.each(['disabled','pinned','override','utility','missing'])('%s bypasses semantic selection',async kind=>{
 let role='draft',input='task',options;
 if(kind==='disabled')config.modelRouting.enabled=false;
 if(kind==='pinned')config.roleModels.draft='vendor/pinned';
 if(kind==='override')options={modelId:'vendor/explicit'};
 if(kind==='utility')role='classify';
 if(kind==='missing')input=undefined;
 const r=await clients.getRoutedMastraModelEntries('tenant',role,input,options);
 expect(calls).toHaveLength(0);
 expect(r.primaryModel).toBe(kind==='pinned'?'vendor/pinned':kind==='override'?'vendor/explicit':'vendor/base');
});
test('explicit fallback off stays off after semantic escalation',async()=>{
 config.textChain={flex:false,fallbackModel:'',fallbackModels:[],fallbackDisabled:true};choice='advanced';
 expect(ids(await clients.getRoutedMastraModelEntries('tenant','adapt','difficult task'))).toEqual(['vendor/advanced']);
});
test('selector outage abstains without walking a second fallback chain or blocking generation',async()=>{
 classifierFailure=true;const warn=jest.spyOn(console,'warn').mockImplementation(()=>{});
 try{const r=await clients.getRoutedMastraModelEntries('tenant','review','task');expect(ids(r)).toEqual(['vendor/base','vendor/advanced']);expect(calls).toHaveLength(1);}finally{warn.mockRestore();}
});
test('own-key direct OpenAI uses native Responses models and compatible inherited fallback',async()=>{
 config={...baseConfig(),provider:'openai',textModel:'gpt-base',modelRouting:{enabled:false,advancedModel:'gpt-advanced',advancedFlex:true},textChain:chain.resolveTextChainSettings(null)};
 const r=await clients.getMastraAgentModelEntries('tenant','agent');
 expect(ids(r)).toEqual(['gpt-base',chain.DEFAULT_TEXT_FALLBACK_MODEL.replace(/^openai\//,'')]);
 expect(r.entries.every(e=>e.model.api==='responses')).toBe(true);
});
test('routing state redacts credential shapes before the native classifier receives it',async()=>{
 await clients.getRoutedMastraModelEntries('tenant','agent','Please use sk-or-v1-1234567890abcdefghijklmnop');
 expect(JSON.stringify(calls[0].messages)).not.toContain('sk-or-v1-1234567890abcdefghijklmnop');
});
test('inherited fallback retains provenance when retries change or reset',()=>{
 const column=chain.serializeTextFallbackColumn({textMaxRetries:2,currentColumn:null});
 expect(chain.parseStoredTextFallback(column)).toMatchObject({inheritedDefault:true,maxRetries:2,disabled:false});
 const settings=chain.resolveTextChainSettings({textFallbackModel:column});
 expect(settings.fallbackModels).toBeUndefined();expect(settings.maxRetries).toBe(2);
 const policy=chain.resolveOrderedTextChainPolicy(settings,{provider:'openai',usageMode:'workspace_key',primaryModel:'gpt-base'});
 expect(policy.fallbackModels).toEqual([chain.DEFAULT_TEXT_FALLBACK_MODEL.replace(/^openai\//,'')]);
 const reset=chain.serializeTextFallbackColumn({textFallbackModel:'',textFallbackDisabled:false,textMaxRetries:2,currentColumn:'vendor/custom'});
 expect(chain.parseStoredTextFallback(reset)).toMatchObject({inheritedDefault:true,maxRetries:2});
});
test('configured own-key Sol tier is Flex only and disabling the profile tier remains authoritative',()=>{
 const source={provider:'openrouter',usageMode:'workspace_key',textChain:chain.resolveTextChainSettings(null),modelRouting:{advancedModel:chain.DEFAULT_TEXT_FALLBACK_MODEL,advancedFlex:true}};
 const settings=chain.withModelRoutingTextChain(source);
 expect(chain.planTextAttempts(chain.DEFAULT_TEXT_FALLBACK_MODEL,{...source,textChain:settings,singleModelAttempt:true})).toMatchObject([{flex:true}]);
 const standard=chain.withModelRoutingTextChain({...source,modelRouting:{...source.modelRouting,advancedFlex:false}});
 expect(chain.planTextAttempts(chain.DEFAULT_TEXT_FALLBACK_MODEL,{...source,textChain:standard,singleModelAttempt:true})).toMatchObject([{flex:false}]);
});
test('Responses native attempt carries Flex and reports real token accounting without a second transport retry',async()=>{
 const ledger=new chain.TextUsageLedger();let body;
 const run=chain.createTextChainFetch({provider:'openai',usageMode:'workspace_key',singleModelAttempt:true,textChain:{flex:false,fallbackModel:'',modelTiers:{'gpt-advanced':true}}},async(_url,init)=>{
  body=JSON.parse(init.body);return new Response(JSON.stringify({model:'gpt-advanced',service_tier:'flex',usage:{input_tokens:31,output_tokens:19,output_tokens_details:{reasoning_tokens:7},input_tokens_details:{cached_tokens:3}},output:[]}),{status:200,headers:{'content-type':'application/json'}});
 });
 await chain.runWithUsageLedger(ledger,()=>run('https://api.openai.com/v1/responses',{method:'POST',body:JSON.stringify({model:'gpt-advanced',input:[],max_output_tokens:100})}));
 expect(body.service_tier).toBe('flex');expect(body.max_output_tokens).toBe(100+chain.REASONING_HEADROOM_TOKENS);
 expect(body.usage).toBeUndefined();
 expect(ledger.columns()).toMatchObject({promptTokens:31,completionTokens:19,reasoningTokens:7,cachedTokens:3,serviceTier:'flex'});
});

test('native classifier receives an explicit decision-object schema; malformed shorthand is an error, never a silent base vote',async()=>{
 choice='advanced';await clients.getRoutedMastraModelEntries('tenant','draft','complex task');
 const schema=calls[0].options.structuredOutput.schema;
 expect(schema.safeParse({answers:{tier:{choice:'advanced'}}}).success).toBe(true);
 expect(schema.safeParse({answers:{tier:'advanced'}}).success).toBe(false);
 malformed=true;const warn=jest.spyOn(console,'warn').mockImplementation(()=>{});
 try{const r=await clients.getRoutedMastraModelEntries('tenant','draft','other task');expect(r.primaryModel).toBe('vendor/base');expect(warn).toHaveBeenCalled();}finally{warn.mockRestore();}
});

test('changing a different profile cannot disable the included Sol Flex policy',()=>{
 const source={provider:'openrouter',usageMode:'included',modelRouting:{advancedModel:'vendor/other',advancedFlex:false},textChain:{...chain.resolveTextChainSettings(null),flex:false}};
 expect(chain.planTextAttempts(chain.DEFAULT_TEXT_FALLBACK_MODEL,{...source,textChain:chain.withModelRoutingTextChain(source),singleModelAttempt:true})).toMatchObject([{flex:true}]);
 const explicit={...source,modelRouting:{advancedModel:chain.DEFAULT_TEXT_FALLBACK_MODEL,advancedFlex:false}};
 expect(chain.planTextAttempts(chain.DEFAULT_TEXT_FALLBACK_MODEL,{...explicit,textChain:chain.withModelRoutingTextChain(explicit),singleModelAttempt:true})).toMatchObject([{flex:false}]);
});
test('an unsupported Flex profile fails before a provider call instead of silently charging Standard',async()=>{
 config.modelRouting={enabled:true,advancedModel:'vendor/no-flex',advancedFlex:true};
 await expect(clients.getMastraAgentModelEntries('tenant','draft',{modelId:'vendor/no-flex'})).rejects.toThrow('no supported Flex route');
 expect(calls).toHaveLength(0);
 expect(()=>chain.buildAttemptBody({model:'vendor/no-flex'},{model:'vendor/no-flex',flex:true},undefined,'openrouter')).toThrow('no supported Flex route');
});
