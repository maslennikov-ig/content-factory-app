import { z } from 'zod';
import { LocalCompositionCueV2Schema, LocalCompositionSettingsV2Schema, LOCAL_COMPOSITION_LIMITS_V2 } from '../local-reel/local-composition.v2';

const id = z.string().min(1).max(200);
const sha = z.string().regex(/^[a-f0-9]{64}$/);
/** Additive final-only descriptor on an existing operation. Paid V1/PersonalV2 manifests and rows are unchanged.
 * Public values contain IDs/text only. The server resolves actor/tenant, parent/source funding history,
 * filesystem paths, measured facts, hashes, engine version and any alignment evidence independently.
 */
export const VideoProductionLocalManifestV3Schema = z.object({version: z.literal(3), kind: z.literal('local_owned_composition'),
  source: z.object({pieceId: id, revision: sha, textSha256: sha, adaptationId: id.optional()}).strict(),
  sourceProductionRevisionId: id.optional(), title: z.string().min(1).max(500), locale: z.string().min(2).max(80),
  funding: z.object({kind: z.literal('local_compute'), scope: z.literal('final_only')}).strict(),
  settings: LocalCompositionSettingsV2Schema,
  scenes: z.array(z.object({id, mediaId: id, durationSeconds: z.number().finite().positive().max(600),
    sourceAudio: z.enum(['retain_source', 'silent'])}).strict()).min(1).max(LOCAL_COMPOSITION_LIMITS_V2.maxScenes),
  narration: z.object({mediaId: id, mode: z.enum(['replace', 'mix']), gain: z.literal(1), offsetSeconds: z.literal(0)}).strict().optional(),
  music: z.object({mediaId: id, gain: z.literal(0.15), offsetSeconds: z.literal(0), fit: z.literal('trim_to_edit')}).strict().optional(),
  timedText: z.union([
    z.object({origin: z.literal('authored_timed_text'), cues: z.array(LocalCompositionCueV2Schema).min(1).max(2000), alignmentEvidenceId: id.optional()}).strict(),
    z.object({origin: z.literal('owned_subtitle_file'), mediaId: id, role: z.enum(['speech_caption', 'screen_title']), alignmentEvidenceId: id.optional()}).strict(),
  ]).optional(),
  screenTitles: z.array(LocalCompositionCueV2Schema.refine(c => c.role === 'screen_title', 'LOCAL_COMPOSITION_TITLE_ROLE_REQUIRED')).min(1).max(2000).optional(),
  brand: z.object({mediaId: id, position: z.literal('top_right')}).strict().optional(),
}).strict().superRefine((input, ctx) => {
  const fail = (message: string) => ctx.addIssue({code: z.ZodIssueCode.custom, message});
  try {new Intl.Locale(input.locale);} catch {fail('LOCAL_COMPOSITION_LOCALE_INVALID');}
  const duration = input.scenes.reduce((sum, s) => sum + Math.round(s.durationSeconds * 30), 0) / 30;
  if (duration > 600 || input.scenes.some(s => Math.round(s.durationSeconds * 30) < 1)) fail('LOCAL_COMPOSITION_DURATION_LIMIT');
  if (new Set(input.scenes.map(s => s.id)).size !== input.scenes.length) fail('LOCAL_COMPOSITION_DUPLICATE_SCENE');
  if (input.timedText?.origin === 'authored_timed_text') {
    if (Buffer.byteLength(JSON.stringify(input.timedText.cues), 'utf8') > 2 * 1024 * 1024) fail('LOCAL_COMPOSITION_CUES_LIMIT');
    for (const cue of input.timedText.cues) if (cue.endSeconds <= cue.startSeconds || cue.endSeconds > duration + 1 / 30 || !cue.text.trim()) fail('LOCAL_COMPOSITION_CUES_INVALID');
  }
  // Referencing an evidence id is a request to resolve it, never an alignment assertion.
  if (input.settings.captions === 'authored_timed_text' && !input.timedText) fail('LOCAL_COMPOSITION_CUES_REQUIRED');
});
export type VideoProductionLocalManifestV3 = z.infer<typeof VideoProductionLocalManifestV3Schema>;
