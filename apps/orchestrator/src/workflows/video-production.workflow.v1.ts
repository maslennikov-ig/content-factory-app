import { continueAsNew, proxyActivities, sleep } from '@temporalio/workflow';
import type { VideoProductionActivityV1, VideoProductionInputV1 } from '../activities/video-production.activity.v1';
const {stepVideoProductionV1}=proxyActivities<VideoProductionActivityV1>({taskQueue:'main',startToCloseTimeout:'5 minutes',retry:{maximumAttempts:1}});
/** Additive coordinator; existing generation/subscription history contracts are unchanged. */
export async function videoProductionWorkflowV1(input:VideoProductionInputV1):Promise<{state:string;done:boolean}>{
  for(let i=0;i<100;i++){
    try{const result=await stepVideoProductionV1(input);if(result.done)return result;}catch{/* Durable job state owns recovery and submit uncertainty. */}
    await sleep(15000);
  }
  return continueAsNew(input);
}
