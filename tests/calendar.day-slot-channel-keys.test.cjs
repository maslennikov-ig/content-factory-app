'use strict';

/**
 * Пустой слот дневного вида рисует значки первых четырёх каналов.
 *
 * Стенд 22.09.2026: с двумя каналами Telegram в одной области React писал
 * «Encountered two children with the same key, `telegram`» по разу на каждый
 * слот дня — ключом был `identifier` площадки, а не id канала. Два канала
 * одной площадки — обычное дело (группа и канал, два проекта), поэтому ключ —
 * id канала.
 */

const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.join(__dirname, '../apps/frontend/src/components/launches/calendar.tsx'),
  'utf8'
);

test('day-view slot icons are keyed by the channel id, not by the platform', () => {
  const start = source.indexOf('integrations.slice(0, 4).map((selectedIntegrations)');
  expect(start).toBeGreaterThan(-1);
  const block = source.slice(start, start + 400);
  expect(block).toContain('key={selectedIntegrations.id}');
  expect(block).not.toContain('key={selectedIntegrations.identifier}');
});
