'use client';

import { useState, type ReactNode } from 'react';
import { Button } from '@contentfactory/react/form/button';
import { Segmented } from '../../ui/segmented';
import { WorkingLine } from '../../ui/working-line';
import type { QualityChecksV1 } from '../intake/intake.adapter';
import { QualityLine } from '../shared/quality-line';
import { AdaptationBody } from './adaptation-body';
import { AdaptationEditor } from './adaptation-editor';
import { cellDate } from './adaptation.cell';
import {
  PostOptionsPanel,
  type PostAvatarOption,
} from './post-options.panel';
import {
  type AdaptationKindV1,
  type AdaptationImageV1,
  type PostOptionsBaselineV1,
  type PostOptionsV1,
  type WorkspaceAdaptationV1,
  type WorkspaceChannel,
} from './pieces.adapter';
import { piecesCopy, type PiecesLocale } from './pieces.copy';
import { PostPreview } from './post-preview';
import { ScheduleBar } from './schedule-bar';
import { SectionLabel } from '../../ui/section-label';

export type AutosaveState = 'idle' | 'saving' | 'saved' | 'failed';

/**
 * Вкладка канала (`97dq.37`, §3.2–3.3): всё, что нужно довести адаптацию до
 * публикации, в одном месте.
 *
 * Слева — текст: варианты, переключатель «Текст · Как увидят в <площадке>»,
 * правка руками, строка качества и ряд действий. Предпросмотр встаёт на
 * место текста во всю ширину колонки (`97dq.48`, вариант A), а не ютится
 * окошком справа. Справа — «Для этого поста» и «Как пишем в «канал»».
 * Внизу — когда и отправить. Окно «Создать пост» отсюда не открывается никогда: всё,
 * что из него было нужно, переехало сюда, а остальное к одному посту из
 * заготовки не относится (`EditorFate`).
 *
 * Без адаптации вкладка — это один вопрос перед текстом, если его задали, и
 * одна главная кнопка «Адаптировать для <площадки>».
 *
 * Экран рисует и ничего не просит: запросы, стрим и сохранение живут в
 * `piece.container.tsx`.
 */
export function PieceChannelTab({
  locale,
  channel,
  platformLabel,
  adaptation,
  canWrite,
  adapting,
  adaptingLabel,
  questionsSlot,
  body,
  onBodyChange,
  saveState,
  savedAt,
  onRetrySave,
  maxLength,
  image,
  onPickImage,
  onRemoveImage,
  checks,
  draftGaps,
  slopChange,
  actionRow,
  postOptions,
  postBaseline,
  avatars,
  onPostOptionsChange,
  rememberState,
  onRemember,
  channelProfile,
  when,
  scheduleBusy,
  scheduleError,
  calendarHref,
  onSelectAdaptation,
  onAdapt,
  onCancelAdapt,
  onSchedule,
  onPublishNow,
  onUnschedule,
  onDelete,
}: {
  locale: PiecesLocale;
  channel: WorkspaceChannel;
  /** Имя площадки, как его называет человек: «Telegram», «ВКонтакте». */
  platformLabel: string;
  /** Показанная версия; без версий — `null`. */
  adaptation: WorkspaceAdaptationV1 | null;
  canWrite: boolean;
  /** Адаптация этого канала пишется прямо сейчас. */
  adapting: boolean;
  adaptingLabel: string;
  /** Вопрос перед текстом, который вернул стрим. */
  questionsSlot?: ReactNode;
  /** Текст в поле: то, что правит человек, или сохранённое тело. */
  body: string;
  onBodyChange: (text: string) => void;
  saveState: AutosaveState;
  savedAt: string | null;
  onRetrySave: () => void;
  maxLength: number | null;
  image: AdaptationImageV1 | null;
  onPickImage?: () => void;
  onRemoveImage?: () => void;
  checks?: QualityChecksV1 | null;
  draftGaps?: readonly unknown[] | null;
  /** «Было N → стало M» после принятой правки — до перезагрузки. */
  slopChange?: { slopBefore: number; slopAfter: number } | null;
  /** Ряд «Убрать следы ИИ · Проверить факты · Переписать…». */
  actionRow?: ReactNode;
  postOptions: PostOptionsV1;
  postBaseline?: PostOptionsBaselineV1;
  avatars: readonly PostAvatarOption[];
  onPostOptionsChange: (next: PostOptionsV1) => void;
  rememberState: 'idle' | 'saving' | 'saved' | 'failed';
  onRemember: () => void;
  /** Ссылка «Как пишем в «канал»» с её диалогом. */
  channelProfile?: ReactNode;
  /** Поле «Когда» — общий выбор даты продукта. */
  when: ReactNode;
  scheduleBusy: 'schedule' | 'now' | 'unschedule' | 'delete' | null;
  scheduleError?: string | null;
  calendarHref: string;
  onSelectAdaptation: (adaptationId: string) => void;
  onAdapt: (kind: AdaptationKindV1) => void;
  onCancelAdapt: () => void;
  onSchedule: () => void;
  onPublishNow: () => void;
  onUnschedule: () => void;
  onDelete: () => void;
}) {
  const t = piecesCopy[locale];
  const [kind, setKind] = useState<AdaptationKindV1>(
    channel.kinds[0] ?? 'post'
  );
  const [view, setView] = useState<'text' | 'preview'>('text');
  const kindWord = (value: AdaptationKindV1) =>
    ({
      post: t.kindPost,
      caption: t.kindCaption,
      article: t.kindArticle,
      newsletter: t.kindNewsletter,
      video: t.kindVideo,
      audio: t.kindAudio,
    })[value];

  const versions = channel.adaptations;
  const editable = canWrite && adaptation?.state === 'draft';
  // Правку закрывает расписание, и это обратимо: «Снять с расписания».
  const editLocked = canWrite && adaptation?.state === 'queued';
  const sendable =
    adaptation?.state === 'draft' || adaptation?.state === 'error';
  // Смотреть нечего, пока текста нет: тогда и переключателя нет.
  const previewing = view === 'preview' && Boolean(body);

  const autosave =
    saveState === 'saving'
      ? t.autosaveSaving
      : saveState === 'saved' && savedAt
      ? t.autosaveSaved(savedAt)
      : saveState === 'failed'
      ? null
      : t.autosaveIdle;

  const working = adapting ? (
    <div className="flex min-w-0 flex-wrap items-center gap-x-[12px] gap-y-[8px]">
      <WorkingLine
        label={adaptingLabel}
        data-piece-adapting={channel.id}
        className="min-w-0 flex-1"
      />
      <Button
        type="button"
        variant="secondary"
        density="dense"
        onClick={onCancelAdapt}
      >
        {t.cancel}
      </Button>
    </div>
  ) : null;

  return (
    <div className="flex min-w-0 flex-col gap-[24px]">
      <div className="grid min-w-0 gap-[32px] lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <div className="flex min-w-0 flex-col gap-[16px]">
          {adaptation ? (
            <>
              <div className="flex min-w-0 flex-wrap items-center gap-x-[12px] gap-y-[8px]">
                <SectionLabel>{t.textFor(platformLabel)}</SectionLabel>
                {versions.length > 1 ? (
                  <Segmented<string>
                    label={t.variantsLabel}
                    value={adaptation.id}
                    options={versions
                      .slice()
                      .reverse()
                      .map((version, index) => ({
                        value: version.id,
                        label: t.variant(index + 1),
                      }))}
                    onChange={onSelectAdaptation}
                    data-piece-variants={channel.id}
                    className="max-w-full flex-wrap"
                  />
                ) : null}
                {body ? (
                  <Segmented<'text' | 'preview'>
                    label={t.previewSwitch}
                    value={previewing ? 'preview' : 'text'}
                    options={[
                      { value: 'text', label: t.previewText },
                      { value: 'preview', label: t.previewTitle(platformLabel) },
                    ]}
                    onChange={setView}
                    data-piece-view={previewing ? 'preview' : 'text'}
                    className="max-w-full flex-wrap"
                  />
                ) : null}
                {editable ? (
                  <span
                    data-autosave={saveState}
                    className="cf-caption text-cf-ink-muted"
                  >
                    {autosave}
                  </span>
                ) : null}
              </div>

              {saveState === 'failed' ? (
                <div
                  role="alert"
                  className="flex min-w-0 flex-wrap items-center gap-[8px]"
                >
                  <span className="cf-body-sm text-cf-danger">
                    {t.autosaveFailed}
                  </span>
                  <Button
                    type="button"
                    variant="quiet"
                    density="dense"
                    onClick={onRetrySave}
                  >
                    {t.retry}
                  </Button>
                </div>
              ) : null}

              {previewing ? (
                <PostPreview
                  locale={locale}
                  channelName={channel.name}
                  text={body}
                  image={image}
                  time={cellDate('queued', adaptation.date)}
                  draftId={adaptation.id}
                />
              ) : editable ? (
                <AdaptationEditor
                  locale={locale}
                  platformLabel={platformLabel}
                  value={body}
                  onChange={onBodyChange}
                  maxLength={maxLength}
                  image={image}
                  onPickImage={onPickImage}
                  onRemoveImage={onRemoveImage}
                  draftId={adaptation.id}
                  format={channel.providerIdentifier || channel.platform}
                />
              ) : body ? (
                <div className="flex min-w-0 flex-col gap-[8px]">
                  <AdaptationBody
                    locale={locale}
                    text={body}
                    draftId={adaptation.id}
                    lockedReason={editLocked ? t.editLockedQueued : null}
                  />
                  {image?.path ? (
                    <img
                      src={image.path}
                      alt={t.imageAlt}
                      className="size-[96px] rounded-[8px] border border-cf-border object-cover"
                    />
                  ) : image ? (
                    <span className="cf-caption text-cf-ink-muted">
                      {t.imageAttached}
                    </span>
                  ) : null}
                </div>
              ) : (
                <p className="cf-body-sm text-cf-ink-muted">
                  {t.textInPost}
                </p>
              )}

              <div className="flex min-w-0 flex-col gap-[4px]">
                <QualityLine
                  locale={locale}
                  slop={checks?.slop}
                  antiCopy={checks?.antiCopy}
                  voice={checks?.voice}
                  draftGaps={draftGaps}
                />
                {slopChange ? (
                  <p
                    data-adaptation-slop-change={adaptation.id}
                    className="cf-caption text-cf-ink-muted"
                  >
                    {t.slopBeforeAfter(
                      slopChange.slopBefore,
                      slopChange.slopAfter
                    )}
                  </p>
                ) : null}
              </div>

              {editable ? actionRow : null}
              {working}
              {questionsSlot}
            </>
          ) : (
            <section className="flex min-w-0 flex-col gap-[16px]">
              <SectionLabel>{t.textFor(platformLabel)}</SectionLabel>
              {questionsSlot}
              {working}
              {!questionsSlot && !adapting ? (
                <p className="max-w-[72ch] cf-body-md text-cf-ink-muted [text-wrap:pretty]">
                  {t.noAdaptationLead(channel.name)}
                </p>
              ) : null}
              {channel.kinds.length > 1 ? (
                <Segmented<AdaptationKindV1>
                  label={`${t.kindLabel} · ${platformLabel}`}
                  value={kind}
                  options={channel.kinds.map((one) => ({
                    value: one,
                    label: kindWord(one),
                  }))}
                  onChange={setKind}
                  data-piece-kind-choice={channel.platform}
                />
              ) : null}
              {!questionsSlot ? (
                <div className="flex min-w-0 flex-wrap items-center gap-x-[12px] gap-y-[8px]">
                  <Button
                    type="button"
                    variant="primary"
                    disabled={!canWrite || adapting || !channel.connected}
                    loading={adapting}
                    loadingLabel={adaptingLabel}
                    data-piece-adapt={channel.id}
                    onClick={() => onAdapt(kind)}
                  >
                    {t.adaptFor(platformLabel)}
                  </Button>
                  {!channel.connected ? (
                    <span className="cf-caption text-cf-ink-muted">
                      {t.noChannelReason}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </section>
          )}
        </div>

        <aside className="flex min-w-0 flex-col gap-[16px]">
          {canWrite && (!adaptation || sendable) ? (
            <PostOptionsPanel
              locale={locale}
              options={postOptions}
              baseline={postBaseline}
              avatars={avatars}
              disabled={adapting}
              onChange={onPostOptionsChange}
              onRewrite={adaptation ? () => onAdapt(adaptation.kind) : undefined}
              onRemember={channel.connected ? onRemember : undefined}
              rememberState={rememberState}
            />
          ) : null}

          {channelProfile}
        </aside>
      </div>

      {adaptation ? (
        <ScheduleBar
          locale={locale}
          state={adaptation.state}
          date={adaptation.date ?? null}
          plan={adaptation.plan}
          when={when}
          canWrite={canWrite}
          busy={scheduleBusy}
          error={scheduleError}
          calendarHref={calendarHref}
          onSchedule={onSchedule}
          onPublishNow={onPublishNow}
          onUnschedule={onUnschedule}
          onDelete={onDelete}
        />
      ) : null}
    </div>
  );
}

export default PieceChannelTab;
