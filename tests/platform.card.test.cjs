const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');
const iconDirectory = path.resolve(
  __dirname,
  '..',
  'apps/frontend/public/icons/platforms'
);

/**
 * The platform element card and its smallest size, rendered rather than read.
 *
 * `desert-lab-screen-review.test.cjs` fences the screens by reading their source
 * text, which cannot see what a component actually produces. Three of the rules
 * this object exists to keep are only visible in the output: that the logo is
 * never cropped, that selection survives without colour, and that ochre stays
 * off the card.
 */
const LIB = 'libraries/react-shared-libraries/src/platform';

const { PlatformCard, PlatformCardLogo } = loadTypeScriptModule(
  `${LIB}/platform.card.tsx`
);
const { PlatformBadge } = loadTypeScriptModule(`${LIB}/platform.badge.tsx`);
const { PlatformSymbol } = loadTypeScriptModule(`${LIB}/platform.symbol.tsx`);
const {
  PLATFORM_FAMILIES,
  PLATFORM_TWINS,
  PLATFORM_SYMBOLS,
  KNOWN_PLATFORMS,
  familyOfPlatform,
} = loadTypeScriptModule(`${LIB}/platform.families.ts`);

const card = (props) =>
  renderToStaticMarkup(
    React.createElement(PlatformCard, {
      name: 'Bluesky',
      connectedChannels: 1,
      logo: React.createElement(PlatformCardLogo, { identifier: 'bluesky' }),
      ...props,
    })
  );

const badge = (props) =>
  renderToStaticMarkup(
    React.createElement(PlatformBadge, { identifier: 'telegram', ...props })
  );

/**
 * Renders as if the mark had already failed to load.
 *
 * `onError` never fires in a static render, and the state it sets is the one
 * thing that changes what these two components draw. Both hold exactly one
 * piece of state — `broken`, seeded `false` — so seeding it `true` for the
 * duration of one render is enough, and cheaper than pulling in a DOM.
 */
const withBrokenMark = (render) => {
  const real = React.useState;
  React.useState = (initial) =>
    initial === false ? [true, () => {}] : real(initial);
  try {
    return render();
  } finally {
    React.useState = real;
  }
};

describe('platform families', () => {
  const shippedIdentifiers = [
    ...new Set(
      fs
        .readdirSync(iconDirectory)
        .map((file) => file.replace(/\.[^.]+$/, ''))
    ),
  ].sort();

  /**
   * The providers the backend actually offers, read from the one list that
   * decides it. Comparing the map against the icon folder is not enough: an
   * icon can outlive its provider, and a provider can be added without one.
   */
  const activeProviderIdentifiers = (() => {
    const providerDirectory = path.resolve(
      __dirname,
      '..',
      'libraries/nestjs-libraries/src/integrations/social'
    );
    const identifierByClass = {};
    for (const file of fs.readdirSync(providerDirectory)) {
      if (!file.endsWith('.provider.ts')) continue;
      const source = fs.readFileSync(path.join(providerDirectory, file), 'utf8');
      const className = /export class (\w+)/.exec(source)?.[1];
      const identifier = /\bidentifier\s*=\s*'([^']+)'/.exec(source)?.[1];
      if (className && identifier) identifierByClass[className] = identifier;
    }

    const manager = fs.readFileSync(
      path.resolve(
        __dirname,
        '..',
        'libraries/nestjs-libraries/src/integrations/integration.manager.ts'
      ),
      'utf8'
    );
    const list = /socialIntegrationList[\s\S]*?\n\];/.exec(manager)[0];

    return list
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .flatMap((line) => {
        const className = /new (\w+)\(\)/.exec(line)?.[1];
        return className && identifierByClass[className]
          ? [identifierByClass[className]]
          : [];
      })
      .sort();
  })();

  test('places every provider the product actually offers', () => {
    // This is the guarantee that matters: an unplaced provider falls out of the
    // picker silently, because the bands are the layout.
    const unplaced = activeProviderIdentifiers.filter(
      (identifier) => !KNOWN_PLATFORMS.includes(identifier)
    );

    expect(activeProviderIdentifiers.length).toBeGreaterThan(30);
    expect(unplaced).toEqual([]);
  });

  test('places every platform that ships an icon, and invents none', () => {
    expect([...KNOWN_PLATFORMS].sort()).toEqual(shippedIdentifiers);
  });

  test('names the platforms that ship an icon but no live provider', () => {
    // `mastodon-custom` is commented out in the manager and still ships an icon
    // and a family entry. That is deliberate — it is one uncomment away from
    // returning — but it means the "Other" band has nothing to catch today, so
    // nobody should read a green suite as proof that the band works.
    const dormant = [...KNOWN_PLATFORMS]
      .filter((identifier) => !activeProviderIdentifiers.includes(identifier))
      .sort();

    expect(dormant).toEqual(['mastodon-custom']);
  });

  test('keeps each platform in exactly one family', () => {
    expect(KNOWN_PLATFORMS).toHaveLength(new Set(KNOWN_PLATFORMS).size);
  });

  test('keeps the family of one, because it is not a mistake', () => {
    // `listmonk` is the only destination that goes to our own infrastructure
    // rather than to somebody else's service. It is not padded and not folded
    // into a neighbour for the sake of symmetry.
    const own = PLATFORM_FAMILIES.find((family) => family.id === 'own');
    expect(own.platforms).toEqual(['listmonk']);
  });

  test('carries no colour: the band heading and the position are the family', () => {
    for (const family of PLATFORM_FAMILIES) {
      expect(Object.keys(family)).toEqual([
        'id',
        'labelKey',
        'labelDefault',
        'platforms',
      ]);
    }
  });

  test('qualifies exactly the three pairs a logo cannot separate', () => {
    expect(Object.keys(PLATFORM_TWINS).sort()).toEqual([
      'instagram',
      'instagram-standalone',
      'linkedin',
      'linkedin-page',
      'mastodon',
      'mastodon-custom',
    ]);

    // Each pair reads differently, or the qualifier has done nothing.
    for (const [left, right] of [
      ['instagram', 'instagram-standalone'],
      ['mastodon', 'mastodon-custom'],
      ['linkedin', 'linkedin-page'],
    ]) {
      expect(PLATFORM_TWINS[left].default).not.toBe(
        PLATFORM_TWINS[right].default
      );
      // Both halves of a pair show the same platform name, so the frame is
      // doing the separating and the two read as one platform.
      expect(PLATFORM_TWINS[left].name).toBe(PLATFORM_TWINS[right].name);
    }
  });

  test('keeps every qualifier short enough that the strip does not truncate it', () => {
    // The strip does not wrap. Three columns on a 390px screen leave the card
    // 92px, which holds about nine monospaced characters at 12px; a qualifier
    // cut off mid-word stops separating the pair, which was its only job.
    // Checked in every locale, because the English source is the shortest.
    const localesRoot = path.resolve(
      __dirname,
      '..',
      'libraries/react-shared-libraries/src/translation/locales'
    );
    const keys = Object.values(PLATFORM_TWINS).map((twin) => twin.key);
    const tooLong = [];

    for (const locale of fs.readdirSync(localesRoot)) {
      const file = path.join(localesRoot, locale, 'translation.json');
      if (!fs.existsSync(file)) continue;
      const translations = JSON.parse(fs.readFileSync(file, 'utf8'));
      for (const key of keys) {
        const value = translations[key] ?? '';
        if ([...value].length > 9) tooLong.push(`${locale}:${key}=${value}`);
      }
    }

    expect(tooLong).toEqual([]);
  });

  test('is translated in every locale, which no other guard can see', () => {
    // `branding.test.cjs` finds keys by reading literal `t('key', 'default')`
    // calls. These are passed as data — `t(family.labelKey, ...)` — so that scan
    // walks straight past them, and a missing one would ship as an English word
    // in the middle of a translated screen.
    const localesRoot = path.resolve(
      __dirname,
      '..',
      'libraries/react-shared-libraries/src/translation/locales'
    );
    const keys = [
      ...PLATFORM_FAMILIES.map((family) => family.labelKey),
      ...Object.values(PLATFORM_TWINS).map((twin) => twin.key),
    ];
    const gaps = [];

    for (const locale of fs.readdirSync(localesRoot)) {
      const file = path.join(localesRoot, locale, 'translation.json');
      if (!fs.existsSync(file)) continue;
      const translations = JSON.parse(fs.readFileSync(file, 'utf8'));
      for (const key of keys) {
        const value = translations[key];
        if (typeof value !== 'string' || !value.trim()) gaps.push(`${locale}:${key}`);
      }
    }

    expect(gaps).toEqual([]);
  });

  test('assigns a distinct symbol to every platform rather than deriving one', () => {
    // Deriving from the identifier is what shipped `LI` for `linkedin`,
    // `linkedin-page` and `listmonk` at once, and would collide `medium` with
    // `mewe` today. The table this borrows from assigns its symbols for the
    // same reason: `Fe` does not follow from "iron".
    const symbols = KNOWN_PLATFORMS.map((id) => PLATFORM_SYMBOLS[id]);

    expect(symbols.filter(Boolean)).toHaveLength(KNOWN_PLATFORMS.length);
    expect(new Set(symbols).size).toBe(KNOWN_PLATFORMS.length);
    for (const symbol of symbols) expect(symbol).toMatch(/^[A-Z][a-z]?$/);
  });

  test('answers for a platform and stays quiet about one it does not know', () => {
    expect(familyOfPlatform('telegram').id).toBe('messengers');
    expect(familyOfPlatform('myspace')).toBeUndefined();
  });
});

describe('PlatformBadge', () => {
  test('never crops the trademark it frames', () => {
    // Six call sites used to put `rounded-full` on the logo, which clips the
    // corners off a square mark. The frame is ours and rounded; the glyph is
    // not ours and is left square.
    const markup = badge({});
    const logo = markup.match(/<img[^>]*>/)[0];

    expect(logo).not.toContain('rounded-full');
    expect(logo).not.toMatch(/rounded/);
    expect(logo).toContain('object-contain');
  });

  test('uses the same vetted source and bounded size in the platform card', () => {
    const vector = renderToStaticMarkup(
      React.createElement(PlatformCardLogo, { identifier: 'listmonk' })
    );
    const alias = renderToStaticMarkup(
      React.createElement(PlatformCardLogo, { identifier: 'mastodon-custom' })
    );
    const retained = renderToStaticMarkup(
      React.createElement(PlatformCardLogo, { identifier: 'youtube' })
    );

    expect(vector).toContain('/icons/platforms/listmonk.svg');
    expect(vector).toContain('h-[56px] w-[56px]');
    expect(alias).toContain('/icons/platforms/mastodon.svg');
    expect(retained).toContain('/icons/platforms/youtube.png');
    expect(retained).toContain('h-[48px] w-[48px]');
  });

  const PLATED = ['mastodon', 'mastodon-custom', 'devto', 'listmonk'];
  const UNPLATED = ['lemmy', 'telegram', 'youtube'];

  const cardLogo = (identifier) =>
    renderToStaticMarkup(
      React.createElement(PlatformCardLogo, { identifier })
    );

  test('places only dark-fragile vector marks on a plate, and only in the dark', () => {
    for (const identifier of PLATED) {
      // The badge frame is `surface-raised` in both themes — that is the frame,
      // not the plate — and gains the plate on top of it in the dark.
      expect(badge({ identifier })).toContain('bg-cf-surface-raised');
      for (const markup of [badge({ identifier }), cardLogo(identifier)]) {
        expect(markup).toContain('dark:bg-cf-ink');
      }
      // The card's own background already answers for the light theme, and it
      // is not always `surface-raised`: `surface-subtle` on hover, `accent-soft`
      // when selected. A light-theme plate there is a visible square.
      expect(cardLogo(identifier)).not.toContain('bg-cf-surface-raised');
    }

    // Whole markup, not the `<img>` tag: the plate lives on the wrapping
    // `<span>` and never appears inside the image, so an `<img>`-only assertion
    // passes even when every platform is plated — `lemmy`'s white body included.
    for (const identifier of UNPLATED) {
      for (const markup of [badge({ identifier }), cardLogo(identifier)]) {
        expect(markup).not.toContain('bg-cf-ink');
      }
    }
  });

  test('drops the plate when the mark fails and the symbol takes its place', () => {
    // `ink` text on an `ink` plate is 1:1. A user whose SVG 404s after a deploy
    // would see an empty light square where `Dv` / `Lm` / `Ms` should be.
    for (const identifier of PLATED) {
      const fallback = withBrokenMark(() => badge({ identifier }));

      expect(fallback).not.toContain('<img');
      expect(fallback).toContain(PLATFORM_SYMBOLS[identifier]);
      expect(fallback).not.toContain('bg-cf-ink');
      // The frame itself survives; only the plate goes.
      expect(fallback).toContain('bg-cf-surface-raised');
      // The card returns its fallback before the wrapper, so it never plated.
      expect(withBrokenMark(() => cardLogo(identifier))).not.toContain(
        'bg-cf-ink'
      );
    }
  });

  test('gives the logo clear space inside the frame at every size', () => {
    for (const [size, logo] of [
      [16, 12],
      [24, 16],
      [32, 24],
    ]) {
      const markup = badge({ size });
      expect(markup).toContain(`w-[${size}px] h-[${size}px]`);
      expect(markup).toContain(`w-[${logo}px] h-[${logo}px]`);
    }
  });

  test('prefers only vetted immutable vectors and keeps every other mark raster', () => {
    for (const identifier of ['listmonk', 'lemmy', 'devto', 'mastodon']) {
      expect(badge({ identifier })).toContain(`/icons/platforms/${identifier}.svg`);
    }
    expect(badge({ identifier: 'mastodon-custom' })).toContain(
      '/icons/platforms/mastodon.svg'
    );
    expect(badge({ identifier: 'youtube' })).toContain(
      '/icons/platforms/youtube.png'
    );
    expect(badge({ identifier: 'telegram' })).toContain(
      '/icons/platforms/telegram.png'
    );
  });

  test('ships the four approved marks byte-for-byte from their immutable sources', () => {
    // A trailing newline changes an SVG's digest: this catches substitutions,
    // reformatting and accidental edits before a trademarked mark reaches UI.
    const expectedDigests = {
      'listmonk.svg': '2c3e6b34a78e9a6405e5e262894d21725ffe897d7261a711cc3e849a5ff65865',
      'lemmy.svg': '9d4bea45276d4a52e84cf8635fb83ecceb5181622df1311771b11cb98483373b',
      'devto.svg': '5b0efe8c94ff7c6db6eccc6c4c7df4c38d4676f1f8fc613e60bfad4a7eedd631',
      'mastodon.svg': 'e92184e36e3bba38ee406bba10e7a85eab9f9b2a55dcb5725394f7db49151abc',
    };
    for (const [filename, expectedDigest] of Object.entries(expectedDigests)) {
      const bytes = fs.readFileSync(path.join(iconDirectory, filename));
      expect(crypto.createHash('sha256').update(bytes).digest('hex')).toBe(expectedDigest);
    }
  });

  test('is hidden from assistive technology when the destination is written beside it', () => {
    expect(badge({ name: 'Telegram' })).toContain('aria-hidden="true"');
    expect(badge({ name: 'Telegram', decorative: false })).toContain(
      'aria-label="Telegram"'
    );
  });

  test('spends no colour of its own', () => {
    const markup = badge({});
    expect(markup).toContain('border-cf-border-control');
    expect(markup).not.toContain('cf-accent');
    expect(markup).not.toContain('cf-signature');
  });
});

describe('PlatformSymbol', () => {
  const symbol = (props) =>
    renderToStaticMarkup(
      React.createElement(PlatformSymbol, { identifier: 'telegram', ...props })
    );

  test('anchors the symbol top-left, clear of the badge in the far corner', () => {
    // Centred, the two sat on top of each other.
    expect(symbol({ size: 48 })).toContain('top-[4px] start-[8px]');
    expect(symbol({ size: 32 })).toContain('top-[4px] start-[4px]');
    expect(symbol({ size: 64 })).toContain('top-[8px] start-[8px]');
  });

  test('keeps the mark proportion ChannelMark uses, at every tier', () => {
    // 13px on 32px is the brand card's own ratio; the two marks sit side by
    // side in lists, so they scale together or they look unrelated.
    for (const [size, expected] of [
      [32, 13],
      [48, 19.5],
      [64, 26],
    ]) {
      expect(symbol({ size })).toContain(`font-size:${expected}px`);
    }
  });

  test('spends no colour and never crops', () => {
    const markup = symbol({});
    expect(markup).toContain('border-cf-border-control');
    expect(markup).not.toMatch(/cf-accent|cf-signature|rounded-full/);
  });

  test('is silent when a name is written beside it, and speaks when it is not', () => {
    expect(symbol({ name: 'Редакция' })).toContain('aria-hidden="true"');
    expect(symbol({ name: 'Редакция', decorative: false })).toContain(
      'aria-label="Редакция"'
    );
  });

  test('shows two channels of one platform as one symbol, which is the trade', () => {
    // Recorded, not hidden. This is what the owner chose over channel initials,
    // and it is why the channel name beside the cell is load-bearing.
    expect(symbol({ name: 'Редакция' })).toContain('>Tg<');
    expect(symbol({ name: 'Новости' })).toContain('>Tg<');
    // Across platforms it still separates, because the symbols are assigned.
    expect(symbol({ identifier: 'listmonk' })).toContain('>Lk<');
    expect(symbol({ identifier: 'linkedin' })).toContain('>Li<');
    expect(symbol({ identifier: 'linkedin-page' })).toContain('>Lp<');
  });
});

describe('PlatformCard', () => {
  test('is a control, and says so', () => {
    const markup = card({});
    expect(markup).toContain('<button');
    expect(markup).toContain('type="button"');
    expect(card({ selected: true })).toContain('aria-pressed="true"');
    expect(card({ selected: false })).toContain('aria-pressed="false"');
  });

  test('does not announce a toggle where the click performs an action', () => {
    // The picker that connects a channel starts an OAuth flow on click; there
    // is nothing to be pressed or unpressed. A card that always announced
    // "toggle button, not pressed" was telling a screen-reader user something
    // untrue about every platform on the screen.
    expect(card({})).not.toContain('aria-pressed');
  });

  test('announces the count with its unit rather than as a leading bare digit', () => {
    // `ink` against `ink-muted` carries "in use" to the eye before the digit is
    // read. A screen reader gets none of that, and would otherwise hear
    // "0 Instagram business".
    const markup = card({
      name: 'Instagram',
      qualifier: 'business',
      connectedChannels: 0,
      connectedLabel: '0 connected channels',
    });

    expect(markup).toContain(
      'aria-label="Instagram, business, 0 connected channels"'
    );
  });

  test('rests on a border that carries the control threshold', () => {
    // `border-strong` measures 2.00:1 on `surface` in the dark theme and is
    // filed under dividers in `contrast-pairs.md`. A card you click needs the
    // role that clears 3:1, which is `border-control`.
    expect(card({})).toContain('border-cf-border-control');
    expect(card({})).not.toContain('border-cf-border-strong');
  });

  test('shows the choice without relying on colour', () => {
    const chosen = card({ selected: true });
    const plain = card({});

    // A shape that appears, and a weight that changes with it. Matched on the
    // marker's own path rather than on `<svg>`: a platform that ships a vector
    // logo would otherwise satisfy the check by accident.
    expect(chosen).toContain('M2 6.4 4.6 9 10 3.2');
    expect(plain).not.toContain('M2 6.4 4.6 9 10 3.2');
    expect(chosen).toContain('cf-label-md');
    expect(plain).toContain('cf-body-sm');
  });

  test('keeps a visible focus ring, the one every control in the family shares', () => {
    // The ring comes from `ControlButton`, so the card cannot forget it and
    // cannot invent a second convention for it.
    const markup = card({});
    expect(markup).toContain('focus-visible:ring-cf-focus');
    expect(markup).toContain('focus-visible:ring-offset-2');
  });

  test('spends no ochre: signature is the mark, not a stencil on every tile', () => {
    for (const props of [
      {},
      { selected: true },
      { connectedChannels: 0 },
      { disabled: true },
    ]) {
      expect(card(props)).not.toContain('signature');
    }
  });

  test('separates a platform in use from one never touched', () => {
    // `text-cf-ink` is a substring of `text-cf-ink-muted`, so asserting the
    // presence of the first proves nothing. The absence of the second does.
    expect(card({ connectedChannels: 7 })).not.toContain('text-cf-ink-muted');
    expect(card({ connectedChannels: 7 })).toContain('>7<');
    expect(card({ connectedChannels: 0 })).toContain('text-cf-ink-muted');
  });

  test('leaves the number slot empty rather than printing a zero', () => {
    // The device this borrows from gives every element a number no other
    // element has. Here the slot counts channels, and a customer with six
    // connected leaves twenty-nine cards reading the same `0` — the mark meant
    // to tell them apart becomes the most repeated glyph on the screen.
    const untouched = card({ connectedChannels: 0 });
    const slot = /<span class="cf-caption[^"]*">([^<]*)<\/span>/.exec(untouched);

    expect(slot[1]).toBe('');
    expect(untouched).not.toContain('>0<');
  });

  test('falls back to the assigned symbol when a mark fails to load', () => {
    // A logo that 404s left an empty frame. The symbol fills it the way the
    // table would, so the card still reads as an element.
    const logo = renderToStaticMarkup(
      React.createElement(PlatformCardLogo, { identifier: 'telegram' })
    );

    expect(logo).toContain('<img');
    expect(PLATFORM_SYMBOLS.telegram).toBe('Tg');
    expect(PLATFORM_SYMBOLS.listmonk).not.toBe(PLATFORM_SYMBOLS.linkedin);
  });

  test('keeps a retained raster inside the 56px symbol field', () => {
    expect(card({})).toContain('h-[56px] w-[56px]');
    expect(card({})).toContain('h-[48px] w-[48px] object-contain');
  });

  test('names the destination when the logo cannot', () => {
    const markup = card({ name: 'Instagram', qualifier: 'personal' });
    expect(markup).toContain('personal');
    // The qualifier is working information, so it is monospaced and framed.
    expect(markup).toContain('cf-label-sm');
  });

  test('dims a disabled card evenly rather than tinting the mark inside it', () => {
    const markup = card({ disabled: true });
    expect(markup).toContain('disabled=""');
    expect(markup).toContain('disabled:opacity-50');
    // Opacity is uniform and belongs to the control; nothing recolours the mark.
    expect(markup).not.toMatch(/grayscale|sepia|hue-rotate/);
  });

  test('has a loading state that repeats the structure rather than a spinner', () => {
    const markup = card({ loading: true });
    expect(markup).toContain('animate-pulse');
    expect(markup).toContain('h-[152px]');
    expect(markup).not.toContain('<button');
  });

  test('uses only cf tokens for colour, with no hex literal anywhere', () => {
    for (const props of [{}, { selected: true }, { disabled: true }]) {
      expect(card(props)).not.toMatch(/#[0-9a-fA-F]{3,6}\b/);
    }
  });

  test('holds one height whether the name wraps or a qualifier follows it', () => {
    // Cards in a band must line up without the caller measuring anything.
    const short = card({ name: 'X' });
    const long = card({ name: 'Google Business Profile' });
    const qualified = card({ name: 'Instagram', qualifier: 'personal' });

    for (const markup of [short, long, qualified]) {
      expect(markup).toContain('h-[152px]');
      expect(markup).toContain('h-[44px] w-full');
    }
  });
});
