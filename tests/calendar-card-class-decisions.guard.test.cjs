const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

/**
 * The calendar card: the class decisions behind it, and nothing more.
 *
 * WHAT THIS FILE CHECKS, PLAINLY. It reads two source files as text and looks
 * for class names and call sites in them. It does not render anything, does
 * not measure anything, and does not know what a card looks like. Its name
 * said `fit` until 05.09.2026 and the commit that introduced it
 * (`79127f23`) reads as held geometry; the audit of 02.09.2026 called that out
 * (item 17, `content-factory-next-th1s`) and the name is now honest instead.
 *
 * What follows from that, and matters when this file is green:
 *
 *   • A card that overflows because a font token grew, a spacing step changed
 *     or a container narrowed passes here without a word. Nothing in this file
 *     can see it.
 *   • Moving a `className` onto another line, or splitting it into a helper,
 *     can turn this file red while the page is unchanged. That is a false red,
 *     and the fix is to update the pattern, not the component.
 *
 * A test that would catch the first case needs a browser — a snapshot of the
 * card at 320, 390 and 1440 with an explicit `executablePath`. That is a real
 * option and it is deliberately not taken here: it is slower than everything
 * else in this suite by two orders of magnitude, and the value it adds over
 * this file is a second kind of evidence rather than a stronger one.
 *
 * WHY THE DECISIONS BELOW ARE WORTH HOLDING AT ALL. Two rounds of defects sit
 * behind them, both found by opening the calendar in a browser — not one of
 * them failed a test, and none of them could have: every other test asserts
 * the text a component renders, never the box it renders into or the colour it
 * renders in.
 *
 * 02.09.2026, measured at 1440px with the sidebar open. The card is 92px wide
 * in week view and 110px in month view:
 *
 *   • The stage pill «Этап: На проверке» wanted 147px. Sharing the row with
 *     the 32px avatar it had 41px, and took 76px anyway — hanging 29px past
 *     the card's own border, into the next day's column in month view. A flex
 *     item defaults to `min-width: auto`, so nothing was ever going to stop it.
 *   • The sentence was drawn in an absolutely positioned overlay, so it had no
 *     height: the card measured 106px and painted to 127px, over the card
 *     below it.
 *   • The day view's time slots are flex items in a scrolling column with
 *     `min-h-[60px]`. Free to shrink, they shrank to 60px and the 116px cards
 *     inside them were drawn across each other.
 *
 * Same day, the owner's own four, answered by direction A of the design canvas:
 *
 *   • The head band carried the tag names and a pill under it carried the
 *     stage — «Plan» above «План», one word twice in two languages.
 *   • The band was painted with the tag's colour, which a person types in by
 *     hand, and the text over it was corrected with `mix-blend-mode:
 *     difference`. A computed colour cannot be checked for contrast in either
 *     theme, and it washed out in both.
 *   • A hovered button's own background showed through that blend, which is
 *     the piece that appeared to fall out of the strip.
 *   • A post to three channels was three cards, each claiming one channel.
 *
 * Each fix is one class or one call, and each is easy to drop in a later edit
 * without noticing. That — the class surviving, not the layout — is what this
 * file holds.
 */

function read(relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8');
}

const CALENDAR = 'apps/frontend/src/components/launches/calendar.tsx';
const PARTS = 'apps/frontend/src/components/launches/post-card.parts.tsx';

describe('the classes that keep a card inside its own box', () => {
  test('the post sentence class list declares min-w-0', () => {
    const source = read(CALENDAR);
    const sentence = source.match(
      /className="([^"]*line-clamp-1[^"]*)"/
    );

    expect({
      found: Boolean(sentence),
      declares: sentence ? sentence[1].includes('min-w-0') : false,
      hint: sentence?.[1].includes('min-w-0')
        ? 'in step'
        : `The post sentence in ${CALENDAR} needs "min-w-0". Without it the flex item is sized by its longest word and the card's border stops meaning anything — the stage pill hung 29px outside the card, in the neighbouring day.`,
    }).toEqual({ found: true, declares: true, hint: 'in step' });
  });

  test('no class list that clamps the sentence also positions it absolutely', () => {
    const source = read(CALENDAR);
    // Every class list that clamps the sentence to one line; none may position
    // it out of flow.
    const clamped = [
      ...source.matchAll(/className="([^"]*line-clamp-1[^"]*)"/g),
    ];
    const overlay =
      clamped.length === 0 || clamped.some((m) => m[1].includes('absolute'));

    expect({
      overlay,
      hint: overlay
        ? `The post sentence in ${CALENDAR} is absolutely positioned again. Out of flow it contributes no height, so the card measures shorter than the text it draws and the sentence paints over the card below. "line-clamp-1" already holds it to one line, which is all the overlay bought.`
        : 'in step',
    }).toEqual({ overlay: false, hint: 'in step' });
  });

  test('the day-view time slot class list declares shrink-0', () => {
    const source = read(CALENDAR);
    const slot = source.match(/className="min-h-\[60px\]([^"]*)"/);

    expect({
      found: Boolean(slot),
      declares: slot ? slot[1].includes('shrink-0') : false,
      hint: slot?.[1].includes('shrink-0')
        ? 'in step'
        : `The day-view time slot in ${CALENDAR} needs "shrink-0". It is a flex item in a scrolling column, so without it the slot shrinks to its 60px floor and the taller card inside is drawn across the slot below.`,
    }).toEqual({ found: true, declares: true, hint: 'in step' });
  });
});

describe('the classes and call sites that colour the card', () => {
  test('no blend mode corrects the card text against an unknown colour', () => {
    const blended = [CALENDAR, PARTS].filter((file) =>
      /className=[^\n]*mix-blend/.test(read(file))
    );

    expect({
      blended,
      hint: blended.length
        ? `"mix-blend-mode" is back on the calendar card (${blended.join(', ')}). It was there to make text legible over a tag colour a person types in by hand — which is exactly why it cannot be checked: the result depends on a value the product does not know. Colour the band from the stage's own tone instead.`
        : 'in step',
    }).toEqual({ blended: [], hint: 'in step' });
  });

  test('a tag colour is never painted as a surface on the card', () => {
    const source = read(CALENDAR);
    const painted = /backgroundColor:\s*post[^\n]*tag/.test(source);

    expect({
      painted,
      hint: painted
        ? `${CALENDAR} paints a tag's colour as a background again. Nothing over it can be held to a contrast ratio, in either theme, because the colour arrives from the tag editor rather than from the token set.`
        : 'in step',
    }).toEqual({ painted: false, hint: 'in step' });
  });

  test('the band takes its tone from the shared status map', () => {
    const source = read(PARTS);
    const shared = /STATUS_TONES\[tone\]/.test(source);
    const imported =
      /import[^;]*STATUS_TONES[^;]*components\/ui\/surface/.test(source);

    expect({
      shared,
      imported,
      hint:
        shared && imported
          ? 'in step'
          : `The head band in ${PARTS} has to reuse "STATUS_TONES" from the surface primitives. Retyped there, the band and the pill for one stage drift apart the first time a token moves.`,
    }).toEqual({ shared: true, imported: true, hint: 'in step' });
  });
});

describe('the call sites behind one word, one card, one post', () => {
  test('the stage is written once — the band is the label', () => {
    const source = read(CALENDAR);
    const badge = /<EditorialStageBadge/.test(source);

    expect({
      badge,
      hint: badge
        ? `${CALENDAR} draws the stage pill again beside the head band. The band already names the stage; with both, the card reads «План» twice — which is the defect the owner reported on 02.09.2026.`
        : 'in step',
    }).toEqual({ badge: false, hint: 'in step' });
  });

  test('the calendar folds a post group into one card', () => {
    const source = read(CALENDAR);
    const groups = /groupPostsByGroup\(/.test(source);
    // Two call sites, and both are load-bearing: the list view folds each
    // day's rows, and `CalendarColumn` folds each slot for the day, week and
    // month grids. A view that forgot would show a three-channel post as three
    // cards again.
    const callSites = (source.match(/groupPostsByGroup\(/g) || []).length;

    expect({
      groups,
      enough: callSites >= 2,
      hint:
        groups && callSites >= 2
          ? 'in step'
          : `${CALENDAR} has to fold rows sharing a "group" into one card in every view — the list view and the column both call it. A post to three channels is three rows, and drawn one per row it reads as three separate posts.`,
    }).toEqual({ groups: true, enough: true, hint: 'in step' });
  });

  test('dragging a card moves every row of its group', () => {
    const source = read(CALENDAR);
    const carries = /ids:\s*members\.map/.test(source);
    const moves = /ids\.map\(async \(id\)/.test(source);

    expect({
      carries,
      moves,
      hint:
        carries && moves
          ? 'in step'
          : `A drag in ${CALENDAR} has to carry every row id of the group and move all of them. "PUT /posts/:id/date" is per row, so moving only the lead leaves the other channels at the old hour and splits one post in two.`,
    }).toEqual({ carries: true, moves: true, hint: 'in step' });
  });
});

describe('the classes that give the actions a surface of their own', () => {
  test('the action bar class list declares a surface and a border', () => {
    const source = read(PARTS);
    const bar = source.match(
      /'flex items-center gap-\[4px\][^']*rounded-\[8px\]',\s*'([^']*)'/
    );

    expect({
      found: Boolean(bar),
      raised: bar ? bar[1].includes('bg-cf-surface-raised') : false,
      bordered: bar ? bar[1].includes('border') : false,
      hint:
        bar && bar[1].includes('bg-cf-surface-raised') && bar[1].includes('border')
          ? 'in step'
          : `The action bar in ${PARTS} has to carry its own surface and border. Sitting bare inside the head band, a hovered button's background showed through the colour under it — the piece that looked like it was falling out of the strip.`,
    }).toEqual({ found: true, raised: true, bordered: true, hint: 'in step' });
  });

  test('the hidden action panel class list declares pointer-events-none', () => {
    const source = read(CALENDAR);
    const hides = /opacity-0 pointer-events-none/.test(source);

    expect({
      hides,
      hint: hides
        ? 'in step'
        : `The action panel in ${CALENDAR} has to be "pointer-events-none" while it is invisible. Transparent controls that still take clicks are worse than no controls: the card under them stops opening.`,
    }).toEqual({ hides: true, hint: 'in step' });
  });
});
