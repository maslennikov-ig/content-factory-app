const { scanInterfaceEnglish } = require('./helpers/interface-english-scan.cjs');

/**
 * No English on a Russian screen that did not ask to be translated.
 *
 * The owner kept finding English in the Russian interface — confirmation
 * dialogs, provider settings, admin pages, notifications — and every case was
 * text that never went through `t()` or a bilingual copy object. The scanner
 * (`tests/helpers/interface-english-scan.cjs`) explains what it looks at; run it
 * directly with `node tests/helpers/interface-english-scan.cjs` for a list.
 *
 * The exemptions are exact (file and text, not line) and checked in both
 * directions, so one that stops matching has to be removed with it. Each says
 * why the text is not interface copy in need of Russian.
 */
const EXEMPT = [
  // Brand and product names.
  ['apps/frontend/src/app/(app)/layout.tsx', 'Content Factory', 'Product name in the page metadata.'],
  ['apps/frontend/src/app/manifest.ts', 'Content Factory', 'Product name in the web app manifest.'],
  ['apps/frontend/src/components/public-saas/public-shell.tsx', 'Content Factory', 'Product name as the wordmark.'],
  ['apps/frontend/src/components/public-saas/public-shell.tsx', 'Content Factory · AGPL-3.0', 'Product name and licence.'],
  ['apps/frontend/src/components/public-saas/legal-document.tsx', 'CONTENT FACTORY', 'Product name as the wordmark.'],
  ['apps/frontend/src/components/public-saas/public-info-page.tsx', 'CONTENT FACTORY', 'Product name as the wordmark.'],
  ['apps/frontend/src/components/media/image-editor/image-editor-surface.tsx', 'Golos Text', 'Font name.'],
  ['apps/frontend/src/components/media/image-editor/image-editor-surface.tsx', 'JetBrains Mono', 'Font name.'],
  // Machine-facing text.
  ['apps/frontend/src/app/(app)/layout.tsx', 'Plan, draft, review and publish content across channels in one workspace.', 'Meta description for crawlers and link previews, not rendered on screen.'],
  ['apps/frontend/src/app/(public)/layout.tsx', 'Plan, draft, review and schedule content in one workspace.', 'Meta description for crawlers and link previews, not rendered on screen.'],
  ['apps/frontend/src/app/manifest.ts', 'Plan, draft, review and publish content across channels in one workspace.', 'Web app manifest read by the browser.'],
  ['apps/frontend/src/components/layout/new-modal.tsx', 'body, html { overflow: hidden !important; }', 'CSS injected while a modal is open.'],
  ['apps/frontend/src/components/agents/agent.chat.tsx', 'This tool should be triggered when the user wants to manually add the generated post', 'Tool description read by the model.'],
  ['apps/frontend/src/components/agents/agent.chat.tsx', 'The integration id', 'Tool parameter description read by the model.'],
  ['apps/frontend/src/components/agents/agent.chat.tsx', 'UTC date of the scheduled post', 'Tool parameter description read by the model.'],
  ['apps/frontend/src/components/agents/agent.chat.tsx', 'Settings for the integration [input:settings]', 'Tool parameter description read by the model.'],
  ['apps/frontend/src/components/launches/helpers/pick.platform.component.tsx', 'List of integrations id to set as selected', 'Tool parameter description read by the model.'],
  ['apps/frontend/src/components/new-launch/editor.tsx', 'Current content of posts', 'Readable context description for the model.'],
  ['apps/frontend/src/components/admin/admin-errors.component.tsx', 'user@example.com', 'Example address in a placeholder; the format is the point.'],
  // Deliberately foreign content.
  ['apps/frontend/src/components/public-saas/home-shots.tsx', 'Short-form video benchmarks, 2026', 'Sample source titles on the landing page, one per language on purpose.'],
  ['apps/frontend/src/components/public-saas/home-shots.tsx', 'B2B-Content im Wandel: Formate und Kanäle', 'Sample source titles on the landing page, one per language on purpose.'],
  ['apps/frontend/src/components/public-saas/home-shots.tsx', 'Vídeo corto y atención: datos de plataformas', 'Sample source titles on the landing page, one per language on purpose.'],
  ['apps/frontend/src/components/public-saas/home-shots.tsx', 'Éditorial après le virage vidéo', 'Sample source titles on the landing page, one per language on purpose.'],
  ['apps/frontend/src/components/public-saas/home-shots.tsx', 'Formatos curtos e o plano editorial', 'Sample source titles on the landing page, one per language on purpose.'],
  // Dates whose dayjs locale is set another way.
  ['apps/frontend/src/components/launches/calendar.tsx', "day.format('dddd')", 'The calendar sets the global dayjs locale to the interface language before rendering.'],
  ['apps/frontend/src/components/launches/filters.tsx', "startDate.format('dddd (L)')", 'Rendered inside the calendar, which sets the global dayjs locale.'],
  ['apps/frontend/src/components/launches/filters.tsx', "startDate.format('MMMM YYYY')", 'Rendered inside the calendar, which sets the global dayjs locale.'],
  ['apps/frontend/src/components/notifications/notification.component.tsx', 'createdAt.fromNow()', '`createdAt` comes from `interfaceDayjs`.'],
];

describe('interface text goes through translation', () => {
  test('no English literal reaches the screen untranslated, minus exact exemptions', () => {
    const findings = scanInterfaceEnglish();
    const exempt = new Set(EXEMPT.map(([file, text]) => `${file}\n${text}`));
    const seen = new Set();

    const unexpected = findings
      .filter((f) => {
        const id = `${f.file}\n${f.text}`;
        if (exempt.has(id)) {
          seen.add(id);
          return false;
        }
        return true;
      })
      .map((f) => `${f.file}:${f.line} [${f.kind}] ${f.text}`);
    const stale = [...exempt].filter((id) => !seen.has(id)).map((id) => id.replace('\n', ' :: '));

    expect({ unexpected, stale }).toEqual({ unexpected: [], stale: [] });
  });

  test('every exemption says why', () => {
    expect(EXEMPT.filter(([, , reason]) => !reason || reason.length < 10)).toEqual([]);
  });
});
