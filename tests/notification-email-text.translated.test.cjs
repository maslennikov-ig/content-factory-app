const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

/**
 * Notification emails left in English while the account read Russian: the
 * workflows write English sentences and the mail went out as written.
 * `notification-email-text.ts` recognises those sentences where the mail
 * leaves for a known recipient. These are the exact strings the post
 * workflows, the channel refresh, the digest and the streak workflow write.
 */
const { translateNotificationSubject, translateNotificationBody } =
  loadTypeScriptModule(
    'libraries/nestjs-libraries/src/locale/notification-email-text.ts',
    {},
    {
      sources: {
        './backend-strings':
          'libraries/nestjs-libraries/src/locale/backend-strings.ts',
      },
    }
  );

const CYRILLIC = /[А-Яа-яЁё]/;

const subjects = [
  "We couldn't post to telegram for Мой канал",
  'Your post has been published on Telegram',
  'Error posting on x for Main ',
  'Error posting comments on x for Main',
  'Could not refresh your linkedin channel Error: 401',
  '[Content Factory] Your latest notifications',
  'Streak Reminder',
];

const bodies = [
  "We couldn't post to telegram for Main because you need to reconnect it. Please enable it and try again.",
  "We couldn't post to telegram for Main because it's disabled. Please enable it and try again.",
  'Your post has been published on Telegram at https://t.me/c/1/2',
  'An error occurred while posting on x: Status is a duplicate',
  'An error occurred while posting comments on x',
  'Could not refresh your linkedin channel Error: 401. Please go back to the system and connect it again https://factory.example/launches',
  '<p>You are about to lose your streak in two hours! schedule a post now to keep it!</p>',
];

describe('notification emails speak the recipient language', () => {
  test.each(subjects)('subject: %s', (subject) => {
    expect(translateNotificationSubject(subject, 'ru')).toMatch(CYRILLIC);
  });

  test.each(bodies)('body: %s', (body) => {
    expect(translateNotificationBody(body, 'ru')).toMatch(CYRILLIC);
  });

  test('a digest translates every notification it joins', () => {
    const digest = translateNotificationBody(bodies.slice(0, 3).join('<br/>'), 'ru');
    expect(digest.split('<br/>')).toHaveLength(3);
    for (const part of digest.split('<br/>')) expect(part).toMatch(CYRILLIC);
    expect(digest).toContain('https://t.me/c/1/2');
  });

  test('English stays byte-for-byte and unknown text passes through', () => {
    for (const body of bodies) expect(translateNotificationBody(body, 'en')).toBe(body);
    expect(translateNotificationBody('Something else', 'ru')).toBe('Something else');
    expect(translateNotificationSubject('Something else', 'ru')).toBe('Something else');
  });

  test('platform text is escaped in the body and left plain in the subject', () => {
    expect(
      translateNotificationBody('An error occurred while posting on x: <b>&', 'ru')
    ).toContain('&lt;b&gt;&amp;');
    expect(
      translateNotificationSubject("We couldn't post to x for Ben & Jerry's", 'ru')
    ).toContain("Ben & Jerry's");
  });
});
