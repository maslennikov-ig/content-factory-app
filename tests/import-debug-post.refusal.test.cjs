'use strict';

/**
 * `content-factory-next-fn33.81`: окно импорта отладочного поста закрывалось
 * одинаково после успеха и после отказа сервера.
 *
 * Та же поломка, что чинил `content-factory-next-fn33.49` в окне поста, и
 * лечится тем же помощником текста: причина отказа должна звучать в обоих
 * окнах одинаково, а вставленный JSON — не пропадать вместе с окном.
 * Поведение самого помощника проверяет `posts.save-refusal.test.cjs`.
 */

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const modalSource = fs.readFileSync(
  path.join(
    root,
    'apps/frontend/src/components/launches/import-debug-post.modal.tsx'
  ),
  'utf8'
);

describe('the debug import window survives a refused save', () => {
  test('the message helper is reused, not copied', () => {
    expect(modalSource).toMatch(
      /import \{ postSaveErrorMessage \} from '@contentfactory\/frontend\/components\/new-launch\/post-save-error';/
    );
    expect(modalSource).not.toContain('export const postSaveErrorMessage');
    // The layout reaches this modal through `impersonate.tsx`; pulling the
    // whole editor in here made every server render fail on
    // `Reflect.getMetadata` (`content-factory-next-fn33.110`).
    expect(modalSource).not.toMatch(/new-launch\/manage\.modal/);
  });

  test('the answer to /posts is read before anything is called a success', () => {
    const save = modalSource.slice(modalSource.indexOf("const response = await fetch('/posts'"));
    expect(save).toMatch(/const response = await fetch\('\/posts'/);

    const refusal = save.indexOf('if (!response.ok)');
    expect(refusal).toBeGreaterThan(-1);

    const branch = save.slice(refusal, save.indexOf('}', refusal + 20));
    expect(branch).toMatch(/toaster\.show\(\s*await postSaveErrorMessage\(/);
    expect(branch).toMatch(/return;/);
  });

  test('the success toast and close() sit behind the refusal branch', () => {
    const save = modalSource.slice(modalSource.indexOf("const response = await fetch('/posts'"));
    const refusal = save.indexOf('if (!response.ok)');

    expect(save.indexOf('debug_post_imported')).toBeGreaterThan(refusal);
    expect(save.indexOf('close();')).toBeGreaterThan(refusal);
  });

  test('the refusal branch does not close the window', () => {
    const save = modalSource.slice(modalSource.indexOf("const response = await fetch('/posts'"));
    const refusal = save.indexOf('if (!response.ok)');
    const branch = save.slice(refusal, save.indexOf('}', refusal + 20));
    expect(branch).not.toContain('close()');
  });
});
