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
   * Ответы человека на вопросы под канал, дословно: «ключ: ответ».
   *
   * Слова человека, а не решение продукта, и в тексте они цитируются как его
   * слова — это то же правило, по которому переносится суть.
   */
  answers?: string[];
  /** Выбранная форма текста; локализованный ответ уже разобран сервером. */
  formatHint?: IntakeFormatV1;
  channel: IntakeChannelHintsV1;
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
