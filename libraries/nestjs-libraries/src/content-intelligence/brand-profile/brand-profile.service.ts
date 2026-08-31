import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type {
  BrandProfileDraftInputV1,
  BrandProfileDraftUpdateV1,
  BrandProfileSelectionV1,
} from '@contentfactory/nestjs-libraries/content-intelligence/brand-profile/brand-profile.types';
import { BrandProfileRepositoryError } from '@contentfactory/nestjs-libraries/content-intelligence/brand-profile/brand-profile.types';
import { BrandProfileRepository } from '@contentfactory/nestjs-libraries/content-intelligence/brand-profile/brand-profile.repository';
import { BrandProfileContextService } from '@contentfactory/nestjs-libraries/content-intelligence/brand-profile/brand-profile.context.service';
import {
  BRAND_PROFILE_MAX_PROMPT_CHARACTERS_V1,
  digestBrandProfileContent,
  renderBrandProfilePromptV1,
  validateBrandProfileContent,
} from '@contentfactory/nestjs-libraries/content-intelligence/brand-profile/brand-profile.validation';
import { BRAND_PROFILE_VERSION_UNAVAILABLE } from '@contentfactory/nestjs-libraries/content-intelligence/contracts';

@Injectable()
export class BrandProfileService {
  constructor(
    private readonly _repository: BrandProfileRepository,
    private readonly _context: BrandProfileContextService
  ) {}

  getOverview(organizationId: string, includeDrafts = false) {
    return this._repository.getOverview(organizationId, includeDrafts);
  }

  async createDraft(
    organizationId: string,
    actorUserId: string,
    input: BrandProfileDraftInputV1
  ) {
    this.validateDraft(input);
    try {
      return await this._repository.createDraft(
        organizationId,
        actorUserId,
        input,
        digestBrandProfileContent(input.content)
      );
    } catch (error) {
      return this.mapRepositoryError(error);
    }
  }

  async updateDraft(
    organizationId: string,
    actorUserId: string,
    versionId: string,
    input: BrandProfileDraftUpdateV1
  ) {
    this.validateDraft(input);
    try {
      return await this._repository.updateDraft(
        organizationId,
        actorUserId,
        versionId,
        input,
        digestBrandProfileContent(input.content)
      );
    } catch (error) {
      return this.mapRepositoryError(error);
    }
  }

  async activateVersion(
    organizationId: string,
    actorUserId: string,
    versionId: string
  ) {
    const version = await this._repository.getVersion(
      organizationId,
      versionId
    );
    if (!version)
      throw new ConflictException({
        code: BRAND_PROFILE_VERSION_UNAVAILABLE,
      });
    this.assertVersionIntegrity(version);
    if (version.lifecycle === 'DRAFT') {
      const validation = validateBrandProfileContent(version.content, {
        forActivation: true,
      });
      const rendered = renderBrandProfilePromptV1(version.content);
      const issues = 'issues' in validation ? [...validation.issues] : [];
      if (rendered.length > BRAND_PROFILE_MAX_PROMPT_CHARACTERS_V1) {
        issues.push('prompt_fragment:too_large');
      }
      if (issues.length) {
        throw new UnprocessableEntityException({
          code: 'BRAND_PROFILE_VALIDATION_FAILED',
          issues,
        });
      }
    }
    try {
      return await this._repository.activateVersion(
        organizationId,
        actorUserId,
        versionId,
        { revision: version.revision, contentDigest: version.contentDigest }
      );
    } catch (error) {
      return this.mapRepositoryError(error);
    }
  }

  async cloneVersion(
    organizationId: string,
    actorUserId: string,
    versionId: string
  ) {
    try {
      return await this._repository.cloneVersion(
        organizationId,
        actorUserId,
        versionId
      );
    } catch (error) {
      return this.mapRepositoryError(error);
    }
  }

  async deactivate(organizationId: string, actorUserId: string) {
    try {
      return await this._repository.deactivate(organizationId, actorUserId);
    } catch (error) {
      return this.mapRepositoryError(error);
    }
  }

  async restoreVersion(
    organizationId: string,
    actorUserId: string,
    versionId: string
  ) {
    try {
      return await this._repository.restoreVersion(
        organizationId,
        actorUserId,
        versionId
      );
    } catch (error) {
      return this.mapRepositoryError(error);
    }
  }

  resolveContext(
    organizationId: string,
    selection?: BrandProfileSelectionV1,
    provider?: string
  ) {
    return this._context.resolve(organizationId, selection, provider);
  }

  private validateDraft(input: BrandProfileDraftInputV1) {
    if (input.label !== undefined && input.label.length > 120) {
      throw new UnprocessableEntityException({
        code: 'BRAND_PROFILE_VALIDATION_FAILED',
        issues: ['label:too_long'],
      });
    }
    const validation = validateBrandProfileContent(input.content, {
      forActivation: false,
    });
    if ('issues' in validation) {
      throw new UnprocessableEntityException({
        code: 'BRAND_PROFILE_VALIDATION_FAILED',
        issues: validation.issues,
      });
    }
  }

  private assertVersionIntegrity(version: {
    content: BrandProfileDraftInputV1['content'];
    contentDigest: string;
  }) {
    try {
      if (
        digestBrandProfileContent(version.content) === version.contentDigest
      ) {
        return;
      }
    } catch {
      // Persisted corruption is unavailable, not a client validation error.
    }
    throw new ConflictException({
      code: BRAND_PROFILE_VERSION_UNAVAILABLE,
    });
  }

  private mapRepositoryError(error: unknown): never {
    if (
      !(
        error instanceof BrandProfileRepositoryError ||
        (error as any)?.name === 'BrandProfileRepositoryError'
      )
    ) {
      throw error;
    }
    const repositoryError = error as BrandProfileRepositoryError;
    if (repositoryError.code === 'NOT_FOUND') throw new NotFoundException();
    if (repositoryError.code === 'REVISION_CONFLICT') {
      throw new ConflictException({ code: 'BRAND_PROFILE_REVISION_CONFLICT' });
    }
    if (repositoryError.code === 'VERSION_IMMUTABLE') {
      throw new ConflictException({ code: 'BRAND_PROFILE_VERSION_IMMUTABLE' });
    }
    if (repositoryError.code === 'DEPENDENCIES_ACTIVE') {
      throw new ConflictException({
        code: 'BRAND_PROFILE_DEPENDENCIES_ACTIVE',
        ...repositoryError.details,
      });
    }
    throw new ConflictException({ code: BRAND_PROFILE_VERSION_UNAVAILABLE });
  }
}
