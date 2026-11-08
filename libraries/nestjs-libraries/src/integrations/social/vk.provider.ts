import { providerErrorDiagnostic } from './provider-error-diagnostic';
import {
  AuthTokenDetails,
  PostDetails,
  PostResponse,
  SocialProvider,
} from '@contentfactory/nestjs-libraries/integrations/social/social.integrations.interface';
import { makeId } from '@contentfactory/nestjs-libraries/services/make.is';
import dayjs from 'dayjs';
import { BadBody, RefreshToken, SocialAbstract } from '@contentfactory/nestjs-libraries/integrations/social.abstract';
import { createHash, randomBytes } from 'crypto';
import { openMediaUploadBlobs } from './media-upload-sources';
import { Integration } from '@prisma/client';
import { hasExtension } from '@contentfactory/helpers/utils/has.extension';

export class VkProvider extends SocialAbstract implements SocialProvider {
  override maxConcurrentJob = 2; // VK has moderate API limits
  identifier = 'vk';
  name = 'VK';
  isBetweenSteps = false;
  scopes = [
    'vkid.personal_info',
    'email',
    'wall',
    'status',
    'docs',
    'photos',
    'video',
  ];

  editor = 'normal' as const;
  maxLength() {
    return 2048;
  }

  async refreshToken(refresh: string): Promise<AuthTokenDetails> {
    const [oldRefreshToken, device_id] = refresh.split('&&&&');
    const formData = new FormData();
    formData.append('grant_type', 'refresh_token');
    formData.append('refresh_token', oldRefreshToken);
    formData.append('client_id', process.env.VK_ID!);
    formData.append('device_id', device_id);
    formData.append('state', makeId(32));
    formData.append('scope', this.scopes.join(' '));

    const { access_token, refresh_token, expires_in } = await (
      await this.fetch('https://id.vk.ru/oauth2/auth', {
        method: 'POST',
        body: formData,
      })
    ).json();

    const newFormData = new FormData();
    newFormData.append('client_id', process.env.VK_ID!);
    newFormData.append('access_token', access_token);

    const {
      user: { user_id, first_name, last_name, avatar },
    } = await (
      await this.fetch('https://id.vk.ru/oauth2/user_info', {
        method: 'POST',
        body: newFormData,
      })
    ).json();

    return {
      id: user_id,
      name: first_name + ' ' + last_name,
      accessToken: access_token,
      refreshToken: refresh_token + '&&&&' + device_id,
      expiresIn: dayjs().add(expires_in, 'seconds').unix() - dayjs().unix(),
      picture: avatar || '',
      username: first_name.toLowerCase(),
    };
  }

  async generateAuthUrl() {
    const state = makeId(32);
    const codeVerifier = randomBytes(64).toString('base64url');
    const challenge = Buffer.from(
      createHash('sha256').update(codeVerifier).digest()
    )
      .toString('base64')
      .replace(/=*$/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

    return {
      url:
        'https://id.vk.ru/authorize' +
        `?response_type=code` +
        `&client_id=${process.env.VK_ID}` +
        `&code_challenge_method=S256` +
        `&code_challenge=${challenge}` +
        `&redirect_uri=${encodeURIComponent(
          `${process?.env.FRONTEND_URL}/integrations/social/vk`
        )}` +
        `&state=${state}` +
        `&scope=${encodeURIComponent(this.scopes.join(' '))}`,
      codeVerifier,
      state,
    };
  }

  async authenticate(params: {
    code: string;
    codeVerifier: string;
    refresh?: string;
  }) {
    const [code, device_id] = params.code.split('&&&&');

    const formData = new FormData();
    formData.append('client_id', process.env.VK_ID!);
    formData.append('grant_type', 'authorization_code');
    formData.append('code_verifier', params.codeVerifier);
    formData.append('device_id', device_id);
    formData.append('code', code);
    formData.append(
      'redirect_uri',
      `${process?.env.FRONTEND_URL}/integrations/social/vk`
    );

    const { access_token, scope, refresh_token, expires_in } = await (
      await this.fetch('https://id.vk.ru/oauth2/auth', {
        method: 'POST',
        body: formData,
      })
    ).json();

    const newFormData = new FormData();
    newFormData.append('client_id', process.env.VK_ID!);
    newFormData.append('access_token', access_token);

    const {
      user: { user_id, first_name, last_name, avatar },
    } = await (
      await this.fetch('https://id.vk.ru/oauth2/user_info', {
        method: 'POST',
        body: newFormData,
      })
    ).json();

    return {
      id: user_id,
      name: first_name + ' ' + last_name,
      accessToken: access_token,
      refreshToken: refresh_token + '&&&&' + device_id,
      expiresIn: dayjs().add(expires_in, 'seconds').unix() - dayjs().unix(),
      picture: avatar || '',
      username: first_name.toLowerCase(),
    };
  }

  override handleErrors(body: string, status = 0) {
    return providerErrorDiagnostic('vk', body, status);
  }

  private checkApiError(all: any) {
    if (!all?.error) return;
    const diagnostic = providerErrorDiagnostic('vk', all);
    // Retain only a numeric code; VK request_params can contain the access token.
    const safe = JSON.stringify({ error: { error_code: Number(all.error.error_code) || 0 } });
    if (diagnostic.type === 'refresh-token') throw new RefreshToken(this.identifier, safe, '{}', diagnostic.value);
    if (diagnostic.type === 'retry') throw new Error(diagnostic.value);
    throw new BadBody(this.identifier, safe, '{}', diagnostic.value);
  }

  private requireReceipt(value: unknown) {
    if (!/^[1-9]\d*$/.test(String(value ?? ''))) {
      throw new BadBody(this.identifier, '{}', '{}', providerErrorDiagnostic('vk', {}).value);
    }
    return String(value);
  }

  private async uploadMedia(
    userId: string,
    accessToken: string,
    post: PostDetails
  ): Promise<{ id: string; ownerId: string; type: string }[]> {
    return await Promise.all((post.media || []).map(async media => {
      const video = hasExtension(media.path, 'mp4');
      const all = await (await this.fetch(video
        ? `https://api.vk.ru/method/video.save?access_token=${accessToken}&v=5.251`
        : `https://api.vk.ru/method/photos.getWallUploadServer?owner_id=${userId}&access_token=${accessToken}&v=5.251`)).json();
      this.checkApiError(all);
      if (!all.response?.upload_url) this.requireReceipt(undefined);
      const opened = await openMediaUploadBlobs([{path: media.path}]);
      const filename = media.path.split('/').at(-1);
      const form = new FormData();
      form.append(video ? 'video_file' : 'photo', opened.files[0].blob, filename);
      let value: any;
      try {
        value = await (await this.fetch(all.response.upload_url, { method: 'POST', body: form })).json();
      } catch {
        throw new BadBody(this.identifier, '{}', '{}', providerErrorDiagnostic('vk', {}).value);
      } finally {
        await opened.close();
      }
      this.checkApiError(value);
      if (video) {
        // Both reservation and upload must confirm the same video before wall.post.
        const id = this.requireReceipt(value?.video_id);
        if (String(all.response.video_id) !== id) this.requireReceipt(undefined);
        const ownerId = String(value?.owner_id ?? all.response.owner_id ?? '');
        if (!/^-?[1-9]\d*$/.test(ownerId)) this.requireReceipt(undefined);
        return { id, ownerId, type: 'video' };
      }
      if (!value?.photo || !value?.server || !value?.hash) this.requireReceipt(undefined);
      const formSend = new FormData();
      formSend.append('photo', value.photo);
      formSend.append('server', String(value.server));
      formSend.append('hash', value.hash);
      const saved = await (await this.fetch(`https://api.vk.ru/method/photos.saveWallPhoto?access_token=${accessToken}&v=5.251`, { method: 'POST', body: formSend })).json();
      this.checkApiError(saved);
      const photo = saved.response?.[0];
      const id = this.requireReceipt(photo?.id);
      const ownerId = String(photo?.owner_id ?? userId);
      if (!/^-?[1-9]\d*$/.test(ownerId)) this.requireReceipt(undefined);
      return { id, ownerId, type: 'photo' };
    }));
  }

  async post(
    userId: string,
    accessToken: string,
    postDetails: PostDetails[]
  ): Promise<PostResponse[]> {
    const [firstPost] = postDetails;

    // Upload media for the first post
    const mediaList = await this.uploadMedia(userId, accessToken, firstPost);

    const body = new FormData();
    body.append('message', firstPost.message);

    if (mediaList.length) {
      body.append(
        'attachments',
        mediaList.map((p) => `${p.type}${p.ownerId}_${p.id}`).join(',')
      );
    }

    const all = await (
      await this.fetch(
        `https://api.vk.ru/method/wall.post?v=5.251&access_token=${accessToken}&client_id=${process.env.VK_ID}`,
        {
          method: 'POST',
          body,
        }
      )
    ).json();
    this.checkApiError(all);
    const { response } = all;
    this.requireReceipt(response?.post_id);

    return [
      {
        id: firstPost.id,
        postId: String(response?.post_id),
        releaseURL: `https://vk.com/feed?w=wall${userId}_${response?.post_id}`,
        status: 'completed',
      },
    ];
  }

  async comment(
    userId: string,
    postId: string,
    lastCommentId: string | undefined,
    accessToken: string,
    postDetails: PostDetails[],
    integration: Integration
  ): Promise<PostResponse[]> {
    const [commentPost] = postDetails;

    // Upload media for the comment
    const mediaList = await this.uploadMedia(userId, accessToken, commentPost);

    const body = new FormData();
    body.append('message', commentPost.message);
    body.append('post_id', postId);

    if (mediaList.length) {
      body.append(
        'attachments',
        mediaList.map((p) => `${p.type}${p.ownerId}_${p.id}`).join(',')
      );
    }

    const all = await (
      await this.fetch(
        `https://api.vk.ru/method/wall.createComment?v=5.251&access_token=${accessToken}&client_id=${process.env.VK_ID}`,
        {
          method: 'POST',
          body,
        }
      )
    ).json();
    this.checkApiError(all);
    const { response } = all;
    this.requireReceipt(response?.comment_id);

    return [
      {
        id: commentPost.id,
        postId: String(response?.comment_id),
        releaseURL: `https://vk.com/feed?w=wall${userId}_${postId}`,
        status: 'completed',
      },
    ];
  }
}
