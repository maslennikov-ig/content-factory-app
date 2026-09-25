'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Button } from '@contentfactory/react/form/button';
import { Segmented } from '../../ui/segmented';
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
import { queuedEditDeadline } from '@contentfactory/nestjs-libraries/content-intelligence/pieces/adaptation-workspace.contract';

export type AutosaveState = 'idle' | 'saving' | 'saved' | 'failed';

/**
 * Вкладка канала (`97dq.37`, §3.2–3.3): всё, что нужно довести адаптацию до
 * публикации, в одном месте.
 *
 * Слева — текст: варианты, переключатель «Текст · Как увидят в <площадке>»,
 * правка руками (у черновика и у поста в очереди до его слота, `97dq.80`),
 * строка качества, ряд действий и сразу под ним строка плана (`97dq.70`):
 * черновик, бронь или очередь — с действием по состоянию. Предпросмотр
 * встаёт на место текста во всю ширину колонки (`97dq.48`, вариант A).
 * Справа — одна панель настроек в области поста: те же поля, что у канала,
 * и «План» (`97dq.70`); отдельного «Как пишем в «канал»» здесь больше нет.
 * Окно «Создать пост» отсюда не открывается никогда (`EditorFate`).
 *
 * Без адаптации вкладка — это один вопрос перед текстом, если его задали, и
 * одна главная кнопка «Адаптировать для <площадки>»; настройки поста справа
 * уже открыты, и их главная кнопка — «Адаптировать» (`97dq.78`): настроить
 * пост можно до первого текста, а не после него. Удаление — одно, в строке
 * заголовка страницы (`97dq.78`), а не в колонке текста.
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
  saveError = null,
  onRetrySave,
  canRetrySave = true,
  unsaved = false,
  onSaveQueued,
  maxLength,
  image,
  onPickImage,
  onRemoveImage,
  checks,
  draftGaps,
  slopChange,
  materialSlot,
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
  /** Почему правку не сохранили — словами сервера; нет — общее «не сохранилось». */
  saveError?: string | null;
  onRetrySave: () => void;
  /** Отказ не закрыл правку насовсем: «Попробовать снова» имеет смысл. */
  canRetrySave?: boolean;
  /** В поле есть правка, которой ещё нет в сохранённом тексте. */
  unsaved?: boolean;
  /** «Сохранить в пост» у поста в очереди (ревью `97dq.80`, P2-2). */
  onSaveQueued?: () => void;
  maxLength: number | null;
  image: AdaptationImageV1 | null;
  onPickImage?: () => void;
  onRemoveImage?: () => void;
  checks?: QualityChecksV1 | null;
  draftGaps?: readonly unknown[] | null;
  /** «Было N → стало M» после принятой правки — до перезагрузки. */
  slopChange?: { slopBefore: number; slopAfter: number } | null;
  /**
   * Optional questions when the material is short (`97dq.98`): under the
   * text and its quality line, only for the version they were asked about.
   */
  materialSlot?: ReactNode;
  /** Ряд «Убрать следы ИИ · Проверить факты · Переписать…». */
  actionRow?: ReactNode;
  postOptions: PostOptionsV1;
  postBaseline?: PostOptionsBaselineV1;
  /** Ответ заготовки на вопрос о ссылке (`97dq.75`); нет ответа — `null`. */
  pieceLink?: { url: string | null; text?: string | null } | null;
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
  /*
    Пост в очереди правится, пока до его слота больше минуты (`97dq.80`,
    B2): публикация берёт текст из базы в момент выхода, поэтому правка до
    слота уходит в пост. Позже — только смотреть.
  */
  const deadline = queuedEditDeadlineOf(adaptation);
  const deadlineAt = deadline?.getTime() ?? null;
  /*
    Часы вкладки (ревью `97dq.80`, P3-2): открытая вкладка сама закрывает
    правку в момент срока, а не при следующей отрисовке.
  */
  const [, setTick] = useState(0);
  useEffect(() => {
    if (deadlineAt === null) return undefined;
    const left = deadlineAt - Date.now();
    if (left <= 0) return undefined;
    const timer = setTimeout(
      () => setTick((value) => value + 1),
      Math.min(left + 50, 2_147_000_000)
    );
    return () => clearTimeout(timer);
  }, [deadlineAt]);
  const queuedEditable = deadline !== null && deadline.getTime() > Date.now();
  const editable =
    canWrite && (adaptation?.state === 'draft' || queuedEditable);
  const editLocked =
    canWrite && adaptation?.state === 'queued' && !queuedEditable;
  const queued = adaptation?.state === 'queued';
  const sendable =
    adaptation?.state === 'draft' || adaptation?.state === 'error';
  /*
    Вне правки показывается то, что в посте, а не несохранённое поле (ревью
    `97dq.80`, P2-4): закрытый пост не выдаёт отказанную правку за свой текст.
  */
  const shown = editable ? body : adaptation?.body ?? body;
  // Смотреть нечего, пока текста нет: тогда и переключателя нет.
  const previewing = view === 'preview' && Boolean(shown);
  // Настройки поста живут, пока пост не вышел: режим плана применяется и к
  // очереди, переписать можно только черновик.
  const settable = canWrite && (!adaptation || adaptation.state !== 'published');

  const autosave = queued
    ? saveState === 'saving'
      ? t.queuedSaving
      : saveState === 'failed'
      ? null
      : unsaved
      ? t.queuedUnsaved
      : saveState === 'saved' && savedAt
      ? t.queuedSaved(savedAt)
      : null
    : saveState === 'saving'
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
                    wrap
                  />
                ) : null}
                {shown ? (
                  <Segmented<'text' | 'preview'>
                    label={t.previewSwitch}
                    value={previewing ? 'preview' : 'text'}
                    options={[
                      { value: 'text', label: t.previewText },
                      { value: 'preview', label: t.previewTitle(platformLabel) },
                    ]}
                    onChange={setView}
                    data-piece-view={previewing ? 'preview' : 'text'}
                    data-tour="adaptation-preview"
                    wrap
                  />
                ) : null}
                {editable && autosave ? (
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
                    {saveError || t.autosaveFailed}
                  </span>
                  {canRetrySave && !queued ? (
                    <Button
                      type="button"
                      variant="quiet"
                      density="dense"
                      onClick={onRetrySave}
                    >
                      {t.retry}
                    </Button>
                  ) : null}
                </div>
              ) : null}

              {previewing ? (
                <PostPreview
                  locale={locale}
                  channelName={channel.name}
                  text={shown}
                  image={image}
                  time={cellDate('queued', adaptation.date)}
                  draftId={adaptation.id}
                />
              ) : editable ? (
                <div className="flex min-w-0 flex-col gap-[8px]">
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
                  {queuedEditable && deadline ? (
                    <div className="flex min-w-0 flex-wrap items-center gap-x-[12px] gap-y-[8px]">
                      <Button
                        type="button"
                        variant="primary"
                        density="dense"
                        data-queued-save={adaptation.id}
                        disabled={!unsaved || saveState === 'saving'}
                        onClick={onSaveQueued}
                      >
                        {t.queuedSave}
                      </Button>
                      <p
                        data-queued-edit-until={deadline.toISOString()}
                        className="cf-caption tabular-nums text-cf-ink-muted"
                      >
                        {t.queuedEditUntil(deadlineWords(deadline, locale))}
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : shown ? (
                <div className="flex min-w-0 flex-col gap-[8px]">
                  {editLocked && unsaved ? (
                    <p
                      role="status"
                      data-queued-edit-missed={adaptation.id}
                      className="cf-body-sm text-cf-danger"
                    >
                      {t.queuedMissed}
                    </p>
                  ) : null}
                  <AdaptationBody
                    locale={locale}
                    text={shown}
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

              {editable && adaptation.state === 'draft' && !adapting
                ? materialSlot
                : null}

              {/* Проверки и перепись — только у черновика: очередь правится руками. */}
              {editable && adaptation.state === 'draft' ? actionRow : null}
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
                  // До шести видов: поровну в строку не входят на 400 px.
                  wrap
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
                    data-tour="adaptation-adapt"
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
          hideButton="header"
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
              primary={adaptation ? 'rewrite' : 'adapt'}
              onRewrite={
                adaptation
                  ? sendable
                    ? () => onAdapt(adaptation.kind)
                    : undefined
                  : channel.connected && !questionsSlot
                  ? () => onAdapt(kind)
                  : undefined
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

/**
 * Последний момент, когда правка поста в очереди ещё уйдёт в пост
 * (`97dq.80`): слот минус запас сервера. Не очередь или нет даты — `null`.
 */
export function queuedEditDeadlineOf(
  adaptation: Pick<WorkspaceAdaptationV1, 'state' | 'date'> | null | undefined
): Date | null {
  if (adaptation?.state !== 'queued' || !adaptation.date) return null;
  const at = new Date(adaptation.date);
  if (Number.isNaN(at.getTime())) return null;
  return queuedEditDeadline(at);
}

const two = (value: number): string => String(value).padStart(2, '0');

const clockOf = (at: Date): string => `${two(at.getHours())}:${two(at.getMinutes())}`;

/**
 * Срок правки словами (ревью `97dq.80`, P3-2): сегодня — «18:59», другой
 * день — «чт 24.09 18:59», чтобы слот через неделю не читался как сегодняшний.
 */
export function deadlineWords(
  at: Date,
  locale: PiecesLocale,
  now: Date = new Date()
): string {
  const today =
    at.getFullYear() === now.getFullYear() &&
    at.getMonth() === now.getMonth() &&
    at.getDate() === now.getDate();
  if (today) return clockOf(at);
  const weekday = new Intl.DateTimeFormat(locale === 'ru' ? 'ru-RU' : 'en-GB', {
    weekday: 'short',
  })
    .format(at)
    .replace('.', '');
  return `${weekday} ${two(at.getDate())}.${two(at.getMonth() + 1)} ${clockOf(at)}`;
}
