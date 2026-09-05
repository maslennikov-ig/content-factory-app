import { Injectable } from '@nestjs/common';
import { PrismaRepository } from '@contentfactory/nestjs-libraries/database/prisma/prisma.service';
import { BrandProfileRepository } from '@contentfactory/nestjs-libraries/content-intelligence/brand-profile/brand-profile.repository';
import {
  BRAND_PROFILE_MAX_PROMPT_CHARACTERS_V1,
  digestBrandProfileContent,
  renderBrandProfilePromptV1,
  validateBrandProfileContent,
} from '@contentfactory/nestjs-libraries/content-intelligence/brand-profile/brand-profile.validation';
import type {
  BrandProfileContentV1,
  BrandProfileRecordV1,
  BrandProfileVersionRecordV1,
} from '@contentfactory/nestjs-libraries/content-intelligence/brand-profile/brand-profile.types';
import { MAX_AVATARS_PER_SPACE } from '@contentfactory/nestjs-libraries/content-intelligence/brand-profile/brand-profile.types';
import { VoiceError } from './voice-errors';

/**
 * Voice profile versions, on top of the versions the product already has.
 *
 * `brand-profile.repository.ts` already owns `ProjectBrandProfile` and its
 * versions: creation, activation, the audit trail, the digest check that
 * refuses a corrupted row. None of that is written again here. What this file
 * adds is the one behaviour the voice section needs and the brand profile does
 * not have a name for.
 *
 * Restoring an old version writes a new one. `restoreVersion` on the brand
 * profile repository re-points the active pointer, which is the right meaning
 * there; here the screen promises a history where "вернулись к версии 2"
 * remains visible as an event that happened after version 3. Cloning the old
 * version and activating the clone gives exactly that: both versions survive,
 * and the newest one says what it came from.
 */

type PrismaClientLike = Record<string, any>;

/**
 * The audit row that says which draft the manual wizard is filling in.
 *
 * A draft version already survives a reload, carries a revision and has its
 * content checked against its own digest; what it does not carry is "this is
 * the one the wizard opened". That pointer is an event — somebody opened a
 * hand-filled voice at a moment in time — and `BrandProfileAuditEvent` is
 * where this profile's events already live, indexed by
 * `(organizationId, action, createdAt)`. A column, a table or a second row
 * type would each be a migration for a fact the audit trail already has a
 * shape for.
 */
export const MANUAL_DRAFT_OPENED = 'VOICE_MANUAL_DRAFT_OPENED';

export type VoiceProfileOverview = {
  profile: BrandProfileRecordV1 | null;
  versions: BrandProfileVersionRecordV1[];
  activeVersion: BrandProfileVersionRecordV1 | null;
};

@Injectable()
export class VoiceProfileRepository {
  constructor(
    private readonly _profiles: BrandProfileRepository,
    private readonly _database: PrismaRepository<any>
  ) {}

  private client(): PrismaClientLike {
    return this._database.model as PrismaClientLike;
  }

  /**
   * Drafts included: a voice under construction is exactly what screens 04 and
   * 05 are looking at, and hiding it would make the wizard show nothing until
   * the moment it shows everything.
   */
  async overview(
    organizationId: string,
    avatarId?: string
  ): Promise<VoiceProfileOverview> {
    const { profile, versions } = await this._profiles.getOverview(
      organizationId,
      true,
      avatarId
    );
    const activeVersion =
      (profile?.activeVersionId &&
        versions.find((version) => version.id === profile.activeVersionId)) ||
      null;
    return { profile, versions, activeVersion };
  }

  /**
   * Что аватар уже выучил на правках, как оно лежит в колонке.
   *
   * Сырым `unknown`: это Json, и разбирает его `parseLearnedRules` — один раз
   * и в одном месте, чтобы строка, дописанная руками в базу, не разошлась в
   * двух читателях по-разному.
   */
  async learnedRules(
    organizationId: string,
    profileId: string
  ): Promise<unknown> {
    const row = (await this.client().projectBrandProfile.findFirst({
      where: { organizationId, id: profileId },
      select: { learnedRules: true },
    })) as { learnedRules?: unknown } | null;
    return row?.learnedRules ?? null;
  }

  /**
   * Записать выученное. `updateMany` с `organizationId` в условии, а не
   * `update` по одному `id`: аватар чужого пространства должен не найтись, а
   * не обновиться.
   */
  async saveLearnedRules(
    organizationId: string,
    profileId: string,
    value: unknown
  ): Promise<number> {
    const result = await this.client().projectBrandProfile.updateMany({
      where: { organizationId, id: profileId },
      data: { learnedRules: value as never },
    });
    return Number(result?.count ?? 0);
  }

  getVersion(organizationId: string, versionId: string) {
    return this._profiles.getVersion(organizationId, versionId);
  }

  /**
   * Every version of this profile holding exactly this content: its ids, and
   * the analyses stamped on them.
   *
   * Restoring an old voice does not move a pointer — it clones the version,
   * and `cloneVersion` copies the content and its digest verbatim. So a
   * restored clone carries no stamp of its own and would read as never
   * analysed: the passport loses its numbers, and `setCorridor` and
   * `textCheck` — which refuse outright without a measurement — take away
   * corridors that worked a minute earlier.
   *
   * Matched on the content digest rather than by walking `parentVersionId`,
   * because the digest is the actual claim being made. An analysis explains a
   * body of content, not a row: two versions with the same digest hold the
   * same five fields, so a measurement that explains one explains the other,
   * related or not.
   *
   * A different digest lends nothing, which is the whole point. A voice
   * edited or hand-written on top of a measured one descends from it and
   * holds other content, and borrowing its parent's numbers would be exactly
   * the lie vme.11 removed, arriving through the back door.
   *
   * Both lists come back because the stamp changed sides. `measurementIds`
   * reads `ProjectBrandProfileVersion.measurementId`, written at activation
   * from vme.18 on; `versionIds` is what the caller falls back to for rows
   * activated before that, which only exist on the measurement's own column.
   */
  async peersWithSameContent(
    organizationId: string,
    version: BrandProfileVersionRecordV1
  ): Promise<{ versionIds: string[]; measurementIds: string[] }> {
    const rows = (await this.client().projectBrandProfileVersion.findMany({
      where: {
        organizationId,
        profileId: version.profileId,
        contentDigest: version.contentDigest,
      },
    })) as Array<{ id: string; measurementId?: string | null }>;
    const versionIds = rows.map((row) => row.id);
    if (!versionIds.includes(version.id)) versionIds.unshift(version.id);
    const measurementIds = [
      ...new Set(
        rows
          .map((row) => row.measurementId)
          .filter((id): id is string => typeof id === 'string' && !!id)
      ),
    ];
    return { versionIds, measurementIds };
  }

  /**
   * Says which analysis explains a version, on the version itself.
   *
   * Writing here rather than moving `BrandVoiceMeasurement.profileVersionId`
   * is the whole of the vme.18 fix: one analysis becomes as many versions as
   * somebody activates from it, and a column on the measurement could only
   * ever name the last one — leaving every earlier voice reading as never
   * analysed.
   */
  async stampMeasurement(
    organizationId: string,
    versionId: string,
    measurementId: string
  ): Promise<number> {
    const changed = await this.client().projectBrandProfileVersion.updateMany({
      where: { organizationId, id: versionId },
      data: { measurementId },
    });
    return changed.count;
  }

  createDraft(
    organizationId: string,
    actorUserId: string,
    content: BrandProfileContentV1,
    label?: string,
    avatarId?: string
  ) {
    return this._profiles.createDraft(
      organizationId,
      actorUserId,
      { label, content },
      digestBrandProfileContent(content),
      avatarId
    );
  }

  /* ---------------------------------------------------------------------
   * Avatars — screen 12
   *
   * Pass-throughs, because `ProjectBrandProfile` is owned by
   * `brand-profile.repository.ts` and a second file writing that table is how
   * the "exactly one default" invariant comes to be enforced twice and agreed
   * on never. What this layer adds is the section's own words for the
   * refusals, in `namedAvatarFailure`.
   * ------------------------------------------------------------------ */

  listAvatars(organizationId: string) {
    return this._profiles.listAvatars(organizationId);
  }

  async createAvatar(
    organizationId: string,
    actorUserId: string,
    input: { name?: string; kind?: 'PERSON' | 'BRAND' }
  ) {
    try {
      return await this._profiles.createAvatar(
        organizationId,
        actorUserId,
        input
      );
    } catch (error) {
      throw this.namedAvatarFailure('', error);
    }
  }

  async updateAvatar(
    organizationId: string,
    actorUserId: string,
    avatarId: string,
    input: { name?: string; kind?: 'PERSON' | 'BRAND' }
  ) {
    try {
      return await this._profiles.updateAvatar(
        organizationId,
        actorUserId,
        avatarId,
        input
      );
    } catch (error) {
      throw this.namedAvatarFailure(avatarId, error);
    }
  }

  async setDefaultAvatar(
    organizationId: string,
    actorUserId: string,
    avatarId: string
  ) {
    try {
      return await this._profiles.setDefaultAvatar(
        organizationId,
        actorUserId,
        avatarId
      );
    } catch (error) {
      throw this.namedAvatarFailure(avatarId, error);
    }
  }

  async deleteAvatar(
    organizationId: string,
    actorUserId: string,
    avatarId: string,
    successorId?: string
  ) {
    try {
      return await this._profiles.deleteAvatar(
        organizationId,
        actorUserId,
        avatarId,
        successorId
      );
    } catch (error) {
      throw this.namedAvatarFailure(avatarId, error);
    }
  }

  /**
   * The avatar refusals, said in the words the screen prints.
   *
   * Separate from `named` above rather than folded into it: that map speaks
   * about versions — «Версия голоса не найдена» — and an avatar that does not
   * exist is not a version that does not exist. One map answering both would
   * make every one of these four sentences wrong in one of its two callers.
   */
  private namedAvatarFailure(avatarId: string, error: unknown): unknown {
    if (
      !(error instanceof Error) ||
      error.name !== 'BrandProfileRepositoryError'
    ) {
      return error;
    }
    const details = (error as { details?: Record<string, unknown> }).details;
    switch ((error as { code?: string }).code) {
      case 'NOT_FOUND':
        return new VoiceError(
          'VOICE_AVATAR_NOT_FOUND',
          'Такого аватара в пространстве нет: возможно, его удалили в другой вкладке.',
          avatarId
        );
      case 'AVATAR_LIMIT':
        return new VoiceError(
          'VOICE_AVATAR_LIMIT',
          `В пространстве уже ${
            details?.limit ?? MAX_AVATARS_PER_SPACE
          } аватаров из ${
            details?.limit ?? MAX_AVATARS_PER_SPACE
          }. Удалите ненужный или расширьте тариф.`,
          avatarId
        );
      case 'AVATAR_NOT_ANALYSED':
        return new VoiceError(
          'VOICE_AVATAR_NOT_ANALYSED',
          'Аватар без разбора писать не может, поэтому и по умолчанию стоять не может. Соберите для него образцы.',
          avatarId
        );
      case 'SUCCESSOR_REQUIRED':
        return new VoiceError(
          'VOICE_AVATAR_SUCCESSOR_REQUIRED',
          'Это аватар по умолчанию: назовите, кто станет писать вместо него.',
          avatarId
        );
      case 'DEPENDENCIES_ACTIVE':
        return new VoiceError(
          'VOICE_VERSION_CONFLICT',
          'На версии этого аватара ещё ссылается работа, которая не завершена.',
          avatarId
        );
      default:
        return error;
    }
  }

  /**
   * A draft written over, with the revision it was read at.
   *
   * The refusal is named here rather than left bare: two tabs filling the same
   * hand-written voice is the ordinary way this collides, and «версия
   * изменилась» is something a person can act on where a 500 is not.
   */
  async updateDraft(
    organizationId: string,
    actorUserId: string,
    versionId: string,
    content: BrandProfileContentV1,
    expectedRevision: number,
    label?: string
  ) {
    try {
      return await this._profiles.updateDraft(
        organizationId,
        actorUserId,
        versionId,
        { label, content, expectedRevision },
        digestBrandProfileContent(content)
      );
    } catch (error) {
      throw this.named(versionId, error);
    }
  }

  /**
   * The draft the manual wizard is filling in, if there still is one.
   *
   * Read back through its lifecycle rather than through the pointer alone: the
   * same row becomes `PUBLISHED` the moment the voice is activated, and a
   * pointer that kept naming it would send the next visit to the wizard into a
   * published version it is not allowed to edit. `null` here means "start a new
   * one", which is exactly what happened.
   */
  async manualDraft(
    organizationId: string
  ): Promise<BrandProfileVersionRecordV1 | null> {
    const pointer = (await this.client().brandProfileAuditEvent.findFirst({
      where: { organizationId, action: MANUAL_DRAFT_OPENED },
      orderBy: { createdAt: 'desc' },
    })) as { versionId?: string | null } | null;
    if (!pointer?.versionId) return null;
    const version = await this._profiles.getVersion(
      organizationId,
      pointer.versionId
    );
    return version && version.lifecycle === 'DRAFT' ? version : null;
  }

  /**
   * A new hand-filled draft, and the pointer to it, in that order.
   *
   * The pointer is written after the draft exists, so a failed creation leaves
   * no event claiming a version that was never made.
   */
  async createManualDraft(
    organizationId: string,
    actorUserId: string,
    content: BrandProfileContentV1,
    label?: string,
    avatarId?: string
  ): Promise<BrandProfileVersionRecordV1> {
    const draft = await this.createDraft(
      organizationId,
      actorUserId,
      content,
      label,
      avatarId
    );
    await this.client().brandProfileAuditEvent.create({
      data: {
        organizationId,
        profileId: draft.profileId,
        versionId: draft.id,
        actorUserId,
        action: MANUAL_DRAFT_OPENED,
        toVersionId: draft.id,
        revision: draft.revision,
        contentDigest: draft.contentDigest,
      },
    });
    return draft;
  }

  /**
   * The refusals of the layer underneath, said in this section's words.
   *
   * `BrandProfileRepository` throws `BrandProfileRepositoryError`, which
   * carries a `code` and no `status`. `safeHttpError` in the controllers maps
   * only errors carrying both, so an unconverted one leaves as a bare 500 and
   * the screen has nothing to branch on — it can say «что-то пошло не так» and
   * nothing else. Every refusal that can reach a person is therefore given a
   * name here.
   *
   * Anything else is returned untouched. Dressing an unknown failure as a
   * known refusal is worse than the 500: it claims to know what happened.
   *
   * It returns the error for `throw` at the call site rather than wrapping the
   * call itself. A generic wrapper reads better and costs the return type of
   * every call it wraps: inference gives up and hands `unknown` back, which
   * `tsc` only notices in the image build, long after the suite is green.
   */
  private named(versionId: string, error: unknown): unknown {
    if (
      !(error instanceof Error) ||
      error.name !== 'BrandProfileRepositoryError'
    ) {
      return error;
    }
    switch ((error as { code?: string }).code) {
      case 'NOT_FOUND':
        return new VoiceError(
          'VOICE_VERSION_NOT_FOUND',
          'Версия голоса не найдена',
          versionId
        );
      case 'REVISION_CONFLICT':
        return new VoiceError(
          'VOICE_VERSION_CONFLICT',
          'Версия изменилась, пока вы смотрели на неё. Обновите историю и повторите.',
          versionId
        );
      case 'VERSION_IMMUTABLE':
        return new VoiceError(
          'VOICE_VERSION_CONFLICT',
          'Опубликованную версию нельзя править: вернитесь к ней и правьте копию.',
          versionId
        );
      case 'VERSION_UNAVAILABLE':
        return new VoiceError(
          'VOICE_VERSION_CONFLICT',
          'Содержимое версии не сходится с её отпечатком, поэтому включать её нельзя.',
          versionId
        );
      case 'DEPENDENCIES_ACTIVE':
        return new VoiceError(
          'VOICE_VERSION_CONFLICT',
          'На эту версию ещё ссылается работа, которая не завершена.',
          versionId
        );
      default:
        return error;
    }
  }

  /**
   * The validator's own codes, said in words a person can act on.
   *
   * Not exhaustive by construction: `contentFrom` in `voice.service.ts` only
   * ever leaves these three completeness rules unmet — it never produces an
   * unknown field or a bad enum, so nothing else reaches this map in
   * practice. An issue this map does not know still gets a message, just a
   * generic one; the refusal is never silent about there being a problem,
   * only occasionally silent about naming it.
   */
  private static readonly ISSUE_NAMES: Record<string, string> = {
    'project.contentGoals:required': 'цели контента',
    'project.audiences:required': 'аудитории',
    'voice.traits:invalid_count': 'черты голоса (кто говорит, каким тоном)',
  };

  /**
   * The one rule every door that turns a version on must agree on.
   *
   * `BrandProfileService.activateVersion` runs this same check for the form.
   * Shared here rather than duplicated so activating a draft and restoring an
   * old version — two different call sites, two different sentences — cannot
   * quietly drift apart on what "complete enough" means.
   */
  private incompleteFields(content: BrandProfileContentV1): string[] | null {
    const validation = validateBrandProfileContent(content, {
      forActivation: true,
    });
    const issues = 'issues' in validation ? [...validation.issues] : [];
    if (
      renderBrandProfilePromptV1(content).length >
      BRAND_PROFILE_MAX_PROMPT_CHARACTERS_V1
    ) {
      issues.push('prompt_fragment:too_large');
    }
    return issues.length ? issues : null;
  }

  /** "не хватает обязательных полей — X, Y", named where the map knows how. */
  private missingFieldsPhrase(issues: readonly string[]): string {
    const missing = [
      ...new Set(
        issues
          .map((issue) => VoiceProfileRepository.ISSUE_NAMES[issue])
          .filter((name): name is string => Boolean(name))
      ),
    ];
    return missing.length
      ? `не хватает обязательных полей — ${missing.join(', ')}`
      : 'не хватает обязательных полей, которые требует форма «Профиль бренда»';
  }

  private assertActivatable(version: BrandProfileVersionRecordV1) {
    if (version.lifecycle !== 'DRAFT') return;
    const issues = this.incompleteFields(version.content);
    if (!issues) return;

    // This refusal never turns off the voice already in force — it only
    // blocks the version that would have replaced it, and that version stays
    // a draft until the missing fields are filled in and activation is tried
    // again.
    throw new VoiceError(
      'VOICE_FIELDS_INCOMPLETE',
      `Этот голос нельзя включить: в профиле бренда ${this.missingFieldsPhrase(
        issues
      )}. Заполните их в форме «Профиль бренда» и повторите активацию — уже действующий голос от этого не выключается и продолжает работать.`,
      issues.join(', ')
    );
  }

  async activate(
    organizationId: string,
    actorUserId: string,
    versionId: string
  ) {
    const version = await this._profiles.getVersion(organizationId, versionId);
    if (!version) {
      throw new VoiceError(
        'VOICE_VERSION_NOT_FOUND',
        'Версия голоса не найдена',
        versionId
      );
    }
    this.assertActivatable(version);
    try {
      return await this._profiles.activateVersion(
        organizationId,
        actorUserId,
        versionId,
        { revision: version.revision, contentDigest: version.contentDigest }
      );
    } catch (error) {
      throw this.named(versionId, error);
    }
  }

  /**
   * Going back to an earlier version, without editing the past.
   *
   * The clone carries `parentVersionId` to the version it came from, so the
   * comparison screen can say what was restored rather than only that
   * something changed.
   *
   * Checked on `source.content` before anything is cloned, not on the clone
   * afterward: `cloneVersion` copies the content verbatim, so the two
   * questions have the same answer, and asking it first means a version that
   * would fail never leaves a half-made draft behind. It also means the
   * refusal can be honest about the actual remedy — restoring this exact
   * history will never produce different content to complete, so "fix it and
   * try again" would be a false promise here the way it correctly is not for
   * `assertActivatable` on a hand-edited draft.
   */
  async restoreAsNewVersion(
    organizationId: string,
    actorUserId: string,
    versionId: string
  ): Promise<{
    from: BrandProfileVersionRecordV1;
    created: BrandProfileVersionRecordV1;
  }> {
    const source = await this._profiles.getVersion(organizationId, versionId);
    if (!source) {
      throw new VoiceError(
        'VOICE_VERSION_NOT_FOUND',
        'Версия голоса не найдена',
        versionId
      );
    }
    const issues = this.incompleteFields(source.content);
    if (issues) {
      throw new VoiceError(
        'VOICE_FIELDS_INCOMPLETE',
        `Эту версию нельзя восстановить: в её содержимом ${this.missingFieldsPhrase(
          issues
        )}. Восстановление вернёт версию с тем же пробелом — если нужен похожий голос, соберите его заново в форме «Профиль бренда». Действующий голос при этом не меняется.`,
        issues.join(', ')
      );
    }
    try {
      const draft = await this._profiles.cloneVersion(
        organizationId,
        actorUserId,
        versionId
      );
      const activated = await this._profiles.activateVersion(
        organizationId,
        actorUserId,
        draft.id,
        { revision: draft.revision, contentDigest: draft.contentDigest }
      );
      return { from: source, created: activated.version };
    } catch (error) {
      throw this.named(versionId, error);
    }
  }

  /**
   * Taking the voice out of use without taking the history out of the database.
   *
   * The pointer to the active version is cleared and every version stays where
   * it is. Erasing them would leave already-published posts referring to a
   * voice nobody can look up, and the measurements beside them explaining
   * corridors that no longer have a profile to belong to.
   */
  async deactivate(
    organizationId: string,
    actorUserId: string,
    avatarId?: string
  ) {
    return this._profiles.deactivate(organizationId, actorUserId, avatarId);
  }

  /**
   * The last time the voice was actually used, for the applied-voice strip.
   *
   * Two rows rather than one: the context snapshot says how old the facts
   * behind a generation are, the piece says which voice version wrote it. The
   * strip reports "voice-moved" only when those two disagree with the version
   * in force, which is a comparison and not a guess.
   */
  async latestUsage(organizationId: string): Promise<{
    snapshot: {
      id: string;
      builtAt: Date;
      purpose: string;
      brandProfileVersionId: string | null;
      selectedFactCount: number;
      selectedEvidenceCount: number;
      expiresAt: Date;
    } | null;
    piece: {
      id: string;
      title: string;
      brandProfileVersionId: string | null;
      createdAt: Date;
    } | null;
  }> {
    const [snapshot, piece] = await Promise.all([
      this.client().contentContextSnapshot.findFirst({
        where: { organizationId, invalidatedAt: null },
        orderBy: { builtAt: 'desc' },
      }),
      this.client().contentPiece.findFirst({
        where: { organizationId, archivedAt: null },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return { snapshot: snapshot ?? null, piece: piece ?? null };
  }

  /**
   * Who changed a version, in the words the versions screen prints.
   *
   * A user id in that column would be an identifier shown to a person who has
   * no way to resolve it.
   */
  async actorNames(userIds: readonly string[]): Promise<Map<string, string>> {
    const unique = [...new Set(userIds.filter(Boolean))];
    if (!unique.length) return new Map();
    const users = (await this.client().user.findMany({
      where: { id: { in: unique } },
      select: { id: true, name: true, email: true },
    })) as Array<{ id: string; name: string | null; email: string }>;
    return new Map(
      users.map((user) => [user.id, user.name?.trim() || user.email])
    );
  }
}
