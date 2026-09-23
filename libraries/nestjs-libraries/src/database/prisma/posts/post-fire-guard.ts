/**
 * May a publishing workflow still act on this post? (`content-factory-next-97dq.57`,
 * correctness review F2.)
 *
 * `postWorkflowV105` checks `state === 'QUEUE'` once, before it sleeps until
 * `publishDate`, and not after. A post taken off the queue while the workflow
 * slept (unscheduled, replaced by a newer autopilot version) must not go out
 * even if terminating that workflow failed. The check lives in the activities
 * the workflow calls after the sleep, so the workflow code — and Temporal's
 * replay determinism — stay untouched.
 *
 * A post is fireable when it is live and `QUEUE`. The one exception is a
 * repeating post (`intervalInDays`): its repeat run starts with `postNow` on a
 * post that already went out, so any state but `DRAFT` stays fireable there,
 * exactly as before.
 */
export type FireablePostLike = {
  state?: string | null;
  deletedAt?: Date | string | null;
  intervalInDays?: number | null;
} | null | undefined;

export const isFireablePost = (post: FireablePostLike): boolean => {
  if (!post || post.deletedAt) return false;
  const state = String(post.state || '').toUpperCase();
  if (state === 'QUEUE') return true;
  return post.intervalInDays != null && state !== 'DRAFT' && state !== '';
};

/**
 * A stale workflow must not write its verdict over a post that a person took
 * back into drafts: «No Post» / «Already posted» as `ERROR` on a draft would
 * turn a quiet unschedule into a red error in the calendar.
 */
export const mayWriteWorkflowState = (
  current: { state?: string | null } | null | undefined,
  next: string
): boolean =>
  !(String(current?.state || '').toUpperCase() === 'DRAFT' && next !== 'DRAFT');
