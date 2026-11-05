import { Injectable } from '@nestjs/common';
import { compositionHashV1 } from './providers/composition/composition-http.v1';
import { VideoProviderErrorV1 } from './video-provider.v1';
import type { VideoCredentialV1, VideoPreparedRequestV1, VideoProviderInputV1, VideoProviderReceiptV1, VideoProviderStatusV1, VideoProviderV1, VideoRouteV1 } from './video-provider.v1';
import type { CompositionPreparedRequestV1, CompositionReceiptV1 } from './providers/composition/composition-provider.v1';
import { HeygenStudioCompositionProviderV1 } from './providers/composition/heygen-studio.provider.v1';
import { HyperframesCompositionProviderV1 } from './providers/composition/hyperframes.provider.v1';

export type VideoCompositionRequestV1 = VideoPreparedRequestV1 & {composition:CompositionPreparedRequestV1};
type Receipt = VideoProviderReceiptV1 & {composition:CompositionReceiptV1};
/** Uses the existing VideoGenerationJob admission/lease/import engine. No second job lifecycle. */
@Injectable()
export class VideoCompositionProviderV1 implements VideoProviderV1 {
  readonly id='heygen' as const;
  readonly routes:readonly VideoRouteV1[]=[];
  constructor(private readonly studio:HeygenStudioCompositionProviderV1,private readonly hyperframes:HyperframesCompositionProviderV1){}
  private adapter(route:string){
    if(route==='heygen-studio') return this.studio;
    if(route==='hyperframes') return this.hyperframes;
    throw new VideoProviderErrorV1('video_composition_route_invalid');
  }
  async prepare(_input:VideoProviderInputV1,_credential:VideoCredentialV1):Promise<VideoPreparedRequestV1>{
    throw new VideoProviderErrorV1('video_composition_requires_production_revision');
  }
  static wrap(request:CompositionPreparedRequestV1):VideoCompositionRequestV1 {
    return {provider:'heygen',endpoint:request.endpoint,body:request.body as Record<string,unknown>,estimate:request.estimate,composition:request};
  }
  async submit(request:VideoPreparedRequestV1,key:string,credential:VideoCredentialV1):Promise<VideoProviderReceiptV1>{
    const composition=(request as VideoCompositionRequestV1).composition;
    if(!composition||request.provider!=='heygen'||request.endpoint!==composition.endpoint||key!==composition.intentKey||compositionHashV1(request.body)!==compositionHashV1(composition.body)) throw new VideoProviderErrorV1('video_composition_snapshot_mismatch');
    const result=await this.adapter(composition.route).submit(composition,credential);
    return {id:result.id,statusUrl:result.statusUrl,composition:result} as Receipt;
  }
  async poll(receipt:VideoProviderReceiptV1,credential:VideoCredentialV1):Promise<VideoProviderStatusV1>{
    const composition=(receipt as Receipt).composition;
    if(!composition||receipt.id!==composition.id||receipt.statusUrl!==composition.statusUrl) throw new VideoProviderErrorV1('video_composition_receipt_mismatch');
    const result=await this.adapter(composition.route).poll(composition,credential);
    return {...result,...(result.state==='succeeded'&&composition.captions?{captionsBurned:true}:{}),...(result.durationSeconds!==undefined?{duration:result.durationSeconds}:{})};
  }
}
