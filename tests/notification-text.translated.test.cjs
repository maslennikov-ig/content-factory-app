const fs = require('node:fs');
const path = require('node:path');
const i18next = require('i18next');
const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

/**
 * The bell showed the orchestrator's English sentences on a Russian screen:
 * the workflows store one English string per notification. The sentence is
 * recognised and translated where it is read; these are the exact strings the
 * workflows and the channel refresh write today.
 */
const { translateNotification } = loadTypeScriptModule(
  'apps/frontend/src/components/notifications/notification.text.ts'
);
const locale = (l) =>
  JSON.parse(
    fs.readFileSync(
      path.join(
        __dirname,
        '..',
        `libraries/react-shared-libraries/src/translation/locales/${l}/translation.json`
      ),
      'utf8'
    )
  );

const sentences = [
  "We couldn't post to telegram for Мой канал because you need to reconnect it. Please enable it and try again.",
  "We couldn't post to telegram for Мой канал because it's disabled. Please enable it and try again.",
  'Your post has been published on Telegram at https://t.me/c/1/2',
  'An error occurred while posting on x: Status is a duplicate',
  'An error occurred while posting comments on x',
  'Could not refresh your linkedin channel Error: 401. Please go back to the system and connect it again https://factory.example/launches',
];

describe('in-app notifications speak the interface language', () => {
  let t;
  beforeAll(async () => {
    const instance = i18next.createInstance();
    await instance.init({
      lng: 'ru',
      resources: { ru: { translation: locale('ru') }, en: { translation: locale('en') } },
    });
    t = instance.t.bind(instance);
  });

  test.each(sentences)('%s', (sentence) => {
    const text = translateNotification(sentence, t);
    expect(text).not.toMatch(/We couldn't|has been published|error occurred|Could not refresh/);
    expect(text).toMatch(/[А-Яа-яЁё]/);
  });

  test('links survive translation and markup in platform text does not', () => {
    expect(translateNotification(sentences[2], t)).toContain('https://t.me/c/1/2');
    expect(
      translateNotification('An error occurred while posting on x: <img src=x>', t)
    ).toContain('&lt;img src=x&gt;');
  });

  test('an unknown sentence is shown unchanged', () => {
    expect(translateNotification('Something else', t)).toBe('Something else');
  });
});
