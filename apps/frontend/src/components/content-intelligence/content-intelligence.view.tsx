'use client';

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from 'react';
import { Button } from '@contentfactory/react/form/button';
import { Input } from '@contentfactory/react/form/input';
import { Select } from '@contentfactory/react/form/select';
import { Textarea } from '@contentfactory/react/form/textarea';

export type ContentIntelligenceSection = 'sources' | 'provenance';
export type ContentIntelligenceSurfaceState =
  | 'loading'
  | 'empty'
  | 'default'
  | 'selected'
  | 'success'
  | 'error'
  | 'restricted'
  | 'disabled'
  | 'long-content';

export type ContentSourceView = Readonly<{
  id: string;
  kind: 'URL' | 'RSS' | 'MANUAL';
  displayName: string;
  canonicalUrl?: string | null;
  desiredState: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  healthState: 'NEVER_SYNCED' | 'FRESH' | 'STALE' | 'POLICY_BLOCKED' | 'ERROR';
  rightsState: 'UNCONFIRMED' | 'CONFIRMED' | 'DENIED';
  robotsState: 'UNKNOWN' | 'ALLOWED' | 'DISALLOWED' | 'NOT_APPLICABLE';
  currentSnapshot?: Readonly<{
    observedAt: string;
    freshUntil?: string | null;
    evidenceCount: number;
  }> | null;
}>;

export type SourceCapabilitiesView = Readonly<{
  directFetch: boolean;
  validate: boolean;
  sync: boolean;
}>;

export type SourceDraftMaterialView = Readonly<{
  sourceId: string;
  snapshotId: string;
  evidence: readonly Readonly<{
    evidenceId: string;
    excerpt: string;
    observedAt: string;
    freshUntil?: string | null;
    freshnessStatus: string;
    provenance: Readonly<{ kind: string; retrievalProvider: string }>;
  }>[];
  trace: Readonly<{ contractVersion: string; builtAt: string }>;
}>;

export type ContentFactView = Readonly<{
  id: string;
  statement: string;
  status: 'VERIFIED' | 'CONFLICT' | 'EVIDENCE_REQUIRED' | 'REJECTED';
  currentRequired: boolean;
  evidence: readonly Readonly<{
    id: string;
    sourceLabel: string;
    excerpt: string;
    relation: 'SUPPORTS' | 'CONTRADICTS';
    sourceState?: 'AVAILABLE' | 'SOURCE_REMOVED';
  }>[];
}>;

export type ProvenanceView = Readonly<{
  contextId?: string | null;
  status:
    | 'EMPTY'
    | 'READY'
    | 'PARTIAL'
    | 'UNAVAILABLE'
    | 'BLOCKED_STALE'
    | 'BLOCKED_CONFLICT';
  generationPolicy: 'ALLOW_GROUNDED' | 'ALLOW_USER_ONLY' | 'EVIDENCE_REQUIRED';
  errorCode: 'CONTENT_EVIDENCE_REQUIRED' | null;
  profile?:
    | Readonly<{ mode: 'resolved'; versionId: string; versionNumber: number }>
    | Readonly<{
        mode: 'neutral_fallback';
        reason: 'NO_PROFILE' | 'EXPLICIT_NONE' | 'LEGACY_REQUEST';
      }>;
  facts: readonly ContentFactView[];
  rejected: readonly Readonly<{ label: string; reason: string }>[];
}>;

export type ContentIntelligenceData = Readonly<{
  /**
   * Whether this reader may change what the workspace is configured with.
   *
   * It used to live on `brand.canManage`, which was never a fact about a brand
   * profile: the container computes it from the member's role and the sources
   * section read it from there. With the brand form gone the borrowed home
   * went with it, and the permission says what it is.
   */
  canManage: boolean;
  sources: readonly ContentSourceView[];
  sourceCapabilities: SourceCapabilitiesView;
  sourceDraftMaterial?: SourceDraftMaterialView | null;
  provenance: ProvenanceView;
  provenanceAvailable: boolean;
}>;

export type ContentIntelligenceFeedback =
  | 'idle'
  | 'pending'
  | 'success'
  | 'refreshed'
  | 'error'
  | 'conflict'
  | 'unavailable';

export type ContentIntelligenceActions = Readonly<{
  onRetry: (section: ContentIntelligenceSection) => void;
  onAddSource: (data: FormData) => void;
  onConfirmSourceRights: (sourceId: string) => void;
  onValidateSource: (sourceId: string) => void;
  onActivateSource: (sourceId: string) => void;
  onSyncSource: (sourceId: string) => void;
  onCreateDraftMaterial: (sourceId: string) => void;
  onRemoveSource: (sourceId: string) => void;
  onInspectContext: (contextId: string) => void;
}>;

export const NOOP_CONTENT_INTELLIGENCE_ACTIONS: ContentIntelligenceActions =
  Object.freeze({
    onRetry: () => undefined,
    onAddSource: () => undefined,
    onConfirmSourceRights: () => undefined,
    onValidateSource: () => undefined,
    onActivateSource: () => undefined,
    onSyncSource: () => undefined,
    onCreateDraftMaterial: () => undefined,
    onRemoveSource: () => undefined,
    onInspectContext: () => undefined,
  });

type Locale = 'en' | 'ru';

const copy = {
  en: {
    title: 'Content intelligence',
    description:
      'Keep voice, trusted sources and factual provenance visible before content is generated.',
    sources: 'Sources',
    provenance: 'Fact review',
    errorTitle: 'Content intelligence could not be loaded',
    errorBody: 'Your saved settings are unchanged. Retry the request safely.',
    conflictTitle: 'Draft changed in another session',
    conflictBody:
      'Reload the latest revision before saving again. No content was overwritten.',
    retry: 'Retry',
    restrictedTitle: 'Workspace administrator access is required',
    restrictedBody:
      'Members can read and use published context. Only administrators can change organization-wide profiles and sources.',
    disabledTitle: 'Changes are temporarily disabled',
    disabledBody:
      'You can review the current configuration while changes are unavailable.',
    saved: 'Saved successfully',
    savedBody:
      'The server accepted the change and the visible data was refreshed.',
    refreshed: 'Latest data loaded',
    refreshedBody: 'This section now shows the latest server response.',
    sectionPending: 'Saving this section',
    sectionPendingBody:
      'Other settings stay available while this request completes.',
    loading: 'Loading content intelligence',
    selectedState: 'Selected for focused review',
    selectedStateBody:
      'This section is isolated so its current values and actions can be checked.',
    longState: 'Long content is shown in full',
    longStateBody:
      'Labels, URLs and evidence wrap without hiding information or actions.',
    neutral: 'Neutral voice is applied',
    addSource: 'Add URL or RSS',
    addSourceBody:
      'Direct fetch starts only after an administrator confirms the right to use the material.',
    sourceType: 'Source type',
    sourceUrl: 'HTTPS URL',
    sourceLabel: 'Source label',
    manualText: 'Manual source text',
    registerSource: 'Register source',
    emptySources: 'No sources registered',
    emptySourcesBody:
      'Add one permitted URL or RSS feed to begin a reviewable source history.',
    rightsConfirmed: 'Rights confirmed',
    rightsPending: 'Rights pending',
    rightsDenied: 'Rights denied',
    fresh: 'Fresh',
    stale: 'Stale',
    failed: 'Fetch failed',
    neverSynced: 'Never synced',
    policyBlocked: 'Policy blocked',
    conflict: 'Conflict',
    ownershipRequired: 'Ownership check required',
    nextSync: 'Next sync',
    snapshot: 'Snapshot',
    noSnapshot: 'No accepted snapshot',
    confirmRights: 'Confirm rights',
    validate: 'Validate',
    enable: 'Activate',
    sync: 'Sync now',
    makeDraft: 'Create draft material',
    remove: 'Remove',
    directFetchOff: 'Direct fetch is unavailable',
    directFetchOffBody:
      'Validation and sync stay disabled because the server capability is off.',
    draftMaterial: 'Returned draft material',
    draftMaterialBody:
      'This server response is preserved for review; it is not sent to a model.',
    contextTitle: 'Provenance inspector',
    contextBody:
      'Open a server-issued context snapshot to review the exact profile, facts and evidence used.',
    contextId: 'Context snapshot ID',
    inspect: 'Inspect context',
    contextUnavailable: 'Context lookup is not available yet',
    contextUnavailableBody:
      'You can keep or correct the snapshot ID. Inspection stays disabled until the server read endpoint is available.',
    contextEmpty: 'No context snapshot selected',
    contextEmptyBody:
      'Paste an ID from a saved draft or post. No lookup runs until you submit.',
    generationAllowed: 'Generation allowed',
    generationBlocked: 'Generation blocked until current evidence is available',
    providerNotEvidence: 'Provider summaries are not evidence',
    providerNotEvidenceBody:
      'Only accepted source excerpts can support facts. Unknown citations are rejected.',
    evidence: 'Evidence',
    supports: 'Supports',
    contradicts: 'Contradicts',
    verified: 'Verified',
    evidenceRequired: 'Current evidence required',
    rejected: 'Rejected citation',
    appliedProfile: 'Applied profile',
  },
  ru: {
    title: 'Знания о контенте',
    description:
      'Голос, надёжные источники и происхождение фактов видны до генерации материала.',
    sources: 'Источники',
    provenance: 'Проверка фактов',
    errorTitle: 'Не удалось загрузить знания о контенте',
    errorBody:
      'Сохранённые настройки не изменились. Запрос можно безопасно повторить.',
    conflictTitle: 'Черновик изменён в другой сессии',
    conflictBody:
      'Загрузите последнюю редакцию перед повторным сохранением. Текст не был перезаписан.',
    retry: 'Повторить',
    restrictedTitle: 'Нужен доступ администратора пространства',
    restrictedBody:
      'Участники могут читать и применять опубликованный контекст. Настройки организации меняет только администратор.',
    disabledTitle: 'Изменения временно недоступны',
    disabledBody: 'Текущую конфигурацию можно просматривать.',
    saved: 'Изменения сохранены',
    savedBody: 'Сервер принял изменение, показанные данные обновлены.',
    refreshed: 'Актуальные данные загружены',
    refreshedBody: 'Раздел показывает последний ответ сервера.',
    sectionPending: 'Раздел сохраняется',
    sectionPendingBody:
      'Остальные настройки доступны, пока запрос выполняется.',
    loading: 'Загрузка знаний о контенте',
    selectedState: 'Раздел выбран для проверки',
    selectedStateBody: 'Текущие значения и действия раздела показаны отдельно.',
    longState: 'Длинный текст показан полностью',
    longStateBody:
      'Подписи, URL и доказательства переносятся без скрытия данных и действий.',
    neutral: 'Применяется нейтральный голос',
    addSource: 'Добавить URL или RSS',
    addSourceBody:
      'Прямое получение начнётся только после подтверждения администратором права на материал.',
    sourceType: 'Тип источника',
    sourceUrl: 'HTTPS URL',
    sourceLabel: 'Название источника',
    manualText: 'Текст ручного источника',
    registerSource: 'Зарегистрировать источник',
    emptySources: 'Источников пока нет',
    emptySourcesBody:
      'Добавьте разрешённый URL или RSS, чтобы начать проверяемую историю.',
    rightsConfirmed: 'Права подтверждены',
    rightsPending: 'Права ожидают подтверждения',
    rightsDenied: 'В правах отказано',
    fresh: 'Актуален',
    stale: 'Устарел',
    failed: 'Ошибка получения',
    neverSynced: 'Ещё не синхронизирован',
    policyBlocked: 'Заблокирован политикой',
    conflict: 'Конфликт',
    ownershipRequired: 'Нужно подтвердить владение',
    nextSync: 'Следующая синхронизация',
    snapshot: 'Снимок',
    noSnapshot: 'Принятого снимка нет',
    confirmRights: 'Подтвердить права',
    validate: 'Проверить',
    enable: 'Активировать',
    sync: 'Синхронизировать',
    makeDraft: 'Создать материал черновика',
    remove: 'Удалить',
    directFetchOff: 'Прямое получение недоступно',
    directFetchOffBody: 'Проверка и синхронизация отключены сервером.',
    draftMaterial: 'Полученный материал черновика',
    draftMaterialBody:
      'Ответ сервера сохранён для проверки и не отправляется модели.',
    contextTitle: 'Проверка происхождения',
    contextBody:
      'Откройте выданный сервером снимок контекста и проверьте точную версию паспорта, факты и доказательства.',
    contextId: 'ID снимка контекста',
    inspect: 'Проверить контекст',
    contextUnavailable: 'Проверка контекста пока недоступна',
    contextUnavailableBody:
      'ID снимка можно сохранить или исправить. Проверка включится после появления серверного чтения.',
    contextEmpty: 'Снимок контекста не выбран',
    contextEmptyBody:
      'Вставьте ID из сохранённого черновика или публикации. Запрос начнётся только после отправки.',
    generationAllowed: 'Генерация разрешена',
    generationBlocked:
      'Генерация заблокирована до появления актуальных доказательств',
    providerNotEvidence: 'Сводка провайдера не считается доказательством',
    providerNotEvidenceBody:
      'Факты подтверждают только принятые фрагменты источников. Неизвестные ссылки отклоняются.',
    evidence: 'Доказательства',
    supports: 'Подтверждает',
    contradicts: 'Противоречит',
    verified: 'Проверен',
    evidenceRequired: 'Нужны актуальные доказательства',
    rejected: 'Отклонённая ссылка',
    appliedProfile: 'Применённый паспорт',
  },
} as const;

const formatDate = (value: string | null | undefined, locale: Locale) =>
  value
    ? new Intl.DateTimeFormat(locale === 'ru' ? 'ru-RU' : 'en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'UTC',
      }).format(new Date(value))
    : '—';

function Status({
  tone,
  children,
}: {
  tone: 'positive' | 'info' | 'warning' | 'danger';
  children: ReactNode;
}) {
  const tones = {
    positive: 'border-cf-accent text-cf-accent bg-cf-accent-soft',
    info: 'border-cf-info text-cf-info bg-cf-info-soft',
    warning: 'border-cf-warning text-cf-warning bg-cf-warning-soft',
    danger: 'border-cf-danger text-cf-danger bg-cf-danger-soft',
  } as const;
  return (
    <span
      className={`inline-flex items-center gap-[8px] rounded-full border px-[8px] py-[4px] cf-caption ${tones[tone]}`}
    >
      <StatusGlyph />
      {children}
    </span>
  );
}

function StatusGlyph() {
  return (
    <svg aria-hidden width="12" height="12" viewBox="0 0 12 12" fill="none">
      <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="m4 6 1.3 1.3L8.2 4.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Notice({
  tone,
  title,
  body,
  action,
  announce = true,
}: {
  tone: 'info' | 'warning' | 'danger' | 'positive';
  title: string;
  body: string;
  action?: ReactNode;
  announce?: boolean;
}) {
  const tones = {
    info: 'border-cf-info bg-cf-info-soft text-cf-info',
    warning: 'border-cf-warning bg-cf-warning-soft text-cf-warning',
    danger: 'border-cf-danger bg-cf-danger-soft text-cf-danger',
    positive: 'border-cf-accent bg-cf-accent-soft text-cf-accent',
  } as const;
  return (
    <div
      className={`rounded-[8px] border p-[16px] ${tones[tone]}`}
      {...(tone === 'danger' && announce ? { role: 'alert' } : null)}
    >
      <div className="flex items-start gap-[8px]">
        <span className="mt-[4px]">
          <StatusGlyph />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="cf-label-md [text-wrap:balance]">{title}</h3>
          <p className="mt-[4px] max-w-[72ch] cf-body-sm [text-wrap:pretty]">
            {body}
          </p>
          {action && <div className="mt-[12px]">{action}</div>}
        </div>
      </div>
    </div>
  );
}

function LoadingView({ label }: { label: string }) {
  return (
    <div
      aria-busy="true"
      aria-label={label}
      className="flex flex-col gap-[16px]"
    >
      <span className="sr-only">{label}</span>
      {[0, 1, 2].map((item) => (
        <div
          key={item}
          className="animate-pulse rounded-[8px] border border-cf-border bg-cf-surface p-[20px] motion-reduce:animate-none"
        >
          <div className="h-[16px] w-[160px] rounded-[4px] bg-cf-surface-subtle" />
          <div className="mt-[12px] h-[12px] max-w-[520px] rounded-[4px] bg-cf-surface-subtle" />
          <div className="mt-[8px] h-[12px] max-w-[360px] rounded-[4px] bg-cf-surface-subtle" />
        </div>
      ))}
    </div>
  );
}

export function ContentIntelligenceView({
  locale,
  activeSection = 'sources',
  state = 'default',
  errorReason,
  sectionStates,
  sectionFeedback,
  visibleSections,
  showHeader = true,
  contextIdValue,
  onContextIdChange,
  data,
  actions,
}: {
  locale: Locale;
  activeSection?: ContentIntelligenceSection;
  state?: ContentIntelligenceSurfaceState;
  errorReason?: 'conflict';
  sectionStates?: Partial<
    Record<ContentIntelligenceSection, ContentIntelligenceSurfaceState>
  >;
  sectionFeedback?: Partial<
    Record<ContentIntelligenceSection, ContentIntelligenceFeedback>
  >;
  visibleSections?: readonly ContentIntelligenceSection[];
  /**
   * The title, the description and the in-page jump links. A host that already
   * names the surface and already lets the reader choose a section — the
   * Content route with its tabs — would otherwise show two navigations for one
   * choice and two `h1` elements on one page.
   */
  showHeader?: boolean;
  contextIdValue?: string;
  onContextIdChange?: (value: string) => void;
  data: ContentIntelligenceData;
  actions: ContentIntelligenceActions;
}) {
  const t = copy[locale];
  const shown = visibleSections ?? (['sources', 'provenance'] as const);
  const feedback = {
    sources: sectionFeedback?.sources ?? 'idle',
    provenance: sectionFeedback?.provenance ?? 'idle',
  } as const;
  const stateFor = (section: ContentIntelligenceSection) =>
    sectionStates?.[section] ?? state;
  const resolvedStates = {
    sources: stateFor('sources'),
    provenance: stateFor('provenance'),
  } as const;
  const previousFeedback = useRef(feedback);
  const initiators = useRef<
    Partial<Record<ContentIntelligenceSection, HTMLElement>>
  >({});
  const statusNodes = useRef<
    Partial<Record<ContentIntelligenceSection, HTMLDivElement>>
  >({});
  const retryFocusPending = useRef<
    Partial<Record<ContentIntelligenceSection, boolean>>
  >({});
  const rememberInitiator = (
    section: ContentIntelligenceSection,
    target: HTMLElement | null
  ) => {
    if (target) initiators.current[section] = target;
  };
  useEffect(() => {
    (['sources', 'provenance'] as const).forEach((section) => {
      if (
        previousFeedback.current[section] === 'pending' &&
        feedback[section] !== 'pending'
      ) {
        const initiator = initiators.current[section];
        const initiatorUnavailable = initiator?.matches(
          'button:disabled, [aria-disabled="true"]'
        );
        const target =
          initiator?.isConnected && !initiatorUnavailable
            ? initiator
            : statusNodes.current[section];
        target?.focus();
      }
      if (
        retryFocusPending.current[section] &&
        stateFor(section) !== 'error' &&
        stateFor(section) !== 'loading' &&
        feedback[section] !== 'pending'
      ) {
        const headingId =
          section === 'sources'
            ? 'source-registry-title'
            : 'provenance-review-title';
        const target =
          statusNodes.current[section] ?? document.getElementById(headingId);
        target?.focus();
        retryFocusPending.current[section] = false;
      }
    });
    previousFeedback.current = feedback;
  }, [
    feedback.provenance,
    feedback.sources,
    resolvedStates.provenance,
    resolvedStates.sources,
  ]);

  const disabledFor = (section: ContentIntelligenceSection) =>
    stateFor(section) === 'disabled' || feedback[section] === 'pending';
  const restrictedFor = (section: ContentIntelligenceSection) =>
    stateFor(section) === 'restricted' ||
    (section !== 'provenance' && !data.canManage);

  const frame = (section: ContentIntelligenceSection, content: ReactNode) => {
    const sectionState = stateFor(section);
    const sectionFeedbackState = feedback[section];
    const conflict =
      sectionFeedbackState === 'conflict' ||
      (sectionState === 'error' && errorReason === 'conflict');
    return (
      <div
        key={section}
        data-content-intelligence-section={section}
        data-section-state={sectionState}
        data-long-content={sectionState === 'long-content' ? 'true' : undefined}
      >
        {sectionState === 'loading' ? (
          <LoadingView label={t.loading} />
        ) : sectionState === 'error' ? (
          <Notice
            tone="danger"
            title={conflict ? t.conflictTitle : t.errorTitle}
            body={conflict ? t.conflictBody : t.errorBody}
            action={
              <Button
                variant="secondary"
                onClick={(event) => {
                  rememberInitiator(section, event.currentTarget);
                  retryFocusPending.current[section] = true;
                  actions.onRetry(section);
                }}
              >
                {t.retry}
              </Button>
            }
          />
        ) : (
          <>
            {restrictedFor(section) && (
              <Notice
                tone="warning"
                title={t.restrictedTitle}
                body={t.restrictedBody}
                action={
                  <Button variant="secondary" aria-disabled="true" disabled>
                    {section === 'sources' ? t.registerSource : t.inspect}
                  </Button>
                }
              />
            )}
            {sectionState === 'disabled' && (
              <Notice
                tone="info"
                title={t.disabledTitle}
                body={t.disabledBody}
              />
            )}
            {sectionState === 'success' && (
              <div role="status" aria-live="polite">
                <Notice tone="positive" title={t.saved} body={t.savedBody} />
              </div>
            )}
            {sectionState === 'selected' && (
              <div className="mb-[12px]">
                <Notice
                  tone="info"
                  title={t.selectedState}
                  body={t.selectedStateBody}
                />
              </div>
            )}
            {sectionState === 'long-content' && (
              <div className="mb-[12px]">
                <Notice
                  tone="info"
                  title={t.longState}
                  body={t.longStateBody}
                />
              </div>
            )}
            {sectionFeedbackState !== 'idle' &&
              sectionFeedbackState !== 'pending' && (
                <div
                  ref={(node) => {
                    if (node) statusNodes.current[section] = node;
                  }}
                  tabIndex={-1}
                  role={
                    sectionFeedbackState === 'error' ||
                    sectionFeedbackState === 'conflict'
                      ? 'alert'
                      : 'status'
                  }
                  aria-live="polite"
                  className="mb-[12px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cf-focus"
                >
                  <Notice
                    announce={false}
                    tone={
                      sectionFeedbackState === 'success' ||
                      sectionFeedbackState === 'refreshed'
                        ? 'positive'
                        : sectionFeedbackState === 'unavailable'
                        ? 'info'
                        : 'danger'
                    }
                    title={
                      sectionFeedbackState === 'conflict'
                        ? t.conflictTitle
                        : sectionFeedbackState === 'unavailable'
                        ? t.contextUnavailable
                        : sectionFeedbackState === 'success'
                        ? t.saved
                        : sectionFeedbackState === 'refreshed'
                        ? t.refreshed
                        : t.errorTitle
                    }
                    body={
                      sectionFeedbackState === 'conflict'
                        ? t.conflictBody
                        : sectionFeedbackState === 'unavailable'
                        ? t.contextUnavailableBody
                        : sectionFeedbackState === 'success'
                        ? t.savedBody
                        : sectionFeedbackState === 'refreshed'
                        ? t.refreshedBody
                        : t.errorBody
                    }
                  />
                </div>
              )}
            {sectionFeedbackState === 'pending' && (
              <div className="mb-[12px]" aria-live="polite">
                <Notice
                  tone="info"
                  title={t.sectionPending}
                  body={t.sectionPendingBody}
                />
              </div>
            )}
            {content}
          </>
        )}
      </div>
    );
  };

  return (
    <div
      data-product-surface="content-intelligence"
      data-surface-state={state}
      className="mx-auto flex w-full max-w-[1120px] flex-col gap-[24px] [&_a]:min-h-[44px] [&_a]:min-w-[44px] [&_button]:min-h-[44px] [&_button]:min-w-[44px] [&_input]:min-h-[44px] [&_select]:min-h-[44px] sm:[&_a]:min-h-0 sm:[&_a]:min-w-0 sm:[&_button]:min-h-0 sm:[&_button]:min-w-0 sm:[&_input]:min-h-0 sm:[&_select]:min-h-0"
    >
      {showHeader && (
        <header>
          <h1 className="cf-heading-lg text-cf-ink [text-wrap:balance]">
            {t.title}
          </h1>
          <p className="mt-[8px] max-w-[72ch] cf-body-md text-cf-ink-muted [text-wrap:pretty]">
            {t.description}
          </p>
          <nav
            aria-label={t.title}
            className="mt-[16px] flex flex-wrap gap-[8px]"
          >
            {(
              [
                ['sources', t.sources, 'source-registry'],
                ['provenance', t.provenance, 'provenance-review'],
              ] as const
            ).map(([section, label, anchor]) => (
              <a
                key={section}
                href={`#${anchor}`}
                aria-current={
                  activeSection === section ? 'location' : undefined
                }
                className={`inline-flex min-h-[40px] items-center rounded-[8px] border px-[12px] cf-label-md transition-colors duration-state focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cf-focus motion-reduce:transition-none ${
                  activeSection === section
                    ? 'border-cf-accent bg-cf-accent-soft text-cf-accent'
                    : 'border-cf-border-control bg-cf-surface text-cf-ink hover:bg-cf-surface-subtle'
                }`}
              >
                {label}
              </a>
            ))}
          </nav>
        </header>
      )}

      {shown.includes('sources') &&
        frame(
          'sources',
          <SourcesSection
            locale={locale}
            state={stateFor('sources')}
            sources={data.sources}
            capabilities={data.sourceCapabilities}
            draftMaterial={data.sourceDraftMaterial}
            disabled={disabledFor('sources') || restrictedFor('sources')}
            actions={actions}
            onInitiated={(target) => rememberInitiator('sources', target)}
          />
        )}
      {shown.includes('provenance') &&
        frame(
          'provenance',
          <ProvenanceSection
            locale={locale}
            state={stateFor('provenance')}
            provenance={data.provenance}
            available={data.provenanceAvailable}
            contextIdValue={contextIdValue}
            onContextIdChange={onContextIdChange}
            disabled={disabledFor('provenance') || restrictedFor('provenance')}
            onInspect={actions.onInspectContext}
            onInitiated={(target) => rememberInitiator('provenance', target)}
          />
        )}
    </div>
  );
}

const sourceHealth = (
  source: ContentSourceView,
  t: typeof copy.en | typeof copy.ru
) => {
  switch (source.healthState) {
    case 'FRESH':
      return { tone: 'positive' as const, label: t.fresh };
    case 'STALE':
      return { tone: 'warning' as const, label: t.stale };
    case 'ERROR':
      return { tone: 'danger' as const, label: t.failed };
    case 'NEVER_SYNCED':
      return { tone: 'info' as const, label: t.neverSynced };
    case 'POLICY_BLOCKED':
      return { tone: 'danger' as const, label: t.policyBlocked };
  }
};

export function sourceLifecycleActions(
  source: ContentSourceView,
  capabilities: SourceCapabilitiesView
) {
  const remote = source.kind === 'URL' || source.kind === 'RSS';
  const draftConfirmed =
    source.desiredState === 'DRAFT' && source.rightsState === 'CONFIRMED';
  const remoteCapability = capabilities.directFetch && capabilities.validate;
  const allowedHealth =
    source.healthState === 'FRESH' || source.healthState === 'STALE';
  const policyAllowed =
    source.robotsState === 'ALLOWED' ||
    (source.kind === 'MANUAL' && source.robotsState === 'NOT_APPLICABLE');
  return {
    validate: remote && draftConfirmed && remoteCapability,
    activate:
      draftConfirmed &&
      Boolean(source.currentSnapshot) &&
      source.healthState === 'FRESH' &&
      policyAllowed &&
      (!remote || remoteCapability),
    sync:
      remote &&
      source.desiredState === 'ACTIVE' &&
      source.rightsState === 'CONFIRMED' &&
      Boolean(source.currentSnapshot) &&
      allowedHealth &&
      source.robotsState === 'ALLOWED' &&
      capabilities.directFetch &&
      capabilities.sync,
  };
}

function SourcesSection({
  locale,
  state,
  sources,
  capabilities,
  draftMaterial,
  disabled,
  actions,
  onInitiated,
}: {
  locale: Locale;
  state: ContentIntelligenceSurfaceState;
  sources: readonly ContentSourceView[];
  capabilities: SourceCapabilitiesView;
  draftMaterial?: SourceDraftMaterialView | null;
  disabled: boolean;
  actions: ContentIntelligenceActions;
  onInitiated: (target: HTMLElement | null) => void;
}) {
  const t = copy[locale];
  const visibleSources = state === 'empty' ? [] : sources;
  const [sourceDraft, setSourceDraft] = useState({
    kind: 'URL' as ContentSourceView['kind'],
    displayName: '',
    canonicalUrl: '',
    manualText: '',
  });
  const remoteKind = sourceDraft.kind !== 'MANUAL';
  return (
    <section
      id="source-registry"
      data-content-intelligence-section="sources"
      aria-labelledby="source-registry-title"
      className="scroll-mt-[24px] rounded-[8px] border border-cf-border bg-cf-surface p-[20px]"
    >
      <h2
        id="source-registry-title"
        tabIndex={-1}
        className="cf-heading-md text-cf-ink [text-wrap:balance]"
      >
        {t.sources}
      </h2>
      <p className="mt-[4px] max-w-[72ch] cf-body-sm text-cf-ink-muted [text-wrap:pretty]">
        {t.addSourceBody}
      </p>
      {!capabilities.directFetch && (
        <div className="mt-[12px]">
          <Notice
            tone="info"
            title={t.directFetchOff}
            body={t.directFetchOffBody}
          />
        </div>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          onInitiated(
            (event.nativeEvent as SubmitEvent).submitter as HTMLElement | null
          );
          actions.onAddSource(new FormData(event.currentTarget));
        }}
        className="mt-[16px] grid gap-x-[16px] md:grid-cols-2"
      >
        <h3 className="mb-[4px] cf-label-md text-cf-ink md:col-span-2">
          {t.addSource}
        </h3>
        <Select
          disableForm
          label={t.sourceType}
          name="kind"
          value={sourceDraft.kind}
          onChange={(event) =>
            setSourceDraft((current) => ({
              ...current,
              kind: event.target.value as ContentSourceView['kind'],
            }))
          }
          disabled={disabled}
        >
          <option value="URL">URL</option>
          <option value="RSS">RSS</option>
          <option value="MANUAL">Manual</option>
        </Select>
        <Input
          disableForm
          label={t.sourceLabel}
          name="displayName"
          value={sourceDraft.displayName}
          onChange={(event) =>
            setSourceDraft((current) => ({
              ...current,
              displayName: event.target.value,
            }))
          }
          disabled={disabled}
          required
        />
        {remoteKind ? (
          <Input
            disableForm
            fieldClassName="md:col-span-2"
            label={t.sourceUrl}
            name="canonicalUrl"
            type="url"
            inputMode="url"
            placeholder="https://example.invalid/feed"
            value={sourceDraft.canonicalUrl}
            onChange={(event) =>
              setSourceDraft((current) => ({
                ...current,
                canonicalUrl: event.target.value,
              }))
            }
            disabled={disabled}
            required
          />
        ) : (
          <Textarea
            disableForm
            fieldClassName="md:col-span-2"
            label={t.manualText}
            name="manualText"
            value={sourceDraft.manualText}
            onChange={(event) =>
              setSourceDraft((current) => ({
                ...current,
                manualText: event.target.value,
              }))
            }
            disabled={disabled}
            required
          />
        )}
        <div className="md:col-span-2">
          <Button type="submit" variant="primary" disabled={disabled}>
            {t.registerSource}
          </Button>
        </div>
      </form>

      <div className="mt-[24px] border-t border-cf-border pt-[20px]">
        {visibleSources.length === 0 ? (
          <div className="rounded-[8px] bg-cf-surface-subtle p-[16px]">
            <h3 className="cf-label-md text-cf-ink">{t.emptySources}</h3>
            <p className="mt-[4px] cf-body-sm text-cf-ink-muted [text-wrap:pretty]">
              {t.emptySourcesBody}
            </p>
            <a
              href="#source-registry-title"
              className="mt-[12px] inline-flex min-h-[40px] items-center rounded-[8px] border border-cf-border-control bg-cf-surface px-[12px] cf-label-md text-cf-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cf-focus"
            >
              {t.addSource}
            </a>
          </div>
        ) : (
          <ul className="divide-y divide-cf-border">
            {visibleSources.map((source) => {
              const health = sourceHealth(source, t);
              const archived = source.desiredState === 'ARCHIVED';
              const remote = source.kind !== 'MANUAL';
              const lifecycle = sourceLifecycleActions(source, capabilities);
              return (
                <li key={source.id} className="py-[16px]">
                  <div className="flex flex-col gap-[12px] lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-[8px]">
                        <span className="cf-caption text-cf-ink-muted">
                          {source.kind}
                        </span>
                        <h3 className="break-words cf-label-md text-cf-ink">
                          {source.displayName}
                        </h3>
                        <Status tone={health.tone}>{health.label}</Status>
                        <Status
                          tone={
                            source.rightsState === 'CONFIRMED'
                              ? 'positive'
                              : source.rightsState === 'DENIED'
                              ? 'danger'
                              : 'warning'
                          }
                        >
                          {source.rightsState === 'CONFIRMED'
                            ? t.rightsConfirmed
                            : source.rightsState === 'DENIED'
                            ? t.rightsDenied
                            : t.rightsPending}
                        </Status>
                        {source.kind === 'RSS' &&
                          source.healthState === 'POLICY_BLOCKED' && (
                            <Status tone="warning">
                              {t.ownershipRequired}
                            </Status>
                          )}
                      </div>
                      {source.canonicalUrl && (
                        <p className="mt-[8px] max-w-full break-all cf-body-sm text-cf-ink-muted">
                          {source.canonicalUrl}
                        </p>
                      )}
                      <dl className="mt-[12px] flex flex-wrap gap-x-[20px] gap-y-[8px]">
                        <div>
                          <dt className="cf-caption text-cf-ink-muted">
                            {t.snapshot}
                          </dt>
                          <dd className="mt-[4px] cf-body-sm text-cf-ink">
                            {source.currentSnapshot
                              ? `${formatDate(
                                  source.currentSnapshot.observedAt,
                                  locale
                                )} · ${source.currentSnapshot.evidenceCount}`
                              : t.noSnapshot}
                          </dd>
                        </div>
                        <div>
                          <dt className="cf-caption text-cf-ink-muted">
                            {t.nextSync}
                          </dt>
                          <dd className="mt-[4px] cf-body-sm text-cf-ink">
                            {formatDate(
                              source.currentSnapshot?.freshUntil,
                              locale
                            )}
                          </dd>
                        </div>
                      </dl>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-[8px]">
                      {source.rightsState === 'UNCONFIRMED' && (
                        <span className="flex min-h-[44px] items-center sm:min-h-0">
                          <Button
                            density="dense"
                            variant="secondary"
                            disabled={disabled || archived}
                            onClick={(event) => {
                              onInitiated(event.currentTarget);
                              actions.onConfirmSourceRights(source.id);
                            }}
                          >
                            {t.confirmRights}
                          </Button>
                        </span>
                      )}
                      {remote && (
                        <span className="flex min-h-[44px] items-center sm:min-h-0">
                          <Button
                            density="dense"
                            variant="secondary"
                            disabled={disabled || !lifecycle.validate}
                            aria-describedby={
                              !capabilities.directFetch
                                ? 'source-direct-fetch-reason'
                                : undefined
                            }
                            onClick={(event) => {
                              onInitiated(event.currentTarget);
                              actions.onValidateSource(source.id);
                            }}
                          >
                            {t.validate}
                          </Button>
                        </span>
                      )}
                      {source.desiredState === 'DRAFT' && (
                        <span className="flex min-h-[44px] items-center sm:min-h-0">
                          <Button
                            density="dense"
                            variant="secondary"
                            disabled={disabled || !lifecycle.activate}
                            aria-describedby={
                              remote && !capabilities.directFetch
                                ? 'source-direct-fetch-reason'
                                : undefined
                            }
                            onClick={(event) => {
                              onInitiated(event.currentTarget);
                              actions.onActivateSource(source.id);
                            }}
                          >
                            {t.enable}
                          </Button>
                        </span>
                      )}
                      {remote && (
                        <span className="flex min-h-[44px] items-center sm:min-h-0">
                          <Button
                            density="dense"
                            variant="quiet"
                            disabled={disabled || !lifecycle.sync}
                            aria-describedby={
                              !capabilities.directFetch
                                ? 'source-direct-fetch-reason'
                                : undefined
                            }
                            onClick={(event) => {
                              onInitiated(event.currentTarget);
                              actions.onSyncSource(source.id);
                            }}
                          >
                            {t.sync}
                          </Button>
                        </span>
                      )}
                      <span className="flex min-h-[44px] items-center sm:min-h-0">
                        <Button
                          density="dense"
                          variant="quiet"
                          disabled={
                            disabled || archived || !source.currentSnapshot
                          }
                          onClick={(event) => {
                            onInitiated(event.currentTarget);
                            actions.onCreateDraftMaterial(source.id);
                          }}
                        >
                          {t.makeDraft}
                        </Button>
                      </span>
                      <span className="flex min-h-[44px] items-center sm:min-h-0">
                        <Button
                          density="dense"
                          variant="quiet"
                          disabled={disabled || archived}
                          onClick={(event) => {
                            onInitiated(event.currentTarget);
                            actions.onRemoveSource(source.id);
                          }}
                        >
                          {t.remove}
                        </Button>
                      </span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {!capabilities.directFetch && (
        <p id="source-direct-fetch-reason" className="sr-only">
          {t.directFetchOffBody}
        </p>
      )}
      {draftMaterial && (
        <div className="mt-[20px] border-t border-cf-border pt-[20px]">
          <h3 className="cf-label-md text-cf-ink">{t.draftMaterial}</h3>
          <p className="mt-[4px] max-w-[72ch] cf-body-sm text-cf-ink-muted [text-wrap:pretty]">
            {t.draftMaterialBody}
          </p>
          <p className="mt-[8px] break-all cf-caption text-cf-ink-muted">
            {draftMaterial.trace.contractVersion} · {draftMaterial.snapshotId}
          </p>
          <ul className="mt-[8px] divide-y divide-cf-border rounded-[8px] bg-cf-surface-subtle px-[12px]">
            {draftMaterial.evidence.map((evidence) => (
              <li key={evidence.evidenceId} className="py-[12px]">
                <p className="cf-body-sm text-cf-ink [text-wrap:pretty]">
                  {evidence.excerpt}
                </p>
                <p className="mt-[4px] cf-caption text-cf-ink-muted">
                  {evidence.provenance.kind} ·{' '}
                  {evidence.provenance.retrievalProvider}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function ProvenanceSection({
  locale,
  state,
  provenance,
  available,
  contextIdValue,
  onContextIdChange,
  disabled,
  onInspect,
  onInitiated,
}: {
  locale: Locale;
  state: ContentIntelligenceSurfaceState;
  provenance: ProvenanceView;
  available: boolean;
  contextIdValue?: string;
  onContextIdChange?: (value: string) => void;
  disabled: boolean;
  onInspect: (contextId: string) => void;
  onInitiated: (target: HTMLElement | null) => void;
}) {
  const t = copy[locale];
  const [localContextId, setLocalContextId] = useState(
    provenance.contextId ?? ''
  );
  const inputContextId = contextIdValue ?? localContextId;
  const visible =
    state === 'empty'
      ? {
          ...provenance,
          contextId: null,
          facts: [],
          rejected: [],
          status: 'EMPTY' as const,
        }
      : provenance;
  return (
    <section
      id="provenance-review"
      data-content-intelligence-section="provenance"
      aria-labelledby="provenance-review-title"
      className="scroll-mt-[24px] rounded-[8px] border border-cf-border bg-cf-surface p-[20px]"
    >
      <h2
        id="provenance-review-title"
        tabIndex={-1}
        className="cf-heading-md text-cf-ink [text-wrap:balance]"
      >
        {t.contextTitle}
      </h2>
      <p className="mt-[4px] max-w-[72ch] cf-body-sm text-cf-ink-muted [text-wrap:pretty]">
        {t.contextBody}
      </p>
      <form
        className="mt-[16px] flex flex-col gap-[8px] sm:flex-row sm:items-start"
        onSubmit={(event) => {
          event.preventDefault();
          onInitiated(
            (event.nativeEvent as SubmitEvent).submitter as HTMLElement | null
          );
          onInspect(inputContextId.trim());
        }}
      >
        <Input
          disableForm
          fieldClassName="min-w-0 flex-1"
          label={t.contextId}
          name="contextId"
          value={inputContextId}
          onChange={(event) => {
            setLocalContextId(event.target.value);
            onContextIdChange?.(event.target.value);
          }}
          disabled={disabled}
          required
        />
        <Button
          type="submit"
          variant="secondary"
          disabled={disabled || !available}
          aria-describedby={
            !available ? 'context-unavailable-reason' : undefined
          }
          className="sm:mt-[24px]"
        >
          {t.inspect}
        </Button>
      </form>
      {!available && (
        <div id="context-unavailable-reason" className="mb-[12px]">
          <Notice
            tone="info"
            title={t.contextUnavailable}
            body={t.contextUnavailableBody}
          />
        </div>
      )}
      <Notice
        tone="info"
        title={t.providerNotEvidence}
        body={t.providerNotEvidenceBody}
      />

      {!visible.contextId ? (
        <div className="mt-[16px] rounded-[8px] bg-cf-surface-subtle p-[16px]">
          <h3 className="cf-label-md text-cf-ink">{t.contextEmpty}</h3>
          <p className="mt-[4px] cf-body-sm text-cf-ink-muted [text-wrap:pretty]">
            {t.contextEmptyBody}
          </p>
        </div>
      ) : (
        <div className="mt-[20px]">
          <div className="flex flex-wrap items-start justify-between gap-[12px] border-b border-cf-border pb-[16px]">
            <div>
              <p className="cf-caption text-cf-ink-muted">
                {visible.contextId}
              </p>
              <p className="mt-[4px] cf-label-md text-cf-ink">
                {t.appliedProfile}:{' '}
                {visible.profile?.mode === 'resolved'
                  ? `v${visible.profile.versionNumber}`
                  : t.neutral}
              </p>
              {visible.profile?.mode === 'resolved' && (
                <p className="mt-[4px] break-all cf-caption text-cf-ink-muted">
                  {visible.profile.versionId}
                </p>
              )}
            </div>
            <Status
              tone={
                visible.generationPolicy === 'EVIDENCE_REQUIRED'
                  ? 'danger'
                  : 'positive'
              }
            >
              {visible.generationPolicy === 'EVIDENCE_REQUIRED'
                ? t.generationBlocked
                : t.generationAllowed}
            </Status>
          </div>
          <ul className="divide-y divide-cf-border">
            {visible.facts.map((fact) => (
              <li key={fact.id} className="py-[16px]">
                <div className="flex flex-wrap items-start justify-between gap-[8px]">
                  <p className="max-w-[72ch] cf-body-md text-cf-ink [text-wrap:pretty]">
                    {fact.statement}
                  </p>
                  <Status
                    tone={
                      fact.status === 'VERIFIED'
                        ? 'positive'
                        : fact.status === 'CONFLICT'
                        ? 'warning'
                        : 'danger'
                    }
                  >
                    {fact.status === 'VERIFIED'
                      ? t.verified
                      : fact.status === 'CONFLICT'
                      ? t.conflict
                      : t.evidenceRequired}
                  </Status>
                </div>
                <p className="mt-[12px] cf-caption text-cf-ink-muted">
                  {t.evidence} {fact.evidence.length} of {fact.evidence.length}
                </p>
                <ul className="mt-[8px] divide-y divide-cf-border rounded-[8px] bg-cf-surface-subtle px-[12px]">
                  {fact.evidence.map((evidence) => (
                    <li key={evidence.id} className="py-[12px]">
                      <div className="flex flex-wrap items-center gap-[8px]">
                        <Status
                          tone={
                            evidence.relation === 'SUPPORTS'
                              ? 'positive'
                              : 'warning'
                          }
                        >
                          {evidence.relation === 'SUPPORTS'
                            ? t.supports
                            : t.contradicts}
                        </Status>
                        <span className="cf-caption text-cf-ink-muted">
                          {evidence.sourceState === 'SOURCE_REMOVED'
                            ? 'SOURCE_REMOVED'
                            : evidence.sourceLabel}
                        </span>
                      </div>
                      <p className="mt-[8px] max-w-[72ch] cf-body-sm text-cf-ink [text-wrap:pretty]">
                        {evidence.excerpt}
                      </p>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
          {visible.rejected.length > 0 && (
            <div className="border-t border-cf-border pt-[16px]">
              {visible.rejected.map((item) => (
                <p
                  key={item.label}
                  className="mt-[8px] cf-body-sm text-cf-danger"
                >
                  <span className="cf-label-md">{t.rejected}:</span>{' '}
                  {item.label} — {item.reason}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
