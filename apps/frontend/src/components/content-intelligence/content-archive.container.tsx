'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { useVariables } from '@contentfactory/react/helpers/variable.context';
import { Button } from '@contentfactory/react/form/button';
import { Input } from '@contentfactory/react/form/input';
import { Select } from '@contentfactory/react/form/select';
import { Textarea } from '@contentfactory/react/form/textarea';
import {
  RadioGroup,
  RadioOption,
} from '@contentfactory/react/choice/radio.group';
import clsx from 'clsx';
import { plural } from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/plural';
import { Dialog } from '../ui/layers';
import { EmptyState, ErrorState, SkeletonRows, Status } from '../ui/surface';
import {
  ARCHIVE_IMPORT_API,
  ARCHIVE_LAYERS,
  ARCHIVE_PLATFORM_VALUES,
  IMPORTABLE_ARCHIVE_LAYERS,
  archiveListUrl,
  buildArchiveImportPayload,
  contextUrl,
  emptyArchiveFilters,
  emptyArchiveImportDraft,
  failureNotice,
  jsonReader,
  readArchiveEnvelope,
  readFailure,
  readGroundingEnvelope,
  type ArchiveFailure,
  type ArchiveFilters,
  type ArchiveImportDraft,
  type ArchiveLayer,
  type ArchiveRow,
  type GroundingEnvelope,
} from './content-archive.adapter';
import { useUser } from '../layout/user.context';
import { resolveContentLocale } from './content-section.copy';
import { HighlightedWords, useDebouncedValue } from './content-search-words';
import {
  ContentReadOnlyNote,
  WRITE_ALLOWED,
  readWriteRight,
  writeRightFromRole,
  type ContentWriteRight,
} from './content-write-right';
// The recut panel's own dictionary of platform and language names. Read from
// there rather than restated, so one section cannot call the same platform
// «ВКонтакте» on one screen and `vk` on the next
// (`content-factory-next-fn33.83`).
import {
  contentLanguageLabel,
  platformLabel,
} from '../brand-voice/voice-copy';

/**
 * «Что уже написали» — the archive (`content-factory-next-odb8.4`).
 *
 * Three layers in one flat, newest-first list, the shape §8.1 of
 * `docs/product/content-section-map.md` already settled on for the witness
 * screen and reused here for the same reason: a table with filters, not
 * grouped sections a person has to learn to look inside of.
 *
 * No macet exists for this screen — the map document names the archive as
 * accepted in principle and undesigned in particular (§7). What is built
 * here keeps the vocabulary and the density of `Facts.dc.html` rather than
 * inventing a new visual language: the same badge-plus-meta row, the same
 * dialog for a second-order view, the same "показать/скрыть" toggle for a
 * body too long to always show.
 *
 * Поиск — по словам, и только по словам (§9.3 of
 * `docs/product/content-section-map.md`, the owner's choice of 05.09.2026).
 * The field asks the server, not the page: what is on screen is one page of a
 * filtered list, so a box that hid rows client-side would search the page and
 * look like it searched the archive. Nothing here promises meaning — no
 * «похожие», no «связанные», no ranking; a row matches because the words are
 * in it, and the marks say which ones.
 */

type Locale = 'ru' | 'en';

const copy = {
  ru: {
    title: 'Что уже написали',
    body: 'Тексты, на которые могут ссылаться новые: то, что написано здесь, и то, что занесено вручную — до продукта или мимо него.',
    layerFilterLabel: 'Слой',
    layerAll: 'Все слои',
    layerMadeHere: 'Сделано здесь',
    layerImportedPre: 'До продукта',
    layerPublishedElsewhere: 'Публикуется мимо',
    platformFilterLabel: 'Площадка',
    platformAll: 'Все площадки',
    platformOther: 'Другая',
    fromLabel: 'С',
    toLabel: 'По',
    searchLabel: 'Искать по словам',
    searchHint: 'Ищет по заголовку и тексту. Найдётся то, где встречаются все слова.',
    shown: (visible: number, total: number) => `Показано ${visible} из ${total}`,
    prev: 'Назад',
    next: 'Дальше',
    pageOf: (page: number) => `Страница ${page}`,
    empty: 'Архив пока пуст. Тексты появятся здесь, когда что-то будет написано или занесено.',
    emptyFiltered: 'По этим условиям ничего нет. Измените фильтры.',
    loading: 'Загружаем архив',
    listFallback: 'Архив не загрузился. Попробуйте ещё раз.',
    retry: 'Повторить',
    showText: 'показать текст',
    hideText: 'скрыть текст',
    grounding: 'Разбор',
    importAction: 'Занести текст',
    // content-factory-next-fn33.54: «постов: 1» — счёт без выбора формы
    // слова. `plural` — та же тройка форм, что уже считает образцы и шкалы.
    postsWord: (n: number) => `${n} ${plural(n, ['пост', 'поста', 'постов'])}`,
    queuedWord: (n: number) => `в очереди: ${n}`,
    draftsWord: (n: number) => `черновиков: ${n}`,
    codeWord: (code: string) => code,
    counts: (counts: Record<ArchiveLayer, number>) =>
      `сделано здесь ${counts.MADE_HERE} · до продукта ${counts.IMPORTED_PRE_PRODUCT} · мимо продукта ${counts.PUBLISHED_ELSEWHERE}`,
    groundingDialogTitle: 'На чём стоит этот текст',
    groundingLoading: 'Загружаем разбор',
    groundingFallback: 'Разбор не загрузился. Попробуйте ещё раз.',
    // Says what is true of the row instead of guessing why. The old sentence
    // — «написан до того, как черновик стал запоминать» — was printed over
    // drafts that were minutes old (`content-factory-next-fn33.89`), which is
    // a claim about the product's history standing in for a missing list.
    groundingNoneMadeHere:
      'Список фактов для этого текста не записан. Так бывает, когда в бриф не добавили ни одного факта из памяти продукта.',
    groundingFacts: 'Факты',
    groundingEvidence: 'Источники',
    groundingEmptyFacts: 'Ни один факт не привязан к этому снимку контекста.',
    originPlatform: 'Площадка',
    originUrl: 'Ссылка',
    originDate: 'Дата публикации',
    originNote: 'Заметка',
    originNone: 'не указано',
    close: 'Закрыть',
    importDialogTitle: 'Занести текст в архив',
    originFieldLabel: 'Что это за текст',
    originPre: 'Написан до этого продукта',
    originElsewhere: 'Публикуется мимо продукта',
    titleLabel: 'Заголовок',
    bodyLabel: 'Текст',
    languageLabel: 'Язык',
    platformFieldLabel: 'Площадка (необязательно)',
    urlFieldLabel: 'Ссылка на источник (необязательно)',
    dateFieldLabel: 'Когда опубликован (необязательно)',
    noteFieldLabel: 'Заметка (необязательно)',
    save: 'Занести',
    saving: 'Заносим…',
    cancel: 'Отмена',
    importFailed: 'Материал не занёсся. Ничего не потеряно, проверьте поля и попробуйте ещё раз.',
    importSucceeded: 'Занесено в архив',
    rightsNote: 'Это ваш текст, поэтому подтверждать право на него не нужно.',
    readOnlyRole:
      'Раздел открыт на чтение: заносить тексты в архив может редактор или администратор рабочего пространства.',
    readOnlyPlan:
      'Тариф рабочего пространства сейчас не разрешает занести ещё один текст. Архив остаётся открытым для чтения.',
  },
  en: {
    title: 'What has already been written',
    body: 'Texts a new one can point back at: what was written here, and what was brought in by hand — from before this product or published beside it.',
    layerFilterLabel: 'Layer',
    layerAll: 'All layers',
    layerMadeHere: 'Made here',
    layerImportedPre: 'Before the product',
    layerPublishedElsewhere: 'Published elsewhere',
    platformFilterLabel: 'Platform',
    platformAll: 'All platforms',
    platformOther: 'Other',
    fromLabel: 'From',
    toLabel: 'To',
    searchLabel: 'Search by words',
    searchHint: 'Searches the title and the text. A row matches when every word is in it.',
    shown: (visible: number, total: number) => `Showing ${visible} of ${total}`,
    prev: 'Back',
    next: 'Next',
    pageOf: (page: number) => `Page ${page}`,
    empty: 'The archive is empty for now. Texts will show up here once something is written or brought in.',
    emptyFiltered: 'Nothing matches these filters. Try different ones.',
    loading: 'Loading the archive',
    listFallback: 'The archive did not load. Try again.',
    retry: 'Retry',
    showText: 'show text',
    hideText: 'hide text',
    grounding: 'Grounding',
    importAction: 'Bring in a text',
    postsWord: (n: number) => `posts: ${n}`,
    queuedWord: (n: number) => `queued: ${n}`,
    draftsWord: (n: number) => `drafts: ${n}`,
    codeWord: (code: string) => code,
    counts: (counts: Record<ArchiveLayer, number>) =>
      `made here ${counts.MADE_HERE} · before the product ${counts.IMPORTED_PRE_PRODUCT} · elsewhere ${counts.PUBLISHED_ELSEWHERE}`,
    groundingDialogTitle: 'What this text stands on',
    groundingLoading: 'Loading the grounding',
    groundingFallback: 'The grounding did not load. Try again.',
    groundingNoneMadeHere:
      'No list of facts was recorded for this text. That happens when the brief carried no fact from the product memory.',
    groundingFacts: 'Facts',
    groundingEvidence: 'Sources',
    groundingEmptyFacts: 'No fact is attached to this context snapshot.',
    originPlatform: 'Platform',
    originUrl: 'Link',
    originDate: 'Published on',
    originNote: 'Note',
    originNone: 'not given',
    close: 'Close',
    importDialogTitle: 'Bring a text into the archive',
    originFieldLabel: 'What kind of text this is',
    originPre: 'Written before this product',
    originElsewhere: 'Published elsewhere, beside this product',
    titleLabel: 'Title',
    bodyLabel: 'Text',
    languageLabel: 'Language',
    platformFieldLabel: 'Platform (optional)',
    urlFieldLabel: 'Link to the source (optional)',
    dateFieldLabel: 'When it was published (optional)',
    noteFieldLabel: 'Note (optional)',
    save: 'Bring in',
    saving: 'Bringing in…',
    cancel: 'Cancel',
    importFailed: 'The material was not brought in. Nothing is lost — check the fields and try again.',
    importSucceeded: 'Added to the archive',
    rightsNote: 'This is your own text, so no confirmation of rights is needed.',
    readOnlyRole:
      'The archive is open to read: bringing texts in is done by an editor or an administrator of this workspace.',
    readOnlyPlan:
      "This workspace's plan does not allow bringing in another text right now. The archive stays open to read.",
  },
} as const;

const LAYER_LABEL: Record<ArchiveLayer, (t: (typeof copy)[Locale]) => string> = {
  MADE_HERE: (t) => t.layerMadeHere,
  IMPORTED_PRE_PRODUCT: (t) => t.layerImportedPre,
  PUBLISHED_ELSEWHERE: (t) => t.layerPublishedElsewhere,
};

const LAYER_TONE: Record<ArchiveLayer, 'neutral' | 'accent' | 'info'> = {
  MADE_HERE: 'neutral',
  IMPORTED_PRE_PRODUCT: 'accent',
  PUBLISHED_ELSEWHERE: 'info',
};

const LIMIT = 20;

function LayerBadge({ layer, t }: { layer: ArchiveLayer; t: (typeof copy)[Locale] }) {
  return <Status tone={LAYER_TONE[layer]}>{LAYER_LABEL[layer](t)}</Status>;
}

function GroundingDialog({
  row,
  locale,
  t,
  onClose,
}: {
  row: ArchiveRow;
  locale: Locale;
  t: (typeof copy)[Locale];
  onClose: () => void;
}) {
  const request = useFetch();
  const read = useMemo(() => jsonReader(request), [request]);
  const needsFetch = row.layer === 'MADE_HERE' && !!row.contentContextSnapshotId;
  const context = useSWR<GroundingEnvelope>(
    needsFetch ? contextUrl(row.contentContextSnapshotId as string) : null,
    (url: string) => read(url).then(readGroundingEnvelope),
    { revalidateOnFocus: false }
  );

  return (
    <Dialog open onClose={onClose} title={t.groundingDialogTitle} footer={
      <Button variant="secondary" onClick={onClose}>
        {t.close}
      </Button>
    }>
      <div className="flex flex-col gap-[16px]">
        <p className="max-w-[72ch] cf-body-sm text-cf-ink [text-wrap:pretty]">
          {row.title}
        </p>

        {row.layer !== 'MADE_HERE' ? (
          <dl className="grid grid-cols-[max-content_1fr] gap-x-[12px] gap-y-[8px]">
            <dt className="cf-caption text-cf-ink-muted">{t.originPlatform}</dt>
            <dd className="cf-body-sm text-cf-ink">{row.origin?.platform || t.originNone}</dd>
            <dt className="cf-caption text-cf-ink-muted">{t.originUrl}</dt>
            <dd className="cf-body-sm text-cf-ink break-all">
              {row.origin?.url ? (
                <a
                  href={row.origin.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-cf-accent underline"
                >
                  {row.origin.url}
                </a>
              ) : (
                t.originNone
              )}
            </dd>
            <dt className="cf-caption text-cf-ink-muted">{t.originDate}</dt>
            <dd className="cf-body-sm text-cf-ink">{row.origin?.publishedAt || t.originNone}</dd>
            <dt className="cf-caption text-cf-ink-muted">{t.originNote}</dt>
            <dd className="max-w-[60ch] cf-body-sm text-cf-ink [text-wrap:pretty]">
              {row.origin?.note || t.originNone}
            </dd>
          </dl>
        ) : !needsFetch ? (
          <EmptyState title={t.groundingNoneMadeHere} />
        ) : context.error ? (
          <ErrorState
            title={failureNotice(readFailure(context.error, t.groundingFallback), locale)}
            action={
              <Button variant="secondary" onClick={() => void context.mutate()}>
                {t.retry}
              </Button>
            }
          />
        ) : !context.data ? (
          <SkeletonRows rows={2} label={t.groundingLoading} className="[&>*]:h-[40px]" />
        ) : (
          <div className="flex flex-col gap-[16px]">
            <div>
              <p className="cf-label-sm uppercase text-cf-ink-muted">{t.groundingFacts}</p>
              {context.data.facts.length === 0 ? (
                <p className="mt-[8px] cf-body-sm text-cf-ink-muted">{t.groundingEmptyFacts}</p>
              ) : (
                <ul className="mt-[8px] flex flex-col gap-[8px]">
                  {context.data.facts.map((fact) => (
                    <li
                      key={fact.citationId}
                      className="max-w-[72ch] cf-body-sm text-cf-ink [text-wrap:pretty]"
                    >
                      {fact.statement}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {context.data.evidence.length > 0 && (
              <div>
                <p className="cf-label-sm uppercase text-cf-ink-muted">{t.groundingEvidence}</p>
                <ul className="mt-[8px] flex flex-col gap-[8px]">
                  {context.data.evidence.map((item) => (
                    <li key={item.citationId} className="cf-body-sm text-cf-ink">
                      {item.title}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
}

function ArchiveRowView({
  row,
  locale,
  t,
  query,
  expanded,
  onToggleText,
  onOpenGrounding,
}: {
  row: ArchiveRow;
  locale: Locale;
  t: (typeof copy)[Locale];
  /** Что искали — чтобы строка показала, чем именно она подошла. */
  query: string;
  expanded: boolean;
  onToggleText: () => void;
  onOpenGrounding: () => void;
}) {
  return (
    <li data-content-archive-row={row.id} data-content-archive-layer={row.layer} className="flex flex-col gap-[8px] py-[16px]">
      <div className="flex flex-wrap items-start justify-between gap-[8px]">
        <div className="min-w-0 flex-1">
          <p className="max-w-[72ch] cf-body-md text-cf-ink [text-wrap:pretty]">
            <HighlightedWords text={row.title} query={query} />
          </p>
          <div className="mt-[8px] flex flex-wrap items-center gap-[8px]">
            <LayerBadge layer={row.layer} t={t} />
            <span className="cf-caption text-cf-ink-muted">{t.codeWord(row.code)}</span>
            <span className="cf-caption text-cf-ink-muted">{row.date}</span>
            {row.platforms.map((platform) => (
              <span key={platform} className="cf-caption text-cf-ink-muted">
                {platformLabel(platform, locale)}
              </span>
            ))}
            {row.layer === 'MADE_HERE' && (
              <>
                <span className="cf-caption text-cf-ink-muted">{t.postsWord(row.postCount)}</span>
                {row.queuedCount > 0 && (
                  <span className="cf-caption text-cf-ink-muted">{t.queuedWord(row.queuedCount)}</span>
                )}
                {/* A recut writes a draft. While only what went out was
                    counted, the new version existed in the database and
                    nowhere on this row (`content-factory-next-fn33.84`). */}
                {row.draftCount > 0 && (
                  <span className="cf-caption text-cf-ink-muted">{t.draftsWord(row.draftCount)}</span>
                )}
              </>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-[8px]">
          <span className="flex min-h-[44px] items-center sm:min-h-0">
            <Button density="dense" variant="secondary" onClick={onToggleText}>
              {expanded ? t.hideText : t.showText}
            </Button>
          </span>
          <span className="flex min-h-[44px] items-center sm:min-h-0">
            <Button density="dense" variant="secondary" onClick={onOpenGrounding}>
              {t.grounding}
            </Button>
          </span>
        </div>
      </div>
      {expanded && (
        <div className="max-w-[80ch] rounded-[8px] bg-cf-surface-subtle p-[12px]">
          {/* No clipping and no clamp: a long-form piece stays fully readable once opened. */}
          <p className="whitespace-pre-wrap cf-body-sm text-cf-ink [text-wrap:pretty]">
            {row.format}
          </p>
        </div>
      )}
    </li>
  );
}

function ImportDialog({
  locale,
  t,
  onClose,
  onImported,
  onRefused,
}: {
  locale: Locale;
  t: (typeof copy)[Locale];
  onClose: () => void;
  onImported: () => void;
  /**
   * `content-factory-next-cl19`: a refusal by right belongs to the screen,
   * not to this form. `POST …/archive/import` carries
   * `[Create, Sections.POSTS_PER_MONTH]`, and once it has answered `402` the
   * whole «Занести текст» door is shut — keeping the dialog open over it
   * would ask the person to keep typing into a form that cannot be saved.
   */
  onRefused: (right: ContentWriteRight) => void;
}) {
  const request = useFetch();
  const read = useMemo(() => jsonReader(request), [request]);
  const [draft, setDraft] = useState<ArchiveImportDraft>(emptyArchiveImportDraft(locale));
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ArchiveFailure | null>(null);

  const submit = useCallback(async () => {
    setBusy(true);
    setFailure(null);
    try {
      await read(ARCHIVE_IMPORT_API, {
        method: 'POST',
        body: JSON.stringify(buildArchiveImportPayload(draft)),
      });
      onImported();
    } catch (error) {
      const right = readWriteRight(error);
      if (!right.allowed) onRefused(right);
      else setFailure(readFailure(error, t.importFailed));
    } finally {
      setBusy(false);
    }
  }, [draft, onImported, onRefused, read, t.importFailed]);

  return (
    <Dialog
      open
      onClose={onClose}
      title={t.importDialogTitle}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t.cancel}
          </Button>
          <Button
            variant="primary"
            disabled={busy || !draft.title.trim() || !draft.body.trim()}
            onClick={() => void submit()}
          >
            {busy ? t.saving : t.save}
          </Button>
        </>
      }
    >
      <form
        data-content-archive-import-form="true"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        className="flex flex-col gap-[16px]"
      >
        {failure && <ErrorState title={failureNotice(failure, locale)} />}

        <div className="flex flex-col gap-[8px]">
          <p className="cf-label-sm uppercase text-cf-ink-muted">{t.originFieldLabel}</p>
          <RadioGroup
            value={draft.origin}
            onChange={(value) =>
              setDraft((current) => ({
                ...current,
                origin: value as ArchiveImportDraft['origin'],
              }))
            }
            aria-label={t.originFieldLabel}
            className="flex flex-col gap-[8px]"
          >
            {IMPORTABLE_ARCHIVE_LAYERS.map((layer) => (
              <RadioOption
                key={layer}
                value={layer}
                layout="content"
                className="flex items-center gap-[8px] text-start cf-body-sm text-cf-ink"
              >
                <span
                  aria-hidden
                  className={clsx(
                    'flex h-[16px] w-[16px] flex-none items-center justify-center rounded-full border',
                    draft.origin === layer ? 'border-cf-accent' : 'border-cf-border-control'
                  )}
                >
                  {draft.origin === layer && (
                    <span className="h-[8px] w-[8px] rounded-full bg-cf-accent" />
                  )}
                </span>
                {layer === 'IMPORTED_PRE_PRODUCT' ? t.originPre : t.originElsewhere}
              </RadioOption>
            ))}
          </RadioGroup>
        </div>

        <Input
          disableForm
          label={t.titleLabel}
          name="archive-import-title"
          value={draft.title}
          onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
        />

        <div className="flex flex-col gap-[8px]">
          <p className="cf-label-sm uppercase text-cf-ink-muted">{t.bodyLabel}</p>
          <Textarea
            standalone
            layout="content"
            name="archive-import-body"
            aria-label={t.bodyLabel}
            value={draft.body}
            onChange={(event) => setDraft((current) => ({ ...current, body: event.target.value }))}
          />
        </div>

        <Select
          disableForm
          label={t.languageLabel}
          name="archive-import-language"
          value={draft.language}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              language: event.target.value as 'ru' | 'en',
            }))
          }
        >
          <option value="ru">{contentLanguageLabel('ru', locale)}</option>
          <option value="en">{contentLanguageLabel('en', locale)}</option>
        </Select>

        <Select
          disableForm
          label={t.platformFieldLabel}
          name="archive-import-platform"
          value={draft.platform}
          onChange={(event) => setDraft((current) => ({ ...current, platform: event.target.value }))}
        >
          <option value="">—</option>
          {ARCHIVE_PLATFORM_VALUES.map((platform) => (
            <option key={platform} value={platform}>
              {platform === 'other'
                ? t.platformOther
                : platformLabel(platform, locale)}
            </option>
          ))}
        </Select>

        <Input
          disableForm
          label={t.urlFieldLabel}
          name="archive-import-url"
          type="url"
          value={draft.url}
          onChange={(event) => setDraft((current) => ({ ...current, url: event.target.value }))}
        />

        <Input
          disableForm
          label={t.dateFieldLabel}
          name="archive-import-date"
          value={draft.publishedAt}
          placeholder="2019 / 2019-06 / 2019-06-14"
          onChange={(event) => setDraft((current) => ({ ...current, publishedAt: event.target.value }))}
        />

        <Input
          disableForm
          label={t.noteFieldLabel}
          name="archive-import-note"
          value={draft.note}
          onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))}
        />

        <p className="cf-caption text-cf-ink-muted">{t.rightsNote}</p>
      </form>
    </Dialog>
  );
}

export function ContentArchiveContainer() {
  const request = useFetch();
  const { language } = useVariables();
  const locale: Locale = resolveContentLocale(language);
  const t = copy[locale];
  const read = useMemo(() => jsonReader(request), [request]);

  const [filters, setFilters] = useState<ArchiveFilters>(emptyArchiveFilters);
  /*
    Набранное и спрошенное — два разных значения, и разница между ними и есть
    задержка ввода. В поле живёт `typedQuery`, поэтому оно не дёргается; в
    адрес — успокоившееся, поэтому «подшипники» уходят одним запросом, а не
    одиннадцатью. Страница сбрасывается вместе с вопросом: третья страница
    прежнего запроса к новому отношения не имеет.
  */
  const [typedQuery, setTypedQuery] = useState('');
  const settledQuery = useDebouncedValue(typedQuery);
  useEffect(() => {
    setFilters((current) =>
      current.q === settledQuery ? current : { ...current, q: settledQuery, page: 0 }
    );
  }, [settledQuery]);

  const url = archiveListUrl(filters, LIMIT);
  const archive = useSWR(url, () => read(url).then(readArchiveEnvelope), {
    revalidateOnFocus: false,
  });

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [groundingRow, setGroundingRow] = useState<ArchiveRow | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  /**
   * What is known about the right to bring a text in — from the session
   * first, from the server after (`content-factory-next-fn33.90.8`).
   *
   * The role is read from the session before anything is drawn, so a `USER`
   * never gets as far as filling in the form. The plan is still learned from
   * the answer, and a plan refusal replaces this reading when it arrives.
   */
  const user = useUser();
  const [writeRight, setWriteRight] = useState<ContentWriteRight>(WRITE_ALLOWED);
  useEffect(() => {
    setWriteRight((current) =>
      current.refusal === 'plan' ? current : writeRightFromRole(user?.role)
    );
  }, [user?.role]);
  const canImport = writeRight.allowed;
  const readOnlyNoteId = 'content-archive-read-only';

  const refuseImport = useCallback((right: ContentWriteRight) => {
    setWriteRight(right);
    setImportOpen(false);
  }, []);

  const toggleText = useCallback((id: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const envelope = archive.data;
  const listFailure = archive.error && !archive.data ? readFailure(archive.error, t.listFallback) : null;
  const loading = !envelope && !listFailure;

  const setFilter = useCallback(<K extends keyof ArchiveFilters>(key: K, value: ArchiveFilters[K]) => {
    setFilters((current) => ({ ...current, [key]: value, ...(key === 'page' ? {} : { page: 0 }) }));
  }, []);

  return (
    <section
      data-content-intelligence-section="archive"
      data-content-archive-state={loading ? 'loading' : listFailure ? 'error' : envelope?.state ?? 'default'}
      aria-labelledby="content-archive-title"
      className="flex min-w-0 flex-col gap-[16px]"
    >
      <div className="flex flex-wrap items-start justify-between gap-[16px]">
        <div className="flex flex-col gap-[4px]">
          <h2 id="content-archive-title" tabIndex={-1} className="cf-heading-md text-cf-ink [text-wrap:balance]">
            {t.title}
          </h2>
          <p className="max-w-[72ch] cf-body-sm text-cf-ink-muted [text-wrap:pretty]">{t.body}</p>
        </div>
        <Button
          variant="primary"
          disabled={!canImport}
          aria-describedby={canImport ? undefined : readOnlyNoteId}
          onClick={() => setImportOpen(true)}
        >
          {t.importAction}
        </Button>
      </div>

      {!canImport && (
        <ContentReadOnlyNote
          id={readOnlyNoteId}
          surface="archive"
          refusal={writeRight.refusal ?? 'plan'}
        >
          {writeRight.refusal === 'role' ? t.readOnlyRole : t.readOnlyPlan}
        </ContentReadOnlyNote>
      )}

      {listFailure ? (
        <ErrorState
          title={failureNotice(listFailure, locale)}
          action={
            <Button variant="secondary" onClick={() => void archive.mutate()}>
              {t.retry}
            </Button>
          }
        />
      ) : loading ? (
        <SkeletonRows rows={3} label={t.loading} className="[&>*]:h-[56px]" />
      ) : envelope && envelope.state === 'empty' ? (
        // `state` is the backend's own read of the whole library, not of this
        // page's filters — the workspace itself has nothing in it, which
        // filters and a "try different ones" message would misdescribe.
        <EmptyState title={t.empty} />
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-[8px]">
            <Select
              disableForm
              label={t.layerFilterLabel}
              name="archiveLayerFilter"
              value={filters.layer}
              onChange={(event) => setFilter('layer', event.target.value as ArchiveFilters['layer'])}
            >
              <option value="ALL">{t.layerAll}</option>
              {ARCHIVE_LAYERS.map((layer) => (
                <option key={layer} value={layer}>
                  {LAYER_LABEL[layer](t)}
                </option>
              ))}
            </Select>
            <Select
              disableForm
              label={t.platformFilterLabel}
              name="archivePlatformFilter"
              value={filters.platform}
              onChange={(event) => setFilter('platform', event.target.value)}
            >
              <option value="ALL">{t.platformAll}</option>
              {ARCHIVE_PLATFORM_VALUES.map((platform) => (
                <option key={platform} value={platform}>
                  {platform === 'other'
                    ? t.platformOther
                    : platformLabel(platform, locale)}
                </option>
              ))}
            </Select>
            <Input
              disableForm
              type="date"
              label={t.fromLabel}
              name="archiveFrom"
              value={filters.from}
              onChange={(event) => setFilter('from', event.target.value)}
            />
            <Input
              disableForm
              type="date"
              label={t.toLabel}
              name="archiveTo"
              value={filters.to}
              onChange={(event) => setFilter('to', event.target.value)}
            />
            {/*
              `type="search"` — это поле с крестиком очистки и своей ролью для
              скринридера; подпись задана `aria-label`, потому что рядом с
              тремя подписанными фильтрами четвёртая подпись сверху ломала бы
              ряд, а плейсхолдер один подписью не считается.
            */}
            <Input
              disableForm
              type="search"
              name="archiveSearch"
              aria-label={t.searchLabel}
              placeholder={t.searchLabel}
              title={t.searchHint}
              value={typedQuery}
              onChange={(event) => setTypedQuery(event.target.value)}
              fieldClassName="min-w-[200px] max-w-[320px] flex-1"
            />
            {envelope && (
              <span className="ml-auto cf-caption text-cf-ink-muted">
                {t.shown(envelope.materials.length, envelope.total)} · {t.counts(envelope.counts)}
              </span>
            )}
          </div>

          {envelope && envelope.materials.length === 0 ? (
            <EmptyState title={t.emptyFiltered} />
          ) : (
            <ul className="divide-y divide-cf-border rounded-[8px] border border-cf-border bg-cf-surface px-[16px]">
              {envelope?.materials.map((row) => (
                <ArchiveRowView
                  key={row.id}
                  row={row}
                  locale={locale}
                  t={t}
                  query={filters.q}
                  expanded={expanded.has(row.id)}
                  onToggleText={() => toggleText(row.id)}
                  onOpenGrounding={() => setGroundingRow(row)}
                />
              ))}
            </ul>
          )}

          {envelope && envelope.total > LIMIT && (
            <div className="flex items-center justify-between gap-[8px]">
              <Button
                variant="secondary"
                density="dense"
                disabled={filters.page === 0}
                onClick={() => setFilter('page', filters.page - 1)}
              >
                {t.prev}
              </Button>
              <span className="cf-caption text-cf-ink-muted">{t.pageOf(filters.page + 1)}</span>
              <Button
                variant="secondary"
                density="dense"
                disabled={(filters.page + 1) * LIMIT >= envelope.total}
                onClick={() => setFilter('page', filters.page + 1)}
              >
                {t.next}
              </Button>
            </div>
          )}
        </>
      )}

      {groundingRow && (
        <GroundingDialog
          row={groundingRow}
          locale={locale}
          t={t}
          onClose={() => setGroundingRow(null)}
        />
      )}

      {importOpen && (
        <ImportDialog
          locale={locale}
          t={t}
          onClose={() => setImportOpen(false)}
          onImported={() => {
            setImportOpen(false);
            void archive.mutate();
          }}
          onRefused={refuseImport}
        />
      )}
    </section>
  );
}

export default ContentArchiveContainer;
