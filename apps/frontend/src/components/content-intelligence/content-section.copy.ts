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
      'Аватары, тексты, из которых они собраны, бриф на следующий текст, готовые материалы и происхождение каждой публикации.',
    tabs: 'Разделы контента',
    avatars: 'Аватары',
    sources: 'Источники',
    brief: 'Бриф',
    materials: 'Материалы',
    provenance: 'Происхождение',
    materialsTitle: 'Материалов пока нет',
    materialsBody:
      'Материал — готовый текст, который живёт отдельно от публикации и перекраивается под площадку. Материалы приходят сюда с вкладки «Бриф»: собранный черновик остаётся здесь материалом, и его можно перекроить под другую площадку, не переписывая заново.',
    // Not «Раздел готовится», which promised a tab under construction over a
    // library that already read and recut. It is simply empty until the brief
    // has been used once, and the body says where the first row comes from.
    materialsPending: 'Пока пусто',
  },
  en: {
    title: 'Content',
    description:
      'Avatars, the texts they were built from, the brief for the next one, finished material and where each post came from.',
    tabs: 'Content sections',
    avatars: 'Avatars',
    sources: 'Sources',
    brief: 'Brief',
    materials: 'Material',
    provenance: 'Provenance',
    materialsTitle: 'No material yet',
    materialsBody:
      'A piece of material is a finished text that lives apart from any post and is recut for a platform. Material arrives from the Brief tab: a draft built there stays here as a piece, and it can be recut for another platform without being rewritten.',
    materialsPending: 'Nothing here yet',
  },
} as const;

export type ContentSectionLocale = keyof typeof contentSectionCopy;
