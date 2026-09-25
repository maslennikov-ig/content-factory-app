import type { TFunction } from 'i18next';

type Translate = TFunction | ((key: string, fallback: string, values?: Record<string, unknown>) => string);

/**
 * The in-app notification, read in the interface language.
 *
 * The orchestrator's post workflows and the channel refresh write the
 * notification as one English sentence and the database keeps only that
 * sentence. Rewording them at the source would mean a new workflow version and
 * would still leave every stored notification in English, so the sentence is
 * recognised here, where the reader's language is known. The platform's own
 * error text inside a sentence is carried over as it arrived: it is the
 * platform speaking, and only the frame around it is ours to translate.
 *
 * A sentence no pattern recognises is shown unchanged.
 */
const PATTERNS: Array<{
  re: RegExp;
  render: (t: Translate, m: RegExpMatchArray) => string;
}> = [
  {
    re: /^We couldn't post to (.+?) for ([\s\S]+) because you need to reconnect it\. Please enable it and try again\.$/,
    render: (t, m) =>
      t(
        'notification_post_needs_reconnect',
        "We couldn't post to {{provider}} for {{name}} because you need to reconnect it. Please enable it and try again.",
        v({ provider: m[1], name: m[2] })
      ),
  },
  {
    re: /^We couldn't post to (.+?) for ([\s\S]+) because it's disabled\. Please enable it and try again\.$/,
    render: (t, m) =>
      t(
        'notification_post_channel_disabled',
        "We couldn't post to {{provider}} for {{name}} because it's disabled. Please enable it and try again.",
        v({ provider: m[1], name: m[2] })
      ),
  },
  {
    re: /^Your post has been published on (.+?) at (\S*)$/,
    render: (t, m) =>
      t(
        'notification_post_published',
        'Your post has been published on {{provider}} at {{url}}',
        v({ provider: m[1], url: m[2] })
      ),
  },
  {
    re: /^An error occurred while posting comments on (.+?)(?:: ([\s\S]*))?$/,
    render: (t, m) =>
      m[2]
        ? t(
            'notification_comments_failed_reason',
            'An error occurred while posting comments on {{provider}}: {{reason}}',
            v({ provider: m[1], reason: m[2] })
          )
        : t(
            'notification_comments_failed',
            'An error occurred while posting comments on {{provider}}',
            v({ provider: m[1] })
          ),
  },
  {
    re: /^An error occurred while posting on (.+?)(?:: ([\s\S]*))?$/,
    render: (t, m) =>
      m[2]
        ? t(
            'notification_post_failed_reason',
            'An error occurred while posting on {{provider}}: {{reason}}',
            v({ provider: m[1], reason: m[2] })
          )
        : t(
            'notification_post_failed',
            'An error occurred while posting on {{provider}}',
            v({ provider: m[1] })
          ),
  },
  {
    re: /^Could not refresh your (\S+) channel ([\s\S]*)\. Please go back to the system and connect it again (\S*)$/,
    render: (t, m) =>
      t(
        'notification_channel_refresh_failed',
        'Could not refresh your {{provider}} channel {{reason}}. Please go back to the system and connect it again {{url}}',
        v({ provider: m[1], reason: m[2], url: m[3] })
      ),
  },
];

/**
 * The sentence is rendered as HTML so its URLs become links. i18next's own
 * escaping would also turn `/` into `&#x2F;` and break those links, so the
 * values are escaped here instead, without the slash.
 */
const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const v = (values: Record<string, string>) => ({
  ...Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, escapeHtml(value)])
  ),
  interpolation: { escapeValue: false },
});

export const translateNotification = (content: string, t: Translate): string => {
  for (const { re, render } of PATTERNS) {
    const match = content.match(re);
    if (match) {
      return render(t, match);
    }
  }
  return content;
};
