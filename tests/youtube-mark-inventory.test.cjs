const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const inventory = 'docs/design/desert-lab/youtube-mark-inventory.md';

/**
 * The YouTube mark is a third-party trademark, and the published conditions for
 * showing it — a minimum digital height and a link to YouTube content — are not
 * met anywhere in the product today. That is recorded, with the owner's four
 * options costed, in the inventory above. What the record cannot survive is a
 * new surface quietly starting to draw the mark: the inventory would then say
 * "nineteen surfaces" while the product had twenty, and the owner would be
 * deciding about a product that no longer exists.
 *
 * So this holds the one property the inventory rests on: the real mark reaches
 * the screen only through the carriers it names. It says nothing about sizes or
 * links — those change inside a call site, where an ordinary review sees them.
 *
 * What already exists is grandfathered by name. Only a new route fails.
 */

/** Where the shared carriers live; inside them the asset path is the point. */
const CARRIER_DIRECTORY = 'libraries/react-shared-libraries/src/platform';

/**
 * Call sites that reach the asset directly, each showing the platform mark at
 * 48px when a channel has no picture of its own. Both are in the inventory.
 * A fifth route is not grandfathered — it has to go through a carrier or be
 * written down.
 */
const KNOWN_DIRECT_CALL_SITES = [
  'apps/frontend/src/components/plugs/plugs.tsx',
  'apps/frontend/src/components/agents/agent.tsx',
];

/** Every source file under a directory, without walking into node_modules. */
function sourceFiles(directory) {
  const absolute = path.join(root, directory);
  if (!fs.existsSync(absolute)) return [];

  const found = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const next = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(next);
      } else if (/\.(tsx?|jsx?)$/.test(entry.name)) {
        found.push(path.relative(root, next));
      }
    }
  };
  walk(absolute);
  return found;
}

describe('the YouTube mark reaches the screen only through its recorded carriers', () => {
  const searched = [
    ...sourceFiles('apps/frontend/src'),
    ...sourceFiles('libraries'),
  ];

  test('the harness is looking at real source: it finds the carriers themselves', () => {
    const carriers = searched.filter((file) => file.startsWith(CARRIER_DIRECTORY));

    expect(carriers).toEqual(
      expect.arrayContaining([
        `${CARRIER_DIRECTORY}/platform.badge.tsx`,
        `${CARRIER_DIRECTORY}/platform.card.tsx`,
        `${CARRIER_DIRECTORY}/platform.asset.ts`,
      ])
    );
  });

  test('no new file reaches the platform asset directly', () => {
    const reaching = searched
      .filter((file) => !file.startsWith(CARRIER_DIRECTORY))
      .filter((file) => !KNOWN_DIRECT_CALL_SITES.includes(file))
      .filter((file) =>
        fs.readFileSync(path.join(root, file), 'utf8').includes('/icons/platforms/')
      );

    expect({
      reaching,
      why: `Показывать знак платформы можно через PlatformBadge или PlatformCardLogo. Прямое обращение к /icons/platforms/ ставит третий сторонний товарный знак на экран мимо учёта — добавьте поверхность в ${inventory} и в KNOWN_DIRECT_CALL_SITES, если путь всё же нужен.`,
    }).toEqual({ reaching: [], why: expect.any(String) });
  });

  test('the grandfathered call sites still exist, so the list does not rot', () => {
    // A stale name in the allowlist is an allowlist nobody is reading. If one of
    // these files moved, the entry has to move with it.
    for (const file of KNOWN_DIRECT_CALL_SITES) {
      expect({ file, exists: fs.existsSync(path.join(root, file)) }).toEqual({
        file,
        exists: true,
      });
      expect(fs.readFileSync(path.join(root, file), 'utf8')).toContain(
        '/icons/platforms/'
      );
    }
  });

  test('the inventory exists and still refuses to claim compliance', () => {
    const text = fs.readFileSync(path.join(root, inventory), 'utf8');

    // The two facts the owner's decision rests on. If either stops being true
    // the document has to be rewritten, not quietly left in place.
    expect(text).toContain('Не соблюдается нигде');
    expect(text).toContain('Здесь нет вывода о соответствии товарному знаку');
  });
});
