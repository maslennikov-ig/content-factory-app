import { VOICE_SAMPLE_FILE_LIMITS } from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice-wiring.contract';
import {
  VOICE_ROUTES,
  buildFilePayload,
  voiceHttpError,
} from '@contentfactory/frontend/components/brand-voice/voice-wizard.adapter';
import {
  AGENT_SAMPLES_MAX_FILES,
  AGENT_SAMPLES_MAX_REASONS,
  type AgentSamplesUpload,
} from './agent.contract';

/**
 * Sample files attached in the chat (`content-factory-next-kcxz.18`).
 *
 * A Telegram export and a document never pass through the chat door or the
 * model: the composer sends them from the browser to the avatar screen's own
 * door (`POST …/samples/files`, the request the samples screen sends, built
 * by its own `buildFilePayload`) and the message carries only the receipt —
 * what went to which avatar and how many texts were taken
 * (`AGENT_SAMPLES_PART_TYPE`).
 *
 * Which files go this way is decided by what they are, not asked: a Telegram
 * Desktop export (`result.json`) and `.docx`/`.pdf`, which only the avatar
 * door can read. A `.txt`, `.md` or another `.json` stays an attachment the
 * agent reads — it may be material for a post as easily as a sample.
 */

/** The export Telegram Desktop writes: «Экспорт истории» → `result.json`. */
const TELEGRAM_EXPORT = /(^|[\\/])result\.json$/i;
const DOCUMENT = /\.(docx|pdf)$/i;

/** Extensions the file picker offers beyond what the chat door reads. */
export const SAMPLES_ACCEPT = '.docx,.pdf';

export const isSamplesFile = (file: { name: string }) =>
  TELEGRAM_EXPORT.test(file.name) || DOCUMENT.test(file.name);

/** The avatar door's own ceilings, checked before anything is sent. */
export const SAMPLES_LIMITS = {
  maxFiles: Math.min(AGENT_SAMPLES_MAX_FILES, VOICE_SAMPLE_FILE_LIMITS.maxFilesPerBatch),
  maxFileBytes: VOICE_SAMPLE_FILE_LIMITS.maxFileBytes,
  maxBatchBytes: VOICE_SAMPLE_FILE_LIMITS.maxBatchBytes,
} as const;

const REASON = /^[A-Z][A-Z0-9_]{1,39}$/;

const recordOf = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const listOf = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const countOf = (value: unknown) =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : 0;

/**
 * The receipt of one upload, from the door's answer
 * (`VoiceSampleFileIntakeResponseV2`): counts and reasons, never a text.
 */
export const samplesReceipt = (
  response: unknown,
  files: readonly { name: string }[],
  avatarId: string | null
): AgentSamplesUpload => {
  const answer = recordOf(response);
  const reasons = new Map<string, number>();
  for (const entry of listOf(answer.rejected)) {
    const raw = String(recordOf(entry).reason ?? '');
    const reason = REASON.test(raw) ? raw : 'UNREADABLE';
    if (!reasons.has(reason) && reasons.size >= AGENT_SAMPLES_MAX_REASONS) continue;
    reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
  }
  return {
    avatarId,
    files: files.slice(0, AGENT_SAMPLES_MAX_FILES).map((file) => file.name.slice(0, 200)),
    accepted: listOf(answer.accepted).length,
    refused: [...reasons].map(([reason, count]) => ({ reason, count })),
    telegram: listOf(answer.telegramSelection)
      .slice(0, AGENT_SAMPLES_MAX_FILES)
      .map((entry) => {
        const one = recordOf(entry);
        return {
          name: String(one.name ?? '').slice(0, 200) || 'result.json',
          selected: countOf(one.selected),
          eligible: countOf(one.eligible),
        };
      }),
  };
};

type ProductFetch = (url: string, init: RequestInit) => Promise<Response>;

/**
 * Sends the files to the avatar's samples, as the samples screen does: the
 * person's own voice, the interface language. `avatarId` absent — the
 * workspace default, or no avatar yet (the first one takes them).
 * A refusal throws the door's error (`code`, `message`), as the screen reads it.
 */
export const uploadSamples = async (
  request: ProductFetch,
  files: readonly File[],
  { avatarId, locale }: { avatarId: string | null; locale: 'ru' | 'en' }
): Promise<AgentSamplesUpload> => {
  const route = avatarId
    ? `${VOICE_ROUTES.samplesFiles}?avatar=${encodeURIComponent(avatarId)}`
    : VOICE_ROUTES.samplesFiles;
  const response = await request(route, {
    method: 'POST',
    body: buildFilePayload(
      files,
      { rightsConfirmed: false, retentionUntil: '' },
      'own',
      locale
    ),
  });
  if (!response.ok) throw await voiceHttpError(response);
  return samplesReceipt(await response.json(), files, avatarId);
};

/** What one send of sample files came to (review W3-18 F2). */
export type SamplesSent = {
  receipt: AgentSamplesUpload;
  /** The named avatar was gone; the files went to the workspace default. */
  fellBack: boolean;
};

/**
 * `uploadSamples` to the avatar the composer names; when that avatar is gone
 * (`VOICE_AVATAR_NOT_FOUND` — deleted on the screen or in another tab), once
 * more to the workspace default, and the composer says so.
 */
export const sendSamplesTo = async (
  request: ProductFetch,
  files: readonly File[],
  { avatarId, locale }: { avatarId: string | null; locale: 'ru' | 'en' }
): Promise<SamplesSent> => {
  try {
    return { receipt: await uploadSamples(request, files, { avatarId, locale }), fellBack: false };
  } catch (error) {
    if (!avatarId || (error as { code?: unknown })?.code !== 'VOICE_AVATAR_NOT_FOUND') throw error;
    return {
      receipt: await uploadSamples(request, files, { avatarId: null, locale }),
      fellBack: true,
    };
  }
};
