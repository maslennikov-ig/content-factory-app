import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CheckPolicies } from '@contentfactory/backend/services/auth/permissions/permissions.ability';
import {
  AuthorizationActions,
  Sections,
} from '@contentfactory/backend/services/auth/permissions/permission.exception.class';
import { SlopCheckDto } from '@contentfactory/nestjs-libraries/dtos/content-intelligence/text-quality.dto';
import { slopCheck } from '@contentfactory/nestjs-libraries/content-intelligence/text-quality/slop-check';
import type { SlopReportV1 } from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice-wiring.contract';

/**
 * Проверка написанного текста на ИИ-штампы.
 *
 * `content-factory-next-tu3k.3`, решение владельца 06.09.2026: проверка по
 * желанию человека и только показывает находки.
 *
 * Три вещи эта дверь не делает, и все три намеренно. Не ходит в модель:
 * проверка — чистый разбор строки, поэтому её нет ни в допуске ИИ, ни в
 * расходе, ни в списке дверей под ограничитель частоты. Не ходит в базу:
 * текст приходит в теле и никуда не сохраняется, так что и области видимости
 * тут не за чем следить. И ничего не правит: правка осталась за человеком.
 *
 * Дверь всё равно под ролью редактора — тем же правом, каким человек этот
 * текст пишет (`docs/product/roles-matrix.md`). Читателю проверять нечего:
 * у него нет ни черновика, ни кнопки.
 */
@ApiTags('Content intelligence text quality')
@Controller('/content-intelligence/text-quality')
export class ContentTextQualityController {
  @Post('/slop-check')
  @CheckPolicies([AuthorizationActions.Create, Sections.EDITOR])
  check(@Body() body: SlopCheckDto): SlopReportV1 {
    return slopCheck(body?.text ?? '', {
      platform: body?.platform,
      locale: body?.locale,
      html: body?.html,
    });
  }
}
