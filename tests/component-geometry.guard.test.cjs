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

/**
 * Карточка вкладки настроек, написанная руками.
 *
 * Владелец 13.09.2026: «некоторые области выделены отдельными блоками, а
 * некоторые нет». Три раздела писали эти шесть решений полностью, каждый у
 * себя, а четвёртый — раздел ИИ — не писал ни одного и рисовался голым `div`
 * с верхней границей. Сегодня их рисует `SettingsSection` поверх общего
 * `Panel`; пятая копия строки — это тот же долг, начатый заново.
 */
const hasSettingsCardGeometry = (line) =>
  ['rounded-[8px]', 'border-cf-border', 'bg-cf-surface', 'p-[24px]'].every(
    (part) => line.includes(part)
  );

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

  test('the detector catches a hand-written settings card', () => {
    expect(
      hasSettingsCardGeometry(
        "'my-[16px] rounded-[8px] border border-cf-border bg-cf-surface p-[24px]'"
      )
    ).toBe(true);
  });

  test('no settings component writes the card geometry out by hand', () => {
    /**
     * Заморожено, а не исправлено: остальные девять вкладок настроек живут на
     * унаследованной палитре и переезжают отдельной работой. Правило заведено
     * так же, как остальные правила репозитория, — старое перечислено
     * поимённо, новое падает, а число здесь только уменьшается.
     */
    const GRANDFATHERED = [
      'apps/frontend/src/components/settings/github.component.tsx',
      'apps/frontend/src/components/settings/signatures.component.tsx',
      'apps/frontend/src/components/settings/teams.component.tsx',
    ];
    const owners = matches(hasSettingsCardGeometry).map((hit) =>
      hit.replace(/:\d+$/u, '')
    );
    expect([
      ...new Set(
        owners.filter(
          (file) =>
            file.includes('/settings/') && !GRANDFATHERED.includes(file)
        )
      ),
    ]).toEqual([]);

    // И все четыре раздела вкладки берут её у одного компонента.
    for (const component of [
      'ai-provider.component.tsx',
      'email-notifications.component.tsx',
      'metric.component.tsx',
      'shortlink-preference.component.tsx',
    ]) {
      expect(
        fs.readFileSync(path.join(ROOT, 'settings', component), 'utf8')
      ).toContain('settings/settings-section');
    }

    // А сам он не пишет её третьим способом, а просит у `Panel`.
    const section = fs.readFileSync(
      path.join(ROOT, 'settings/settings-section.tsx'),
      'utf8'
    );
    expect(section).toContain('<Panel');
    expect(section.split('\n').filter(hasSettingsCardGeometry)).toEqual([]);
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
