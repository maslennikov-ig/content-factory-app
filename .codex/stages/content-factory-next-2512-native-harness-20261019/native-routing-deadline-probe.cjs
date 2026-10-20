const assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'../../..');
const {ModelSelectionProcessor}=require('@mastra/core/processors');
const {loadTypeScriptModule}=require(path.join(root,'tests/helpers/load-ts-module.cjs'));
const chain=require(path.join(root,'tests/helpers/ai-text-chain.cjs'));
const {createConductorExecution,CONDUCTOR_EXECUTION_DEFAULTS}=loadTypeScriptModule('libraries/nestjs-libraries/src/chat/conductor/conductor.execution.ts',{'../../openai/ai.text-chain':chain});
let networkCalls=0;global.fetch=async()=>{networkCalls++;throw Error('Network forbidden');};
async function route(answer){
 const decisions=[];const processor=new ModelSelectionProcessor({classifier:'scripted-classifier',select:answers=>answers.complexity.choice==='simple'?'scripted/economical':'scripted/capable',onDecision:d=>decisions.push(d)});
 processor.__registerMastra({getClassifierById:()=>({questions:{complexity:{}},evaluate:async()=>({answers:{complexity:{choice:answer}}})})});
 const state={};const messages=[{id:'user',role:'user',createdAt:new Date(),content:{format:2,parts:[{type:'text',text:'Synthetic request; classification is scripted.'}]}}];
 await processor.processInput({messages,state,systemMessages:[]});const result=processor.processInputStep({state,model:'scripted/default',stepNumber:0});
 assert.equal(decisions.length,1);return result.model;
}
(async()=>{
 assert.equal(await route('simple'),'scripted/economical');assert.equal(await route('complex'),'scripted/capable');
 let clock=0;const task=createConductorExecution({requestId:'synthetic-deadline',now:()=>clock,policy:{...CONDUCTOR_EXECUTION_DEFAULTS}});
 task.run(()=>{const ledger=new chain.TextUsageLedger();ledger.record({attempt:1,promptTokens:1,completionTokens:1,costUsd:0.01});clock=task.policy.maxDurationMs+1;ledger.record({attempt:1,failed:true,possiblyBilled:true});assert.throws(()=>chain.assertAiExecutionBudget(),e=>e.code==='AGENT_TASK_UNCERTAIN');});
 const budget=task.snapshot();assert.equal(budget.stopCode,'AGENT_TASK_UNCERTAIN');assert.equal(budget.knownCostUsd,0.01);assert.equal(budget.providerCalls,2);assert.equal(networkCalls,0);
 console.log(JSON.stringify({passed:true,nativeRouting:{scriptedSimple:'scripted/economical',scriptedComplex:'scripted/capable',qualityEvaluated:false},deadline:{configuredMs:task.policy.maxDurationMs,elapsedMs:budget.elapsedMs,reportedStop:budget.stopCode,confirmedUsagePreserved:true},networkCalls,realModelCalls:0}));
})().catch(e=>{console.error(e.stack);process.exitCode=1});
