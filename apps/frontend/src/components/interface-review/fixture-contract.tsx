import type { ReactNode } from 'react';

export const INTERFACE_REVIEW_STATES = [
  'loading',
  'empty',
  'default',
  'selected',
  'success',
  'error',
  'restricted',
  'disabled',
  'long-content',
] as const;

export const INTERFACE_REVIEW_THEMES = ['light', 'dark'] as const;
export const INTERFACE_REVIEW_LOCALES = ['en', 'ru'] as const;
export const INTERFACE_REVIEW_VIEWPORTS = [1440, 1024, 768, 390] as const;

export type InterfaceReviewState = (typeof INTERFACE_REVIEW_STATES)[number];
export type InterfaceReviewTheme = (typeof INTERFACE_REVIEW_THEMES)[number];
export type InterfaceReviewLocale = (typeof INTERFACE_REVIEW_LOCALES)[number];
export type InterfaceReviewViewport =
  (typeof INTERFACE_REVIEW_VIEWPORTS)[number];

export type InterfaceReviewContext = Readonly<{
  state: InterfaceReviewState;
  theme: InterfaceReviewTheme;
  locale: InterfaceReviewLocale;
  viewport: InterfaceReviewViewport;
}>;

type QueryValue = string | string[] | undefined;
type InterfaceReviewQuery = Partial<
  Record<'state' | 'theme' | 'locale' | 'viewport', QueryValue>
>;

type FixtureScalar = string | number | boolean | null;
export type InterfaceReviewFixture =
  | FixtureScalar
  | readonly InterfaceReviewFixture[]
  | { readonly [key: string]: InterfaceReviewFixture };

export const INTERFACE_REVIEW_CSP = [
  "default-src 'none'",
  /**
   * No HTTP request of any kind, and the development server's own socket.
   *
   * `connect-src 'none'` was the whole promise — a scene cannot reach an API,
   * so every value on the page is provably a literal — and it also silently
   * cost the route half of its purpose. Next's client bootstrap opens a
   * hot-reload websocket before it hydrates; blocked, it takes hydration down
   * with it, and the stand rendered screens nobody could press a button on.
   * States that only exist after an interaction — a corridor handle appearing,
   * a hint opening, an editor unfolding — were unreviewable, which is a large
   * hole in a route that exists to review screens.
   *
   * `ws:`/`wss:` restores hydration and gives up nothing that mattered. There
   * is no `http:`, `https:` or `'self'` here, so `fetch` and `XMLHttpRequest`
   * have no permitted destination at all: not this origin, not `/api/*`, not
   * the backend. The socket that is allowed belongs to the dev toolchain and
   * carries module updates, and the route does not exist outside development.
   */
  'connect-src ws: wss:',
  // React's development build uses eval only for local stack reconstruction.
  // The entire route is unavailable in production and external scripts remain
  // blocked, while connect-src above still prevents every API call.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "img-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "form-action 'none'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
].join('; ');

const isFixtureScalar = (value: unknown): value is FixtureScalar =>
  value === null ||
  typeof value === 'string' ||
  typeof value === 'number' ||
  typeof value === 'boolean';

const readOne = (name: string, value: QueryValue, fallback: string): string => {
  if (value === undefined) return fallback;
  if (typeof value !== 'string') {
    throw new Error(`Unsupported interface review ${name}: ${value.join(',')}`);
  }
  return value;
};

const readChoice = <Value extends string>(
  name: string,
  value: QueryValue,
  choices: readonly Value[],
  fallback: Value
): Value => {
  const resolved = readOne(name, value, fallback);
  if (!choices.includes(resolved as Value)) {
    throw new Error(`Unsupported interface review ${name}: ${resolved}`);
  }
  return resolved as Value;
};

export function resolveInterfaceReviewContext(
  query: InterfaceReviewQuery,
  supportedStates: readonly InterfaceReviewState[] = INTERFACE_REVIEW_STATES
): InterfaceReviewContext {
  const viewport = readOne('viewport', query.viewport, '1440');
  const numericViewport = Number(viewport);
  if (!INTERFACE_REVIEW_VIEWPORTS.includes(numericViewport as InterfaceReviewViewport)) {
    throw new Error(`Unsupported interface review viewport: ${viewport}`);
  }

  return Object.freeze({
    state: readChoice('state', query.state, supportedStates, 'default'),
    theme: readChoice('theme', query.theme, INTERFACE_REVIEW_THEMES, 'light'),
    locale: readChoice('locale', query.locale, INTERFACE_REVIEW_LOCALES, 'en'),
    viewport: numericViewport as InterfaceReviewViewport,
  });
}

const cloneFixture = (value: unknown): InterfaceReviewFixture => {
  if (isFixtureScalar(value)) {
    return value;
  }
  if (Array.isArray(value)) {
    return Object.freeze(value.map(cloneFixture));
  }
  if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.freeze(
      Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
          key,
          cloneFixture(entry),
        ])
      )
    );
  }
  throw new Error('Interface review fixtures must contain data only');
};

export function defineInterfaceReviewScene<Fixture extends InterfaceReviewFixture>({
  id,
  fixture,
  states,
}: {
  id: string;
  fixture: Fixture;
  states: readonly InterfaceReviewState[];
}) {
  if (!/^[a-z0-9]+(?:[/-][a-z0-9]+)*$/.test(id)) {
    throw new Error('Interface review scene id must be a local route path');
  }
  if (
    states.length === 0 ||
    new Set(states).size !== states.length ||
    states.some((state) => !INTERFACE_REVIEW_STATES.includes(state))
  ) {
    throw new Error('Interface review scene states must use the review matrix');
  }

  return Object.freeze({
    id,
    fixture: cloneFixture(fixture) as Fixture,
    states: Object.freeze([...states]),
  });
}

export function InterfaceReviewDocument({
  sceneId,
  context,
  fontClassName = '',
  children,
}: {
  sceneId: string;
  context: InterfaceReviewContext;
  /**
   * The vendored font variables. Every other route group applies them; without
   * them `--font-cf-mono` is undefined, `var()` makes the whole `font-family`
   * invalid, and the monospaced tokens fall back to the browser's serif — so a
   * review of typography on this route would be a review of Times New Roman.
   */
  fontClassName?: string;
  children: ReactNode;
}) {
  return (
    <html
      lang={context.locale}
      className={[context.theme, fontClassName].filter(Boolean).join(' ')}
    >
      <head>
        <meta httpEquiv="Content-Security-Policy" content={INTERFACE_REVIEW_CSP} />
        <meta name="robots" content="noindex,nofollow,noarchive" />
      </head>
      <body className="bg-cf-canvas text-cf-ink">
        <main
          data-interface-review-scene={sceneId}
          data-interface-review-state={context.state}
          data-interface-review-theme={context.theme}
          data-interface-review-locale={context.locale}
          data-interface-review-viewport={context.viewport}
          data-interface-review-data="synthetic"
          data-interface-review-persistence="disabled"
        >
          {children}
        </main>
      </body>
    </html>
  );
}

export function InterfaceReviewFrame({
  scene,
  context,
  children,
}: {
  scene: { id: string; states: readonly InterfaceReviewState[] };
  context: InterfaceReviewContext;
  children: ReactNode;
}) {
  if (!scene.states.includes(context.state)) {
    throw new Error(
      `Scene ${scene.id} does not support interface review state: ${context.state}`
    );
  }

  return (
    <section
      className={`${context.theme} min-h-screen bg-cf-canvas text-cf-ink`}
      lang={context.locale}
      aria-label={`Interface review: ${scene.id}`}
      data-interface-review-scene={scene.id}
      data-interface-review-state={context.state}
      data-interface-review-theme={context.theme}
      data-interface-review-locale={context.locale}
      data-interface-review-viewport={context.viewport}
      data-interface-review-data="synthetic"
      data-interface-review-persistence="disabled"
    >
      {children}
    </section>
  );
}
