import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ButtonLink } from '@contentfactory/react/form/button-link';
import {
  defineInterfaceReviewScene,
  InterfaceReviewFrame,
  INTERFACE_REVIEW_STATES,
  resolveInterfaceReviewContext,
  type InterfaceReviewState,
} from '../../../components/interface-review/fixture-contract';

/**
 * The way in.
 *
 * Every scene is reachable by typing a URL, which is fine for a script and
 * useless for a person who wants to see the whole thing once. This lists them
 * in the order the product presents them, carries the current theme, language
 * and width into every link, and says which task built each — so looking at a
 * screen and reading why it exists are one click apart rather than two systems
 * apart.
 */

const foundationScene = defineInterfaceReviewScene({
  id: 'interface-review',
  fixture: { purpose: 'Synthetic interface review host' },
  states: ['default'] as const satisfies readonly InterfaceReviewState[],
});

type SceneEntry = {
  path: string;
  screen: string | null;
  title: { ru: string; en: string };
  task: string;
};

const CONTENT_SCENES: readonly SceneEntry[] = [
  {
    path: 'content-section',
    screen: null,
    title: {
      ru: 'Оболочка раздела «Контент»',
      en: 'The Content section shell',
    },
    task: '36r.2',
  },
  {
    path: 'voice-empty',
    screen: '01',
    title: { ru: 'Раздел до появления голоса', en: 'Before a voice exists' },
    task: '36r.3',
  },
  {
    path: 'voice-paths',
    screen: '02',
    title: { ru: 'Развилка трёх путей', en: 'Three ways in' },
    task: '36r.3',
  },
  {
    path: 'voice-samples',
    screen: '03',
    title: { ru: 'Сбор образцов', en: 'Collecting samples' },
    task: '36r.3',
  },
  {
    path: 'voice-proposal',
    screen: '05',
    title: { ru: 'Предложение профиля', en: 'The proposed profile' },
    task: '36r.5',
  },
  {
    path: 'voice-passport',
    screen: '06',
    title: { ru: 'Паспорт голоса', en: 'The voice passport' },
    task: '36r.7',
  },
  {
    path: 'voice-scales',
    screen: '07',
    title: { ru: 'Восемь шкал стиля', en: 'The eight style scales' },
    task: '36r.7',
  },
  {
    path: 'voice-redactions',
    screen: '08',
    title: { ru: 'Что осталось за рамкой', en: 'What stayed outside' },
    task: '36r.6',
  },
  {
    path: 'voice-versions',
    screen: '09',
    title: { ru: 'Версии и сравнение', en: 'Versions and comparison' },
    task: '36r.7',
  },
  {
    path: 'voice-ribbon',
    screen: '10',
    title: { ru: 'Ленточка применённого голоса', en: 'The applied-voice strip' },
    task: '36r.13',
  },
  {
    path: 'voice-materials',
    screen: '11',
    title: { ru: 'Материалы и перекройка', en: 'Material and the recut' },
    task: '36r.8',
  },
  {
    path: 'voice-brief',
    screen: null,
    title: { ru: 'Радар тем и бриф', en: 'Topic radar and brief' },
    task: '36r.9',
  },
  {
    path: 'sources',
    screen: null,
    title: { ru: 'Источники', en: 'Sources' },
    task: '9e9',
  },
  {
    path: 'provenance',
    screen: null,
    title: { ru: 'Происхождение', en: 'Provenance' },
    task: '9e9',
  },
];

const VIEWPORTS = [1440, 1024, 768, 390] as const;

export default async function InterfaceReviewPage({
  searchParams,
}: {
  searchParams: Promise<
    Partial<Record<'state' | 'theme' | 'locale' | 'viewport', string | string[]>>
  >;
}) {
  let context;
  try {
    context = resolveInterfaceReviewContext(
      await searchParams,
      foundationScene.states
    );
  } catch {
    notFound();
  }

  const query = (overrides: Record<string, string | number> = {}) =>
    new URLSearchParams({
      state: 'default',
      theme: context.theme,
      locale: context.locale,
      viewport: String(context.viewport),
      ...Object.fromEntries(
        Object.entries(overrides).map(([key, value]) => [key, String(value)])
      ),
    }).toString();

  const russian = context.locale === 'ru';

  return (
    <InterfaceReviewFrame scene={foundationScene} context={context}>
      <div className="mx-auto flex max-w-[1120px] flex-col gap-[24px] p-[24px]">
        <header>
          <p className="cf-label-sm uppercase text-cf-ink-muted">
            {russian
              ? 'Локальный обзор · без сети и без входа'
              : 'Local review · no network, no sign-in'}
          </p>
          <h1 className="mt-[8px] cf-heading-lg text-cf-ink [text-wrap:balance]">
            {russian ? 'Экраны раздела «Контент»' : 'The Content screens'}
          </h1>
          <p className="mt-[8px] max-w-[72ch] cf-body-md text-cf-ink-muted [text-wrap:pretty]">
            {russian
              ? 'Каждый экран открывается в девяти состояниях. Тема, язык и ширина ниже переносятся во все ссылки, так что переключать их достаточно один раз.'
              : 'Every screen opens in nine states. The theme, language and width below travel into every link, so switching them once is enough.'}
          </p>
        </header>

        <nav
          aria-label={russian ? 'Настройки обзора' : 'Review settings'}
          className="flex flex-wrap gap-[16px] rounded-[8px] border border-cf-border bg-cf-surface p-[12px]"
        >
          <div className="flex flex-wrap items-center gap-[8px]">
            <span className="cf-label-sm uppercase text-cf-ink-muted">
              {russian ? 'Тема' : 'Theme'}
            </span>
            {(['dark', 'light'] as const).map((theme) => (
              <ButtonLink
                key={theme}
                href={`?${query({ theme })}`}
                aria-current={context.theme === theme ? 'true' : undefined}
                variant={context.theme === theme ? 'primary' : 'secondary'}
                className="cf-control-h"
              >
                {theme === 'dark'
                  ? russian
                    ? 'Тёмная'
                    : 'Dark'
                  : russian
                  ? 'Светлая'
                  : 'Light'}
              </ButtonLink>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-[8px]">
            <span className="cf-label-sm uppercase text-cf-ink-muted">
              {russian ? 'Язык' : 'Language'}
            </span>
            {(['ru', 'en'] as const).map((locale) => (
              <ButtonLink
                key={locale}
                href={`?${query({ locale })}`}
                aria-current={context.locale === locale ? 'true' : undefined}
                variant={context.locale === locale ? 'primary' : 'secondary'}
                className="cf-control-h"
              >
                {locale.toUpperCase()}
              </ButtonLink>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-[8px]">
            <span className="cf-label-sm uppercase text-cf-ink-muted">
              {russian ? 'Ширина' : 'Width'}
            </span>
            {VIEWPORTS.map((viewport) => (
              <ButtonLink
                key={viewport}
                href={`?${query({ viewport })}`}
                aria-current={
                  context.viewport === viewport ? 'true' : undefined
                }
                variant={context.viewport === viewport ? 'primary' : 'secondary'}
                className="cf-control-h"
              >
                {viewport}
              </ButtonLink>
            ))}
          </div>
        </nav>

        <p className="cf-caption text-cf-ink-muted [text-wrap:pretty]">
          {russian
            ? 'Ширина здесь — только метка в адресе: она попадает в ссылку, а сама страница подстраивается под окно браузера. Сузьте окно, чтобы увидеть узкую раскладку.'
            : 'The width here is only a label in the URL: it travels into the link, while the page itself follows the browser window. Narrow the window to see the narrow layout.'}
        </p>

        <ul className="flex flex-col gap-[8px]">
          {CONTENT_SCENES.map((entry) => (
            <li
              key={entry.path}
              data-review-index-entry={entry.path}
              className="min-w-0 rounded-[8px] border border-cf-border bg-cf-surface p-[12px]"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-[8px]">
                <Link
                  href={`/interface-review/content-intelligence/${entry.path}?${query()}`}
                  className="cf-label-md text-cf-accent underline underline-offset-2"
                >
                  {entry.screen ? `${entry.screen} · ` : ''}
                  {entry.title[context.locale]}
                </Link>
                <span className="cf-caption text-cf-ink-muted">
                  {entry.task}
                </span>
              </div>
              <ul className="mt-[8px] flex flex-wrap gap-x-[12px] gap-y-[4px]">
                {INTERFACE_REVIEW_STATES.map((state) => (
                  <li key={state}>
                    <Link
                      href={`/interface-review/content-intelligence/${entry.path}?${query(
                        { state }
                      )}`}
                      className="cf-caption text-cf-ink-muted underline underline-offset-2"
                    >
                      {state}
                    </Link>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>

        <p className="max-w-[72ch] cf-caption text-cf-ink-muted [text-wrap:pretty]">
          {russian
            ? 'Данные на всех экранах вымышленные и лежат прямо в коде страницы: ни один экран здесь не ходит в сеть и ничего не сохраняет.'
            : 'The data on every screen is invented and lives in the page source: nothing here makes a request and nothing is saved.'}
        </p>
      </div>
    </InterfaceReviewFrame>
  );
}
