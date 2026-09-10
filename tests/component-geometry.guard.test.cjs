'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve('apps/frontend/src/components');
const STATUS = path.join(ROOT, 'ui/surface.tsx');
const FILTERS_ROW = path.join(ROOT, 'ui/filters-row.tsx');

const sourceFiles = (directory) =>
  fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(absolute);
    return /\.tsx$/u.test(entry.name) ? [absolute] : [];
  });

const hasHandwrittenStatusGeometry = (line) =>
  ['rounded-full', 'border', 'px-[8px]', 'py-[4px]'].every((part) =>
    line.includes(part)
  );

const hasFiltersRowGeometry = (line) =>
  line.includes('flex min-w-0 flex-wrap items-center gap-[12px]');

const matches = (predicate) =>
  sourceFiles(ROOT).flatMap((file) =>
    fs
      .readFileSync(file, 'utf8')
      .split('\n')
      .flatMap((line, index) =>
        predicate(line)
          ? [`${path.relative(process.cwd(), file)}:${index + 1}`]
          : []
      )
  );

describe('shared component geometry stays shared', () => {
  test('the detector catches a third handwritten status pill', () => {
    expect(
      hasHandwrittenStatusGeometry(
        "'inline-flex rounded-full border px-[8px] py-[4px]'"
      )
    ).toBe(true);
  });

  test('a third handwritten status pill cannot enter the tree', () => {
    const canonical = fs.readFileSync(STATUS, 'utf8');
    expect(canonical).toContain('rounded-full border cf-label-sm');
    // The two hits are owned by the concurrent avatar stream and disappear in
    // the integrated stage. This guard already rejects a third family member.
    expect(matches(hasHandwrittenStatusGeometry).length).toBeLessThan(3);
  });

  test('only FiltersRow owns the list-toolbar row', () => {
    const owners = matches(hasFiltersRowGeometry).map((hit) =>
      hit.replace(/:\d+$/u, '')
    );
    expect(owners).toEqual([path.relative(process.cwd(), FILTERS_ROW)]);

    for (const screen of [
      path.join(ROOT, 'channels/channels-screen.tsx'),
      path.join(ROOT, 'content-intelligence/pieces/pieces.screen.tsx'),
    ]) {
      expect(fs.readFileSync(screen, 'utf8')).toContain('ui/filters-row');
    }
  });
});
