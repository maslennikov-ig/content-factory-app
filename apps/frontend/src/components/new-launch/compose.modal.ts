'use client';

import { createElement, Fragment, useCallback } from 'react';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { useModals } from '@contentfactory/frontend/components/layout/new-modal';
import type { AddEditModalProps } from '@contentfactory/frontend/components/new-launch/add.edit.modal';
import type { Integrations } from '@contentfactory/frontend/components/launches/calendar.context';

dayjs.extend(utc);

import { COMPOSE_MODAL_OPTIONS } from './compose.modal.options';
export { COMPOSE_MODAL_OPTIONS };


/**
 * Чем открывают окно поста.
 *
 * Поля собраны из того, что двери передавали раньше своими руками. Обязателен
 * только список каналов: без него окно не знает, куда писать.
 */
export type OpenPostEditorInput = {
  /**
   * Группа существующего поста (`post.group`). Окно само заберёт
   * `/posts/group/:group` и поднимет над собой контекст этого поста, поэтому
   * вызывающему довольно знать идентификатор.
   */
  group?: string;
  /**
   * Открыть копию, а не сам пост: содержимое переносится, сам пост не
   * трогается, а дата берётся ближайшая свободная.
   */
  duplicate?: boolean;
  /** Когда встанет пост. Без неё для нового поста берётся ближайший слот. */
  date?: dayjs.Dayjs;
  /** Каналы, среди которых окно даёт выбирать. */
  integrations: Integrations[];
  /** Полный список каналов пространства, если он шире предыдущего. */
  allIntegrations?: Integrations[];
  /** Каналы, отмеченные заранее. */
  selectedChannels?: string[];
  /** Канал, чья вкладка открыта первой. */
  focusedChannel?: string;
  /** Текст, с которым окно открывается. */
  onlyValues?: AddEditModalProps['onlyValues'];
  /** Набор каналов, выбранный до открытия окна. */
  set?: AddEditModalProps['set'];
  researchSources?: AddEditModalProps['researchSources'];
  contentIntelligenceProvenance?: AddEditModalProps['contentIntelligenceProvenance'];
  draftGap?: AddEditModalProps['draftGap'];
  /** Окно показа кода, а не сохранения поста. */
  dummy?: boolean;
  addEditSets?: AddEditModalProps['addEditSets'];
  customClose?: () => void;
  /** Что обновить после сохранения. */
  mutate?: () => void;
  /**
   * Чем открыть окно заново. По умолчанию — тот же самый вызов: дверь, один
   * раз объяснившая, как открыть окно, не объясняет это второй раз.
   */
  reopenModal?: () => void;
};

export type OpenPostEditor = (input: OpenPostEditorInput) => Promise<void>;

/**
 * Открыть окно поста — одинаково из календаря, из боковой панели, из меню
 * канала и из клетки таблицы заготовок.
 *
 * Возвращается одна функция. Всё, что раньше делала каждая дверь сама —
 * запрос группы поста, сужение списка каналов до канала этого поста, подъём
 * `ExistingDataContextProvider`, девять флагов, — сделано здесь один раз.
 */
export const useOpenPostEditor = (): OpenPostEditor => {
  const modal = useModals();
  const fetch = useFetch();

  // Ссылка на саму себя нужна значению `reopenModal` по умолчанию: окно
  // открывается тем же вызовом, каким открылось в первый раз. К моменту
  // вызова `const` уже связан, поэтому рекурсия здесь законна.
  const openPostEditor: OpenPostEditor = useCallback(
    async (input: OpenPostEditorInput) => {
      const {
        group,
        duplicate,
        date,
        integrations,
        allIntegrations,
        mutate,
        reopenModal,
        ...rest
      } = input;

      /**
       * Существующий пост приезжает целиком, а не по частям: окно читает из
       * него и канал, и коробки, и снимок контекста. Копия того же поста
       * контекст не поднимает — иначе новая запись считалась бы правкой
       * старой.
       */
      /**
       * Редактор — самое тяжёлое дерево приложения, и он приезжает по
       * нажатию, а не при загрузке страницы, где стоит дверь: календарь,
       * вкладка «Контент» и вход одной мыслью не тянут его статически. Так же
       * делал вход до сведения флагов, и набор раздела «Контент» грузится в
       * Node без ESM-зависимостей редактора.
       */
      const [{ AddEditModal }, { ExistingDataContextProvider }] =
        await Promise.all([
          import('@contentfactory/frontend/components/new-launch/add.edit.modal'),
          import('@contentfactory/frontend/components/launches/helpers/use.existing.data'),
        ]);

      const existing = group
        ? await (await fetch(`/posts/group/${group}`)).json()
        : null;

      const wantsSlot = !date && (!existing || duplicate);
      const slot = wantsSlot
        ? (await (await fetch('/posts/find-slot')).json()).date
        : null;

      const publishDate =
        date ?? dayjs.utc(slot || existing?.posts?.[0]?.publishDate).local();

      /**
       * У открытого поста окно предлагает только его собственный канал: пост
       * уже стоит в одном месте, и список остальных каналов означал бы здесь
       * выбор, которого нет. У копии выбор есть.
       */
      const carriesExisting = !!existing && !duplicate;
      const offered = carriesExisting
        ? integrations
            .slice(0)
            .filter((one) => one.id === existing.integration)
            .map((one) => ({ ...one, picture: existing.integrationPicture }))
        : integrations;

      const post = createElement(AddEditModal, {
        ...rest,
        ...(duplicate && existing
          ? {
              onlyValues: existing.posts.map(
                ({ image, settings, content }: any) => ({
                  image,
                  settings,
                  content,
                })
              ),
            }
          : {}),
        allIntegrations: (allIntegrations ?? integrations).map((one) => ({
          ...one,
        })),
        integrations: offered,
        date: publishDate,
        mutate: mutate ?? (() => {}),
        reopenModal: reopenModal ?? (() => void openPostEditor(input)),
      } as AddEditModalProps);

      modal.openModal({
        ...COMPOSE_MODAL_OPTIONS,
        classNames: { ...COMPOSE_MODAL_OPTIONS.classNames },
        children: carriesExisting
          ? createElement(ExistingDataContextProvider, {
              value: existing,
              children: post,
            })
          : createElement(Fragment, null, post),
      });
    },
    [modal, fetch]
  );

  return openPostEditor;
};
