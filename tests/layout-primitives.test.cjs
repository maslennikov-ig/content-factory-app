const fs = require('node:fs');
const path = require('node:path');

const repositoryRoot = path.resolve(__dirname, '..');

const read = (relativePath) =>
  fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8');

const sharedLayout = (name) =>
  `libraries/react-shared-libraries/src/layout/${name}`;

describe('shared layout primitives', () => {
  test('exports the counted page and panel layout contract on the 4px rhythm', () => {
    const panel = read(sharedLayout('panel.tsx'));
    const header = read(sharedLayout('page-header.tsx'));
    const shell = read(sharedLayout('page-shell.tsx'));
    const spacing = read(sharedLayout('spacing.ts'));

    expect(panel).toContain('export const Panel');
    expect(header).toContain('export const PageHeader');
    expect(shell).toContain('export const PageShell');
    expect(spacing).toContain('export const layoutSpacing');

    // `layoutSpacing` was imported by nothing but this test, and it declared a
    // 24px page gutter while both primitives shipped 20px. A constant no code
    // reads cannot be wrong in a way anyone notices, so bind it: whatever
    // `pageGutter` says is what `PageShell` and a default `Panel` must render.
    const pageGutter = spacing.match(/pageGutter: '(\d+px)'/)?.[1];
    expect(pageGutter).toBeTruthy();
    expect(shell).toContain(`p-[${pageGutter}]`);
    expect(panel).toContain(`default: 'p-[${pageGutter}]'`);
    expect(panel).toContain(
      "export type PanelContentPadding = 'default' | 'compact' | 'none'"
    );
    expect(panel).toContain('contentPadding?: PanelContentPadding;');
    expect(panel).toContain("compact: 'p-[12px]'");
    expect(panel).toContain("default: 'p-[20px]'");
    expect(panel).toContain("none: ''");
    expect(panel).toContain('CONTENT_PADDING[contentPadding]');
    expect(panel).not.toContain("clsx('p-[20px]', contentClassName)");

    for (const source of [panel, header, shell, spacing]) {
      const offRhythm = [...source.matchAll(/\[(\d+)px\]/g)]
        .map((match) => Number(match[1]))
        .filter((pixels) => pixels % 4 !== 0);

      expect(offRhythm).toEqual([]);
    }
  });

  test('keeps app-local Panel and PageHeader imports compatible through the shared implementation', () => {
    const facade = read('apps/frontend/src/components/ui/surface.tsx');

    expect(facade).toContain(
      "export { Panel, PageHeader } from '@contentfactory/react/layout'"
    );
    expect(facade).not.toMatch(/export const (Panel|PageHeader)/);
  });

  test('migrates both admin routes and their content to the shared page, header, and panel primitives', () => {
    const usersPage = read(
      'apps/frontend/src/app/(app)/(site)/admin/users/page.tsx'
    );
    const errorsPage = read(
      'apps/frontend/src/app/(app)/(site)/admin/errors/page.tsx'
    );
    const users = read(
      'apps/frontend/src/components/admin/admin-users.component.tsx'
    );
    const errors = read(
      'apps/frontend/src/components/admin/admin-errors.component.tsx'
    );

    for (const page of [usersPage, errorsPage]) {
      expect(page).toContain('@contentfactory/react/layout');
      expect(page).toContain('<PageShell>');
      expect(page).not.toContain('bg-newBgColorInner');
    }

    for (const component of [users, errors]) {
      expect(component).toContain('@contentfactory/react/layout');
      expect(component).toContain('<PageHeader');
      expect(component).toContain('<Panel as="div" contentPadding="compact">');
      expect(component).not.toContain('contentClassName="p-[12px]"');
    }
  });
});
