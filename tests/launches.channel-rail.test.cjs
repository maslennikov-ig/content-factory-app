'use strict';
const fs = require('node:fs');
const read = name => fs.readFileSync(`apps/frontend/src/components/launches/${name}`, 'utf8');
test('calendar is full width and has no channel management rail', () => {
  expect(read('launches.component.tsx')).not.toMatch(/AddProviderButton|MenuGroupComponent|collapseMenu|railWidthClass|channelsOnly/);
  expect(read('launches.component.tsx')).toContain('<Filters />');
  expect(read('launches.component.tsx')).toContain('<Calendar />');
});
test('channel selection is persisted and sent before pagination', () => {
  expect(read('filters.tsx')).toContain('value={calendar.integrationId');
  expect(read('filters.tsx')).toContain('href="/channels"');
  const context = read('calendar.context.tsx');
  expect(context).toContain("searchParams.get('integrationId')");
  expect(context).toContain('integrationId=${encodeURIComponent(integrationId)}');
  expect(context.match(/integrationId: filters.integrationId/g)).toHaveLength(3);
});
test('both planning doors open the picker and the cell preserves its exact date', () => {
  expect(read('filters.tsx')).toContain('onClick={() => openPicker()}');
  expect(read('calendar.tsx')).toContain('openPicker(getDate)');
  expect(read('calendar.tsx')).not.toContain('Math.random() * 24');
});
