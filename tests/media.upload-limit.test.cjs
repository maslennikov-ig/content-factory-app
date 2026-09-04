const fs = require('node:fs');
const path = require('node:path');
const { loadTypeScriptModule, repositoryRoot } = require('./helpers/load-ts-module.cjs');

/**
 * One ceiling, read by both sides.
 *
 * The browser used to let an image of up to 30 MB through and the validation
 * pipe refused anything past 10 MB, so a file between the two passed every
 * check the person could see and came back as a 400 — before
 * `content-factory-next-fn33.15` it came back as nothing visible at all
 * (`content-factory-next-fn33.20`). The numbers were never meant to differ;
 * they differed because they were typed twice. This suite fails if they are
 * ever typed twice again.
 */

const uploaderPath = 'apps/frontend/src/components/media/new.uploader.tsx';
const validationPath =
  'libraries/nestjs-libraries/src/upload/custom.upload.validation.ts';

const limits = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/upload/upload.limits.ts'
);

const loadPipe = () =>
  loadTypeScriptModule(validationPath, {
    'file-type': {
      fromBuffer: async () => ({ mime: 'image/png', ext: 'png' }),
    },
  });

const uploaderSource = () =>
  fs.readFileSync(path.join(repositoryRoot, uploaderPath), 'utf8');

describe('the image ceiling is one number', () => {
  test('the pipe enforces exactly what the shared module says', () => {
    const { getMaxSize } = loadPipe();

    expect(getMaxSize('image/png')).toBe(limits.MAX_IMAGE_UPLOAD_SIZE);
    expect(getMaxSize('image/jpeg')).toBe(10 * 1024 * 1024);
    expect(getMaxSize('video/mp4')).toBe(limits.MAX_VIDEO_UPLOAD_SIZE);
  });

  test('the browser checks the shared constants, not numbers of its own', () => {
    const source = uploaderSource();

    expect(source).toContain(
      "from '@contentfactory/nestjs-libraries/upload/upload.limits'"
    );
    expect(source).toMatch(/const maxImageSize = MAX_IMAGE_UPLOAD_SIZE;/);
    expect(source).toMatch(/const maxVideoSize = MAX_VIDEO_UPLOAD_SIZE;/);
    // The size checks carry no arithmetic of their own any more.
    expect(source).not.toMatch(/max(Image|Video)Size\s*=\s*\d/);
  });

  test('an unsupported type has no ceiling to enforce', () => {
    const { getMaxSize } = loadPipe();

    expect(() => getMaxSize('application/pdf')).toThrow();
    expect(limits.maxUploadSizeForMimeType('application/pdf')).toBeUndefined();
  });
});

describe('the refusal is a sentence, not a byte count', () => {
  const oversizedImage = () => ({
    buffer: Buffer.from([1, 2, 3]),
    fieldname: 'file',
    mimetype: 'image/png',
    originalname: 'photo.png',
    size: limits.MAX_IMAGE_UPLOAD_SIZE + 1,
  });

  test('Russian names megabytes, and never the raw byte count', async () => {
    const { CustomFileValidationPipe } = loadPipe();

    await expect(
      new CustomFileValidationPipe('ru').transform(oversizedImage())
    ).rejects.toThrow(/10 МБ/);
    await expect(
      new CustomFileValidationPipe('ru').transform(oversizedImage())
    ).rejects.not.toThrow(/10485760/);
  });

  test('English is what a caller gets without asking for a language', async () => {
    const { CustomFileValidationPipe } = loadPipe();

    await expect(
      new CustomFileValidationPipe().transform(oversizedImage())
    ).rejects.toThrow(/10 MB/);
  });

  test('a file inside the ceiling is not refused', async () => {
    const { CustomFileValidationPipe } = loadPipe();

    const accepted = await new CustomFileValidationPipe('ru').transform({
      ...oversizedImage(),
      size: limits.MAX_IMAGE_UPLOAD_SIZE,
    });

    expect(accepted.originalname).toBe('photo.png');
  });

  test('the ceiling is spelled the same way on both sides', () => {
    expect(limits.formatUploadSizeLimit(limits.MAX_IMAGE_UPLOAD_SIZE)).toBe(
      '10 MB'
    );
    expect(limits.formatUploadSizeLimit(limits.MAX_VIDEO_UPLOAD_SIZE)).toBe(
      '1 GB'
    );
  });

  test('the unit is written in the language of the sentence around it', () => {
    // `content-factory-next-fn33.95`: «Выберите файл до 10 MB» is a Russian
    // sentence with an English unit in it, and the server's own refusal for
    // the same ceiling says «10 МБ».
    expect(
      limits.formatUploadSizeLimit(limits.MAX_IMAGE_UPLOAD_SIZE, 'ru')
    ).toBe('10 МБ');
    expect(
      limits.formatUploadSizeLimit(limits.MAX_VIDEO_UPLOAD_SIZE, 'ru-RU')
    ).toBe('1 ГБ');
    expect(
      limits.formatUploadSizeLimit(limits.MAX_IMAGE_UPLOAD_SIZE, 'fr')
    ).toBe('10 Mo');
    // A language that spells it the international way, and one nobody listed:
    // both keep MB rather than falling back to nothing.
    expect(
      limits.formatUploadSizeLimit(limits.MAX_IMAGE_UPLOAD_SIZE, 'de')
    ).toBe('10 MB');
    expect(
      limits.formatUploadSizeLimit(limits.MAX_IMAGE_UPLOAD_SIZE, undefined)
    ).toBe('10 MB');
  });

  test('both screens that print the ceiling pass the language in', () => {
    const uploader = uploaderSource();
    const media = fs.readFileSync(
      path.join(
        repositoryRoot,
        'apps/frontend/src/components/media/media.component.tsx'
      ),
      'utf8'
    );
    expect(uploader).toMatch(/formatSizeCeiling\(maxImageSize, language\)/);
    expect(uploader).toMatch(/formatSizeCeiling\(maxVideoSize, language\)/);
    expect(media).toMatch(
      /formatUploadSizeLimit\(\s*MAX_IMAGE_UPLOAD_SIZE,\s*language\s*\)/
    );
    expect(media).toMatch(
      /formatUploadSizeLimit\(\s*MAX_VIDEO_UPLOAD_SIZE,\s*language\s*\)/
    );
  });
});
