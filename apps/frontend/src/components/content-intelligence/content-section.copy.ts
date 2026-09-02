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
    title: 'Контент',
    description:
      'Аватары, подписки, приносящие поводы написать, тексты, из которых они собраны, бриф на следующий текст, готовые материалы и откуда взят каждый факт.',
    tabs: 'Разделы контента',
    avatars: 'Аватары',
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
    brief: 'Бриф',
    materials: 'Материалы',
    // Ключ вкладки не менялся (`tab === 'provenance'` держат несколько
    // тестов и `ContentIntelligenceSection`), поменялась только подпись:
    // экран за ней теперь витрина фактов, а не проверка происхождения.
    provenance: 'Откуда факты',
    // `content-factory-next-odb8.4`: архив «Что уже написали» — три слоя
    // (сделано здесь, до продукта, публикуется мимо) в одной ленте. Название
    // повторяет заголовок самого экрана внутри, а не сокращается до одного
    // слова, потому что «Архив» само по себе не говорит, архив чего это.
    archive: 'Что уже написали',
    materialsTitle: 'Материалов пока нет',
    materialsBody:
      'Материал — готовый текст, который живёт отдельно от публикации и перекраивается под площадку. Материалы приходят сюда с вкладки «Бриф»: собранный черновик остаётся здесь материалом, и его можно перекроить под другую площадку, не переписывая заново.',
    // Not «Раздел готовится», which promised a tab under construction over a
    // library that already read and recut. It is simply empty until the brief
    // has been used once, and the body says where the first row comes from.
    materialsPending: 'Пока пусто',
    // §9.4 (02.09.2026): «Материалы» и «Что уже написали» — одно место с
    // двумя представлениями, не две вкладки. Подписи переключателя вида.
    materialsViewLabel: 'Вид списка',
    materialsViewMaterials: 'На что опираются',
    materialsViewArchive: 'Что уже написали',
  },
  en: {
    title: 'Content',
    description:
      'Avatars, subscriptions that bring reasons to write, the texts they were built from, the brief for the next one, finished material and where each fact came from.',
    tabs: 'Content sections',
    avatars: 'Avatars',
    leads: 'Ideas',
    sources: 'Sources',
    brief: 'Brief',
    materials: 'Material',
    provenance: 'Facts',
    archive: 'Archive',
    materialsTitle: 'No material yet',
    materialsBody:
      'A piece of material is a finished text that lives apart from any post and is recut for a platform. Material arrives from the Brief tab: a draft built there stays here as a piece, and it can be recut for another platform without being rewritten.',
    materialsPending: 'Nothing here yet',
    materialsViewLabel: 'List view',
    materialsViewMaterials: 'What we rely on',
    materialsViewArchive: 'What we already wrote',
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
