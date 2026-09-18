'use strict';
/**
 * Исходник, который Git считает двоичным, перестаёт быть читаемым.
 *
 * `content-factory-next-97dq.3`, P2-21. В `review-prompt.v5.ts` разделитель
 * ключа был записан самим нулевым байтом, а в `web.research.service.ts` —
 * байтом U+0001. Оба невидимы в редакторе, оба валидны для TypeScript, и оба
 * делают файл двоичным для Git: `git diff` пишет «Binary files differ» и
 * правка в модуле перестаёт быть видимой на ревью. Нашлось это глазами, а не
 * набором — поэтому набор.
 *
 * Правило узкое: управляющие байты C0, кроме табуляции, перевода строки и
 * возврата каретки. Сам символ в строке по-прежнему доступен — его пишут
 * escape-последовательностью, — и это ровно та разница, ради которой правило
 * существует: escape виден на ревью, байт не виден.
 *
 * Наборы проверяются тем же правилом: первая редакция этого самого файла
 * пронесла U+0001 в собственном комментарии, и правило, которое не смотрит на
 * себя, пропустило бы его.
 *
 * Что уже было — перечислено поимённо и может только убывать: чинить чужой
 * модуль ради нового правила значило бы менять поведение там, куда правило не
 * смотрит.
 */
const fs = require('node:fs');
const path = require('node:path');

const SOURCE_ROOTS = [
  ...fs
    .readdirSync('libraries', { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join('libraries', entry.name, 'src'))
    .filter((directory) => fs.existsSync(directory)),
  'tests',
];

const SOURCE_FILE = /\.(?:ts|tsx|js|cjs|mjs)$/;

/**
 * Написано до 18.09.2026. `text-file.ts` ищет нулевой байт в загруженном файле,
 * чтобы отличить двоичный от текстового, и записал его собой же. Список может
 * только сокращаться: новый файл сюда не дописывается.
 */
const GRANDFATHERED = [
  'libraries/nestjs-libraries/src/content-intelligence/brand-voice/text-file.ts',
  'tests/brand-voice.sample-intake.test.cjs',
];

const sourceFiles = (directory) =>
  fs
    .readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) return sourceFiles(full);
      return SOURCE_FILE.test(entry.name) ? [full] : [];
    });

const controlByteIn = (file) => {
  for (const byte of fs.readFileSync(file))
    if (byte < 0x20 && byte !== 0x09 && byte !== 0x0a && byte !== 0x0d)
      return `0x${byte.toString(16).padStart(2, '0')}`;
  return null;
};

test('no shared library source carries a raw control byte Git would read as binary', () => {
  const offenders = SOURCE_ROOTS.flatMap(sourceFiles)
    .filter((file) => !GRANDFATHERED.includes(file))
    .map((file) => ({ file, byte: controlByteIn(file) }))
    .filter(({ byte }) => byte)
    .map(({ file, byte }) => `${file} carries ${byte}`);

  expect(offenders).toEqual([]);
});

test('every grandfathered file still exists and still needs its exemption', () => {
  // Файл починили или удалили — строка уходит отсюда, а не остаётся навсегда.
  for (const file of GRANDFATHERED) {
    expect(fs.existsSync(file)).toBe(true);
    expect(controlByteIn(file)).not.toBeNull();
  }
});
