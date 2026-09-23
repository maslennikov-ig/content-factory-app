/**
 * Что вход одной мыслью кладёт генератору сверх обычного запроса.
 *
 * `content-factory-next-tu3k.1`. `GeneratorDto` — это то, что приходит по HTTP,
 * и оно не меняется: `intake` снаружи не принимается никогда. Подсказки
 * ставит только сервер, вызывая `AgentGraphService.start` напрямую, и живут
 * они в отдельном типе именно затем, чтобы это различие было видно в сигнатуре,
 * а не в комментарии.
 *
 * Граф читает поле аддитивно (поток S2 волны «вход одной мыслью»). Пока не
 * читает — черновик всё равно получается: подсказки улучшают текст и не
 * разрешают его.
 *
 * Чужой текст сюда не попадает ни одним полем. `borrowed` — тема, угол и
 * строение, то есть то, что владелец разрешил брать; `foreignShingles` —
 * отрезки по восемь слов, по которым проверяют, что дословного заимствования
 * не случилось. Сам вставленный пост дальше разбора не идёт.
 */

import type { GeneratorDto } from '@contentfactory/nestjs-libraries/dtos/generator/generator.dto';
import type { IntakeFormatV1, RelatedOwnPostV1 } from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice-wiring.contract';
import type { ChannelWritingProfileV2 as ChannelWritingProfileV1 } from '@contentfactory/nestjs-libraries/content-intelligence/channels/channel-writing-profile.v2.contract';

export const INTAKE_HINTS_VERSION = 'intake-hints/v1' as const;

/**
 * Опора заготовки словами: утверждение и адрес, по которому его проверяли.
 *
 * `content-factory-next-97dq.2`. До этой волны опоры доезжали до генерации
 * только идентификаторами (`factIds`, `userMaterialEvidenceIds`), и адаптация
 * стояла на том, что строитель контекста сам счёл подходящим: тринадцать
 * отмеченных строк ресерча превращались в две фразы, а недостающее модель
 * дописывала сама. Утверждение — это текст, и ехать оно обязано текстом.
 */
export type IntakeMaterialHintV1 = {
  statement: string;
  /** Адрес источника, когда он записан: строка без адреса остаётся строкой. */
  sourceUrl?: string;
  /**
   * Сверено с источником или написано самим человеком и им подтверждено.
   *
   * Без пометки строка едет как слово автора, которое никто не проверял, и
   * печатается под своим заголовком: назвать непроверенное «проверенным
   * материалом» — это ровно то, чего разбор корректности не пропустил
   * (P2-12).
   */
  checked?: boolean;
};

/**
 * Предел блока опор — счётом и знаками.
 *
 * Двенадцать строк и две тысячи знаков: столько материала модель ещё держит в
 * внимании рядом с сутью и ответами. Дальше начинается то, ради чего блок и
 * заведён наоборот — длинный список, который пересказывают вместо того, чтобы
 * из него выбирать (та же причина, что у списка своих прежних постов).
 */
export const INTAKE_MATERIAL_MAX_ITEMS = 12;
export const INTAKE_MATERIAL_MAX_CHARS = 2_000;

/** Канал, для которого пишется именно этот черновик. */
export type IntakeChannelHintsV1 = {
  integrationId: string;
  providerIdentifier: string;
  /** Предел провайдера, а не третья таблица: `SocialProvider.maxLength`. */
  maxLength: number;
  maxCaptionLength?: number | null;
  editor: 'none' | 'normal' | 'markdown' | 'html';
  /** Карточка «Как пишем сюда»; `null` — действуют умолчания провайдера. */
  writingProfile: ChannelWritingProfileV1 | null;
};

export type IntakeGenerationHintsV1 = {
  allowQuestion?: boolean;
  version: typeof INTAKE_HINTS_VERSION;
  brief: {
    thesis: string | null;
    position: string | null;
    disagreement: string | null;
    audience: string | null;
    goal?: string | null;
    /**
     * Откуда каждое поле (`97dq.56`). `model` — предложение модели или её
     * решение по «Решите за меня»: адаптация получает его подписанным как
     * предложение, а не как слова автора.
     */
    origins?: Partial<
      Record<'thesis' | 'position' | 'disagreement' | 'audience' | 'goal', string>
    >;
  };
  /** Взятое из чужого текста: тема, угол, строение. Никогда — сам текст. */
  borrowed?: {
    topic: string;
    angle: string;
    structure: string[];
  } | null;
  /** Отрезки по восемь слов исходника, которых в тексте быть не должно. */
  foreignShingles?: string[];
  /**
   * Суть заготовки простым текстом (`content-factory-next-tu3k.9`).
   *
   * Материал, а не запрос: она уже написана и уже нейтральна, и адаптация
   * переносит её слова, числа и примеры дословно, меняя только то, чего
   * требует площадка. Поле необязательно — короткий путь «сразу для Telegram»
   * тоже проходит через заготовку, но материал до этой волны сути не имеет
   * вовсе, и без неё промпт читается ровно как читался.
   */
  core?: string | null;
  /**
   * Опоры заготовки, которые человек оставил отмеченными
   * (`content-factory-next-97dq.2`).
   *
   * Проверенный материал: своё и подтверждённое плюс отмеченные находки
   * ресерча — ровно то, что `selectedFactsBrief` уже считает идущим в текст.
   * Адаптация берёт из него то, что работает на тезис, и не имеет права
   * добавить ни числа, ни совета, которых нет ни в сути, ни здесь.
   */
  material?: IntakeMaterialHintV1[];
  /**
   * Ответы человека на вопросы под канал, дословно: «ключ: ответ».
   *
   * Слова человека, а не решение продукта, и в тексте они цитируются как его
   * слова — это то же правило, по которому переносится суть.
   */
  answers?: string[];
  /**
   * Что читатели канала должны унести из поста — ответ человека на вопрос
   * первой адаптации (`content-factory-next-97dq.31`,
   * `channels/channel-question.v3.ts`). Направление всего текста, а не
   * цитата, поэтому едет своей строкой, а не среди `answers`.
   */
  takeaway?: string | null;
  /**
   * Ответы человека на вопросы модели перед адаптацией
   * (`content-factory-next-97dq.44`, `channels/channel-question.v4.ts`):
   * строки «вопрос → ответ». Направление этой версии, а не цитата, поэтому
   * своим блоком, а не среди `answers`.
   */
  interview?: string[];
  /** Выбранная форма текста; локализованный ответ уже разобран сервером. */
  formatHint?: IntakeFormatV1;
  /** Ссылки из задания, которые велено сохранить: в пост дословно (`97dq.29`). */
  keepLinks?: string[];
  /**
   * «Для этого поста» (`content-factory-next-97dq.38`): разовая длина,
   * пожелание и то, что читатели должны унести. Строки из них
   * собирает `channelInstructionLines` — там же, где карточка канала, которую
   * они на этот раз перекрывают. Аватар сюда не едет: он уже решён в
   * `brandProfileSelection` запроса.
   */
  post?: IntakePostOverridesV1;
  channel: IntakeChannelHintsV1;
};

export type IntakePostOverridesV1 = {
  /** `channel` («как в канале») сюда не доезжает: он ничего не меняет. */
  length?: 'shorter' | 'longer';
  /*
    Обращения («на ты / на вы») здесь нет с `97dq.45`: опция ушла из
    продукта, и в промпт оно не едет ни с поста, ни с канала, ни с аватара.
  */
  wish?: string;
  takeaway?: string;
  /*
    Поля карточки канала на одну адаптацию (`97dq.48`): уже разобранные
    сервером, в форме самой карточки. Строки из них собирает тот же
    `channelInstructionLines`, поэтому «мало эмодзи» поста и канала — одна
    строка промпта. `lengthPolicy` главнее `length`.
  */
  lengthPolicy?: Exclude<ChannelWritingProfileV1['lengthPolicy'], 'provider_max'>;
  emojiLevel?: ChannelWritingProfileV1['emojiLevel'];
  linkPolicy?: ChannelWritingProfileV1['linkPolicy'];
  hashtagPolicy?: ChannelWritingProfileV1['hashtagPolicy'];
  ctaKind?: ChannelWritingProfileV1['ctaKind'];
};

/**
 * Ищет ли генерация материал в вебе сама.
 *
 * `SEARCH_IF_EMPTY` — то, что было всегда и остаётся умолчанием: своего
 * материала нет, значит `AgentGraphService.searchForMaterial` сходит в веб
 * перед сборкой контекста (`content-factory-next-ec48.1`).
 *
 * `PIECE_ONLY` — «писать из того, что уже есть, и больше ниоткуда». Решение
 * владельца 07.09.2026 на живом прогоне (`content-factory-next-m2eg.16`):
 * адаптация заготовки берёт суть, бриф и ответы человека — материал у неё
 * уже на руках, — а поиск на каждой площадке добавлял к нему чужие находки,
 * стоил денег области и приносил в текст то, чего человек не просил. Флаг
 * ставит только сервер; снаружи, на `POST /posts/generator`, его нет, как нет
 * и `intake`.
 */
export type GeneratorMaterialPolicyV1 = 'SEARCH_IF_EMPTY' | 'PIECE_ONLY';

export type GeneratorRunInput = GeneratorDto & {
  intake?: IntakeGenerationHintsV1;
  materialPolicy?: GeneratorMaterialPolicyV1;
  /**
   * Свои прежние тексты по теме — материал для промпта, а не поиск в вебе.
   *
   * Считает их `TextSearchService` по внутреннему индексу области и передаёт
   * сюда уже готовыми (`content-factory-next-m2eg.19`). Граф их только
   * печатает: второе место, которое умеет искать, — это второй порядок
   * ранжирования и второй ответ на один вопрос.
   */
  relatedOwnPosts?: RelatedOwnPostV1[];
};
