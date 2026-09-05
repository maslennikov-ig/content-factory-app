'use client';

import {
  InterfaceReviewFrame,
  defineInterfaceReviewScene,
  type InterfaceReviewContext,
  type InterfaceReviewState,
} from '../interface-review/fixture-contract';
import { FactRowView, factsShowcaseCopy } from './content-facts.showcase';
import { ContentReadOnlyNote } from './content-write-right';
import type { FactRow } from './content-facts.adapter';

/**
 * «Откуда факты» when the workspace may look but not write
 * (`content-factory-next-cl19`).
 *
 * §7 of `docs/product/content-section-map.md` listed «только чтение» among
 * the states `Facts.dc.html` never drew, and the screen had no way to be put
 * in it: the read-only state arrives only after the server refuses a write,
 * which a review route deliberately has no network to provoke.
 *
 * The rows and the note here are the screen's own components and the screen's
 * own dictionary, not a redrawing of them — the panel around them is what this
 * scene stubs, the same way `content-section.review-scene.tsx` stubs a panel
 * it does not own. What is worth looking at is the row with three dead
 * actions and one sentence under them: whether «Снять», «Копировать» and
 * «Подтвердить» still read as controls rather than as decoration, whether the
 * explanation is legible in both themes, and whether the three of them plus
 * the note still fit beside a claim at 390px.
 */

export const CONTENT_FACTS_REVIEW_STATES = [
  'default',
  'restricted',
  'disabled',
  'long-content',
] as const satisfies readonly InterfaceReviewState[];

const OWN_WORD_FACT: FactRow = {
  id: 'fact_supplier',
  claimKey: 'подшипники|поставщик',
  topic: 'подшипники',
  topicLabel: 'Подшипники',
  statement: 'Поставщика подшипников мы поменяли в марте 2026 года.',
  language: 'ru',
  temporalKind: 'DATED',
  freshUntil: null,
  status: 'UNVERIFIED',
  supersedesFactId: null,
  createdAt: '2026-03-04T09:00:00.000Z',
  updatedAt: '2026-03-04T09:00:00.000Z',
  createdByName: 'Ирина',
  grounding: {
    method: 'OWN_WORD',
    evidenceId: null,
    excerpt: null,
    sourceLabel: null,
    sourceUrl: null,
    observedAt: null,
  },
  needsLook: false,
  evidence: [],
};

/** The only row that carries three actions: «Подтвердить» beside the two. */
const SEARCH_FACT: FactRow = {
  ...OWN_WORD_FACT,
  id: 'fact_market',
  claimKey: 'рынок|доля',
  topic: 'рынок',
  topicLabel: 'Рынок',
  statement: 'Доля рынка подшипников у трёх заводов — больше половины.',
  status: 'UNVERIFIED',
  grounding: {
    method: 'SEARCH_RESULT',
    evidenceId: 'evidence_market',
    excerpt:
      'На три завода приходится 54% выпуска подшипников качения в стране.',
    sourceLabel: 'Отраслевой обзор',
    sourceUrl: 'https://industry.synthetic.invalid/bearings/2026/review',
    observedAt: '2026-08-30T07:00:00.000Z',
  },
  needsLook: true,
};

const LONG_FACT: FactRow = {
  ...SEARCH_FACT,
  id: 'fact_long',
  statement:
    'Поставщика подшипников качения для линии сборки редукторов мы поменяли в марте 2026 года, после того как прежний дважды сорвал сроки поставки, и новый договор считает срок от даты отгрузки со склада, а не от даты подписания заявки.',
};

export const scene = defineInterfaceReviewScene({
  id: 'content-intelligence/content-facts',
  fixture: {
    facts: [OWN_WORD_FACT.id, SEARCH_FACT.id],
    refusals: ['role', 'plan'],
  },
  states: CONTENT_FACTS_REVIEW_STATES,
});

const NOTE_ID = 'content-facts-review-read-only';

const NOTE: Record<'en' | 'ru', string> = {
  ru: 'Разбор состояния: сервер отказал по праву, и экран остался читаемым.',
  en: 'About this state: the server refused by right and the screen stayed readable.',
};

export function Scene({ context }: { context: InterfaceReviewContext }) {
  const locale = context.locale;
  const t = factsShowcaseCopy[locale];
  const restricted = context.state === 'restricted';
  const busy = context.state === 'disabled';
  const rows =
    context.state === 'long-content'
      ? [LONG_FACT]
      : [SEARCH_FACT, OWN_WORD_FACT];

  return (
    <InterfaceReviewFrame scene={scene} context={context}>
      <div
        data-interface-review-data="synthetic"
        className="flex min-w-0 flex-col gap-[16px] p-[16px] sm:p-[20px] lg:p-[24px]"
      >
        <div className="flex flex-col gap-[4px]">
          <h2 className="cf-heading-md text-cf-ink [text-wrap:balance]">
            {t.title}
          </h2>
          <p className="max-w-[72ch] cf-body-sm text-cf-ink-muted [text-wrap:pretty]">
            {t.body}
          </p>
        </div>

        {restricted && (
          <ContentReadOnlyNote id={NOTE_ID} surface="facts" refusal="plan">
            {t.readOnlyPlan}
          </ContentReadOnlyNote>
        )}

        <ul className="divide-y divide-cf-border rounded-[8px] border border-cf-border bg-cf-surface px-[16px]">
          {rows.map((fact) => (
            <FactRowView
              key={fact.id}
              fact={fact}
              locale={locale}
              t={t}
              busy={busy}
              canWrite={!restricted}
              noteId={NOTE_ID}
              expanded={false}
              onToggleExcerpt={() => undefined}
              onRetract={() => undefined}
              onRestore={() => undefined}
              onCopy={() => undefined}
              onConfirm={() => undefined}
            />
          ))}
        </ul>

        <p className="max-w-[72ch] cf-caption text-cf-ink-muted [text-wrap:pretty]">
          {restricted
            ? NOTE[locale]
            : locale === 'ru'
            ? 'Обычное состояние: те же действия живые. Сравнивать read-only надо с ним.'
            : 'The ordinary state: the same actions, live. Read-only is meant to be compared with it.'}
        </p>
      </div>
    </InterfaceReviewFrame>
  );
}
