'use strict';

/**
 * The voice the product would resolve for this space, through the product's
 * own resolver.
 *
 * `BrandProfileContextService` reads the active version from a repository the
 * stand has no reason to instantiate, but the merging it does afterwards —
 * project, voice, lexicon, guardrails, examples, platform overrides — is a
 * pure function, and that function decides what the generator sees.
 */

const { loadWithMocks } = require('../../../tests/helpers/load-ts-with-mocks.cjs');

const MODULE =
  'libraries/nestjs-libraries/src/content-intelligence/brand-profile/brand-profile.context.service.ts';

const resolveEffectiveVoice = (profileVersion) => {
  if (!profileVersion?.content) {
    throw new Error(
      'this space has no active brand profile version; analyse and activate a voice first'
    );
  }
  const { resolveEffectiveBrandVoiceV1 } = loadWithMocks(MODULE, {
    '@contentfactory/nestjs-libraries/content-intelligence/brand-profile/brand-profile.repository':
      { BrandProfileRepository: class {} },
  });
  return resolveEffectiveBrandVoiceV1(profileVersion.content);
};

module.exports = { resolveEffectiveVoice };
