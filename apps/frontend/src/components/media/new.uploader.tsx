import React, { useCallback, useEffect, useMemo, useState } from 'react';
// @ts-ignore
import Uppy, { BasePlugin, UploadResult, UppyFile } from '@uppy/core';
// @ts-ignore
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { getUppyUploadPlugin } from '@contentfactory/react/helpers/uppy.upload';
import { Dashboard, FileInput, ProgressBar } from '@uppy/react';

// Uppy styles
import { useVariables } from '@contentfactory/react/helpers/variable.context';
import Compressor from '@uppy/compressor';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';
import { useToaster } from '@contentfactory/react/toaster/toaster';
import { useLaunchStore } from '@contentfactory/frontend/components/new-launch/store';
import { uniqBy } from 'lodash';

export class CompressionWrapper<M = any, B = any> extends Compressor<any, any> {
  override async prepareUpload(fileIDs: string[]) {
    const { files } = this.uppy.getState();

    // 1) Skip GIFs (and anything missing)
    const filteredIDs = fileIDs.filter((id) => {
      const f = files[id];
      if (!f) return false;

      const type = f.type ?? '';
      const name = (f.name ?? '').toLowerCase();
      const isGif = type === 'image/gif' || name.endsWith('.gif');

      return !isGif;
    });

    // 2) Let @uppy/compressor do its work (convert/resize/etc)
    return super.prepareUpload(filteredIDs);
  }
}

/**
 * What to tell the person when an upload does not land.
 *
 * The upload goes to `/media/upload-server` over XHR, outside `useFetch`, so
 * nothing on the way back is interpreted for the interface: a refused file
 * arrives as a Nest error body (`{ message, error, statusCode }`), a refused
 * session arrives as a bare 401 with no body at all, and a reverse proxy
 * refusing the size arrives as HTML or as nothing. Until 04.09.2026 all three
 * were swallowed by an `error` handler that cleared the queue and said
 * nothing, so every one of them looked like "the button does nothing".
 *
 * The status is kept next to the text because it is the one part that is
 * always present and it is what separates those cases from each other.
 */
export function describeUploadFailure(error?: any, response?: any): string {
  const rawStatus = response?.status ?? error?.status;
  const status =
    typeof rawStatus === 'number' && rawStatus > 0 ? rawStatus : undefined;

  const text = serverMessage(response?.body) || cleanMessage(error?.message);

  if (text && status) return `${text} (HTTP ${status})`;
  if (text) return text;
  if (status) return `HTTP ${status}`;
  return '';
}

/** As much of a sentence as one line of the toast actually shows. */
const TOAST_LINE = 120;

const cleanMessage = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  // An HTML error page from a proxy is not a message; it is a wall of markup.
  if (!trimmed || trimmed.startsWith('<')) return '';
  // The toast is one 56px line with the overflow hidden, so anything past
  // this is not read — it only pushes the beginning of the sentence out.
  return trimmed.length > TOAST_LINE
    ? `${trimmed.slice(0, TOAST_LINE)}…`
    : trimmed;
};

/**
 * The ceiling as a sentence, from the ceiling as a number.
 *
 * The copy used to spell the ceiling out beside the very constant it was
 * meant to describe, in English, in four places. One number, formatted.
 */
export const formatSizeCeiling = (bytes: number): string =>
  bytes % (1024 * 1024 * 1024) === 0
    ? `${bytes / (1024 * 1024 * 1024)} GB`
    : `${Math.round(bytes / (1024 * 1024))} MB`;

const serverMessage = (body: unknown): string => {
  if (!body) return '';

  if (typeof body === 'string') {
    try {
      return serverMessage(JSON.parse(body)) || cleanMessage(body);
    } catch {
      return cleanMessage(body);
    }
  }

  if (typeof body !== 'object') return '';

  const { message, error } = body as { message?: unknown; error?: unknown };
  // `class-validator` answers with an array of failures; Nest's own
  // exceptions answer with one string.
  if (Array.isArray(message)) {
    return cleanMessage(message.filter(Boolean).join('; '));
  }
  return cleanMessage(message) || cleanMessage(error);
};

export function useUppyUploader(props: {
  // @ts-ignore
  onUploadSuccess: (result: UploadResult) => void;
  onStart: () => void;
  onEnd: () => void;
  allowedFileTypes: string;
}) {
  const setLocked = useLaunchStore((state) => state.setLocked);
  const toast = useToaster();
  const t = useT();
  const { storageProvider, backendUrl, disableImageCompression, transloadit } =
    useVariables();
  const { onUploadSuccess, allowedFileTypes } = props;
  const fetch = useFetch();
  return useMemo(() => {
    // Track file order to maintain original sequence after upload
    let fileOrderIndex = 0;
    // The two events overlap: a per-file `upload-error` is followed by the
    // run-wide `error`, and the checks below reject with an error they have
    // already reported. One refusal, one toast.
    let reported = false;

    const reportFailure = (error?: any, response?: any) => {
      if (reported) return;
      reported = true;
      const reason = describeUploadFailure(error, response);
      toast.show(
        reason
          ? t('media_upload_failed_reason', 'Upload failed: {{reason}}', {
              reason,
            })
          : t(
              'media_upload_failed',
              'Upload failed. The server did not accept the file.'
            ),
        'warning'
      );
    };

    const uppy2 = new Uppy({
      autoProceed: true,
      restrictions: {
        // maxNumberOfFiles: 5,
        // allowedFileTypes: allowedFileTypes.split(','),
        // A ceiling for the queue; the checks below are the real ones.
        maxFileSize: 1000000000,
      },
    });

    // check for valid file types it can be something like this image/*,video/mp4.
    // If it's an image, I need to replace image/* with image/png, image/jpeg, image/jpeg, image/gif (separately)
    uppy2.addPreProcessor((fileIDs) => {
      return new Promise<void>((resolve, reject) => {
        const files = uppy2.getFiles();
        const allowedTypes = allowedFileTypes
          .split(',')
          .map((type) => type.trim());

        // Expand generic types to specific ones
        const expandedTypes = allowedTypes.flatMap((type) => {
          if (type === 'image/*') {
            return [
              'image/png',
              'image/jpeg',
              'image/jpg',
              'image/gif',
              'image/webp',
            ];
          }
          if (type === 'video/*') {
            return ['video/mp4', 'video/mpeg', 'video/quicktime'];
          }
          if (type === 'video/mp4' && transloadit && transloadit.length > 0) {
            return ['video/mp4', 'video/mpeg', 'video/quicktime'];
          }
          return [type];
        });

        for (const file of files) {
          if (fileIDs.includes(file.id)) {
            const fileType = file.type;

            // Check if file type is allowed
            const isAllowed = expandedTypes.some((allowedType) => {
              if (allowedType.endsWith('/*')) {
                const baseType = allowedType.replace('/*', '/');
                return fileType?.startsWith(baseType);
              }
              return fileType === allowedType;
            });

            if (!isAllowed) {
              const message = t(
                'media_upload_type_not_accepted',
                'File type {{type}} is not accepted.',
                { type: fileType || 'unknown' }
              );
              // The sentence the person reads, plus what a log needs and a
              // sentence has no room for.
              const error = new Error(
                `${message} [${file.name}, accepts: ${allowedFileTypes}]`
              );
              uppy2.log(error.message, 'error');
              uppy2.info(message, 'error', 5000);
              toast.show(message, 'warning');
              // Already told them why; the run-wide `error` that follows
              // must not say it a second time.
              reported = true;
              uppy2.removeFile(file.id);
              return reject(error);
            }
          }
        }

        resolve();
      });
    });

    uppy2.addPreProcessor((fileIDs) => {
      return new Promise<void>((resolve, reject) => {
        const files = uppy2.getFiles();

        for (const file of files) {
          if (fileIDs.includes(file.id)) {
            const isImage = file.type?.startsWith('image/');
            const isVideo = file.type?.startsWith('video/');

            const maxImageSize = 30 * 1024 * 1024;
            const maxVideoSize = 1000 * 1024 * 1024;

            if (isImage && file.size > maxImageSize) {
              const message = t(
                'media_upload_image_over_limit',
                'Image is over the {{max}} limit.',
                { max: formatSizeCeiling(maxImageSize) }
              );
              const error = new Error(`${message} [${file.name}]`);
              uppy2.log(error.message, 'error');
              uppy2.info(message, 'error', 5000);
              toast.show(message, 'warning');
              reported = true;
              uppy2.removeFile(file.id); // Remove file from queue
              return reject(error);
            }

            if (isVideo && file.size > maxVideoSize) {
              const message = t(
                'media_upload_video_over_limit',
                'Video is over the {{max}} limit.',
                { max: formatSizeCeiling(maxVideoSize) }
              );
              const error = new Error(`${message} [${file.name}]`);
              uppy2.log(error.message, 'error');
              uppy2.info(message, 'error', 5000);
              toast.show(message, 'warning');
              reported = true;
              uppy2.removeFile(file.id); // Remove file from queue
              return reject(error);
            }
          }
        }

        resolve();
      });
    });

    const { plugin, options } = getUppyUploadPlugin(
      transloadit.length > 0 ? 'transloadit' : storageProvider,
      fetch,
      backendUrl,
      transloadit
    );

    uppy2.use(plugin, options);
    if (!disableImageCompression) {
      uppy2.use(CompressionWrapper, {
        convertTypes: ['image/jpeg', 'image/png', 'image/webp'],
        maxWidth: 1000,
        maxHeight: 1000,
        quality: 1,
      });
    }
    // Set additional metadata when a file is added
    uppy2.on('file-added', (file) => {
      setLocked(true);
      uppy2.setFileMeta(file.id, {
        useCloudflare: storageProvider === 'cloudflare' ? 'true' : 'false', // Example of adding a custom field
        addedOrder: fileOrderIndex++, // Track original order for sorting after upload
        // Add more fields as needed
      });
    });
    // Per-file: the response that refused it is here and nowhere else.
    uppy2.on('upload-error', (file, error, response) => {
      reportFailure(error, response);
    });
    uppy2.on('error', (error) => {
      reportFailure(error);
      uppy2.clear();
      setLocked(false);
      props.onEnd();
      fileOrderIndex = 0;
    });
    uppy2.on('upload-start', () => {
      reported = false;
      props.onStart();
    });
    uppy2.on('complete', async (result) => {
      for (const file of [...result.successful]) {
        uppy2.removeFile(file.id);
      }

      props.onEnd();
      // Sort results by original add order to maintain file sequence
      const sortedSuccessful = [...result.successful].sort((a, b) => {
        const orderA = +((a.meta as any)?.addedOrder ?? 0);
        const orderB = +((b.meta as any)?.addedOrder ?? 0);
        return orderA - orderB;
      });

      if (storageProvider === 'local') {
        setLocked(false);
        fileOrderIndex = 0;
        onUploadSuccess(sortedSuccessful.map((p) => p.response.body));
        return;
      }

      if (transloadit.length > 0) {
        // @ts-ignore
        const allRes = result.transloadit[0].results;
        const toSave = uniqBy<{ name: string; originalName: string; order: number }>(
          // @ts-ignore
          Object.values(allRes).flatMap((p: any[]) => {
            return p.flatMap((item) => ({
              name: item.url.split('/').pop(),
              originalName: item.name || '',
              order: +item.user_meta.addedOrder,
            }));
          }),
          (item) => item.name
        );

        const loadAllMedia = (
          await Promise.all(
            toSave.map(async ({ name, originalName, order }) => ({
              file: await (
                await fetch('/media/save-media', {
                  method: 'POST',
                  body: JSON.stringify({
                    name,
                    originalName,
                  }),
                })
              ).json(),
              order,
            }))
          )
        )
          .sort((a, b) => {
            return a.order - b.order;
          })
          .map((p) => p.file);

        setLocked(false);
        fileOrderIndex = 0;
        onUploadSuccess(loadAllMedia);
        return;
      }

      setLocked(false);
      fileOrderIndex = 0;
      onUploadSuccess(sortedSuccessful.map((p) => p.response.body.saved));
    });
    uppy2.on('upload-success', (file, response) => {
      // @ts-ignore
      uppy2.setFileState(file.id, {
        // @ts-ignore
        progress: uppy2.getState().files[file.id].progress,
        // @ts-ignore
        uploadURL: response.body.Location,
        response: response,
        isPaused: false,
      });
    });
    return uppy2;
  }, []);
}
