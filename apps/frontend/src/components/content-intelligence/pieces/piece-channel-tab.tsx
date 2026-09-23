'use client';

import { useState, type ReactNode } from 'react';
import { Button } from '@contentfactory/react/form/button';
import { Segmented } from '../../ui/segmented';
import { ConfirmButton } from '../../ui/confirm-button';
import { WorkingLine } from '../../ui/working-line';
import type { QualityChecksV1 } from '../intake/intake.adapter';
import { QualityLine } from '../shared/quality-line';
import { AdaptationBody } from './adaptation-body';
import { AdaptationEditor } from './adaptation-editor';
import { cellDate } from './adaptation.cell';
import {
  WritingSettingsPanel,
  type PlanFieldProps,
  type PostAvatarOption,
  type SaveStateV1,
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
import { ScheduleBar, type ScheduleBusy } from './schedule-bar';
import { SectionLabel } from '../../ui/section-label';
import { SidePanel } from '../../ui/side-panel';

export type AutosaveState = 'idle' | 'saving' | 'saved' | 'failed';

/**
 * Вкладка канала (`97dq.37`, §3.2–3.3): всё, что нужно довести адаптацию до
 * публикации, в одном месте.
 *
 * Слева — текст: варианты, переключатель «Текст · Как увидят в <площадке>»
 * и единственное «Удалить адаптацию» в том же верхнем ряду, правка руками,
 * строка качества, ряд действий и сразу под ним строка плана (`97dq.70`):
 * черновик, бронь или очередь — с действием по состоянию. Предпросмотр
 * встаёт на место текста во всю ширину колонки (`97dq.48`, вариант A).
 * Справа — одна панель настроек в области поста: те же поля, что у канала,
 * и «План» (`97dq.70`); отдельного «Как пишем в «канал»» здесь больше нет.
 * Окно «Создать пост» отсюда не открывается никогда (`EditorFate`).
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
  pieceLink,
  avatars,
  onPostOptionsChange,
  postPlan,
  rewritePending = false,
  settingsSaveState = 'idle',
  settingsSavedAt = null,
  onSaveSettings,
  channelSaveState = 'idle',
  onSaveForChannel,
  onRewriteAndRemember,
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
  onDropPlan,
  onMove,
  onOpenCalendar,
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
  /** Ответ заготовки на вопрос о ссылке (`97dq.75`); нет ответа — `null`. */
  pieceLink?: { url: string | null } | null;
  avatars: readonly PostAvatarOption[];
  onPostOptionsChange: (next: PostOptionsV1) => void;
  /** «План» поста: свой режим или «как в канале», применяется сразу. */
  postPlan?: PlanFieldProps;
  /** Текст старше настроек: «применится при переписывании». */
  rewritePending?: boolean;
  settingsSaveState?: SaveStateV1;
  /** «ЧЧ:ММ» последнего сохранения настроек поста. */
  settingsSavedAt?: string | null;
  onSaveSettings?: () => void;
  channelSaveState?: SaveStateV1;
  /** «Сохранить для канала»: значения поста — умолчания канала. */
  onSaveForChannel?: () => void;
  /** «Переписать и запомнить для канала». */
  onRewriteAndRemember?: () => void;
  /** Поле «Когда» — общий выбор даты продукта. */
  when: ReactNode;
  scheduleBusy: ScheduleBusy | null;
  scheduleError?: string | null;
  calendarHref: string;
  onSelectAdaptation: (adaptationId: string) => void;
  onAdapt: (kind: AdaptationKindV1) => void;
  onCancelAdapt: () => void;
  onSchedule: () => void;
  onPublishNow: () => void;
  onUnschedule: () => void;
  onDropPlan?: () => void;
  onMove?: () => void;
  onOpenCalendar?: (href: string) => void;
  onDelete: () => void;
}) {
  const t = piecesCopy[locale];
  const [kind, setKind] = useState<AdaptationKindV1>(
    channel.kinds[0] ?? 'post'
  );
  const [view, setView] = useState<'text' | 'preview'>('text');
  const [deleteArmed, setDeleteArmed] = useState(false);
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
  // Настройки поста живут, пока пост не вышел: режим плана применяется и к
  // очереди, переписать можно только черновик.
  const settable = canWrite && (!adaptation || adaptation.state !== 'published');

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
      {/*
        Text on the left, one settings panel on the right (`97dq.70`). The
        panel is a `SidePanel` (`97dq.71`): drag its inner border, hide it to
        the right edge, and it remembers both. It starts at 400px — shorter
        than the 360px column it replaced — and gives width back before the
        text column goes under 560px.
      */}
      <div className="flex min-w-0 flex-col gap-[32px] lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-[16px]">
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
                {/*
                  Одна кнопка удаления на вкладке (`97dq.70`): здесь, в верхнем
                  ряду. Вышедшую адаптацию сервер не удаляет — кнопки нет.
                */}
                {adaptation.state !== 'published' ? (
                  <ConfirmButton
                    label={t.deleteAdaptation}
                    armedLabel={t.deletePieceArmed}
                    disabled={
                      !canWrite ||
                      (scheduleBusy !== null && scheduleBusy !== 'delete')
                    }
                    loading={scheduleBusy === 'delete'}
                    loadingLabel={t.deletingAdaptation}
                    data-piece-delete-adaptation="true"
                    onArmedChange={setDeleteArmed}
                    className={
                      deleteArmed ? 'ms-auto' : 'ms-auto text-cf-danger'
                    }
                    onConfirm={onDelete}
                  />
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
                onDropPlan={onDropPlan}
                onMove={onMove}
                onOpenCalendar={onOpenCalendar}
              />
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

        <SidePanel
          id="piece-channel-settings"
          side="end"
          label={t.settingsPanelLabel}
          copy={{
            resize: t.settingsPanelResize,
            hide: t.settingsPanelHide,
            show: t.settingsPanelShow,
          }}
          defaultWidth={400}
          reserveMain={592}
          className={settable ? undefined : 'hidden'}
          bodyClassName="gap-[16px]"
        >
          {settable ? (
            <WritingSettingsPanel
              scope="post"
              locale={locale}
              options={postOptions}
              baseline={postBaseline}
              pieceLink={pieceLink ?? null}
              avatars={avatars}
              disabled={adapting}
              plan={adaptation && channel.connected ? postPlan : undefined}
              onChange={onPostOptionsChange}
              onRewrite={
                adaptation && sendable ? () => onAdapt(adaptation.kind) : undefined
              }
              onRewriteAndRemember={
                adaptation && sendable && channel.connected
                  ? onRewriteAndRemember
                  : undefined
              }
              rewritePending={rewritePending}
              saveState={settingsSaveState}
              savedAt={settingsSavedAt}
              onSaveForPost={channel.connected ? onSaveSettings : undefined}
              onSaveForChannel={channel.connected ? onSaveForChannel : undefined}
              channelSaveState={channelSaveState}
            />
          ) : null}
        </SidePanel>
      </div>
    </div>
  );
}

export default PieceChannelTab;
