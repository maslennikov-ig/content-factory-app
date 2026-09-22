'use client';

import { Fragment, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import {
  factKind,
  factStatus,
  type PieceFactV2,
} from '@contentfactory/nestjs-libraries/content-intelligence/pieces/piece-facts.v2';
import type { BriefFilledV2 } from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/intake-v2.contract';
import { Button, buttonClassName } from '@contentfactory/react/form/button';
import { Panel } from '@contentfactory/react/layout';
import { Hint } from '@contentfactory/react/layout/hint';
import { Disclosure } from '../../ui/disclosure';
import {
  ResearchEvidenceRows,
  sourcedResearchFacts,
  type ResearchOutcomeFact,
} from '../intake/intake.research';
import {
  RECEIPT_FIELDS,
  type BriefFieldOriginV1,
} from '../intake/intake.adapter';
import { intakeCopy } from '../intake/intake.copy';
import { OWN_NUMBERS_GAP, QualityLine } from '../shared/quality-line';
import { voiceCopy } from '../../brand-voice/voice-copy';
import { CoreAnswerDiff, type CoreAnswerFeedback } from './core-answer-diff';
import { cellDate, StateSquare, stateWord } from './adaptation.cell';
import {
  platformName,
  type PieceTargetV1,
  type PieceWorkspaceV1,
  type SentTextKindV1,
  type WorkspaceChannel,
} from './pieces.adapter';
import { piecesCopy, type PiecesLocale } from './pieces.copy';
import { SectionLabel } from '../../ui/section-label';

/**
 * Вкладка «Суть» (`97dq.37`, §3.1).
 *
 * Порядок — порядок работы: что прислали → вопросы → суть с её действиями →
 * куда дальше. Квитанция «Что мы поняли» и «Опоры текста» — справочное, и на
 * широком экране они уходят в правую колонку, а на узком встают под суть.
 * До волны страница начиналась с таблицы кнопок «Адаптировать», выключенных,
 * пока сути нет, и Telegram встречался дважды, разорванный сутью (`97dq.39`,
 * C4) — теперь адаптации живут во вкладках, а здесь от них остаётся одна
 * строка на канал.
 */
export function PieceCoreTab({
  locale,
  detail,
  channels,
  unavailable,
  canWrite,
  busy,
  questionsSlot,
  actionRow,
  coreAnswer,
  factSelectable,
  onFactSelect,
  onOpenChannel,
  onAdaptChannel,
}: {
  locale: PiecesLocale;
  detail: PieceWorkspaceV1;
  channels: readonly WorkspaceChannel[];
  /** Площадки без подключённого канала: строка «нет канала» и путь к каналам. */
  unavailable: readonly PieceTargetV1[];
  canWrite: boolean;
  busy: boolean;
  questionsSlot?: ReactNode;
  /** Ряд действий над сутью — `AdaptationReview` с набором сути. */
  actionRow?: ReactNode;
  coreAnswer?: CoreAnswerFeedback | null;
  factSelectable: boolean;
  onFactSelect?: (factKey: string, selected: boolean) => Promise<void>;
  onOpenChannel: (channelId: string) => void;
  onAdaptChannel: (channelId: string) => void;
}) {
  const t = piecesCopy[locale];
  const i = intakeCopy[locale];
  const v = voiceCopy[locale];
  const core = detail.core;
  const [factSaving, setFactSaving] = useState<string | null>(null);
  const [factError, setFactError] = useState<{
    key: string;
    message: string;
  } | null>(null);

  const sentKindWord: Record<SentTextKindV1, string> = {
    person: t.sentKindPerson,
    source: t.sentKindSource,
    link: t.sentKindLink,
    instruction: t.sentKindInstruction,
  };

  const originOfField = (origin: BriefFieldOriginV1) =>
    origin === 'input'
      ? i.originInput
      : origin === 'person'
      ? i.originPerson
      : origin === 'avatar'
      ? i.originAvatar
      : origin === 'memory'
      ? i.originMemory
      : origin === 'search'
      ? i.originSearch
      : i.originModel;

  const briefLabel: Record<(typeof RECEIPT_FIELDS)[number], string> = {
    thesis: v.briefThesis,
    position: v.briefPosition,
    disagreement: v.briefDisagreement,
    audience: v.briefAudience,
    goal: v.briefGoal,
    format: v.briefFormat,
  };

  const hostOf = (url: string) => {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  };

  const researchFacts = sourcedResearchFacts(
    (core?.brief.facts ?? []).map((fact: PieceFactV2): ResearchOutcomeFact => {
      const rich = fact as PieceFactV2 & {
        factKey?: string;
        quote?: string | null;
        note?: string | null;
        correction?: { original: string; replacement: string } | null;
      };
      return {
        ...rich,
        factKey: rich.factKey ?? fact.statement,
        kind: factKind(fact, core?.brief.inputKind),
        status: factStatus(fact),
      };
    })
  );

  const sources = ((core?.brief as BriefFilledV2 | undefined)?.inputSources ??
    []
  ).filter((source) => source?.kind === 'link' && source.url);

  const sent = detail.sentText;
  const sentAt = sent?.at ? cellDate('queued', sent.at) : null;

  return (
    <div className="grid min-w-0 gap-[32px] lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
      <div className="flex min-w-0 flex-col gap-[16px]">
        {sent ? (
          <Panel
            contentPadding="compact"
            contentClassName="min-w-0"
            className="min-w-0"
          >
            <Disclosure
              summary={
                <span className="flex min-w-0 flex-wrap items-baseline gap-x-[12px] gap-y-[4px]">
                  <span className="cf-label-md text-cf-ink">{t.sentTitle}</span>
                  <span className="cf-caption text-cf-ink-muted">
                    {[sentKindWord[sent.kind], sentAt, t.sentAsIs]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
              }
              triggerProps={{ 'data-piece-sent-toggle': 'true' } as never}
              contentClassName="px-[12px] pb-[8px] pt-[4px]"
            >
              <blockquote
                data-piece-sent-text={sent.kind}
                className="max-w-[72ch] whitespace-pre-wrap border-s border-cf-border ps-[12px] cf-body-md text-cf-ink [overflow-wrap:anywhere] [text-wrap:pretty]"
              >
                {sent.text}
              </blockquote>
            </Disclosure>
          </Panel>
        ) : null}

        {questionsSlot}

        <section className="flex min-w-0 flex-col gap-[12px]">
          <SectionLabel>{core ? t.coreTitle : t.legacyTitle}</SectionLabel>

          {!core ? (
            <p
              role="status"
              data-piece-legacy="true"
              className="max-w-[72ch] rounded-[8px] border border-cf-border bg-cf-surface-subtle p-[12px] cf-body-sm text-cf-ink-muted [text-wrap:pretty]"
            >
              {t.legacyWarning}
            </p>
          ) : null}

          {core && !core.text ? (
            <p className="cf-body-sm text-cf-ink-muted">{t.coreWaiting}</p>
          ) : null}

          {core?.text && core.writtenBy === 'fallback' ? (
            <p
              role="status"
              data-piece-core-fallback="true"
              className="max-w-[72ch] cf-body-sm text-cf-ink-muted [text-wrap:pretty]"
            >
              {t.coreFallback}
            </p>
          ) : null}

          {/*
            Суть — главный текст страницы, и она читается как текст: мера в
            72 знака, `body-lg` и никакой рамки.
          */}
          {core?.text || !core ? (
            <article
              data-piece-core={core ? 'core' : 'legacy'}
              className={clsx(
                'min-w-0 max-w-[72ch] cf-body-lg text-cf-ink [text-wrap:pretty]',
                core && 'whitespace-pre-wrap'
              )}
            >
              {core ? (
                coreAnswer && coreAnswer.body === core.text ? (
                  <CoreAnswerDiff {...coreAnswer} locale={locale} />
                ) : (
                  core.text
                )
              ) : (
                detail.legacyBody ?? ''
              )}
            </article>
          ) : null}

          {core?.text ? (
            <div className="flex min-w-0 flex-col gap-[4px]">
              <QualityLine
                locale={locale}
                slop={core.slop}
                draftGaps={core.authorNumbers ? null : OWN_NUMBERS_GAP}
              />
              {core.slop?.verdict === 'rewrite' ? (
                <p
                  data-piece-slop-rewrite="true"
                  className="max-w-[72ch] cf-body-sm text-cf-ink-muted [text-wrap:pretty]"
                >
                  {t.slopRewriteNote}
                </p>
              ) : null}
            </div>
          ) : null}

          {actionRow}
        </section>

        <Panel
          className="min-w-0"
          contentClassName="flex min-w-0 flex-col gap-[12px]"
        >
          <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-[8px]">
            <SectionLabel as="h3">{t.whereNextTitle}</SectionLabel>
            {detail.later.length > 0 ? (
              <span
                data-piece-later="true"
                className="cf-caption text-cf-ink-muted"
              >
                {t.laterShort}
              </span>
            ) : null}
          </div>
          {channels.length === 0 && unavailable.length === 0 ? (
            <p className="cf-body-sm text-cf-ink-muted">{t.noChannelsYet}</p>
          ) : null}
          <ul className="flex min-w-0 flex-col divide-y divide-cf-border">
            {channels.map((channel) => {
              const label = `${platformName(
                channel.platform,
                locale,
                channel.platformName
              )} · ${channel.name}`;
              const count = channel.adaptations.length;
              return (
                <li
                  key={channel.id}
                  data-piece-next={channel.id}
                  data-piece-next-state={channel.state}
                  className="flex min-w-0 flex-wrap items-center gap-x-[12px] gap-y-[8px] py-[8px]"
                >
                  <StateSquare state={channel.state} />
                  {/*
                    Имя и слово состояния — одна колонка на узком экране:
                    в одной строке с кнопкой имя канала сжималось до слова
                    на строку и налезало на «черновик · 1 вариант» (390 px,
                    стенд 22.09.2026).
                  */}
                  <span className="flex min-w-0 flex-1 flex-col gap-y-[4px] sm:flex-row sm:items-center sm:gap-x-[12px]">
                    <span className="min-w-0 cf-body-sm text-cf-ink [overflow-wrap:anywhere] sm:basis-[240px] sm:flex-none">
                      {label}
                    </span>
                    <span className="cf-caption text-cf-ink-muted">
                      {count > 0
                        ? `${stateWord(channel.state, t)} · ${t.variantsCount(
                            count
                          )}`
                        : stateWord(channel.state, t)}
                    </span>
                  </span>
                  {count > 0 ? (
                    <Button
                      type="button"
                      variant="secondary"
                      density="dense"
                      aria-label={`${t.openChannel} · ${label}`}
                      onClick={() => onOpenChannel(channel.id)}
                    >
                      {t.openChannel}
                    </Button>
                  ) : channel.connected ? (
                    <Button
                      type="button"
                      variant="primary"
                      density="dense"
                      aria-label={`${t.adapt} · ${label}`}
                      disabled={
                        !canWrite || busy || Boolean(core && !core.text.trim())
                      }
                      onClick={() => onAdaptChannel(channel.id)}
                    >
                      {t.adapt}
                    </Button>
                  ) : null}
                </li>
              );
            })}
            {unavailable.map((target) => (
              <li
                key={target.platform}
                data-piece-next-unavailable={target.platform}
                className="flex min-w-0 flex-wrap items-center gap-x-[12px] gap-y-[8px] py-[8px]"
              >
                <StateSquare state="no_channel" />
                <span className="flex min-w-0 flex-1 flex-col gap-y-[4px] sm:flex-row sm:items-center sm:gap-x-[12px]">
                  <span className="min-w-0 cf-body-sm text-cf-ink-muted [overflow-wrap:anywhere] sm:basis-[240px] sm:flex-none">
                    {platformName(target.platform, locale, target.name)}
                  </span>
                  <span className="cf-caption text-cf-ink-muted">
                    {t.stateNoChannel}
                  </span>
                </span>
                <a
                  href="/channels"
                  aria-label={`${t.toChannels} — ${t.noChannelReason}`}
                  className={buttonClassName({
                    variant: 'quiet',
                    density: 'dense',
                  })}
                >
                  {t.toChannels}
                </a>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <aside className="flex min-w-0 flex-col gap-[16px]">
        {/*
          Квитанция только на чтение: «поле — значение — откуда взято». Бриф
          на этой странице уже израсходован; правки брифа живут на входе.
        */}
        {core ? (
          <Panel
            className="min-w-0"
            contentClassName="flex min-w-0 flex-col gap-[12px]"
          >
            <SectionLabel as="h3">{i.receiptTitle}</SectionLabel>
            <dl
              data-piece-receipt="true"
              className="grid min-w-0 grid-cols-[88px_minmax(0,1fr)] gap-x-[12px] gap-y-[8px]"
            >
              {sources.length && core.brief.inputKind === 'foreign_post' ? (
                <>
                  <dt className="cf-caption text-cf-ink-muted">
                    {t.receiptUnderstoodAs}
                  </dt>
                  <dd className="cf-body-sm text-cf-ink">
                    {t.receiptForeignWithLink}
                  </dd>
                </>
              ) : null}
              {sources.length ? (
                <>
                  <dt className="cf-caption text-cf-ink-muted">
                    {t.receiptMaterial}
                  </dt>
                  <dd className="flex min-w-0 flex-wrap gap-[8px] cf-body-sm text-cf-ink">
                    {sources.map((source, index) => (
                      <a
                        key={`${source.evidenceId ?? source.url}-${index}`}
                        data-piece-input-source="link"
                        href={source.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="break-all underline underline-offset-2 hover:text-cf-ink-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cf-focus"
                      >
                        {hostOf(source.url as string)}
                      </a>
                    ))}
                  </dd>
                </>
              ) : null}
              {RECEIPT_FIELDS.map((field) => {
                const value = core.brief[field];
                if (
                  typeof value !== 'string' ||
                  !value.trim() ||
                  value.trim().toLowerCase() === 'null'
                )
                  return null;
                const origin = core.brief.origins?.[field] ?? 'model';
                return (
                  <Fragment key={field}>
                    <dt className="cf-caption text-cf-ink-muted">
                      {briefLabel[field]}
                    </dt>
                    <dd
                      data-brief-origin={origin}
                      className="min-w-0 cf-body-sm text-cf-ink [text-wrap:pretty]"
                    >
                      {field === 'format'
                        ? (
                            {
                              auto: t.formatAutomatic,
                              opinion: i.formatOpinion,
                              announcement: i.formatAnnouncement,
                              list: i.formatList,
                              expert: i.formatExpert,
                              case: i.formatCase,
                              story: i.formatStory,
                            } as Record<string, string>
                          )[value] ?? value
                        : value}{' '}
                      <span className="cf-caption text-cf-ink-muted">
                        {`· ${originOfField(origin)}`}
                      </span>
                    </dd>
                  </Fragment>
                );
              })}
            </dl>
          </Panel>
        ) : null}

        {/* Результат ресерча виден только там, где у строки есть адрес. */}
        {core && researchFacts.length ? (
          <Panel
            className="min-w-0"
            contentClassName="flex min-w-0 flex-col gap-[8px]"
          >
            <div
              id="piece-text-sources"
              data-piece-sources="true"
              className="flex min-w-0 items-center gap-[8px]"
            >
              <SectionLabel as="h3">
                {t.textSourcesCount(researchFacts.length)}
              </SectionLabel>
              <Hint label={t.textSourcesHintLabel}>{t.textSourcesHint}</Hint>
            </div>
            <p className="cf-body-sm text-cf-ink-muted [text-wrap:pretty]">
              {t.textSourcesLead}
            </p>
            <Disclosure
              summary={<span className="cf-label-md">{t.textSourcesOpen}</span>}
              contentClassName="pt-[8px]"
            >
              <div data-piece-facts="true">
                <ResearchEvidenceRows
                  locale={locale}
                  facts={researchFacts}
                  editableFound={factSelectable}
                  busy={!canWrite || factSaving !== null}
                  foundErrorKey={factError?.key}
                  foundErrorMessage={factError?.message}
                  onToggleFound={(factKey, selected) => {
                    if (!onFactSelect) return;
                    setFactSaving(factKey);
                    setFactError(null);
                    void onFactSelect(factKey, selected)
                      .catch(() =>
                        setFactError({
                          key: factKey,
                          message: t.factSelectFailed,
                        })
                      )
                      .finally(() => setFactSaving(null));
                  }}
                />
              </div>
            </Disclosure>
          </Panel>
        ) : null}
      </aside>
    </div>
  );
}

export default PieceCoreTab;
