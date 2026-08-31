'use strict';

/**
 * Одна подсказка на продукт, и один способ её сделать.
 *
 * К 29.08.2026 их было два. `Hint` — кружок с вопросом, который открывается
 * наведением, фокусом и нажатием, закрывается Escape и объявляется через
 * `aria-describedby`. И `react-tooltip`, подключённый глобально одной строкой в
 * оболочке: сорок два места вешают подсказку атрибутом прямо на элемент.
 *
 * Второй не «хуже» сам по себе — он просто отвечает на другой вопрос и другими
 * средствами. Беда в том, что человек, которому завтра понадобится объяснить
 * поле в календаре, возьмёт тот, что рядом, и получит подсказку, недоступную с
 * клавиатуры и не закрывающуюся по Escape. Ровно то, от чего `Hint` и уходил.
 *
 * Переписывать сорок два места этот страж не требует: правило заведено так,
 * как заведены остальные правила этого репозитория — старое перечислено
 * поимённо и заморожено, новое падает. Число в реестре только уменьшается.
 */

const fs = require('node:fs');
const path = require('node:path');

const repositoryRoot = path.resolve(__dirname, '..');
const allowlistPath = path.join(repositoryRoot, 'tests/tooltip-allowlist.json');
const SOURCE_ROOT = 'apps/frontend/src';

/** Библиотека подключается одной строкой; это её собственный дом, не вызов. */
const HOST_FILES = new Set([
  'apps/frontend/src/components/layout/top.tip.tsx',
  'apps/frontend/src/components/layout/layout.component.tsx',
]);

const sourceFiles = (directory) =>
  fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(entryPath);
    return /\.(tsx|jsx)$/.test(entry.name) ? [entryPath] : [];
  });

const countTooltips = () => {
  const counts = {};
  for (const filePath of sourceFiles(path.join(repositoryRoot, SOURCE_ROOT))) {
    const file = path.relative(repositoryRoot, filePath);
    if (HOST_FILES.has(file)) continue;
    const found = (
      fs.readFileSync(filePath, 'utf8').match(/data-tooltip-id/g) ?? []
    ).length;
    if (found) counts[file] = found;
  }
  return counts;
};

describe('подсказка в продукте одна', () => {
  test('новых вызовов унаследованного слоя не появляется, а реестр только тает', () => {
    const allowlist = JSON.parse(fs.readFileSync(allowlistPath, 'utf8'));
    const actual = countTooltips();
    const allowed = allowlist.allowances ?? {};

    const invalid = [];
    if (allowlist.version !== 1) invalid.push('версия реестра должна быть 1');
    if (!allowlist.reason || !String(allowlist.reason).trim()) {
      invalid.push('реестр обязан называть причину, а не только число');
    }
    const declared = Object.values(allowed).reduce((sum, n) => sum + n, 0);
    if (declared !== allowlist.total) {
      invalid.push(`сумма по файлам ${declared}, в реестре ${allowlist.total}`);
    }

    const added = [];
    const stale = [];
    for (const file of new Set([
      ...Object.keys(actual),
      ...Object.keys(allowed),
    ])) {
      const now = actual[file] ?? 0;
      const may = allowed[file] ?? 0;
      // Больше разрешённого — новый вызов. Меньше — место переехало, и запись
      // о нём должна уйти вместе с ним, иначе реестр начнёт описывать
      // несуществующий долг.
      if (now > may) added.push(`${file}: ${now} вместо ${may}`);
      if (now < may) stale.push(`${file}: ${now} вместо ${may}`);
    }

    expect({ invalid, added, stale }).toEqual({
      invalid: [],
      added: [],
      stale: [],
    });
  });

  test('в разделе «Контент» подсказка уже одна', () => {
    const actual = countTooltips();
    const strays = Object.keys(actual).filter((file) =>
      /brand-voice|content-intelligence/.test(file)
    );

    // Раздел переписан целиком и служит образцом: если унаследованный слой
    // появится здесь, значит образец перестал быть образцом.
    expect(strays).toEqual([]);
  });

  test('`Hint` живёт в дизайн-системе и экспортируется из неё', () => {
    const index = fs.readFileSync(
      path.join(repositoryRoot, 'libraries/react-shared-libraries/src/layout/index.ts'),
      'utf8'
    );

    expect(index).toContain("export { Hint } from './hint'");
    // Копия в приложении — это ровно тот случай, ради которого страж написан.
    const copies = sourceFiles(path.join(repositoryRoot, SOURCE_ROOT)).filter(
      (filePath) => /\/hint\.tsx$/.test(filePath)
    );
    expect(copies).toEqual([]);
  });
});
