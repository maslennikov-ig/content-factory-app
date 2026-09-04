'use strict';

/**
 * `content-factory-next-fn33.71`: подпись пустой медиатеки обещала «максимум
 * 1 GB за загрузку», а картинку на 14 МБ отклоняли.
 *
 * Числа было два: сеансовый предел выгрузки в самом экране (1 ГБ) и предел на
 * один файл в `upload.limits.ts` (10 МБ для картинки). Подпись называла
 * первое, а отказывало второе. Здесь проверяется, что подпись берёт числа из
 * общего места и что старое обещание не вернулось ни в код, ни в русскую
 * локаль.
 */

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relative) =>
  fs.readFileSync(path.join(root, relative), 'utf8');

const componentSource = read(
  'apps/frontend/src/components/media/media.component.tsx'
);
const localePath = (locale) =>
  `libraries/react-shared-libraries/src/translation/locales/${locale}/translation.json`;
const locale = (name) => JSON.parse(read(localePath(name)));

const KEY = 'select_or_upload_pictures_limits';

describe('the empty media library names the ceiling that actually refuses', () => {
  test('the caption takes both numbers from the shared limits module', () => {
    expect(componentSource).toMatch(
      /import \{[\s\S]*?MAX_IMAGE_UPLOAD_SIZE[\s\S]*?MAX_VIDEO_UPLOAD_SIZE[\s\S]*?formatUploadSizeLimit[\s\S]*?\} from '@contentfactory\/nestjs-libraries\/upload\/upload\.limits';/
    );

    const caption = componentSource.slice(componentSource.indexOf(`'${KEY}'`));
    // The language goes in with the number: the unit is «МБ» in a Russian
    // sentence and «MB» in an English one (`content-factory-next-fn33.95`).
    expect(caption).toMatch(
      /imageLimit: formatUploadSizeLimit\(\s*MAX_IMAGE_UPLOAD_SIZE,\s*language\s*\)/
    );
    expect(caption).toMatch(
      /videoLimit: formatUploadSizeLimit\(\s*MAX_VIDEO_UPLOAD_SIZE,\s*language\s*\)/
    );
  });

  test('the old one-number promise is gone from the screen and the locales', () => {
    expect(componentSource).not.toContain('select_or_upload_pictures_max_1gb');
    expect(componentSource).not.toContain(
      'Select or upload pictures (maximum 1 GB per upload).'
    );

    for (const name of fs.readdirSync(
      path.join(root, 'libraries/react-shared-libraries/src/translation/locales')
    )) {
      expect(locale(name)).not.toHaveProperty(
        'select_or_upload_pictures_max_1gb'
      );
    }
  });

  test('every locale carries the caption with both placeholders', () => {
    for (const name of fs.readdirSync(
      path.join(root, 'libraries/react-shared-libraries/src/translation/locales')
    )) {
      const value = locale(name)[KEY];
      expect(typeof value).toBe('string');
      expect(value).toContain('{{imageLimit}}');
      expect(value).toContain('{{videoLimit}}');
      expect(value).not.toMatch(/1 GB per upload/);
    }
  });

  test('the numbers the caption will print are the ones the pipe enforces', () => {
    const limits = read('libraries/nestjs-libraries/src/upload/upload.limits.ts');
    expect(limits).toMatch(
      /export const MAX_IMAGE_UPLOAD_SIZE = 10 \* 1024 \* 1024;/
    );
    expect(limits).toMatch(
      /export const MAX_VIDEO_UPLOAD_SIZE = 1024 \* 1024 \* 1024;/
    );
  });
});
