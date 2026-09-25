/**
 * The guided tour's contract (`content-factory-next-2q28.7`).
 *
 * The owner picked «Показать на экране», variant C of the onboarding canvas:
 * the person stays on the real screen, the control that matters is outlined,
 * and a small card says what it does. This file is the part other code
 * depends on and a test can read without a browser:
 *
 * - the keys a link may ask for (`?tour=<key>`), exported as `TOUR_KEYS`;
 * - how the key is read off an address and how the address looks after it is
 *   taken off again;
 * - which `data-tour` anchors each stop looks for;
 * - the «already shown» mark in `localStorage`.
 *
 * The words live in `guided-tour.copy.ts`, the driver in `guided-tour.tsx`.
 */

export const TOUR_KEYS = [
  'avatar',
  'channel',
  'piece',
  'adaptation',
  'plan',
] as const;

export type TourKey = (typeof TOUR_KEYS)[number];

/** The query parameter a link carries: `/channels?tour=channel`. */
export const TOUR_PARAM = 'tour';

export const isTourKey = (value: unknown): value is TourKey =>
  typeof value === 'string' && (TOUR_KEYS as readonly string[]).includes(value);

/** `[data-tour="…"]` — the only way a stop finds its control. */
export const tourAnchor = (name: string) => `[data-tour="${name}"]`;

export type TourStopId =
  | 'avatarCreate'
  | 'avatarList'
  | 'channelConnect'
  | 'channelTelegram'
  | 'pieceNew'
  | 'pieceKind'
  | 'pieceInput'
  | 'adaptationAdapt'
  | 'adaptationPanel'
  | 'adaptationRewrite'
  | 'adaptationPreview'
  | 'planView'
  | 'planSearch'
  | 'planConfirm';

export type TourStop = {
  /** Key into `guidedTourCopy[locale].stops`. */
  id: TourStopId;
  /** Selectors tried in order; the first visible match is the stop's control. */
  anchors: readonly string[];
  /**
   * «Дальше» on this stop first clicks this element (a selector inside the
   * anchor, or `'self'`), because the next stops only exist after it: the
   * list view's search, the intake's kinds. The click is the move the card
   * just described — the tour makes it for the person instead of asking.
   */
  clickOnNext?: 'self' | string;
  /**
   * The stops that click brings onto the screen. They join the run even
   * though their controls are not there yet; anything else missing at the
   * start is left out, so the count on the card stays honest.
   */
  reveals?: readonly TourStopId[];
  /*
   * Whether that click can bring them at all is the screen's knowledge, not
   * the tour's: the anchor says so with `data-tour-reveals` (see
   * `TOUR_REVEALS_ATTR`).
   */
  side?: 'top' | 'right' | 'bottom' | 'left';
};

/**
 * Set by a screen on a `clickOnNext` anchor when its click cannot bring the
 * next stops onto the screen — the brief without a model to write with shows
 * «Написать пока нечем» instead of the kinds and the input.
 *
 * - `pending`: the screen does not know yet; the tour waits a moment.
 * - `off`: the click leads nowhere. The stop is the tour's last one, its
 *   button reads «Понятно» and it clicks nothing.
 * - absent or `on`: the click is made and the next stops join the run.
 */
export const TOUR_REVEALS_ATTR = 'data-tour-reveals';
export type TourRevealsState = 'pending' | 'on' | 'off';

/**
 * Two to four stops per key. A stop whose control is not on the screen is left
 * out of the run, so one tour serves both states of a screen (an empty avatar
 * section and a list of avatars, a piece with and without an adaptation).
 */
export const TOUR_STOPS: Record<TourKey, readonly TourStop[]> = {
  avatar: [
    // No «Посмотреть готовый пример» stop: the product has no finished
    // example to show, and a tour must not point at a control that does
    // nothing (stand check 25.09.2026, D1).
    { id: 'avatarCreate', anchors: [tourAnchor('avatar-create')] },
    { id: 'avatarList', anchors: [tourAnchor('avatar-list')], side: 'top' },
  ],
  channel: [
    {
      id: 'channelConnect',
      // The button belongs to a shared component that forwards no attributes;
      // the anchor sits on the channels screen's own header around it.
      anchors: [`${tourAnchor('channel-connect')} button`],
    },
    {
      id: 'channelTelegram',
      anchors: [`${tourAnchor('channel-connect')} button`],
    },
  ],
  piece: [
    {
      id: 'pieceNew',
      anchors: [tourAnchor('piece-new')],
      clickOnNext: 'self',
      reveals: ['pieceKind', 'pieceInput'],
    },
    { id: 'pieceKind', anchors: [tourAnchor('piece-kind')] },
    { id: 'pieceInput', anchors: [tourAnchor('piece-input')] },
  ],
  adaptation: [
    { id: 'adaptationAdapt', anchors: [tourAnchor('adaptation-adapt')] },
    { id: 'adaptationPanel', anchors: [tourAnchor('adaptation-panel')], side: 'left' },
    { id: 'adaptationRewrite', anchors: [tourAnchor('adaptation-rewrite')] },
    { id: 'adaptationPreview', anchors: [tourAnchor('adaptation-preview')] },
  ],
  plan: [
    {
      id: 'planView',
      anchors: [tourAnchor('plan-view')],
      clickOnNext: '[data-cf-choice-value="list"]',
      reveals: ['planSearch'],
    },
    { id: 'planSearch', anchors: [tourAnchor('plan-search')] },
    { id: 'planConfirm', anchors: [tourAnchor('plan-confirm')] },
  ],
};

/**
 * Reads `?tour=` off an address. `key` is the tour to run (or `null` for none
 * or an unknown value); `cleaned` is the same address without the parameter,
 * or `null` when there was nothing to take off. An unknown key is still taken
 * off: a stale link should not leave junk in the bar.
 */
export function readTourRequest(href: string): {
  key: TourKey | null;
  cleaned: string | null;
} {
  let url: URL;
  try {
    url = new URL(href, 'http://localhost');
  } catch {
    return { key: null, cleaned: null };
  }
  if (!url.searchParams.has(TOUR_PARAM)) return { key: null, cleaned: null };
  const value = url.searchParams.get(TOUR_PARAM);
  url.searchParams.delete(TOUR_PARAM);
  const query = url.searchParams.toString();
  return {
    key: isTourKey(value) ? value : null,
    cleaned: `${url.pathname}${query ? `?${query}` : ''}${url.hash}`,
  };
}

/** `localStorage` key of the «shown» mark. */
export const tourSeenKey = (key: TourKey) => `cf.guided-tour.seen.${key}`;

type MarkStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/**
 * The «shown» mark. Storage can throw (private mode, a full quota, a blocked
 * third-party frame); a mark that cannot be read reads as «not shown», a mark
 * that cannot be written is dropped. Neither stops a tour.
 */
export function hasSeenTour(key: TourKey, store?: MarkStore | null): boolean {
  try {
    return store?.getItem(tourSeenKey(key)) === '1';
  } catch {
    return false;
  }
}

export function markTourSeen(key: TourKey, store?: MarkStore | null): void {
  try {
    store?.setItem(tourSeenKey(key), '1');
  } catch {
    /* nothing to do: the next explicit request shows the tour again anyway */
  }
}

export function clearTourSeen(key: TourKey, store?: MarkStore | null): void {
  try {
    store?.removeItem(tourSeenKey(key));
  } catch {
    /* see markTourSeen */
  }
}
