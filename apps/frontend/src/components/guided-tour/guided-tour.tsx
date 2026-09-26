'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import type { Driver, DriveStep } from 'driver.js';
import { buttonClassName } from '@contentfactory/react/form/button';
import { useInterfaceLanguage } from '@contentfactory/react/translation/use-interface-language';
import {
  resolveContentLocale,
  type ContentSectionLocale,
} from '@contentfactory/frontend/components/content-intelligence/content-section.copy';
import {
  TOUR_REVEALS_ATTR,
  TOUR_STOPS,
  clearTourSeen,
  tourEntry,
  markTourSeen,
  readTourRequest,
  type TourKey,
  type TourRevealsState,
  type TourStop,
} from './guided-tour.contract';
import { guidedTourCopy } from './guided-tour.copy';

/**
 * «Показать на экране» (`content-factory-next-2q28.7`, variant C of the
 * onboarding canvas): the person stays on the real screen, the control is
 * outlined and a small card says what it does.
 *
 * driver.js draws the overlay and places the card; everything a person sees
 * is ours. Its own stylesheet is not loaded — the look is the `cf` block in
 * `app/global.scss`, and the buttons take `buttonClassName` from the shared
 * `Button`, so the card's «Дальше» is the product's primary button rather
 * than a third copy of it.
 *
 * The library is imported inside the run, on the client only: the server
 * render and every page that never asks for a tour carry none of it.
 */

/** How long a tour waits for its first control before it quietly gives up. */
const APPEAR_TIMEOUT_MS = 6000;
/** How long «Дальше» waits for a control its own click is about to reveal. */
const REVEAL_TIMEOUT_MS = 2000;
const POLL_MS = 150;
/** After the first control shows up, a beat for its neighbours to render. */
const SETTLE_MS = 250;

let locale: ContentSectionLocale = 'ru';
let active: Driver | null = null;
let runToken = 0;

const isVisible = (element: Element | null): element is HTMLElement =>
  Boolean(element && element.getClientRects().length > 0);

const resolveStop = (stop: TourStop): HTMLElement | null => {
  for (const selector of stop.anchors) {
    const found = Array.from(document.querySelectorAll(selector)).find(isVisible);
    if (found) return found as HTMLElement;
  }
  return null;
};

/** What the screen says its anchor's click can bring (`TOUR_REVEALS_ATTR`). */
const revealsState = (stop: TourStop): TourRevealsState | null => {
  if (!stop.clickOnNext || !stop.reveals?.length) return null;
  const value = resolveStop(stop)?.getAttribute(TOUR_REVEALS_ATTR);
  return value === 'pending' || value === 'off' ? value : 'on';
};

const sleep = (ms: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, ms));

async function waitFor<T>(
  probe: () => T | null,
  timeout: number,
  alive: () => boolean
): Promise<T | null> {
  const deadline = Date.now() + timeout;
  for (;;) {
    if (!alive()) return null;
    const value = probe();
    if (value || Date.now() >= deadline) return value;
    await sleep(POLL_MS);
  }
}

const reducedMotion = () =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const FOCUSABLE =
  'button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Where focus goes when the card closes: the trigger, else the last control. */
const restoreFocus = (trigger: Element | null, last: Element | null) => {
  window.setTimeout(() => {
    const candidates = [trigger, last, last?.querySelector(FOCUSABLE) ?? null];
    for (const candidate of candidates) {
      if (
        candidate instanceof HTMLElement &&
        candidate !== document.body &&
        candidate.isConnected &&
        candidate.matches(FOCUSABLE)
      ) {
        candidate.focus({ preventScroll: true });
        return;
      }
    }
  }, 0);
};

const CLOSE_ICON =
  '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>';

const PRIMARY = buttonClassName({ variant: 'primary', density: 'dense' });
const SECONDARY = buttonClassName({ variant: 'secondary', density: 'dense' });
const QUIET = buttonClassName({ variant: 'quiet', density: 'dense' });

const addClasses = (element: HTMLElement, classes: string) =>
  element.classList.add(...classes.split(/\s+/).filter(Boolean));

/**
 * Runs one tour now. Stops whose control is not on the screen are left out;
 * a tour with none of its controls on the screen within a few seconds does
 * nothing at all. Starting a tour ends the one already running.
 */
export async function startTour(key: TourKey): Promise<boolean> {
  const token = ++runToken;
  const alive = () => token === runToken;
  const trigger =
    document.activeElement && document.activeElement !== document.body
      ? document.activeElement
      : null;
  active?.destroy();
  active = null;

  const stops = TOUR_STOPS[key];
  // None of the stops on the screen yet, but the screen names the control
  // that brings them (a tab, `TOUR_ENTER_ATTR`): click it once and keep
  // looking, rather than waiting out the timeout on the wrong tab.
  let entered = false;
  const first = await waitFor(
    () => {
      const found = stops.find((stop) => resolveStop(stop)) ?? null;
      if (found || entered) return found;
      const entry = Array.from(document.querySelectorAll(tourEntry(key))).find(
        isVisible
      );
      if (entry) {
        entered = true;
        entry.click();
      }
      return null;
    },
    APPEAR_TIMEOUT_MS,
    alive
  );
  if (!first || !alive()) return false;
  await sleep(SETTLE_MS);
  if (!alive()) return false;

  // A click whose screen is still finding out what it leads to gets a short
  // wait, so the count on the card is decided before the card is drawn.
  await waitFor(
    () => (stops.some((stop) => revealsState(stop) === 'pending') ? null : true),
    REVEAL_TIMEOUT_MS,
    alive
  );
  if (!alive()) return false;

  // Present now, or brought onto the screen by an earlier stop's «Дальше».
  // A click the screen says leads nowhere brings nothing: its stop ends the
  // run with «Понятно» instead of a «1 из 3» that hangs and then vanishes.
  const plan: TourStop[] = [];
  const revealed = new Set<string>();
  const dead = new Set<string>();
  for (const stop of stops) {
    if (!revealed.has(stop.id) && !resolveStop(stop)) continue;
    plan.push(stop);
    if (revealsState(stop) === 'off') {
      dead.add(stop.id);
      continue;
    }
    stop.reveals?.forEach((id) => revealed.add(id));
  }
  if (!plan.length) return false;

  const { driver } = await import('driver.js');
  if (!alive()) return false;

  const words = guidedTourCopy[locale];
  const still = reducedMotion();
  let moving = false;
  let last: Element | null = null;

  const steps: DriveStep[] = plan.map((stop, index) => ({
    element: () => resolveStop(stop) ?? document.body,
    popover: {
      title: words.stops[stop.id].title,
      description: words.stops[stop.id].body,
      side: stop.side ?? 'bottom',
      align: 'start',
      // Nothing to go back to: no «Назад» rather than a dead one.
      ...(index === 0 ? { showButtons: ['next', 'close'] as const } : {}),
    },
  }));

  const findFrom = async (
    from: number,
    direction: 1 | -1,
    wait: number,
    giveUp: () => boolean = () => false
  ) => {
    for (let j = from; j >= 0 && j < plan.length; j += direction) {
      const found = await waitFor<HTMLElement | 'gave-up'>(
        () => resolveStop(plan[j]) ?? (giveUp() ? 'gave-up' : null),
        j === from ? wait : 0,
        alive
      );
      if (found === 'gave-up') return -1;
      if (found) return j;
    }
    return -1;
  };

  const tour: Driver = driver({
    steps,
    animate: !still,
    duration: 200,
    smoothScroll: !still,
    allowClose: true,
    allowKeyboardControl: true,
    overlayColor: 'var(--cf-backdrop)',
    overlayOpacity: 1,
    stagePadding: 6,
    stageRadius: 12,
    popoverOffset: 12,
    popoverClass: 'cf-guided-tour',
    showProgress: plan.length > 1,
    progressText: words.progress,
    showButtons: ['next', 'previous', 'close'],
    nextBtnText: words.next,
    prevBtnText: words.previous,
    doneBtnText: words.done,
    onPopoverRender: (popover) => {
      // driver.js already names the card a dialog labelled by its title.
      addClasses(popover.nextButton, PRIMARY);
      addClasses(popover.previousButton, SECONDARY);
      addClasses(popover.closeButton, QUIET);
      popover.closeButton.setAttribute('aria-label', words.close);
      popover.closeButton.innerHTML = CLOSE_ICON;
      // Drawn in the corner, read last: the card's text and its move come
      // first. driver.js focuses the first control after this hook, so the
      // move to «Дальше» waits one task.
      popover.wrapper.appendChild(popover.closeButton);
      window.setTimeout(() => {
        if (popover.wrapper.isConnected) {
          popover.nextButton.focus({ preventScroll: true });
        }
      }, 0);
    },
    onHighlighted: (element) => {
      last = element ?? last;
    },
    onNextClick: (element) => {
      if (moving) return;
      moving = true;
      const index = tour.getActiveIndex() ?? 0;
      const stop = plan[index];
      const clicks = Boolean(stop?.clickOnNext && element && !dead.has(stop.id));
      if (clicks && stop?.clickOnNext && element) {
        const target =
          stop.clickOnNext === 'self'
            ? element
            : element.querySelector(stop.clickOnNext);
        if (target instanceof HTMLElement) target.click();
      }
      // The screen may learn only now that the click led nowhere; then the
      // wait ends at once rather than running out.
      const ledNowhere = () =>
        Boolean(stop && document.querySelector(
          stop.anchors.map((a) => `${a}[${TOUR_REVEALS_ATTR}="off"]`).join(', ')
        ));
      void findFrom(index + 1, 1, clicks ? REVEAL_TIMEOUT_MS : 0, ledNowhere)
        .then((next) => {
          if (!alive() || !tour.isActive()) return;
          if (next < 0) tour.destroy();
          else tour.moveTo(next);
        })
        .finally(() => {
          moving = false;
        });
    },
    onPrevClick: () => {
      if (moving) return;
      const index = tour.getActiveIndex() ?? 0;
      void findFrom(index - 1, -1, 0).then((previous) => {
        if (previous >= 0 && alive() && tour.isActive()) tour.moveTo(previous);
      });
    },
    onDestroyed: () => {
      markTourSeen(key, safeStorage());
      if (active === tour) active = null;
      restoreFocus(trigger, last);
    },
  });

  active = tour;
  tour.drive();
  return true;
}

const safeStorage = (): Storage | null => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

/** «Показать снова»: forgets the «shown» mark and runs the tour now. */
export function restartTour(key: TourKey): Promise<boolean> {
  clearTourSeen(key, safeStorage());
  return startTour(key);
}

/**
 * Mounted once in the signed-in layout. Reads `?tour=<key>` on every address
 * change, takes the parameter off the address without a reload, and runs the
 * tour once its controls are on the screen. The link is an explicit request,
 * so it runs whether or not the tour was shown before.
 */
export function GuidedTour(): null {
  const searchParams = useSearchParams();
  const language = useInterfaceLanguage();
  locale = resolveContentLocale(language);
  const query = searchParams?.toString() ?? '';

  useEffect(() => {
    const { key, cleaned } = readTourRequest(window.location.href);
    if (cleaned === null) return;
    // Same idiom as the content section's tab address: the native history
    // call keeps Next's router in step and re-renders nothing on the server.
    window.history.replaceState(null, '', cleaned);
    // Not cancelled on cleanup: a strict-mode remount would otherwise kill the
    // run whose parameter is already gone. A newer request replaces it.
    if (key) void startTour(key);
  }, [query]);

  return null;
}

export default GuidedTour;
