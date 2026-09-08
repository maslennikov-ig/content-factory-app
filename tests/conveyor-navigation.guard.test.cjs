'use strict';
const fs = require('node:fs');
const path = require('node:path');
const read = (file) => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
const base = 'apps/frontend/src/components/';

test('Channels owns its directory while the calendar is full width', () => {
  expect(read('apps/frontend/src/app/(app)/(site)/channels/page.tsx')).toContain('<ChannelsScreen />');
  expect(read('apps/frontend/src/app/(app)/(site)/channels/[id]/page.tsx')).toContain('<ChannelScreen />');
  const component = read(base + 'launches/launches.component.tsx');
  expect(component).not.toMatch(/channelsOnly|railWidthClass|AddProviderButton|collapseMenu/);
  expect(component).toContain('<Calendar />');
  expect(read(base + 'launches/filters.tsx')).toContain('href="/channels"');
  for (const file of ['channels/channels-screen.tsx', 'channels/channel-screen.tsx']) {
    expect(read(base + file)).toContain('<CalendarContext.Provider');
    expect(read(base + file)).not.toContain('CalendarWeekProvider');
  }
});

test('intake, piece and onboarding point to the channel list', () => {
  for (const file of ['content-intelligence/intake/intake.screen.tsx', 'content-intelligence/pieces/piece.screen.tsx']) {
    expect(read(base + file)).toContain('href="/channels"');
  }
  expect(read(base + 'onboarding/onboarding.adapter.ts')).toContain("channel: '/channels'");
});

test('the calendar editor offers an encoded piece link only when a relation exists', () => {
  const editor = read(base + 'new-launch/manage.modal.tsx');
  expect(editor).toContain('existingData.posts?.[0]?.contentPieceId &&');
  expect(editor).toContain('/content/pieces/${encodeURIComponent(existingData.posts[0].contentPieceId)}');
  expect(editor).toContain("'К заготовке' : 'Go to piece'");
  expect(editor).toContain('event.preventDefault()');
});
