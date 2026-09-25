'use strict';

/**
 * `content-factory-next-2q28.7`. The on-screen tour is started by a link
 * (`?tour=<key>`) that another part of onboarding emits, and finds its
 * controls by `data-tour` attributes on screens it does not own. Both ends of
 * that contract are strings, so nothing but this test notices when one side
 * renames its half.
 */

const fs = require('node:fs');
const path = require('node:path');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const root = path.resolve(__dirname, '..');
const contract = loadTypeScriptModule(
  'apps/frontend/src/components/guided-tour/guided-tour.contract.ts'
);
const { guidedTourCopy } = loadTypeScriptModule(
  'apps/frontend/src/components/guided-tour/guided-tour.copy.ts'
);

const listSources = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listSources(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });

describe('guided tour contract', () => {
  test('exports the five keys the onboarding links use', () => {
    expect([...contract.TOUR_KEYS]).toEqual([
      'avatar',
      'channel',
      'piece',
      'adaptation',
      'plan',
    ]);
    expect(contract.isTourKey('plan')).toBe(true);
    expect(contract.isTourKey('toString')).toBe(false);
    expect(contract.isTourKey(undefined)).toBe(false);
  });

  test('reads the key and takes the parameter off the address', () => {
    expect(contract.readTourRequest('https://x.test/channels?tour=channel')).toEqual({
      key: 'channel',
      cleaned: '/channels',
    });
    expect(
      contract.readTourRequest('/content?tab=avatars&tour=avatar#top')
    ).toEqual({ key: 'avatar', cleaned: '/content?tab=avatars#top' });
    // A stale or mistyped key is still taken off, and runs nothing.
    expect(contract.readTourRequest('/launches?tour=nope&view=list')).toEqual({
      key: null,
      cleaned: '/launches?view=list',
    });
    // No parameter: nothing to rewrite, so the address is left alone.
    expect(contract.readTourRequest('/launches?view=list')).toEqual({
      key: null,
      cleaned: null,
    });
  });

  test('keeps the shown mark in storage and survives a throwing storage', () => {
    const data = new Map();
    const store = {
      getItem: (k) => (data.has(k) ? data.get(k) : null),
      setItem: (k, v) => data.set(k, v),
      removeItem: (k) => data.delete(k),
    };
    expect(contract.hasSeenTour('piece', store)).toBe(false);
    contract.markTourSeen('piece', store);
    expect(contract.hasSeenTour('piece', store)).toBe(true);
    contract.clearTourSeen('piece', store);
    expect(contract.hasSeenTour('piece', store)).toBe(false);

    const broken = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {
        throw new Error('SecurityError');
      },
    };
    expect(contract.hasSeenTour('piece', broken)).toBe(false);
    expect(() => contract.markTourSeen('piece', broken)).not.toThrow();
    expect(() => contract.clearTourSeen('piece', broken)).not.toThrow();
    expect(contract.hasSeenTour('piece', null)).toBe(false);
  });

  test('gives every key two to four stops, each with words in both languages', () => {
    for (const key of contract.TOUR_KEYS) {
      const stops = contract.TOUR_STOPS[key];
      expect(stops.length).toBeGreaterThanOrEqual(2);
      expect(stops.length).toBeLessThanOrEqual(4);
      for (const stop of stops) {
        for (const locale of ['ru', 'en']) {
          const words = guidedTourCopy[locale].stops[stop.id];
          expect(words?.title).toBeTruthy();
          expect(words?.body).toBeTruthy();
        }
        for (const anchor of stop.anchors) {
          expect(anchor.startsWith('[data-tour="')).toBe(true);
        }
      }
    }
    expect(guidedTourCopy.ru.progress).toBe('{{current}} из {{total}}');
    expect(guidedTourCopy.en.progress).toBe('{{current}} of {{total}}');
  });

  test('every anchor a stop looks for is set on some screen', () => {
    const sources = listSources(path.join(root, 'apps/frontend/src'))
      .filter((file) => !file.includes(`${path.sep}guided-tour${path.sep}`))
      .map((file) => fs.readFileSync(file, 'utf8'))
      .join('\n');
    const names = new Set(
      contract.TOUR_KEYS.flatMap((key) =>
        contract.TOUR_STOPS[key].flatMap((stop) =>
          stop.anchors.map((anchor) => anchor.match(/data-tour="([^"]+)"/)[1])
        )
      )
    );
    const missing = [...names].filter(
      (name) =>
        !sources.includes(`data-tour="${name}"`) &&
        !sources.includes(`'${name}'`)
    );
    expect(missing).toEqual([]);
  });

  test('loads driver.js on the client only and is mounted in the signed-in layout', () => {
    const tour = fs.readFileSync(
      path.join(root, 'apps/frontend/src/components/guided-tour/guided-tour.tsx'),
      'utf8'
    );
    expect(tour).not.toMatch(/^import\s+(?!type\b)[^;]*from\s+'driver\.js'/m);
    expect(tour).toContain("await import('driver.js')");
    const layout = fs.readFileSync(
      path.join(root, 'apps/frontend/src/components/new-layout/layout.component.tsx'),
      'utf8'
    );
    expect(layout.match(/<GuidedTour \/>/g)).toHaveLength(1);
  });
});
