'use strict';

module.exports = (injection, identity) => {
  const draftId = '22222222-2222-4222-8222-222222222222';
  const preflightId = '44444444-4444-4444-8444-444444444444';
  const connectionId = '77777777-7777-4777-8777-777777777777';
  const profileId = '88888888-8888-4888-8888-888888888888';
  const operationId = '99999999-9999-4999-8999-999999999999';
  const setupId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const pieceId = '11111111-1111-4111-8111-111111111111';
  const requestMessageId = 'heygen-fixture-authored';
  const digest = 'a'.repeat(64);
  const profile = {
    profileId, expectedRevision: 1, connectionId, displayName: 'Fixture presenter',
    aliases: [], preferredForName: false, groupIds: ['group'], preferredGroupId: 'group',
    sourceLooks: [{ groupId: 'group', lookId: 'base-look', roles: ['style_base'] }],
    preferredSourceLookId: 'base-look', defaultVoice: { voiceId: 'voice' },
  };
  const proposal = { selectionDigest: digest, name: injection, voice: { name: injection }, looks: [{ name: injection }] };
  const scopePreview = { source: { title: injection }, presenter: injection, voice: injection };
  const styleReview = { name: injection, profileName: injection, baseLookName: injection, blockers: [], prompt: injection };
  const voiceIntakeReview = { intent: 'narrator' };
  const voiceOperationReview = { operation: 'clone_voice', originalLabel: injection };
  const voiceSelectionReview = { decision: 'reject_all' };
  const output = { id: draftId, pieceId, draftId, name: injection };
  const owned = (result) => async (org, actor) => {
    if (org !== identity.organizationId || actor !== identity.userId) throw new Error('Unexpected fixture identity');
    return result;
  };
  const methods = (names) => Object.fromEntries(names.map(name => [name, owned(output)]));
  const services = {
    HeygenChatControlsServiceV1: {
      ...methods(['listProfiles', 'resolveProfile', 'saveProfile', 'prepareSettings', 'advancedOptions', 'saveGlossary',
        'saveBackground', 'authorizeScope', 'launchScoped', 'creativeDecision']),
      proposeProfile: owned(proposal), previewScope: owned(scopePreview), scopes: { stop: owned(output) },
    },
    HeygenPerformanceServiceV1: methods(['read', 'apply', 'savePreference', 'feedback', 'feedbackRead', 'proposeFeedbackCorrection']),
    HeygenPerformanceSceneServiceV1: methods(['prepare']),
    HeygenStyleVoiceServiceV1: {
      ...methods(['stylePrepare', 'styleStatus', 'styleRecover', 'styleSelect', 'voiceIntake', 'voiceStatus',
        'voicePrepareAuditions', 'voicePrepareClone', 'voiceRecover', 'voiceSelect', 'applySelectedVoice']),
      styleSubmit: owned({ ...output, attempted: true }),
      voiceExecute: owned({ ...output, requestedOperationId: operationId, operations: [{ operationId, state: 'saved' }] }),
      styleReview: owned(styleReview), voiceIntakeReview: owned(voiceIntakeReview),
      voiceOperationReview: owned(voiceOperationReview), voiceSelectionReview: owned(voiceSelectionReview),
    },
  };
  const call = (input, extra = {}) => ({ input, services, ...extra });
  const authored = { originalAuthorRequest: { messageId: requestMessageId, text: injection } };
  const approved = (input, approvalContent) => call(input, {
    ...authored, nativeApproval: { content: approvalContent }, nativeToolCallId: 'heygen-fixture-call',
  });
  const autopilot = (input) => call(input, { ...authored, chatMode: 'autopilot' });
  const draft = { draftId, version: 1 };
  const delivery = { ...draft, expectedRevision: 1 };
  const quote = { requestMessageId, quote: injection };
  const voiceOperation = { setupId, operationId };
  return {
    'video.person_profiles': call({ connectionId }),
    'video.person_profile_resolve': call({ connectionId, profileId }),
    'video.person_profile_propose': call(profile),
    'video.person_profile_save': approved({ profile, selectionDigest: digest }, proposal),
    'video.heygen_settings': call({ ...draft, connectionId, profileId }),
    'video.heygen_options_v1': call(draft),
    'video.heygen_glossary_v1': call({ ...draft, glossaryId: 'fixture-glossary' }),
    'video.heygen_background_v1': call({ ...draft, backgroundAssetId: 'fixture-background' }),
    'video.performance_v1': call({ draftId }),
    'video.performance_scenes_v1': call(delivery),
    'video.performance_settings_v1': call({ ...delivery, changes: { gaze: 'camera' } }),
    'video.performance_user_edit_v1': approved({ ...delivery, ...quote, changes: { gaze: 'camera' } }),
    'video.performance_preference_v1': approved({ ...delivery, ...quote }),
    'video.performance_feedback_v1': call({ ...delivery, ...quote, text: injection }, authored),
    'video.performance_feedback_read_v1': call({ draftId }),
    'video.performance_feedback_correction_v1': call({ ...delivery, feedbackId: `heygen-performance-feedback:${digest}`, changes: { gaze: 'camera' } }),
    'video.heygen_authorize_scope_v2': approved({ id: operationId, connectionId, profileId, profileRevision: 1,
      profileDigest: digest, pieceId, sourceRevision: 'fixture-revision', maxJobs: 1, maxExpertCalls: 1,
      expiresAt: '2030-01-01T00:00:00Z', unknownDebitAcknowledged: true }, scopePreview),
    'video.heygen_launch_scoped_v2': autopilot({ scopeId: operationId, preflightId }),
    'video.heygen_creative_expert_v2': autopilot({ scopeId: operationId, draftId, requestId: 'fixture-expert', question: 'Which delivery fits?' }),
    'video.heygen_scope_stop_v2': call({ scopeId: operationId }, authored),
    'video.heygen_style_prepare': call({ operationId, connectionId, profileId, expectedProfileRevision: 1,
      expectedProfileDigest: digest, groupId: 'group', baseLookId: 'base-look', name: 'Fixture style',
      prompt: 'A dark top in a studio', promptLanguage: 'en', aspectRatio: '9:16', referenceMediaIds: [] }),
    'video.heygen_style_status': call({ operationId }),
    'video.heygen_style_recover': call({ operationId }),
    'video.heygen_style_select': call({ operationId, lookId: 'base-look', expectedRevision: 1 }),
    'video.heygen_style_submit': approved({ operationId, expectedRevision: 1, requestHash: digest }, styleReview),
    'video.heygen_voice_intake': approved({ setupId, connectionId, intent: 'narrator' }, voiceIntakeReview),
    'video.heygen_voice_status': call({ setupId }),
    'video.heygen_voice_prepare_auditions': call({ setupId, expectedRevision: 1,
      candidates: [{ candidateId: operationId, voiceId: 'voice', engine: 'heygen_voice', speed: 1 }] }),
    'video.heygen_voice_prepare_clone': call({ ...voiceOperation, expectedRevision: 1, voiceName: 'Fixture voice', removeBackgroundNoise: false }),
    'video.heygen_voice_execute': approved({ ...voiceOperation, requestHash: digest }, voiceOperationReview),
    'video.heygen_voice_recover': call(voiceOperation),
    'video.heygen_voice_select': approved({ setupId, expectedRevision: 1, decision: 'reject_all' }, voiceSelectionReview),
    'video.heygen_voice_apply_selected': call({ setupId }),
  };
};
