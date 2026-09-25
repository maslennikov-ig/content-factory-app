import {
  BackendLocale,
  BackendStringKey,
  translateBackendString,
  translateBackendText,
} from './backend-strings';

/**
 * Notification emails, in the recipient's language.
 *
 * The post workflows, the channel refresh and the streak and digest
 * workflows write their notifications as English sentences, and a Temporal
 * workflow's code is a contract this repository does not edit in place. The
 * sentences are recognised here instead, at the two places an email leaves
 * for a known recipient: `NotificationService.sendEmailsToOrg` and
 * `EmailActivity.sendEmailAsync`. The frontend bell does the same with the
 * same sentences (`apps/frontend/src/components/notifications/
 * notification.text.ts`).
 *
 * The platform's own error text inside a sentence is carried over as it
 * arrived. A sentence no pattern recognises is returned unchanged, so a new
 * English notification degrades to English rather than to nothing.
 */

type Rule = {
  re: RegExp;
  key: (m: RegExpMatchArray) => BackendStringKey;
  params: (m: RegExpMatchArray) => Record<string, string>;
};

const SUBJECTS: Rule[] = [
  {
    re: /^We couldn't post to (.+?) for ([\s\S]+)$/,
    key: () => 'notify_post_blocked_subject',
    params: (m) => ({ provider: m[1], name: m[2] }),
  },
  {
    re: /^Your post has been published on (.+)$/,
    key: () => 'notify_post_published_subject',
    params: (m) => ({ provider: m[1] }),
  },
  {
    re: /^Error posting comments on (.+?) for ([\s\S]+)$/,
    key: () => 'notify_comments_error_subject',
    params: (m) => ({ provider: m[1], name: m[2] }),
  },
  {
    re: /^Error posting on (.+?) for ([\s\S]+)$/,
    key: () => 'notify_post_error_subject',
    params: (m) => ({ provider: m[1], name: m[2] }),
  },
  {
    re: /^Could not refresh your (\S+) channel ([\s\S]*)$/,
    key: () => 'notify_channel_refresh_failed_subject',
    params: (m) => ({ provider: m[1], reason: m[2] }),
  },
  {
    re: /^\[Content Factory\] Your latest notifications$/,
    key: () => 'notify_digest_subject',
    params: () => ({}),
  },
  {
    re: /^Streak Reminder$/,
    key: () => 'notify_streak_subject',
    params: () => ({}),
  },
];

const MESSAGES: Rule[] = [
  {
    re: /^We couldn't post to (.+?) for ([\s\S]+) because you need to reconnect it\. Please enable it and try again\.$/,
    key: () => 'notify_post_needs_reconnect',
    params: (m) => ({ provider: m[1], name: m[2] }),
  },
  {
    re: /^We couldn't post to (.+?) for ([\s\S]+) because it's disabled\. Please enable it and try again\.$/,
    key: () => 'notify_post_channel_disabled',
    params: (m) => ({ provider: m[1], name: m[2] }),
  },
  {
    re: /^Your post has been published on (.+?) at (\S*)$/,
    key: () => 'notify_post_published',
    params: (m) => ({ provider: m[1], url: m[2] }),
  },
  {
    re: /^An error occurred while posting comments on (.+?)(?:: ([\s\S]*))?$/,
    key: (m) =>
      m[2] ? 'notify_comments_failed_reason' : 'notify_comments_failed',
    params: (m) => ({ provider: m[1], reason: m[2] ?? '' }),
  },
  {
    re: /^An error occurred while posting on (.+?)(?:: ([\s\S]*))?$/,
    key: (m) => (m[2] ? 'notify_post_failed_reason' : 'notify_post_failed'),
    params: (m) => ({ provider: m[1], reason: m[2] ?? '' }),
  },
  {
    re: /^Could not refresh your (\S+) channel ([\s\S]*)\. Please go back to the system and connect it again (\S*)$/,
    key: () => 'notify_channel_refresh_failed',
    params: (m) => ({ provider: m[1], reason: m[2], url: m[3] }),
  },
  {
    re: /^You are about to lose your streak in two hours! schedule a post now to keep it!$/i,
    key: () => 'notify_streak_body',
    params: () => ({}),
  },
];

const apply = (
  rules: Rule[],
  text: string,
  render: (key: BackendStringKey, params: Record<string, string>) => string
): string | null => {
  for (const rule of rules) {
    const match = text.match(rule.re);
    if (match) return render(rule.key(match), rule.params(match));
  }
  return null;
};

/** A subject line is plain text: parameters are not HTML-escaped. */
export function translateNotificationSubject(
  subject: string,
  locale: BackendLocale
): string {
  if (locale === 'en') return subject;
  return (
    apply(SUBJECTS, subject, (key, params) =>
      translateBackendText(key, locale, params)
    ) ?? subject
  );
}

/**
 * A body is HTML: a single notification, a `<p>`-wrapped one, or the digest's
 * several notifications joined with `<br/>`. Each part is translated on its
 * own and parameters are HTML-escaped, since they came from outside.
 */
export function translateNotificationBody(
  html: string,
  locale: BackendLocale
): string {
  if (locale === 'en') return html;
  return html
    .split(/(<br\s*\/?>)/i)
    .map((part) => {
      if (/^<br\s*\/?>$/i.test(part)) return part;
      const wrapped = part.match(/^(\s*<p>)([\s\S]*)(<\/p>\s*)$/i);
      const [open, inner, close] = wrapped
        ? [wrapped[1], wrapped[2], wrapped[3]]
        : ['', part, ''];
      const translated = apply(MESSAGES, inner.trim(), (key, params) =>
        translateBackendString(key, locale, params)
      );
      return translated === null ? part : open + translated + close;
    })
    .join('');
}
