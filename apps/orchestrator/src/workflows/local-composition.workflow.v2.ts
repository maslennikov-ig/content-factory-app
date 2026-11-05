import {continueAsNew,proxyActivities,sleep} from '@temporalio/workflow';
import type {LocalCompositionActivityInputV2,LocalCompositionActivityV2} from '../activities/local-composition.activity.v2';
const {stepLocalCompositionV2}=proxyActivities<LocalCompositionActivityV2>({taskQueue:'main',startToCloseTimeout:'35 minutes',heartbeatTimeout:'1 minute',retry:{maximumAttempts:1}});
/** New history only. Existing generation/production V1 activities are immutable. */
export async function localCompositionWorkflowV2(input:LocalCompositionActivityInputV2):Promise<{state:string;done:boolean}>{
 for(let i=0;i<100;i++){
  try{const result=await stepLocalCompositionV2(input);if(result.done)return result;}catch{/* Persisted local checkpoints and leases own recovery; no provider submit. */}
  await sleep(15_000);
 }
 return continueAsNew(input);
}
