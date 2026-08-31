'use client';

import type { ReactNode } from 'react';
import {
  InterfaceReviewFrame,
  defineInterfaceReviewScene,
  type InterfaceReviewContext,
  type InterfaceReviewState,
} from '../interface-review/fixture-contract';
import { ReviewLocaleProvider } from '../interface-review/review-i18n';
import type { VoiceLocale } from './voice-copy';

/**
 * One frame for every brand-voice screen under review.
 *
 * The eleven screens differ in what they show and not at all in how they are
 * reviewed: nine states, four widths, two themes, two languages. Writing that
 * shell eleven times is eleven chances for one screen to be reviewed slightly
 * differently from the rest, which is exactly the kind of drift a review is
 * supposed to catch rather than contain.
 *
 * The locale provider is here rather than in each scene because the reason for
 * it is a property of the route, not of any screen: this route renders on the
 * server and never hydrates, so a component reading i18next would silently
 * fall back to English under a `locale=ru` flag.
 */

export const VOICE_REVIEW_STATES = [
  'loading',
  'empty',
  'default',
  'selected',
  'success',
  'error',
  'restricted',
  'disabled',
  'long-content',
] as const satisfies readonly InterfaceReviewState[];

export type VoiceSceneRenderer = (input: {
  state: InterfaceReviewState;
  locale: VoiceLocale;
}) => ReactNode;

/**
 * A note under the screen saying what this state is meant to prove. Reviewing
 * nine near-identical pictures without one is how a state gets ticked off
 * because it rendered, rather than because it was right.
 */
export type VoiceSceneNotes = Partial<
  Record<InterfaceReviewState, { ru: string; en: string }>
>;

export function defineVoiceScene({
  id,
  fixture,
  render,
  notes,
}: {
  id: string;
  fixture: Record<string, unknown>;
  render: VoiceSceneRenderer;
  notes?: VoiceSceneNotes;
}) {
  const scene = defineInterfaceReviewScene({
    id,
    fixture: fixture as never,
    states: VOICE_REVIEW_STATES,
  });

  function Scene({ context }: { context: InterfaceReviewContext }) {
    const note = notes?.[context.state];
    return (
      <ReviewLocaleProvider locale={context.locale}>
        <InterfaceReviewFrame scene={scene} context={context}>
          <div
            className="mx-auto flex max-w-[1120px] flex-col gap-[16px] p-[24px]"
            data-interface-review-data="synthetic"
            data-voice-scene={id}
          >
            {render({ state: context.state, locale: context.locale })}
            {note ? (
              <p className="cf-caption text-cf-ink-muted [text-wrap:pretty]">
                {note[context.locale]}
              </p>
            ) : null}
          </div>
        </InterfaceReviewFrame>
      </ReviewLocaleProvider>
    );
  }

  return { scene, Scene };
}
