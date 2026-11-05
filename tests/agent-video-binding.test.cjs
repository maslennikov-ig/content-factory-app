const {execFileSync}=require('node:child_process');
const path=require('node:path');
test('native HTTP video binding appends current refs under one backend lock and preserves native metadata',()=>{
 const output=execFileSync(process.execPath,[path.join(__dirname,'helpers/agent-video-binding-native.cjs')],{encoding:'utf8',timeout:30000});
 expect(JSON.parse(output)).toEqual({passed:true,concurrentBindings:2,foreignThreadDenied:true,invalidRefsNoMutation:true,capacityNoEviction:true,sharedReferenceNotSpendAuthority:true,nativeMemoryPreserved:true});
},35000);
