'use strict';

/**
 * `content-factory-next-pdbe`, point 1: the editorial stage is visible and
 * changeable in the post editor, as a real choice among the four values plus
 * "unset" — not only readable as a label.
 *
 * `editorial-stage.frontend-controls.test.cjs` renders `EditorialStageSelect`
 * itself and proves the five options exist and report the right values.
 * This suite is the wiring around it: the store carries the value, the
 * editor seeds it from the post being edited, and the save payload puts it
 * where the server DTO expects it — on each per-integration post in
 * `posts[]` (`class Post` in `create.post.dto.ts`), not on the top-level
 * request body (that field only exists on `Post`).
 */

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const storeSource = read('apps/frontend/src/components/new-launch/store.ts');
const addEditSource = read(
  'apps/frontend/src/components/new-launch/add.edit.modal.tsx'
);
const manageSource = read(
  'apps/frontend/src/components/new-launch/manage.modal.tsx'
);

describe('the store carries the editorial stage as its own field', () => {
  test('a value slot and a setter exist, typed as the stage value or null', () => {
    expect(storeSource).toMatch(/editorialStage:\s*EditorialStageValue \| null;/);
    expect(storeSource).toMatch(/setEditorialStage:/);
  });

  test('null is the real initial value, not an unset TypeScript field', () => {
    expect(storeSource).toMatch(/editorialStage:\s*null as EditorialStageValue \| null,/);
  });
});

describe('the editor seeds the stage from the post being opened', () => {
  test('an existing post\'s stage is read into the store, defaulting to null', () => {
    // Deliberately blind to a cast between `posts[0]` and `.editorialStage`.
    // An earlier version of this pinned `(… as any)?.editorialStage` letter for
    // letter, so removing an unnecessary `as any` — a strict improvement, since
    // the Prisma `Post` type carries this field and the compiler should be the
    // one checking it — turned the guard red for the wrong reason. What matters
    // here is that the stage is seeded from the post being opened and falls
    // back to null, not how the expression is spelled.
    expect(addEditSource).toMatch(
      /setEditorialStage\(\s*\(?existingData\?\.posts\?\.\[0\][^;]*?\?\.editorialStage \?\? null\s*\)/
    );
  });

  test('the seeding reads the field without switching the compiler off', () => {
    const seeding = addEditSource.match(/setEditorialStage\([^;]*\);/)?.[0];
    expect(seeding).toBeTruthy();
    expect(seeding).not.toMatch(/as any/);
  });
});

describe('the editor renders a picker and saves per post, not on the request root', () => {
  test('the picker is on screen', () => {
    expect(manageSource).toContain('<EditorialStageSelect');
    expect(manageSource).toMatch(/value=\{editorialStage\}/);
    expect(manageSource).toMatch(/onChange=\{setEditorialStage\}/);
  });

  test('the saved stage rides inside each per-integration post entry', () => {
    const postsBlock = manageSource.match(
      /const posts = allValues\.map\(\(post: any\) => \(\{[\s\S]*?\}\)\);/
    )?.[0];
    expect(postsBlock).toBeTruthy();
    expect(postsBlock).toContain('editorialStage,');
  });

  test('the top-level save payload does not also carry a stray editorialStage', () => {
    const dataBlock = manageSource.match(/const data = \{[\s\S]*?\};/)?.[0];
    expect(dataBlock).toBeTruthy();
    expect(dataBlock).not.toContain('editorialStage');
  });
});
