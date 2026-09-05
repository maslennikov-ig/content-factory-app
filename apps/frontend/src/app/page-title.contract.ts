/**
 * What the server and the browser have to agree on about a page's name.
 *
 * The title is decided twice — once by `generateMetadata` on the server, once
 * in the browser when the language changes after the page has already been
 * sent (`content-factory-next-fn33.122`). Two deciders need one contract, and
 * the obvious way to give them one is the wrong one: a table of route-to-key
 * copied into the client would be a second list to keep in step with two dozen
 * route files, and the first route added would break it silently.
 *
 * So the route file stays the only place a key is written. The server puts the
 * key it used into the page's own head, and the browser reads it back from
 * there. This module holds nothing but the names of those two tags and the
 * product half of the title — the small, shared vocabulary neither side may
 * spell for itself.
 *
 * It deliberately imports nothing. `page-title.ts` reaches `next/headers`
 * through `getT`, which cannot be pulled into a client bundle, so the constants
 * cannot live there.
 */

/** The key the route asked for, carried in the page's head. */
export const PAGE_TITLE_KEY_META = 'cf-page-title-key';

/** The English fallback that key was written with, carried beside it. */
export const PAGE_TITLE_FALLBACK_META = 'cf-page-title-fallback';

/**
 * The product half of a browser tab's title.
 *
 * The root layout states the same thing as a Next `template` — the framework
 * will not take a function there — and `tests/page-title-language.test.cjs`
 * keeps the two readings identical.
 */
export const PRODUCT_TITLE_SUFFIX = ' · Content Factory';

/** A page's name, in the form the browser tab shows it. */
export const composePageTitle = (name: string) =>
  `${name}${PRODUCT_TITLE_SUFFIX}`;
