'use client';

import type { ReactNode } from 'react';

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
 * The doors behind these buttons are `[Create, Sections.AI]` for the facts and
 * `[Create, Sections.POSTS_PER_MONTH]` for the archive import — plan sections,
 * not roles. `docs/product/roles-matrix.md` states the consequence in full:
 * with no billing configured, `permissions.service.ts` grants every non-ADMIN
 * section outright, so on this instance every signed-in member of the
 * workspace may retract, copy, confirm and import today. Hiding those buttons
 * from a member the way «Откуда идеи» hides its administrator actions
 * (`content-factory-next-fn33.63`) would be the opposite defect of the one
 * being fixed: a working door made unreachable by a screen that guessed.
 *
 * So the right is learned from the only authority that has it — the server —
 * and the screen changes the moment it answers. `403` is a role refusal
 * (`Sections.ADMIN` is the only section that produces one; a role is not sold,
 * so it is not `402`) and `402` is a plan limit. Anything else stays an
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
  surface: 'facts' | 'archive';
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
