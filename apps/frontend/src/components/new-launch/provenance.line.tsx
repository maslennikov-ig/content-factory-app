'use client';

import { FC } from 'react';
import dayjs from 'dayjs';
import { useVariables } from '@contentfactory/react/helpers/variable.context';
import { formatDateTimeForReader } from '@contentfactory/frontend/components/launches/helpers/isuscitizen.utils';
import {
  composeCopy,
  resolveComposeLocale,
} from '@contentfactory/frontend/components/new-launch/compose.copy';
import type { ContentIntelligenceProvenance } from '@contentfactory/frontend/components/new-launch/store';

/**
 * Откуда взялся этот пост — одной строкой.
 *
 * До 04.09.2026 на первом экране окна стояли две поверхности: панель
 * «Проверенный контекст» с состоянием сервера, ISO-датой и версией профиля
 * моноширинным, и лента «Применённый аватар» с пятью значениями через точку и
 * двумя кнопками. Человек, который просто пишет пост, читал их как отчёт
 * отладчика. Решение владельца: окно даёт только полезное, а происхождение —
 * это один вопрос и потому одна строка.
 *
 * Строки нет вовсе у поста без контекста. Пустая строка «происхождения нет»
 * была бы отчётом о проверке, которой не было: обычный пост человек пишет
 * сам, и говорить ему об этом нечего.
 *
 * «Подробнее» — нативный `<details>`: роль кнопки, состояние и Enter/Space
 * браузер держит верно, а примитива раскрытия в продукте нет. Моноширинный
 * шрифт живёт только там, где стоят идентификаторы и даты.
 */
export const ProvenanceLine: FC<{
  provenance: ContentIntelligenceProvenance | null;
  /**
   * Сколько подтверждений записано за этим постом. `undefined` — контекст
   * есть, а выбранных подтверждений за коробками нет: тогда числа не будет,
   * потому что взять его неоткуда.
   */
  confirmationCount?: number;
}> = ({ provenance, confirmationCount }) => {
  const { language } = useVariables();
  const copy = composeCopy[resolveComposeLocale(language)];

  if (!provenance) return null;

  const voiceLabel =
    provenance.brandProfileSelection.mode === 'resolved'
      ? provenance.profileLabel?.trim() || null
      : null;
  const versionLabel =
    provenance.brandProfileSelection.mode === 'resolved'
      ? `v${provenance.brandProfileSelection.versionNumber}`
      : null;

  const stateSentence =
    provenance.contentContextStatus === 'READY'
      ? copy.stateReady
      : provenance.contentContextStatus === 'PARTIAL'
      ? copy.statePartial
      : provenance.contentContextStatus === 'BLOCKED_STALE'
      ? copy.stateStale
      : provenance.contentContextStatus === 'BLOCKED_CONFLICT'
      ? copy.stateConflict
      : copy.stateUnavailable;

  const validUntil = (() => {
    if (!provenance.expiresAt) return null;
    const parsed = dayjs(provenance.expiresAt);
    if (!parsed.isValid()) return null;
    return formatDateTimeForReader(parsed.toDate());
  })();

  return (
    <div
      data-provenance-line="true"
      className="flex flex-col gap-[8px] rounded-[8px] border border-cf-border bg-cf-surface p-[12px]"
    >
      <p className="cf-body-sm text-cf-ink [text-wrap:pretty]">
        {confirmationCount === undefined
          ? copy.assembledFromUnknown
          : copy.assembledFrom(confirmationCount)}
        {' · '}
        {voiceLabel
          ? copy.writtenBy(voiceLabel)
          : versionLabel
          ? copy.writtenByVersion(versionLabel)
          : copy.writtenByNeutral}
      </p>
      <details className="group">
        <summary className="inline-flex w-fit cursor-pointer list-none items-center gap-[4px] cf-body-sm text-cf-ink-muted underline underline-offset-2 hover:text-cf-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cf-focus">
          {copy.details}
        </summary>
        <div className="mt-[8px] flex flex-col gap-[8px]">
          <p className="cf-body-sm text-cf-ink-muted [text-wrap:pretty]">
            {stateSentence}
          </p>
          <div className="flex flex-wrap gap-x-[16px] gap-y-[4px]">
            {versionLabel && (
              <span className="cf-label-sm text-cf-ink">
                {copy.detailProfile}: {voiceLabel ? `${voiceLabel} · ` : ''}
                {versionLabel}
              </span>
            )}
            {validUntil && (
              <span className="cf-caption text-cf-ink-muted">
                {copy.detailValidUntil}: {validUntil}
              </span>
            )}
            {provenance.validationStatus === 'VALID' && (
              <span className="cf-caption text-cf-ink-muted">
                {copy.detailChecked}
              </span>
            )}
          </div>
        </div>
      </details>
    </div>
  );
};
