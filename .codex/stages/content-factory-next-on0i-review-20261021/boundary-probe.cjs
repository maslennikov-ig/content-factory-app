'use strict';
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const filename = path.join(process.cwd(), 'tests/helpers/agent-durable-recovery.probe.cjs');
let source = fs.readFileSync(filename, 'utf8');
source = source.slice(0, source.indexOf('async function main()'));
source = source.replace(
  "const observePromise = controller.observeThread(ORG, USER, threadId, res2);",
  `const freshThreads = new stack.AgentThreadsService(mastraService, stack.claims.inProcessRunClaimStore());
   const freshController = new stack.AgentController(mastraService, freshThreads, aiUsage);
   const observePromise = freshController.observeThread(ORG, USER, threadId, res2);`);
source = source.replace("  assert.equal(observedText, 'Фоновая задача завершена.');", "  // Independent fresh-service observer: report actual result.");
source += `
async function receiptGap() {
  let writes = 0;
  const capability = {
    id:'piece.create',group:'content',door:loadConductorStack().sampleDoor,risk:'write',
    label:{ru:'Создать',en:'Create'},description:'Synthetic persisted domain write',
    input:z.object({title:z.string()}),untrusted:[],
    run:async()=>({id:'piece-'+(++writes)}),summarize:out=>({pieceId:out.id})
  };
  const memory = {getThreadById:async()=>({metadata:{}}),updateThread:async()=>{throw new Error('receipt storage unavailable')}};
  const results=[];
  for (let processIndex=0;processIndex<2;processIndex++) {
    const fresh = loadConductorStack();
    const tools = fresh.adapter.buildMastraCapabilityTools([capability], {services:()=>({}),gate:{check:async()=>({allowed:true,policies:[]})},language:'ru'});
    const {buildConductorContext} = loadTypeScriptModule(CONDUCTOR+'/conductor.context.ts');
    const requestContext = buildConductorContext({identity,threadId:'receipt-test-thread'});
    requestContext.set('mastra__durableExecutions',{'receipt-test-run':{}});
    results.push(await tools.piece_create.execute({title:'Receipt gap'},{runId:'receipt-test-run',memory,requestContext,agent:{threadId:'receipt-test-thread',toolCallId:'same-call'}}));
  }
  return {domainWrites:writes,results};
}
Promise.all([verifyObserverDisconnectAndReconnect(), receiptGap()]).then(([observer,receipt])=>console.log('REVIEW_RESULT='+JSON.stringify({observer,receipt}))).catch(e=>{console.error(e);process.exitCode=1});
`;
const mod = new Module(filename, module);
mod.filename = filename;
mod.paths = Module._nodeModulePaths(path.dirname(filename));
mod._compile(source, filename);
