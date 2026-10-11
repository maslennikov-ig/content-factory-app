import ContentFactory, { ContentFactoryHttpError } from '../../../../apps/sdk/dist';

function queueConflict(value: unknown): value is { code: 'CF_QUEUE_BUSY'; message: string } {
  return !!value && typeof value === 'object' &&
    'code' in value && value.code === 'CF_QUEUE_BUSY' &&
    'message' in value && typeof value.message === 'string';
}

const payload = {
  type: 'draft' as const, shortLink: false, date: '2030-01-01T00:00:00.000Z',
  tags: [], posts: [],
};

/** The original two-argument client and guarded unknown JSON remain usable. */
export async function legacy409(baseUrl: string): Promise<string> {
  const legacy = new ContentFactory('offline-sdk-consumer-fixture', baseUrl);
  const response = await legacy.post(payload);
  if (queueConflict(response)) return response.code;
  throw new Error('Expected documented JSON 409 payload');
}

export async function strict409(baseUrl: string): Promise<number> {
  const strict = new ContentFactory('offline-sdk-consumer-fixture', baseUrl, { httpErrors: 'throw' });
  try {
    await strict.post(payload);
  } catch (error: unknown) {
    if (error instanceof ContentFactoryHttpError) {
      const status: number = error.status;
      const code: string | undefined = error.code;
      const retryAfter: string | null = error.retryAfter;
      const retryable: boolean = error.retryable;
      const body: unknown = error.body;
      if (status === 409 && code === 'CF_QUEUE_BUSY' && !retryable &&
          retryAfter === null && queueConflict(body)) return status;
    }
    throw error;
  }
  throw new Error('Expected typed opt-in HTTP error');
}

/** Compile-only checks keep arbitrary JSON unknown, not silently any. */
function responseTyping(json: Awaited<ReturnType<ContentFactory['post']>>, error: ContentFactoryHttpError) {
  // @ts-expect-error JSON must be narrowed exactly as with the baseline SDK.
  const unguardedJsonCode = json.code;
  // @ts-expect-error Error bodies are also unvalidated transport input.
  const unguardedErrorCode = error.body.code;
  return [unguardedJsonCode, unguardedErrorCode];
}
