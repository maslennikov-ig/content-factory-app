import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  Post,
  Query,
  UploadedFiles,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import type { Organization, User } from '@prisma/client';
import { GetOrgFromRequest } from '@contentfactory/nestjs-libraries/user/org.from.request';
import { GetUserFromRequest } from '@contentfactory/nestjs-libraries/user/user.from.request';
import type { OrganizationRole } from '@contentfactory/nestjs-libraries/user/organization.roles';
import { isOrganizationAdmin } from '@contentfactory/nestjs-libraries/user/organization.roles';
import { CheckPolicies } from '@contentfactory/backend/services/auth/permissions/permissions.ability';
import {
  AuthorizationActions,
  Sections,
} from '@contentfactory/backend/services/auth/permissions/permission.exception.class';
import {
  VoiceAnalysisDto,
  VoiceAvatarCreateDto,
  VoiceAvatarDefaultDto,
  VoiceAvatarDeleteDto,
  VoiceAvatarUpdateDto,
  VoiceInjectionPlanDto,
  VoicePassportFieldDto,
  VoiceProposalActivateDto,
  VoiceProposalFieldDto,
  VoiceProposalPortraitDto,
  VoiceProposalManualFieldDto,
  VoiceSampleDeleteDto,
  VoiceSampleFileIntakeDto,
  VoiceSampleIntakeDto,
  VoiceExamplesDto,
  VoiceScaleCorridorDto,
  VoiceRepairDto,
  VoiceTextCheckDto,
  VoiceVersionRestoreDto,
} from '@contentfactory/nestjs-libraries/dtos/content-intelligence/brand-voice.dto';
import {
  VOICE_SAMPLE_FILES_FIELD,
  VOICE_SAMPLE_FILE_LIMITS,
} from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice-wiring.contract';
import {
  VoiceService,
  type VoiceActor,
} from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice.service';
import {
  VoiceUploadBatchGuard,
  VoiceUploadExceptionFilter,
  originalFileName,
} from './brand-voice.upload';

/**
 * The routes behind screens 01–10 of the voice section.
 *
 * Three habits taken from `content-source.controller.ts`, and each of them is
 * load-bearing rather than stylistic.
 *
 * The organisation arrives through `@GetOrgFromRequest` and never through a
 * body. A tenant a caller can name is a tenant a caller can pick.
 *
 * Every changing route carries `@CheckPolicies`. Without it the `restricted`
 * state the screens draw stays a drawing: a member would be refused by the
 * service and told so, but a member would also have been able to write.
 *
 * `safeHttpError` puts the code on the wire. The screens branch on
 * `VoiceErrorBodyV1.code`, and a generic 500 over a server that named the
 * reason is a reason thrown away between two processes.
 */

type RequestOrganization = Organization & {
  users?: Array<{ role: OrganizationRole }>;
};

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
        message: error instanceof Error ? error.message : 'Voice request failed',
        ...('subject' in error && error.subject
          ? { subject: error.subject }
          : {}),
      },
      error.status
    );
  }
  throw error;
}

/**
 * Managing a voice is an administrator's right; reading one is a member's.
 *
 * The role is read the same way `brand-profile.controller.ts` reads it, so the
 * two sections of the same product cannot disagree about who may change a
 * profile.
 */
const canManageVoice = (organization: RequestOrganization): boolean =>
  isOrganizationAdmin(organization.users?.[0]?.role);

@ApiTags('Content intelligence · brand voice')
@Controller('/content-intelligence/voice')
export class BrandVoiceController {
  constructor(private readonly _voice: VoiceService) {}

  /**
   * Whose voice this request is about.
   *
   * `avatarId` arrives in the query rather than in a body because most of
   * these routes are reads and have no body to put it in, and one place to
   * read it from is what keeps a screen from scoping three of its four
   * requests. It is safe to take from the request in a way `organizationId`
   * is not: every query that uses it is already filtered by the organisation,
   * so naming somebody else's avatar finds nothing rather than finding theirs.
   *
   * Absent means "the space's default", which is what every one of these
   * routes meant while a space held exactly one profile.
   */
  private actor(
    organization: RequestOrganization,
    user?: Pick<User, 'id'>,
    avatarId?: string
  ): VoiceActor {
    return {
      organizationId: organization.id,
      userId: user?.id ?? '',
      canManage: canManageVoice(organization),
      ...(avatarId ? { avatarId } : {}),
    };
  }

  /* Screen 01 — the section before a voice exists. */
  @Get('/overview')
  async overview(
    @GetOrgFromRequest() organization: RequestOrganization,
    @Query('avatar') avatar?: string
  ) {
    try {
      return await this._voice.overview(this.actor(organization, undefined, avatar));
    } catch (error) {
      safeHttpError(error);
    }
  }

  /* Screen 02 — three ways in. */
  @Get('/paths')
  async paths(@GetOrgFromRequest() organization: RequestOrganization) {
    try {
      return await this._voice.pathsScreen(this.actor(organization));
    } catch (error) {
      safeHttpError(error);
    }
  }

  /* Screen 03 — the corpus. */
  @Get('/samples')
  async samples(
    @GetOrgFromRequest() organization: RequestOrganization,
    @Query('avatar') avatar?: string
  ) {
    try {
      return await this._voice.samples(this.actor(organization, undefined, avatar));
    } catch (error) {
      safeHttpError(error);
    }
  }

  // The body ceiling and its named refusal both live in `main.ts`'s
  // `createVoicePasteBodyLimiter()`, ahead of this route rather than in a
  // guard on it — that middleware runs before the parser rather than after,
  // which a guard here cannot. `VOICE_PAYLOAD_TOO_LARGE` also covers the
  // batch's total character count, checked in `VoiceService.intake` because
  // a `class-validator` failure would arrive as a shapeless 400 rather than
  // this code.
  @Post('/samples')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async addSamples(
    @GetOrgFromRequest() organization: RequestOrganization,
    @GetUserFromRequest() user: User,
    @Body() body: VoiceSampleIntakeDto,
    @Query('avatar') avatar?: string
  ) {
    try {
      return await this._voice.intake(
        this.actor(organization, user, avatar),
        body
      );
    } catch (error) {
      safeHttpError(error);
    }
  }

  /**
   * The same corpus, arriving as files instead of as text.
   *
   * Multipart, and a route of its own. Three things made the JSON route beside
   * it impossible to reuse: its body limit is express's own 100 KB, base64
   * would inflate a twenty-megabyte file to twenty-seven, and the global
   * `ValidationPipe` would walk all of it as one string. Multipart never
   * reaches the JSON parser, so `main.ts` needs nothing added for this.
   *
   * `/media/upload-server` was the other candidate and is worse than a new
   * route: it accepts eight media types, writes the bytes into a publicly
   * served directory, files a row in the media library and never deletes
   * either — the exact opposite of what `retentionUntil` promises about
   * somebody else's writing.
   *
   * There is no virus scan here and that is a considered position rather than
   * an omission: the bytes are never stored, never served and never executed.
   * They live for the length of one parse, in a directory only this server can
   * read, inside a process that cannot outlive eight seconds or 512 MB.
   */
  @Post('/samples/files')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  @UseGuards(VoiceUploadBatchGuard)
  @UseFilters(VoiceUploadExceptionFilter)
  @UseInterceptors(
    FilesInterceptor(
      VOICE_SAMPLE_FILES_FIELD,
      VOICE_SAMPLE_FILE_LIMITS.maxFilesPerBatch,
      {
        limits: {
          // One number for the browser and for multer. Because the browser
          // refuses first and names the file, the parsers' own `TOO_LARGE`
          // becomes unreachable over HTTP — it stays as their guarantee about
          // their own input, not as a case a person can reach.
          fileSize: VOICE_SAMPLE_FILE_LIMITS.maxFileBytes,
          files: VOICE_SAMPLE_FILE_LIMITS.maxFilesPerBatch,
        },
      }
    )
  )
  async addSampleFiles(
    @GetOrgFromRequest() organization: RequestOrganization,
    @GetUserFromRequest() user: User,
    @UploadedFiles() files: Array<Express.Multer.File> = [],
    @Body() body: VoiceSampleFileIntakeDto,
    @Query('avatar') avatar?: string
  ) {
    try {
      return await this._voice.intakeFiles(
        this.actor(organization, user, avatar),
        (files ?? []).map((file) => ({
          // The name as the person typed it: multipart hands it over in
          // latin1, and «заметка.txt» would otherwise be stored, and printed
          // in the corpus table, as «Ð·Ð°Ð¼ÐµÑÐºÐ°.txt».
          name: originalFileName(file.originalname),
          buffer: file.buffer,
        })),
        body
      );
    } catch (error) {
      safeHttpError(error);
    }
  }

  @Delete('/samples')
  @CheckPolicies([AuthorizationActions.Delete, Sections.ADMIN])
  async deleteSamples(
    @GetOrgFromRequest() organization: RequestOrganization,
    @GetUserFromRequest() user: User,
    @Body() body: VoiceSampleDeleteDto,
    @Query('avatar') avatar?: string
  ) {
    try {
      return await this._voice.deleteSamples(
        this.actor(organization, user, avatar),
        body
      );
    } catch (error) {
      safeHttpError(error);
    }
  }

  /* Screen 04 — the analysis step. */
  @Get('/analysis')
  async analysis(
    @GetOrgFromRequest() organization: RequestOrganization,
    @Query('avatar') avatar?: string
  ) {
    try {
      return await this._voice.analysis(this.actor(organization, undefined, avatar));
    } catch (error) {
      safeHttpError(error);
    }
  }

  @Post('/analysis')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async runAnalysis(
    @GetOrgFromRequest() organization: RequestOrganization,
    @GetUserFromRequest() user: User,
    @Body() body: VoiceAnalysisDto,
    @Query('avatar') avatar?: string
  ) {
    try {
      return await this._voice.runAnalysis(
        this.actor(organization, user, avatar),
        body ?? {}
      );
    } catch (error) {
      safeHttpError(error);
    }
  }

  /**
   * Пересчитать числа действующего голоса без модели.
   *
   * Отдельный маршрут, а не флаг на `POST /analysis`: у них разные последствия
   * и разная цена. Разбор собирает новую версию голоса и стоит вызовов;
   * пересчёт не трогает ни одного слова и не стоит ничего. Одно имя на два
   * действия заставляло бы читателя журнала гадать, за что списаны деньги.
   */
  @Post('/analysis/refresh')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async refreshMeasure(
    @GetOrgFromRequest() organization: RequestOrganization,
    @GetUserFromRequest() user: User,
    @Query('avatar') avatar?: string
  ) {
    try {
      return await this._voice.refreshMeasure(
        this.actor(organization, user, avatar)
      );
    } catch (error) {
      safeHttpError(error);
    }
  }

  /* Screen 05 — the proposal. */
  @Get('/proposal')
  async proposal(
    @GetOrgFromRequest() organization: RequestOrganization,
    @Query('avatar') avatar?: string
  ) {
    try {
      return await this._voice.proposal(this.actor(organization, undefined, avatar));
    } catch (error) {
      safeHttpError(error);
    }
  }

  @Post('/proposal/portrait')
  @CheckPolicies([AuthorizationActions.Update, Sections.ADMIN])
  async proposalPortrait(
    @GetOrgFromRequest() organization: RequestOrganization,
    @GetUserFromRequest() user: User,
    @Body() body: VoiceProposalPortraitDto,
    @Query('avatar') avatar?: string
  ) {
    try {
      return await this._voice.proposalPortrait(
        this.actor(organization, user, avatar),
        body
      );
    } catch (error) {
      safeHttpError(error);
    }
  }

  @Post('/proposal/field')
  @CheckPolicies([AuthorizationActions.Update, Sections.ADMIN])
  async proposalField(
    @GetOrgFromRequest() organization: RequestOrganization,
    @GetUserFromRequest() user: User,
    @Body() body: VoiceProposalFieldDto,
    @Query('avatar') avatar?: string
  ) {
    try {
      return await this._voice.proposalField(
        this.actor(organization, user, avatar),
        body
      );
    } catch (error) {
      safeHttpError(error);
    }
  }

  /**
   * Screen 05 again, for the path that fills the five lines by hand.
   *
   * A read and a write, and the activation below serves both: the consent
   * check is one rule, and two routes checking it separately is how they come
   * to disagree.
   */
  @Get('/proposal/manual')
  async manualProposal(
    @GetOrgFromRequest() organization: RequestOrganization,
    @Query('avatar') avatar?: string
  ) {
    try {
      return await this._voice.manualProposal(this.actor(organization, undefined, avatar));
    } catch (error) {
      safeHttpError(error);
    }
  }

  @Post('/proposal/manual/field')
  @CheckPolicies([AuthorizationActions.Update, Sections.ADMIN])
  async manualProposalField(
    @GetOrgFromRequest() organization: RequestOrganization,
    @GetUserFromRequest() user: User,
    @Body() body: VoiceProposalManualFieldDto,
    @Query('avatar') avatar?: string
  ) {
    try {
      return await this._voice.manualField(
        this.actor(organization, user, avatar),
        body
      );
    } catch (error) {
      safeHttpError(error);
    }
  }

  @Post('/proposal/activate')
  @CheckPolicies([AuthorizationActions.Update, Sections.ADMIN])
  async activateProposal(
    @GetOrgFromRequest() organization: RequestOrganization,
    @GetUserFromRequest() user: User,
    @Body() body: VoiceProposalActivateDto,
    @Query('avatar') avatar?: string
  ) {
    try {
      return await this._voice.activateProposal(
        this.actor(organization, user, avatar),
        body
      );
    } catch (error) {
      safeHttpError(error);
    }
  }

  /* Screen 06 — the passport. */
  @Get('/passport')
  async passport(
    @GetOrgFromRequest() organization: RequestOrganization,
    @Query('avatar') avatar?: string
  ) {
    try {
      return await this._voice.passport(this.actor(organization, undefined, avatar));
    } catch (error) {
      safeHttpError(error);
    }
  }

  @Post('/passport/examples')
  @CheckPolicies([AuthorizationActions.Update, Sections.ADMIN])
  async setExamples(
    @GetOrgFromRequest() organization: RequestOrganization,
    @GetUserFromRequest() user: User,
    @Body() body: VoiceExamplesDto,
    @Query('avatar') avatar?: string
  ) {
    try {
      return await this._voice.setExamples(this.actor(organization, user, avatar), body);
    } catch (error) {
      safeHttpError(error);
    }
  }

  /**
   * One of the five lines, edited on the card that shows it.
   *
   * Distinct from `/proposal/manual/field` on purpose: that one fills a draft
   * that still has to be completed and consented to, this one changes a voice
   * already in force and answers with the passport it just changed.
   */
  @Post('/passport/field')
  @CheckPolicies([AuthorizationActions.Update, Sections.ADMIN])
  async setPassportField(
    @GetOrgFromRequest() organization: RequestOrganization,
    @GetUserFromRequest() user: User,
    @Body() body: VoicePassportFieldDto,
    @Query('avatar') avatar?: string
  ) {
    try {
      return await this._voice.setPassportField(
        this.actor(organization, user, avatar),
        body
      );
    } catch (error) {
      safeHttpError(error);
    }
  }

  /* Screen 07 — the eight scales. */
  @Get('/scales')
  async scales(
    @GetOrgFromRequest() organization: RequestOrganization,
    @Query('avatar') avatar?: string
  ) {
    try {
      return await this._voice.scales(this.actor(organization, undefined, avatar));
    } catch (error) {
      safeHttpError(error);
    }
  }

  @Post('/scales/corridor')
  @CheckPolicies([AuthorizationActions.Update, Sections.ADMIN])
  async setCorridor(
    @GetOrgFromRequest() organization: RequestOrganization,
    @GetUserFromRequest() user: User,
    @Body() body: VoiceScaleCorridorDto,
    @Query('avatar') avatar?: string
  ) {
    try {
      return await this._voice.setCorridor(this.actor(organization, user, avatar), body);
    } catch (error) {
      safeHttpError(error);
    }
  }

  /* Screen 08 — what stayed out of a reference. */
  @Get('/redactions')
  async redactions(
    @GetOrgFromRequest() organization: RequestOrganization,
    @Query('avatar') avatar?: string
  ) {
    try {
      return await this._voice.redactions(this.actor(organization, undefined, avatar));
    } catch (error) {
      safeHttpError(error);
    }
  }

  /**
   * Screen 09 — versions.
   *
   * `from` and `to` name the pair to compare. Both absent means the two newest
   * that were in force, which is what this route answered before the screen
   * above it could ask for anything else.
   */
  @Get('/versions')
  async versions(
    @GetOrgFromRequest() organization: RequestOrganization,
    @Query('avatar') avatar?: string,
    @Query('from') from?: string,
    @Query('to') to?: string
  ) {
    try {
      return await this._voice.versions(
        this.actor(organization, undefined, avatar),
        {
          ...(from ? { from } : {}),
          ...(to ? { to } : {}),
        }
      );
    } catch (error) {
      safeHttpError(error);
    }
  }

  /* ---------------------------------------------------------------------
   * Screen 12 — the avatars of a space
   *
   * The list is a read and open to every member: a person who may pick an
   * avatar in a draft has to be able to see which ones exist. The four writes
   * carry `@CheckPolicies`, so «Аватары заводит владелец» is enforced and not
   * merely drawn.
   *
   * `/avatars` is declared above `/avatars/update` and `/avatars/default`
   * only by accident of reading order — Nest matches on the full path, and
   * these three are distinct paths rather than one path with a parameter,
   * which is exactly why the subject travels in the body.
   * ------------------------------------------------------------------ */

  @Get('/avatars')
  async avatars(@GetOrgFromRequest() organization: RequestOrganization) {
    try {
      return await this._voice.avatars(this.actor(organization));
    } catch (error) {
      safeHttpError(error);
    }
  }

  @Post('/avatars')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async createAvatar(
    @GetOrgFromRequest() organization: RequestOrganization,
    @GetUserFromRequest() user: User,
    @Body() body: VoiceAvatarCreateDto
  ) {
    try {
      return await this._voice.createAvatar(
        this.actor(organization, user),
        body ?? {}
      );
    } catch (error) {
      safeHttpError(error);
    }
  }

  @Post('/avatars/update')
  @CheckPolicies([AuthorizationActions.Update, Sections.ADMIN])
  async updateAvatar(
    @GetOrgFromRequest() organization: RequestOrganization,
    @GetUserFromRequest() user: User,
    @Body() body: VoiceAvatarUpdateDto
  ) {
    try {
      return await this._voice.updateAvatar(
        this.actor(organization, user),
        body
      );
    } catch (error) {
      safeHttpError(error);
    }
  }

  @Post('/avatars/default')
  @CheckPolicies([AuthorizationActions.Update, Sections.ADMIN])
  async setDefaultAvatar(
    @GetOrgFromRequest() organization: RequestOrganization,
    @GetUserFromRequest() user: User,
    @Body() body: VoiceAvatarDefaultDto
  ) {
    try {
      return await this._voice.setDefaultAvatar(
        this.actor(organization, user),
        body
      );
    } catch (error) {
      safeHttpError(error);
    }
  }

  /**
   * Removing an avatar, with its successor named in the same request.
   *
   * One request rather than "delete, then set the default": the second of two
   * requests can fail on its own, and a space left with a deleted default and
   * nobody promoted would write neutrally while four avatars sat on the list.
   */
  @Delete('/avatars')
  @CheckPolicies([AuthorizationActions.Delete, Sections.ADMIN])
  async deleteAvatar(
    @GetOrgFromRequest() organization: RequestOrganization,
    @GetUserFromRequest() user: User,
    @Body() body: VoiceAvatarDeleteDto
  ) {
    try {
      return await this._voice.deleteAvatar(
        this.actor(organization, user),
        body
      );
    } catch (error) {
      safeHttpError(error);
    }
  }

  @Post('/versions/restore')
  @CheckPolicies([AuthorizationActions.Update, Sections.ADMIN])
  async restoreVersion(
    @GetOrgFromRequest() organization: RequestOrganization,
    @GetUserFromRequest() user: User,
    @Body() body: VoiceVersionRestoreDto,
    @Query('avatar') avatar?: string
  ) {
    try {
      return await this._voice.restoreVersion(
        this.actor(organization, user, avatar),
        body.versionId
      );
    } catch (error) {
      safeHttpError(error);
    }
  }

  /**
   * Taking the voice out of use.
   *
   * A delete rather than a deactivate route because that is the word the
   * person uses; what it removes is the voice in force, not the texts it was
   * measured on. Those go one at a time from the corpus screen, which is the
   * separation somebody asking "delete my writing" actually means.
   */
  @Delete('/profile')
  @CheckPolicies([AuthorizationActions.Delete, Sections.ADMIN])
  async deleteProfile(
    @GetOrgFromRequest() organization: RequestOrganization,
    @GetUserFromRequest() user: User,
    @Query('avatar') avatar?: string
  ) {
    try {
      return await this._voice.deleteProfile(this.actor(organization, user, avatar));
    } catch (error) {
      safeHttpError(error);
    }
  }

  /* Screen 10 — the applied-voice strip. */
  @Get('/ribbon')
  async ribbon(
    @GetOrgFromRequest() organization: RequestOrganization,
    @Query('avatar') avatar?: string
  ) {
    try {
      return await this._voice.ribbon(this.actor(organization, undefined, avatar));
    } catch (error) {
      safeHttpError(error);
    }
  }

  @Post('/injection-plan')
  async injectionPlan(
    @GetOrgFromRequest() organization: RequestOrganization,
    @Body() body: VoiceInjectionPlanDto,
    @Query('avatar') avatar?: string
  ) {
    try {
      return await this._voice.injectionPlan(this.actor(organization, undefined, avatar), body);
    } catch (error) {
      safeHttpError(error);
    }
  }

  @Post('/text-check')
  async textCheck(
    @GetOrgFromRequest() organization: RequestOrganization,
    @Body() body: VoiceTextCheckDto,
    @Query('avatar') avatar?: string
  ) {
    try {
      return await this._voice.textCheck(this.actor(organization, undefined, avatar), body);
    } catch (error) {
      safeHttpError(error);
    }
  }

  /**
   * One sentence rewritten under this voice. Nothing is saved and nothing is
   * applied: the answer is a proposal beside the original.
   */
  @Post('/text-check/repair')
  async repairSentence(
    @GetOrgFromRequest() organization: RequestOrganization,
    @Body() body: VoiceRepairDto,
    @Query('avatar') avatar?: string
  ) {
    try {
      return await this._voice.repairSentence(this.actor(organization, undefined, avatar), body);
    } catch (error) {
      safeHttpError(error);
    }
  }
}
