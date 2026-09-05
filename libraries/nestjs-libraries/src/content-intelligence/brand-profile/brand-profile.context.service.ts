import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { BRAND_PROFILE_VERSION_UNAVAILABLE } from '@contentfactory/nestjs-libraries/content-intelligence/contracts';
import { BrandProfileRepository } from '@contentfactory/nestjs-libraries/content-intelligence/brand-profile/brand-profile.repository';
import { parseLearnedRules } from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice-learning';
import {
  BrandProfileRepositoryError,
  type BrandProfileContentV1,
  type BrandProfileSelectionV1,
  type PlatformVoiceOverrideV1,
  type ResolvedBrandProfileContextV1,
} from '@contentfactory/nestjs-libraries/content-intelligence/brand-profile/brand-profile.types';

function unavailable(): never {
  throw new ConflictException({ code: BRAND_PROFILE_VERSION_UNAVAILABLE });
}

function selectedOverride(
  content: BrandProfileContentV1,
  provider?: string
): PlatformVoiceOverrideV1 | undefined {
  if (!provider) return undefined;
  const normalized = provider.trim().toLocaleLowerCase();
  return content.platformOverrides.find(
    (candidate) => candidate.provider.trim().toLocaleLowerCase() === normalized
  );
}

function mergeUnique<T>(base: T[], additions: T[] | undefined) {
  return [...base, ...(additions || [])];
}

/**
 * Выученные правила аватара — тексты, в порядке колонки, потолок держит разбор.
 *
 * Читается из строки профиля, которую репозиторий уже привёз: и
 * `getActiveRuntimeVersion`, и `getPublishedRuntimeVersion` берут профиль
 * целиком, с `organizationId` в условии, так что колонка приезжает бесплатно.
 * Второй запрос за той же колонкой стоил бы обращения к базе на каждой
 * генерации и ничего бы не добавил к изоляции — она уже в том же `where`.
 *
 * Правила живут в профиле, а не в версии, и это не оплошность: версия — это
 * снимок голоса, который человек утвердил, а выученное аватар набирает между
 * утверждениями. Поэтому возврат к старой версии не отменяет обучение, а
 * кнопка «Отменить» на экране аватара отменяет ровно одно правило.
 */
const learnedRuleTexts = (raw: unknown): string[] =>
  parseLearnedRules(raw).rules.map((rule) => rule.text);

export function resolveEffectiveBrandVoiceV1(
  content: BrandProfileContentV1,
  provider?: string
) {
  const override = selectedOverride(content, provider);
  return {
    /**
     * The persona is not overridable per platform, and that is a decision
     * rather than an omission: a platform override adjusts how a person writes
     * on LinkedIn, not who they are. Making the portrait per-platform would let
     * one space hold two different people under one name.
     */
    persona: content.persona,
    project: content.project,
    ...content.voice,
    ...(override
      ? Object.fromEntries(
          Object.entries({
            traits: override.traits,
            pointOfView: override.pointOfView,
            formality: override.formality,
            sentenceStyle: override.sentenceStyle,
            ctaStyle: override.ctaStyle,
            emojiPolicy: override.emojiPolicy,
            hashtagPolicy: override.hashtagPolicy,
          }).filter(([, value]) => value !== undefined)
        )
      : {}),
    lexicon: {
      preferred: mergeUnique(content.lexicon.preferred, override?.preferredAdd),
      avoid: mergeUnique(content.lexicon.avoid, override?.avoidAdd),
    },
    guardrails: {
      prohibitedTopics: mergeUnique(
        content.guardrails.prohibitedTopics,
        override?.prohibitedTopicsAdd
      ),
      prohibitedClaims: mergeUnique(
        content.guardrails.prohibitedClaims,
        override?.prohibitedClaimsAdd
      ),
      requiredPhrases: mergeUnique(
        content.guardrails.requiredPhrases,
        override?.requiredPhrasesAdd
      ),
    },
    examples: mergeUnique(content.examples, override?.examples),
  };
}

@Injectable()
export class BrandProfileContextService {
  constructor(private readonly _repository: BrandProfileRepository) {}

  async resolve(
    organizationId: string,
    selection?: BrandProfileSelectionV1,
    provider?: string
  ): Promise<ResolvedBrandProfileContextV1> {
    const requestedProvider = provider?.trim();
    if (
      provider !== undefined &&
      (typeof provider !== 'string' ||
        !requestedProvider ||
        provider.length > 120)
    ) {
      throw new BadRequestException({ code: 'BRAND_PROFILE_PROVIDER_INVALID' });
    }
    if (
      selection !== undefined &&
      (!selection ||
        typeof selection !== 'object' ||
        !['active', 'version', 'none'].includes((selection as any).mode) ||
        Object.keys(selection as any).some(
          (key) => !['mode', 'versionId'].includes(key)
        ) ||
        ((selection as any).mode !== 'version' &&
          (selection as any).versionId !== undefined) ||
        ((selection as any).mode === 'version' &&
          (typeof (selection as any).versionId !== 'string' ||
            !(selection as any).versionId.trim() ||
            (selection as any).versionId.length > 128)))
    ) {
      throw new BadRequestException({
        code: 'BRAND_PROFILE_SELECTION_INVALID',
      });
    }
    if (!selection) {
      return {
        schemaVersion: 'brand-profile-context/v1',
        selection: 'legacy_none',
        applied: { mode: 'neutral_fallback', reason: 'legacy_request' },
        warnings: [],
      };
    }
    if (selection.mode === 'none') {
      return {
        schemaVersion: 'brand-profile-context/v1',
        selection: 'none',
        applied: { mode: 'neutral_fallback', reason: 'explicit_none' },
        warnings: [],
      };
    }

    let result;
    try {
      result =
        selection.mode === 'active'
          ? await this._repository.getActiveRuntimeVersion(organizationId)
          : await this._repository.getPublishedRuntimeVersion(
              organizationId,
              selection.versionId
            );
    } catch (error) {
      if (
        (error instanceof BrandProfileRepositoryError ||
          (error as any)?.name === 'BrandProfileRepositoryError') &&
        (error as BrandProfileRepositoryError).code === 'VERSION_UNAVAILABLE'
      ) {
        unavailable();
      }
      throw error;
    }

    if (!result) {
      if (selection.mode === 'active') {
        return {
          schemaVersion: 'brand-profile-context/v1',
          selection: 'active',
          applied: {
            mode: 'neutral_fallback',
            reason: 'no_active_profile',
          },
          warnings: [],
        };
      }
      unavailable();
    }

    const { profile, version } = result;
    const override = selectedOverride(version.content, requestedProvider);
    const learnedRules = learnedRuleTexts(profile.learnedRules);
    return {
      schemaVersion: 'brand-profile-context/v1',
      selection: selection.mode === 'active' ? 'active' : 'explicit',
      applied: {
        mode: 'profile',
        profileId: profile.id,
        versionId: version.id,
        versionNumber: version.versionNumber,
        label: version.label || `v${version.versionNumber}`,
        contentDigest: version.contentDigest,
        ...(requestedProvider ? { provider: requestedProvider } : {}),
      },
      effectiveVoice: {
        ...resolveEffectiveBrandVoiceV1(version.content, requestedProvider),
        /**
         * Ключа нет, когда учить было нечему: аватар без единого правила
         * отдаёт ровно тот же голос, что и до обучения, — вплоть до слепка,
         * которым `content-context.builder` метит снимок контекста.
         */
        ...(learnedRules.length ? { learnedRules } : {}),
      },
      warnings: override
        ? [`platform_override_applied:${requestedProvider}`]
        : [],
    };
  }
}
