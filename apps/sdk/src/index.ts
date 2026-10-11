import type { CreatePostDto } from '@contentfactory/nestjs-libraries/dtos/posts/create.post.dto';
import type { GetPostsDto } from '@contentfactory/nestjs-libraries/dtos/posts/get.posts.dto';
import fetch, { FormData, Response } from 'node-fetch';

export interface ContentFactoryOptions {
  /** Default retains JSON error payloads, including the documented 409. */
  httpErrors?: 'legacy' | 'throw';
}

export class ContentFactoryHttpError extends Error {
  readonly code?: string;
  readonly retryable: boolean;

  constructor(
    readonly status: number,
    readonly statusText: string,
    readonly body: unknown,
    readonly rawBody: string,
    /** Raw Retry-After header: seconds or an HTTP date; absent means unknown. */
    readonly retryAfter: string | null
  ) {
    super(`Content Factory HTTP ${status} ${statusText}`.trim());
    this.name = 'ContentFactoryHttpError';
    if (
      body &&
      typeof body === 'object' &&
      'code' in body &&
      typeof (body as { code?: unknown }).code === 'string'
    ) {
      this.code = (body as { code: string }).code;
    }
    this.retryable =
      status === 429 || status === 502 || status === 503 || status === 504;
  }
}

function toQueryString(obj: Record<string, any>): string {
  const params = new URLSearchParams();
  Object.entries(obj).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      params.append(key, String(value));
    }
  });
  return params.toString();
}

export default class ContentFactory {
  constructor(
    private _apiKey: string,
    // No default. This used to be the upstream product's own API, so anyone
    // taking this SDK without passing an address sent their API key to a
    // company that is not the one running their instance. Renaming the class
    // and putting this directory under the brand scanner is
    // content-factory-next-ry5.7.
    private _path: string,
    private _options: ContentFactoryOptions = {}
  ) {}

  private async checkResponse(response: Response): Promise<Response> {
    if (this._options.httpErrors === 'throw' && !response.ok) {
      const rawBody = await response.text();
      let body: unknown = rawBody;
      try {
        body = JSON.parse(rawBody);
      } catch {
        /* A gateway may return text. */
      }
      throw new ContentFactoryHttpError(
        response.status,
        response.statusText,
        body,
        rawBody,
        response.headers.get('retry-after')
      );
    }
    return response;
  }

  private async json(response: Promise<Response>): Promise<unknown> {
    return (await this.checkResponse(await response)).json();
  }

  async post(posts: CreatePostDto) {
    return this.json(
      fetch(`${this._path}/public/v1/posts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: this._apiKey,
        },
        body: JSON.stringify(posts),
      })
    );
  }

  async postList(filters: GetPostsDto) {
    return this.json(
      fetch(`${this._path}/public/v1/posts?${toQueryString(filters)}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: this._apiKey,
        },
      })
    );
  }

  async upload(file: Buffer, extension: string) {
    const formData = new FormData();
    const type =
      extension === 'png'
        ? 'image/png'
        : extension === 'jpg'
        ? 'image/jpeg'
        : extension === 'gif'
        ? 'image/gif'
        : extension === 'jpeg'
        ? 'image/jpeg'
        : 'image/jpeg';

    const blob = new Blob([file], { type });
    formData.append('file', blob, extension);

    return this.json(
      fetch(`${this._path}/public/v1/upload`, {
        method: 'POST',
        // @ts-ignore
        body: formData,
        headers: {
          Authorization: this._apiKey,
        },
      })
    );
  }

  async integrations() {
    return this.json(
      fetch(`${this._path}/public/v1/integrations`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: this._apiKey,
        },
      })
    );
  }

  async deletePost(id: string) {
    return this.checkResponse(
      await fetch(`${this._path}/public/v1/posts/${id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: this._apiKey,
        },
      })
    );
  }
}
