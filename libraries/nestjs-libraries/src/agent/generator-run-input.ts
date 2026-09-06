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
import type { ChannelWritingProfileV1 } from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice-wiring.contract';

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
  channel: IntakeChannelHintsV1;
};

export type GeneratorRunInput = GeneratorDto & {
  intake?: IntakeGenerationHintsV1;
};
