const fs = require('node:fs');
const path = require('node:path');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const root = path.resolve(__dirname, '..');
const uploaderPath = 'apps/frontend/src/components/media/new.uploader.tsx';
const localesDir = path.join(
  root,
  'libraries/react-shared-libraries/src/translation/locales'
);

/**
 * A refused upload has to say so.
 *
 * The media uploader posts to `/media/upload-server` over XHR, which never
 * passes through `useFetch`, so nothing on the way back is turned into an
 * interface state. Until 04.09.2026 the only handler was `error`, and it
 * cleared the queue in silence: a file the validation pipe refused, a session
 * the middleware refused with a bare 401, and a proxy refusing the size all
 * looked identical from the outside — the button did nothing. The owner hit
 * exactly that on production on 04.09.2026 (content-factory-next-fn33.15).
 */
const stubClass = class {};

const uploader = () =>
  loadTypeScriptModule(uploaderPath, {
    react: require('react'),
    '@uppy/core': stubClass,
    '@uppy/react': { Dashboard: stubClass, FileInput: stubClass, ProgressBar: stubClass },
    '@uppy/compressor': stubClass,
    lodash: require('lodash'),
    '@contentfactory/helpers/utils/custom.fetch': { useFetch: () => () => {} },
    '@contentfactory/react/helpers/uppy.upload': {
      getUppyUploadPlugin: () => ({ plugin: stubClass, options: {} }),
    },
    '@contentfactory/react/helpers/variable.context': { useVariables: () => ({}) },
    '@contentfactory/react/translation/get.transation.service.client': {
      useT: () => (key) => key,
    },
    '@contentfactory/react/toaster/toaster': {
      useToaster: () => ({ show: () => {} }),
    },
    '@contentfactory/frontend/components/new-launch/store': {
      useLaunchStore: () => () => {},
    },
  });

describe('a refused media upload is not silent', () => {
  const { describeUploadFailure } = uploader();

  test('reads the message the validation pipe sends back', () => {
    expect(
      describeUploadFailure(new Error('Upload failed'), {
        status: 400,
        body: {
          message: 'Unsupported file type.',
          error: 'Bad Request',
          statusCode: 400,
        },
      })
    ).toBe('Unsupported file type. (HTTP 400)');
  });

  test('reads the same body when the transport hands it back as text', () => {
    expect(
      describeUploadFailure(undefined, {
        status: 400,
        body: '{"message":"File size exceeds the maximum allowed size of 10485760 bytes.","statusCode":400}',
      })
    ).toBe(
      'File size exceeds the maximum allowed size of 10485760 bytes. (HTTP 400)'
    );
  });

  test('joins the list class-validator answers with', () => {
    expect(
      describeUploadFailure(undefined, {
        status: 400,
        body: { message: ['file should not be empty', 'file must be a file'] },
      })
    ).toBe('file should not be empty; file must be a file (HTTP 400)');
  });

  // The auth middleware answers a refused session with `response.status(401)`
  // and `.send()` — no body at all — and clears the auth cookie on the way
  // out. The status is the entire message, so it has to survive.
  test('still names the bare 401 the auth middleware sends', () => {
    expect(describeUploadFailure(new Error(''), { status: 401, body: '' })).toBe(
      'HTTP 401'
    );
  });

  test('does not read a proxy error page out loud', () => {
    const described = describeUploadFailure(undefined, {
      status: 413,
      body: '<html><head><title>413 Request Entity Too Large</title></head></html>',
    });
    expect(described).toBe('HTTP 413');
    expect(described).not.toMatch(/</);
  });

  test('falls back to the transport error when there is no response', () => {
    expect(describeUploadFailure(new Error('Network error'))).toBe(
      'Network error'
    );
  });

  test('says nothing rather than something empty when nothing is known', () => {
    expect(describeUploadFailure(undefined, undefined)).toBe('');
    expect(describeUploadFailure({}, { status: 0, body: {} })).toBe('');
  });

  test('the uploader subscribes to the per-file error and reports before clearing', () => {
    const source = fs.readFileSync(path.join(root, uploaderPath), 'utf8');

    expect(source).toMatch(
      /uppy2\.on\(\s*'upload-error'[\s\S]{0,200}?reportFailure\(/
    );
    // The clear used to be the whole handler. It now happens after the person
    // has been told why.
    expect(source).toMatch(
      /uppy2\.on\(\s*'error'[\s\S]{0,120}?reportFailure\([\s\S]{0,80}?uppy2\.clear\(\)/
    );
    expect(source).toContain('media_upload_failed_reason');
    expect(source).toContain('media_upload_failed');
  });

  // A refusal the person reads is part of the product, so it is translated
  // like the rest of it. These three were English literals typed into the
  // handler.
  test('the three checks in the browser speak through the locale files', () => {
    const source = fs.readFileSync(path.join(root, uploaderPath), 'utf8');

    expect(source).not.toMatch(/is not allowed/);
    expect(source).not.toMatch(/too large/i);
    for (const key of [
      'media_upload_type_not_accepted',
      'media_upload_image_over_limit',
      'media_upload_video_over_limit',
    ]) {
      expect(source).toContain(key);
    }
    // The ceiling is stated once, as a number, and formatted for the sentence
    // — not typed a second time into the copy.
    expect(source).not.toMatch(/30\s?MB|1\s?GB/);
  });

  test('every shipped locale can name the failure and carry the reason', () => {
    const locales = fs
      .readdirSync(localesDir)
      .filter((locale) =>
        fs.existsSync(path.join(localesDir, locale, 'translation.json'))
      );

    expect(locales).toHaveLength(16);
    for (const locale of locales) {
      const messages = JSON.parse(
        fs.readFileSync(path.join(localesDir, locale, 'translation.json'), 'utf8')
      );
      expect(typeof messages.media_upload_failed).toBe('string');
      expect(messages.media_upload_failed.trim()).not.toBe('');
      expect(messages.media_upload_failed_reason).toContain('{{reason}}');
      expect(messages.media_upload_type_not_accepted).toContain('{{type}}');
      expect(messages.media_upload_image_over_limit).toContain('{{max}}');
      expect(messages.media_upload_video_over_limit).toContain('{{max}}');
    }
  });
});
