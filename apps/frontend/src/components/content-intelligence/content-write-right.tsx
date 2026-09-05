'use client';

import type { ReactNode } from 'react';
import { isOrganizationEditor } from '@contentfactory/nestjs-libraries/user/organization.roles';

/**
 * The right to write, on the two screens of «Контент» that only show things
 * (`content-factory-next-cl19`).
 *
 * The audit of 02.09.2026 (№16) found «Снять», «Копировать» and «Подтвердить»
 * on the witness screen, and «Занести текст» in the archive, rendered
 * unconditionally — no screen there knew a refusal by right was possible at
 * all. What it did when one arrived was worse than nothing: a
 * `SubscriptionException` carries `{ section, action }` and no `message`, so
 * `jsonReader` built its own sentence from the status and the screen printed
 * «Material request failed: 402» where an explanation goes.
 *
 * What this module does NOT do, deliberately: guess in advance.
 *
 * The doors behind these buttons carry a plan section and a role beside it:
 * `[Create, AI]` plus `[Create, EDITOR]` for the facts, `[Create,
 * POSTS_PER_MONTH]` plus `[Create, EDITOR]` for the archive import. Until
 * 05.09.2026 there was no role on them at all, and this paragraph said so —
 * with no billing configured every signed-in member could retract, copy,
 * confirm and import. The owner's decision that day
 * (`content-factory-next-fn33.90`) gave those doors to the editor, and this
 * module needed no change to follow. That is the point of learning the right
 * from the answer instead of guessing it in advance.
 *
 * Since `content-factory-next-fn33.90.8` the role half is known before the
 * screen draws, the way «Откуда идеи» has always known it — see
 * `writeRightFromRole` below for why reading the session is not guessing.
 * The plan half is still learned from the answer: nothing in the browser
 * holds a running count, and a working door made unreachable by a screen that
 * guessed at one would be the opposite defect of the one being fixed.
 *
 * So the right is learned from the only authority that has it — the server —
 * and the screen changes the moment it answers. `403` is a role refusal
 * (`Sections.ADMIN` and `Sections.EDITOR` are the two sections that produce
 * one; a role is not sold, so it is not `402`) and `402` is a plan limit. Anything else stays an
 * ordinary error, because an ordinary error is what it is.
 */

export type WriteRefusal = 'role' | 'plan';

export type ContentWriteRight = Readonly<{
  allowed: boolean;
  refusal: WriteRefusal | null;
}>;

/** What every screen starts in: nothing has refused, so nothing is claimed. */
export const WRITE_ALLOWED: ContentWriteRight = Object.freeze({
  allowed: true,
  refusal: null,
});

/**
 * The right the session already knows, before any door has been knocked on.
 *
 * The paragraph above says these screens learn their threshold from the first
 * refusal rather than guessing it, and that stays true of the plan: a plan
 * limit is a running count and nothing in the browser holds it. A role is not
 * a count. Since 05.09.2026 it is one function
 * (`libraries/nestjs-libraries/src/user/organization.roles.ts`), the server
 * reaches it through `Sections.EDITOR`, and the session carries the role — so
 * this is not a guess but the same reading, done a moment earlier.
 *
 * That moment is the whole defect this closes
 * (`content-factory-next-fn33.90.8`): on the live walkthrough of 05.09 a
 * `USER` opened «Занести текст», filled in the title and the body, pressed
 * «Занести» and lost the lot to a refusal that only arrived then.
 *
 * `WRITE_ALLOWED` for anyone who passes: passing the role says nothing about
 * the plan, and the plan is still learned from the answer.
 */
export const writeRightFromRole = (
  role: string | null | undefined
): ContentWriteRight =>
  isOrganizationEditor(role) ? WRITE_ALLOWED : { allowed: false, refusal: 'role' };

/**
 * A refusal read as a verdict about the right, or `WRITE_ALLOWED` when the
 * failure says nothing about rights.
 *
 * The status is the whole reading. `SubscriptionException` puts `section` and
 * `action` in the body, but `jsonReader` — shared with the brand-voice screens
 * and not this module's to change — keeps only `status`, `code` and `subject`
 * from a rejected answer. A `code` means a controller answered with its own
 * named refusal (`safeContextError`, `safeHttpError`), which is a fact about
 * the request rather than about the reader, and those are left alone.
 */
export const readWriteRight = (error: unknown): ContentWriteRight => {
  const carried = (error || {}) as { status?: unknown; code?: unknown };
  if (typeof carried.code === 'string' && carried.code) return WRITE_ALLOWED;
  if (carried.status === 403) return { allowed: false, refusal: 'role' };
  if (carried.status === 402) return { allowed: false, refusal: 'plan' };
  return WRITE_ALLOWED;
};

/**
 * The one line a blocked action leaves behind.
 *
 * `docs/design/component-authoring-rules.md`: a disabled control explains
 * itself, and the explanation is text, not an empty space where a button used
 * to be. It is a `role="status"` region rather than a tooltip because it is
 * the state itself and the only copy of it — the same reason `AllowanceHint`
 * is not a `Hint`.
 *
 * The words belong to the screen. Both screens in this section keep their own
 * `ru`/`en` table (`resolveContentLocale`), and a refusal that reads like the
 * screen around it is worth more than one shared sentence that reads like
 * neither.
 */
export function ContentReadOnlyNote({
  id,
  surface,
  refusal,
  children,
}: {
  /** Referenced by `aria-describedby` from every control it explains. */
  id: string;
  /** The screen, for the attribute a review scene and a test look for. */
  surface: 'facts' | 'archive' | 'brief';
  refusal: WriteRefusal;
  children: ReactNode;
}) {
  return (
    <p
      id={id}
      role="status"
      data-content-read-only={surface}
      data-content-read-only-refusal={refusal}
      className="max-w-[80ch] rounded-[8px] border border-cf-border bg-cf-surface-subtle p-[12px] cf-body-sm text-cf-ink [text-wrap:pretty]"
    >
      {children}
    </p>
  );
}
