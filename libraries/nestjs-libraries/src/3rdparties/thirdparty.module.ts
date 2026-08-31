import { Global, Module } from '@nestjs/common';
import { HeygenProvider } from '@contentfactory/nestjs-libraries/3rdparties/heygen/heygen.provider';
import { ReelFarmProvider } from '@contentfactory/nestjs-libraries/3rdparties/reelfarm/reelfarm.provider';
import { ThirdPartyManager } from '@contentfactory/nestjs-libraries/3rdparties/thirdparty.manager';

@Global()
@Module({
  providers: [HeygenProvider, ReelFarmProvider, ThirdPartyManager],
  get exports() {
    return this.providers;
  },
})
export class ThirdPartyModule {}
