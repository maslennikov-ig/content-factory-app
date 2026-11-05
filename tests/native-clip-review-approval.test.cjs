'use strict';
const {execFileSync}=require('node:child_process');
const path=require('node:path');
test('real native Session parks reference approval, declines safely and refuses creative delegation before one approved clip',()=>{
  const output=execFileSync(process.execPath,[path.join(__dirname,'helpers/native-clip-review-approval.probe.cjs')],{cwd:path.join(__dirname,'..'),encoding:'utf8',timeout:90000,env:{...process.env,NODE_ENV:'test',MASTRA_DATABASE_URL:'memory:clip-review-approval'}});
  const receipt=JSON.parse(output.trim().split('\n').filter(line=>line.startsWith('{"realNativePending":')).at(-1));
  expect(receipt).toMatchObject({realNativePending:true,declinePreservesPair:true,creativeAnswerRefused:true,approvedOnce:true,externalRequests:0,selectedPilotRestored:true});
},100000);
