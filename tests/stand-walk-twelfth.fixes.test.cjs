'use strict';
/**
 * Small fixes from the twelfth stand walk (23.09.2026,
 * `.codex/stages/content-factory-next-97dq/evidence/stand-walk-2026-09-23-twelfth/`)
 * that live in shared primitives. Each check names the screenshot it answers.
 */
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

describe('twelfth stand walk: shared fixes', () => {
  test('a fixed-width dialog never outgrows the phone screen (12-picker-m)', () => {
    const modal = read('apps/frontend/src/components/layout/new-modal.tsx');
    expect(modal).toContain("{ maxWidth: 'calc(100vw - 32px)' }");
  });

  test('a disabled primary goes neutral on the dark ground (01-channel-top-d)', () => {
    const button = read('libraries/react-shared-libraries/src/form/button.tsx');
    const primary = button.match(/ {2}primary:\n([\s\S]*?)PRESSED_ON_FILL/)?.[1] ?? '';
    expect(primary).toContain('dark:disabled:bg-cf-surface-subtle');
    expect(primary).toContain('dark:disabled:text-cf-ink-muted');
    // The anchor branch refuses through `aria-disabled`, not `disabled`.
    expect(primary).toContain('dark:aria-disabled:bg-cf-surface-subtle');
  });

  test('the «⋯» trigger draws filled dots (15-signin-d)', () => {
    const parts = read('apps/frontend/src/components/launches/post-card.parts.tsx');
    const dots = parts.match(/export const DotsIcon = \(\) => \([\s\S]*?\);/)?.[0] ?? '';
    expect(dots).toContain('fill="currentColor"');
    expect(dots).toContain('stroke="none"');
  });

  test('the editor text keeps an inset from its focus ring (04-editor-open-d)', () => {
    const editor = read(
      'apps/frontend/src/components/content-intelligence/pieces/adaptation-rich-text.tsx'
    );
    expect(editor).toContain('-mx-[8px] -my-[4px] px-[8px] py-[4px]');
  });

  test('the short-link select is wide enough for «Спрашивать каждый раз» (14-global-full-d)', () => {
    const shortlink = read(
      'apps/frontend/src/components/settings/shortlink-preference.component.tsx'
    );
    expect(shortlink).not.toContain('className="w-[200px]"');
    expect(shortlink).toContain('w-full sm:w-[260px]');
  });

  test('AI spend by member carries the member name (14-global-full-d)', () => {
    const service = read('libraries/nestjs-libraries/src/openai/ai.provider.service.ts');
    expect(service).toContain('select: { id: true, email: true, name: true, lastName: true }');
    expect(service).toMatch(/name: row\.userId \? nameOf\(byId\.get\(row\.userId\)\) : null/);
  });
});
