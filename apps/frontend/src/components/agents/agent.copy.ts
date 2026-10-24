import { chatWordsFor, type ChatWords } from './agent.chats.copy';
import { resolveContentLocale } from '@contentfactory/frontend/components/content-intelligence/content-section.copy';
import { intakeCopy } from '@contentfactory/frontend/components/content-intelligence/intake/intake.copy';
import { onboardingCopy } from '@contentfactory/frontend/components/onboarding/onboarding.copy';
import { piecesCopy } from '@contentfactory/frontend/components/content-intelligence/pieces/pieces.copy';
import type { SuggestedQuestionsWords } from '@contentfactory/frontend/components/content-intelligence/intake/questions.card';
import type { AgentArtifactKind } from './agent.contract';
import type { EditorDraftWords } from './agent.handoff';
import { reviewPreviewCopy } from '@contentfactory/frontend/components/content-intelligence/pieces/review-change-preview.copy';

/**
 * Слова экрана «Агент» (`content-factory-next-kcxz.10`), два языка рядом с
 * кодом — договорённость `settings.copy.ts` и `onboarding.copy.ts`: новое
 * ложится сюда, а не в шестнадцать файлов локалей с обещанием перевода.
 *
 * Голос — продукта (PRODUCT.md, spec §1.9): «мы», «ИИ», когда исполнителя
 * надо назвать, и никогда «модель». Отказ говорит, что случилось и что
 * дальше, одной-двумя фразами.
 */
export type AgentCopyLocale = 'ru' | 'en';

/** A card that no longer waits — an approval or a question: one word for both. */
const NO_LONGER_WAITING = {
  ru: 'больше не ждёт ответа',
  en: 'no longer waiting',
} as const;

type ErrorWords = { what: string; next: string };

type AgentWords = {
  /** The language of these words; the requests they go with use it too. */
  locale: AgentCopyLocale;
  screenLabel: string;
  threads: ChatWords;
  history: {
    loading: string;
    failedTitle: string;
    failedBody: string;
    retry: string;
  };
  start: {
    title: string;
    lead: string;
    starters: {
      avatar: string;
      channel: string;
      piece: string;
      adaptation: string;
      /** The fifth step: a post into the plan as a reserve. */
      plan: string;
      /** The everyday read, once nothing is left to set up. */
      week: string;
    };
    /** No channel yet and this role cannot connect one (review W3-21 P3-2). */
    channelByAdmin: string;
  };
  conversation: {
    label: string;
    you: string;
    agent: string;
    thinking: string;
    attached: (name: string) => string;
    /** Files the composer added to an avatar's samples (`kcxz.18`). */
    samplesAdded: (name: string, accepted: number) => string;
    /** Pictures the composer put into the media library (`kcxz.25`). */
    mediaAdded: (name: string, count: number) => string;
    /** A picture shown to the AI in its message, saved nowhere (28.09). */
    pictureViewed: (name: string) => string;
    /** Forking a conversation from a message (`bxeb.2`). */
    forkFromMessage: string;
    forkThread: string;
    forking: string;
    forkFailed: string;
  };
  composer: {
    label: string;
    placeholder: string;
    placeholderBusy: string;
    signalAccepted: string;
    signalQueued: string;
    signalUnknown: string;
    sendFailed: string;
    pictureBusy: string;
    attach: string;
    attachHint: string;
    removeFile: (name: string) => string;
    send: string;
    stop: string;
    linkNote: string;
    tooMany: (max: number) => string;
    /** `kilobytes`: the limit the file broke. */
    tooBig: (name: string, kilobytes: number) => string;
    tooBigTogether: (megabytes: number) => string;
    unsupported: (name: string) => string;
    keyboard: string;
    /** A Telegram export or a document goes to the avatar's samples (`kcxz.18`). */
    samplesChip: string;
    samplesSending: string;
    samplesNotAllowed: (name: string) => string;
    samplesFailed: string;
    /** Which avatar gets the attached samples, changeable (review W3-18 F2). */
    samplesTarget: string;
    /** The workspace default, named when it is known. */
    samplesTargetDefault: (name: string | null) => string;
    /** No avatar yet: the first one takes the texts. */
    samplesTargetFirst: string;
    samplesUnnamed: string;
    /** The chosen avatar is gone; the texts went to the default one. */
    samplesFellBack: (name: string | null) => string;
    /** Uploads wait for the agent's answer to end (review W3-18 F6). */
    samplesHeld: string;
    /**
     * A picture the agent looks at (owner decision 28.09.2026): the chip's
     * path, and the line under the files — shown to the AI in this message,
     * saved nowhere.
     */
    pictureViewChip: string;
    pictureViewNote: string;
    /** For a role that may put pictures into the library: how a post gets one. */
    pictureViewNoteEditor: string;
    /** The chip's switch between the two paths, named for a screen reader. */
    pictureRoute: (name: string, toLibrary: boolean) => string;
    /** A picture goes to the media library, the message carries its id (`kcxz.25`). */
    mediaChip: string;
    /**
     * Under pictures sent to the library (review W4-25 F2): where they go,
     * who sees them, and that the AI gets only their names.
     */
    mediaNote: string;
    mediaSending: string;
    mediaFailed: string;
    /** A key pasted into the message: removed, nothing sent (`kcxz.20`). */
    keyPasted: string;
    /** Voice dictation (`bxeb.1`, `@mastra/core/voice`). */
    voiceRecord: string;
    voiceRecording: string;
    voiceCancel: string;
    voiceToText: string;
    voiceSendNow: string;
    voiceTranscribing: string;
    voiceFailed: string;
    voiceDenied: string;
  };
  card: {
    openOnScreen: string;
    openBeside: string;
    openedBeside: string;
    kinds: Record<AgentArtifactKind, string>;
    done: string;
    /** The line of something deleted later in the conversation. */
    removed: string;
    /** Open questions of a new piece, answered on its card. */
    pieceQuestions: (count: number) => string;
    /** «вариант N» of an adaptation line: the piece page's word. */
    variant: (index: number) => string;
    /** Brand voice and fact grounding score badge (`bxeb.3`). */
    voiceScoreBadge: (
      rulesMatched: number,
      rulesTotal: number,
      factsCount: number
    ) => string;
    /** Brand voice and fact grounding score tooltip (`bxeb.3`). */
    voiceScoreTitle: (
      inCorridor: number,
      total: number,
      facts: number,
      slop: number
    ) => string;
  };
  approval: {
    kind: string;
    ask: (action: string) => string;
    fallbackAction: string;
    unavailable: string;
    missingDetails: string;
    refresh: string;
    what: string;
    irreversible: string;
    irreversibleNote: string;
    reversibleNote: string;
    /** «Не надо», «Взять в работу», «Отписаться» (W4 walk P3-E). */
    dismissNote: string;
    takeNote: string;
    archiveNote: string;
    /**
     * `plan.publish_now` (`kcxz.31`, D7): not a deletion, but a post that went
     * out is not taken back from here — the heading and the footnote say so,
     * and nothing says «отменить потом».
     */
    publishHeading: string;
    publishNote: string;
    /** `plan.schedule`, `plan.move`, `plan.apply`: the way back before it goes out. */
    scheduleNote: string;
    yes: string;
    no: string;
    sending: string;
    sent: string;
    approved: string;
    /**
     * «Да» on connecting a channel (W3 walk P3-J): the chat connected nothing,
     * it showed the card the person connects on — «сделали» said otherwise.
     */
    approvedConnect: string;
    declined: string;
    /** Reloaded after the card closed elsewhere (another tab, a finished run). */
    closed: string;
  };
  question: {
    kind: string;
    /** A card further up that the server no longer waits on (`kcxz.31`, D2). */
    closed: string;
    /**
     * A proposal answered after its text changed (`kcxz.32`, N2): nothing
     * applied, nothing more spent.
     */
    stale: string;
    /**
     * `INPUT_NEEDS_PERSON` (`kcxz.31`, D1): the agent tried to answer the
     * person's questions itself and was stopped. Not a failure — a note.
     */
    yours: string;
    lead: string;
    ownAnswer: string;
    send: string;
    decide: string;
    answered: string;
    confirmed: string;
    suggested: string;
    recommended: string;
    multiple: string;
    progress: (position: number, total: number) => string;
    savedAnswers: string;
    delegated: string;
    decideRemaining: string;
    answerFailed: string;
    draftRetained: string;
    unavailable: string;
    readRange: (title: string, offset: number, characters: number) => string;
    consentLabel: string;
    /** The same tick for a brand's avatar (W3 walk P3-G). */
    consentLabelBrand: string;
    nameLabel: string;
    namePlaceholder: string;
    activate: string;
    notNow: string;
    /** Writing into an autopilot channel (`kcxz.14`): the person's «да». */
    autopilotWrite: string;
    autopilotSkip: string;
    /**
     * `media.keep` (owner decision 28.09.2026): this page puts the picture it
     * showed the agent into the library, or says it no longer holds it.
     */
    keepPicture: string;
    keepPictureSkip: string;
    keepPictureName: (name: string) => string;
    keepPictureGone: string;
    keepPictureGoneAnswer: string;
    keepPictureFailed: string;
    sending: string;
    planKind: string;
    planApprove: string;
    planReject: string;
    planFeedbackLabel: string;
    planFeedbackPlaceholder: string;
  };
  tasks: {
    kind: string;
    completed: (done: number, total: number) => string;
    statuses: Readonly<Record<'pending' | 'in_progress' | 'completed', string>>;
  };
  objective: {
    kind: string;
    statuses: Readonly<Record<'active' | 'achieved' | 'failed' | 'stopped' | 'cleared', string>>;
  };
  subagent: {
    kind: string;
    agents: Readonly<Record<'research' | 'writing' | 'review', string>>;
    statuses: Readonly<Record<'working' | 'done' | 'error', string>>;
  };
  /**
   * The adaptation interview (`kcxz.16`): the channel tab's own words, so
   * the chat asks exactly as the piece page does.
   */
  interview: Omit<SuggestedQuestionsWords, 'lead'>;
  /**
   * The plan slot card (`kcxz.16`): where one post stands. Actions and their
   * outcomes are the piece page's words (`piecesCopy`).
   */
  plan: {
    states: Readonly<Record<'reserve' | 'scheduled' | 'draft' | 'published' | 'error', string>>;
    channel: string;
    when: string;
    /**
     * A draft keeps the date its post has (`kcxz.38`): named as the draft's
     * date, never as a time it goes out.
     */
    draftWhen: string;
    draftMoment: (moment: string) => string;
    /** The piece was read and has no such post any more (`kcxz.38`, P3-3). */
    gone: string;
    reserveNote: string;
    cancelReserve: string;
    cancelling: string;
    cancelled: string;
    unschedule: string;
    unscheduling: string;
    unscheduled: string;
    failed: string;
  };
  /** The selection card (`kcxz.16`): rows to keep, several at once. */
  selection: {
    kind: string;
    preview: { summary: string; before: string; after: string };
    /** «Взять: <statement>» for a screen reader. */
    include: string;
    keep: (count: number) => string;
    /** Nothing ticked: go on without these rows. */
    keepNone: string;
    /** Status words of a row; an unknown status says nothing. */
    statuses: Readonly<Record<string, string>>;
  };
  progress: {
    kind: string;
    working: string;
    stepsLabel: string;
    leaveNote: string;
    stop: string;
    stages: {
      started: string;
      brief: string;
      claims: string;
      search: string;
      writing: string;
      done: string;
      /** The avatar's analysis (`kcxz.18`): the counting, then the AI's proposal. */
      measuring: string;
      proposing: string;
      retrying: string;
      fallback: string;
    };
  };
  error: {
    kind: string;
    generic: ErrorWords;
    /** An action refused with a reason the product has no words for. */
    refused: ErrorWords;
    network: ErrorWords;
    codes: Readonly<Record<string, ErrorWords>>;
    code: (code: string) => string;
    retry: string;
    /** The paid limit of one message under its step: a stop, not a failure (R-5). */
    paidCapNote: (title: string | null) => string;
  };
  secret: {
    kind: string;
    workspaceTitle: string;
    searchTitle: (engine: string) => string;
    workspaceLead: string;
    /** The AI key card on «Ключи системы»: saving it switches the mode. */
    workspaceLeadSystem: string;
    searchLead: string;
    /** A search key card on «Ключи системы»: the own keys sleep there. */
    searchAsleep: string;
    field: string;
    placeholder: string;
    placeholderStored: string;
    /**
     * Which provider the AI key is saved for (review W3-20 F2): read from the
     * key's prefix where it names one, else the workspace's own provider.
     */
    savesFor: (provider: string) => string;
    /** A key whose prefix names another provider or engine: not saved. */
    wrongKey: (owner: string, expected: string) => string;
    save: string;
    saving: string;
    notNow: string;
    adminOnly: string;
    notAdmin: string;
    saved: string;
    failed: string;
    continue: string;
    continueText: string;
    dismissed: string;
  };
  /**
   * Connecting a channel in the chat (`kcxz.19`): the Telegram steps are the
   * onboarding's own words (`onboardingCopy.telegram`); these frame them and
   * say the platform button and the result.
   */
  connect: {
    kind: string;
    telegramTitle: string;
    oauthTitle: (platform: string) => string;
    oauthLead: (platform: string) => string;
    oauthAction: (platform: string) => string;
    oauthFailed: string;
    /** The platform's return: the account belongs to another workspace (412). */
    returnPrecondition: string;
    /** The platform's return with its own words (406). */
    returnFailed: (message: string) => string;
    checking: string;
    connected: (name: string) => string;
    connectedLead: string;
    openChannel: string;
  };
  panel: {
    label: string;
    close: string;
    workspaceTitle: string;
    emptyLead: string;
    doInChat: string;
    loading: string;
    failed: string;
    /**
     * «Взять в работу» pressed in the ideas panel (review W4-23 F1): the
     * request put into the composer, never sent.
     */
    writeFromLead: (title: string) => string;
    /**
     * «Спросить агента» from the post window (`kcxz.28`): the request put
     * into the composer, never sent (`agent.handoff.ts`).
     */
    fromEditor: EditorDraftWords;
  };
  notifications: {
    label: string;
    empty: string;
    markAllRead: string;
    markRead: string;
    openThread: string;
  };
};

export const agentCopy: Record<AgentCopyLocale, AgentWords> = {
  ru: {
    locale: 'ru',
    screenLabel: 'ИИ-помощник',
    threads: {
      ...chatWordsFor('ru'),
      label: 'Разговоры',
      newThread: 'Новый разговор',
      untitled: 'Без названия',
      empty: 'Разговоров пока нет. Первый появится, как только вы напишете.',
      failed: 'Список разговоров не загрузился.',
      rename: 'Переименовать',
      renameLabel: 'Название разговора',
      renameSave: 'Сохранить',
      remove: 'Удалить разговор',
      removeArmed: 'Удалить насовсем?',
      actionFailed: 'Не получилось — попробуйте ещё раз.',
    },
    history: {
      loading: 'Поднимаем разговор…',
      failedTitle: 'Разговор не загрузился',
      failedBody: 'Сообщения на месте — попробуйте ещё раз.',
      // «Одно имя — один ключ»: повтор после отказа везде один.
      retry: intakeCopy.ru.retry,
    },
    start: {
      title: 'С чего начнём?',
      lead: 'Напишите своими словами или начните с шага. Что получится — откроется рядом.',
      starters: {
        avatar: 'Соберём аватар',
        channel: 'Подключим Telegram',
        piece: 'Напишем пост из одной мысли',
        adaptation: 'Сделаем адаптацию для канала',
        plan: 'Поставим пост в план бронью',
        week: 'Что у нас в плане на неделю',
      },
      channelByAdmin:
        'Каналы подключает администратор. Когда он подключит Telegram, здесь можно будет сделать адаптацию и поставить пост в план.',
    },
    conversation: {
      label: 'Разговор',
      you: 'Вы',
      agent: 'ИИ-помощник',
      thinking: 'Думаем…',
      attached: (name) => `Приложено: ${name}`,
      samplesAdded: (name, accepted) =>
        `${name} — в образцы аватара: ${accepted} ${ruPlural(accepted, 'текст', 'текста', 'текстов')}`,
      mediaAdded: (name, count) =>
        `${name} — ${count === 1 ? 'картинка' : `${count} ${ruPlural(count, 'картинка', 'картинки', 'картинок')}`} в медиатеке`,
      pictureViewed: (name) => `${name} — ИИ посмотрел, не сохранили`,
      forkFromMessage: 'Ответвить отсюда',
      forkThread: 'Клонировать разговор',
      forking: 'Создаём ветку…',
      forkFailed: 'Не удалось создать ветку диалога. Попробуйте ещё раз.',
    },
    composer: {
      label: 'Сообщение ИИ-помощнику',
      placeholder: 'Напишите, что сделать, или вставьте ссылку на пост…',
      placeholderBusy: 'Дополните задачу — учтём во время работы',
      signalAccepted: 'Дополнение принято',
      signalQueued: 'Принято после текущего ответа',
      signalUnknown: 'Не удалось подтвердить отправку. Обновите историю: задача могла быть принята.',
      sendFailed: 'Не удалось отправить. Сообщение и файлы остались в поле — попробуйте ещё раз.',
      pictureBusy: 'Картинки можно показать после текущего ответа. Сообщение и файлы остались в поле.',
      attach: 'Приложить файл',
      attachHint: 'образцы текстов, экспорт Telegram, картинки',
      removeFile: (name) => `Убрать ${name}`,
      send: 'Отправить',
      stop: 'Остановить',
      linkNote: 'Прочитаем по ссылке',
      tooMany: (max) => `Не больше ${max} файлов за раз.`,
      tooBig: (name, kilobytes) =>
        `«${name}» больше ${
          kilobytes >= 1024 ? `${kilobytes / 1024} МБ` : `${kilobytes} КБ`
        } — такой файл не приложить.`,
      tooBigTogether: (megabytes) =>
        `Вместе файлы больше ${megabytes} МБ — уберите какой-нибудь.`,
      unsupported: (name) =>
        `«${name}» не приложить: берём тексты (.txt, .md, .json), картинки, а в образцы аватара — экспорт Telegram (result.json), .docx и .pdf.`,
      keyboard: 'Enter — отправить, Shift+Enter — новая строка',
      samplesChip: 'в образцы аватара',
      samplesSending: 'Добавляем тексты в образцы аватара…',
      samplesNotAllowed: (name) =>
        `«${name}» — это образцы для аватара, а добавлять их может редактор или администратор.`,
      samplesFailed:
        'Файлы не дошли до образцов аватара. Ничего не отправили — попробуйте ещё раз.',
      samplesTarget: 'Образцы — в аватар',
      samplesTargetDefault: (name) =>
        name ? `По умолчанию — «${name}»` : 'Аватар по умолчанию',
      samplesTargetFirst: 'Образцы достанутся первому аватару пространства.',
      samplesUnnamed: 'Без имени',
      samplesFellBack: (name) =>
        `${name ? `Аватара «${name}»` : 'Выбранного аватара'} больше нет — образцы ушли в аватар по умолчанию.`,
      samplesHeld: 'Образцы отправим, когда агент закончит ответ.',
      pictureViewChip: 'ИИ посмотрит',
      pictureViewNote: 'ИИ посмотрит картинку в этом сообщении и нигде её не сохранит.',
      pictureViewNoteEditor:
        'Нужна для поста — скажите, и агент положит её в медиатеку.',
      pictureRoute: (name, toLibrary) =>
        toLibrary
          ? `«${name}» — в медиатеку. Нажмите, чтобы только показать ИИ`
          : `«${name}» — только показать ИИ. Нажмите, чтобы положить в медиатеку`,
      mediaChip: 'в медиатеку',
      mediaNote:
        'Картинки «в медиатеку» лягут в медиатеку пространства — их увидят все участники. ИИ их не увидит: только названия, чтобы поставить к посту.',
      mediaSending: 'Кладём картинки в медиатеку…',
      mediaFailed:
        'Картинки не дошли до медиатеки. Сообщение не отправили — попробуйте ещё раз.',
      keyPasted:
        'В сообщении был ключ — мы убрали его и ничего не отправили: ключи в чат не пишут. Ключ вводит администратор пространства — в карточке «Ключ» (попросите «введи ключ») или в «Настройки → ИИ».',
      voiceRecord: 'Надиктовать голосом',
      voiceRecording: 'Запись голоса',
      voiceCancel: 'Отмена',
      voiceToText: 'В текст',
      voiceSendNow: 'Отправить сразу',
      voiceTranscribing: 'Расшифровываем запись…',
      voiceFailed: 'Не удалось расшифровать запись. Попробуйте ещё раз.',
      voiceDenied: 'Нет доступа к микрофону. Разрешите микрофон в браузере.',
    },
    card: {
      openOnScreen: 'Открыть на экране',
      openBeside: 'Открыть рядом',
      openedBeside: 'открыто рядом',
      kinds: {
        workspace: 'Пространство',
        channels: 'Каналы',
        piece: 'Заготовка',
        avatar: 'Аватар',
        adaptation: 'Адаптация',
        plan: 'В плане',
        channel: 'Канал',
        ideas: 'Откуда идеи',
        facts: 'Откуда факты',
        media: 'Медиатека',
      },
      done: 'Готово',
      removed: 'удалено',
      pieceQuestions: (count) =>
        `${count} ${ruPlural(count, 'вопрос ждёт', 'вопроса ждут', 'вопросов ждут')} ответа — ответьте в чате, прежде чем делать адаптации.`,
      variant: (index) => lowerFirst(piecesCopy.ru.variant(index)),
      voiceScoreBadge: (rulesMatched, rulesTotal, factsCount) =>
        `Голос ${rulesMatched}/${rulesTotal} · Факты ${factsCount}`,
      voiceScoreTitle: (inCorridor, total, facts, slop) =>
        `Голос бренда: ${total > 0 ? `${inCorridor} из ${total} в коридоре` : 'не настроен'} · Подтверждённых фактов: ${facts}${slop > 0 ? ` · Анти-слоп: ${slop}` : ''}`,
    },
    approval: {
      kind: 'Нужно ваше «да»',
      ask: (action) => `${action}?`,
      fallbackAction: 'Сделать это',
      unavailable: 'Не удалось показать действие',
      missingDetails:
        'Не удалось проверить, что именно произойдёт. Обновите данные действия перед подтверждением.',
      refresh: 'Обновить данные действия',
      what: 'Что будет',
      irreversible: 'Не отменить',
      irreversibleNote:
        'Вернуть не получится: удалённое не восстанавливается.',
      reversibleNote: 'Выполненное действие автоматически не отменяется.',
      dismissNote: 'Отклонённый повод в очередь не вернуть — ни здесь, ни на экране.',
      takeNote: 'Взятый повод в очередь не вернуть; заготовку по нему можно удалить в «Контенте».',
      archiveNote: 'Подписаться снова можно в любой момент — подписка оживёт с прежними поводами.',
      publishHeading: 'Сразу в канал',
      publishNote:
        'Вышедший пост отсюда не снять — удалить его можно только в самом канале.',
      scheduleNote: 'До выхода пост можно снять с расписания — в чате или в календаре.',
      yes: 'Да',
      no: 'Нет',
      sending: 'Отправляем ответ',
      sent: 'ответ отправлен',
      approved: 'сделали',
      // One dash after the action, not two (W3 recheck R-8): «Подключить
      // канал — шаги на карточке ниже»; the steps card follows this line.
      approvedConnect: 'шаги на карточке ниже',
      declined: 'не стали',
      closed: NO_LONGER_WAITING.ru,
    },
    question: {
      kind: 'Уточнение',
      lead: 'Спрашиваем только то, чего в вашем тексте нет.',
      ownAnswer: 'Свой ответ',
      send: 'Ответить',
      decide: 'Решите за меня',
      answered: 'отвечено',
      confirmed: 'Так и есть',
      suggested: 'Предлагаемый ответ',
      recommended: 'Рекомендуем',
      multiple: 'Можно выбрать несколько вариантов.',
      progress: (position, total) => `Вопрос ${position} из ${total}`,
      savedAnswers: 'Сохранённые ответы',
      delegated: 'Решение передано ИИ',
      decideRemaining: 'Решите всё оставшееся за меня',
      answerFailed:
        'Получение ответа не подтверждено. Введённый текст сохранён — проверьте актуальный вопрос перед повторной отправкой.',
      draftRetained:
        'Этот вопрос уже изменился или закрыт. Ваш неотправленный ответ сохранён ниже.',
      unavailable:
        'Не удалось восстановить вопрос. Обновите разговор — ваши ответы сохранены.',
      readRange: (title, offset, characters) =>
        `Точная фраза не найдена. Читаем сохранённый фрагмент${
          title ? ` «${title}»` : ''
        }: символы ${offset + 1}–${
          offset + characters
        }. Это фрагмент источника, а не подтверждение искомой фразы.`,
      closed: NO_LONGER_WAITING.ru,
      stale: 'правка устарела, текст уже изменился — ничего не применили',
      yours:
        'Вопросы заготовки — ваши: ответьте в чате или на карточке, или скажите «Решите за меня».',
      consentLabel: 'Это моя манера — можно писать от моего имени',
      consentLabelBrand: 'Это голос нашего бренда — можно писать от его имени',
      nameLabel: 'Имя аватара',
      namePlaceholder: 'Например, Игорь',
      activate: 'Включить аватар',
      notNow: 'Не сейчас',
      autopilotWrite: 'Да, писать',
      autopilotSkip: 'Не писать',
      keepPicture: 'В медиатеку',
      keepPictureSkip: 'Не надо',
      keepPictureName: (name) => `Картинка «${name}»`,
      keepPictureGone:
        'Этой картинки на странице уже нет — после перезагрузки она не хранится. Приложите её ещё раз.',
      keepPictureGoneAnswer: 'Понятно',
      keepPictureFailed: 'Картинка не дошла до медиатеки. Попробуйте ещё раз.',
      sending: 'Отправляем ответ',
      planKind: 'План',
      planApprove: 'Согласовать план',
      planReject: 'Поправить план',
      planFeedbackLabel: 'Комментарий или правки к плану',
      planFeedbackPlaceholder: 'Что изменить или уточнить…',
    },
    tasks: {
      kind: 'Задачи',
      completed: (done, total) => `${done} из ${total}`,
      statuses: {
        pending: 'ожидает',
        in_progress: 'в работе',
        completed: 'готово',
      },
    },
    objective: {
      kind: 'Цель',
      statuses: {
        active: 'в работе',
        achieved: 'выполнено',
        failed: 'не получилось',
        stopped: 'остановлено',
        cleared: 'снято',
      },
    },
    subagent: {
      kind: 'Специалист',
      agents: {
        research: 'Поиск и разбор фактов',
        writing: 'Написание и переработка текста',
        review: 'Проверка и редактура',
      },
      statuses: {
        working: 'в работе',
        done: 'готово',
        error: 'не получилось',
      },
    },
    selection: {
      kind: 'Выбор',
      preview: reviewPreviewCopy.ru,
      include: 'Взять',
      keep: (count) => `Оставить выбранные · ${count}`,
      keepNone: 'Продолжить без них',
      // The piece page's words, not a second set: fact states from the entry
      // screen's table, the typo mark from the review of an adaptation.
      statuses: selectionStatuses('ru', 'правка'),
    },
    interview: interviewWords('ru'),
    plan: planWords('ru', {
      reserve: 'В плане',
      scheduled: 'В очереди · выйдет сама',
      channel: 'Канал',
      when: 'Время',
      draftWhen: 'Дата',
      draftMoment: (moment) => `Дата ${moment}`,
      gone: 'Этого поста больше нет',
      reserveNote: 'Сама не выйдет: это бронь. Подтвердить или сменить время — на экране заготовки.',
      cancelReserve: 'Отменить бронь',
      cancelling: 'Снимаем бронь',
      cancelled: 'Бронь снята, пост остался черновиком.',
    }),
    progress: {
      kind: 'Работаем',
      working: 'Работаем…',
      stepsLabel: 'Шаги',
      leaveNote: 'Можно уйти с экрана — доделаем сами',
      stop: 'Остановить',
      stages: {
        started: 'Читаем…',
        brief: 'Собираем бриф…',
        claims: 'Разбираем утверждения…',
        search: 'Ищем недостающие факты…',
        writing: 'Пишем…',
        done: 'Готово',
        measuring: 'Считаем длину фраз, пунктуацию и повторы…',
        proposing: 'Составляем предложение голоса…',
        retrying: 'Связь мигнула — повторяем шаг…',
        fallback: 'Переключаемся на резервный ИИ…',
      },
    },
    error: {
      paidCapNote: (title) =>
        `${title ? `${title} — ` : ''}шаг остановлен ограничением старой версии помощника. Проверьте сохранённые результаты перед продолжением.`,
      kind: 'Не получилось',
      generic: {
        what: 'Не получилось довести до конца.',
        next: 'Попробуйте ещё раз — обычно этого хватает.',
      },
      refused: {
        what: 'Это действие не выполнено.',
        next: 'Почему и что можно сделать — в ответе ниже.',
      },
      network: {
        what: 'Связь прервалась, ответ не дошёл.',
        next: 'Проверьте соединение и попробуйте ещё раз.',
      },
      codes: {
        CAPABILITY_RESULT_UNAVAILABLE: {
          what: 'Полученный результат не удалось надёжно сохранить.',
          next: 'Сохранённые материалы не изменены. Проверьте доступность хранилища и повторите чтение.',
        },
        VIDEO_PREFLIGHT_STALE: {
          what: 'Согласование видео устарело или сценарий изменился.',
          next: 'Откройте сохранённый сценарий и заново проверьте параметры и цену.',
        },
        VIDEO_REQUEST_NOT_AUTHORED: {
          what: 'Не удалось подтвердить ваше сообщение с запросом на видео.',
          next: 'Отправьте запрос на создание видео в этом чате и подтвердите сохранённый сценарий.',
        },
        AGENT_FAILED: {
          what: 'Не получилось довести до конца.',
          next: 'Попробуйте ещё раз — обычно этого хватает.',
        },
        AI_PROVIDER_UNAVAILABLE: {
          what: 'ИИ пока не подключён: нет ни включённого лимита, ни ключа пространства.',
          next: 'Администратор подключает его в «Настройки → Глобальные настройки».',
        },
        AI_PROVIDER_PAYMENT_REQUIRED: {
          what: 'Провайдер ИИ отклонил запрос из-за баланса или лимита ключа.',
          next: 'Администратор проверяет баланс и лимит ключа у провайдера. После изменения можно повторить запрос.',
        },
        AI_ALLOWANCE_EXHAUSTED: {
          what: 'Обращения к ИИ в этом месяце закончились.',
          next: 'Дождитесь обновления лимита или выберите ключ пространства в настройках.',
        },
        AI_PROVIDER_BUSY: {
          what: 'ИИ сейчас перегружен.',
          next: 'Попробуйте через минуту.',
        },
        AI_PROVIDER_TIMEOUT: {
          what: 'ИИ не ответил вовремя.',
          next: 'Попробуйте ещё раз — обычно этого хватает.',
        },
        AGENT_PICTURE_NOT_SEEN: {
          what: 'ИИ не смог посмотреть картинку: подключённый ИИ не принимает картинки или не этот формат.',
          next: 'Опишите картинку словами или отправьте её «в медиатеку». Администратор может выбрать в «Настройки → ИИ» такой ИИ, который видит картинки.',
        },
        AGENT_BLOCKED: {
          what: 'Остановились: в сообщении что-то похожее на ключ или пароль.',
          next: 'Ключи вводятся в карточке ключа, не в чат. Уберите его и отправьте ещё раз.',
        },
        AGENT_RUN_NOT_PENDING: {
          what: 'Этот вопрос уже закрыт — ответ не нужен.',
          next: 'Продолжайте разговор.',
        },
        AGENT_QUESTION_STALE: {
          what: 'Материал или вопросы уже изменились. Ответ не применён.',
          next: 'Откройте актуальную заготовку или остановите задачу. Ваш неотправленный текст сохранён в карточке вопроса.',
        },
        MATERIAL_PASSAGE_NOT_FOUND: {
          what: 'Точная фраза не найдена в сохранённом источнике.',
          next: 'Уточните фразу или прочитайте доступный фрагмент источника.',
        },
        AGENT_BAD_REQUEST: {
          what: 'Сообщение не дошло в понятном виде.',
          next: 'Обновите страницу и отправьте ещё раз.',
        },
        AGENT_NOT_YOURS: {
          what: 'Это чужой разговор: у каждого в пространстве свои.',
          next: 'Начните новый разговор.',
        },
        ai_rate_limited: {
          what: 'Слишком много сообщений подряд.',
          next: 'Подождите минуту и отправьте ещё раз.',
        },
        CAPABILITY_INPUT_INVALID: {
          what: 'Параметры действия не подошли. Действие не выполнялось.',
          next: 'Помощник может исправить параметры в этом же сообщении.',
        },
        PERMISSION_DENIED: {
          what: 'У вашей роли нет права на это действие.',
          next: 'Попросите администратора пространства.',
        },
        MATERIAL_NOT_AVAILABLE: { what: 'Материал или его версия больше недоступны.', next: 'Выберите доступный материал в карточке.',
        },
        MATERIAL_STALE: { what: 'Материал изменился во время чтения.', next: 'Помощник прочитает текущую версию заново.',
        },
        AGENT_TASK_OPERATION_IN_FLIGHT: { what: 'Предыдущий шаг ещё выполняется.', next: 'Дождитесь результата перед следующим действием.',
        },
        AGENT_TASK_OPERATION_FAILED: { what: 'Шаг завершился с ошибкой; вся задача ещё не выполнена.', next: 'Проверьте сохранённый результат перед повтором.',
        },
        AGENT_TASK_TIME_BUDGET: { what: 'Задача заняла отведённое время; часть работы осталась.', next: 'Сохранённые результаты доступны. Помощник укажет, что осталось.',
        },
        AGENT_TASK_TOKEN_BUDGET: { what: 'Достигнут настроенный предел объёма работы.', next: 'Проверьте результаты и оставшиеся шаги перед продолжением.',
        },
        AGENT_TASK_COST_BUDGET: { what: 'Достигнут настроенный предел расходов на задачу.', next: 'Проверьте расходы и оставшуюся работу перед продолжением.',
        },
        AGENT_TASK_COST_UNKNOWN: { what: 'Не удалось подтвердить стоимость выполненного шага.', next: 'Проверьте расход и сохранённый результат перед повтором.',
        },
        AGENT_TASK_UNCERTAIN: { what: 'Результат платного шага пока не подтверждён.', next: 'Сначала проверьте сохранённый результат: повтор может создать дубликат.',
        },
        AGENT_TASK_NO_PROGRESS: { what: 'Повторные действия не дали новых результатов.', next: 'Помощник объяснит пробел и предложит другой способ продолжить.',
        },
        AGENT_TASK_EMERGENCY_FUSE: { what: 'Длинная цепочка остановлена; задача ещё не завершена.', next: 'Проверьте полученные результаты и оставшиеся шаги.',
        },
        AGENT_TASK_STOPPED: { what: 'Выполнение остановлено. Уже сохранённые результаты доступны.', next: 'Проверьте их перед продолжением.',
        },
        PAID_CAP_REACHED: {
          what: 'Этот шаг остановлен ограничением старой версии помощника.',
          next: 'Проверьте сохранённые результаты перед продолжением.',
        },
        APPROVAL_MISMATCH: {
          what: 'Ваше «да» было для другого действия — ничего не сделали.',
          next: 'Попросите ещё раз, мы спросим заново.',
        },
        INPUT_NEEDS_PERSON: {
          what: 'На этот вопрос отвечает только человек.',
          next: 'Ответьте в карточке уточнения.',
        },
        APPROVAL_CONTENT_CHANGED: {
          what: 'Текст поста изменился после вашего «Да» — ничего не отправили.',
          next: 'Покажу заново: подтвердите, если новый текст подходит.',
        },
        PROPOSAL_CARD_OPEN: {
          what: 'Правки к этому тексту уже ждут на карточке выше — заново не запускали и ничего не потратили.',
          next: 'Отметьте нужные правки на той карточке или продолжите без них.',
        },
        CONFIRMATION_INVALID: {
          what: 'Подтверждение не подошло к этому действию — ничего не сделали.',
          next: 'Спрошу заново: ответьте «да», если согласны.',
        },
        CONFIRMATION_UNAVAILABLE: {
          what: 'Не получилось проверить подтверждение — ничего не сделали.',
          next: 'Попробуйте ещё раз через минуту.',
        },
        PIECE_NOT_FOUND: {
          what: 'Такой заготовки нет — возможно, её удалили.',
          next: 'Откройте «Контент» и выберите другую.',
        },
        PIECE_AVATAR_NOT_READY: {
          what: 'У аватара ещё нет голоса — писать от его имени нечем.',
          next: 'Закончите аватар или пишите без него.',
        },
        VOICE_RIGHTS_REQUIRED: {
          what: 'Без вашего согласия аватар не включается.',
          next: 'Отметьте согласие в карточке аватара.',
        },
        VOICE_FIELDS_INCOMPLETE: {
          what: 'Аватар ещё не готов: заполнены не все его строки.',
          next: 'Напишите недостающие строки здесь, в чате, или на экране аватара — потом включим.',
        },
        VOICE_PROFILE_NOT_FOUND: {
          what: 'Включать пока нечего: у аватара нет ни разбора, ни заполненных строк.',
          next: 'Добавьте образцы своих текстов или заполните строки вручную.',
        },
        VOICE_FORBIDDEN: {
          what: 'Менять аватары может редактор или администратор.',
          next: 'Попросите их — а посмотреть аватар на экране может каждый.',
        },
        VOICE_REFERENCE_DISABLED: {
          what: 'В этом пространстве путь «по образцу чужого стиля» выключен.',
          next: 'Добавьте свои тексты или заполните строки вручную.',
        },
        VOICE_VERSION_NOT_FOUND: {
          what: 'Такой версии голоса нет.',
          next: 'Откройте версии на экране аватара.',
        },
        VOICE_VERSION_CONFLICT: {
          what: 'Голос аватара только что изменили в другом месте — ничего не перезаписали.',
          next: 'Откройте аватар заново и повторите.',
        },
        VOICE_SAMPLE_NOT_FOUND: {
          what: 'Такого образца нет — возможно, его уже удалили.',
          next: 'Посмотрите список образцов аватара.',
        },
        VOICE_SAMPLE_UNREADABLE: {
          what: 'Этот текст не прочитался как образец.',
          next: 'Вставьте его обычным текстом или приложите другой файл.',
        },
        VOICE_UPLOAD_REJECTED: {
          what: 'Файлы не приняли: их слишком много или они слишком большие сразу.',
          next: 'Отправьте их по частям — до 10 файлов и 40 МБ за раз.',
        },
        VOICE_PAYLOAD_TOO_LARGE: {
          what: 'Слишком много текста за один раз.',
          next: 'Разделите вставку на несколько сообщений.',
        },
        VOICE_ANALYSIS_FAILED: {
          what: 'Разбор не удалось завершить.',
          next: 'Попробуйте ещё раз чуть позже.',
        },
        VOICE_ANALYSIS_RUNNING: {
          what: 'Разбор этого аватара уже идёт — на экране аватара или в другом чате. Второй не запускали, ничего не потратили.',
          next: 'Загляните через несколько минут — результат появится сам.',
        },
        VOICE_ASSIST_UNAVAILABLE: {
          what: 'ИИ не ответил — предложение голоса не составлено. Числа разбора сохранены.',
          next: 'Запустите разбор ещё раз, когда будете готовы: это около пяти минут.',
        },
        VOICE_ASSIST_UNGROUNDED: {
          what: 'ИИ предложил строки, которые не опираются на ваши тексты, — мы их не взяли.',
          next: 'Запустите разбор ещё раз или заполните строки вручную.',
        },
        VOICE_AVATAR_NOT_FOUND: {
          what: 'Такого аватара нет — возможно, его удалили.',
          next: 'Посмотрите список аватаров.',
        },
        VOICE_AVATAR_LIMIT: {
          what: 'Аватаров уже столько, сколько можно в одном пространстве.',
          next: 'Удалите ненужный или переименуйте существующий.',
        },
        VOICE_AVATAR_NOT_ANALYSED: {
          what: 'Этот аватар ещё не пишет: у него нет включённого голоса.',
          next: 'Сначала разберите образцы или заполните строки и включите его.',
        },
        VOICE_AVATAR_SUCCESSOR_REQUIRED: {
          what: 'Этот аватар пишет по умолчанию — без преемника его не удалить.',
          next: 'Назовите аватар, который его заменит.',
        },
        VOICE_LEARN_NOT_ENOUGH: {
          what: 'Правок пока мало, чтобы учиться: одна-две — это настроение, а не привычка.',
          next: 'Поправьте ещё несколько черновиков этого аватара.',
        },
        VOICE_LEARN_UNAVAILABLE: {
          what: 'Обучение на правках сейчас недоступно.',
          next: 'Попробуйте позже.',
        },
        VOICE_LEARN_RULE_NOT_FOUND: {
          what: 'Такого правила у аватара нет — возможно, его уже забыли.',
          next: 'Посмотрите, чему аватар научился.',
        },
        AI_PROVIDER_REJECTED: {
          what: 'ИИ отказался отвечать: настройки ИИ пространства не подходят.',
          next: 'Администратор проверяет выбранный ИИ и ключ в «Настройки → ИИ». Повтор не поможет.',
        },
        CAPABILITY_FAILED: {
          what: 'Это действие сейчас не получилось.',
          next: 'Попробуйте ещё раз чуть позже или сделайте это на экране продукта.',
        },
        INTAKE_FAILED: {
          what: 'Заготовка не написалась.',
          next: 'Попробуйте ещё раз или начните её в «Контенте».',
        },
        CHANNEL_NOT_FOUND: {
          what: 'Такого канала в пространстве нет — возможно, его уже удалили.',
          next: 'Посмотрите список каналов.',
        },
        CHANNEL_WRITING_PROFILE_INVALID: {
          what: 'Карточка канала не сохранилась: площадка не примет такие правила.',
          next: 'Назовите другую длину или другой аватар — остальное осталось как было.',
        },
        CHANNEL_WRITING_EMPTY: {
          what: 'Не названо, что поменять в карточке канала.',
          next: 'Скажите, что писать иначе: длину, эмодзи, ссылки, хэштеги, призыв, аватар или обращение.',
        },
        CHANNEL_PROVIDER_UNKNOWN: {
          what: 'Такой площадки у нас нет.',
          next: 'Список площадок — на экране «Каналы».',
        },
        CHANNEL_CONNECT_ON_SCREEN: {
          what: 'Эта площадка подключается через свою форму.',
          next: 'Подключите её на экране «Каналы».',
        },
        CHANNEL_BOT_RENAME_UNSUPPORTED: {
          what: 'Эта площадка не даёт переименовать бота отсюда.',
          next: 'Имя бота меняется в настройках самой площадки.',
        },
        // Настройки ИИ из чата (kcxz.20).
        AI_SEARCH_KEY_ON_SYSTEM_KEYS: {
          what: 'На «Ключах системы» поиск идёт на ключах системы — свой ключ поиска здесь не нужен.',
          next: 'Он понадобится, если перейти на «Свой ключ».',
        },
        AI_KEYS_ON_SYSTEM_KEYS: {
          what: 'На «Ключах системы» свои ключи спят, и отсюда их не удаляют.',
          next: 'Перейдите на «Свой ключ», если нужно убрать ключ.',
        },
        AI_KEY_NOT_STORED: {
          what: 'Такого ключа не сохранено — удалять нечего.',
          next: 'Посмотрите, какие ключи сохранены, в «Настройки → ИИ».',
        },
        AI_SYSTEM_KEYS_UNAVAILABLE: {
          what: 'Ключи системы на этом сервере не настроены.',
          next: 'Пространство остаётся на своём ключе.',
        },
        // «Откуда идеи» из чата (kcxz.23).
        SUBSCRIPTION_NOT_FOUND: {
          what: 'Такой подписки в пространстве нет — возможно, от неё уже отписались.',
          next: 'Посмотрите список в «Откуда идеи».',
        },
        SUBSCRIPTION_CONFLICT: {
          what: 'На это уже есть подписка — вторую не заводили.',
          next: 'Поводы от неё приходят в тот же список.',
        },
        SUBSCRIPTION_LIMIT: {
          what: 'Подписок уже столько, сколько можно в одном пространстве.',
          next: 'Отпишитесь от ненужной и добавьте новую.',
        },
        CHECK_TOO_SOON: {
          what: 'Эту подписку проверяли меньше минуты назад — заново не проверяли и ничего не потратили.',
          next: 'Подождите минуту и попросите ещё раз.',
        },
        LEAD_NOT_FOUND: {
          what: 'Такого повода в пространстве нет.',
          next: 'Посмотрите поводы в «Откуда идеи».',
        },
        LEAD_NOT_NEW: {
          what: 'Этот повод уже разобран: его взяли в работу или отклонили.',
          next: 'Выберите другой из новых поводов.',
        },
        INVALID_URL: {
          what: 'Этот адрес не подходит для подписки.',
          next: 'Пришлите адрес ленты целиком, с https://.',
        },
        INVALID_TOPIC: {
          what: 'Тема пустая или слишком длинная — до 200 знаков.',
          next: 'Назовите тему короче.',
        },
        IDEAS_LEAD_NOT_TAKEN: {
          what: 'Этот повод ещё не взят в работу — заготовку не писали и ничего не потратили.',
          next: 'Скажите «возьми в работу» — возьмём и сразу напишем.',
        },
        INTAKE_RESEARCH_SNAPSHOT_REQUIRED: {
          what: 'Не указано сохранённое исследование для выбранных цитат.',
          next: 'Помощник может выбрать доступное исследование и продолжить.',
        },
        INTAKE_RESEARCH_SNAPSHOT_UNAVAILABLE: {
          what: 'Сохранённое исследование больше недоступно для этого разговора.',
          next: 'Найдём источники заново или используем доступную заготовку.',
        },
        INTAKE_RESEARCH_SELECTION_INVALID: {
          what: 'Выбранные сведения не совпадают с сохранёнными источниками.',
          next: 'Проверим цитаты и выберем подтверждённые сведения.',
        },
        INTAKE_RESEARCH_STORAGE_UNAVAILABLE: {
          what: 'Не удалось сохранить исследование для продолжения.',
          next: 'Попробуйте позже: заготовка ещё не создана.',
        },
        INTAKE_RESEARCH_EVIDENCE_MISMATCH: {
          what: 'В сохранённом источнике нет выбранной цитаты.',
          next: 'Проверим источник, прежде чем использовать это утверждение.',
        },
        INTAKE_RESEARCH_INCOMPLETE: {
          what: 'Найденных сведений пока недостаточно для заготовки.',
          next: 'Уточним поиск или обозначим недостающие сведения.',
        },
        INTAKE_RESEARCH_SELECTION_REQUIRES_PERSON: {
          what: 'Для этого исследования нужен ваш выбор фактов.',
          next: 'Продолжим после вашего явного выбора фактов.',
        },
        INTAKE_RESEARCH_CONTINUATION_PENDING: {
          what: 'Создание по этому исследованию уже началось, результат пока не подтверждён.',
          next: 'Проверим сохранённую заготовку, чтобы не создать её повторно.',
        },
        CONTENT_ADAPTATION_INCOMPLETE: {
          what: 'Адаптация пока не готова: не удалось сохранить весь нужный смысл с опорой на источники и в пределах длины.',
          next: 'Покажем, чего не хватает, и уточним материал перед следующей попыткой.',
        },
        INTAKE_REQUEST_NOT_AUTHORED: {
          what: 'Не удалось подтвердить исходный запрос в этом чате.',
          next: 'Вернёмся к вашему сообщению и продолжим с его исходным текстом.',
        },
        INTAKE_TEXT_MISSING: {
          what: 'Писать заготовку не из чего: нет ни слов, ни повода.',
          next: 'Напишите мысль или назовите повод.',
        },
        INTAKE_TEXT_TOO_LONG: {
          what: 'Вместе с поводом текст длиннее, чем читает заготовка, — не писали и ничего не потратили.',
          next: 'Сократите то, что добавили к поводу.',
        },
        // Факты, свои тексты и аналитика из чата (kcxz.24).
        FACT_NOT_FOUND: {
          what: 'Такого факта в пространстве нет.',
          next: 'Посмотрите факты в «Откуда факты».',
        },
        FACT_STATEMENT_EMPTY: {
          what: 'В факте нет ни слов, ни чисел — ничего не добавили.',
          next: 'Напишите факт словами: цену, срок или цифру.',
        },
        CONTENT_CONTEXT_FACT_SUPERSEDED: {
          what: 'Этот факт заменён исправленной копией и уже не в работе — старый не снимают и не возвращают, ничего не изменилось.',
          next: 'В работе остаётся копия; её видно в «Откуда факты».',
        },
        FACT_DATE_INVALID: {
          what: 'Такой даты нет в календаре — факт не добавили.',
          next: 'Назовите день, до которого факт верен.',
        },
        FACT_DATE_PAST: {
          what: 'Этот день уже прошёл — факт сразу устарел бы, поэтому его не добавили.',
          next: 'Назовите день, который ещё не наступил, или добавьте факт без срока.',
        },
        FACT_REMOVED: {
          what: 'Этот факт удалён из пространства насовсем — заново его не добавляют, ничего не изменилось.',
          next: 'Сформулируйте факт по-новому, если он снова верен.',
        },
        CONTENT_CONTEXT_NOT_FOUND: {
          what: 'Факт изменился или пропал, пока шёл запрос, — ничего не сделали.',
          next: 'Посмотрите факты в «Откуда факты» и попросите ещё раз.',
        },
        CONTENT_CONTEXT_INPUT_INVALID: {
          what: 'В факте неверная дата или нет самого утверждения — ничего не добавили.',
          next: 'Проверьте формулировку и дату.',
        },
        ANALYTICS_NOT_AVAILABLE: {
          what: 'Эта площадка не отдаёт аналитику аудитории.',
          next: 'Что вышло и что не вышло, видно в «Производство».',
        },
        ANALYTICS_CHANNEL_OFF: {
          what: 'Канал выключен, ждёт переподключения или его подключение не закончено — площадку не спрашивали.',
          next: 'Включите, переподключите или допройдите подключение канала в «Каналы».',
        },
        ANALYTICS_CHANNEL_NEEDS_RECONNECT: {
          what: 'Доступ канала к площадке истёк. Из чата его не обновляли, канал не трогали.',
          next: 'Откройте «Аналитика» или переподключите канал в «Каналы».',
        },
        ANALYTICS_UNAVAILABLE: {
          what: 'Площадка сейчас не ответила. Это не «ноль активности» — данных просто нет.',
          next: 'Попросите позже или откройте «Аналитика».',
        },
        // Медиа из чата (kcxz.25).
        MEDIA_PROMPT_MISSING: {
          what: 'Рисовать не из чего: нет ни слов о картинке, ни текста поста — ничего не потратили.',
          next: 'Скажите, что на картинке, или назовите пост, к которому она.',
        },
        MEDIA_IMAGE_CREDITS_EXHAUSTED: {
          what: 'Картинки по тарифу в этом месяце закончились — ничего не нарисовали и не потратили.',
          next: 'Возьмите картинку из медиатеки или приложите свою.',
        },
        MEDIA_IMAGE_REJECTED: {
          what: 'ИИ отказался рисовать такую картинку по своим правилам — ничего не сохранили.',
          next: 'Опишите картинку иначе.',
        },
        MEDIA_IMAGE_FAILED: {
          what: 'Картинка не получилась — в медиатеку ничего не легло.',
          next: 'Попросите ещё раз чуть позже.',
        },
        ADAPTATION_MEDIA_UNKNOWN: {
          what: 'Такой картинки в медиатеке пространства нет — к посту ничего не поставили.',
          next: 'Приложите картинку к сообщению или выберите из медиатеки.',
        },
        AI_INCLUDED_QUOTA_EXHAUSTED: {
          what: 'Обращения к ИИ в этом месяце закончились — этот шаг не делали и ничего не потратили.',
          next: 'Дождитесь обновления лимита или выберите ключ пространства в настройках.',
        },
        ADAPTATION_NOT_FOUND: {
          what: 'Такого поста у этой заготовки нет — ничего не сделали и не потратили.',
          next: 'Откройте заготовку и назовите пост ещё раз.',
        },
        AI_ADMISSION_CONTENDED: {
          what: 'Учёт обращений к ИИ сейчас занят — шаг не начинали и ничего не потратили.',
          next: 'Попросите ещё раз через минуту.',
        },
        AI_SELECTED_CREDENTIAL_UNAVAILABLE: {
          what: 'ИИ пока не подключён: нет ни включённого лимита, ни ключа пространства — ничего не потратили.',
          next: 'Администратор подключает его в «Настройки → Глобальные настройки».',
        },
      },
      code: (code) => `код ${code}`,
      // «Одно имя — один ключ»: повтор после отказа везде один.
      retry: intakeCopy.ru.retry,
    },
    secret: {
      kind: 'Ключ',
      workspaceTitle: 'Ключ ИИ пространства',
      searchTitle: (engine) => `Ключ поиска ${engine}`,
      workspaceLead:
        'С ним пространство пишет своим ключом. Ключ уходит прямо в «Настройки → ИИ» — в чат, в память и в журнал он не попадает, и мы его не увидим.',
      workspaceLeadSystem:
        'Сейчас пространство на «Ключах системы». Сохраните ключ — и оно перейдёт на «Свой ключ» и будет писать за свой счёт. Ключ уходит прямо в «Настройки → ИИ» — в чат, в память и в журнал он не попадает, и мы его не увидим.',
      searchLead:
        'Нужен, чтобы искать факты своим ключом. Ключ уходит прямо в «Настройки → ИИ» — в чат, в память и в журнал он не попадает, и мы его не увидим.',
      searchAsleep:
        'Пространство на «Ключах системы»: поиск идёт на ключах системы, а свой ключ поиска здесь не нужен. Он понадобится после перехода на «Свой ключ».',
      field: 'Ключ',
      placeholder: 'Вставьте ключ',
      placeholderStored: 'Ключ уже сохранён — вставьте новый, чтобы заменить',
      savesFor: (provider) => `Сохраним как ключ ${provider}`,
      wrongKey: (owner, expected) =>
        `Это ключ ${owner}, а здесь нужен ключ ${expected} — такой ключ не сохраняем.`,
      save: 'Сохранить в настройках',
      saving: 'Сохраняем ключ',
      notNow: 'Не сейчас',
      adminOnly: 'только администратор',
      notAdmin:
        'Ключ вводит администратор пространства — в «Настройки → ИИ».',
      saved: 'Ключ сохранён в настройках.',
      failed: 'Ключ не сохранился. Проверьте его и попробуйте ещё раз.',
      continue: 'Продолжить',
      continueText: 'Ключ сохранил в настройках, продолжаем.',
      dismissed: 'Отложили — ключ можно ввести в «Настройки → ИИ».',
    },
    connect: {
      kind: 'Подключение канала',
      telegramTitle: 'Три шага в Telegram',
      oauthTitle: (platform) => `Канал ${platform}`,
      oauthLead: (platform) =>
        `Откроется окно ${platform}: войдите и разрешите доступ. Потом вы вернётесь в этот разговор.`,
      oauthAction: (platform) => `Открыть ${platform}`,
      oauthFailed: 'Окно площадки не открылось. Попробуйте ещё раз или подключите канал на экране «Каналы».',
      returnPrecondition:
        'Канал не подключился: этот аккаунт уже подключали к другому пространству, а на пробном периоде так нельзя. Завершите пробный период в «Оплате» и подключите снова.',
      returnFailed: (message) => `Канал не подключился. Площадка ответила: «${message}». Попробуйте ещё раз или подключите на экране «Каналы».`,
      checking: 'Смотрим, появился ли канал',
      connected: (name) => `Подключили «${name}»`,
      connectedLead: 'Канал на месте. Напишите в чат, что дальше, — например, как в нём писать.',
      openChannel: 'Открыть канал',
    },
    panel: {
      label: 'Рабочая панель',
      close: 'Закрыть панель',
      workspaceTitle: 'Что есть в пространстве',
      emptyLead:
        'Здесь откроется то, над чем работаем: аватар, канал, заготовка, план. Пока — что уже есть.',
      // «Одно имя — один ключ»: the same words as on «С чего начать».
      doInChat: onboardingCopy.ru.doInChat,
      loading: 'Смотрим, что уже есть',
      failed: 'Не удалось узнать, что уже есть в пространстве.',
      writeFromLead: (title: string) => `Напиши заготовку по взятому поводу «${title}»`,
      fromEditor: {
        piece: (piece: string, code: string | null, channel: string | null) =>
          `Про пост из заготовки «${piece}»${code ? ` (${code})` : ''}${channel ? ` для канала «${channel}»` : ''}: `,
        text: (text: string, channel: string | null) =>
          `Сделай из этого текста заготовку и пост${channel ? ` для канала «${channel}»` : ''}:\n\n${text}`,
        empty: (channel: string | null) =>
          `Напишем пост${channel ? ` для канала «${channel}»` : ''} из одной мысли: `,
      },
    },
    notifications: {
      label: 'Поручения и уведомления',
      empty: 'Новых уведомлений и фоновых поручений нет.',
      markAllRead: 'Прочитать все',
      markRead: 'Прочитано',
      openThread: 'Открыть разговор',
    },
  },
  en: {
    locale: 'en',
    screenLabel: 'AI assistant',
    threads: {
      ...chatWordsFor('en'),
      label: 'Conversations',
      newThread: 'New conversation',
      untitled: 'Untitled',
      empty: 'No conversations yet. The first appears as soon as you write.',
      failed: 'The conversation list did not load.',
      rename: 'Rename',
      renameLabel: 'Conversation name',
      renameSave: 'Save',
      remove: 'Delete conversation',
      removeArmed: 'Delete for good?',
      actionFailed: 'That did not work — try again.',
    },
    history: {
      loading: 'Opening the conversation…',
      failedTitle: 'The conversation did not load',
      failedBody: 'The messages are intact — try again.',
      retry: intakeCopy.en.retry,
    },
    start: {
      title: 'Where do we start?',
      lead: 'Write in your own words or start with a step. What we make opens beside the chat.',
      starters: {
        avatar: 'Build an avatar',
        channel: 'Connect Telegram',
        piece: 'Write a post from one thought',
        adaptation: 'Adapt a piece for a channel',
        plan: 'Put a post into the plan as a reserve',
        week: 'What is in the plan this week',
      },
      channelByAdmin:
        'An administrator connects channels. Once Telegram is connected, you can adapt a piece and put a post into the plan here.',
    },
    conversation: {
      label: 'Conversation',
      you: 'You',
      agent: 'AI assistant',
      thinking: 'Thinking…',
      attached: (name) => `Attached: ${name}`,
      samplesAdded: (name, accepted) =>
        `${name} — to the avatar's samples: ${accepted} ${accepted === 1 ? 'text' : 'texts'}`,
      mediaAdded: (name, count) =>
        `${name} — ${count === 1 ? 'a picture' : `${count} pictures`} in the media library`,
      pictureViewed: (name) => `${name} — shown to the AI, not saved`,
      forkFromMessage: 'Branch from here',
      forkThread: 'Clone conversation',
      forking: 'Branching the conversation…',
      forkFailed: 'Could not branch the conversation — try again.',
    },
    composer: {
      label: 'Message to the AI assistant',
      placeholder: 'Say what to do, or paste a link to a post…',
      placeholderBusy: 'Add instructions while we work',
      signalAccepted: 'Additional instruction accepted',
      signalQueued: 'Accepted for after the current response',
      signalUnknown: 'Delivery could not be confirmed. Refresh history: the task may have been accepted.',
      sendFailed: 'Could not send. Your message and files remain in the composer — try again.',
      pictureBusy: 'You can show pictures after the current response. Your message and files remain in the composer.',
      attach: 'Attach a file',
      attachHint: 'text samples, Telegram export, pictures',
      removeFile: (name) => `Remove ${name}`,
      send: 'Send',
      stop: 'Stop',
      linkNote: 'We will read the link',
      tooMany: (max) => `No more than ${max} files at once.`,
      tooBig: (name, kilobytes) =>
        `“${name}” is over ${
          kilobytes >= 1024 ? `${kilobytes / 1024} MB` : `${kilobytes} KB`
        } and cannot be attached.`,
      tooBigTogether: (megabytes) =>
        `Together the files are over ${megabytes} MB — remove one.`,
      unsupported: (name) =>
        `“${name}” cannot be attached: we take texts (.txt, .md, .json), pictures, and for the avatar's samples a Telegram export (result.json), .docx and .pdf.`,
      keyboard: 'Enter sends, Shift+Enter starts a new line',
      samplesChip: "to the avatar's samples",
      samplesSending: "Adding the texts to the avatar's samples…",
      samplesNotAllowed: (name) =>
        `“${name}” is for an avatar's samples, and those are added by an editor or an administrator.`,
      samplesFailed:
        "The files did not reach the avatar's samples. Nothing was sent — try again.",
      samplesTarget: 'Samples go to',
      samplesTargetDefault: (name) =>
        name ? `The default — “${name}”` : 'The default avatar',
      samplesTargetFirst: "The samples go to the workspace's first avatar.",
      samplesUnnamed: 'No name',
      samplesFellBack: (name) =>
        `${name ? `Avatar “${name}”` : 'The chosen avatar'} is gone — the samples went to the default avatar.`,
      samplesHeld: 'We send the samples when the agent has finished answering.',
      pictureViewChip: 'the AI will look',
      pictureViewNote: 'The AI looks at the picture in this message and saves it nowhere.',
      pictureViewNoteEditor: 'Need it for a post? Say so, and the agent puts it into the media library.',
      pictureRoute: (name, toLibrary) =>
        toLibrary
          ? `“${name}” goes to the media library. Press to only show it to the AI`
          : `“${name}” is only shown to the AI. Press to put it into the media library`,
      mediaChip: 'to the media library',
      mediaNote:
        'Pictures marked “to the media library” go into the workspace media library — every member sees them. The AI does not see them: only their names, to put one on a post.',
      mediaSending: 'Putting the pictures into the media library…',
      mediaFailed:
        'The pictures did not reach the media library. The message was not sent — try again.',
      keyPasted:
        'The message held a key — we took it out and sent nothing: keys are never written into the chat. An administrator of the workspace enters it — on the Key card (ask to “enter a key”) or in Settings → AI.',
      voiceRecord: 'Record voice',
      voiceRecording: 'Recording…',
      voiceCancel: 'Cancel recording',
      voiceToText: 'To text',
      voiceSendNow: 'Send right away',
      voiceTranscribing: 'Transcribing voice…',
      voiceFailed: 'Could not transcribe the recording — try again.',
      voiceDenied: 'Allow microphone access in your browser to dictate.',
    },
    card: {
      openOnScreen: 'Open on screen',
      openBeside: 'Open beside',
      openedBeside: 'open beside',
      kinds: {
        workspace: 'Workspace',
        channels: 'Channels',
        piece: 'Piece',
        avatar: 'Avatar',
        adaptation: 'Adaptation',
        plan: 'In the plan',
        channel: 'Channel',
        ideas: 'Where ideas come from',
        facts: 'Facts',
        media: 'Media library',
      },
      done: 'Done',
      removed: 'deleted',
      pieceQuestions: (count) =>
        `${count} ${count === 1 ? 'question waits' : 'questions wait'} for an answer — answer in chat before adapting it.`,
      variant: (index) => lowerFirst(piecesCopy.en.variant(index)),
      voiceScoreBadge: (rulesMatched, rulesTotal, factsCount) =>
        `Voice ${rulesMatched}/${rulesTotal} · Facts ${factsCount}`,
      voiceScoreTitle: (inCorridor, total, facts, slop) =>
        `Brand voice: ${total > 0 ? `${inCorridor} of ${total} inside the corridor` : 'not configured'} · Confirmed facts: ${facts}${slop > 0 ? ` · Anti-slop: ${slop}` : ''}`,
    },
    approval: {
      kind: 'We need your yes',
      ask: (action) => `${action}?`,
      fallbackAction: 'Do this',
      unavailable: 'Action details are unavailable',
      missingDetails:
        'We could not verify exactly what will happen. Refresh the action details before approving.',
      refresh: 'Refresh action details',
      what: 'What happens',
      irreversible: 'Cannot be undone',
      irreversibleNote: 'There is no way back: what is deleted is gone.',
      reversibleNote: 'A completed action is not automatically undone.',
      dismissNote: 'A declined lead does not come back to the queue — not here, not on the screen.',
      takeNote: 'A lead taken to work does not go back to the queue; its piece can be deleted in Content.',
      archiveNote: 'You can subscribe again any time — the subscription comes back with its leads.',
      publishHeading: 'Straight to the channel',
      publishNote:
        "Once out, the post can't be taken back from here — only deleted in the channel itself.",
      scheduleNote:
        'Until it goes out, the post can be taken off the schedule — here or in the calendar.',
      yes: 'Yes',
      no: 'No',
      sending: 'Sending the answer',
      sent: 'answer sent',
      approved: 'done',
      approvedConnect: 'the steps are on the card below',
      declined: 'not done',
      closed: NO_LONGER_WAITING.en,
    },
    question: {
      kind: 'Question',
      lead: 'We only ask what your text does not say.',
      ownAnswer: 'Your own answer',
      send: 'Answer',
      decide: 'Decide for me',
      answered: 'answered',
      confirmed: 'That is right',
      suggested: 'Suggested answer',
      recommended: 'Recommended',
      multiple: 'You can select more than one option.',
      progress: (position, total) => `Question ${position} of ${total}`,
      savedAnswers: 'Saved answers',
      delegated: 'Decision delegated to AI',
      decideRemaining: 'Decide all remaining answers for me',
      answerFailed:
        'Receipt of the answer is not confirmed. Your text is saved — check the current question before sending again.',
      draftRetained:
        'This question changed or closed. Your unsent answer is retained below.',
      unavailable:
        'We could not restore the question. Refresh the conversation — your answers are saved.',
      readRange: (title, offset, characters) =>
        `The exact phrase was not found. Reading the saved range${
          title ? ` “${title}”` : ''
        }: characters ${offset + 1}–${
          offset + characters
        }. This is source text, not confirmation of the requested phrase.`,
      closed: NO_LONGER_WAITING.en,
      stale: 'out of date, the text has changed since — nothing was applied',
      yours:
        'The piece’s questions are yours: answer here or on the card, or say “Decide for me”.',
      consentLabel: 'This is my manner — you may write in my name',
      consentLabelBrand: 'This is our brand’s voice — you may write in its name',
      nameLabel: 'Avatar name',
      namePlaceholder: 'For example, Igor',
      activate: 'Switch the avatar on',
      notNow: 'Not now',
      autopilotWrite: 'Yes, write it',
      autopilotSkip: 'Do not write',
      keepPicture: 'To the media library',
      keepPictureSkip: 'No',
      keepPictureName: (name) => `Picture “${name}”`,
      keepPictureGone:
        'This page no longer holds the picture — it is not kept after a reload. Attach it again.',
      keepPictureGoneAnswer: 'OK',
      keepPictureFailed: 'The picture did not reach the media library. Try again.',
      sending: 'Sending the answer',
      planKind: 'Plan',
      planApprove: 'Approve plan',
      planReject: 'Revise plan',
      planFeedbackLabel: 'Notes or changes to the plan',
      planFeedbackPlaceholder: 'What to change or clarify…',
    },
    tasks: {
      kind: 'Tasks',
      completed: (done, total) => `${done} of ${total}`,
      statuses: {
        pending: 'pending',
        in_progress: 'in progress',
        completed: 'done',
      },
    },
    objective: {
      kind: 'Goal',
      statuses: {
        active: 'in progress',
        achieved: 'done',
        failed: 'did not work',
        stopped: 'stopped',
        cleared: 'cleared',
      },
    },
    subagent: {
      kind: 'Specialist',
      agents: {
        research: 'Research and fact analysis',
        writing: 'Drafting and rewriting',
        review: 'Review and editing',
      },
      statuses: {
        working: 'working',
        done: 'done',
        error: 'did not work',
      },
    },
    selection: {
      kind: 'Choice',
      preview: reviewPreviewCopy.en,
      include: 'Keep',
      keep: (count) => `Keep the ticked · ${count}`,
      keepNone: 'Go on without them',
      // The piece page's words, not a second set: fact states from the entry
      // screen's table, the typo mark from the review of an adaptation.
      statuses: selectionStatuses('en', 'change'),
    },
    interview: interviewWords('en'),
    plan: planWords('en', {
      reserve: 'In the plan',
      scheduled: 'Queued · goes out by itself',
      channel: 'Channel',
      when: 'Time',
      draftWhen: 'Date',
      draftMoment: (moment) => `Dated ${moment}`,
      gone: 'This post is no longer there',
      reserveNote: 'It will not go out by itself: this is a reservation. Confirm it or change the time on the piece screen.',
      cancelReserve: 'Cancel the reservation',
      cancelling: 'Cancelling the reservation',
      cancelled: 'The reservation is gone; the post stays a draft.',
    }),
    progress: {
      kind: 'Working',
      working: 'Working…',
      stepsLabel: 'Steps',
      leaveNote: 'You can leave the screen — we finish on our own',
      stop: 'Stop',
      stages: {
        started: 'Reading…',
        brief: 'Filling the brief…',
        claims: 'Reading the claims…',
        search: 'Looking for missing facts…',
        writing: 'Writing…',
        done: 'Done',
        measuring: 'Counting sentence length, punctuation and repeats…',
        proposing: 'Writing the voice proposal…',
        retrying: 'Connection hiccup — retrying the step…',
        fallback: 'Switching to the backup AI…',
      },
    },
    error: {
      paidCapNote: (title) =>
        `${title ? `${title} — ` : ''}this step was stopped by an older assistant limit. Check saved results before continuing.`,
      kind: 'Did not work',
      generic: {
        what: 'We could not finish this.',
        next: 'Try again — that usually does it.',
      },
      refused: {
        what: 'This action was not done.',
        next: 'Why, and what you can do, is in the answer below.',
      },
      network: {
        what: 'The connection dropped and the answer did not arrive.',
        next: 'Check the connection and try again.',
      },
      codes: {
        CAPABILITY_RESULT_UNAVAILABLE: {
          what: 'The retrieved result could not be durably saved.',
          next: 'Saved material is unchanged. Check storage availability, then repeat the read.',
        },
        VIDEO_PREFLIGHT_STALE: {
          what: 'The video approval expired or the script changed.',
          next: 'Open the saved script and review the settings and price again.',
        },
        VIDEO_REQUEST_NOT_AUTHORED: {
          what: 'Your message requesting the video could not be verified.',
          next: 'Request the video in this chat and approve the saved script.',
        },
        AGENT_FAILED: {
          what: 'We could not finish this.',
          next: 'Try again — that usually does it.',
        },
        AI_PROVIDER_UNAVAILABLE: {
          what: 'AI is not connected yet: no included allowance and no workspace key.',
          next: 'An administrator connects it in Settings → Global Settings.',
        },
        AI_PROVIDER_PAYMENT_REQUIRED: {
          what: 'The AI provider declined the request because of its balance or key limit.',
          next: 'An administrator checks the provider balance and key limit. Retry after they have been updated.',
        },
        AI_ALLOWANCE_EXHAUSTED: {
          what: 'The AI requests for this month are spent.',
          next: 'Wait for the allowance to refresh or choose a workspace key in the settings.',
        },
        AI_PROVIDER_BUSY: {
          what: 'AI is overloaded right now.',
          next: 'Try again in a minute.',
        },
        AI_PROVIDER_TIMEOUT: {
          what: 'AI did not answer in time.',
          next: 'Try again — that usually does it.',
        },
        AGENT_PICTURE_NOT_SEEN: {
          what: 'AI could not look at the picture: the chosen model does not take pictures, or not this one.',
          next: 'Describe the picture in words or send it «to the library». An administrator can choose a model that sees pictures in Settings → AI.',
        },
        AGENT_BLOCKED: {
          what: 'We stopped: the message holds something like a key or a password.',
          next: 'Keys go into the key card, not the chat. Remove it and send again.',
        },
        AGENT_RUN_NOT_PENDING: {
          what: 'This question is already closed — no answer is needed.',
          next: 'Carry on with the conversation.',
        },
        AGENT_QUESTION_STALE: {
          what: 'The material or questions changed. Your answer was not applied.',
          next: 'Open the current piece or stop the task. Your unsent text is retained in the question card.',
        },
        MATERIAL_PASSAGE_NOT_FOUND: {
          what: 'The exact phrase was not found in the saved source.',
          next: 'Refine the phrase or read the available source range.',
        },
        AGENT_BAD_REQUEST: {
          what: 'The message did not arrive in a readable form.',
          next: 'Reload the page and send it again.',
        },
        AGENT_NOT_YOURS: {
          what: 'This conversation is somebody else’s: everyone in the workspace has their own.',
          next: 'Start a new conversation.',
        },
        ai_rate_limited: {
          what: 'Too many messages in a row.',
          next: 'Wait a minute and send again.',
        },
        CAPABILITY_INPUT_INVALID: {
          what: 'The action parameters were invalid. The action did not run.',
          next: 'The assistant can correct the parameters in this same message.',
        },
        PERMISSION_DENIED: {
          what: 'Your role has no right to do this.',
          next: 'Ask an administrator of the workspace.',
        },
        MATERIAL_NOT_AVAILABLE: { what: 'This material or version is no longer available.', next: 'Choose available material from its card.',
        },
        MATERIAL_STALE: { what: 'The material changed while it was being read.', next: 'The assistant will read its current version again.',
        },
        AGENT_TASK_OPERATION_IN_FLIGHT: { what: 'The previous step is still running.', next: 'Wait for its result before another action.',
        },
        AGENT_TASK_OPERATION_FAILED: { what: 'A step failed; the whole task is still incomplete.', next: 'Check the saved result before repeating it.',
        },
        AGENT_TASK_TIME_BUDGET: { what: 'The task reached its time limit with work remaining.', next: 'Saved results remain available. The assistant will identify what remains.',
        },
        AGENT_TASK_TOKEN_BUDGET: { what: 'The configured task token limit was reached.', next: 'Check results and remaining steps before continuing.',
        },
        AGENT_TASK_COST_BUDGET: { what: 'The configured task spending limit was reached.', next: 'Check costs and remaining work before continuing.',
        },
        AGENT_TASK_COST_UNKNOWN: { what: 'The cost of a completed step could not be confirmed.', next: 'Check usage and the saved result before repeating it.',
        },
        AGENT_TASK_UNCERTAIN: { what: 'The result of a paid step is not confirmed yet.', next: 'Check the saved result first: repeating it may create a duplicate.',
        },
        AGENT_TASK_NO_PROGRESS: { what: 'Repeated actions did not produce new results.', next: 'The assistant will explain the gap and propose another way forward.',
        },
        AGENT_TASK_EMERGENCY_FUSE: { what: 'A long execution chain stopped; the task is still incomplete.', next: 'Check the available results and remaining steps.',
        },
        AGENT_TASK_STOPPED: { what: 'Execution stopped. Saved results remain available.', next: 'Check them before continuing.',
        },
        PAID_CAP_REACHED: {
          what: 'This step was stopped by an older assistant limit.',
          next: 'Check saved results before continuing.',
        },
        APPROVAL_MISMATCH: {
          what: 'Your yes was for a different action — nothing was done.',
          next: 'Ask again and we ask anew.',
        },
        INPUT_NEEDS_PERSON: {
          what: 'Only a person answers this question.',
          next: 'Answer it in the question card.',
        },
        APPROVAL_CONTENT_CHANGED: {
          what: 'The post text changed after your yes — nothing was sent.',
          next: 'We show it again: confirm if the new text is right.',
        },
        PROPOSAL_CARD_OPEN: {
          what: 'Changes to this text already wait on the card above — nothing was run again or spent.',
          next: 'Tick the changes you want on that card, or go on without them.',
        },
        CONFIRMATION_INVALID: {
          what: 'The confirmation did not fit this action — nothing was done.',
          next: 'We ask again: answer yes if you agree.',
        },
        CONFIRMATION_UNAVAILABLE: {
          what: 'We could not check the confirmation — nothing was done.',
          next: 'Try again in a minute.',
        },
        PIECE_NOT_FOUND: {
          what: 'There is no such piece — it may have been deleted.',
          next: 'Open Content and pick another one.',
        },
        PIECE_AVATAR_NOT_READY: {
          what: 'The avatar has no voice yet, so there is nothing to write in.',
          next: 'Finish the avatar or write without it.',
        },
        VOICE_RIGHTS_REQUIRED: {
          what: 'The avatar is not switched on without your consent.',
          next: 'Tick the consent in the avatar card.',
        },
        VOICE_FIELDS_INCOMPLETE: {
          what: 'The avatar is not ready yet: some of its lines are empty.',
          next: 'Write the missing lines here in the chat or on the avatar screen, then we switch it on.',
        },
        VOICE_PROFILE_NOT_FOUND: {
          what: 'There is nothing to switch on yet: the avatar has neither an analysis nor filled lines.',
          next: 'Add samples of your texts or fill in the lines by hand.',
        },
        VOICE_FORBIDDEN: {
          what: 'Avatars are changed by an editor or an administrator.',
          next: 'Ask one of them — anyone can look at an avatar on its screen.',
        },
        VOICE_REFERENCE_DISABLED: {
          what: 'Writing “in somebody else’s style” is switched off in this workspace.',
          next: 'Add your own texts or fill in the lines by hand.',
        },
        VOICE_VERSION_NOT_FOUND: {
          what: 'There is no such voice version.',
          next: 'Open the versions on the avatar screen.',
        },
        VOICE_VERSION_CONFLICT: {
          what: 'The avatar’s voice was just changed elsewhere — nothing was overwritten.',
          next: 'Open the avatar again and repeat.',
        },
        VOICE_SAMPLE_NOT_FOUND: {
          what: 'There is no such sample — it may have been deleted.',
          next: 'Look at the avatar’s list of samples.',
        },
        VOICE_SAMPLE_UNREADABLE: {
          what: 'This text could not be read as a sample.',
          next: 'Paste it as plain text or attach another file.',
        },
        VOICE_UPLOAD_REJECTED: {
          what: 'The files were not taken: too many or too large at once.',
          next: 'Send them in parts — up to 10 files and 40 MB at a time.',
        },
        VOICE_PAYLOAD_TOO_LARGE: {
          what: 'Too much text at once.',
          next: 'Split it into several messages.',
        },
        VOICE_ANALYSIS_FAILED: {
          what: 'The analysis could not be finished.',
          next: 'Try again a little later.',
        },
        VOICE_ANALYSIS_RUNNING: {
          what: "This avatar's analysis is already running — on the avatar screen or in another chat. A second one was not started; nothing was spent.",
          next: 'Look again in a few minutes — the result will appear on its own.',
        },
        VOICE_ASSIST_UNAVAILABLE: {
          what: 'The AI did not answer, so there is no voice proposal. The analysis numbers are saved.',
          next: 'Run the analysis again when you are ready: it takes about five minutes.',
        },
        VOICE_ASSIST_UNGROUNDED: {
          what: 'The AI proposed lines your texts do not support — we did not take them.',
          next: 'Run the analysis again or fill in the lines by hand.',
        },
        VOICE_AVATAR_NOT_FOUND: {
          what: 'There is no such avatar — it may have been deleted.',
          next: 'Look at the list of avatars.',
        },
        VOICE_AVATAR_LIMIT: {
          what: 'This workspace already has as many avatars as it can.',
          next: 'Delete one you do not need or rename an existing one.',
        },
        VOICE_AVATAR_NOT_ANALYSED: {
          what: 'This avatar does not write yet: it has no voice switched on.',
          next: 'Analyse its samples or fill in its lines first, then switch it on.',
        },
        VOICE_AVATAR_SUCCESSOR_REQUIRED: {
          what: 'This avatar is the default one — it cannot be deleted without a successor.',
          next: 'Name the avatar that takes its place.',
        },
        VOICE_LEARN_NOT_ENOUGH: {
          what: 'Too few edits to learn from: one or two are a mood, not a habit.',
          next: 'Edit a few more drafts of this avatar.',
        },
        VOICE_LEARN_UNAVAILABLE: {
          what: 'Learning from edits is not available right now.',
          next: 'Try later.',
        },
        VOICE_LEARN_RULE_NOT_FOUND: {
          what: 'The avatar has no such rule — it may already be forgotten.',
          next: 'Look at what the avatar learned.',
        },
        AI_PROVIDER_REJECTED: {
          what: 'AI refused to answer: the workspace AI settings do not fit.',
          next: 'An administrator checks the chosen AI and the key in Settings → AI. Trying again will not help.',
        },
        CAPABILITY_FAILED: {
          what: 'This action did not work just now.',
          next: 'Try again a little later or do it on the product screen.',
        },
        INTAKE_FAILED: {
          what: 'The piece was not written.',
          next: 'Try again or start it in Content.',
        },
        CHANNEL_NOT_FOUND: {
          what: 'There is no such channel in the workspace — it may have been deleted.',
          next: 'Look at the list of channels.',
        },
        CHANNEL_WRITING_PROFILE_INVALID: {
          what: 'The channel card was not saved: the platform would not take these rules.',
          next: 'Name another length or another avatar — the rest stayed as it was.',
        },
        CHANNEL_WRITING_EMPTY: {
          what: 'Nothing to change in the channel card was named.',
          next: 'Say what to write differently: length, emoji, links, hashtags, call to action, avatar or address.',
        },
        CHANNEL_PROVIDER_UNKNOWN: {
          what: 'We have no such platform.',
          next: 'The platforms are listed on the Channels screen.',
        },
        CHANNEL_CONNECT_ON_SCREEN: {
          what: 'This platform connects through its own form.',
          next: 'Connect it on the Channels screen.',
        },
        CHANNEL_BOT_RENAME_UNSUPPORTED: {
          what: 'This platform does not let the bot be renamed from here.',
          next: 'The bot’s name is changed in the platform’s own settings.',
        },
        // AI settings from the chat (kcxz.20).
        AI_SEARCH_KEY_ON_SYSTEM_KEYS: {
          what: 'On the system keys search runs on them — an own search key is not needed here.',
          next: 'It is needed after switching to your own key.',
        },
        AI_KEYS_ON_SYSTEM_KEYS: {
          what: 'On the system keys your own keys are asleep and are not removed from here.',
          next: 'Switch to your own key if a key should go.',
        },
        AI_KEY_NOT_STORED: {
          what: 'No such key is saved — there is nothing to remove.',
          next: 'See which keys are saved in Settings → AI.',
        },
        AI_SYSTEM_KEYS_UNAVAILABLE: {
          what: 'System keys are not set up on this server.',
          next: 'The workspace stays on its own key.',
        },
        // Where ideas come from, in the chat (kcxz.23).
        SUBSCRIPTION_NOT_FOUND: {
          what: 'There is no such subscription in this workspace — it may have been dropped.',
          next: 'See the list in “Where ideas come from”.',
        },
        SUBSCRIPTION_CONFLICT: {
          what: 'This is already subscribed — no second subscription was made.',
          next: 'Its leads arrive in the same list.',
        },
        SUBSCRIPTION_LIMIT: {
          what: 'The workspace already holds as many subscriptions as it may.',
          next: 'Unsubscribe from one you do not need, then add the new one.',
        },
        CHECK_TOO_SOON: {
          what: 'This subscription was checked less than a minute ago — not checked again, nothing spent.',
          next: 'Wait a minute and ask again.',
        },
        LEAD_NOT_FOUND: {
          what: 'There is no such lead in this workspace.',
          next: 'See the leads in “Where ideas come from”.',
        },
        LEAD_NOT_NEW: {
          what: 'This lead was already handled: taken to work or declined.',
          next: 'Pick another of the new leads.',
        },
        INVALID_URL: {
          what: 'This address does not work for a subscription.',
          next: 'Send the whole feed address, with https://.',
        },
        INVALID_TOPIC: {
          what: 'The topic is empty or too long — up to 200 characters.',
          next: 'Name the topic in fewer words.',
        },
        IDEAS_LEAD_NOT_TAKEN: {
          what: 'This lead was not taken to work yet — no piece was written, nothing spent.',
          next: 'Say “take it to work” — we take it and write at once.',
        },
        INTAKE_RESEARCH_SNAPSHOT_REQUIRED: {
          what: 'The selected quotes are not linked to saved research.',
          next: 'The assistant can select the available research and continue.',
        },
        INTAKE_RESEARCH_SNAPSHOT_UNAVAILABLE: {
          what: 'The saved research is no longer available to this conversation.',
          next: 'Research the sources again or use the available piece.',
        },
        INTAKE_RESEARCH_SELECTION_INVALID: {
          what: 'The selected findings do not match their saved sources.',
          next: 'Check the quotes and select supported findings.',
        },
        INTAKE_RESEARCH_STORAGE_UNAVAILABLE: {
          what: 'The research could not be saved for continuation.',
          next: 'Try later; no piece has been created.',
        },
        INTAKE_RESEARCH_EVIDENCE_MISMATCH: {
          what: 'The saved source does not contain the selected quote.',
          next: 'Check the source before using this claim.',
        },
        INTAKE_RESEARCH_INCOMPLETE: {
          what: 'The findings are not sufficient to write the piece yet.',
          next: 'Refine the research or identify the missing evidence.',
        },
        INTAKE_RESEARCH_SELECTION_REQUIRES_PERSON: {
          what: 'This research requires your choice of facts.',
          next: 'Continue after your explicit choice of facts.',
        },
        INTAKE_RESEARCH_CONTINUATION_PENDING: {
          what: 'Writing from this research has already started; its result is not confirmed yet.',
          next: 'Check the saved piece before trying to create it again.',
        },
        CONTENT_ADAPTATION_INCOMPLETE: {
          what: 'The adaptation is not ready: its required scope, source support or length could not be verified.',
          next: 'Identify the missing material before another attempt.',
        },
        INTAKE_REQUEST_NOT_AUTHORED: {
          what: 'The original request could not be confirmed in this chat.',
          next: 'Return to your message and continue with its original text.',
        },
        INTAKE_TEXT_MISSING: {
          what: 'There is nothing to write the piece from: no words and no lead.',
          next: 'Write a thought or name a lead.',
        },
        INTAKE_TEXT_TOO_LONG: {
          what: 'Together with the lead the text is longer than a piece reads — nothing was written or spent.',
          next: 'Shorten what you added to the lead.',
        },
        // Facts, own texts and analytics in the chat (kcxz.24).
        FACT_NOT_FOUND: {
          what: 'There is no such fact in this workspace.',
          next: 'See the facts in “Facts”.',
        },
        FACT_STATEMENT_EMPTY: {
          what: 'The fact has no words or numbers — nothing was added.',
          next: 'Write the fact in words: a price, a date or a number.',
        },
        CONTENT_CONTEXT_FACT_SUPERSEDED: {
          what: 'This fact was replaced by a corrected copy and is already out of work — the old one is neither retracted nor restored; nothing changed.',
          next: 'The copy stays in work; it is in “Facts”.',
        },
        FACT_DATE_INVALID: {
          what: 'There is no such day in the calendar — the fact was not added.',
          next: 'Name the day the fact holds until.',
        },
        FACT_DATE_PAST: {
          what: 'That day is already over — the fact would be out of date at once, so it was not added.',
          next: 'Name a day still to come, or add the fact without an end date.',
        },
        FACT_REMOVED: {
          what: 'This fact was removed from the workspace for good — it is not added again; nothing changed.',
          next: 'Word the fact anew if it holds again.',
        },
        CONTENT_CONTEXT_NOT_FOUND: {
          what: 'The fact changed or disappeared while the request ran — nothing was done.',
          next: 'See the facts in “Facts” and ask again.',
        },
        CONTENT_CONTEXT_INPUT_INVALID: {
          what: 'The fact has an invalid date or no statement — nothing was added.',
          next: 'Check the wording and the date.',
        },
        ANALYTICS_NOT_AVAILABLE: {
          what: 'This platform gives no audience analytics.',
          next: 'What went out and what failed is in “Production”.',
        },
        ANALYTICS_CHANNEL_OFF: {
          what: 'The channel is switched off, waits to be reconnected or its connection is not finished — the platform was not asked.',
          next: 'Switch it on, reconnect it or finish connecting it in “Channels”.',
        },
        ANALYTICS_CHANNEL_NEEDS_RECONNECT: {
          what: 'The channel’s access to the platform has expired. It was not refreshed from the chat; the channel was not touched.',
          next: 'Open “Analytics” or reconnect the channel in “Channels”.',
        },
        ANALYTICS_UNAVAILABLE: {
          what: 'The platform did not answer just now. This is not “no activity” — there is simply no data.',
          next: 'Ask again later or open “Analytics”.',
        },
        // Media in the chat (kcxz.25).
        MEDIA_PROMPT_MISSING: {
          what: 'There is nothing to draw from: no words about the picture and no post text — nothing was spent.',
          next: 'Say what the picture shows, or name the post it is for.',
        },
        MEDIA_IMAGE_CREDITS_EXHAUSTED: {
          what: 'The pictures of your plan are used up this month — nothing was drawn or spent.',
          next: 'Take a picture from the media library or attach your own.',
        },
        MEDIA_IMAGE_REJECTED: {
          what: 'The AI refused to draw this picture under its rules — nothing was saved.',
          next: 'Describe the picture differently.',
        },
        MEDIA_IMAGE_FAILED: {
          what: 'The picture did not come out — nothing went into the media library.',
          next: 'Ask again a little later.',
        },
        ADAPTATION_MEDIA_UNKNOWN: {
          what: 'There is no such picture in the workspace media library — nothing was put on the post.',
          next: 'Attach the picture to a message or pick one from the media library.',
        },
        AI_INCLUDED_QUOTA_EXHAUSTED: {
          what: 'The AI allowance of this month is used up — this step did not run and nothing was spent.',
          next: 'Wait for the allowance to renew or choose the workspace key in the settings.',
        },
        ADAPTATION_NOT_FOUND: {
          what: 'This piece has no such post — nothing was done or spent.',
          next: 'Open the piece and name the post again.',
        },
        AI_ADMISSION_CONTENDED: {
          what: 'The AI usage ledger is busy right now — the step was not started and nothing was spent.',
          next: 'Ask again in a minute.',
        },
        AI_SELECTED_CREDENTIAL_UNAVAILABLE: {
          what: 'AI is not connected yet: there is neither an included allowance nor a workspace key — nothing was spent.',
          next: 'An administrator connects it in Settings → Global Settings.',
        },
      },
      code: (code) => `code ${code}`,
      retry: intakeCopy.en.retry,
    },
    secret: {
      kind: 'Key',
      workspaceTitle: 'Workspace AI key',
      searchTitle: (engine) => `${engine} search key`,
      workspaceLead:
        'With it the workspace writes on its own key. The key goes straight to Settings → AI — never into the chat, the memory or a log, and we never see it.',
      workspaceLeadSystem:
        'The workspace is on the system keys now. Save a key and it moves to its own key, at its own cost. The key goes straight to Settings → AI — never into the chat, the memory or a log, and we never see it.',
      searchLead:
        'Needed to look for facts on your own key. The key goes straight to Settings → AI — never into the chat, the memory or a log, and we never see it.',
      searchAsleep:
        'The workspace is on the system keys: search runs on them, and an own search key is not needed here. It is needed after switching to your own key.',
      field: 'Key',
      placeholder: 'Paste the key',
      placeholderStored: 'A key is saved — paste a new one to replace it',
      savesFor: (provider) => `Saved as a ${provider} key`,
      wrongKey: (owner, expected) =>
        `This is a ${owner} key, and a ${expected} key is needed here — it is not saved.`,
      save: 'Save in the settings',
      saving: 'Saving the key',
      notNow: 'Not now',
      adminOnly: 'administrator only',
      notAdmin:
        'An administrator of the workspace enters the key, in Settings → AI.',
      saved: 'The key is saved in the settings.',
      failed: 'The key was not saved. Check it and try again.',
      continue: 'Continue',
      continueText: 'I saved the key in the settings, carry on.',
      dismissed: 'Put off — the key can be entered in Settings → AI.',
    },
    connect: {
      kind: 'Connecting a channel',
      telegramTitle: 'Three steps in Telegram',
      oauthTitle: (platform) => `${platform} channel`,
      oauthLead: (platform) =>
        `${platform}’s window opens: sign in and allow access. Then you come back to this conversation.`,
      oauthAction: (platform) => `Open ${platform}`,
      oauthFailed: 'The platform’s window did not open. Try again or connect the channel on the Channels screen.',
      returnPrecondition:
        'The channel was not connected: this account was already connected to another workspace, which a trial does not allow. Finish the trial in Billing and connect again.',
      returnFailed: (message) => `The channel was not connected. The platform said: “${message}”. Try again or connect it on the Channels screen.`,
      checking: 'Checking whether the channel arrived',
      connected: (name) => `Connected “${name}”`,
      connectedLead: 'The channel is here. Tell the chat what next — for example, how to write in it.',
      openChannel: 'Open the channel',
    },
    panel: {
      label: 'Work panel',
      close: 'Close the panel',
      workspaceTitle: 'What the workspace has',
      emptyLead:
        'What we work on opens here: an avatar, a channel, a piece, the plan. For now — what is already there.',
      doInChat: onboardingCopy.en.doInChat,
      loading: 'Looking at what is there',
      failed: 'Could not find out what the workspace already has.',
      writeFromLead: (title: string) => `Write a piece from the taken lead “${title}”`,
      fromEditor: {
        piece: (piece: string, code: string | null, channel: string | null) =>
          `About the post from the piece “${piece}”${code ? ` (${code})` : ''}${channel ? ` for the channel “${channel}”` : ''}: `,
        text: (text: string, channel: string | null) =>
          `Make a piece and a post${channel ? ` for the channel “${channel}”` : ''} from this text:\n\n${text}`,
        empty: (channel: string | null) =>
          `Let’s write a post${channel ? ` for the channel “${channel}”` : ''} from one thought: `,
      },
    },
    notifications: {
      label: 'Tasks & notifications',
      empty: 'No new notifications or background tasks.',
      markAllRead: 'Mark all read',
      markRead: 'Mark read',
      openThread: 'Open conversation',
    },
  },
};

/** Тот же единственный вопрос о языке, что у остальных экранов. */
const navigationCopies = new Map<string, AgentWords>();
export const agentWordsFor = (language: string | undefined | null): AgentWords => {
  const key = language ?? 'en';
  let words = navigationCopies.get(key);
  if (!words) {
    const threads = chatWordsFor(language);
    words = { ...agentCopy[resolveContentLocale(language)], threads, history: { loading: threads.historyLoading, failedTitle: threads.historyFailedTitle, failedBody: threads.historyFailedBody, retry: threads.retry } };
    navigationCopies.set(key, words);
  }
  return words;
};

/**
 * Слова отказа по коду: код, который продукт знает, — его фраза; иначе общая
 * фраза и сам код мелким шрифтом, чтобы его можно было назвать поддержке.
 */
export const errorWordsFor = (
  words: AgentWords,
  code: string | null,
  /** A refusal of an action: «try again» would be wrong advice (kcxz.29). */
  refusal = false
): ErrorWords & { known: boolean } => {
  const known = code ? words.error.codes[code] : undefined;
  return known
    ? { ...known, known: true }
    : { ...(refusal ? words.error.refused : words.error.generic), known: false };
};

/** «1 вопрос», «2 вопроса», «5 вопросов». */
/** The plan card's words: the agent's own few, the rest the piece page's. */
function planWords(
  locale: 'ru' | 'en',
  own: {
    reserve: string;
    scheduled: string;
    channel: string;
    when: string;
    draftWhen: string;
    draftMoment: (moment: string) => string;
    gone: string;
    reserveNote: string;
    cancelReserve: string;
    cancelling: string;
    cancelled: string;
  }
): AgentWords['plan'] {
  const w = piecesCopy[locale];
  return {
    states: {
      reserve: own.reserve,
      scheduled: own.scheduled,
      draft: w.planRowDraft,
      published: upperFirst(w.statePublished),
      // Sent and did not go out: the piece page's word (review W2 F14).
      error: upperFirst(w.stateError),
    },
    channel: own.channel,
    when: own.when,
    draftWhen: own.draftWhen,
    draftMoment: own.draftMoment,
    gone: own.gone,
    reserveNote: own.reserveNote,
    cancelReserve: own.cancelReserve,
    cancelling: own.cancelling,
    cancelled: own.cancelled,
    unschedule: w.unschedule,
    unscheduling: w.unscheduling,
    unscheduled: w.unscheduledDone,
    failed: w.scheduleFailed,
  };
}

function upperFirst(text: string) {
  return text ? text[0].toLocaleUpperCase() + text.slice(1) : text;
}

/** The channel tab's interview words (`piece.container.tsx`), by locale. */
function interviewWords(
  locale: 'ru' | 'en'
): Omit<SuggestedQuestionsWords, 'lead'> {
  const w = piecesCopy[locale];
  return {
    badge: w.interviewBadge,
    title: w.interviewTitle,
    suggestedLead: w.suggestedLead,
    yes: w.answerYes,
    fix: w.answerFix,
    decide: w.answerDecide,
    skip: w.answerSkip,
    ownAnswerLabel: w.ownAnswerLabel,
    ownAnswerHint: w.ownAnswerHint,
    ownOptionPlaceholder: w.ownOptionPlaceholder,
    send: w.interviewSend,
    skipAll: w.answerDecideAll,
    own: w.ownAnswer,
  };
}

const lowerFirst = (text: string) =>
  text ? text[0].toLocaleLowerCase() + text.slice(1) : text;

/**
 * Row states of the selection card (`kcxz.13`): facts (`confirmed`,
 * `unverified`, `conflicting`, `not_found`) in the words of the research table,
 * review and rewrite changes — `silent` is a typo fix, named as the review of
 * an adaptation names it; `show` is a visible change.
 */
function selectionStatuses(
  locale: 'ru' | 'en',
  show: string
): Readonly<Record<string, string>> {
  const intake = intakeCopy[locale];
  return {
    confirmed: intake.factVerified,
    unverified: intake.factUnverified,
    conflicting: intake.factConflicting,
    not_found: intake.factNotFound,
    show,
    silent: piecesCopy[locale].typoPrefix.replace(/[:\s]+$/, '').toLowerCase(),
  };
}

function ruPlural(count: number, one: string, few: string, many: string) {
  const tens = count % 100;
  const units = count % 10;
  if (tens >= 11 && tens <= 14) return many;
  if (units === 1) return one;
  if (units >= 2 && units <= 4) return few;
  return many;
}

/** Слово шага по имени события сервиса (`AgentProgressPayload.stage`). */
export const stageWordFor = (words: AgentWords, stage: string | null) => {
  const stages = words.progress.stages;
  switch (stage) {
    case 'intake-started':
    case 'link-fetched':
    case 'links-skipped':
      return stages.started;
    case 'brief-started':
    case 'brief-filled':
      return stages.brief;
    case 'claims':
      return stages.claims;
    case 'research-started':
    case 'research-ready':
    case 'research-selection-required':
    case 'subagent_start':
    case 'subagent_tool_start':
      return stages.search;
    case 'piece':
    case 'questions':
      return stages.writing;
    case 'done':
      return stages.done;
    case 'voice-started':
    case 'voice-measured':
      return stages.measuring;
    case 'voice-call':
      return stages.proposing;
    case 'stream-retry':
      return stages.retrying;
    case 'model-fallback':
      return stages.fallback;
    default:
      return words.progress.working;
  }
};

export type { AgentWords };
