'use client';

import { useCallback, useMemo, useState } from 'react';
import useSWR from 'swr';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { useVariables } from '@contentfactory/react/helpers/variable.context';
import { Button } from '@contentfactory/react/form/button';
import { Input } from '@contentfactory/react/form/input';
import { Select } from '@contentfactory/react/form/select';
import { Hint } from '@contentfactory/react/layout/hint';
import { plural } from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/plural';
import { useUser } from '@contentfactory/frontend/components/layout/user.context';
import { deleteDialog } from '@contentfactory/react/helpers/delete.dialog';
import { isOrganizationEditor } from '@contentfactory/nestjs-libraries/user/organization.roles';
import { Dialog } from '../ui/layers';
import { EmptyState, ErrorState, SkeletonRows, Status } from '../ui/surface';
import {
  CHECK_INTERVAL_OPTIONS,
  LINKABLE_AUTOPOSTS_API,
  SUBSCRIPTIONS_API,
  acceptLeadUrl,
  archiveSubscriptionUrl,
  buildSubscriptionCreatePayload,
  checkSubscriptionUrl,
  dismissLeadUrl,
  emptySubscriptionDraft,
  failureNotice,
  jsonReader,
  queueUrl,
  readFailure,
  readLeadsEnvelope,
  readLinkableAutoPosts,
  readSubscriptionsEnvelope,
  type CheckIntervalMinutes,
  type LeadFailure,
  type LeadRow,
  type SubscriptionDraft,
  type SubscriptionRow,
} from './content-leads.adapter';
import { resolveContentLocale } from './content-section.copy';

/**
 * «Откуда идеи» (`content-factory-next-odb8.3`): subscriptions and the leads
 * they bring back.
 *
 * This is the vkladka «Источники» never was, per
 * `docs/product/content-section-map.md` §5 — the radar
 * (`content-brief.radar.ts`) reads only facts and posts, and `AutoPost` drafts
 * a full post on its own hourly workflow without ever showing a person the
 * item it drafted from. Here a subscription's own check produces a *reason to
 * write*: a topic, why it fits this workspace, and the fragment it came from
 * — a person still decides. A decline is remembered structurally
 * (`ContentLeadRepository.upsertLeads` never resets an existing lead's status)
 * rather than merely by convention.
 *
 * АвтоPost втягивание: not a merge, one pointer. A subscription may name an
 * existing, active `AutoPost` row sharing its address
 * (`linkedAutoPostId`/`linkedAutoPost`), so the list can say the address
 * already drafts on its own instead of showing the same feed twice under two
 * names unaware of each other. Nothing about AutoPost's own workflow changes.
 *
 * The owner's open question — whether an accepted lead becomes material a
 * brief can cite as evidence — is unanswered on purpose. «Взять в работу»
 * marks the lead spent and opens the Brief tab; it writes no `ContentFact` and
 * no `SourceEvidence`. See the task report for why, and for what «ведущий в
 * бриф» does and does not do yet: the Brief tab's own thesis field is not
 * prefilled from here — `voice-brief.container.tsx` is outside this task's
 * write zone.
 */

type Locale = 'ru' | 'en';

const copy = {
  ru: {
    title: 'Откуда идеи',
    body: 'Ленты, которые продукт читает за вас. Он приносит поводы написать — не готовые тексты. Что взять в работу, решаете вы.',
    addSubscription: 'Добавить подписку',
    // content-factory-next-fn33.63: три двери подписок — завести, проверить,
    // архивировать — несут роль (`docs/product/roles-matrix.md`). Пользователь
    // видел живую кнопку, заполнял форму и получал 403 только после
    // «Сохранить». С 05.09.2026 порог — редактор, а не администратор
    // (`content-factory-next-fn33.90`), и надпись называет того, кого просить.
    readOnlyNote:
      'Раздел открыт на чтение: заводить и проверять ленты может редактор.',
    loading: 'Загружаем подписки',
    listFallback: 'Список не загрузился. Попробуйте ещё раз.',
    retry: 'Повторить',
    checkDisabledBanner:
      'Проверка лент выключена оператором на этом сервере. Подписку можно завести заранее — как только проверку включат, она заработает сама; до тех пор список поводов остаётся пустым.',
    newSince: (count: number) => `НОВОЕ С ПРОШЛОГО РАЗА · ${count}`,
    lastLookedAt: (date: string) => `заглядывали ${date}`,
    neverLookedYet: 'ещё не заглядывали',
    showDismissed: (count: number) => `Показать отклонённые (${count})`,
    hideDismissed: 'Скрыть отклонённые',
    dismissedEmpty: 'Отклонённых пока нет.',
    queueEmpty: 'Новых поводов пока нет. Продукт принесёт их при следующей проверке.',
    takeToWork: 'Взять в работу',
    declineAction: 'Не надо',
    acceptedNotice: (title: string) =>
      `«${title}» взято в работу. Открываем вкладку «Бриф» — тему и причину впишите туда сами.`,
    declineFailed: 'Повод не отклонился. Попробуйте ещё раз.',
    acceptFailed: 'Повод не взялся в работу. Попробуйте ещё раз.',
    subscriptionsLabel: (count: number) => `ПОДПИСКИ · ${count}`,
    subscriptionsHint: 'Продукт заглядывает сам, по расписанию строки. «Проверить сейчас» не ждёт расписания.',
    checkNow: 'Проверить сейчас',
    checking: 'Проверяем…',
    // Слово в слово как на карточке «Телеграм-канал» рядом: один и тот же
    // факт — «оператор выключил это на сервере» — должен читаться одинаково.
    checkOffHere: 'выключено на этом сервере',
    archive: 'Отписаться',
    archiveConfirm: 'Больше поводов от этой подписки не будет. Прежние остаются в списке.',
    archiveConfirmTitle: 'Отписаться от ленты?',
    archiveConfirmYes: 'Да, отписаться',
    archiveConfirmNo: 'Нет, отмена',
    // content-factory-next-fn33.54: «за месяц: 2 поводов» — число
    // подставлялось без выбора формы слова. `plural` — та же тройка форм,
    // которой уже считаются образцы манеры и шкалы разбора.
    monthStats: (total: number, accepted: number) =>
      `за месяц: ${total} ${plural(total, ['повод', 'повода', 'поводов'])}, взято ${accepted}`,
    frequency: {
      60: 'раз в час',
      360: 'раз в 6 часов',
      1440: 'раз в сутки',
    } as Record<number, string>,
    autopostLinked: (title: string) => `уже пишет черновики через AutoPost «${title}»`,
    stateErrored: 'не отвечает',
    robotsDenied: 'сайт запрещает машинное чтение (robots.txt)',
    robotsHint: 'Это факт о самом сайте, а не отказ, который вы можете обойти отсюда. Продукт проверяет запрет перед каждым чтением.',
    checkFailedGeneric: (code: string) => `последняя проверка не удалась: ${code}`,
    checkResultOk: (created: number) =>
      created > 0 ? `Готово: новых поводов — ${created}.` : 'Готово: новых поводов нет.',
    checkResultDisabled: 'Проверка выключена на этом сервере — адрес сохранён, проверить руками пока нельзя.',
    emptyEyebrow: 'ПОДПИСОК ПОКА НЕТ',
    emptyTitle: 'Продукт может читать чужие ленты за вас и приносить поводы написать',
    benefitChooseTitle: 'Вы выбираете, что читать',
    benefitChooseBody: 'Продукт не ищет ничего сам и не берёт ни одной ленты без вашего указания.',
    benefitLeadsTitle: 'Приходят поводы, а не тексты',
    benefitLeadsBody: 'Тема, причина и фрагмент, из которого она взялась. Писать или нет — решаете вы.',
    benefitMemoryTitle: 'Отказ запоминается',
    benefitMemoryBody: 'Отклонённую тему продукт не предложит снова.',
    startHere: 'С ЧЕГО НАЧАТЬ',
    startFeedTitle: 'Лента сайта',
    startFeedRecommended: 'рекомендуем',
    startFeedBody: 'Адрес ленты блога или новостей. Один адрес приносит много материалов.',
    startFeedCta: 'Указать ленту',
    startTelegramTitle: 'Телеграм-канал',
    startTelegramOff: 'выключено на этом сервере',
    startTelegramBody: 'Публичный канал целиком. Включает оператор — от вас здесь ничего не зависит.',
    startTelegramCta: 'Указать канал',
    notFactsTitle: 'Не путать с «Откуда факты»',
    notFactsBody: 'Там — материалы, которыми подтверждают сказанное. Здесь — ленты, которые подсказывают, о чём написать. Один и тот же сайт может быть и там, и здесь.',
    dialogTitle: 'Новая подписка',
    fieldName: 'Название',
    fieldAddress: 'Адрес ленты (RSS)',
    fieldFrequency: 'Как часто проверять',
    fieldLinkAutopost: 'Этот адрес уже пишет черновики через AutoPost',
    fieldLinkAutopostNone: 'нет активного AutoPost на этот адрес',
    save: 'Сохранить',
    saving: 'Сохраняем…',
    cancel: 'Отмена',
    createFailed: 'Подписка не сохранилась. Проверьте адрес и попробуйте ещё раз.',
    excerptQuote: (text: string) => `«${text}»`,
  },
  en: {
    title: 'Ideas',
    body: 'Feeds the product reads for you. It brings reasons to write — not finished text. What to take to work is your call.',
    addSubscription: 'Add subscription',
    readOnlyNote:
      'This section is read-only for you: an editor adds and checks feeds.',
    loading: 'Loading subscriptions',
    listFallback: 'The list did not load. Try again.',
    retry: 'Retry',
    checkDisabledBanner:
      'Feed checking is switched off by the operator on this server. You can still add a subscription now — it starts working on its own once checking is turned on; until then the lead queue stays empty.',
    newSince: (count: number) => `NEW SINCE LAST TIME · ${count}`,
    lastLookedAt: (date: string) => `last looked ${date}`,
    neverLookedYet: 'not checked yet',
    showDismissed: (count: number) => `Show declined (${count})`,
    hideDismissed: 'Hide declined',
    dismissedEmpty: 'Nothing declined yet.',
    queueEmpty: 'No new leads yet. The product brings them on the next check.',
    takeToWork: 'Take to work',
    declineAction: 'Not now',
    acceptedNotice: (title: string) =>
      `"${title}" was taken to work. Opening the Brief tab — fill in the thesis and reason there yourself.`,
    declineFailed: 'The lead was not declined. Try again.',
    acceptFailed: 'The lead was not taken to work. Try again.',
    subscriptionsLabel: (count: number) => `SUBSCRIPTIONS · ${count}`,
    subscriptionsHint: 'The product checks on the row\'s own schedule. "Check now" does not wait for it.',
    checkNow: 'Check now',
    checking: 'Checking…',
    checkOffHere: 'off on this server',
    archive: 'Unsubscribe',
    archiveConfirm: 'No more leads will come from this subscription. Earlier ones stay in the list.',
    archiveConfirmTitle: 'Unsubscribe from this feed?',
    archiveConfirmYes: 'Yes, unsubscribe',
    archiveConfirmNo: 'No, cancel',
    monthStats: (total: number, accepted: number) =>
      `this month: ${total} leads, ${accepted} taken`,
    frequency: {
      60: 'hourly',
      360: 'every 6 hours',
      1440: 'daily',
    } as Record<number, string>,
    autopostLinked: (title: string) => `already drafts through AutoPost "${title}"`,
    stateErrored: 'not responding',
    robotsDenied: 'the site refuses machine reading (robots.txt)',
    robotsHint: 'This is a fact about the site itself, not a refusal you can override here. The product checks the policy before every read.',
    checkFailedGeneric: (code: string) => `last check failed: ${code}`,
    checkResultOk: (created: number) =>
      created > 0 ? `Done: ${created} new leads.` : 'Done: nothing new.',
    checkResultDisabled: 'Checking is off on this server — the address is saved; a manual check is not possible yet.',
    emptyEyebrow: 'NO SUBSCRIPTIONS YET',
    emptyTitle: 'The product can read other feeds for you and bring back reasons to write',
    benefitChooseTitle: 'You choose what it reads',
    benefitChooseBody: 'The product searches for nothing on its own and takes no feed without you naming it.',
    benefitLeadsTitle: 'Leads arrive, not text',
    benefitLeadsBody: 'A topic, a reason, and the fragment it came from. Whether to write is your call.',
    benefitMemoryTitle: 'A decline is remembered',
    benefitMemoryBody: 'A declined topic is not offered again.',
    startHere: 'WHERE TO START',
    startFeedTitle: 'Site feed',
    startFeedRecommended: 'recommended',
    startFeedBody: 'A blog or news feed address. One address brings many items.',
    startFeedCta: 'Add a feed',
    startTelegramTitle: 'Telegram channel',
    startTelegramOff: 'off on this server',
    startTelegramBody: 'A whole public channel. An operator turns this on — nothing here depends on you.',
    startTelegramCta: 'Add a channel',
    notFactsTitle: 'Not the same as "Facts"',
    notFactsBody: 'That tab holds material that backs up a claim. This one holds feeds that suggest what to write about. The same site can be in both.',
    dialogTitle: 'New subscription',
    fieldName: 'Name',
    fieldAddress: 'Feed address (RSS)',
    fieldFrequency: 'How often to check',
    fieldLinkAutopost: 'This address already drafts through AutoPost',
    fieldLinkAutopostNone: 'no active AutoPost on this address',
    save: 'Save',
    saving: 'Saving…',
    cancel: 'Cancel',
    createFailed: 'The subscription was not saved. Check the address and try again.',
    excerptQuote: (text: string) => `"${text}"`,
  },
} as const;

const formatDateTime = (value: string | null, locale: Locale) =>
  value
    ? new Intl.DateTimeFormat(locale === 'ru' ? 'ru-RU' : 'en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(value))
    : null;

function SubscriptionRowView({
  subscription,
  locale,
  t,
  busy,
  canManage,
  checkEnabled,
  onCheckNow,
  onArchive,
}: {
  subscription: SubscriptionRow;
  locale: Locale;
  t: (typeof copy)[Locale];
  busy: boolean;
  /**
   * Both actions on this row are administrator doors
   * (content-factory-next-fn33.63): `…/:id/check` and `…/:id/archive` carry
   * `Sections.ADMIN`. They are hidden rather than disabled — the row is
   * still worth reading without them, and a permanently dead pair of
   * buttons on every row is noise, not information. The note above the list
   * says once who may act.
   */
  canManage: boolean;
  /**
   * `LEAD_FEED_CHECK_ENABLED` on this server (content-factory-next-fn33.128).
   * With it off, `…/:id/check` answers `CHECK_DISABLED` to everyone, and the
   * button was live anyway: a person pressed it, waited, and learned from the
   * answer what the banner above the list had already said. The Telegram card
   * on this same screen had the honest shape all along — disabled, with the
   * reason beside it — and this row now wears it too. Disabled rather than
   * hidden, because the row and its schedule still make sense to read.
   */
  checkEnabled: boolean;
  onCheckNow: () => void;
  onArchive: () => void;
}) {
  const lastChecked = formatDateTime(subscription.lastCheckedAt, locale);
  const isRobotsDenied = subscription.lastErrorCode === 'ROBOTS_DISALLOWED';
  const isErrored = subscription.state === 'ERRORED';

  return (
    <li
      data-content-lead-subscription={subscription.id}
      data-content-lead-subscription-state={subscription.state}
      className="flex flex-wrap items-center gap-[12px] py-[16px]"
    >
      <div className="flex min-w-[200px] flex-1 flex-col gap-[4px]">
        <div className="flex flex-wrap items-center gap-[8px]">
          <span className="cf-label-md text-cf-ink">{subscription.displayName}</span>
          {isErrored && !isRobotsDenied && (
            <Status tone="warning">{t.stateErrored}</Status>
          )}
          {isRobotsDenied && (
            <span className="inline-flex items-center gap-[4px]">
              <Status tone="warning">{t.robotsDenied}</Status>
              <Hint label={t.robotsDenied}>{t.robotsHint}</Hint>
            </span>
          )}
          {subscription.linkedAutoPost && (
            <Status tone="accent">
              {t.autopostLinked(subscription.linkedAutoPost.title || subscription.linkedAutoPost.id)}
            </Status>
          )}
        </div>
        <span className="break-all cf-caption text-cf-ink-muted">
          {subscription.canonicalUrl}
        </span>
      </div>
      <span className="cf-body-sm text-cf-ink-muted">
        {t.frequency[subscription.checkIntervalMinutes] || `${subscription.checkIntervalMinutes} min`}
      </span>
      <span className="cf-body-sm text-cf-ink-muted">
        {lastChecked ? t.lastLookedAt(lastChecked) : t.neverLookedYet}
      </span>
      <span className="cf-body-sm text-cf-ink-muted">
        {t.monthStats(subscription.leadsThisMonth, subscription.acceptedThisMonth)}
      </span>
      {isErrored && !isRobotsDenied && subscription.lastErrorCode && (
        <span className="w-full cf-caption text-cf-warning">
          {t.checkFailedGeneric(subscription.lastErrorCode)}
        </span>
      )}
      {canManage && (
        <div className="ml-auto flex shrink-0 gap-[8px]">
          {!checkEnabled && <Status>{t.checkOffHere}</Status>}
          <span className="flex min-h-[44px] items-center sm:min-h-0">
            <Button
              density="dense"
              variant="secondary"
              disabled={busy || !checkEnabled}
              onClick={onCheckNow}
            >
              {busy ? t.checking : t.checkNow}
            </Button>
          </span>
          <span className="flex min-h-[44px] items-center sm:min-h-0">
            <Button density="dense" variant="quiet" disabled={busy} onClick={onArchive}>
              {t.archive}
            </Button>
          </span>
        </div>
      )}
    </li>
  );
}

function LeadCardView({
  lead,
  locale,
  t,
  busy,
  onAccept,
  onDismiss,
}: {
  lead: LeadRow;
  locale: Locale;
  t: (typeof copy)[Locale];
  busy: boolean;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  const observed = formatDateTime(lead.observedAt, locale);
  const reason = locale === 'ru' ? lead.reasonRu : lead.reasonEn;
  const isNew = lead.status === 'NEW';

  return (
    <li
      data-content-lead-row={lead.id}
      data-content-lead-status={lead.status}
      className="flex flex-col gap-[12px] rounded-[8px] border border-cf-border bg-cf-surface p-[16px]"
    >
      <span className="cf-caption text-cf-ink-muted">
        {[lead.subscriptionName, observed].filter(Boolean).join(' · ')}
      </span>
      <span className="cf-heading-sm text-cf-ink [text-wrap:pretty]">{lead.title}</span>
      <span className="cf-body-sm text-cf-ink-muted [text-wrap:pretty]">{reason}</span>
      {lead.excerpt && (
        <div className="rounded-[8px] bg-cf-surface-subtle p-[12px]">
          <p className="cf-body-sm text-cf-ink [text-wrap:pretty]">
            {t.excerptQuote(lead.excerpt)}
          </p>
        </div>
      )}
      {isNew ? (
        <div className="mt-[4px] flex flex-wrap items-center gap-[8px]">
          <span className="flex min-h-[44px] items-center sm:min-h-0">
            <Button density="dense" variant="primary" disabled={busy} onClick={onAccept}>
              {t.takeToWork}
            </Button>
          </span>
          <span className="flex min-h-[44px] items-center sm:min-h-0">
            <Button density="dense" variant="secondary" disabled={busy} onClick={onDismiss}>
              {t.declineAction}
            </Button>
          </span>
        </div>
      ) : (
        <span className="cf-caption text-cf-ink-muted">
          {lead.status === 'ACCEPTED' ? t.takeToWork : t.declineAction}
        </span>
      )}
    </li>
  );
}

function AddSubscriptionDialog({
  open,
  onClose,
  locale,
  t,
  read,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  locale: Locale;
  t: (typeof copy)[Locale];
  read: ReturnType<typeof jsonReader>;
  onCreated: () => void;
}) {
  const [draft, setDraft] = useState<SubscriptionDraft>(() => emptySubscriptionDraft());
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<LeadFailure | null>(null);

  const autoposts = useSWR(open ? LINKABLE_AUTOPOSTS_API : null, () =>
    read(LINKABLE_AUTOPOSTS_API)
  );
  const linkable = readLinkableAutoPosts(autoposts.data);

  const submit = useCallback(async () => {
    setBusy(true);
    setFailure(null);
    try {
      await read(SUBSCRIPTIONS_API, {
        method: 'POST',
        body: JSON.stringify(buildSubscriptionCreatePayload(draft)),
      });
      setDraft(emptySubscriptionDraft());
      onCreated();
      onClose();
    } catch (error) {
      setFailure(readFailure(error, t.createFailed));
    } finally {
      setBusy(false);
    }
  }, [draft, read, onCreated, onClose, t.createFailed]);

  if (!open) return null;

  return (
    <Dialog
      open
      onClose={onClose}
      title={t.dialogTitle}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t.cancel}
          </Button>
          <Button
            variant="primary"
            disabled={busy || !draft.displayName.trim() || !draft.canonicalUrl.trim()}
            onClick={() => void submit()}
          >
            {busy ? t.saving : t.save}
          </Button>
        </>
      }
    >
      <form
        data-content-lead-subscription-form="true"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        className="flex flex-col gap-[16px]"
      >
        {failure && <ErrorState title={failureNotice(failure)} />}
        <Input
          disableForm
          label={t.fieldName}
          name="displayName"
          value={draft.displayName}
          onChange={(event) =>
            setDraft((current) => ({ ...current, displayName: event.target.value }))
          }
          disabled={busy}
          required
        />
        <Input
          disableForm
          label={t.fieldAddress}
          name="canonicalUrl"
          type="url"
          placeholder="https://example.com/feed"
          value={draft.canonicalUrl}
          onChange={(event) =>
            setDraft((current) => ({ ...current, canonicalUrl: event.target.value }))
          }
          disabled={busy}
          required
        />
        <Select
          disableForm
          label={t.fieldFrequency}
          name="checkIntervalMinutes"
          value={String(draft.checkIntervalMinutes)}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              checkIntervalMinutes: Number(event.target.value) as CheckIntervalMinutes,
            }))
          }
          disabled={busy}
        >
          {CHECK_INTERVAL_OPTIONS.map((minutes) => (
            <option key={minutes} value={minutes}>
              {t.frequency[minutes]}
            </option>
          ))}
        </Select>
        {linkable.length > 0 && (
          <Select
            disableForm
            label={t.fieldLinkAutopost}
            name="linkedAutoPostId"
            value={draft.linkedAutoPostId}
            onChange={(event) =>
              setDraft((current) => ({ ...current, linkedAutoPostId: event.target.value }))
            }
            disabled={busy}
          >
            <option value="">{t.fieldLinkAutopostNone}</option>
            {linkable.map((autopost) => (
              <option key={autopost.id} value={autopost.id}>
                {autopost.title || autopost.id}
              </option>
            ))}
          </Select>
        )}
      </form>
    </Dialog>
  );
}

export function ContentLeadsTab({
  onNavigateToBrief,
}: {
  /** Where «Взять в работу» sends the person, once the lead is spent. */
  onNavigateToBrief?: () => void;
} = {}) {
  const request = useFetch();
  const { language } = useVariables();
  const locale: Locale = resolveContentLocale(language);
  const t = copy[locale];
  const read = useMemo(() => jsonReader(request), [request]);

  /**
   * Navigational honesty about three administrator doors
   * (content-factory-next-fn33.63).
   *
   * `POST /leads/subscriptions`, `…/:id/check` and `…/:id/archive` all carry
   * `Sections.ADMIN`, and `docs/product/roles-matrix.md` recorded them as
   * administrator doors. An editor saw «Указать ленту» live, filled the form
   * and lost the work to a 403 on save — while «Указать канал» right beside
   * it was correctly disabled for a different reason, so the screen
   * contradicted itself.
   *
   * Since 05.09.2026 (`content-factory-next-fn33.90`) those doors carry
   * `Sections.EDITOR` instead, so the editor this defect was found under now
   * passes them and the hiding is aimed at `USER`. The threshold moved; the
   * shape of the fix did not.
   *
   * Read from the session rather than the envelope: `useUser().role` is the
   * same fact the Avatars tab and the team screen already branch on, and
   * `isOrganizationEditor` is the same helper the server's own check uses.
   * The list itself stays open — reading who is watched is not a role door.
   */
  const user = useUser();
  const canManageFeeds = isOrganizationEditor(user?.role);

  const subscriptions = useSWR(SUBSCRIPTIONS_API, () => read(SUBSCRIPTIONS_API), {
    revalidateOnFocus: false,
  });
  const queue = useSWR(queueUrl('NEW'), () => read(queueUrl('NEW')), {
    revalidateOnFocus: false,
  });

  const [showDismissed, setShowDismissed] = useState(false);
  const dismissed = useSWR(showDismissed ? queueUrl('DISMISSED') : null, () =>
    read(queueUrl('DISMISSED'))
  );

  const [dialogOpen, setDialogOpen] = useState(false);
  const [busySubscriptionId, setBusySubscriptionId] = useState<string | null>(null);
  const [busyLeadId, setBusyLeadId] = useState<string | null>(null);
  const [leadFailure, setLeadFailure] = useState<LeadFailure | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const { subscriptions: subscriptionRows, feedCheckEnabled } =
    readSubscriptionsEnvelope(subscriptions.data);
  const newLeads = readLeadsEnvelope(queue.data);
  const dismissedLeads = readLeadsEnvelope(dismissed.data);

  const checkNow = useCallback(
    async (id: string) => {
      setBusySubscriptionId(id);
      try {
        const result = await read(checkSubscriptionUrl(id), {
          method: 'POST',
          body: JSON.stringify({}),
        });
        setNotice(
          result?.checked
            ? t.checkResultOk(result?.created ?? 0)
            : t.checkResultDisabled
        );
        await Promise.all([subscriptions.mutate(), queue.mutate()]);
      } catch (error) {
        setLeadFailure(readFailure(error, t.listFallback));
      } finally {
        setBusySubscriptionId(null);
      }
    },
    [read, subscriptions, queue, t]
  );

  const archiveSubscription = useCallback(
    async (id: string) => {
      // content-factory-next-fn33.129: this was the one confirmation in the
      // interface asked with `window.confirm`. The browser's box answers in
      // the browser's language, not the interface's, ignores the product's
      // type and colour, and on a phone reads as a warning from the site.
      // `deleteDialog` is the window every other irreversible action uses.
      if (
        !(await deleteDialog(
          t.archiveConfirm,
          t.archiveConfirmYes,
          t.archiveConfirmTitle,
          t.archiveConfirmNo
        ))
      ) {
        return;
      }
      setBusySubscriptionId(id);
      try {
        await read(archiveSubscriptionUrl(id), { method: 'POST', body: JSON.stringify({}) });
        await subscriptions.mutate();
      } catch (error) {
        setLeadFailure(readFailure(error, t.listFallback));
      } finally {
        setBusySubscriptionId(null);
      }
    },
    [read, subscriptions, t]
  );

  const dismissLead = useCallback(
    async (lead: LeadRow) => {
      setBusyLeadId(lead.id);
      setLeadFailure(null);
      try {
        await read(dismissLeadUrl(lead.id), { method: 'POST', body: JSON.stringify({}) });
        await Promise.all([queue.mutate(), showDismissed ? dismissed.mutate() : Promise.resolve()]);
      } catch (error) {
        setLeadFailure(readFailure(error, t.declineFailed));
      } finally {
        setBusyLeadId(null);
      }
    },
    [read, queue, dismissed, showDismissed, t.declineFailed]
  );

  const acceptLead = useCallback(
    async (lead: LeadRow) => {
      setBusyLeadId(lead.id);
      setLeadFailure(null);
      try {
        await read(acceptLeadUrl(lead.id), { method: 'POST', body: JSON.stringify({}) });
        await queue.mutate();
        setNotice(t.acceptedNotice(lead.title));
        onNavigateToBrief?.();
      } catch (error) {
        setLeadFailure(readFailure(error, t.acceptFailed));
      } finally {
        setBusyLeadId(null);
      }
    },
    [read, queue, t, onNavigateToBrief]
  );

  const listFailure =
    subscriptions.error && !subscriptions.data
      ? readFailure(subscriptions.error, t.listFallback)
      : null;
  const loaded = !!subscriptions.data || !!subscriptions.error;

  return (
    <section
      data-content-intelligence-section="leads"
      aria-labelledby="content-leads-title"
      className="flex min-w-0 flex-col gap-[20px]"
    >
      <div className="flex flex-wrap items-start justify-between gap-[12px]">
        <div className="flex flex-col gap-[4px]">
          <h2 id="content-leads-title" tabIndex={-1} className="cf-heading-md text-cf-ink [text-wrap:balance]">
            {t.title}
          </h2>
          <p className="max-w-[72ch] cf-body-sm text-cf-ink-muted [text-wrap:pretty]">{t.body}</p>
        </div>
        {loaded && !listFailure && subscriptionRows.length > 0 && canManageFeeds && (
          <span className="flex min-h-[44px] items-center sm:min-h-0">
            <Button variant="primary" onClick={() => setDialogOpen(true)}>
              {t.addSubscription}
            </Button>
          </span>
        )}
      </div>

      {!canManageFeeds && (
        <p
          role="status"
          data-content-leads-read-only="true"
          className="max-w-[80ch] rounded-[8px] border border-cf-border bg-cf-surface-subtle p-[12px] cf-body-sm text-cf-ink [text-wrap:pretty]"
        >
          {t.readOnlyNote}
        </p>
      )}

      {!feedCheckEnabled && loaded && !listFailure && (
        <p
          role="status"
          className="max-w-[80ch] rounded-[8px] border border-cf-border bg-cf-surface-subtle p-[12px] cf-body-sm text-cf-ink [text-wrap:pretty]"
        >
          {t.checkDisabledBanner}
        </p>
      )}

      {notice && (
        <p role="status" className="max-w-[80ch] rounded-[8px] border border-cf-accent bg-cf-accent-soft p-[12px] cf-body-sm text-cf-ink [text-wrap:pretty]">
          {notice}
        </p>
      )}
      {leadFailure && <ErrorState title={failureNotice(leadFailure)} />}

      {listFailure ? (
        <ErrorState
          title={failureNotice(listFailure)}
          action={
            <Button variant="secondary" onClick={() => void subscriptions.mutate()}>
              {t.retry}
            </Button>
          }
        />
      ) : !loaded ? (
        <SkeletonRows rows={3} label={t.loading} className="[&>*]:h-[56px]" />
      ) : subscriptionRows.length === 0 ? (
        <div className="flex flex-col gap-[24px]">
          <div className="flex flex-col gap-[8px] max-w-[72ch]">
            <span className="cf-label-sm uppercase text-cf-ink-muted">{t.emptyEyebrow}</span>
            <span className="cf-heading-md text-cf-ink [text-wrap:balance]">{t.emptyTitle}</span>
          </div>
          <div className="grid grid-cols-1 gap-[16px] sm:grid-cols-3">
            <div className="flex flex-col gap-[8px] rounded-[8px] border border-cf-border bg-cf-surface p-[16px]">
              <span className="cf-label-md text-cf-ink">{t.benefitChooseTitle}</span>
              <span className="cf-body-sm text-cf-ink-muted [text-wrap:pretty]">{t.benefitChooseBody}</span>
            </div>
            <div className="flex flex-col gap-[8px] rounded-[8px] border border-cf-border bg-cf-surface p-[16px]">
              <span className="cf-label-md text-cf-ink">{t.benefitLeadsTitle}</span>
              <span className="cf-body-sm text-cf-ink-muted [text-wrap:pretty]">{t.benefitLeadsBody}</span>
            </div>
            <div className="flex flex-col gap-[8px] rounded-[8px] border border-cf-border bg-cf-surface p-[16px]">
              <span className="cf-label-md text-cf-ink">{t.benefitMemoryTitle}</span>
              <span className="cf-body-sm text-cf-ink-muted [text-wrap:pretty]">{t.benefitMemoryBody}</span>
            </div>
          </div>
          <div className="flex flex-col gap-[12px]">
            <span className="cf-label-sm uppercase text-cf-ink-muted">{t.startHere}</span>
            <div className="grid grid-cols-1 gap-[12px] sm:grid-cols-3">
              <div className="flex flex-col gap-[8px] rounded-[8px] border border-cf-accent bg-cf-surface p-[16px]">
                <div className="flex flex-wrap items-center gap-[8px]">
                  <span className="cf-label-md text-cf-ink">{t.startFeedTitle}</span>
                  <Status tone="accent">{t.startFeedRecommended}</Status>
                </div>
                <span className="cf-body-sm text-cf-ink-muted [text-wrap:pretty]">{t.startFeedBody}</span>
                <span className="mt-auto flex min-h-[44px] items-center sm:min-h-0">
                  {/*
                    Disabled rather than hidden here: this card is the empty
                    state's explanation of what a subscription is, and a
                    person who may not add one still needs the card to make
                    sense of the empty screen. The note above says who can.
                  */}
                  <Button
                    variant="primary"
                    disabled={!canManageFeeds}
                    onClick={() => setDialogOpen(true)}
                  >
                    {t.startFeedCta}
                  </Button>
                </span>
              </div>
              <div className="flex flex-col gap-[8px] rounded-[8px] border border-cf-border bg-cf-surface p-[16px]">
                <div className="flex flex-wrap items-center gap-[8px]">
                  <span className="cf-label-md text-cf-ink">{t.startTelegramTitle}</span>
                  <Status>{t.startTelegramOff}</Status>
                </div>
                <span className="cf-body-sm text-cf-ink-muted [text-wrap:pretty]">{t.startTelegramBody}</span>
                <span className="mt-auto flex min-h-[44px] items-center sm:min-h-0">
                  <Button variant="secondary" disabled>
                    {t.startTelegramCta}
                  </Button>
                </span>
              </div>
              <div className="flex flex-col gap-[8px] rounded-[8px] border border-dashed border-cf-border-strong bg-cf-surface-subtle p-[16px]">
                <span className="cf-label-md text-cf-ink">{t.notFactsTitle}</span>
                <span className="cf-body-sm text-cf-ink-muted [text-wrap:pretty]">{t.notFactsBody}</span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-[12px]">
            <div className="flex flex-wrap items-baseline gap-[12px]">
              <span className="cf-label-sm uppercase text-cf-ink">{t.newSince(newLeads.length)}</span>
              <div className="flex-1" />
              {(dismissedLeads.length > 0 || showDismissed) && (
                <Button
                  variant="quiet"
                  density="dense"
                  onClick={() => setShowDismissed((current) => !current)}
                >
                  {showDismissed ? t.hideDismissed : t.showDismissed(dismissedLeads.length)}
                </Button>
              )}
            </div>
            {newLeads.length === 0 ? (
              <EmptyState title={t.queueEmpty} />
            ) : (
              <ul className="grid grid-cols-1 gap-[16px] sm:grid-cols-2 lg:grid-cols-3">
                {newLeads.map((lead) => (
                  <LeadCardView
                    key={lead.id}
                    lead={lead}
                    locale={locale}
                    t={t}
                    busy={busyLeadId === lead.id}
                    onAccept={() => void acceptLead(lead)}
                    onDismiss={() => void dismissLead(lead)}
                  />
                ))}
              </ul>
            )}
            {showDismissed && (
              <ul className="grid grid-cols-1 gap-[16px] sm:grid-cols-2 lg:grid-cols-3">
                {dismissedLeads.length === 0 ? (
                  <EmptyState title={t.dismissedEmpty} className="col-span-full" />
                ) : (
                  dismissedLeads.map((lead) => (
                    <LeadCardView
                      key={lead.id}
                      lead={lead}
                      locale={locale}
                      t={t}
                      busy={false}
                      onAccept={() => undefined}
                      onDismiss={() => undefined}
                    />
                  ))
                )}
              </ul>
            )}
          </div>

          <div className="flex flex-col gap-[12px]">
            <div className="flex flex-wrap items-baseline gap-[12px]">
              <span className="cf-label-sm uppercase text-cf-ink">
                {t.subscriptionsLabel(subscriptionRows.length)}
              </span>
              <Hint label={t.subscriptionsLabel(subscriptionRows.length)}>{t.subscriptionsHint}</Hint>
            </div>
            <ul className="divide-y divide-cf-border rounded-[8px] border border-cf-border bg-cf-surface px-[16px]">
              {subscriptionRows.map((subscription) => (
                <SubscriptionRowView
                  key={subscription.id}
                  subscription={subscription}
                  locale={locale}
                  t={t}
                  busy={busySubscriptionId === subscription.id}
                  canManage={canManageFeeds}
                  checkEnabled={feedCheckEnabled}
                  onCheckNow={() => void checkNow(subscription.id)}
                  onArchive={() => void archiveSubscription(subscription.id)}
                />
              ))}
            </ul>
          </div>
        </>
      )}

      <AddSubscriptionDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        locale={locale}
        t={t}
        read={read}
        onCreated={() => void subscriptions.mutate()}
      />
    </section>
  );
}

export default ContentLeadsTab;
