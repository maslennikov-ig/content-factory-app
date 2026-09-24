'use client';

import { Panel } from '@contentfactory/react/layout';
import { useCallback, useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { useVariables } from '@contentfactory/react/helpers/variable.context';
import { Button } from '@contentfactory/react/form/button';
import { Input } from '@contentfactory/react/form/input';
import { Select } from '@contentfactory/react/form/select';
import { Hint } from '@contentfactory/react/layout/hint';
import { plural } from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/plural';
import { MANUAL_CHECK_MIN_INTERVAL_MS } from '@contentfactory/nestjs-libraries/content-intelligence/leads/lead-limits';
import { useUser } from '@contentfactory/frontend/components/layout/user.context';
import { deleteDialog } from '@contentfactory/react/helpers/delete.dialog';
import { isOrganizationEditor } from '@contentfactory/nestjs-libraries/user/organization.roles';
import { Dialog } from '../ui/layers';
import { EmptyState, ErrorState, SkeletonRows, Status } from '../ui/surface';
import {
  CHECK_INTERVAL_OPTIONS,
  isTopicKind,
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
  subscriptionDraftReady,
  type CheckIntervalMinutes,
  type LeadFailure,
  type LeadRow,
  type SubscriptionDraft,
  type SubscriptionKind,
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
 * no `SourceEvidence`.
 *
 * Since `content-factory-next-tu3k.4` (06.09.2026) the lead travels with the
 * navigation instead of being left behind. The paragraph that used to stand
 * here said the Brief tab's thesis field was not prefilled because
 * `voice-brief.container.tsx` was out of that task's write zone; the Brief tab
 * now opens on the intake, whose one field takes the whole lead — title,
 * excerpt and address — and the model fills the brief from it. The lead is
 * handed over as data (`onNavigateToBrief(lead)`), not as a prefilled form:
 * what to do with it is the intake's decision, not this tab's.
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
    // content-factory-next-75xn.7: у тем свой выключатель на сервере, потому
    // что это другая исходящая связь — не чтение адреса, который назвал
    // человек, а поисковый запрос по его теме. Поэтому и предложение своё, а
    // не та же строка про ленты.
    topicCheckDisabledBanner:
      'Проверка тем выключена оператором на этом сервере. Тему можно завести заранее — она заработает сама, как только проверку включат.',
    topicBadge: 'тема',
    newSince: (count: number) => `Новое с прошлого раза · ${count}`,
    lastLookedAt: (date: string) => `заглядывали ${date}`,
    neverLookedYet: 'ещё не заглядывали',
    showDismissed: (count: number) => `Показать отклонённые (${count})`,
    hideDismissed: 'Скрыть отклонённые',
    dismissedEmpty: 'Отклонённых пока нет.',
    queueEmpty: 'Новых поводов пока нет. Продукт принесёт их при следующей проверке.',
    takeToWork: 'Взять в работу',
    declineAction: 'Не надо',
    acceptedNotice: (title: string) =>
      `«${title}» взято в работу. Открываем «Новую заготовку» — тему и причину впишите туда сами.`,
    declineFailed: 'Повод не отклонился. Попробуйте ещё раз.',
    acceptFailed: 'Повод не взялся в работу. Попробуйте ещё раз.',
    subscriptionsLabel: (count: number) => `Подписки · ${count}`,
    subscriptionsHint: 'Продукт заглядывает сам, по расписанию строки. «Проверить сейчас» не ждёт расписания.',
    checkNow: 'Проверить сейчас',
    checking: 'Проверяем…',
    // content-factory-next-75xn.23 (F2): создание подписки само делает первую
    // проверку, и минуту после неё дверь отвечает 429 CHECK_TOO_SOON. Кнопка
    // теперь молчит эту минуту сама, а надпись говорит, почему её нет смысла
    // жать: результат уже в списке. Отказ, которого человек не увидит, лучше
    // отказа, который ему объяснили.
    checkTooSoonFirst:
      'Первая проверка уже сделана, результат в списке; повторная — через минуту.',
    checkTooSoonAgain: 'Проверили только что — следующая проверка через минуту.',
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
    // content-factory-next-75xn.20 (F1): отказ по настройке — не поломка ленты.
    // Пять тем в новой области ушли в «проверка не удалась» только потому, что
    // веб-исследование не было включено, и код на экране не называл ни причину,
    // ни того, кто её может убрать.
    checkFailedByCode: {
      CONTENT_SEARCH_NOT_CONFIGURED: 'поиск не настроен: включите его в настройках ИИ',
    } as Record<string, string>,
    checkResultOk: (created: number) =>
      created > 0 ? `Готово: новых поводов — ${created}.` : 'Готово: новых поводов нет.',
    checkResultDisabled: 'Проверка выключена на этом сервере — адрес сохранён, проверить руками пока нельзя.',
    emptyEyebrow: 'Подписок пока нет',
    emptyTitle: 'Продукт может читать чужие ленты за вас и приносить поводы написать',
    benefitChooseTitle: 'Вы выбираете, что читать',
    benefitChooseBody: 'Продукт не ищет ничего сам и не берёт ни одной ленты без вашего указания.',
    benefitLeadsTitle: 'Приходят поводы, а не тексты',
    benefitLeadsBody: 'Тема, причина и фрагмент, из которого она взялась. Писать или нет — решаете вы.',
    benefitMemoryTitle: 'Отказ запоминается',
    benefitMemoryBody: 'Отклонённую тему продукт не предложит снова.',
    startHere: 'С чего начать',
    startFeedTitle: 'Лента сайта',
    startFeedRecommended: 'рекомендуем',
    startFeedBody: 'Адрес ленты блога или новостей. Один адрес приносит много материалов.',
    startFeedCta: 'Указать ленту',
    startTopicTitle: 'Тема',
    startTopicBody: 'Не адрес, а предмет: продукт ищет по нему в вебе и приносит то, что вышло за последние 30 дней.',
    startTopicCta: 'Указать тему',
    startTelegramTitle: 'Телеграм-канал',
    startTelegramOff: 'выключено на этом сервере',
    startTelegramBody: 'Публичный канал целиком. Включает оператор — от вас здесь ничего не зависит.',
    startTelegramCta: 'Указать канал',
    notFactsTitle: 'Не путать с «Откуда факты»',
    notFactsBody: 'Там — материалы, которыми подтверждают сказанное. Здесь — ленты, которые подсказывают, о чём написать. Один и тот же сайт может быть и там, и здесь.',
    dialogTitle: 'Новая подписка',
    fieldName: 'Название',
    fieldKind: 'За чем следить',
    kindFeed: 'За лентой сайта',
    kindTopic: 'За темой',
    fieldAddress: 'Адрес ленты (RSS)',
    fieldTopic: 'Тема',
    topicPlaceholder: 'например, регулирование ИИ в Европе',
    topicHint: 'Продукт ищет по теме в вебе и берёт только вышедшее за последние 30 дней. Одна тема на пространство: вторую такую же завести нельзя.',
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
    topicCheckDisabledBanner:
      'Topic checking is switched off by the operator on this server. You can still add a topic now — it starts working on its own once checking is turned on.',
    topicBadge: 'topic',
    newSince: (count: number) => `New since last time · ${count}`,
    lastLookedAt: (date: string) => `last looked ${date}`,
    neverLookedYet: 'not checked yet',
    showDismissed: (count: number) => `Show declined (${count})`,
    hideDismissed: 'Hide declined',
    dismissedEmpty: 'Nothing declined yet.',
    queueEmpty: 'No new leads yet. The product brings them on the next check.',
    takeToWork: 'Take to work',
    declineAction: 'Not now',
    acceptedNotice: (title: string) =>
      `"${title}" was taken to work. Opening New piece — fill in the thesis and reason there yourself.`,
    declineFailed: 'The lead was not declined. Try again.',
    acceptFailed: 'The lead was not taken to work. Try again.',
    subscriptionsLabel: (count: number) => `Subscriptions · ${count}`,
    subscriptionsHint: 'The product checks on the row\'s own schedule. "Check now" does not wait for it.',
    checkNow: 'Check now',
    checking: 'Checking…',
    checkTooSoonFirst:
      'The first check is already done and its result is in the list; the next one in a minute.',
    checkTooSoonAgain: 'Just checked — the next check in a minute.',
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
    checkFailedByCode: {
      CONTENT_SEARCH_NOT_CONFIGURED: 'search is not configured: turn it on in the AI settings',
    } as Record<string, string>,
    checkResultOk: (created: number) =>
      created > 0 ? `Done: ${created} new leads.` : 'Done: nothing new.',
    checkResultDisabled: 'Checking is off on this server — the address is saved; a manual check is not possible yet.',
    emptyEyebrow: 'No subscriptions yet',
    emptyTitle: 'The product can read other feeds for you and bring back reasons to write',
    benefitChooseTitle: 'You choose what it reads',
    benefitChooseBody: 'The product searches for nothing on its own and takes no feed without you naming it.',
    benefitLeadsTitle: 'Leads arrive, not text',
    benefitLeadsBody: 'A topic, a reason, and the fragment it came from. Whether to write is your call.',
    benefitMemoryTitle: 'A decline is remembered',
    benefitMemoryBody: 'A declined topic is not offered again.',
    startHere: 'Where to start',
    startFeedTitle: 'Site feed',
    startFeedRecommended: 'recommended',
    startFeedBody: 'A blog or news feed address. One address brings many items.',
    startFeedCta: 'Add a feed',
    startTopicTitle: 'Topic',
    startTopicBody: 'Not an address but a subject: the product searches the web for it and brings back what appeared in the last 30 days.',
    startTopicCta: 'Add a topic',
    startTelegramTitle: 'Telegram channel',
    startTelegramOff: 'off on this server',
    startTelegramBody: 'A whole public channel. An operator turns this on — nothing here depends on you.',
    startTelegramCta: 'Add a channel',
    notFactsTitle: 'Not the same as "Facts"',
    notFactsBody: 'That tab holds material that backs up a claim. This one holds feeds that suggest what to write about. The same site can be in both.',
    dialogTitle: 'New subscription',
    fieldName: 'Name',
    fieldKind: 'What to follow',
    kindFeed: 'A site feed',
    kindTopic: 'A topic',
    fieldAddress: 'Feed address (RSS)',
    fieldTopic: 'Topic',
    topicPlaceholder: 'for example, AI regulation in Europe',
    topicHint: 'The product searches the web for this topic and takes only what appeared in the last 30 days. One topic per workspace: a second identical one cannot be added.',
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
  checkedHereJustNow,
  now,
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
   * Whether a check is switched on *for this row's kind* on this server
   * (content-factory-next-fn33.128). With it off, `…/:id/check` answers
   * `CHECK_DISABLED` to everyone, and the button was live anyway: a person
   * pressed it, waited, and learned from the answer what the banner above the
   * list had already said. The Telegram card on this same screen had the
   * honest shape all along — disabled, with the reason beside it — and this
   * row now wears it too. Disabled rather than hidden, because the row and
   * its schedule still make sense to read.
   *
   * Since `content-factory-next-75xn.7` the flag is chosen by the caller from
   * the row's kind: `LEAD_FEED_CHECK_ENABLED` governs feeds and
   * `LEAD_TOPIC_CHECK_ENABLED` topics, and a screen reading only one of them
   * would disable a live button or offer a dead one.
   */
  checkEnabled: boolean;
  /**
   * Whether the person pressed «Проверить сейчас» on this row in this session,
   * which decides only which of the two «через минуту» sentences is true: the
   * one about the check the product made on its own when the subscription was
   * created, or the one about the check they just asked for.
   */
  checkedHereJustNow: boolean;
  /** Ticks while a row sits inside the minute, so the button comes back by itself. */
  now: number;
  onCheckNow: () => void;
  onArchive: () => void;
}) {
  const lastChecked = formatDateTime(subscription.lastCheckedAt, locale);
  const isTopic = isTopicKind(subscription.kind);
  /**
   * content-factory-next-75xn.23 (F2). Creating a subscription runs its first
   * check, and for the minute after any check `POST …/:id/check` answers 429
   * `CHECK_TOO_SOON` — so the very first thing a person did after saving a
   * topic was press a button and be refused. The window is the server's own
   * `MANUAL_CHECK_MIN_INTERVAL_MS`, read from the same constant the service
   * refuses by, so the screen and the door can never disagree about it.
   */
  const checkedAt = subscription.lastCheckedAt
    ? Date.parse(subscription.lastCheckedAt)
    : Number.NaN;
  const checkedTooRecently =
    Number.isFinite(checkedAt) && now - checkedAt < MANUAL_CHECK_MIN_INTERVAL_MS;
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
          {isTopic && <Status>{t.topicBadge}</Status>}
          {subscription.linkedAutoPost && (
            <Status tone="accent">
              {t.autopostLinked(subscription.linkedAutoPost.title || subscription.linkedAutoPost.id)}
            </Status>
          )}
        </div>
        {/*
          A topic row prints the topic, never `canonicalUrl`: that column
          holds the derived `topic://<slug>` key, which nobody typed and
          which reads as machinery rather than as what is being watched.
        */}
        <span className="break-all cf-caption text-cf-ink-muted">
          {isTopic ? subscription.query || subscription.displayName : subscription.canonicalUrl}
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
          {t.checkFailedByCode[subscription.lastErrorCode] ||
            t.checkFailedGeneric(subscription.lastErrorCode)}
        </span>
      )}
      {canManage && checkEnabled && checkedTooRecently && !busy && (
        <span
          data-content-lead-check-too-soon={subscription.id}
          className="w-full cf-caption text-cf-ink-muted"
        >
          {checkedHereJustNow ? t.checkTooSoonAgain : t.checkTooSoonFirst}
        </span>
      )}
      {canManage && (
        <div className="ml-auto flex shrink-0 gap-[8px]">
          {!checkEnabled && <Status>{t.checkOffHere}</Status>}
          <span className="flex min-h-[44px] items-center sm:min-h-0">
            <Button
              density="dense"
              variant="secondary"
              disabled={!checkEnabled || checkedTooRecently}
              loading={busy}
              loadingLabel={t.checking}
              onClick={onCheckNow}
            >
              {t.checkNow}
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
    <Panel
      data-content-lead-row={lead.id}
      data-content-lead-status={lead.status}
      as="li"
      contentPadding="snug"
      contentClassName="flex flex-col gap-[12px]"
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
    </Panel>
  );
}

/**
 * One dialog, two kinds (`content-factory-next-75xn.7`).
 *
 * Not two dialogs: the name, the schedule and the AutoPost pointer are the
 * same question for a feed and for a topic, and only one field differs — an
 * address or a subject. A second dialog would be that shared half written
 * twice, drifting apart the first time either is touched. Which kind the
 * dialog opens on comes from the card a person pressed; inside, the chooser
 * lets them change their mind without closing it.
 */
function AddSubscriptionDialog({
  open,
  openedAs,
  onClose,
  locale,
  t,
  read,
  topicCheckEnabled,
  onCreated,
}: {
  open: boolean;
  /** The kind the press implied. The person may still change it here. */
  openedAs: SubscriptionKind;
  onClose: () => void;
  locale: Locale;
  t: (typeof copy)[Locale];
  read: ReturnType<typeof jsonReader>;
  /** Only to say a saved topic will wait, never to refuse saving one. */
  topicCheckEnabled: boolean;
  onCreated: () => void;
}) {
  const [draft, setDraft] = useState<SubscriptionDraft>(() =>
    emptySubscriptionDraft(openedAs)
  );
  /**
   * The dialog is mounted while closed, so a fresh draft cannot be made at
   * mount time. Re-opening it on a different card must not leave a person on
   * the kind they chose last time — that is the one piece of state where the
   * press, not the previous session, is the answer.
   */
  const [openedFor, setOpenedFor] = useState<SubscriptionKind | null>(null);
  if (open && openedFor !== openedAs) {
    setOpenedFor(openedAs);
    setDraft(emptySubscriptionDraft(openedAs));
  }
  if (!open && openedFor !== null) setOpenedFor(null);
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
      setDraft(emptySubscriptionDraft(draft.kind));
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
            disabled={!subscriptionDraftReady(draft)}
            loading={busy}
            loadingLabel={t.saving}
            onClick={() => void submit()}
          >
            {t.save}
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
        <Select
          disableForm
          label={t.fieldKind}
          name="kind"
          value={draft.kind}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              kind: event.target.value === 'TOPIC' ? 'TOPIC' : 'RSS',
            }))
          }
          disabled={busy}
        >
          <option value="RSS">{t.kindFeed}</option>
          <option value="TOPIC">{t.kindTopic}</option>
        </Select>
        {draft.kind === 'TOPIC' ? (
          <div className="flex flex-col gap-[8px]">
            <Input
              disableForm
              label={t.fieldTopic}
              name="query"
              placeholder={t.topicPlaceholder}
              value={draft.query}
              onChange={(event) =>
                setDraft((current) => ({ ...current, query: event.target.value }))
              }
              disabled={busy}
              required
            />
            <span className="cf-caption text-cf-ink-muted [text-wrap:pretty]">
              {t.topicHint}
            </span>
            {/*
              Said here as well as above the list: a person adding a topic on
              a server with topic checking off is making a promise about the
              future, and the sentence that explains it must be where the
              decision is taken, not only where the list is read.
            */}
            {!topicCheckEnabled && (
              <span className="cf-caption text-cf-ink-muted [text-wrap:pretty]">
                {t.topicCheckDisabledBanner}
              </span>
            )}
          </div>
        ) : (
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
        )}
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
  /**
   * Where «Взять в работу» sends the person, once the lead is spent — and
   * what it hands over. The row itself, not a sentence built from it: the
   * intake decides how a lead becomes a first line, and a second opinion
   * about that here would be a second answer to the same question.
   */
  onNavigateToBrief?: (lead: LeadRow) => void;
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
  /** Which card opened the dialog, so it starts on the kind that was pressed. */
  const [dialogKind, setDialogKind] = useState<SubscriptionKind>('RSS');
  const openDialog = useCallback((kind: SubscriptionKind) => {
    setDialogKind(kind);
    setDialogOpen(true);
  }, []);
  const [busySubscriptionId, setBusySubscriptionId] = useState<string | null>(null);
  /** Rows this session pressed «Проверить сейчас» on, for the honest caption. */
  const [checkedHere, setCheckedHere] = useState<string[]>([]);
  const [busyLeadId, setBusyLeadId] = useState<string | null>(null);
  const [leadFailure, setLeadFailure] = useState<LeadFailure | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const { subscriptions: subscriptionRows, feedCheckEnabled, topicCheckEnabled } =
    readSubscriptionsEnvelope(subscriptions.data);
  const newLeads = readLeadsEnvelope(queue.data);
  const dismissedLeads = readLeadsEnvelope(dismissed.data);

  /**
   * A clock that runs only while it is needed.
   *
   * The check button is disabled for the minute after a check
   * (`MANUAL_CHECK_MIN_INTERVAL_MS`), and nothing else would re-render the row
   * when that minute is up — the person would sit in front of a dead button
   * until something else moved. The interval exists only while some row is
   * inside the window, and stops on its own when the last one leaves it.
   */
  const [now, setNow] = useState(() => Date.now());
  const insideCheckWindow = subscriptionRows.some((row) => {
    const checkedAt = row.lastCheckedAt ? Date.parse(row.lastCheckedAt) : Number.NaN;
    return Number.isFinite(checkedAt) && now - checkedAt < MANUAL_CHECK_MIN_INTERVAL_MS;
  });
  useEffect(() => {
    if (!insideCheckWindow) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [insideCheckWindow]);

  const checkNow = useCallback(
    async (id: string) => {
      setBusySubscriptionId(id);
      setCheckedHere((rows) => (rows.includes(id) ? rows : [...rows, id]));
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
        onNavigateToBrief?.(lead);
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
            <Button variant="primary" onClick={() => openDialog('RSS')}>
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

      {/*
        Shown only when the workspace actually holds a topic row. The two
        switches are independent, and a workspace watching nothing but feeds
        does not need to be told about a capability it is not using — the
        empty state's own card already says it there.
      */}
      {!topicCheckEnabled &&
        loaded &&
        !listFailure &&
        subscriptionRows.some((row) => isTopicKind(row.kind)) && (
          <p
            role="status"
            data-content-leads-topic-check-off="true"
            className="max-w-[80ch] rounded-[8px] border border-cf-border bg-cf-surface-subtle p-[12px] cf-body-sm text-cf-ink [text-wrap:pretty]"
          >
            {t.topicCheckDisabledBanner}
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
          {/*
            The shared empty state (`97dq.76`, audit §7.5): what is missing
            as its title, what a subscription would do as its line — no
            caption over a heading.
          */}
          <div className="rounded-[8px] border border-cf-border bg-cf-surface">
            <EmptyState title={t.emptyEyebrow} description={t.emptyTitle} />
          </div>
          <div className="grid grid-cols-1 gap-[16px] sm:grid-cols-3">
            <Panel
              as="div"
              contentPadding="snug"
              contentClassName="flex flex-col gap-[8px]"
            >
              <span className="cf-label-md text-cf-ink">{t.benefitChooseTitle}</span>
              <span className="cf-body-sm text-cf-ink-muted [text-wrap:pretty]">{t.benefitChooseBody}</span>
            </Panel>
            <Panel
              as="div"
              contentPadding="snug"
              contentClassName="flex flex-col gap-[8px]"
            >
              <span className="cf-label-md text-cf-ink">{t.benefitLeadsTitle}</span>
              <span className="cf-body-sm text-cf-ink-muted [text-wrap:pretty]">{t.benefitLeadsBody}</span>
            </Panel>
            <Panel
              as="div"
              contentPadding="snug"
              contentClassName="flex flex-col gap-[8px]"
            >
              <span className="cf-label-md text-cf-ink">{t.benefitMemoryTitle}</span>
              <span className="cf-body-sm text-cf-ink-muted [text-wrap:pretty]">{t.benefitMemoryBody}</span>
            </Panel>
          </div>
          <div className="flex flex-col gap-[12px]">
            <span className="cf-label-sm text-cf-ink-muted">{t.startHere}</span>
            <div className="grid grid-cols-1 gap-[12px] sm:grid-cols-2 lg:grid-cols-4">
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
                    onClick={() => openDialog('RSS')}
                  >
                    {t.startFeedCta}
                  </Button>
                </span>
              </div>
              <Panel
                data-content-leads-start-card="topic"
                as="div"
                contentPadding="snug"
                className="flex flex-col"
                contentClassName="flex flex-1 flex-col gap-[8px]"
              >
                <div className="flex flex-wrap items-center gap-[8px]">
                  <span className="cf-label-md text-cf-ink">{t.startTopicTitle}</span>
                  {/*
                    The Telegram card's own shape, for the same kind of fact:
                    a capability an operator has switched off says so where a
                    person would otherwise press. Unlike Telegram, the button
                    stays live — a topic saved now starts working by itself
                    once checking is turned on, exactly as the feed banner
                    promises for feeds.
                  */}
                  {!topicCheckEnabled && <Status>{t.startTelegramOff}</Status>}
                </div>
                <span className="cf-body-sm text-cf-ink-muted [text-wrap:pretty]">{t.startTopicBody}</span>
                <span className="mt-auto flex min-h-[44px] items-center sm:min-h-0">
                  <Button
                    variant="secondary"
                    disabled={!canManageFeeds}
                    onClick={() => openDialog('TOPIC')}
                  >
                    {t.startTopicCta}
                  </Button>
                </span>
              </Panel>
              <Panel
                as="div"
                contentPadding="snug"
                className="flex flex-col"
                contentClassName="flex flex-1 flex-col gap-[8px]"
              >
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
              </Panel>
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
              <span className="cf-label-sm text-cf-ink">{t.newSince(newLeads.length)}</span>
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
              <span className="cf-label-sm text-cf-ink">
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
                  checkEnabled={
                    isTopicKind(subscription.kind) ? topicCheckEnabled : feedCheckEnabled
                  }
                  checkedHereJustNow={checkedHere.includes(subscription.id)}
                  now={now}
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
        openedAs={dialogKind}
        onClose={() => setDialogOpen(false)}
        locale={locale}
        t={t}
        read={read}
        topicCheckEnabled={topicCheckEnabled}
        onCreated={() => void subscriptions.mutate()}
      />
    </section>
  );
}

export default ContentLeadsTab;
