/**
 * The words of the Content section's frame.
 *
 * Their own file because the tab panel and the frame around it are now two
 * modules — the library tab imports the empty state, the frame imports the
 * library tab — and a shared constant living in either one of them makes that
 * a cycle.
 */

/**
 * Two languages, not sixteen, and deliberately so: this screen is a frame
 * around `ContentIntelligenceView`, which ships Russian and English only.
 * Sixteen locales on the frame and two inside it would promise a translation
 * the screen cannot keep.
 */
export const contentSectionCopy = {
  ru: {
    title: 'Заготовки',
    avatarDescription: 'Ваш голос: образцы текстов и настройки того, как вы пишете.',
    description:
      'От мысли к заготовке: новые тексты, поводы написать и факты, на которые они опираются.',
    tabs: 'Разделы контента',
    avatars: 'Аватар',
    // `content-factory-next-odb8.3`: «Откуда идеи» — подписки на чужие ленты
    // и каналы и поводы, которые они приносят. Не третья вкладка рядом с
    // «Откуда факты» на ту же работу: там — витрина уже подтверждённого,
    // здесь — предложения того, о чём ещё не написано.
    leads: 'Откуда идеи',
    // `content-factory-next-odb8`: убрана из полосы вкладок, но остаётся
    // ключом `ContentIntelligenceSection` и текстом для settings-вида —
    // `ContentIntelligenceSettings`/`sources.review-scene.tsx` всё ещё её
    // читают.
    sources: 'Источники',
    // `content-factory-next-m2eg` (07.09.2026): за вкладкой стоит вход одной
    // мыслью, и он делает заготовку. «Бриф» называл форму, которой там больше
    // нет, — владелец прочитал подпись как «здесь заполняют восемь полей».
    // Ключ `brief` не менялся: по нему живут адреса, тесты и
    // `ContentIntelligenceSection`.
    brief: 'Новая заготовка',
    // `content-factory-next-tu3k.9` (06.09.2026): вкладка называется
    // «Заготовки» и стоит первой. Ключ `materials` не менялся — по нему живут
    // адреса, тесты и `ContentIntelligenceSection`.
    materials: 'Заготовки',
    // Ключ вкладки не менялся (`tab === 'provenance'` держат несколько
    // тестов и `ContentIntelligenceSection`), поменялась только подпись:
    // экран за ней теперь витрина фактов, а не проверка происхождения.
    provenance: 'Откуда факты',
    // Вкладка называется «Заготовки», и пустое состояние говорит тем же
    // словом (аудит 97dq.39, B9): «материал» остался от первого поколения.
    materialsTitle: 'Заготовок пока нет',
    materialsBody:
      'Заготовка — суть вашей мысли без площадки: из неё делаются адаптации под каналы. Первая появится здесь, когда вы соберёте её на вкладке «Новая заготовка».',
    // Not «Раздел готовится», which promised a tab under construction over a
    // library that already read and recut. It is simply empty until the brief
    // has been used once, and the body says where the first row comes from.
    // Переключатель «По мысли · Вручную» и ручная форма брифа убраны
    // решением владельца 22.09.2026 (`content-factory-next-97dq.36`).
    // Витрина «На что опираются» убрана решением владельца 06.09.2026 (§11.5):
    // внутри вкладки две витрины — заготовки и «Что уже написали».
    /* Зачем второй вид вообще нужен — одной строкой рядом с самой полосой. */
  },
  en: {
    title: 'Pieces',
    avatarDescription: 'Your voice: writing samples and how you write.',
    description:
      'From a thought to a piece: new texts, reasons to write and facts they rely on.',
    tabs: 'Content sections',
    avatars: 'Avatar',
    leads: 'Ideas',
    sources: 'Sources',
    brief: 'New piece',
    materials: 'Pieces',
    provenance: 'Facts',
    materialsTitle: 'No pieces yet',
    materialsBody:
      'A piece is the core of your thought without a platform: channel adaptations are made from it. The first one appears here once you build it on the New piece tab.',
  },
} as const;

export type ContentSectionLocale = keyof typeof contentSectionCopy;

/**
 * `content-factory-next-w4vh`: one place where the section decides which of
 * its two languages a person reads.
 *
 * Every screen in this folder was making the same decision by hand —
 * `String(language ?? 'ru').toLowerCase().startsWith('ru') ? 'ru' : 'en'` —
 * and by the fifth copy that is not a pattern, it is a defect waiting for one
 * of them to be fixed differently from the rest. The editorial stage already
 * had its own extracted helper (`resolveEditorialStageLocale`), which is what
 * made the duplication visible.
 *
 * The narrowing is deliberate and is not the interface's full locale list:
 * these screens are written out in two languages inside the source, the
 * convention this generation of screens set, so anything that is not Russian
 * reads as English rather than failing closed.
 */
export const resolveContentLocale = (
  language: string | undefined | null
): ContentSectionLocale =>
  String(language ?? 'ru')
    .toLowerCase()
    .startsWith('ru')
    ? 'ru'
    : 'en';
