import {
  createTransientClientTracker,
  type TransientClientRequest,
} from './transient-client-tracker';

const REGISTRATION_EFFECT_TTL_MS = 60_000;
const FORM_REFUSALS = {
  email_plus_not_allowed: 'Email with plus sign is not allowed',
  email_already_exists: 'Email already exists',
  invite_email_mismatch: 'This invitation belongs to another email address',
} as const;

/** Only raised at explicit registration checks before account/mail effects. */
export class RegistrationFormRefusal extends Error {
  readonly status: number;

  constructor(readonly code: keyof typeof FORM_REFUSALS) {
    super(FORM_REFUSALS[code]);
    this.name = 'RegistrationFormRefusal';
    this.status = code === 'invite_email_mismatch' ? 403 : 400;
  }
}

export type RegistrationReservation = {
  readonly key: string;
  readonly owner: symbol;
};

type RegistrationAdmission =
  | { allowed: true; reservation: RegistrationReservation }
  | { allowed: false; retryAfterSeconds: number };

/**
 * The deployed backend is one forked process, as is the HMAC tracker secret.
 * Synchronous check/set is the acquisition boundary: there is no await between
 * observing a slot and owning it. Only HMACs, expiry and opaque owners are held.
 * Restart resets this limit, as it resets the existing caller tracker secret.
 */
export class RegistrationEffectLimiter {
  private readonly slots = new Map<
    string,
    { owner: symbol; expiresAt: number; timer: ReturnType<typeof setTimeout> }
  >();

  acquire(
    key: string,
    previousKey: string,
    now = Date.now()
  ): RegistrationAdmission {
    for (const candidate of new Set([key, previousKey])) {
      const existing = this.slots.get(candidate);
      if (!existing) continue;
      if (existing.expiresAt > now) {
        return {
          allowed: false,
          retryAfterSeconds: Math.ceil((existing.expiresAt - now) / 1000),
        };
      }
      clearTimeout(existing.timer);
      this.slots.delete(candidate);
    }

    const owner = Symbol('registration-reservation');
    const timer = setTimeout(() => {
      if (this.slots.get(key)?.owner === owner) this.slots.delete(key);
    }, REGISTRATION_EFFECT_TTL_MS);
    timer.unref();
    this.slots.set(key, {
      owner,
      expiresAt: now + REGISTRATION_EFFECT_TTL_MS,
      timer,
    });
    return { allowed: true, reservation: { key, owner } };
  }

  release(reservation: RegistrationReservation): boolean {
    const existing = this.slots.get(reservation.key);
    if (!existing || existing.owner !== reservation.owner) return false;
    clearTimeout(existing.timer);
    return this.slots.delete(reservation.key);
  }
}

const registrationEffects = new RegistrationEffectLimiter();

export function acquireRegistrationEffect(request: TransientClientRequest) {
  const now = Date.now();
  // The previous minute's HMAC preserves a full 60-second hold across the
  // tracker rotation, without retaining an address or a longer-lived hash.
  return registrationEffects.acquire(
    createTransientClientTracker(request, now),
    createTransientClientTracker(request, now - REGISTRATION_EFFECT_TTL_MS),
    now
  );
}

export function releaseRegistrationEffect(
  reservation: RegistrationReservation
) {
  return registrationEffects.release(reservation);
}
