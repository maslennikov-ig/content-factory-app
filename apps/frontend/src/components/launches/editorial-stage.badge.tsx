'use client';

import { FC } from 'react';
import {
  editorialStageBadgeLabel,
  resolveEditorialStageLocale,
  EditorialStageValue,
} from '@contentfactory/frontend/components/launches/editorial-stage.copy';
import { Status, StatusTone } from '@contentfactory/frontend/components/ui/surface';
import { useVariables } from '@contentfactory/react/helpers/variable.context';

/**
 * One tone per stage so four badges read apart at a glance without relying
 * on the text alone — `danger` stays out of the map on purpose, it already
 * means "something is broken" for the `ERROR` delivery ring on this same
 * card.
 */
const EDITORIAL_STAGE_TONES: Record<EditorialStageValue, StatusTone> = {
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
 */
export const EditorialStageBadge: FC<{
  stage: EditorialStageValue | null | undefined;
  className?: string;
}> = ({ stage, className }) => {
  const { language } = useVariables();
  if (!stage) return null;
  const locale = resolveEditorialStageLocale(language);
  return (
    <Status tone={EDITORIAL_STAGE_TONES[stage]} className={className}>
      {editorialStageBadgeLabel(locale, stage)}
    </Status>
  );
};
