import { continueAsNew,proxyActivities,sleep } from '@temporalio/workflow';
import type { HggPilotStageActivityV1,HggPilotStageInputV1 } from '../activities/hgg-pilot-stage.activity.v1';
const {stepHggPilotStageV1,expireHggPilotStageV1}=proxyActivities<HggPilotStageActivityV1>({taskQueue:'main',startToCloseTimeout:'5 minutes',retry:{maximumAttempts:1}});
/** Additive pilot history. No native/provider/source data enters Temporal history. */
export async function hggPilotStageWorkflowV1(input:HggPilotStageInputV1,deadlineAt=Date.now()+86400000):Promise<{state:string;done:boolean}>{
 for(let i=0;i<100 && Date.now()<deadlineAt;i++){
  try{const result=await stepHggPilotStageV1(input);if(result.done)return result;}catch{/* Domain retains the original intent and unknown submit. */}
  await sleep(10000);
 }
 if(Date.now()>=deadlineAt){try{const result=await expireHggPilotStageV1(input);if(result.done)return result;}catch{/* Retry the saved domain state, never a provider submit. */}await sleep(10000);}
 return continueAsNew(input,deadlineAt);
}
