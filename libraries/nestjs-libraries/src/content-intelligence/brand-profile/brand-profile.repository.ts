import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  PrismaRepository,
  PrismaTransaction,
} from '@contentfactory/nestjs-libraries/database/prisma/prisma.service';
import type {
  BrandAvatarCreateV1,
  BrandAvatarRowV1,
  BrandAvatarUpdateV1,
  BrandProfileContentV1,
  BrandProfileDraftInputV1,
  BrandProfileDraftUpdateV1,
  BrandProfileRecordV1,
  BrandProfileVersionRecordV1,
} from '@contentfactory/nestjs-libraries/content-intelligence/brand-profile/brand-profile.types';
import {
  BrandProfileRepositoryError,
  DEFAULT_AVATAR_FIRST,
  MAX_AVATARS_PER_SPACE,
} from '@contentfactory/nestjs-libraries/content-intelligence/brand-profile/brand-profile.types';

import { digestBrandProfileContent } from '@contentfactory/nestjs-libraries/content-intelligence/brand-profile/brand-profile.validation';

type PrismaClientLike = Record<string, any>;

export const BRAND_PROFILE_SERIALIZABLE_MAX_ATTEMPTS = 3;

export type PinnedBrandProfileSerializableWrite<T> = (
  transaction: Prisma.TransactionClient,
  version: BrandProfileVersionRecordV1
) => Promise<T>;

@Injectable()
export class BrandProfileRepository {
  constructor(
    private readonly _database: PrismaRepository<any>,
    private readonly _transaction: PrismaTransaction
  ) {}

  private client() {
    return this._database.model as PrismaClientLike;
  }

  private transact<T>(work: (client: PrismaClientLike) => Promise<T>) {
    return (this._transaction.model as any).$transaction(work);
  }

  private async transactSerializable<T>(
    work: (client: PrismaClientLike) => Promise<T>
  ): Promise<T> {
    let lastConflict: unknown;
    for (
      let attempt = 1;
      attempt <= BRAND_PROFILE_SERIALIZABLE_MAX_ATTEMPTS;
      attempt += 1
    ) {
      try {
        return await (this._transaction.model as any).$transaction(work, {
          isolationLevel: 'Serializable',
          maxWait: 5_000,
          timeout: 10_000,
        });
      } catch (error: any) {
        if (error?.code !== 'P2034') throw error;
        lastConflict = error;
        if (attempt === BRAND_PROFILE_SERIALIZABLE_MAX_ATTEMPTS) throw error;
      }
    }
    throw lastConflict;
  }

  private assertVersionIntegrity(version: BrandProfileVersionRecordV1) {
    try {
      if (
        digestBrandProfileContent(version.content) === version.contentDigest
      ) {
        return;
      }
    } catch {
      // Corrupt persisted JSON and a digest mismatch have the same outward
      // availability semantics. Neither may reach a prompt or pointer write.
    }
    throw new BrandProfileRepositoryError('VERSION_UNAVAILABLE');
  }

  /**
   * The avatar a request is about: the one it named, or the space's default.
   *
   * One place decides this, because "which profile" used to be a question with
   * exactly one answer and is now a question with up to eight. A named avatar
   * that does not exist is `null` rather than a silent fall-back to the
   * default: answering with somebody else's voice is worse than answering with
   * none, and every caller here already draws the empty case.
   */
  private avatarWhere(organizationId: string, avatarId?: string) {
    return avatarId
      ? { organizationId, id: avatarId }
      : { organizationId };
  }

  async getOverview(
    organizationId: string,
    includeDrafts: boolean,
    avatarId?: string
  ) {
    const profile = (await this.client().projectBrandProfile.findFirst({
      orderBy: DEFAULT_AVATAR_FIRST,
      where: {
        ...this.avatarWhere(organizationId, avatarId),
        ...(includeDrafts ? {} : { deletedAt: null }),
      },
    })) as BrandProfileRecordV1 | null;
    if (!profile) return { profile: null, versions: [] };

    const versions = (await this.client().projectBrandProfileVersion.findMany({
      where: {
        organizationId,
        profileId: profile.id,
        ...(includeDrafts ? {} : { lifecycle: 'PUBLISHED' }),
      },
      orderBy: { versionNumber: 'desc' },
    })) as BrandProfileVersionRecordV1[];
    return { profile, versions };
  }

  getVersion(organizationId: string, versionId: string) {
    return this.client().projectBrandProfileVersion.findFirst({
      where: { organizationId, id: versionId },
    }) as Promise<BrandProfileVersionRecordV1 | null>;
  }

  async getActiveRuntimeVersion(organizationId: string) {
    const profile = (await this.client().projectBrandProfile.findFirst({
      orderBy: DEFAULT_AVATAR_FIRST,
      where: { organizationId, deletedAt: null },
      include: { activeVersion: true },
    })) as
      | (BrandProfileRecordV1 & {
          activeVersion: BrandProfileVersionRecordV1 | null;
        })
      | null;
    if (!profile?.activeVersionId) return null;
    if (
      !profile.activeVersion ||
      profile.activeVersion.organizationId !== organizationId ||
      profile.activeVersion.lifecycle !== 'PUBLISHED'
    ) {
      throw new BrandProfileRepositoryError('VERSION_UNAVAILABLE');
    }
    this.assertVersionIntegrity(profile.activeVersion);
    return { profile, version: profile.activeVersion };
  }

  async getPublishedRuntimeVersion(organizationId: string, versionId: string) {
    const version = (await this.client().projectBrandProfileVersion.findFirst({
      where: {
        organizationId,
        id: versionId,
        lifecycle: 'PUBLISHED',
      },
      include: { profile: true },
    })) as
      | (BrandProfileVersionRecordV1 & { profile: BrandProfileRecordV1 })
      | null;
    if (!version || version.profile.deletedAt) return null;
    this.assertVersionIntegrity(version);
    return { profile: version.profile, version };
  }

  /**
   * AutoPost V2 creation uses this boundary so its database insert and the
   * pinned published-version check share one serializable transaction. The
   * callback may perform transaction-owned database writes only; network,
   * model and workflow side effects must happen after commit.
   */
  withPinnedPublishedVersionWrite<T>(
    organizationId: string,
    versionId: string,
    write: PinnedBrandProfileSerializableWrite<T>
  ) {
    return this.transactSerializable(async (client) => {
      const version = (await client.projectBrandProfileVersion.findFirst({
        where: {
          organizationId,
          id: versionId,
          lifecycle: 'PUBLISHED',
        },
        include: { profile: true },
      })) as
        | (BrandProfileVersionRecordV1 & { profile: BrandProfileRecordV1 })
        | null;
      if (!version || version.profile.deletedAt) {
        throw new BrandProfileRepositoryError('VERSION_UNAVAILABLE');
      }
      this.assertVersionIntegrity(version);
      return write(client as Prisma.TransactionClient, version);
    });
  }

  createDraft(
    organizationId: string,
    actorUserId: string,
    input: BrandProfileDraftInputV1,
    contentDigest: string,
    avatarId?: string
  ) {
    return this.transact(async (client) => {
      const existingProfile = (await client.projectBrandProfile.findFirst({
        orderBy: DEFAULT_AVATAR_FIRST,
        where: this.avatarWhere(organizationId, avatarId),
      })) as BrandProfileRecordV1 | null;
      // A named avatar that is gone is a refusal, not an invitation to make a
      // new one: the wizard would otherwise silently start a second avatar
      // under the name of one somebody had just deleted in another tab.
      if (avatarId && !existingProfile) {
        throw new BrandProfileRepositoryError('NOT_FOUND');
      }
      const wasDeleted = Boolean(existingProfile?.deletedAt);
      const profile = (
        existingProfile
          ? wasDeleted
            ? await client.projectBrandProfile.update({
                where: {
                  organizationId_id: {
                    organizationId,
                    id: existingProfile.id,
                  },
                },
                data: { deletedAt: null },
              })
            : existingProfile
          : /**
             * The first avatar of a space is its default.
             *
             * `upsert` keyed on `organizationId` stood here until 2026-08-25,
             * when a space stopped holding exactly one profile. It cannot be
             * `upsert` any more — there is no unique key to upsert on — and it
             * does not need to be: the branch above already established that no
             * profile exists.
             */
            await client.projectBrandProfile.create({
              data: {
                organizationId,
                activeVersionId: null,
                deletedAt: null,
                isDefault: true,
              },
            })
      ) as BrandProfileRecordV1;
      const latest = (await client.projectBrandProfileVersion.findFirst({
        where: { organizationId, profileId: profile.id },
        orderBy: { versionNumber: 'desc' },
      })) as BrandProfileVersionRecordV1 | null;

      let version: BrandProfileVersionRecordV1;
      try {
        version = await client.projectBrandProfileVersion.create({
          data: {
            organizationId,
            profileId: profile.id,
            versionNumber: (latest?.versionNumber || 0) + 1,
            parentVersionId: null,
            schemaVersion: 1,
            lifecycle: 'DRAFT',
            label: input.label?.trim() || null,
            content: input.content,
            contentDigest,
            revision: 1,
            createdByUserId: actorUserId,
            updatedByUserId: actorUserId,
            publishedByUserId: null,
            publishedAt: null,
          },
        });
      } catch (error: any) {
        if (error?.code === 'P2002') {
          throw new BrandProfileRepositoryError('REVISION_CONFLICT');
        }
        throw error;
      }

      await client.brandProfileAuditEvent.create({
        data: {
          organizationId,
          profileId: profile.id,
          versionId: version.id,
          actorUserId,
          action: 'DRAFT_CREATED',
          revision: version.revision,
          contentDigest,
        },
      });
      if (wasDeleted) {
        await client.brandProfileAuditEvent.create({
          data: {
            organizationId,
            profileId: profile.id,
            versionId: version.id,
            actorUserId,
            action: 'PROFILE_RESTORED',
            toVersionId: version.id,
          },
        });
      }
      return version;
    });
  }

  updateDraft(
    organizationId: string,
    actorUserId: string,
    versionId: string,
    input: BrandProfileDraftUpdateV1,
    contentDigest: string
  ) {
    return this.transact(async (client) => {
      const existing = (await client.projectBrandProfileVersion.findFirst({
        where: { organizationId, id: versionId },
      })) as BrandProfileVersionRecordV1 | null;
      if (!existing) throw new BrandProfileRepositoryError('NOT_FOUND');
      if (existing.lifecycle !== 'DRAFT')
        throw new BrandProfileRepositoryError('VERSION_IMMUTABLE');

      const updated = await client.projectBrandProfileVersion.updateMany({
        where: {
          organizationId,
          id: versionId,
          lifecycle: 'DRAFT',
          revision: input.expectedRevision,
        },
        data: {
          label: input.label?.trim() || null,
          content: input.content,
          contentDigest,
          revision: { increment: 1 },
          updatedByUserId: actorUserId,
        },
      });
      if (updated.count !== 1)
        throw new BrandProfileRepositoryError('REVISION_CONFLICT');
      const version = (await client.projectBrandProfileVersion.findFirst({
        where: { organizationId, id: versionId },
      })) as BrandProfileVersionRecordV1;
      await client.brandProfileAuditEvent.create({
        data: {
          organizationId,
          profileId: version.profileId,
          versionId,
          actorUserId,
          action: 'DRAFT_UPDATED',
          revision: version.revision,
          contentDigest,
        },
      });
      return version;
    });
  }

  activateVersion(
    organizationId: string,
    actorUserId: string,
    versionId: string,
    expected: { revision: number; contentDigest: string }
  ) {
    return this.transact(async (client) => {
      const version = (await client.projectBrandProfileVersion.findFirst({
        where: { organizationId, id: versionId },
      })) as BrandProfileVersionRecordV1 | null;
      if (!version || version.lifecycle === 'ARCHIVED')
        throw new BrandProfileRepositoryError('VERSION_UNAVAILABLE');
      const profile = (await client.projectBrandProfile.findFirst({
        where: { organizationId, id: version.profileId },
      })) as BrandProfileRecordV1 | null;
      if (!profile || profile.deletedAt)
        throw new BrandProfileRepositoryError('VERSION_UNAVAILABLE');
      this.assertVersionIntegrity(version);

      if (
        version.lifecycle === 'PUBLISHED' &&
        profile.activeVersionId === version.id
      ) {
        return { profile, version };
      }

      let action = 'VERSION_SELECTED';
      let publishedVersion = version;
      if (version.lifecycle === 'DRAFT') {
        if (
          version.revision !== expected.revision ||
          version.contentDigest !== expected.contentDigest
        ) {
          throw new BrandProfileRepositoryError('REVISION_CONFLICT');
        }
        const now = new Date();
        const updated = await client.projectBrandProfileVersion.updateMany({
          where: {
            organizationId,
            id: versionId,
            lifecycle: 'DRAFT',
            revision: expected.revision,
            contentDigest: expected.contentDigest,
          },
          data: {
            lifecycle: 'PUBLISHED',
            publishedAt: now,
            publishedByUserId: actorUserId,
            updatedByUserId: actorUserId,
          },
        });
        if (updated.count !== 1)
          throw new BrandProfileRepositoryError('REVISION_CONFLICT');
        publishedVersion = await client.projectBrandProfileVersion.findFirst({
          where: { organizationId, id: versionId },
        });
        action = 'VERSION_ACTIVATED';
      }

      /**
       * The first avatar that can actually write becomes the one that does.
       *
       * `createAvatar` marks a new row as the default only while nothing else
       * in the space can write, so a space can legitimately reach this point
       * with its default flag on an avatar that has no version. Leaving it
       * there would mean every generation falls back to a neutral style while
       * the screen shows a name — the exact lie `VOICE_AVATAR_NOT_ANALYSED`
       * exists to prevent a person from creating by hand.
       */
      const writableDefault = (await client.projectBrandProfile.findFirst({
        where: {
          organizationId,
          deletedAt: null,
          isDefault: true,
          activeVersionId: { not: null },
          id: { not: profile.id },
        },
      })) as BrandProfileRecordV1 | null;
      const updatedProfile = await client.projectBrandProfile.update({
        where: { organizationId_id: { organizationId, id: profile.id } },
        data: {
          activeVersionId: versionId,
          ...(writableDefault ? {} : { isDefault: true }),
        },
      });
      if (!writableDefault) {
        await client.projectBrandProfile.updateMany({
          where: { organizationId, id: { not: profile.id } },
          data: { isDefault: false },
        });
      }
      await client.brandProfileAuditEvent.create({
        data: {
          organizationId,
          profileId: profile.id,
          versionId,
          actorUserId,
          action,
          fromVersionId: profile.activeVersionId,
          toVersionId: versionId,
          revision: publishedVersion.revision,
          contentDigest: publishedVersion.contentDigest,
        },
      });
      return { profile: updatedProfile, version: publishedVersion };
    });
  }

  cloneVersion(
    organizationId: string,
    actorUserId: string,
    sourceVersionId: string
  ) {
    return this.transact(async (client) => {
      const source = (await client.projectBrandProfileVersion.findFirst({
        where: {
          organizationId,
          id: sourceVersionId,
          lifecycle: 'PUBLISHED',
        },
      })) as BrandProfileVersionRecordV1 | null;
      if (!source) throw new BrandProfileRepositoryError('VERSION_UNAVAILABLE');
      this.assertVersionIntegrity(source);
      const profile = (await client.projectBrandProfile.findFirst({
        where: { organizationId, id: source.profileId },
      })) as BrandProfileRecordV1 | null;
      if (!profile || profile.deletedAt)
        throw new BrandProfileRepositoryError('VERSION_UNAVAILABLE');
      const latest = (await client.projectBrandProfileVersion.findFirst({
        where: { organizationId, profileId: profile.id },
        orderBy: { versionNumber: 'desc' },
      })) as BrandProfileVersionRecordV1;
      const draft = (await client.projectBrandProfileVersion.create({
        data: {
          organizationId,
          profileId: profile.id,
          versionNumber: latest.versionNumber + 1,
          parentVersionId: source.id,
          schemaVersion: source.schemaVersion,
          lifecycle: 'DRAFT',
          label: source.label,
          content: source.content,
          contentDigest: source.contentDigest,
          revision: 1,
          createdByUserId: actorUserId,
          updatedByUserId: actorUserId,
          publishedByUserId: null,
          publishedAt: null,
        },
      })) as BrandProfileVersionRecordV1;
      await client.brandProfileAuditEvent.create({
        data: {
          organizationId,
          profileId: profile.id,
          versionId: draft.id,
          actorUserId,
          action: 'DRAFT_CREATED',
          fromVersionId: source.id,
          toVersionId: draft.id,
          revision: 1,
          contentDigest: draft.contentDigest,
        },
      });
      return draft;
    });
  }

  deactivate(organizationId: string, actorUserId: string, avatarId?: string) {
    return this.transactSerializable(async (client) => {
      const profile = (await client.projectBrandProfile.findFirst({
        orderBy: DEFAULT_AVATAR_FIRST,
        where: this.avatarWhere(organizationId, avatarId),
      })) as BrandProfileRecordV1 | null;
      if (!profile || (profile.deletedAt && !profile.activeVersionId)) {
        return { deactivated: true, profile };
      }
      const dependencies = await client.autoPost.findMany({
        where: {
          organizationId,
          brandProfileVersionId: { not: null },
          workflowVersion: { gte: 2 },
          active: true,
          deletedAt: null,
        },
        select: { id: true },
        orderBy: { id: 'asc' },
        take: 101,
      });
      if (dependencies.length) {
        throw new BrandProfileRepositoryError('DEPENDENCIES_ACTIVE', {
          autoPostIds: dependencies
            .slice(0, 100)
            .map((dependency: any) => dependency.id),
          truncated: dependencies.length > 100,
        });
      }
      const updatedProfile = await client.projectBrandProfile.update({
        where: { organizationId_id: { organizationId, id: profile.id } },
        data: { activeVersionId: null, deletedAt: new Date() },
      });
      await client.brandProfileAuditEvent.create({
        data: {
          organizationId,
          profileId: profile.id,
          actorUserId,
          action: 'PROFILE_DEACTIVATED',
          fromVersionId: profile.activeVersionId,
        },
      });
      return { deactivated: true, profile: updatedProfile };
    });
  }

  /* ---------------------------------------------------------------------
   * Avatars
   *
   * One space, up to eight of them, exactly one default. The invariant is held
   * here rather than by a partial unique index, for the reason stated on the
   * column: the moment between clearing the old default and setting the new
   * one would be illegal to the database and is perfectly ordinary to a
   * person. A serializable transaction is what makes that moment safe.
   * ------------------------------------------------------------------ */

  /**
   * Every avatar of the space, in the order the screen shows them.
   *
   * Deleted ones are left out. Their versions stay in the database — posts
   * point at them — but an avatar nobody can pick is not a row on a list of
   * who writes.
   */
  async listAvatars(organizationId: string): Promise<BrandAvatarRowV1[]> {
    return (await this.client().projectBrandProfile.findMany({
      where: { organizationId, deletedAt: null },
      orderBy: DEFAULT_AVATAR_FIRST,
      include: { activeVersion: true },
    })) as BrandAvatarRowV1[];
  }

  /**
   * A new avatar, empty and unable to write until something analyses it.
   *
   * It becomes the default only when the space has no other avatar that can:
   * a freshly created row has no version, and a default pointing at one would
   * take every generation down to a neutral style while the screen showed a
   * name. The two are decided in one serializable transaction so two people
   * creating the first avatar at once cannot both win the flag.
   */
  createAvatar(
    organizationId: string,
    actorUserId: string,
    input: BrandAvatarCreateV1
  ) {
    return this.transactSerializable(async (client) => {
      const existing = (await client.projectBrandProfile.findMany({
        where: { organizationId, deletedAt: null },
        orderBy: DEFAULT_AVATAR_FIRST,
      })) as BrandProfileRecordV1[];
      if (existing.length >= MAX_AVATARS_PER_SPACE) {
        throw new BrandProfileRepositoryError('AVATAR_LIMIT', {
          limit: MAX_AVATARS_PER_SPACE,
        });
      }
      const created = (await client.projectBrandProfile.create({
        data: {
          organizationId,
          name: input.name?.trim() || null,
          kind: input.kind ?? 'PERSON',
          isDefault: !existing.some((one) => one.activeVersionId),
          activeVersionId: null,
          deletedAt: null,
        },
      })) as BrandProfileRecordV1;
      if (created.isDefault) {
        await client.projectBrandProfile.updateMany({
          where: { organizationId, id: { not: created.id } },
          data: { isDefault: false },
        });
      }
      await client.brandProfileAuditEvent.create({
        data: {
          organizationId,
          profileId: created.id,
          actorUserId,
          action: 'AVATAR_CREATED',
        },
      });
      return created;
    });
  }

  /**
   * The name and the kind, in one write.
   *
   * An empty name clears it rather than storing `''`: «Без имени» is a state
   * the screen already draws, and a blank string would be a name that looks
   * like one until somebody tries to read it.
   */
  updateAvatar(
    organizationId: string,
    actorUserId: string,
    avatarId: string,
    input: BrandAvatarUpdateV1
  ) {
    return this.transact(async (client) => {
      const avatar = (await client.projectBrandProfile.findFirst({
        where: { organizationId, id: avatarId, deletedAt: null },
      })) as BrandProfileRecordV1 | null;
      if (!avatar) throw new BrandProfileRepositoryError('NOT_FOUND');

      const updated = (await client.projectBrandProfile.update({
        where: { organizationId_id: { organizationId, id: avatarId } },
        data: {
          ...(input.name === undefined
            ? {}
            : { name: input.name.trim() || null }),
          ...(input.kind === undefined ? {} : { kind: input.kind }),
        },
      })) as BrandProfileRecordV1;
      await client.brandProfileAuditEvent.create({
        data: {
          organizationId,
          profileId: avatarId,
          actorUserId,
          action: input.kind === undefined ? 'AVATAR_RENAMED' : 'AVATAR_KIND_CHANGED',
        },
      });
      return updated;
    });
  }

  /**
   * Moving the default from one avatar to another.
   *
   * Refused for an avatar with no version in force, which is the same rule the
   * card states and the reason it is stated twice: the button is hidden on the
   * screen the person is looking at, not on the tab they left open.
   */
  setDefaultAvatar(
    organizationId: string,
    actorUserId: string,
    avatarId: string
  ) {
    return this.transactSerializable(async (client) => {
      const avatar = (await client.projectBrandProfile.findFirst({
        where: { organizationId, id: avatarId, deletedAt: null },
      })) as BrandProfileRecordV1 | null;
      if (!avatar) throw new BrandProfileRepositoryError('NOT_FOUND');
      if (!avatar.activeVersionId) {
        throw new BrandProfileRepositoryError('AVATAR_NOT_ANALYSED');
      }
      if (avatar.isDefault) return avatar;

      await client.projectBrandProfile.updateMany({
        where: { organizationId, id: { not: avatarId } },
        data: { isDefault: false },
      });
      const updated = (await client.projectBrandProfile.update({
        where: { organizationId_id: { organizationId, id: avatarId } },
        data: { isDefault: true },
      })) as BrandProfileRecordV1;
      await client.brandProfileAuditEvent.create({
        data: {
          organizationId,
          profileId: avatarId,
          actorUserId,
          action: 'AVATAR_DEFAULT_SET',
        },
      });
      return updated;
    });
  }

  /**
   * Removing an avatar, and saying who writes after it is gone.
   *
   * Soft, for the reason `deactivate` is: published posts point at versions of
   * this profile, and erasing the rows would leave them referring to a voice
   * nobody can look up. What goes is the avatar's place on the list and its
   * ability to write.
   *
   * Three refusals, in the order they can bite. Work still pinned to one of
   * its versions blocks the delete outright — the same check `deactivate`
   * makes, narrowed to this profile's versions rather than the whole space,
   * because another avatar's autopost is not this one's dependency. A default
   * with a working successor available demands that the successor be named.
   * A successor that cannot write is refused for the same reason it could not
   * have been made the default by hand.
   *
   * Deleting the last avatar is allowed. The space then writes in a neutral
   * style, which is a working mode and exactly what the confirmation promises.
   */
  deleteAvatar(
    organizationId: string,
    actorUserId: string,
    avatarId: string,
    successorId?: string
  ) {
    return this.transactSerializable(async (client) => {
      const avatar = (await client.projectBrandProfile.findFirst({
        where: { organizationId, id: avatarId, deletedAt: null },
      })) as BrandProfileRecordV1 | null;
      if (!avatar) throw new BrandProfileRepositoryError('NOT_FOUND');

      const versions = (await client.projectBrandProfileVersion.findMany({
        where: { organizationId, profileId: avatarId },
        select: { id: true },
      })) as Array<{ id: string }>;
      const versionIds = versions.map((one) => one.id);
      const dependencies = versionIds.length
        ? await client.autoPost.findMany({
            where: {
              organizationId,
              brandProfileVersionId: { in: versionIds },
              workflowVersion: { gte: 2 },
              active: true,
              deletedAt: null,
            },
            select: { id: true },
            orderBy: { id: 'asc' },
            take: 101,
          })
        : [];
      if (dependencies.length) {
        throw new BrandProfileRepositoryError('DEPENDENCIES_ACTIVE', {
          autoPostIds: dependencies
            .slice(0, 100)
            .map((dependency: any) => dependency.id),
          truncated: dependencies.length > 100,
        });
      }

      const others = (await client.projectBrandProfile.findMany({
        where: { organizationId, deletedAt: null, id: { not: avatarId } },
        orderBy: DEFAULT_AVATAR_FIRST,
      })) as BrandProfileRecordV1[];
      const writable = others.filter((one) => one.activeVersionId);

      let successor: BrandProfileRecordV1 | null = null;
      if (avatar.isDefault && writable.length) {
        if (!successorId) {
          throw new BrandProfileRepositoryError('SUCCESSOR_REQUIRED', {
            candidates: writable.map((one) => one.id),
          });
        }
        successor = others.find((one) => one.id === successorId) ?? null;
        if (!successor) throw new BrandProfileRepositoryError('NOT_FOUND');
        if (!successor.activeVersionId) {
          throw new BrandProfileRepositoryError('AVATAR_NOT_ANALYSED');
        }
      }

      await client.projectBrandProfile.update({
        where: { organizationId_id: { organizationId, id: avatarId } },
        data: { deletedAt: new Date(), isDefault: false, activeVersionId: null },
      });
      await client.brandProfileAuditEvent.create({
        data: {
          organizationId,
          profileId: avatarId,
          actorUserId,
          action: 'AVATAR_DELETED',
          fromVersionId: avatar.activeVersionId,
        },
      });

      if (successor) {
        await client.projectBrandProfile.updateMany({
          where: { organizationId, id: { not: successor.id } },
          data: { isDefault: false },
        });
        await client.projectBrandProfile.update({
          where: { organizationId_id: { organizationId, id: successor.id } },
          data: { isDefault: true },
        });
        await client.brandProfileAuditEvent.create({
          data: {
            organizationId,
            profileId: successor.id,
            actorUserId,
            action: 'AVATAR_DEFAULT_SET',
          },
        });
      }
      return { deleted: true as const, successorId: successor?.id ?? null };
    });
  }

  restoreVersion(
    organizationId: string,
    actorUserId: string,
    versionId: string
  ) {
    return this.transact(async (client) => {
      const version = (await client.projectBrandProfileVersion.findFirst({
        where: { organizationId, id: versionId, lifecycle: 'PUBLISHED' },
      })) as BrandProfileVersionRecordV1 | null;
      if (!version)
        throw new BrandProfileRepositoryError('VERSION_UNAVAILABLE');
      this.assertVersionIntegrity(version);
      const profile = (await client.projectBrandProfile.findFirst({
        where: { organizationId, id: version.profileId },
      })) as BrandProfileRecordV1 | null;
      if (!profile)
        throw new BrandProfileRepositoryError('VERSION_UNAVAILABLE');
      if (!profile.deletedAt && profile.activeVersionId === versionId) {
        return { profile, version };
      }
      const restored = await client.projectBrandProfile.update({
        where: { organizationId_id: { organizationId, id: profile.id } },
        data: { deletedAt: null, activeVersionId: versionId },
      });
      await client.brandProfileAuditEvent.create({
        data: {
          organizationId,
          profileId: profile.id,
          versionId,
          actorUserId,
          action: profile.deletedAt ? 'PROFILE_RESTORED' : 'VERSION_SELECTED',
          fromVersionId: profile.activeVersionId,
          toVersionId: versionId,
          revision: version.revision,
          contentDigest: version.contentDigest,
        },
      });
      return { profile: restored, version };
    });
  }
}
