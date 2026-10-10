import crypto from 'crypto';
import { ioRedis } from '@contentfactory/nestjs-libraries/redis/redis.service';

export type R2UploadOwner = { organizationId: string; userId: string };
export type R2Completion = { Key: string; Location: string; ETag?: string };
export type R2UploadSession = R2UploadOwner & {
  bucket: string;
  key: string;
  uploadId: string;
  expiresAt: number;
  completed?: R2Completion;
  aborted?: boolean;
};

export class R2UploadError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function requireUploadOwner(owner: R2UploadOwner) {
  if (!owner?.userId || !owner?.organizationId) {
    throw new R2UploadError(403, 'Upload session is unavailable.');
  }
}

function sessionKey(bucket: string, key: string, uploadId: string) {
  return (
    'r2_upload:v1:' +
    crypto
      .createHash('sha256')
      .update(JSON.stringify([bucket, key, uploadId]))
      .digest('hex')
  );
}

// The shared Redis client retries indefinitely. An upload request must still
// answer when that store is down; it cannot sign or call R2 while waiting.
async function sessionStoreRequest<T>(operation: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new R2UploadError(503, 'Upload session store is unavailable.')
            ),
          5000
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function storeUploadSession(session: R2UploadSession) {
  const seconds = Math.ceil((session.expiresAt - Date.now()) / 1000);
  if (seconds <= 0) throw new R2UploadError(403, 'Upload session has expired.');
  try {
    await sessionStoreRequest(
      ioRedis.set(
        sessionKey(session.bucket, session.key, session.uploadId),
        JSON.stringify(session),
        'EX',
        seconds
      )
    );
  } catch {
    throw new R2UploadError(503, 'Upload session store is unavailable.');
  }
}

/** A provider pair alone is not authority to access another person's upload. */
export async function ownedUploadSession(
  bucket: string,
  pair: { key?: string; uploadId?: string },
  owner: R2UploadOwner
): Promise<R2UploadSession> {
  requireUploadOwner(owner);
  if (
    typeof pair?.key !== 'string' ||
    !pair.key ||
    typeof pair.uploadId !== 'string' ||
    !pair.uploadId
  ) {
    throw new R2UploadError(403, 'Upload session is unavailable.');
  }
  let value: string | null;
  try {
    value = await sessionStoreRequest(
      ioRedis.get(sessionKey(bucket, pair.key, pair.uploadId))
    );
  } catch {
    throw new R2UploadError(503, 'Upload session store is unavailable.');
  }
  let session: R2UploadSession;
  try {
    session = JSON.parse(value || 'null');
  } catch {
    throw new R2UploadError(403, 'Upload session is unavailable.');
  }
  if (
    !session ||
    session.bucket !== bucket ||
    session.key !== pair.key ||
    session.uploadId !== pair.uploadId ||
    session.userId !== owner.userId ||
    session.organizationId !== owner.organizationId ||
    !Number.isFinite(session.expiresAt) ||
    session.expiresAt <= Date.now()
  ) {
    throw new R2UploadError(403, 'Upload session is unavailable.');
  }
  return session;
}

export function partLifetime(session: R2UploadSession) {
  if (session.aborted || session.completed) {
    throw new R2UploadError(403, 'Upload session is unavailable.');
  }
  const seconds = Math.floor((session.expiresAt - Date.now()) / 1000);
  if (seconds < 1) throw new R2UploadError(403, 'Upload session has expired.');
  return Math.min(3600, seconds);
}
