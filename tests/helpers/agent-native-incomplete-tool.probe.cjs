'use strict';
require('reflect-metadata');
require('@nestjs/common').Logger.overrideLogger(false);
const { MockLanguageModelV3 } = require('ai/test');
const { convertArrayToReadableStream } = require('@ai-sdk/provider-utils/test');
const { RequestContext } = require('@mastra/core/request-context');
const { setNativeTextMaxRetries } = require('./load-ts-module.cjs').loadTypeScriptModule('libraries/nestjs-libraries/src/openai/ai.native-retries.ts');
const { Agent } = require('@mastra/core/agent');
const assert = require('node:assert/strict');
const { loadCapabilityModule } = require('./agent-capabilities.cjs');
const { NativeToolCallLifecycleProcessor } = loadCapabilityModule('../conductor/native-tool-call-lifecycle.ts');
const { z } = require('zod');
const usage = { inputTokens: { total: 5, noCache: 5, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 5, text: 5, reasoning: 0 } };
async function main() {
  const report=[];
  for (const mode of ['incomplete', 'zero-retry', 'exhausted', 'mixed', 'unknown', 'invalid']) {
    let calls=0,writes=0;
    const model=new MockLanguageModelV3({doStream:async()=>{
      calls++;
      const chunks = calls > 1 && mode !== 'exhausted' ? [{type:'text-start',id:'answer'},{type:'text-delta',id:'answer',delta:'Recovered.'},{type:'text-end',id:'answer'}]
       : ['incomplete','zero-retry','exhausted','mixed'].includes(mode) ? [{type:'tool-input-start',id:'broken',toolName:'test_read'},{type:'tool-input-delta',id:'broken',delta:'{"value":'}]
       : [{type:'tool-call',toolCallId:'broken',toolName:mode==='unknown'?'missing_tool':'test_read',input:mode==='invalid'?'{}':'{"value":"read"}'}];
      return {stream:convertArrayToReadableStream([{type:'stream-start',warnings:[]},...(mode==='mixed'&&calls===1?[{type:'tool-call',toolCallId:'complete-peer',toolName:'test_read',input:'{"value":"complete"}'}]:[]),...chunks,{type:'finish',finishReason:{unified:calls>1&&mode!=='exhausted'?'stop':'tool-calls',raw:calls>1&&mode!=='exhausted'?'stop':'tool_calls'},usage}])};
    }});
    const events=[];
    const agent=new Agent({id:'native-incomplete-probe',name:'Native incomplete tool probe',instructions:'Use tools when needed.',model,outputProcessors:[new NativeToolCallLifecycleProcessor()],maxProcessorRetries:2,tools:{test_read:{id:'test_read',description:'Read a value.',inputSchema:z.object({value:z.string()}),execute:async()=>{writes++;return {ok:true};}}}});
    const requestContext=new RequestContext(); setNativeTextMaxRetries(requestContext,mode==='zero-retry'?0:1);
    const stream=await agent.stream('Read the value.',{maxSteps:3,requestContext});
    for await(const chunk of stream.fullStream)events.push({type:chunk.type,...(chunk.type==='error'?{error:String(chunk.payload?.error?.message??'').slice(0,100)}:{})});
    const finish=await stream.finishReason;
    assert.equal(calls,['zero-retry','mixed'].includes(mode)?1:2); assert.equal(writes,mode==='mixed'?1:0); assert.equal(finish,['zero-retry','exhausted','mixed'].includes(mode)?'tripwire':'stop');
    report.push({mode,calls,writes,finish,events});
  }
  return report;
}
if(require.main===module)main().then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(e);process.exitCode=1;});
module.exports={main};
