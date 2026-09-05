'use client';

import { FC } from 'react';
import clsx from 'clsx';
import {
  editorialStageBadgeLabel,
  editorialStageLabel,
  resolveEditorialStageLocale,
  EditorialStageValue,
} from '@contentfactory/frontend/components/launches/editorial-stage.copy';
import { Status, StatusTone } from '@contentfactory/frontend/components/ui/surface';
import { useInterfaceLanguage } from '@contentfactory/react/translation/use-interface-language';

/**
 * One tone per stage so four badges read apart at a glance without relying
 * on the text alone — `danger` stays out of the map on purpose, it already
 * means "something is broken" for the `ERROR` delivery ring on this same
 * card.
 */
export const EDITORIAL_STAGE_TONES: Record<EditorialStageValue, StatusTone> = {
  PLAN: 'neutral',
  DRAFT: 'info',
  REVIEW: 'warning',
  SCHEDULED: 'accent',
};

/**
 * Reads next to the platform, the time and the delivery `state` this card
 * already carries — see `content-factory-next-pdbe`. Renders nothing when
 * the post has no recorded stage, which is the normal state for every post
 * that existed before this field, not an error to explain.
 *
 * `withPrefix` buys disambiguation with width. Spelled out, «Этап: На
 * проверке» needs 147px; a week-view card is 94px wide and a month-view one
 * about 100px. Measured in a browser on 02.09.2026: the prefixed pill ran 29px
 * past the card's own border and clipped its text mid-word — in month view it
 * spilled into the neighbouring day. So the prefix is spent only where the row
 * is full width (day and list), and the narrow grids get the bare label, which
 * fits. `max-w-full` plus the inner `truncate` mean that even an unforeseen
 * width ends in an ellipsis inside the card instead of an overflow outside it.
 */
export const EditorialStageBadge: FC<{
  stage: EditorialStageValue | null | undefined;
  withPrefix?: boolean;
  className?: string;
}> = ({ stage, withPrefix = true, className }) => {
  // Хук зовётся до раннего выхода: порядок хуков не зависит от того,
  // задан ли этап.
  const interfaceLanguage = useInterfaceLanguage();
  if (!stage) return null;
  const locale = resolveEditorialStageLocale(interfaceLanguage);
  const label = withPrefix
    ? editorialStageBadgeLabel(locale, stage)
    : editorialStageLabel(locale, stage);
  return (
    <Status
      tone={EDITORIAL_STAGE_TONES[stage]}
      className={clsx('max-w-full overflow-hidden', className)}
    >
      <span className="truncate" title={editorialStageBadgeLabel(locale, stage)}>
        {label}
      </span>
    </Status>
  );
};
