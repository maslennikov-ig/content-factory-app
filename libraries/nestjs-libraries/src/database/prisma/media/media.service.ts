import { HttpException, Injectable } from '@nestjs/common';
import { MediaRepository } from '@contentfactory/nestjs-libraries/database/prisma/media/media.repository';
import { OpenaiService } from '@contentfactory/nestjs-libraries/openai/openai.service';
import { generationError } from '@contentfactory/nestjs-libraries/openai/generation.error';
import { SubscriptionService } from '@contentfactory/nestjs-libraries/database/prisma/subscriptions/subscription.service';
import { Organization } from '@prisma/client';
import { SaveMediaInformationDto } from '@contentfactory/nestjs-libraries/dtos/media/save.media.information.dto';
import { VideoManager } from '@contentfactory/nestjs-libraries/videos/video.manager';
import { VideoDto } from '@contentfactory/nestjs-libraries/dtos/videos/video.dto';
import { UploadFactory } from '@contentfactory/nestjs-libraries/upload/upload.factory';
import { generatedPictureName } from '@contentfactory/nestjs-libraries/database/prisma/media/image-prompt';
import {
  AuthorizationActions,
  Sections,
  SubscriptionException,
} from '@contentfactory/backend/services/auth/permissions/permission.exception.class';

@Injectable()
export class MediaService {
  private storage = UploadFactory.createStorage();

  constructor(
    private _mediaRepository: MediaRepository,
    private _openAi: OpenaiService,
    private _subscriptionService: SubscriptionService,
    private _videoManager: VideoManager
  ) {}

  async deleteMedia(org: string, id: string) {
    return this._mediaRepository.deleteMedia(org, id);
  }

  getMediaById(org: string, id: string) {
    return this._mediaRepository.getMediaById(org, id);
  }

  /**
   * One picture, one AI operation and one image credit row (taken back when
   * drawing fails). With `generatePromptFirst` the description is turned
   * into a picture prompt first, inside the same `image_generation`
   * operation (owner 28.09.2026, `content-factory-next-kcxz.44`).
   */
  async generateImage(
    prompt: string,
    org: Organization,
    generatePromptFirst?: boolean
  ) {
    try {
      return await this._subscriptionService.useCredit(
        org,
        'ai_images',
        () =>
          generatePromptFirst
            ? this._openAi.generateImageFromDescription(org.id, prompt)
            : this._openAi.generateImage(org.id, prompt)
      );
    } catch (err) {
      throw generationError(err);
    }
  }

  /**
   * Whether the workspace may generate a picture now. The inherited image credits
   * (`pricing[tier].image_generation_count` a month) are a limit only where
   * billing is configured (`STRIPE_PUBLISHABLE_KEY`); without it — our
   * instance — the credit row is only a count and the allowance of AI
   * operations is what limits generation. One rule for the doors and the chat.
   */
  async imageCreditsLeft(org: Organization) {
    const total = await this._subscriptionService.checkCredits(org);
    return !(process.env.STRIPE_PUBLISHABLE_KEY && total.credits <= 0);
  }

  /**
   * A generated picture saved into the workspace's media library — what
   * `POST /media/generate-image-with-prompt` answers, and what the chat's
   * `media.generate` calls (`content-factory-next-kcxz.25`). `false`: the
   * image credits are spent (checked before anything is admitted or paid).
   *
   * `describe` is the door's picture-prompt step: a model call turns the
   * description into a renderer prompt before the image is drawn, inside the
   * one `image_generation` operation — one AI operation and one image credit
   * row a picture (`kcxz.44`).
   */
  async generateImageIntoLibrary(
    org: Organization,
    prompt: string,
    describe = true
  ) {
    if (!(await this.imageCreditsLeft(org))) return false;
    const image = await this.generateImage(prompt, org, describe);
    let file: string;
    try {
      file = await this.storage.uploadSimple('data:image/png;base64,' + image);
    } catch (error) {
      // The operation is paid by now; the refusal is passed on as it is.
      throw generationError(error);
    }
    // Named by the first words it was asked to show, so the library's search
    // finds it (review W4-25 F11); the stored name stays the file's own.
    return this.saveFile(
      org.id,
      file.split('/').pop() as string,
      file,
      generatedPictureName(prompt)
    );
  }

  /**
   * `generateImageIntoLibrary` for a caller that holds only the workspace id
   * (the agent's capability, whose identity carries primitives only): the
   * subscription is read as the web request's organization carries it
   * (`getOrgsByUserId`'s include, review W4-25 F8), so the credits rule reads
   * the same tier and window as the door.
   */
  async generateImageIntoLibraryFor(organizationId: string, prompt: string) {
    const subscription =
      await this._subscriptionService.getSubscriptionAsOrganizationCarries(
        organizationId
      );
    return this.generateImageIntoLibrary(
      { id: organizationId, subscription } as unknown as Organization,
      prompt
    );
  }

  /** The library's newest items, for a reader that needs no page math. */
  recentMedia(org: string, search?: string) {
    return this._mediaRepository.getMedia(org, 1, search);
  }

  /** Library items of the workspace by id, deleted ones not included. */
  mediaInWorkspace(org: string, ids: string[]) {
    return this._mediaRepository.getLiveMediaByIds(org, ids);
  }

  saveFile(org: string, fileName: string, filePath: string, originalName?: string) {
    return this._mediaRepository.saveFile(org, fileName, filePath, originalName);
  }

  getMedia(org: string, page: number, search?: string) {
    return this._mediaRepository.getMedia(org, page, search);
  }

  saveMediaInformation(org: string, data: SaveMediaInformationDto) {
    return this._mediaRepository.saveMediaInformation(org, data);
  }

  getVideoOptions() {
    return this._videoManager.getAllVideos();
  }

  async generateVideoAllowed(org: Organization, type: string) {
    const video = this._videoManager.getVideoByName(type);
    if (!video) {
      throw new Error(`Video type ${type} not found`);
    }

    if (!video.trial && org.isTrailing) {
      throw new HttpException('This video is not available in trial mode', 406);
    }

    return true;
  }

  async generateVideo(org: Organization, body: VideoDto) {
    try {
      const totalCredits = await this._subscriptionService.checkCredits(
        org,
        'ai_videos'
      );

      if (totalCredits.credits <= 0) {
        throw new SubscriptionException({
          action: AuthorizationActions.Create,
          section: Sections.VIDEOS_PER_MONTH,
        });
      }

      const video = this._videoManager.getVideoByName(body.type);
      if (!video) {
        throw new Error(`Video type ${body.type} not found`);
      }

      if (!video.trial && org.isTrailing) {
        throw new HttpException(
          'This video is not available in trial mode',
          406
        );
      }

      console.log(body.customParams);
      await video.instance.processAndValidate(body.customParams);
      console.log('no err');

      return await this._subscriptionService.useCredit(
        org,
        'ai_videos',
        async () => {
          const loadedData = await video.instance.process(
            org.id,
            body.output,
            body.customParams
          );

          const file = await this.storage.uploadSimple(loadedData);
          return this.saveFile(org.id, file.split('/').pop(), file);
        }
      );
    } catch (err) {
      throw generationError(err);
    }
  }

  async videoFunction(identifier: string, functionName: string, body: any) {
    const video = this._videoManager.getVideoByName(identifier);
    if (!video) {
      throw new Error(`Video with identifier ${identifier} not found`);
    }

    // @ts-ignore
    const functionToCall = video.instance[functionName];
    if (
      typeof functionToCall !== 'function' ||
      this._videoManager.checkAvailableVideoFunction(functionToCall)
    ) {
      throw new HttpException(
        `Function ${functionName} not found on video instance`,
        400
      );
    }

    return functionToCall(body);
  }
}
