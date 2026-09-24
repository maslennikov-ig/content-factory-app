'use strict';

/**
 * `content-factory-next-97dq.76` — tails of the consistency audit of the
 * thirteenth walk (`evidence/walk-2026-09-23-thirteenth/consistency-audit.md`).
 * Each block names the audit item it holds.
 */

const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  pretendToBeVisual: true,
  url: 'http://localhost/launches',
});
for (const key of ['window', 'document', 'navigator']) {
  Object.defineProperty(global, key, {
    configurable: true,
    value: key === 'window' ? dom.window : dom.window[key],
  });
}
global.IS_REACT_ACT_ENVIRONMENT = true;

const { act, cleanup, render, fireEvent } = require('@testing-library/react');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const h = React.createElement;

afterEach(cleanup);

describe('§0.4 / §8.1 — the Postiz modal shell is a dialog', () => {
  const modalModule = loadWithMocks(
    'apps/frontend/src/components/layout/new-modal.tsx',
    {
      react: React,
      '@contentfactory/react/translation/get.transation.service.client': {
        useT: () => (_key, fallback) => fallback,
      },
    }
  );

  const mount = (overrides = {}) =>
    act(async () => {
      render(
        h(
          'div',
          null,
          h('button', { id: 'opener' }, 'open'),
          h(modalModule.Component, {
            isLast: true,
            zIndex: 100,
            closeModal: () => {},
            modal: {
              id: 'm1',
              title: 'Настройки канала',
              children: h(
                'div',
                null,
                h('input', { id: 'first-field' }),
                h('button', { id: 'last-action' }, 'Сохранить')
              ),
              ...overrides,
            },
          })
        )
      );
    });

  test('named, modal, and its close button has a name', async () => {
    await mount();
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    const title = document.getElementById(dialog.getAttribute('aria-labelledby'));
    expect(title.textContent).toBe('Настройки канала');
    expect(document.querySelector('button[aria-label="Close"]')).not.toBeNull();
    // The Dialog rhythm rather than a fixed 32/40px.
    expect(dialog.className).toContain('p-[20px]');
    expect(dialog.className).not.toContain('p-[32px]');
  });

  test('Tab from the last control comes back to the first', async () => {
    await mount();
    const dialog = document.querySelector('[role="dialog"]');
    const focusable = dialog.querySelectorAll('input, button');
    const last = focusable[focusable.length - 1];
    last.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(focusable[0]);
  });

  test('the fade is ease-out, as DESIGN.md asks of an entrance', () => {
    expect(read('apps/frontend/tailwind.config.cjs')).toContain(
      "fadeIn: 'normalFadeIn 0.2s ease-out forwards'"
    );
  });
});

describe('§1.3 / §1.4 — one page gutter, one settings measure', () => {
  const PAGES = [
    'apps/frontend/src/components/launches/launches.component.tsx',
    'apps/frontend/src/components/settings/settings-surface.component.tsx',
    'apps/frontend/src/components/content-intelligence/content-section.screen.tsx',
    'apps/frontend/src/components/platform-analytics/production.analytics.view.tsx',
    'apps/frontend/src/components/platform-analytics/audience.analytics.view.tsx',
  ];

  test('the gutter is the cf-page-pad token, defined once', () => {
    expect(read('apps/frontend/tailwind.config.cjs')).toContain("'.cf-page-pad'");
    for (const file of PAGES) {
      const source = read(file);
      expect(source).toContain('cf-page-pad');
      expect(source).not.toMatch(/p-\[20px\] md:p-\[24px\]|mobile:p-\[16px\]/u);
    }
  });

  test('settings tabs share one width', () => {
    for (const file of [
      'apps/frontend/src/components/settings/global.settings.tsx',
      'apps/frontend/src/components/settings/profile.component.tsx',
      'apps/frontend/src/components/settings/sign-in-methods.component.tsx',
    ]) {
      const source = read(file);
      expect(source).toContain('max-w-[960px]');
      expect(source).not.toContain('max-w-[720px]');
    }
  });
});

describe('§2.4 / §2.5 — one section tab strip', () => {
  test('content, analytics, piece and channel draw their tabs from ui/section-tabs', () => {
    for (const file of [
      'apps/frontend/src/components/content-intelligence/content-section.screen.tsx',
      'apps/frontend/src/components/platform-analytics/analytics.screen.tsx',
      'apps/frontend/src/components/content-intelligence/pieces/piece.screen.tsx',
      'apps/frontend/src/components/channels/channel-screen.tsx',
    ]) {
      expect(read(file)).toMatch(/sectionTabClass\(/u);
    }
  });

  test('the section panels enter with cf-tab-enter', () => {
    const strip = read('apps/frontend/src/components/ui/section-tabs.tsx');
    expect(strip).toContain("useEnterMotion<HTMLDivElement>(value, 'cf-tab-enter')");
    for (const file of [
      'apps/frontend/src/components/content-intelligence/content-section.screen.tsx',
      'apps/frontend/src/components/platform-analytics/analytics.screen.tsx',
    ]) {
      expect(read(file)).toContain('<SectionTabPanel');
    }
  });
});

describe('§2.2 — filter chips live in ui/', () => {
  test('the pieces list takes FilterChips and keeps its data hooks', () => {
    const pieces = read(
      'apps/frontend/src/components/content-intelligence/pieces/pieces.screen.tsx'
    );
    expect(pieces).not.toMatch(/function ChipFilter/u);
    expect(pieces.match(/<FilterChips\s+dataPrefix="piece"/gu)).toHaveLength(2);
    expect(read('apps/frontend/src/components/ui/filter-chips.tsx')).toContain(
      'export function FilterChips('
    );
  });
});

describe('§3.3 / §3.4 / §7.4 — buttons own their geometry; the time table is on tokens', () => {
  test('no call site repaints a Button with px-/py-/rounded-lg', () => {
    for (const file of [
      'apps/frontend/src/components/launches/time.table.tsx',
      'apps/frontend/src/components/launches/helpers/media.settings.component.tsx',
      'apps/frontend/src/components/launches/calendar.tsx',
    ]) {
      expect(read(file)).not.toMatch(/px-[46] py-2 rounded-lg/u);
    }
  });

  test('the slot delete is always visible and named', () => {
    const table = read('apps/frontend/src/components/launches/time.table.tsx');
    expect(table).not.toMatch(/opacity-0 group-hover:opacity-100/u);
    expect(table).toMatch(/aria-label=\{`\$\{t\('remove', 'Remove'\)\} \$\{timeSlot\.formatted\}`\}/u);
    expect(table).toContain('<EmptyState');
    expect(table).not.toMatch(/newBgColorInner|newTableBorder|newTextColor/u);
  });
});

describe('§4.3–§4.6 — one field label, hints beside words, filters in a row', () => {
  test('no local LabelledField copies; the shared one lives with FieldLabel', () => {
    expect(read('apps/frontend/src/components/ui/field-label.tsx')).toContain(
      'export function LabelledField('
    );
    for (const file of [
      'apps/frontend/src/components/settings/ai-provider.component.tsx',
      'apps/frontend/src/components/admin/admin-ai-defaults.component.tsx',
    ]) {
      expect(read(file)).not.toMatch(/const LabelledField = \(/u);
    }
    const provider = read('apps/frontend/src/components/settings/ai-provider.component.tsx');
    expect(provider).toMatch(/const BlockHeading[\s\S]*?<FieldLabel\s+headingLevel=\{5\}/u);
  });

  test('the versions hint sits beside its words, not inside a <p>', () => {
    const versions = read('apps/frontend/src/components/brand-voice/voice-versions.screen.tsx');
    expect(versions).not.toMatch(/<p[^>]*>\s*\{t\.versionsPick\}\s*<Hint/u);
    expect(versions).toMatch(/<FieldLabel\s+label=\{t\.versionsPick\}/u);
  });

  test('Производство filters are one FiltersRow with accessible names', () => {
    const production = read('apps/frontend/src/components/platform-analytics/production.analytics.tsx');
    expect(production).toContain('<FiltersRow');
    expect(production.match(/<Select\s+standalone\s+aria-label=/gu)).toHaveLength(2);
    expect(production).not.toMatch(/min-w-\[150px\]/u);
  });
});

describe('§5.1 / §5.4 / §5.5 — one pill, no hex badge, one popover trigger', () => {
  test('StagePill and PlanStatePill are dense Status pills', () => {
    const parts = read('apps/frontend/src/components/launches/post-card.parts.tsx');
    const stage = parts.slice(parts.indexOf('export const StagePill'), parts.indexOf('export type PostCardAction'));
    expect(stage).toMatch(/<Status tone=\{tone\} density="dense"/u);
    const plan = parts.slice(parts.indexOf('export const PlanStatePill'), parts.indexOf('export const PlanBand'));
    expect(plan).toMatch(/<Status[\s\S]*density="dense"[\s\S]*paint=\{PLAN_STATE_CLASS\[state\]\}/u);
    expect(read('apps/frontend/src/components/ui/surface.tsx')).toMatch(
      /density === 'dense' \? 'h-\[20px\]' : 'h-\[22px\]'/u
    );
  });

  test('the creation-method badge paints with tokens, not hex', () => {
    const badge = read('apps/frontend/src/components/launches/creation.method.badge.tsx')
      .replace(/\/\/.*$/gmu, '');
    expect(badge).not.toMatch(/#[0-9a-f]{6}/iu);
    expect(badge).not.toMatch(/text-white|\buppercase\b/u);
  });

  test('the slot popover and the plan-ahead chip share usePopoverTrigger', () => {
    for (const file of [
      'apps/frontend/src/components/launches/calendar.tsx',
      'apps/frontend/src/components/launches/plan-ahead.tsx',
    ]) {
      const source = read(file);
      expect(source).toContain('usePopoverTrigger<');
      expect(source).not.toMatch(/addEventListener\('mousedown'/u);
    }
  });
});

describe('§6.1–§6.4 — headers, profile sections, metrics, top bar', () => {
  test('Производство opens on a PageHeader with no in-page H2', () => {
    const view = read('apps/frontend/src/components/platform-analytics/production.analytics.view.tsx');
    expect(view).toContain('<PageHeader');
    expect(view).not.toMatch(/<h2 className="cf-heading-lg/u);
    expect(view).toContain('aria-label={t.title}');
  });

  test('Profile sections are settings rows, like Global settings', () => {
    const profile = read('apps/frontend/src/components/settings/profile.component.tsx');
    expect(profile.match(/<SettingsSection layout="row"/gu)).toHaveLength(2);
    expect(profile).not.toContain('<SectionLabel');
  });

  test('measured numbers are one Metric card with cf-display-num', () => {
    expect(read('apps/frontend/src/components/ui/metric.tsx')).toContain('cf-display-num');
    for (const file of [
      'apps/frontend/src/components/platform-analytics/production.analytics.view.tsx',
      'apps/frontend/src/components/platform-analytics/audience.analytics.view.tsx',
      'apps/frontend/src/components/launches/plan-ahead.tsx',
    ]) {
      expect(read(file)).toContain('<Metric');
    }
    expect(read('apps/frontend/src/components/platform-analytics/audience.analytics.view.tsx')).not.toMatch(/cf-heading-lg mt-\[16px\] tabular-nums/u);
  });

  test('the top bar title is cf-heading-md, not hand-typed', () => {
    const layout = read('apps/frontend/src/components/new-layout/layout.component.tsx');
    expect(layout).not.toMatch(/text-\[18px\] font-\[650\]/u);
    expect(layout).toContain('flex-1 min-w-0 cf-heading-md truncate');
  });
});

describe('§7.3 / §9 — Аудитория on the shared states; one language hook', () => {
  test('Аудитория draws loading, error, empty and restricted with ui/surface', () => {
    const view = read('apps/frontend/src/components/platform-analytics/audience.analytics.view.tsx');
    for (const part of ['<SkeletonRows', '<ErrorState', '<EmptyState', '<RestrictedState']) {
      expect(view).toContain(part);
    }
    expect(view).toContain('onClick={onRetry}');
    expect(read('apps/frontend/src/components/platform-analytics/platform.analytics.tsx')).toContain('onRetry={');
  });

  test('the section shells read the language through useInterfaceLanguage', () => {
    for (const file of [
      'apps/frontend/src/components/platform-analytics/platform.analytics.tsx',
      'apps/frontend/src/components/platform-analytics/production.analytics.tsx',
      'apps/frontend/src/components/content-intelligence/content-section.screen.tsx',
      'apps/frontend/src/components/layout/settings.component.tsx',
    ]) {
      const source = read(file);
      expect(source).toContain('useInterfaceLanguage()');
      expect(source).not.toMatch(/i18next\.resolvedLanguage/u);
    }
  });
});


/**
 * §7.1 — hand-written cards. `rounded-[8px] border border-cf-border
 * bg-cf-surface p-[16|20|24px]` is `Panel` typed out; 56 of them stood beside
 * ten `Panel` users. Производство and Аудитория moved on 24.09.2026. The
 * ledger is per file and may only shrink — a new card takes `Panel`.
 */
const HAND_CARD_LEDGER = {
  'apps/frontend/src/components/admin/admin-stats.component.tsx': 1,
  'apps/frontend/src/components/admin/admin-users.component.tsx': 1,
  'apps/frontend/src/components/brand-voice/draft-gap-note.tsx': 1,
  'apps/frontend/src/components/brand-voice/voice-analysis.screen.tsx': 4,
  'apps/frontend/src/components/brand-voice/voice-avatar.screen.tsx': 1,
  'apps/frontend/src/components/brand-voice/voice-avatars.screen.tsx': 2,
  'apps/frontend/src/components/brand-voice/voice-brief.container.tsx': 2,
  'apps/frontend/src/components/brand-voice/voice-brief.screen.tsx': 2,
  'apps/frontend/src/components/brand-voice/voice-empty.screen.tsx': 1,
  'apps/frontend/src/components/brand-voice/voice-learning.screen.tsx': 1,
  'apps/frontend/src/components/brand-voice/voice-materials.screen.tsx': 1,
  'apps/frontend/src/components/brand-voice/voice-proposal.screen.tsx': 1,
  'apps/frontend/src/components/brand-voice/voice-redactions.screen.tsx': 2,
  'apps/frontend/src/components/brand-voice/voice-samples.screen.tsx': 2,
  'apps/frontend/src/components/brand-voice/voice-scales.screen.tsx': 1,
  'apps/frontend/src/components/brand-voice/voice-versions.screen.tsx': 2,
  'apps/frontend/src/components/brand-voice/voice-wizard.container.tsx': 1,
  'apps/frontend/src/components/content-intelligence/content-facts.container.tsx': 1,
  'apps/frontend/src/components/content-intelligence/content-intelligence.view.tsx': 3,
  'apps/frontend/src/components/content-intelligence/content-leads.tab.tsx': 6,
  'apps/frontend/src/components/content-intelligence/content-search.container.tsx': 1,
  'apps/frontend/src/components/content-intelligence/intake/intake.research.tsx': 1,
  'apps/frontend/src/components/content-intelligence/intake/questions.card.tsx': 2,
  'apps/frontend/src/components/content-intelligence/shared/draft-result.tsx': 1,
  'apps/frontend/src/components/launches/plan-ahead.tsx': 2,
  'apps/frontend/src/components/layout/settings.component.tsx': 1,
  'apps/frontend/src/components/new-launch/picks.socials.component.tsx': 1,
  'apps/frontend/src/components/new-launch/unverified-evidence.note.tsx': 1,
  'apps/frontend/src/components/settings/about-project.component.tsx': 1,
  'apps/frontend/src/components/settings/github.component.tsx': 2,
  'apps/frontend/src/components/settings/signatures.component.tsx': 1,
  'apps/frontend/src/components/settings/teams.component.tsx': 1,
};

describe('§7.1 — hand-written cards only shrink', () => {
  const walk = (dir, out = []) => {
    for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const child = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(child, out);
      else if (entry.name.endsWith('.tsx')) out.push(child);
    }
    return out;
  };
  const countCards = (source) => {
    let n = 0;
    for (const match of source.matchAll(/(["'`])([^"'`\n]*?)\1/gu)) {
      const tokens = match[2].split(/\s+/u);
      if (
        tokens.includes('rounded-[8px]') &&
        tokens.includes('border') &&
        tokens.includes('border-cf-border') &&
        tokens.includes('bg-cf-surface') &&
        tokens.some((token) => /^p-\[(16|20|24)px\]$/u.test(token))
      )
        n += 1;
    }
    return n;
  };

  test('no file holds more hand cards than the ledger allows', () => {
    const grown = [];
    const stale = [];
    for (const file of walk('apps/frontend/src/components')) {
      const count = countCards(read(file));
      const allowed = HAND_CARD_LEDGER[file] ?? 0;
      if (count > allowed) grown.push(`${file}: ${count} > ${allowed}`);
      if (count < allowed) stale.push(`${file}: ${count} < ${allowed} — lower the ledger`);
    }
    expect({ grown, stale }).toEqual({ grown: [], stale: [] });
  });
});

describe('§8.2 — every transition in the working sections uses duration-state', () => {
  test('no transition without the state duration', () => {
    const dirs = ['launches', 'content-intelligence', 'platform-analytics', 'settings', 'layout', 'new-layout'];
    const offenders = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
        const child = `${dir}/${entry.name}`;
        if (entry.isDirectory()) walk(child);
        else if (entry.name.endsWith('.tsx')) {
          const source = read(child);
          for (const match of source.matchAll(/(["'`])([^"'`\n]*?)\1/gu)) {
            const tokens = match[2].split(/\s+/u);
            if (
              tokens.some((token) => /^(hover:)?transition(-[a-z]+)?$/u.test(token)) &&
              !tokens.includes('duration-state')
            )
              offenders.push(child);
          }
        }
      }
    };
    for (const dir of dirs) walk(`apps/frontend/src/components/${dir}`);
    expect(offenders).toEqual([]);
  });
});

describe('caps and dead keys named by the audit tail', () => {
  const locales = fs
    .readdirSync(path.join(root, 'libraries/react-shared-libraries/src/translation/locales'))
    .filter((locale) =>
      fs.existsSync(path.join(root, `libraries/react-shared-libraries/src/translation/locales/${locale}/translation.json`))
    );
  const bundle = (locale) =>
    JSON.parse(read(`libraries/react-shared-libraries/src/translation/locales/${locale}/translation.json`));

  test.each(locales)('%s: the billing placeholders are sentences, not shouted', (locale) => {
    const messages = bundle(locale);
    for (const key of ['select_country', 'add_free_subscription']) {
      expect(messages[key]).not.toMatch(/--/u);
      expect(messages[key]).not.toMatch(/^[^a-zа-яё]*[A-ZА-ЯЁÀ-Ý]{2,}[^a-zа-яё]*$/u);
    }
  });

  test.each(locales)('%s: dead AI hint keys are gone', (locale) => {
    const messages = bundle(locale);
    for (const key of ['text_model_hint', 'image_model_hint', 'ai_role_models_hint']) {
      expect(messages).not.toHaveProperty(key);
    }
  });
});
