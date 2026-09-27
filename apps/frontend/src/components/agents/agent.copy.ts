import { resolveContentLocale } from '@contentfactory/frontend/components/content-intelligence/content-section.copy';
import { intakeCopy } from '@contentfactory/frontend/components/content-intelligence/intake/intake.copy';
import { piecesCopy } from '@contentfactory/frontend/components/content-intelligence/pieces/pieces.copy';
import type { SuggestedQuestionsWords } from '@contentfactory/frontend/components/content-intelligence/intake/questions.card';
import type { AgentArtifactKind } from './agent.contract';

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
  screenLabel: string;
  threads: {
    label: string;
    newThread: string;
    untitled: string;
    empty: string;
    failed: string;
    rename: string;
    renameLabel: string;
    renameSave: string;
    remove: string;
    removeArmed: string;
    actionFailed: string;
  };
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
      plan: string;
    };
  };
  conversation: {
    label: string;
    you: string;
    agent: string;
    thinking: string;
    attached: (name: string) => string;
  };
  composer: {
    label: string;
    placeholder: string;
    placeholderBusy: string;
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
  };
  approval: {
    kind: string;
    ask: (action: string) => string;
    fallbackAction: string;
    what: string;
    irreversible: string;
    irreversibleNote: string;
    reversibleNote: string;
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
    consentLabel: string;
    nameLabel: string;
    namePlaceholder: string;
    activate: string;
    notNow: string;
    /** Writing into an autopilot channel (`kcxz.14`): the person's «да». */
    autopilotWrite: string;
    autopilotSkip: string;
    sending: string;
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
  };
  secret: {
    kind: string;
    workspaceTitle: string;
    searchTitle: (engine: string) => string;
    workspaceLead: string;
    searchLead: string;
    field: string;
    placeholder: string;
    placeholderStored: string;
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
  panel: {
    label: string;
    close: string;
    workspaceTitle: string;
    emptyLead: string;
    doInChat: string;
    loading: string;
    failed: string;
  };
};

export const agentCopy: Record<AgentCopyLocale, AgentWords> = {
  ru: {
    screenLabel: 'Агент',
    threads: {
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
        plan: 'Что у нас в плане на неделю',
      },
    },
    conversation: {
      label: 'Разговор',
      you: 'Вы',
      agent: 'Агент',
      thinking: 'Думаем…',
      attached: (name) => `Приложено: ${name}`,
    },
    composer: {
      label: 'Сообщение агенту',
      placeholder: 'Напишите, что сделать, или вставьте ссылку на пост…',
      placeholderBusy: 'Можно писать дальше — отправим, когда закончим',
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
        `«${name}» не приложить: берём тексты (.txt, .md, .json) и картинки.`,
      keyboard: 'Enter — отправить, Shift+Enter — новая строка',
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
      },
      done: 'Готово',
      removed: 'удалено',
      pieceQuestions: (count) =>
        `${count} ${ruPlural(count, 'вопрос ждёт', 'вопроса ждут', 'вопросов ждут')} ответа — откройте заготовку и ответьте, прежде чем делать адаптации.`,
      variant: (index) => lowerFirst(piecesCopy.ru.variant(index)),
    },
    approval: {
      kind: 'Нужно ваше «да»',
      ask: (action) => `${action}?`,
      fallbackAction: 'Сделать это',
      what: 'Что будет',
      irreversible: 'Не отменить',
      irreversibleNote:
        'Вернуть не получится: удалённое не восстанавливается.',
      reversibleNote: 'Отменить можно потом на экране продукта.',
      publishHeading: 'Сразу в канал',
      publishNote:
        'Вышедший пост отсюда не снять — удалить его можно только в самом канале.',
      scheduleNote: 'До выхода пост можно снять с расписания — в чате или в календаре.',
      yes: 'Да',
      no: 'Нет',
      sending: 'Отправляем ответ',
      sent: 'ответ отправлен',
      approved: 'сделали',
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
      closed: NO_LONGER_WAITING.ru,
      stale: 'правка устарела, текст уже изменился — ничего не применили',
      yours:
        'Вопросы заготовки — ваши: ответьте в чате или на карточке, или скажите «Решите за меня».',
      consentLabel: 'Это моя манера — можно писать от моего имени',
      nameLabel: 'Имя аватара',
      namePlaceholder: 'Например, Игорь',
      activate: 'Включить аватар',
      notNow: 'Не сейчас',
      autopilotWrite: 'Да, писать',
      autopilotSkip: 'Не писать',
      sending: 'Отправляем ответ',
    },
    selection: {
      kind: 'Выбор',
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
      },
    },
    error: {
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
        AGENT_FAILED: {
          what: 'Не получилось довести до конца.',
          next: 'Попробуйте ещё раз — обычно этого хватает.',
        },
        AI_PROVIDER_UNAVAILABLE: {
          what: 'ИИ пока не подключён: нет ни включённого лимита, ни ключа пространства.',
          next: 'Администратор подключает его в «Настройки → Глобальные настройки».',
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
        AGENT_BLOCKED: {
          what: 'Остановились: в сообщении что-то похожее на ключ или пароль.',
          next: 'Ключи вводятся в карточке ключа, не в чат. Уберите его и отправьте ещё раз.',
        },
        AGENT_RUN_NOT_PENDING: {
          what: 'Этот вопрос уже закрыт — ответ не нужен.',
          next: 'Продолжайте разговор.',
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
        PERMISSION_DENIED: {
          what: 'У вашей роли нет права на это действие.',
          next: 'Попросите администратора пространства.',
        },
        PAID_CAP_REACHED: {
          what: 'За одно сообщение — один платный шаг; сразу после вашего «Да» на карточке — до двух.',
          next: 'Напишите «дальше» — продолжим.',
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
          next: 'Допишите пустые строки на экране аватара — потом включим.',
        },
        VOICE_PROFILE_NOT_FOUND: {
          what: 'Включать пока нечего: у аватара нет ни разбора, ни заполненных строк.',
          next: 'Добавьте образцы своих текстов или заполните строки вручную.',
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
      searchLead:
        'Нужен, чтобы искать факты своим ключом. Ключ уходит прямо в «Настройки → ИИ» — в чат, в память и в журнал он не попадает, и мы его не увидим.',
      field: 'Ключ',
      placeholder: 'Вставьте ключ',
      placeholderStored: 'Ключ уже сохранён — вставьте новый, чтобы заменить',
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
    panel: {
      label: 'Рабочая панель',
      close: 'Закрыть панель',
      workspaceTitle: 'Что есть в пространстве',
      emptyLead:
        'Здесь откроется то, над чем работаем: аватар, канал, заготовка, план. Пока — что уже есть.',
      doInChat: 'Сделать в чате',
      loading: 'Смотрим, что уже есть',
      failed: 'Не удалось узнать, что уже есть в пространстве.',
    },
  },
  en: {
    screenLabel: 'Agent',
    threads: {
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
        plan: 'What is in the plan this week',
      },
    },
    conversation: {
      label: 'Conversation',
      you: 'You',
      agent: 'Agent',
      thinking: 'Thinking…',
      attached: (name) => `Attached: ${name}`,
    },
    composer: {
      label: 'Message to the agent',
      placeholder: 'Say what to do, or paste a link to a post…',
      placeholderBusy: 'Keep writing — we send it when we are done',
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
        `“${name}” cannot be attached: we take texts (.txt, .md, .json) and pictures.`,
      keyboard: 'Enter sends, Shift+Enter starts a new line',
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
      },
      done: 'Done',
      removed: 'deleted',
      pieceQuestions: (count) =>
        `${count} ${count === 1 ? 'question waits' : 'questions wait'} for an answer — open the piece and answer before adapting it.`,
      variant: (index) => lowerFirst(piecesCopy.en.variant(index)),
    },
    approval: {
      kind: 'We need your yes',
      ask: (action) => `${action}?`,
      fallbackAction: 'Do this',
      what: 'What happens',
      irreversible: 'Cannot be undone',
      irreversibleNote: 'There is no way back: what is deleted is gone.',
      reversibleNote: 'You can undo it later on the product screen.',
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
      closed: NO_LONGER_WAITING.en,
      stale: 'out of date, the text has changed since — nothing was applied',
      yours:
        'The piece’s questions are yours: answer here or on the card, or say “Decide for me”.',
      consentLabel: 'This is my manner — you may write in my name',
      nameLabel: 'Avatar name',
      namePlaceholder: 'For example, Igor',
      activate: 'Switch the avatar on',
      notNow: 'Not now',
      autopilotWrite: 'Yes, write it',
      autopilotSkip: 'Do not write',
      sending: 'Sending the answer',
    },
    selection: {
      kind: 'Choice',
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
      },
    },
    error: {
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
        AGENT_FAILED: {
          what: 'We could not finish this.',
          next: 'Try again — that usually does it.',
        },
        AI_PROVIDER_UNAVAILABLE: {
          what: 'AI is not connected yet: no included allowance and no workspace key.',
          next: 'An administrator connects it in Settings → Global Settings.',
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
        AGENT_BLOCKED: {
          what: 'We stopped: the message holds something like a key or a password.',
          next: 'Keys go into the key card, not the chat. Remove it and send again.',
        },
        AGENT_RUN_NOT_PENDING: {
          what: 'This question is already closed — no answer is needed.',
          next: 'Carry on with the conversation.',
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
        PERMISSION_DENIED: {
          what: 'Your role has no right to do this.',
          next: 'Ask an administrator of the workspace.',
        },
        PAID_CAP_REACHED: {
          what: 'One paid step per message; up to two right after your “Yes” on a card.',
          next: 'Say “go on” and we continue.',
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
          next: 'Fill in the empty lines on the avatar screen, then we switch it on.',
        },
        VOICE_PROFILE_NOT_FOUND: {
          what: 'There is nothing to switch on yet: the avatar has neither an analysis nor filled lines.',
          next: 'Add samples of your texts or fill in the lines by hand.',
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
      searchLead:
        'Needed to look for facts on your own key. The key goes straight to Settings → AI — never into the chat, the memory or a log, and we never see it.',
      field: 'Key',
      placeholder: 'Paste the key',
      placeholderStored: 'A key is saved — paste a new one to replace it',
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
    panel: {
      label: 'Work panel',
      close: 'Close the panel',
      workspaceTitle: 'What the workspace has',
      emptyLead:
        'What we work on opens here: an avatar, a channel, a piece, the plan. For now — what is already there.',
      doInChat: 'Do it in the chat',
      loading: 'Looking at what is there',
      failed: 'Could not find out what the workspace already has.',
    },
  },
};

/** Тот же единственный вопрос о языке, что у остальных экранов. */
export const agentWordsFor = (language: string | undefined | null) =>
  agentCopy[resolveContentLocale(language)];

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
      return stages.search;
    case 'piece':
    case 'questions':
      return stages.writing;
    case 'done':
      return stages.done;
    default:
      return words.progress.working;
  }
};

export type { AgentWords };
