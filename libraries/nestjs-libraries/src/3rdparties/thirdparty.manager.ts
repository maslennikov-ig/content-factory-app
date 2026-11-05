import { Injectable } from '@nestjs/common';
import {
  ThirdPartyAbstract,
  ThirdPartyParams,
} from '@contentfactory/nestjs-libraries/3rdparties/thirdparty.interface';
import { ModuleRef } from '@nestjs/core';
import { ThirdPartyService } from '@contentfactory/nestjs-libraries/database/prisma/third-party/third-party.service';
import { VIDEO_PROVIDERS_V1 } from '../videos/video-settings.v1';
import { thirdPartyHubV1, type HubPersonalChoicesV1 } from './thirdparty-hub.v1';

@Injectable()
export class ThirdPartyManager {
  constructor(
    private _moduleRef: ModuleRef,
    private _thirdPartyService: ThirdPartyService
  ) {}

  getAllThirdParties(): any[] {
    return (Reflect.getMetadata('third:party', ThirdPartyAbstract) || []).map(
      (p: any) => ({
        identifier: p.identifier,
        title: p.title,
        description: p.description,
        fields: p.fields || [],
      })
    );
  }

  async integrationHub(org: string, choices: HubPersonalChoicesV1) {
    return thirdPartyHubV1(this.getAllThirdParties(), await this.getAllThirdPartiesByOrganization(org), choices, VIDEO_PROVIDERS_V1);
  }

  getThirdPartyByName(
    identifier: string
  ): (ThirdPartyParams & { instance: ThirdPartyAbstract }) | undefined {
    const thirdParty = (
      Reflect.getMetadata('third:party', ThirdPartyAbstract) || []
    ).find((p: any) => p.identifier === identifier);

    return { ...thirdParty, instance: this._moduleRef.get(thirdParty.target) };
  }

  deleteIntegration(org: string, id: string) {
    return this._thirdPartyService.deleteIntegration(org, id);
  }

  getIntegrationById(org: string, id: string) {
    return this._thirdPartyService.getIntegrationById(org, id);
  }

  getAllThirdPartiesByOrganization(org: string) {
    return this._thirdPartyService.getAllThirdPartiesByOrganization(org);
  }

  saveIntegration(
    org: string,
    identifier: string,
    apiKey: string,
    data: { name: string; username: string; id: string }
  ) {
    return this._thirdPartyService.saveIntegration(
      org,
      identifier,
      apiKey,
      data
    );
  }
}
