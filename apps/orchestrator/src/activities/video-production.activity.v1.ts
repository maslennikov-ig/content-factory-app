import { Injectable } from '@nestjs/common';
import { Activity, ActivityMethod } from 'nestjs-temporal-core';
import { VideoProductionService } from '@contentfactory/nestjs-libraries/videos/production/video-production.service';
export type VideoProductionInputV1={organizationId:string;revisionId:string};
@Injectable()
@Activity()
export class VideoProductionActivityV1 {
  constructor(private readonly productions:VideoProductionService){}
  @ActivityMethod()
  async stepVideoProductionV1(input:VideoProductionInputV1){
    try{return await this.productions.runStep(input.organizationId,input.revisionId);}
    catch{throw new Error('VIDEO_PRODUCTION_STEP_UNAVAILABLE');}
  }
}
