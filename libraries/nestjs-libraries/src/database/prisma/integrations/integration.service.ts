import {
  forwardRef,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import { IntegrationRepository } from '@contentfactory/nestjs-libraries/database/prisma/integrations/integration.repository';
import { IntegrationManager } from '@contentfactory/nestjs-libraries/integrations/integration.manager';
import {
  AnalyticsData,
  SocialProvider,
} from '@contentfactory/nestjs-libraries/integrations/social/social.integrations.interface';
import { Integration, Organization } from '@prisma/client';
import { NotificationService } from '@contentfactory/nestjs-libraries/database/prisma/notifications/notification.service';
import dayjs from 'dayjs';
import { timer } from '@contentfactory/helpers/utils/timer';
import { ioRedis } from '@contentfactory/nestjs-libraries/redis/redis.service';
import { RefreshToken } from '@contentfactory/nestjs-libraries/integrations/social.abstract';
import { IntegrationTimeDto } from '@contentfactory/nestjs-libraries/dtos/integrations/integration.time.dto';
import { UploadFactory } from '@contentfactory/nestjs-libraries/upload/upload.factory';
import { PlugDto } from '@contentfactory/nestjs-libraries/dtos/plugs/plug.dto';
import { difference, uniq } from 'lodash';
import utc from 'dayjs/plugin/utc';
import { AutopostRepository } from '@contentfactory/nestjs-libraries/database/prisma/autopost/autopost.repository';
import { RefreshIntegrationService } from '@contentfactory/nestjs-libraries/integrations/refresh.integration.service';
import { TemporalService } from 'nestjs-temporal-core';
import type { ContentLanguage } from '@contentfactory/nestjs-libraries/dtos/content.language';
import {
  CHANNEL_MIN_IDEAL_LENGTH,
  CHANNEL_NOTES_LIMIT,
  resolveChannelWritingProfile,
} from '@contentfactory/nestjs-libraries/content-intelligence/channels/channel-writing-profile';
import type {
  ChannelWritingProfileResponseV1,
  ChannelWritingProfileV1,
} from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice-wiring.contract';
import type { IntegrationWritingProfileDto } from '@contentfactory/nestjs-libraries/dtos/integrations/integration.writing.profile.dto';
import { AnalyticsSnapshotService } from '@contentfactory/nestjs-libraries/integrations/analytics.snapshot.service';

dayjs.extend(utc);

@Injectable()
export class IntegrationService {
  private storage = UploadFactory.createStorage();
  constructor(
    private _integrationRepository: IntegrationRepository,
    private _autopostsRepository: AutopostRepository,
    private _integrationManager: IntegrationManager,
    private _notificationService: NotificationService,
    @Inject(forwardRef(() => RefreshIntegrationService))
    private _refreshIntegrationService: RefreshIntegrationService,
    private _temporalService: TemporalService,
    private _analyticsSnapshotService: AnalyticsSnapshotService
  ) {}

  async changeActiveCron(orgId: string) {
    const data = await this._autopostsRepository.getAutoposts(orgId);

    for (const item of data.filter((f) => f.active)) {
      try {
        await this._temporalService.terminateWorkflow(`autopost-${item.id}`);
      } catch (err) {}
    }

    return true;
  }

  getMentions(platform: string, q: string) {
    return this._integrationRepository.getMentions(platform, q);
  }

  insertMentions(
    platform: string,
    mentions: { name: string; username: string; image: string }[]
  ) {
    return this._integrationRepository.insertMentions(platform, mentions);
  }

  async setTimes(
    orgId: string,
    integrationId: string,
    times: IntegrationTimeDto
  ) {
    return this._integrationRepository.setTimes(orgId, integrationId, times);
  }

  updateProviderSettings(org: string, id: string, additionalSettings: string) {
    return this._integrationRepository.updateProviderSettings(
      org,
      id,
      additionalSettings
    );
  }

  updateContentLanguage(
    org: string,
    id: string,
    contentLanguage: ContentLanguage
  ) {
    return this._integrationRepository.updateContentLanguage(
      org,
      id,
      contentLanguage
    );
  }

  /**
   * Карточка канала «Как пишем сюда» — вместе с тем, что о площадке знает
   * провайдер.
   *
   * Лимиты знаков и вид редактора спрашиваются у провайдера, а не хранятся:
   * `content-factory-next-tu3k.2` завёл одну колонку под решения человека, и
   * второе место для числа 4096 сделало бы их два, расходящихся при первом же
   * изменении у площадки.
   */
  async getWritingProfile(
    org: string,
    id: string
  ): Promise<ChannelWritingProfileResponseV1> {
    const integration = await this._integrationRepository.getWritingProfile(
      org,
      id
    );
    if (!integration) {
      throw new HttpException(
        { code: 'INTEGRATION_NOT_FOUND' },
        HttpStatus.NOT_FOUND
      );
    }
    return this.writingProfileResponse(integration);
  }

  /**
   * Сохранить карточку или (при `null`) вернуть канал к умолчаниям.
   *
   * Три проверки, и все три про то, что карточка не может обещать больше, чем
   * площадка принимает: пост короче `CHANNEL_MIN_IDEAL_LENGTH` — не пост, а
   * диапазон или потолок выше лимита площадки — обещание, которое кончится
   * отказом при публикации, а не при сохранении.
   */
  async updateWritingProfile(
    org: string,
    id: string,
    body: IntegrationWritingProfileDto | null
  ): Promise<ChannelWritingProfileResponseV1> {
    const integration = await this._integrationRepository.getWritingProfile(
      org,
      id
    );
    if (!integration) {
      throw new HttpException(
        { code: 'INTEGRATION_NOT_FOUND' },
        HttpStatus.NOT_FOUND
      );
    }

    const stored = body
      ? this.validatedWritingProfile(body, integration.providerIdentifier)
      : null;
    const saved = await this._integrationRepository.updateWritingProfile(
      org,
      id,
      stored
    );
    return this.writingProfileResponse(saved);
  }

  private providerLimits(providerIdentifier: string) {
    const provider = this._integrationManager.getSocialIntegration(
      providerIdentifier
    );
    if (!provider) {
      throw new HttpException(
        { code: 'INTEGRATION_PROVIDER_UNKNOWN' },
        HttpStatus.BAD_REQUEST
      );
    }
    return {
      name: provider.name,
      maxLength: provider.maxLength([]),
      maxCaptionLength: provider.maxCaptionLength?.() ?? null,
      editor: provider.editor,
    };
  }

  private writingProfileResponse(integration: {
    id: string;
    providerIdentifier: string;
    contentLanguage: string;
    writingProfile: unknown;
  }): ChannelWritingProfileResponseV1 {
    const { profile, stored } = resolveChannelWritingProfile(
      integration.writingProfile,
      integration.providerIdentifier,
      integration.contentLanguage
    );
    return {
      integrationId: integration.id,
      providerIdentifier: integration.providerIdentifier,
      provider: this.providerLimits(integration.providerIdentifier),
      profile,
      stored,
    };
  }

  private validatedWritingProfile(
    body: IntegrationWritingProfileDto,
    providerIdentifier: string
  ): ChannelWritingProfileV1 {
    const limits = this.providerLimits(providerIdentifier);
    const refuse = (reason: string) => {
      throw new HttpException(
        { code: 'CHANNEL_WRITING_PROFILE_INVALID', reason },
        HttpStatus.UNPROCESSABLE_ENTITY
      );
    };

    let lengthPolicy: ChannelWritingProfileV1['lengthPolicy'] = 'provider_max';
    if (body.lengthPolicy === 'range') {
      const range = body.length;
      if (!range) refuse('LENGTH_RANGE_REQUIRED');
      const { idealMin, idealMax, hardMax } = range!;
      if (idealMin < CHANNEL_MIN_IDEAL_LENGTH) refuse('IDEAL_MIN_TOO_SMALL');
      if (idealMax < idealMin) refuse('IDEAL_MAX_BELOW_MIN');
      // Потолок площадки — тот, который она примет без картинки: карточка
      // описывает канал целиком, а подпись под картинкой короче у всех.
      if (idealMax > limits.maxLength) refuse('IDEAL_MAX_ABOVE_PROVIDER');
      if (hardMax !== undefined && hardMax !== null) {
        if (hardMax < idealMax) refuse('HARD_MAX_BELOW_IDEAL_MAX');
        if (hardMax > limits.maxLength) refuse('HARD_MAX_ABOVE_PROVIDER');
      }
      lengthPolicy = {
        idealMin,
        idealMax,
        hardMax: hardMax === undefined ? null : hardMax,
      };
    }

    const notes = (body.notes ?? '').trim();
    if (notes.length > CHANNEL_NOTES_LIMIT) refuse('NOTES_TOO_LONG');

    return {
      version: 'channel-writing-profile/v1',
      lengthPolicy,
      emojiLevel: body.emojiLevel,
      linkPolicy: body.linkPolicy,
      hashtagPolicy: body.hashtagPolicy,
      ctaKind: body.ctaKind,
      formatPreference: body.formatPreference,
      notes: notes || null,
      output: 'text',
    };
  }

  checkPreviousConnections(org: string, id: string) {
    return this._integrationRepository.checkPreviousConnections(org, id);
  }

  async createOrUpdateIntegration(
    additionalSettings:
      | {
          title: string;
          description: string;
          type: 'checkbox' | 'text' | 'textarea';
          value: any;
          regex?: string;
        }[]
      | undefined,
    oneTimeToken: boolean,
    org: string,
    name: string,
    picture: string | undefined,
    type: 'article' | 'social',
    internalId: string,
    provider: string,
    token: string,
    refreshToken = '',
    expiresIn?: number,
    username?: string,
    isBetweenSteps = false,
    refresh?: string,
    timezone?: number,
    customInstanceDetails?: string
  ) {
    const uploadedPicture = picture
      ? picture?.indexOf('imagedelivery.net') > -1
        ? picture
        : await this.storage.uploadSimple(picture).catch((err) => {
            console.log('Failed to upload profile picture:', picture, err);
            return undefined;
          })
      : undefined;

    return this._integrationRepository.createOrUpdateIntegration(
      additionalSettings,
      oneTimeToken,
      org,
      name,
      uploadedPicture,
      type,
      internalId,
      provider,
      token,
      refreshToken,
      expiresIn,
      username,
      isBetweenSteps,
      refresh,
      timezone,
      customInstanceDetails
    );
  }

  updateIntegrationGroup(org: string, id: string, group: string) {
    return this._integrationRepository.updateIntegrationGroup(org, id, group);
  }

  updateOnCustomerName(org: string, id: string, name: string) {
    return this._integrationRepository.updateOnCustomerName(org, id, name);
  }

  getIntegrationsList(org: string) {
    return this._integrationRepository.getIntegrationsList(org);
  }

  getIntegrationsForChannelList(org: string) {
    return this._integrationRepository.getIntegrationsForChannelList(org);
  }

  getIntegrationForOrder(id: string, order: string, user: string, org: string) {
    return this._integrationRepository.getIntegrationForOrder(
      id,
      order,
      user,
      org
    );
  }

  updateNameAndUrl(id: string, name: string, url: string) {
    return this._integrationRepository.updateNameAndUrl(id, name, url);
  }

  getIntegrationById(org: string, id: string) {
    return this._integrationRepository.getIntegrationById(org, id);
  }

  async refreshToken(provider: SocialProvider, refresh: string) {
    try {
      const { refreshToken, accessToken, expiresIn } =
        await provider.refreshToken(refresh);

      if (!refreshToken || !accessToken || !expiresIn) {
        return false;
      }

      return { refreshToken, accessToken, expiresIn };
    } catch (e) {
      return false;
    }
  }

  async disconnectChannel(orgId: string, integration: Integration) {
    await this._integrationRepository.disconnectChannel(orgId, integration.id);
    await this.informAboutRefreshError(orgId, integration);
  }

  async informAboutRefreshError(
    orgId: string,
    integration: Integration,
    err = ''
  ) {
    await this._notificationService.inAppNotification(
      orgId,
      `Could not refresh your ${integration.providerIdentifier} channel ${err}`,
      `Could not refresh your ${integration.providerIdentifier} channel ${err}. Please go back to the system and connect it again ${process.env.FRONTEND_URL}/launches`,
      true,
      false,
      'info'
    );
  }

  async refreshNeeded(org: string, id: string) {
    return this._integrationRepository.refreshNeeded(org, id);
  }

  async setBetweenRefreshSteps(id: string) {
    return this._integrationRepository.setBetweenRefreshSteps(id);
  }

  async refreshTokens() {
    const integrations = await this._integrationRepository.needsToBeRefreshed();
    for (const integration of integrations) {
      const provider = this._integrationManager.getSocialIntegration(
        integration.providerIdentifier
      );

      const data = await this.refreshToken(provider, integration.refreshToken!);

      if (!data) {
        await this.informAboutRefreshError(
          integration.organizationId,
          integration
        );
        await this._integrationRepository.refreshNeeded(
          integration.organizationId,
          integration.id
        );
        return;
      }

      const { refreshToken, accessToken, expiresIn } = data;

      await this.createOrUpdateIntegration(
        undefined,
        !!provider.oneTimeToken,
        integration.organizationId,
        integration.name,
        undefined,
        'social',
        integration.internalId,
        integration.providerIdentifier,
        accessToken,
        refreshToken,
        expiresIn
      );
    }
  }

  async disableChannel(org: string, id: string) {
    return this._integrationRepository.disableChannel(org, id);
  }

  async enableChannel(org: string, totalChannels: number, id: string) {
    const integrations = (
      await this._integrationRepository.getIntegrationsList(org)
    ).filter((f) => !f.disabled);
    if (
      !!process.env.STRIPE_PUBLISHABLE_KEY &&
      integrations.length >= totalChannels
    ) {
      throw new Error('You have reached the maximum number of channels');
    }

    return this._integrationRepository.enableChannel(org, id);
  }

  async getPostsForChannel(org: string, id: string) {
    return this._integrationRepository.getPostsForChannel(org, id);
  }

  async deleteChannel(org: string, id: string) {
    return this._integrationRepository.deleteChannel(org, id);
  }

  async disableIntegrations(org: string, totalChannels: number) {
    return this._integrationRepository.disableIntegrations(org, totalChannels);
  }

  async checkForDeletedOnceAndUpdate(org: string, page: string) {
    return this._integrationRepository.checkForDeletedOnceAndUpdate(org, page);
  }

  async saveProviderPage(org: string, id: string, data: any) {
    const getIntegration = await this._integrationRepository.getIntegrationById(
      org,
      id
    );
    if (!getIntegration) {
      throw new HttpException('Integration not found', HttpStatus.NOT_FOUND);
    }
    if (!getIntegration.inBetweenSteps) {
      throw new HttpException('Invalid request', HttpStatus.BAD_REQUEST);
    }

    const provider = this._integrationManager.getSocialIntegration(
      getIntegration.providerIdentifier
    );

    if (!provider.fetchPageInformation) {
      throw new HttpException(
        'Provider does not support page selection',
        HttpStatus.BAD_REQUEST
      );
    }

    const getIntegrationInformation = await provider.fetchPageInformation(
      getIntegration.token,
      data
    );

    await this.checkForDeletedOnceAndUpdate(
      org,
      String(getIntegrationInformation.id)
    );
    await this._integrationRepository.updateIntegration(id, {
      picture: getIntegrationInformation.picture,
      internalId: String(getIntegrationInformation.id),
      organizationId: org,
      name: getIntegrationInformation.name,
      inBetweenSteps: false,
      token: getIntegrationInformation.access_token,
      profile: getIntegrationInformation.username,
    });

    return { success: true };
  }

  async checkAnalytics(
    org: Organization,
    integration: string,
    date: string,
    forceRefresh = false
  ): Promise<AnalyticsData[]> {
    const getIntegration = await this.getIntegrationById(org.id, integration);

    if (!getIntegration) {
      throw new Error('Invalid integration');
    }

    if (getIntegration.type !== 'social') {
      return [];
    }

    const integrationProvider = this._integrationManager.getSocialIntegration(
      getIntegration.providerIdentifier
    );

    if (
      dayjs(getIntegration?.tokenExpiration).isBefore(dayjs()) ||
      forceRefresh
    ) {
      const data = await this._refreshIntegrationService.refresh(
        getIntegration
      );
      if (!data) {
        return [];
      }

      const { accessToken } = data;

      if (accessToken) {
        getIntegration.token = accessToken;

        if (integrationProvider.refreshWait) {
          await timer(10000);
        }
      } else {
        await this.disconnectChannel(org.id, getIntegration);
        return [];
      }
    }

    const getIntegrationData = await ioRedis.get(
      `integration:${org.id}:${integration}:${date}`
    );
    if (getIntegrationData) {
      return JSON.parse(getIntegrationData);
    }

    if (integrationProvider.analytics) {
      try {
        const liveAnalytics = await integrationProvider.analytics(
          getIntegration.internalId,
          getIntegration.token,
          +date
        );
        const loadAnalytics = await this._analyticsSnapshotService.merge(
          getIntegration.id,
          +date,
          liveAnalytics
        );
        await ioRedis.set(
          `integration:${org.id}:${integration}:${date}`,
          JSON.stringify(loadAnalytics),
          'EX',
          !process.env.NODE_ENV || process.env.NODE_ENV === 'development'
            ? 1
            : 3600
        );
        return loadAnalytics;
      } catch (e) {
        if (e instanceof RefreshToken) {
          return this.checkAnalytics(org, integration, date, true);
        }
      }
    }

    return [];
  }

  customers(orgId: string) {
    return this._integrationRepository.customers(orgId);
  }

  getPlugsByIntegrationId(org: string, integrationId: string) {
    return this._integrationRepository.getPlugsByIntegrationId(
      org,
      integrationId
    );
  }

  async processInternalPlug(
    data: {
      post: string;
      originalIntegration: string;
      integration: string;
      plugName: string;
      orgId: string;
      delay: number;
      information: any;
    },
    forceRefresh = false
  ): Promise<any> {
    const originalIntegration =
      await this._integrationRepository.getIntegrationById(
        data.orgId,
        data.originalIntegration
      );

    const getIntegration = await this._integrationRepository.getIntegrationById(
      data.orgId,
      data.integration
    );

    if (!getIntegration || !originalIntegration) {
      return;
    }

    const getAllInternalPlugs = this._integrationManager
      .getInternalPlugs(getIntegration.providerIdentifier)
      .internalPlugs.find((p: any) => p.identifier === data.plugName);

    if (!getAllInternalPlugs) {
      return;
    }

    const getSocialIntegration = this._integrationManager.getSocialIntegration(
      getIntegration.providerIdentifier
    );

    // @ts-ignore
    await getSocialIntegration?.[getAllInternalPlugs.methodName]?.(
      getIntegration,
      originalIntegration,
      data.post,
      data.information
    );

    return;
  }

  async processPlugs(data: {
    plugId: string;
    postId: string;
    delay: number;
    totalRuns: number;
    currentRun: number;
  }) {
    const getPlugById = await this._integrationRepository.getPlug(data.plugId);
    if (!getPlugById) {
      return true;
    }

    const integration = this._integrationManager.getSocialIntegration(
      getPlugById.integration.providerIdentifier
    );

    // @ts-ignore
    const process = await integration[getPlugById.plugFunction](
      getPlugById.integration,
      data.postId,
      JSON.parse(getPlugById.data).reduce((all: any, current: any) => {
        all[current.name] = current.value;
        return all;
      }, {})
    );

    if (process) {
      return true;
    }

    if (data.totalRuns === data.currentRun) {
      return true;
    }

    return false;
  }

  async createOrUpdatePlug(
    orgId: string,
    integrationId: string,
    body: PlugDto
  ) {
    const { activated } = await this._integrationRepository.createOrUpdatePlug(
      orgId,
      integrationId,
      body
    );

    return {
      activated,
    };
  }

  async changePlugActivation(orgId: string, plugId: string, status: boolean) {
    const { id, integrationId, plugFunction } =
      await this._integrationRepository.changePlugActivation(
        orgId,
        plugId,
        status
      );

    return { id };
  }

  async getPlugs(orgId: string, integrationId: string) {
    return this._integrationRepository.getPlugs(orgId, integrationId);
  }

  async loadExisingData(
    methodName: string,
    integrationId: string,
    id: string[]
  ) {
    const exisingData = await this._integrationRepository.loadExisingData(
      methodName,
      integrationId,
      id
    );
    const loadOnlyIds = exisingData.map((p) => p.value);
    return difference(id, loadOnlyIds);
  }

  async findFreeDateTime(
    orgId: string,
    integrationsId?: string
  ): Promise<number[]> {
    const findTimes = await this._integrationRepository.getPostingTimes(
      orgId,
      integrationsId
    );
    return uniq(
      findTimes.reduce((all: any, current: any) => {
        return [
          ...all,
          ...JSON.parse(current.postingTimes).map(
            (p: { time: number }) => p.time
          ),
        ];
      }, [] as number[])
    );
  }
}
