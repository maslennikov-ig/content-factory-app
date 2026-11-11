import { z } from 'zod';
import {
  HEYGEN_SETTINGS_SCHEMA_V2,
  HeygenSettingsQualificationSchemaV2,
  HeygenVideoSettingsSchemaV2,
  type HeygenSettingsQualificationV2,
  type HeygenVideoSettingsV2,
} from './video-heygen-settings.v2';

export const HEYGEN_PERFORMANCE_KEYS_V1 = ['context', 'delivery', 'gaze', 'facialIntensity', 'gestures', 'wish'] as const;
export type HeygenPerformanceKeyV1 = typeof HEYGEN_PERFORMANCE_KEYS_V1[number];
const origin = z.enum(['assistant', 'manual', 'default']);
export type HeygenPerformanceOriginV1 = z.infer<typeof origin>;
export const HeygenPerformanceOriginsSchemaV1 = z.object({
  context: origin, delivery: origin, gaze: origin, facialIntensity: origin, gestures: origin, wish: origin,
}).strict();

/** Creative intent only. Neither values nor wishes grant provider authority. */
export const HeygenPerformanceValuesSchemaV1 = z.object({
  context: z.enum(['general', 'invitation', 'explainer', 'serious', 'thanks', 'promotion', 'dialogue']),
  delivery: z.enum(['restrained', 'natural', 'energetic']),
  gaze: z.enum(['camera', 'partner', 'natural']),
  facialIntensity: z.enum(['low', 'medium', 'high']),
  gestures: z.enum(['none', 'sparse']),
  wish: z.string().max(500).default(''),
}).strict();
export type HeygenPerformanceValuesV1 = z.infer<typeof HeygenPerformanceValuesSchemaV1>;
export type HeygenPerformanceOriginsV1 = Record<HeygenPerformanceKeyV1, HeygenPerformanceOriginV1>;
const patchSchema = HeygenPerformanceValuesSchemaV1.partial();
const keysSchema = z.array(z.enum(HEYGEN_PERFORMANCE_KEYS_V1)).max(HEYGEN_PERFORMANCE_KEYS_V1.length);
type Patch = Partial<HeygenPerformanceValuesV1>;

/** Context is supplied by the model/user, never inferred by matching script words. */
function defaults(context: HeygenPerformanceValuesV1['context'], delivery?: HeygenPerformanceValuesV1['delivery']): HeygenPerformanceValuesV1 {
  const effectiveDelivery = delivery ?? (['serious', 'explainer'].includes(context) ? 'restrained' : 'natural');
  return {
    context,
    delivery: effectiveDelivery,
    gaze: context === 'dialogue' ? 'partner' : 'camera',
    facialIntensity: effectiveDelivery === 'energetic' ? context === 'promotion' ? 'high' : 'medium' : 'low',
    gestures: effectiveDelivery === 'energetic' || effectiveDelivery === 'natural' && ['invitation', 'explainer', 'thanks', 'promotion'].includes(context)
      ? 'sparse' : 'none',
    wish: '',
  };
}

export type HeygenPerformanceResolutionV1 = {
  values: HeygenPerformanceValuesV1;
  lockedFields: HeygenPerformanceKeyV1[];
  origins: HeygenPerformanceOriginsV1;
};

/** The caller must establish whether an edit is manual; proposals cannot declare their own origin. */
export function resolveHeygenPerformanceV1(input: {
  proposed?: Partial<HeygenPerformanceValuesV1>;
  current?: HeygenPerformanceValuesV1;
  currentOrigins?: HeygenPerformanceOriginsV1;
  lockedFields?: HeygenPerformanceKeyV1[];
  manual?: Partial<HeygenPerformanceValuesV1>;
  releaseFields?: HeygenPerformanceKeyV1[];
} = {}): HeygenPerformanceResolutionV1 {
  const proposed: Patch = patchSchema.parse(input.proposed ?? {}), manual: Patch = patchSchema.parse(input.manual ?? {});
  const released = new Set(keysSchema.parse(input.releaseFields ?? []));
  const locks = new Set(keysSchema.parse(input.lockedFields ?? []).filter(key => !released.has(key)));
  const current = input.current ? HeygenPerformanceValuesSchemaV1.parse(input.current) : undefined;
  const currentOrigins = input.currentOrigins ? HeygenPerformanceOriginsSchemaV1.parse(input.currentOrigins) : undefined;
  const values = current ? {...current} : defaults('general');
  const origins = Object.fromEntries(HEYGEN_PERFORMANCE_KEYS_V1.map(key =>
    [key, locks.has(key) ? 'manual' : current ? currentOrigins?.[key] ?? 'assistant' : 'default'])) as HeygenPerformanceOriginsV1;
  const has = (patch: Patch, key: HeygenPerformanceKeyV1) => patch[key] !== undefined;
  const explicitlySet = (key: HeygenPerformanceKeyV1) => has(manual, key) || !locks.has(key) && has(proposed, key);
  const set = <K extends HeygenPerformanceKeyV1>(key: K, value: HeygenPerformanceValuesV1[K], origin: HeygenPerformanceOriginV1) => {
    values[key] = value;
    origins[key] = origin;
  };
  const apply = <K extends HeygenPerformanceKeyV1>(key: K) => {
    if (!locks.has(key) && proposed[key] !== undefined) set(key, proposed[key]!, 'assistant');
    if (manual[key] !== undefined) set(key, manual[key]!, 'manual');
  };

  apply('context');
  if (released.has('context') && !explicitlySet('context')) origins.context = 'default';
  const contextChanged = current !== undefined && values.context !== current.context;
  if (!locks.has('delivery') && !explicitlySet('delivery') && (contextChanged || released.has('delivery')))
    set('delivery', defaults(values.context).delivery, 'default');
  apply('delivery');
  // The first context proposal also derives its context-specific delivery.
  if (!current && !explicitlySet('delivery')) set('delivery', defaults(values.context).delivery, 'default');
  const deliveryChanged = current !== undefined && values.delivery !== current.delivery;
  const automatic = defaults(values.context, values.delivery);
  for (const key of ['gaze', 'facialIntensity', 'gestures'] as const) {
    if (!locks.has(key) && !explicitlySet(key) && (!current || contextChanged || released.has(key) ||
      deliveryChanged && key !== 'gaze')) set(key, automatic[key], 'default');
    apply(key);
  }
  if (released.has('wish') && !explicitlySet('wish')) set('wish', '', 'default');
  apply('wish');
  for (const key of HEYGEN_PERFORMANCE_KEYS_V1) if (has(manual, key)) locks.add(key);
  return {values: HeygenPerformanceValuesSchemaV1.parse(values), lockedFields: HEYGEN_PERFORMANCE_KEYS_V1.filter(key => locks.has(key)), origins};
}

export type HeygenPerformanceLimitationV1 = {field: string; code: string; message: string};
export type HeygenPerformanceCompilationV1 = {
  overrides: Partial<HeygenVideoSettingsV2>;
  limitations: HeygenPerformanceLimitationV1[];
  direction?: string;
  /** Product planning rate, not a provider limit or a count of natural microgestures. */
  maxAccentsPerMinute: 0 | 1 | 2;
  /** Suggested maximum for this clip, rounded up from its unmeasured preparation target. */
  majorAccentBudget: number;
};

const usable = (look: HeygenSettingsQualificationV2['source']) => look.ready && look.owned &&
  (look.consentState === 'accepted' || look.consentState === 'not_applicable');

function performanceExpression(values: HeygenPerformanceValuesV1): string {
  return values.facialIntensity === 'low'
    ? ['invitation', 'thanks'].includes(values.context) ? 'a warm, understated expression' : 'a composed, understated expression'
    : values.facialIntensity === 'medium'
      ? 'an engaged expression that returns to a relaxed baseline'
      : values.context === 'serious' ? 'an expressive but composed face that returns to a relaxed baseline'
        : 'a lively expression that returns to a relaxed baseline';
}

export function heygenPerformanceSceneDirectionsV1(values: HeygenPerformanceValuesV1) {
  const gazeDirection = values.gaze === 'camera' ? 'Keep a relaxed gaze toward the camera.'
    : values.gaze === 'partner' ? 'Look toward the conversational partner.' : 'Let your gaze shift naturally.';
  const facialDirection = `Use ${performanceExpression(values)}.`;
  const direction = values.context === 'thanks' ? 'Place one hand over your heart.'
    : values.context === 'invitation' ? 'Give one small welcoming hand gesture.' : 'Use one small, purposeful hand accent.';
  return {gazeDirection, facialDirection, ...(values.gestures === 'sparse' ? {principalGesture: {cueId: 'presenter_accent', direction}} : {})};
}

function performanceDirection(values: HeygenPerformanceValuesV1): string {
  const gaze = values.gaze === 'camera' ? 'Keep a relaxed gaze toward the camera with '
    : values.gaze === 'partner' ? 'Look toward the conversational partner with '
      : 'Let your gaze shift naturally with ';
  const gesture = values.gestures === 'none' ? 'Keep your hands relaxed, without intentional gesture accents.'
    : values.context === 'thanks' ? 'Place one hand over your heart once, then return it to rest.'
      : values.context === 'invitation' ? 'Use one small welcoming hand gesture, then return your hands to rest.'
        : 'Use one small, purposeful hand accent, then return your hands to rest.';
  return `${gaze}${performanceExpression(values)}. ${gesture}`;
}

/**
 * Pure preparation: emits performance overrides only. An undefined override clears
 * a stale setting when merged; it must not leave an old unsupported motion active.
 * Qualification/admission and required/manual-cue enforcement remain server duties.
 */
export function compileHeygenPerformanceV1(
  rawValues: HeygenPerformanceValuesV1,
  rawSettings: HeygenVideoSettingsV2,
  rawQualification: HeygenSettingsQualificationV2,
): HeygenPerformanceCompilationV1 {
  const values = HeygenPerformanceValuesSchemaV1.parse(rawValues);
  const settings = HeygenVideoSettingsSchemaV2.parse(rawSettings);
  const qualification = HeygenSettingsQualificationSchemaV2.safeParse(rawQualification);
  const maxAccentsPerMinute = values.gestures === 'none' ? 0 : values.delivery === 'energetic' ? 2 : 1;
  const result: HeygenPerformanceCompilationV1 = {
    overrides: {motionPrompt: undefined, expressiveness: undefined}, limitations: [], maxAccentsPerMinute,
    majorAccentBudget: Math.ceil(settings.durationSeconds / 60 * maxAccentsPerMinute),
  };
  const limit = (field: string, code: string, message: string) => result.limitations.push({field, code, message});
  if (values.wish.trim()) limit('wish', 'uncompiled_wish',
    'This wish is retained as creative intent. Propose compatible typed settings or a qualified concise English direction before claiming it is applied.');
  if (!qualification.success || qualification.data.schemaDigest !== HEYGEN_SETTINGS_SCHEMA_V2) {
    limit('qualification', 'qualification_unavailable', 'Refresh the current connected-account qualification before applying performance settings.');
    return result;
  }
  const q = qualification.data, look = q.appearance, engine = settings.engine.type;
  if (q.source.lookId !== settings.sourceLookId || q.source.groupId !== settings.sourceGroupId || !usable(q.source) ||
    look.lookId !== settings.appearanceLookId || look.groupId !== settings.groupId || !usable(look) || !look.engines.includes(engine)) {
    limit('qualification', 'performance_source_unqualified', 'Select a matching ready owned source and appearance with valid consent and support for the selected engine.');
    return result;
  }

  if (engine === 'avatar_iv' && look.avatarType === 'photo_avatar') result.overrides.expressiveness = values.facialIntensity;

  let motionCode: string | undefined, motionMessage: string | undefined;
  if (engine === 'avatar_iii' || engine === 'avatar_iv' && look.avatarType !== 'photo_avatar') {
    motionCode = 'motion_unavailable';
    motionMessage = 'Custom gaze and gesture directions are unavailable for this engine/look combination. Select a qualified Avatar IV photo look or Avatar V source.';
  } else if (engine === 'avatar_iv' && settings.durationSeconds > 10) {
    motionCode = 'motion_long_iv_unavailable';
    motionMessage = 'Avatar IV custom motion is unavailable for a preparation target over ten seconds. The target is not measured speech duration; qualify actual scene timing through the scene route.';
  } else if (engine === 'avatar_v') {
    const ref = q.animationReference;
    const pinned = settings.animationReferenceLookId;
    if (pinned && (!ref || ref.lookId !== pinned || ref.groupId !== settings.groupId || ref.avatarType !== 'digital_twin' || !usable(ref)) ||
      look.avatarType === 'photo_avatar' && !pinned) {
      motionCode = 'animation_reference_unavailable';
      motionMessage = 'Avatar V photo motion needs a pinned ready owned digital-twin animation reference in the same group with valid consent. Refresh or select a qualified reference.';
    }
  }
  // A reference on a non-V recipe is invalid under the existing settings admission.
  if (engine !== 'avatar_v' && settings.animationReferenceLookId) {
    motionCode = 'animation_reference_unavailable';
    motionMessage = 'Animation references require Avatar V. Remove this reference or select and qualify the intended Avatar V engine.';
  }
  if (motionCode) {
    for (const field of ['gaze', 'gestures']) limit(field, motionCode, motionMessage!);
  } else {
    result.direction = performanceDirection(values);
    if (engine === 'avatar_iv') limit('durationSeconds', 'duration_target_unverified',
      'Avatar IV custom motion needs exact scene audio measured at ten seconds or less. The preparation target does not measure speech.');
    else result.overrides.motionPrompt = result.direction;
  }
  if (result.overrides.expressiveness === undefined && result.overrides.motionPrompt === undefined)
    limit('facialIntensity', 'expressiveness_unavailable',
      'This look cannot receive a facial expression setting or a qualified motion direction.');
  return result;
}
