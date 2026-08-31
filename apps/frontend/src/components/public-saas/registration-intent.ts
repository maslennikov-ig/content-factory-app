import { isStarterTemplate } from '@contentfactory/nestjs-libraries/dtos/auth/starter-template';
import type { StarterTemplate } from '@contentfactory/nestjs-libraries/dtos/auth/starter-template';

export const REGISTRATION_INTENT_KEY = 'content-factory:registration-intent';
export const REGISTRATION_INTENT_TTL_MS = 10 * 60 * 1000;

type SessionStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function issueRegistrationIntent(
  storage: SessionStorage,
  starterTemplate: unknown,
  now = Date.now()
) {
  storage.setItem(
    REGISTRATION_INTENT_KEY,
    JSON.stringify({
      version: 1,
      starterTemplate: isStarterTemplate(starterTemplate)
        ? starterTemplate
        : 'blank',
      issuedAt: now,
    })
  );
}

export function consumeRegistrationIntent(
  storage: SessionStorage,
  now = Date.now()
): StarterTemplate {
  const serialized = storage.getItem(REGISTRATION_INTENT_KEY);
  storage.removeItem(REGISTRATION_INTENT_KEY);
  if (!serialized) return 'blank';

  try {
    const parsed = JSON.parse(serialized) as Record<string, unknown>;
    if (
      Object.keys(parsed).sort().join(',') !==
        'issuedAt,starterTemplate,version' ||
      parsed.version !== 1 ||
      !isStarterTemplate(parsed.starterTemplate) ||
      typeof parsed.issuedAt !== 'number' ||
      parsed.issuedAt > now ||
      now - parsed.issuedAt > REGISTRATION_INTENT_TTL_MS
    ) {
      return 'blank';
    }
    return parsed.starterTemplate;
  } catch {
    return 'blank';
  }
}

export function readRegistrationIntent(
  storage: SessionStorage,
  now = Date.now()
): StarterTemplate {
  const serialized = storage.getItem(REGISTRATION_INTENT_KEY);
  if (!serialized) return 'blank';
  try {
    const parsed = JSON.parse(serialized) as Record<string, unknown>;
    if (
      Object.keys(parsed).sort().join(',') ===
        'issuedAt,starterTemplate,version' &&
      parsed.version === 1 &&
      isStarterTemplate(parsed.starterTemplate) &&
      typeof parsed.issuedAt === 'number' &&
      parsed.issuedAt <= now &&
      now - parsed.issuedAt <= REGISTRATION_INTENT_TTL_MS
    ) {
      return parsed.starterTemplate;
    }
  } catch {
    // Malformed browser state is the same safe blank intent as stale state.
  }
  return 'blank';
}
