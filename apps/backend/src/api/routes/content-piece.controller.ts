import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { Organization, User } from '@prisma/client';
import { GetOrgFromRequest } from '@contentfactory/nestjs-libraries/user/org.from.request';
import { GetUserFromRequest } from '@contentfactory/nestjs-libraries/user/user.from.request';
import { CheckPolicies } from '@contentfactory/backend/services/auth/permissions/permissions.ability';
import {
  AuthorizationActions,
  Sections,
} from '@contentfactory/backend/services/auth/permissions/permission.exception.class';
import {
  PieceAdaptDto,
  PieceAnswerDoorDto,
  PieceArchiveDto,
  PiecesQueryDto,
} from '@contentfactory/nestjs-libraries/dtos/content-intelligence/content-piece.dto';
import { PieceService } from '@contentfactory/nestjs-libraries/content-intelligence/pieces/piece.service';

/**
 * Отказ сохраняет своё имя и свой предмет.
 *
 * Та же функция, что на дверях входа, брифа и материалов: экран ветвится по
 * коду, человек читает предложение, и «что-то пошло не так» поверх сервера,
 * который назвал причину, выбрасывает названную причину. Читает поля утиной
 * типизацией, а не `instanceof`, — так подходит любой отказ раздела.
 */
function safeHttpError(error: unknown, fallbackMessage: string): never {
  if (
    error &&
    typeof error === 'object' &&
    'code' in error &&
    'status' in error &&
    typeof error.code === 'string' &&
    typeof error.status === 'number'
  ) {
    throw new HttpException(
      {
        code: error.code,
        message:
          error instanceof Error && error.message
            ? error.message
            : fallbackMessage,
        ...('subject' in error && typeof error.subject === 'string'
          ? { subject: error.subject }
          : {}),
      },
      error.status
    );
  }
  throw error;
}

/** Код отказа, который уже начавшийся стрим кладёт последней строкой. */
function streamErrorCode(error: unknown): string {
  const response =
    error instanceof HttpException ? (error.getResponse() as any) : null;
  if (
    response &&
    typeof response === 'object' &&
    typeof response.code === 'string'
  ) {
    return response.code;
  }
  const code = (error as any)?.code;
  return typeof code === 'string' && code ? code : 'PIECE_ADAPT_FAILED';
}

const languageOf = (value?: string): 'ru' | 'en' =>
  value === 'en' ? 'en' : 'ru';

/**
 * Предложения на случай, когда отказ пришёл без своего текста.
 *
 * Здесь только те два, что рождаются на двери удаления: остальные коды
 * называет сервис, и второй набор слов для них разошёлся бы с первым.
 * `ADAPTATION_PUBLISHED` — не техническая помеха, а решение продукта: след
 * опубликованного текста остаётся, потому что по нему потом и разбираются, что
 * именно вышло в канал.
 */
const DELETE_REFUSAL_MESSAGES: Record<string, { ru: string; en: string }> = {
  ADAPTATION_PUBLISHED: {
    ru: 'Эта версия уже опубликована. Происхождение опубликованного текста не стирается: удалите пост в канале, если он больше не нужен.',
    en: 'This version is already published. The provenance of a published text is not erased: delete the post in the channel if it is no longer wanted.',
  },
  ADAPTATION_NOT_FOUND: {
    ru: 'Такой версии у этой заготовки нет.',
    en: 'This piece has no such version.',
  },
};

const deleteFallback = (error: unknown, language: 'ru' | 'en'): string => {
  const code = (error as any)?.code;
  return (
    DELETE_REFUSAL_MESSAGES[code]?.[language] ??
    (language === 'ru'
      ? 'Версию удалить не удалось.'
      : 'The version could not be deleted.')
  );
};

/**
 * Заготовка и её адаптации: список, страница, адаптация, удаление версии,
 * архив.
 *
 * `content-factory-next-tu3k.9`, решения владельца 06.09.2026. Человек сначала
 * пишет нейтральную заготовку — суть плюс бриф, без площадки, — а потом сам
 * решает, во что её превратить. Создание сюда не входит: заготовка рождается
 * на двери входа одной мыслью (`POST /content-intelligence/intake`), и вторая
 * дверь создания разошлась бы с первой на первой же правке.
 *
 * Организация приходит из запроса и ниоткуда больше: идентификатор заготовки —
 * не разрешение, и область, угадавшая чужой, получает `PIECE_NOT_FOUND`.
 *
 * Ничего отсюда не публикуется. Адаптация готовит текст и черновик в состоянии
 * `DRAFT`; отправляет его человек обычным путём через `PostsService`.
 */
@ApiTags('Content intelligence pieces')
@Controller('/content-intelligence/pieces')
export class ContentPieceController {
  constructor(private readonly pieces: PieceService) {}

  /**
   * Первая вкладка «Контента»: таблица заготовок с колонкой на площадку.
   *
   * Политики нет намеренно, как у списка материалов: читать библиотеку области
   * может любой её участник, и роль редактора начинается там, где начинается
   * запись (`docs/product/roles-matrix.md`).
   */
  @Get('/')
  async list(
    @GetOrgFromRequest() organization: Organization,
    @Query() query: PiecesQueryDto = {},
    @Query('language') requested?: string
  ) {
    try {
      return await this.pieces.list(
        organization.id,
        query ?? {},
        languageOf(requested)
      );
    } catch (error) {
      safeHttpError(error, 'Piece request failed');
    }
  }

  @Get('/:id')
  async detail(
    @GetOrgFromRequest() organization: Organization,
    @Param('id') id: string,
    @Query('language') requested?: string
  ) {
    try {
      return await this.pieces.detail(
        organization.id,
        id,
        languageOf(requested)
      );
    } catch (error) {
      safeHttpError(error, 'Piece request failed');
    }
  }

  /**
   * Адаптация заготовки под канал: NDJSON, строка на событие.
   *
   * Две политики, читаются через И (`permissions.guard.ts`). Тарифный предел
   * назван первым, чтобы область, у которой кончились посты на месяц, услышала
   * про месяц; роль — второй, потому что роль не продаётся
   * (`docs/product/roles-matrix.md`).
   */
  @Post('/:id/adapt')
  @CheckPolicies(
    [AuthorizationActions.Create, Sections.POSTS_PER_MONTH],
    [AuthorizationActions.Create, Sections.EDITOR]
  )
  async adapt(
    @GetOrgFromRequest() organization: Organization,
    @GetUserFromRequest() user: User,
    @Param('id') id: string,
    @Body() body: PieceAdaptDto,
    @Res({ passthrough: false }) response: Response,
    @Query('language') requested?: string
  ) {
    // До первого байта — обычный HTTP: заготовка, канал, вид адаптации. После
    // него код ответа уже не изменить, и это единственная причина, по которой
    // проверка стоит здесь, а не внутри стрима.
    let plan;
    try {
      plan = await this.pieces.prepareAdapt(
        organization.id,
        id,
        body as any,
        languageOf(requested)
      );
    } catch (error) {
      safeHttpError(error, 'Adaptation request failed');
    }

    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    try {
      for await (const event of this.pieces.adapt(
        organization.id,
        plan,
        user?.id
      )) {
        response.write(JSON.stringify(event) + '\n');
      }
    } catch (error) {
      // Стрим уже начался, поэтому обычного отказа больше не будет: последняя
      // строка называет код и причину, чтобы клиент остановился и показал их,
      // а не завис на оборванном ответе.
      response.write(
        JSON.stringify({
          name: 'error',
          error: true,
          code: streamErrorCode(error),
          message:
            error instanceof Error && error.message
              ? error.message
              : 'Something went wrong while adapting the piece, please try again.',
        }) + '\n'
      );
    } finally {
      response.end();
    }
  }

  /**
   * Ответы на открытые вопросы заготовки: NDJSON, строка на событие.
   *
   * `content-factory-next-m2eg`. Заготовка уже записана входом, поэтому дверь
   * ничего не создаёт: она принимает слова человека, переписывает суть и
   * возвращает заготовку с обновлённым брифом. Тупика у неё нет — `piece`
   * приходит всегда, а `questions` только пока есть о чём спрашивать.
   *
   * Политики те же две и в том же порядке, что у адаптации: ответ может стоить
   * одной генерации, и тарифный предел называется первым.
   */
  @Post('/:id/answer')
  @CheckPolicies(
    [AuthorizationActions.Create, Sections.POSTS_PER_MONTH],
    [AuthorizationActions.Create, Sections.EDITOR]
  )
  async answer(
    @GetOrgFromRequest() organization: Organization,
    @GetUserFromRequest() user: User,
    @Param('id') id: string,
    @Body() body: PieceAnswerDoorDto,
    @Res({ passthrough: false }) response: Response,
    @Query('language') requested?: string
  ) {
    // До первого байта — обычный HTTP: заготовка, архив, наличие сути.
    let plan;
    try {
      plan = await this.pieces.prepareAnswer(
        organization.id,
        id,
        body as any,
        languageOf(requested)
      );
    } catch (error) {
      safeHttpError(error, 'Answer request failed');
    }

    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    try {
      for await (const event of this.pieces.answer(
        organization.id,
        plan,
        user?.id
      )) {
        response.write(JSON.stringify(event) + '\n');
      }
    } catch (error) {
      response.write(
        JSON.stringify({
          name: 'error',
          error: true,
          code: streamErrorCode(error),
          message:
            error instanceof Error && error.message
              ? error.message
              : 'Something went wrong while answering, please try again.',
        }) + '\n'
      );
    } finally {
      response.end();
    }
  }

  /**
   * Удаление одной адаптации.
   *
   * Оба идентификатора — из пути, и тела у двери нет вовсе. Это прямое
   * следствие `content-factory-next-fn33.90.3`: дверь удаления, принявшая
   * пустое тело как «все», стёрла все посты области стенда. Пути без
   * `adaptationId` здесь не существует, поэтому промахнуться нечем.
   */
  @Delete('/:id/adaptations/:adaptationId')
  @CheckPolicies([AuthorizationActions.Delete, Sections.EDITOR])
  async deleteAdaptation(
    @GetOrgFromRequest() organization: Organization,
    @Param('id') id: string,
    @Param('adaptationId') adaptationId: string,
    @Query('language') requested?: string
  ) {
    try {
      await this.pieces.deleteAdaptation(organization.id, id, adaptationId);
      return { deleted: true };
    } catch (error) {
      safeHttpError(error, deleteFallback(error, languageOf(requested)));
    }
  }

  /** Убрать заготовку из списка или вернуть её обратно. */
  @Post('/:id/archive')
  @CheckPolicies([AuthorizationActions.Update, Sections.EDITOR])
  async archive(
    @GetOrgFromRequest() organization: Organization,
    @Param('id') id: string,
    @Body() body: PieceArchiveDto
  ) {
    try {
      await this.pieces.archive(organization.id, id, body.archived);
      return { archived: body.archived };
    } catch (error) {
      safeHttpError(error, 'Piece request failed');
    }
  }
}
