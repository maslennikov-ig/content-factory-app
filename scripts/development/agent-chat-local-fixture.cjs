#!/usr/bin/env node
'use strict';
const fixture=require('../../tests/helpers/agent-chat-domain-runtime.cjs');
(async()=>{
 if(process.argv[2]==='prepare'){process.stdout.write(JSON.stringify({result:'PREPARED',...await fixture.prepare()})+'\n');return;}
 if(process.argv[2]!=='serve'||!process.argv[3])throw new Error('Use prepare or serve /tmp/cf-chat-5961-*/stand.json');
 const runtime=await fixture.start(process.argv[3]);
 process.stdout.write(JSON.stringify({result:'READY',port:3496,privateStand:process.argv[3]})+'\n');
 for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>runtime.close().then(()=>process.exit(0)));
})().catch(error=>{process.stderr.write(`${error.stack}\n`);process.exit(1);});
