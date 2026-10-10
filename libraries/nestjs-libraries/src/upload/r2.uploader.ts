import {
  UploadPartCommand,
  S3Client,
  ListPartsCommand,
  CreateMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Request, Response } from 'express';
import path from 'path';
import { makeId } from '@contentfactory/nestjs-libraries/services/make.is';
import {
  R2UploadOwner,
  R2UploadError,
  R2Completion,
  ownedUploadSession,
  storeUploadSession,
  requireUploadOwner,
  partLifetime,
} from './r2.upload.session';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { fromBuffer } = require('file-type');

const ALLOWED_EXT_TO_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
  '.mp4': 'video/mp4',
};

function normalizeExtension(filename: string): string | null {
  const ext = path.extname(filename || '').toLowerCase();
  return ALLOWED_EXT_TO_MIME[ext] ? ext : null;
}

const {
  CLOUDFLARE_ACCOUNT_ID,
  CLOUDFLARE_ACCESS_KEY,
  CLOUDFLARE_SECRET_ACCESS_KEY,
  CLOUDFLARE_BUCKETNAME,
  CLOUDFLARE_BUCKET_URL,
} = process.env;

const R2 = new S3Client({
  region: 'auto',
  endpoint: `https://${CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: CLOUDFLARE_ACCESS_KEY!,
    secretAccessKey: CLOUDFLARE_SECRET_ACCESS_KEY!,
  },
});

// Function to generate a random string
function generateRandomString() {
  return makeId(20);
}

export default async function handleR2Upload(
  endpoint: string,
  req: Request,
  res: Response,
  owner: R2UploadOwner
) {
  switch (endpoint) {
    case 'create-multipart-upload':
      return createMultipartUpload(req, res, owner);
    case 'prepare-upload-parts':
      return prepareUploadParts(req, res, owner);
    case 'complete-multipart-upload':
      return completeMultipartUpload(req, res, owner);
    case 'list-parts':
      return listParts(req, res, owner);
    case 'abort-multipart-upload':
      return abortMultipartUpload(req, res, owner);
    case 'sign-part':
      return signPart(req, res, owner);
  }
  return res.status(404).end();
}

export async function simpleUpload(
  data: Buffer,
  originalFilename: string,
  _contentType: string
) {
  const detected = await fromBuffer(data);
  if (
    !detected ||
    !Object.values(ALLOWED_EXT_TO_MIME).includes(detected.mime)
  ) {
    throw new Error('Unsupported file type.');
  }
  const fileExtension = `.${detected.ext}`;
  const safeContentType = detected.mime;
  const randomFilename = generateRandomString() + fileExtension;

  const params = {
    Bucket: CLOUDFLARE_BUCKETNAME,
    Key: randomFilename,
    Body: data,
    ContentType: safeContentType,
  };

  const command = new PutObjectCommand({ ...params });
  await R2.send(command);

  return CLOUDFLARE_BUCKET_URL + '/' + randomFilename;
}

function uploadError(res: Response, error: unknown) {
  const known = error instanceof R2UploadError;
  return res.status(known ? error.status : 500).json({
    message: known ? error.message : 'Upload request failed. Please retry.',
  });
}

function validPartNumber(value: unknown): number {
  const part =
    typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  if (
    typeof part !== 'number' ||
    !Number.isInteger(part) ||
    part < 1 ||
    part > 10000
  ) {
    throw new R2UploadError(400, 'Invalid upload part number.');
  }
  return part;
}

export async function createMultipartUpload(
  req: Request,
  res: Response,
  owner: R2UploadOwner
) {
  const { file, fileHash } = req.body || {};
  const safeExt = normalizeExtension(file?.name || '');
  if (!safeExt) {
    return res.status(400).json({ message: 'Unsupported file type.' });
  }
  const safeContentType = ALLOWED_EXT_TO_MIME[safeExt];
  const randomFilename = generateRandomString() + safeExt;

  try {
    requireUploadOwner(owner);
    const params = {
      Bucket: CLOUDFLARE_BUCKETNAME,
      Key: `${randomFilename}`,
      ContentType: safeContentType,
      Metadata: {
        'x-amz-meta-file-hash': fileHash,
      },
    };

    const command = new CreateMultipartUploadCommand({ ...params });
    const response = await R2.send(command);
    if (!response.UploadId || response.Key !== randomFilename) {
      throw new Error('Invalid multipart upload response');
    }
    await storeUploadSession({
      ...owner,
      bucket: CLOUDFLARE_BUCKETNAME!,
      key: response.Key,
      uploadId: response.UploadId,
      expiresAt: Date.now() + 3600 * 1000,
    });
    return res.status(200).json({
      uploadId: response.UploadId,
      key: response.Key,
    });
  } catch (err) {
    return uploadError(res, err);
  }
}

export async function prepareUploadParts(
  req: Request,
  res: Response,
  owner: R2UploadOwner
) {
  try {
    const { partData } = req.body || {};
    const session = await ownedUploadSession(
      CLOUDFLARE_BUCKETNAME!,
      partData,
      owner
    );
    if (!Array.isArray(partData.parts) || partData.parts.length > 10000) {
      throw new R2UploadError(400, 'Invalid upload parts.');
    }
    const parts = partData.parts.map((part: { number: unknown }) =>
      validPartNumber(part?.number)
    );
    const response = { presignedUrls: {} as Record<number, string> };
    for (const part of parts) {
      const params = {
        Bucket: CLOUDFLARE_BUCKETNAME,
        Key: session.key,
        PartNumber: part,
        UploadId: session.uploadId,
      };
      const command = new UploadPartCommand({ ...params });
      response.presignedUrls[part] = await getSignedUrl(R2, command, {
        expiresIn: partLifetime(session),
      });
    }
    return res.status(200).json(response);
  } catch (err) {
    return uploadError(res, err);
  }
}

export async function listParts(
  req: Request,
  res: Response,
  owner: R2UploadOwner
) {
  try {
    const session = await ownedUploadSession(
      CLOUDFLARE_BUCKETNAME!,
      req.body,
      owner
    );
    partLifetime(session);
    const params = {
      Bucket: CLOUDFLARE_BUCKETNAME,
      Key: session.key,
      UploadId: session.uploadId,
    };
    const command = new ListPartsCommand({ ...params });
    const response = await R2.send(command);

    return res.status(200).json(response['Parts']);
  } catch (err) {
    return uploadError(res, err);
  }
}

export async function completeMultipartUpload(
  req: Request,
  res: Response,
  owner: R2UploadOwner
) {
  try {
    const session = await ownedUploadSession(
      CLOUDFLARE_BUCKETNAME!,
      req.body,
      owner
    );
    if (session.aborted)
      throw new R2UploadError(403, 'Upload session is unavailable.');
    if (session.completed) return session.completed;
    const { key, uploadId } = session;
    const { parts } = req.body;
    const command = new CompleteMultipartUploadCommand({
      Bucket: CLOUDFLARE_BUCKETNAME,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: { Parts: parts },
    });
    let etag: string | undefined;
    try {
      etag = (await R2.send(command)).ETag;
    } catch (error: any) {
      // A lost completion response is recovered only from the exact owned
      // object below. A timeout or other error alone is never a receipt.
      if (error?.name !== 'NoSuchUpload') throw error;
    }

    const safeExt = normalizeExtension(key || '');
    if (!safeExt) {
      await R2.send(
        new DeleteObjectCommand({ Bucket: CLOUDFLARE_BUCKETNAME, Key: key })
      );
      return res.status(400).json({ message: 'Unsupported file type.' });
    }
    const expectedMime = ALLOWED_EXT_TO_MIME[safeExt];

    const head = await R2.send(
      new GetObjectCommand({
        Bucket: CLOUDFLARE_BUCKETNAME,
        Key: key,
        Range: 'bytes=0-4100',
      })
    );
    const chunks: Buffer[] = [];
    // @ts-ignore
    for await (const chunk of head.Body as AsyncIterable<Buffer>) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const prefix = Buffer.concat(chunks);
    const detected = await fromBuffer(prefix);

    if (!detected || detected.mime !== expectedMime) {
      await R2.send(
        new DeleteObjectCommand({ Bucket: CLOUDFLARE_BUCKETNAME, Key: key })
      );
      return res
        .status(400)
        .json({ message: 'File contents do not match declared type.' });
    }

    const response: R2Completion = {
      Key: key,
      Location: CLOUDFLARE_BUCKET_URL + '/' + key,
      ETag: etag || head.ETag,
    };
    await storeUploadSession({ ...session, completed: response });
    return response;
  } catch (err) {
    return uploadError(res, err);
  }
}

export async function abortMultipartUpload(
  req: Request,
  res: Response,
  owner: R2UploadOwner
) {
  try {
    const session = await ownedUploadSession(
      CLOUDFLARE_BUCKETNAME!,
      req.body,
      owner
    );
    if (session.completed)
      throw new R2UploadError(403, 'Upload is already complete.');
    if (session.aborted) return res.status(200).json({});
    const params = {
      Bucket: CLOUDFLARE_BUCKETNAME,
      Key: session.key,
      UploadId: session.uploadId,
    };
    const command = new AbortMultipartUploadCommand({ ...params });
    try {
      await R2.send(command);
    } catch (error: any) {
      if (error?.name !== 'NoSuchUpload') throw error;
    }
    await storeUploadSession({ ...session, aborted: true });
    return res.status(200).json({});
  } catch (err) {
    return uploadError(res, err);
  }
}

export async function signPart(
  req: Request,
  res: Response,
  owner: R2UploadOwner
) {
  try {
    const session = await ownedUploadSession(
      CLOUDFLARE_BUCKETNAME!,
      req.body,
      owner
    );
    const command = new UploadPartCommand({
      Bucket: CLOUDFLARE_BUCKETNAME,
      Key: session.key,
      UploadId: session.uploadId,
      PartNumber: validPartNumber(req.body.partNumber),
    });
    const url = await getSignedUrl(R2, command, {
      expiresIn: partLifetime(session),
    });
    return res.status(200).json({ url });
  } catch (err) {
    return uploadError(res, err);
  }
}
