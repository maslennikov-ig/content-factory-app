import { Injectable } from '@nestjs/common';
import { Activity,ActivityMethod } from 'nestjs-temporal-core';
import { HggPilotJobServiceV1 } from '@contentfactory/nestjs-libraries/videos/subscriptions/video-hgg-pilot-job.service.v1';
export type HggPilotStageInputV1={organizationId:string;jobId:string;runCycle:number};
@Injectable()
@Activity()
export class HggPilotStageActivityV1 {
 constructor(readonly jobs:HggPilotJobServiceV1){}
 @ActivityMethod() async stepHggPilotStageV1(input:HggPilotStageInputV1){try{return await this.jobs.runStep(input.organizationId,input.jobId,input.runCycle);}catch{throw new Error('VIDEO_PILOT_STEP_UNAVAILABLE');}}
 @ActivityMethod() async expireHggPilotStageV1(input:HggPilotStageInputV1){try{return await this.jobs.expire(input.organizationId,input.jobId,input.runCycle);}catch{throw new Error('VIDEO_PILOT_EXPIRY_UNAVAILABLE');}}
}
