'use client';

import { useCallback } from 'react';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';
import {
  PASSWORD_POLICY_ERROR_MESSAGE,
  PASSWORD_POLICY_RANGE,
} from '@contentfactory/nestjs-libraries/dtos/auth/password.policy';

/**
 * One place that turns a refusal into a sentence a person can read.
 *
 * Two different refusals used to reach the screen verbatim, both in English
 * and both written for a developer:
 *
 * - the server's own answer, printed as it arrived —
 *   `{"statusCode":429,"message":"ThrottlerException: Too Many Requests"}`
 *   under the email field of the registration form
 *   (`content-factory-next-fn33.38`), and «Invalid user name or password»
 *   on a sign-in page that was otherwise entirely in Russian
 *   (`content-factory-next-fn33.43`);
 * - a class-validator message, which names the property from the code and
 *   spells out the constraint — «fullname must be longer than or equal to 3
 *   characters» (`content-factory-next-fn33.73`) and «role must be one of the
 *   following values: USER, EDITOR, ADMIN» (`content-factory-next-fn33.72`),
 *   the second one printing the enum values instead of the role names the
 *   product shows everywhere else.
 *
 * Both are answered here rather than in each form, because the same two
 * defects appeared on four screens owned by three different areas of the
 * product and were about to be fixed four times.
 *
 * The response code leads, because it is the only part of an answer that is a
 * contract. The English sentences below are a second, narrower courtesy: the
 * authentication service refuses with a bare `Error` message and status 400 for
 * every one of its reasons, so a code alone cannot tell «this address is taken»
 * from «registration is closed». They are matched whole and exactly, and
 * anything unmatched falls back to a translated sentence — the raw text never
 * reaches the screen either way.
 */

/** What a failed request said, once. A body can only be read one time. */
export type RequestFailure = {
  status: number;
  /**
   * Class-validator complaints, keyed by the property each one names. Nest's
   * validation pipe answers with `message: string[]`, and every entry starts
   * with the property path.
   */
  fields: Record<string, string>;
  /** Exactly what the server said. For the console and for tests, not the screen. */
  raw: string;
};

/** The property a class-validator message is about: its first word. */
const validatorField = (message: string) => message.trim().split(/\s+/)[0] || '';

/**
 * Does this message come from class-validator rather than from the product?
 * Its messages always open with the property name; a sentence the product
 * wrote for a person does not.
 */
const isValidatorMessage = (field: string, message: string) =>
  !!field &&
  message.trim().toLowerCase().startsWith(`${field.toLowerCase()} `);

export const parseRequestFailure = async (
  response: Response
): Promise<RequestFailure> => {
  const raw = await response.text().catch(() => '');
  const failure: RequestFailure = {
    status: response.status,
    fields: {},
    raw,
  };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return failure;
  }

  const message = (parsed as { message?: unknown } | null)?.message;
  if (Array.isArray(message)) {
    for (const entry of message) {
      const text = String(entry);
      const field = validatorField(text);
      // First complaint per field wins: class-validator lists every broken
      // constraint, and a person needs one instruction, not four.
      if (field && !failure.fields[field]) failure.fields[field] = text;
    }
    return failure;
  }

  if (typeof message === 'string') {
    return { ...failure, raw: message };
  }

  return failure;
};

/**
 * The sentences the authentication service refuses with, matched whole.
 * `apps/backend/src/services/auth/auth.service.ts` throws these as plain
 * `Error` messages, and `auth.controller.ts` sends them as a 400 body.
 */
const KNOWN_REFUSALS: Record<string, { key: string; fallback: string }> = {
  'Email already exists': {
    key: 'error_email_already_registered',
    fallback: 'An account with this email address already exists.',
  },
  'Email with plus sign is not allowed': {
    key: 'error_email_plus_sign',
    fallback:
      'This address contains a plus sign, which is not accepted here. Use your plain address.',
  },
  'Registration is disabled': {
    key: 'error_registration_closed',
    fallback: 'Registration is closed on this instance.',
  },
  'Invalid user name or password': {
    key: 'error_invalid_credentials',
    fallback: 'Wrong email address or password.',
  },
};

/**
 * One field's refusal, in the reader's language.
 *
 * A message the product itself wrote — `password_reset_link_expired`, for
 * instance — is already a sentence and is passed through untouched. Only a
 * class-validator message, recognised by the property name it opens with, is
 * replaced.
 */
export const useFieldErrorMessage = () => {
  const t = useT();
  return useCallback(
    (field: string, message?: unknown): string | undefined => {
      if (!message) return undefined;
      const text = String(message);

      // The password policy carries its own message through the DTO, so it
      // does not start with the property name and would otherwise be shown in
      // English with the numbers spelled out in the code.
      if (text === PASSWORD_POLICY_ERROR_MESSAGE) {
        return t(
          'password_policy_error',
          'Use {{min}}–{{max}} characters with a letter, a number, and a special character.',
          PASSWORD_POLICY_RANGE
        ) as string;
      }

      if (!isValidatorMessage(field, text)) return text;

      if (/should not be empty|must be defined|must not be null/i.test(text)) {
        return t('validation_required', 'Fill this field in.') as string;
      }

      if (field === 'email') {
        return t(
          'validation_email_invalid',
          'Enter an email address, for example name@example.com.'
        ) as string;
      }

      if (field === 'role') {
        return t('validation_role_required', 'Choose the role for this person.') as string;
      }

      if (field === 'password') {
        return t(
          'password_policy_error',
          'Use {{min}}–{{max}} characters with a letter, a number, and a special character.',
          PASSWORD_POLICY_RANGE
        ) as string;
      }

      if (field === 'repeatPassword') {
        return t(
          'validation_passwords_differ',
          'The two passwords are not the same.'
        ) as string;
      }

      if (field === 'fullname') {
        // The length comes out of the message rather than out of a second copy
        // of the DTO: the number on screen stays true when the rule changes.
        const minimum = text.match(/\d+/)?.[0] || '3';
        return t(
          'validation_name_too_short',
          'Enter a name of at least {{min}} characters.',
          { min: minimum }
        ) as string;
      }

      return t(
        'validation_value_refused',
        'This value was not accepted. Check the field and try again.'
      ) as string;
    },
    [t]
  );
};

/** One sentence for a whole failed request. */
export const useRequestErrorMessage = () => {
  const t = useT();
  const fieldMessage = useFieldErrorMessage();
  return useCallback(
    (failure: RequestFailure): string => {
      if (failure.status === 429) {
        return t(
          'error_too_many_attempts',
          'Too many attempts from this address. Wait a minute and try again.'
        ) as string;
      }
      if (failure.status === 409) {
        return t(
          'error_email_already_registered',
          'An account with this email address already exists.'
        ) as string;
      }
      if (failure.status >= 500) {
        return t(
          'error_service_unavailable',
          'The service did not answer. Try again in a minute.'
        ) as string;
      }

      const [field] = Object.keys(failure.fields);
      if (field) {
        return (
          fieldMessage(field, failure.fields[field]) ||
          (t(
            'validation_value_refused',
            'This value was not accepted. Check the field and try again.'
          ) as string)
        );
      }

      const known = KNOWN_REFUSALS[failure.raw.trim()];
      if (known) return t(known.key, known.fallback) as string;

      return t(
        'error_request_refused',
        'That did not go through. Check what you entered and try again.'
      ) as string;
    },
    [t, fieldMessage]
  );
};
