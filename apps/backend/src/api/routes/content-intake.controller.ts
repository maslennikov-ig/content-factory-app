import { startNdjsonStream } from './ndjson-stream';
import {
  Body,
  Controller,
  HttpException,
  Post,
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
import { IntakeDto } from '@contentfactory/nestjs-libraries/dtos/content-intelligence/content-intake.dto';
import { IntakeService } from '@contentfactory/nestjs-libraries/content-intelligence/intake/intake.service';

/**
 * Отказ сохраняет своё имя и свой предмет.
 *
 * Экран ветвится по коду, человек читает предложение. «Что-то пошло не так»
 * поверх сервера, который назвал причину, выбрасывает названную причину.
 * Та же функция стоит на двери брифа — форма отказа у раздела одна.
 */
function safeHttpError(error: unknown): never {
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
          error instanceof Error ? error.message : 'Intake request failed',
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
  if (response && typeof response === 'object' && typeof response.code === 'string') {
    return response.code;
  }
  const code = (error as any)?.code;
  return typeof code === 'string' && code ? code : 'INTAKE_FAILED';
}

/**
 * Вход одной мыслью: одно поле, до трёх каналов, черновик в каждом.
 *
 * `content-factory-next-tu3k`, решение владельца 06.09.2026. Дверь одна и
 * стримит NDJSON — по строке на событие, той же формой, что и
 * `POST /posts/generator`: ход длинный, и человек должен видеть, что
 * происходит, а не ждать минуту на пустом экране.
 *
 * Организация приходит из запроса и ниоткуда больше. Человек — оттуда же: он
 * становится автором материала в библиотеке, и выдуманный автор строки в ней
 * хуже отсутствующей строки.
 *
 * Ничего отсюда не публикуется. Черновик появляется в состоянии `DRAFT` тем же
 * путём, что и любой другой пост; отправляет его человек.
 */
@ApiTags('Content intelligence intake')
@Controller('/content-intelligence/intake')
export class ContentIntakeController {
  constructor(private readonly intake: IntakeService) {}

  @Post('/')
  // Две политики, читаются через И (`permissions.guard.ts`). Тарифный предел
  // назван первым, чтобы область, у которой кончились посты на месяц, услышала
  // про месяц; роль — второй, потому что роль не продаётся
  // (`docs/product/roles-matrix.md`).
  @CheckPolicies(
    [AuthorizationActions.Create, Sections.POSTS_PER_MONTH],
    [AuthorizationActions.Create, Sections.EDITOR]
  )
  async intakeRun(
    @GetOrgFromRequest() organization: Organization,
    @GetUserFromRequest() user: User,
    @Body() body: IntakeDto,
    @Res({ passthrough: false }) response: Response
  ) {
    // До первого байта — обычный HTTP: проверка длины входа.
    // После него код ответа уже не изменить, и это единственная причина, по
    // которой проверка стоит здесь, а не внутри стрима.
    let plan;
    try {
      plan = await this.intake.prepare(organization.id, body as any);
    } catch (error) {
      safeHttpError(error);
    }

    const stopHeartbeat = startNdjsonStream(response);
    try {
      for await (const event of this.intake.run(
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
            error instanceof HttpException
              ? error.message
              : 'Something went wrong while writing the draft, please try again.',
        }) + '\n'
      );
    } finally {
      stopHeartbeat();
      response.end();
    }
  }
}
