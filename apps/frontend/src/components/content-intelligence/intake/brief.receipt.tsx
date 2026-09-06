'use client';

import { useState } from 'react';
import { Button } from '@contentfactory/react/form/button';
import { Textarea } from '@contentfactory/react/form/textarea';
import { Status, type StatusTone } from '../../ui/surface';
import { voiceCopy } from '../../brand-voice/voice-copy';
import { intakeCopy, type IntakeLocale } from './intake.copy';
import {
  RECEIPT_FIELDS,
  nextInputKind,
  type BriefFieldOriginV1,
  type BriefFilledV1,
  type IntakeInputKindV1,
  type ReceiptField,
} from './intake.adapter';

/**
 * Квитанция «Что модель поняла».
 *
 * Решение владельца 06.09.2026 (пункт 4): результат показывается на том же
 * экране, и рядом с текстом стоит расписка — что именно модель приняла за
 * тезис, позицию, возражение и адресата, и откуда каждое из этих значений
 * взялось. Без неё «модель заполняет бриф сама» означает «модель что-то
 * решила за вас, а что — узнаете из текста».
 *
 * Происхождение печатается словом, а не цветом: «предположение» и «из вашего
 * текста» — разные права на строку. Первое человек правит не глядя, второе
 * трогать незачем.
 *
 * Правка не уходит на сервер сама. Она копится здесь, квитанция становится
 * «грязной» (`data-brief-receipt-dirty`), и только «Пересобрать» на экране
 * тратит её как `briefOverrides`. Автосохранение поля брифа означало бы
 * генерацию на каждое нажатие клавиши.
 *
 * Подписи полей взяты из `voice-copy.ts` — те же самые, что у ручной формы
 * брифа. Второй набор слов про тот же тезис — это два разных представления о
 * том, что такое тезис, у одного продукта.
 */

const ORIGIN_TONE: Record<BriefFieldOriginV1, StatusTone> = {
  input: 'neutral',
  person: 'accent',
  avatar: 'info',
  memory: 'info',
  search: 'info',
  // Предположение — единственное происхождение, которое просит взгляда.
  model: 'warning',
};

const originWord = (
  t: (typeof intakeCopy)[IntakeLocale],
  origin: BriefFieldOriginV1
) =>
  origin === 'input'
    ? t.originInput
    : origin === 'person'
    ? t.originPerson
    : origin === 'avatar'
    ? t.originAvatar
    : origin === 'memory'
    ? t.originMemory
    : origin === 'search'
    ? t.originSearch
    : t.originModel;

const kindWord = (
  t: (typeof intakeCopy)[IntakeLocale],
  kind: IntakeInputKindV1
) =>
  kind === 'link'
    ? t.kindLinkShort
    : kind === 'foreign_post'
    ? t.kindForeign
    : t.kindThought;

export type BriefOverrides = Partial<Record<ReceiptField, string>>;

export function BriefReceipt({
  locale,
  brief,
  overrides,
  kindOverride,
  readOnly = false,
  onOverride,
  onKindChange,
  onRevert,
}: {
  locale: IntakeLocale;
  brief: BriefFilledV1;
  overrides: BriefOverrides;
  kindOverride?: IntakeInputKindV1;
  readOnly?: boolean;
  onOverride: (field: ReceiptField, value: string) => void;
  onKindChange: (kind: IntakeInputKindV1) => void;
  onRevert: () => void;
}) {
  const t = intakeCopy[locale];
  const v = voiceCopy[locale];
  const [editing, setEditing] = useState<ReceiptField | null>(null);

  const kind = kindOverride ?? brief.inputKind;
  const dirty =
    Object.keys(overrides).length > 0 ||
    (kindOverride !== undefined && kindOverride !== brief.inputKind);

  const label: Record<ReceiptField, string> = {
    thesis: v.briefThesis,
    position: v.briefPosition,
    disagreement: v.briefDisagreement,
    audience: v.briefAudience,
    goal: v.briefGoal,
    format: v.briefFormat,
  };

  const shown = (field: ReceiptField): string => {
    if (typeof overrides[field] === 'string') return overrides[field] as string;
    const value = brief[field];
    return typeof value === 'string' ? value : '';
  };

  return (
    <section
      data-brief-receipt="true"
      data-brief-receipt-dirty={String(dirty)}
      className="flex min-w-0 flex-col gap-[12px] rounded-[8px] border border-cf-border bg-cf-surface p-[16px]"
    >
      <header className="flex flex-col gap-[4px]">
        <h3 className="cf-heading-md text-cf-ink [text-wrap:balance]">
          {t.receiptTitle}
        </h3>
        <p className="max-w-[64ch] cf-body-sm text-cf-ink-muted [text-wrap:pretty]">
          {t.receiptLead}
        </p>
      </header>

      {/*
        Нулевая строка: чем модель сочла присланное. Она стоит выше тезиса,
        потому что от неё зависит всё остальное — из ссылки и из мысли брифы
        собираются по-разному, и ошибка здесь объясняет ошибку ниже.
        «Это не так» переключает по кругу три значения, а не открывает список:
        значений ровно три и они названы словами.
      */}
      <div
        data-brief-receipt-row="inputKind"
        className="flex min-w-0 flex-wrap items-center gap-[8px] border-b border-cf-border pb-[12px]"
      >
        <p className="cf-label-sm uppercase text-cf-ink-muted">
          {t.understoodAs}
        </p>
        <Status tone="neutral">{kindWord(t, kind)}</Status>
        {!readOnly && (
          <Button
            type="button"
            variant="quiet"
            density="dense"
            onClick={() => onKindChange(nextInputKind(kind))}
          >
            {t.notSo}
          </Button>
        )}
      </div>

      {RECEIPT_FIELDS.map((field) => {
        const value = shown(field);
        const edited = typeof overrides[field] === 'string';
        const origin: BriefFieldOriginV1 = edited
          ? 'person'
          : brief.origins[field] ?? 'model';

        return (
          <div
            key={field}
            data-brief-receipt-row={field}
            className="flex min-w-0 flex-col gap-[4px]"
          >
            <div className="flex flex-wrap items-center gap-[8px]">
              <p className="cf-label-sm uppercase text-cf-ink-muted">
                {label[field]}
              </p>
              {/*
                Атрибут висит на обёртке, а не на самом `Status`: общий
                примитив принимает только тон, значок и класс, и расширять
                его ради одной метки для теста — это менять компонент,
                которым пользуются шесть экранов.
              */}
              <span data-brief-origin={origin} className="inline-flex">
                <Status tone={ORIGIN_TONE[origin]} className="uppercase">
                  {originWord(t, origin)}
                </Status>
              </span>
              {!readOnly && (
                <Button
                  type="button"
                  variant="quiet"
                  density="dense"
                  onClick={() =>
                    setEditing((current) => (current === field ? null : field))
                  }
                >
                  {editing === field ? t.editDone : t.edit}
                </Button>
              )}
            </div>
            {editing === field ? (
              <Textarea
                standalone
                layout="content"
                name={`intake-receipt-${field}`}
                aria-label={label[field]}
                className="w-full"
                value={value}
                onChange={(event) => onOverride(field, event.target.value)}
              />
            ) : (
              <p className="max-w-[64ch] cf-body-sm text-cf-ink [text-wrap:pretty]">
                {value || t.empty}
              </p>
            )}
          </div>
        );
      })}

      <div className="flex min-w-0 flex-col gap-[8px]">
        <p className="cf-label-sm uppercase text-cf-ink-muted">
          {t.factsLabel}
        </p>
        {brief.facts.length === 0 ? (
          <p className="cf-body-sm text-cf-ink-muted">{t.empty}</p>
        ) : (
          <ul className="flex flex-col gap-[8px]">
            {brief.facts.map((fact, index) => (
              <li
                key={`${fact.statement}-${index}`}
                data-brief-fact-verified={String(fact.verified)}
                className="flex min-w-0 flex-col gap-[4px] rounded-[8px] border border-cf-border bg-cf-surface-subtle p-[8px]"
              >
                <p className="max-w-[64ch] cf-body-sm text-cf-ink [text-wrap:pretty]">
                  {fact.statement}
                </p>
                <div className="flex flex-wrap items-center gap-[8px]">
                  <Status tone={fact.verified ? 'accent' : 'warning'}>
                    {fact.verified ? t.factVerified : t.factUnverified}
                  </Status>
                  <span data-brief-origin={fact.origin} className="inline-flex">
                    <Status tone={ORIGIN_TONE[fact.origin]} className="uppercase">
                      {originWord(t, fact.origin)}
                    </Status>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/*
        Утверждения из чужого текста, которые нечем подтвердить. Они не в
        списке фактов нарочно: в текст они не пошли, и строка про них —
        объяснение отсутствия, а не ещё одна опора.
      */}
      {brief.ungrounded.length > 0 && (
        <div className="flex min-w-0 flex-col gap-[4px]">
          <p className="cf-label-sm uppercase text-cf-ink-muted">
            {t.ungroundedLabel}
          </p>
          <ul className="flex flex-col gap-[4px]">
            {brief.ungrounded.map((statement, index) => (
              <li
                key={`${statement}-${index}`}
                data-brief-ungrounded="true"
                className="max-w-[64ch] cf-body-sm text-cf-ink-muted [text-wrap:pretty]"
              >
                {statement}
              </li>
            ))}
          </ul>
        </div>
      )}

      {dirty && !readOnly && (
        <div className="flex flex-wrap gap-[8px]">
          <Button type="button" variant="quiet" onClick={onRevert}>
            {t.revertEdits}
          </Button>
        </div>
      )}
    </section>
  );
}

export default BriefReceipt;
