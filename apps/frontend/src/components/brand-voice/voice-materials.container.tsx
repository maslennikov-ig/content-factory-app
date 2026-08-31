'use client';

import { useCallback, useMemo, useState } from 'react';
import useSWR from 'swr';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { useVariables } from '@contentfactory/react/helpers/variable.context';
import { useModals } from '@contentfactory/frontend/components/layout/new-modal';
import { useIntegrationList } from '@contentfactory/frontend/components/launches/helpers/use.integration.list';
import { ContentMaterialsPlaceholder } from '../content-intelligence/content-materials.placeholder';
import {
  VoiceMaterialsScreen,
  type RecutPlatform,
} from './voice-materials.screen';
import type { VoiceLocale } from './voice-copy';
import {
  DEFAULT_RECUT_PLATFORM,
  EDITOR_MODAL,
  MATERIALS_API,
  draftHandoff,
  editorChannels,
  editorDate,
  failureNotice,
  idByCode,
  jsonReader,
  materialEndpoint,
  readFailure,
  screenMaterials,
  screenRecut,
  screenState,
  type MaterialFailure,
} from './voice-materials.adapter';
import type {
  MaterialDerivedPostV1,
  MaterialRecutPreviewV1,
  MaterialsResponseV1,
} from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice-wiring.contract';

/**
 * The Material tab: screen 11 with the routes behind it.
 *
 * The screen was accepted in `36r` and is not touched here — this owns the
 * requests, the row that is open, the panel that is showing and what a refusal
 * looks like; the screen owns the pixels. The same split
 * `content-intelligence.settings.tsx` makes, for the same reason.
 *
 * A workspace with nothing in it gets the section's own explanation of what a
 * material is, reused from the Content screen rather than restated: two
 * sentences about the same idea drift, and the one nobody is reading is the one
 * that goes stale.
 *
 * Nothing here reaches a platform. The recut prepares text, the draft is a post
 * in `DRAFT`, and it is opened in the product's own editor and published by the
 * ordinary path — the rule `docs/product/migration-map.md` states.
 */

const FALLBACK = {
  ru: {
    library: 'Библиотека не загрузилась. Материалы на месте — попробуйте ещё раз.',
    origin: 'Не удалось показать, что вышло из этого материала.',
    recut: 'Перекройка не рассчиталась. Материал не изменился.',
    draft: 'Черновик не создался. Материал не изменился.',
  },
  en: {
    library: 'The library did not load. The material is intact — try again.',
    origin: 'What came out of this piece could not be shown.',
    recut: 'The recut was not worked out. The material is unchanged.',
    draft: 'The draft was not created. The material is unchanged.',
  },
} as const;

export function VoiceMaterialsContainer() {
  const request = useFetch();
  const modal = useModals();
  const { language } = useVariables();
  const locale: VoiceLocale = language.toLowerCase().startsWith('ru')
    ? 'ru'
    : 'en';
  const words = FALLBACK[locale];

  const read = useMemo(() => jsonReader(request), [request]);
  const { data: channels } = useIntegrationList();

  const library = useSWR<MaterialsResponseV1>(
    MATERIALS_API,
    () => read(MATERIALS_API),
    { revalidateOnFocus: false }
  );

  const [expandedCode, setExpandedCode] = useState<string | undefined>();
  const [derived, setDerived] = useState<readonly MaterialDerivedPostV1[]>([]);
  const [recut, setRecut] = useState<MaterialRecutPreviewV1 | undefined>();
  const [failure, setFailure] = useState<MaterialFailure | null>(null);
  const [busy, setBusy] = useState(false);
  const [opened, setOpened] = useState(false);

  /**
   * One place a refusal can land.
   *
   * Every action here can be refused, and each of them refusing differently is
   * how a screen ends up with three ways of saying the same thing and one path
   * that says nothing at all.
   */
  const run = useCallback(
    async (fallback: string, work: () => Promise<void>) => {
      setBusy(true);
      setFailure(null);
      setOpened(false);
      try {
        await work();
      } catch (error) {
        setFailure(readFailure(error, fallback));
      } finally {
        setBusy(false);
      }
    },
    []
  );

  const identify = useCallback(
    (code: string) => idByCode(library.data, code),
    [library.data]
  );

  const expand = useCallback(
    (code: string) => {
      if (expandedCode === code) {
        setExpandedCode(undefined);
        setDerived([]);
        return;
      }
      const id = identify(code);
      if (!id) return;
      // The row opens once the answer is in. Opening first would put an empty
      // provenance list under "made from this piece", which is a claim that
      // nothing came out of it rather than an admission of a failed request.
      void run(words.origin, async () => {
        const answer: MaterialsResponseV1 = await read(
          materialEndpoint(id, 'derivations')
        );
        setDerived(answer.derived ?? []);
        setExpandedCode(code);
      });
    },
    [expandedCode, identify, read, run, words.origin]
  );

  const preview = useCallback(
    (code: string, platform: RecutPlatform) => {
      const id = identify(code);
      if (!id) return;
      void run(words.recut, async () => {
        const answer: MaterialsResponseV1 = await read(
          materialEndpoint(id, 'recut-preview'),
          { method: 'POST', body: JSON.stringify({ platform }) }
        );
        // Only the panel. The provenance list belongs to whichever row is
        // open, and a recut of a different piece writing into it would put one
        // piece's posts under another piece's name.
        setRecut(answer.recut);
      });
    },
    [identify, read, run, words.recut]
  );

  /**
   * The draft, opened in the editor the product already has.
   *
   * The editor is the heaviest tree in the application and the library must not
   * carry it until someone asks for it, which is why it arrives here rather
   * than at the top of the file.
   */
  const openEditor = useCallback(() => {
    if (!recut) return;
    const id = identify(recut.code);
    if (!id) return;
    void run(words.draft, async () => {
      const handoff = await draftHandoff(read, id, recut.platform);
      const [{ AddEditModal }, { ExistingDataContextProvider }] =
        await Promise.all([
          import('@contentfactory/frontend/components/new-launch/add.edit.modal'),
          import(
            '@contentfactory/frontend/components/launches/helpers/use.existing.data'
          ),
        ]);
      const editorChannelList = editorChannels(handoff.existing, channels);
      modal.openModal({
        ...EDITOR_MODAL,
        children: (
          <ExistingDataContextProvider value={handoff.existing}>
            <AddEditModal
              allIntegrations={editorChannelList.allIntegrations}
              integrations={editorChannelList.integrations}
              date={editorDate(handoff.existing)}
              reopenModal={() => openEditor()}
              mutate={() => {
                // The library counts posts per piece; the draft just made one.
                void library.mutate();
              }}
            />
          </ExistingDataContextProvider>
        ),
      });
      setOpened(true);
    });
  }, [channels, identify, library, modal, read, recut, run, words.draft]);

  const materials = useMemo(
    () => screenMaterials(library.data),
    [library.data]
  );

  // A library that would not load is a refusal like any other, and it is read
  // the same way: the code the server sent, and the sentence it wrote.
  const shown =
    failure ??
    (library.error ? readFailure(library.error, words.library) : null);

  // A workspace that has written nothing is answered by the section, not by an
  // empty table with headings over it. A refusal is a different thing and keeps
  // the screen, so the sentence explaining it has somewhere to live.
  if (!shown && library.data && materials.length === 0) {
    return <ContentMaterialsPlaceholder locale={locale} />;
  }

  return (
    <VoiceMaterialsScreen
      locale={locale}
      state={screenState({
        failure: shown,
        busy,
        loaded: !!library.data || !!library.error,
        opened,
        selected: !!recut || !!expandedCode,
      })}
      materials={materials}
      expandedCode={expandedCode}
      derived={derived}
      recut={screenRecut(recut)}
      notice={shown ? failureNotice(shown) : undefined}
      onExpand={expand}
      onReuse={(code) => preview(code, DEFAULT_RECUT_PLATFORM)}
      onPlatform={(platform) => {
        if (recut) preview(recut.code, platform);
      }}
      onOpenEditor={openEditor}
      onCancelRecut={() => {
        setRecut(undefined);
        setFailure(null);
        setOpened(false);
      }}
    />
  );
}

export default VoiceMaterialsContainer;
