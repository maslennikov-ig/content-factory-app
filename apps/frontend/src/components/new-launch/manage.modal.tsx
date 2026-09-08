'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import React, {
  FC,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AddEditModalProps } from '@contentfactory/frontend/components/new-launch/add.edit.modal';
import clsx from 'clsx';
import { postSaveErrorMessage } from '@contentfactory/frontend/components/new-launch/post-save-error';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';
import { PicksSocialsComponent } from '@contentfactory/frontend/components/new-launch/picks.socials.component';
import { EditorWrapper } from '@contentfactory/frontend/components/new-launch/editor';
import { SelectCurrent } from '@contentfactory/frontend/components/new-launch/select.current';
import {
  ComposeBlockReasonNote,
  COMPOSE_BLOCK_REASON_NOTE_ID,
  composeBlockReason,
} from '@contentfactory/frontend/components/new-launch/compose-block-reason';
import { ShowAllProviders } from '@contentfactory/frontend/components/new-launch/providers/show.all.providers';
import { ProvenanceLine } from '@contentfactory/frontend/components/new-launch/provenance.line';
import { UnverifiedEvidenceNote } from '@contentfactory/frontend/components/new-launch/unverified-evidence.note';
import {
  RelatedOwnPostsNote,
  relatedQueryOf,
  useRelatedOwnPosts,
} from '@contentfactory/frontend/components/new-launch/related-own-posts.note';
import { DraftGapNote } from '@contentfactory/frontend/components/brand-voice/draft-gap-note';
import { DraftQualityLine } from '@contentfactory/frontend/components/new-launch/draft-quality.line';
import { editorPlainText } from '@contentfactory/frontend/components/new-launch/editor-text';
import { useVariables } from '@contentfactory/react/helpers/variable.context';
import { useExistingData } from '@contentfactory/frontend/components/launches/helpers/use.existing.data';
import { useLaunchStore } from '@contentfactory/frontend/components/new-launch/store';
import { DatePicker } from '@contentfactory/frontend/components/launches/helpers/date.picker';
import { useShallow } from 'zustand/react/shallow';
import { RepeatComponent } from '@contentfactory/frontend/components/launches/repeat.component';
import { TagsComponent } from '@contentfactory/frontend/components/launches/tags.component';
import { EditorialStageSelect } from '@contentfactory/frontend/components/launches/editorial-stage.select';
import { useToaster } from '@contentfactory/react/toaster/toaster';
import { deleteDialog } from '@contentfactory/react/helpers/delete.dialog';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { makeId } from '@contentfactory/nestjs-libraries/services/make.is';
import { useModals } from '@contentfactory/frontend/components/layout/new-modal';
import { capitalize } from 'lodash';
import { SelectCustomer } from '@contentfactory/frontend/components/launches/select.customer';
import { AssistantPopup } from '@contentfactory/frontend/components/copilot/assistant.popup';
import {
  CopilotProvider,
  useAssistantAvailable,
  useHasCopilotProvider,
} from '@contentfactory/frontend/components/copilot/copilot.provider';
import { DummyCodeComponent } from '@contentfactory/frontend/components/new-launch/dummy.code.component';
import {
  SettingsIcon,
  ChevronDownIcon,
  CloseIcon,
  TrashIcon,
  DropdownArrowSmallIcon,
} from '@contentfactory/frontend/components/ui/icons';
import { useHasScroll } from '@contentfactory/frontend/components/ui/is.scroll.hook';
import { useShortlinkPreference } from '@contentfactory/frontend/components/settings/shortlink-preference.component';
import dayjs from 'dayjs';
import { Button, buttonClassName } from '@contentfactory/react/form/button';
import {
  Menu,
  MenuButton,
  MenuCommand,
  MenuList,
} from '@contentfactory/react/choice/choice.menu';
import { composeCopy } from '@contentfactory/frontend/components/new-launch/compose.copy';
import { useUser } from '@contentfactory/frontend/components/layout/user.context';
import { isOrganizationEditor } from '@contentfactory/nestjs-libraries/user/organization.roles';
import { PlatformBadge } from '@contentfactory/react/platform/platform.badge';


/**
 * Что окно помнит поверх подъёма помощника.
 *
 * Помощник поднимается провайдером над содержимым окна, а появление провайдера
 * пересобирает поддерево: React меняет место детей в дереве, и обычный
 * `useState` внутри окна начался бы заново. Для открытых настроек канала это
 * не мелочь — они захлопнулись бы посреди работы, — поэтому значение живёт
 * выше провайдера и подъём переживает. Всё остальное окно держит в общем
 * хранилище (`store.ts`), которому дерево React вообще не указ.
 *
 * Второе такое значение — «подтверждения проверены» — ушло отсюда 07.09.2026
 * вместе с самими воротами (`content-factory-next-m2eg.17`).
 */
type ComposeSession = {
  /** Помощника позвали: только с этого момента поднимается провайдер. */
  assistantOpen: boolean;
  openAssistant: () => void;
  showSettings: boolean;
  setShowSettings: (value: boolean) => void;
};

/**
 * Помощник монтируется у окна редактора поста, а не вокруг всего приложения:
 * его провайдер обращается к рантайму сразу при монтировании, поэтому в общей
 * оболочке это был запрос к модели на каждой загрузке любой страницы
 * (`content-factory-next-fn33.48`, `content-factory-next-fn33.93`).
 */
export const ManageModal: FC<AddEditModalProps> = (props) => {
  /**
   * `content-factory-next-fn33.99`: и в самом окне провайдер поднимается не
   * при открытии, а когда помощника позвали.
   *
   * Библиотека шлёт `availableAgents` на монтировании безусловно, поэтому
   * «окно открыли» стоило запроса — у пространства с настроенным поставщиком
   * моделей платного — каждому, кто просто пишет пост. Решение то же, каким
   * помощник ушёл с оболочки приложения: провайдер стоит там, где им
   * пользуются, а теперь ещё и тогда, когда им пользуются.
   */
  const [assistantOpen, setAssistantOpen] = useState(false);
  const openAssistant = useCallback(() => setAssistantOpen(true), []);
  const [showSettings, setShowSettings] = useState(false);

  const session: ComposeSession = {
    assistantOpen,
    openAssistant,
    showSettings,
    setShowSettings,
  };

  const content = <ManageModalContent {...props} session={session} />;

  if (!assistantOpen) {
    return content;
  }

  /**
   * `requireAvailable` — потому что у пространства без ключа AI каждое открытие
   * окна давало `POST /copilot/chat -> 503` и строку в консоли
   * (`content-factory-next-fn33.28.11`). Помощник, которого нельзя позвать, не
   * поднимается вовсе, и запрос не уходит.
   */
  return <CopilotProvider requireAvailable>{content}</CopilotProvider>;
};

const ManageModalContent: FC<AddEditModalProps & { session: ComposeSession }> = (
  props
) => {
  const t = useT();
  const { assistantOpen, openAssistant, showSettings, setShowSettings } =
    props.session;
  /**
   * Есть ли помощнику чем ответить. Тот же вопрос и та же дверь остатка квоты,
   * которые задаёт провайдер: кнопка, за которой ничего не поднимется, — это
   * ещё один мёртвый контрол в окне, где владелец их уже читал.
   */
  const assistantAvailable = useAssistantAvailable(true);
  // Поднялся ли помощник над этим окном. У пространства без ключа AI он не
  // поднимается вовсе, и тогда рисовать его панель было бы обещанием
  // собеседника, которого нет (`content-factory-next-fn33.28.11`).
  const hasCopilot = useHasCopilotProvider();
  const { language } = useVariables();
  /**
   * Два языка, а не шестнадцать, — как у всех голосовых экранов.
   *
   * `voiceCopy` держит `ru` и `en`, потому что шестнадцать локалей вокруг
   * двухъязычной поверхности обещали бы перевод, которого экран не выполняет.
   */
  const voiceLocale = language.toLowerCase().startsWith('ru') ? 'ru' : 'en';
  const fetch = useFetch();
  const ref = useRef(null);
  const existingData = useExistingData();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const toaster = useToaster();
  const modal = useModals();
  const { data: shortlinkPreferenceData } = useShortlinkPreference();

  const { addEditSets, mutate, customClose, dummy } = props;

  /**
   * Ссылки исследования по-прежнему уезжают вместе с постом, но окно их
   * больше не показывает: исследование начинается в разделе «Контент», а не
   * здесь (решение владельца 04.09.2026). Читаем значение, ничего им не рисуя,
   * чтобы сохранение не теряло то, что у поста уже было.
   */
  const researchSources = useLaunchStore((state) => state.researchSources);

  const {
    selectedIntegrations,
    hide,
    date,
    setDate,
    repeater,
    setRepeater,
    tags,
    setTags,
    editorialStage,
    setEditorialStage,
    integrations,
    setSelectedIntegrations,
    locked,
    current,
    activateExitButton,
    setHide,
    contentIntelligenceProvenance,
    contentIntelligenceLoadState,
    contentIntelligenceFailure,
  } = useLaunchStore(
    useShallow((state) => ({
      hide: state.hide,
      setHide: state.setHide,
      contentIntelligenceProvenance: state.contentIntelligenceProvenance,
      contentIntelligenceLoadState: state.contentIntelligenceLoadState,
      contentIntelligenceFailure: state.contentIntelligenceFailure,
      date: state.date,
      setDate: state.setDate,
      current: state.current,
      repeater: state.repeater,
      setRepeater: state.setRepeater,
      tags: state.tags,
      setTags: state.setTags,
      editorialStage: state.editorialStage,
      setEditorialStage: state.setEditorialStage,
      selectedIntegrations: state.selectedIntegrations,
      integrations: state.integrations,
      setSelectedIntegrations: state.setSelectedIntegrations,
      locked: state.locked,
      activateExitButton: state.activateExitButton,
    }))
  );

  useEffect(() => {
    if (hide) {
      setHide(false);
    }
  }, [hide]);

  /**
   * Почему кнопки внизу не нажимаются, если дело не в кругах.
   *
   * Условия выключения ниже собраны из четырёх слагаемых, а подпись на кнопке
   * знает только одно — что канал не выбран. Человеку, у которого пост несёт
   * проверенный контекст, она предлагала выбрать канал, после чего кнопка
   * оставалась мёртвой. Причина считается здесь одним выражением, чтобы
   * надпись и запрет не могли разойтись.
   */
  /**
   * Пишет ли этот человек посты вообще (`content-factory-next-fn33.90`).
   *
   * Окно открывается и на чтение: Пользователь щёлкает по посту в календаре и
   * должен увидеть, что там написано. Закрыто ровно то, что дверь всё равно
   * отклонит, — сохранение, расписание, отправка и удаление.
   */
  const user = useUser();
  const canWritePosts = isOrganizationEditor(user?.role);

  const blockReason = useMemo(
    () =>
      composeBlockReason({
        canWrite: canWritePosts,
        locked,
        contentIntelligenceLoadState,
        contentIntelligenceFailure,
        provenanceErrorCode: contentIntelligenceProvenance?.errorCode ?? null,
      }),
    [
      canWritePosts,
      locked,
      contentIntelligenceLoadState,
      contentIntelligenceFailure,
      contentIntelligenceProvenance,
    ]
  );

  /**
   * Сколько подтверждений записано за этим постом — по коробкам, а не по
   * контексту: контекст мог выдать двадцать, а в текст вошли три.
   *
   * Взятое из поиска (`provenance === 'SEARCH'`, `content-factory-next-ec48`)
   * подтверждением не считается: о нём говорит своя записка строкой ниже, и
   * назвать находку подтверждением значило бы выдать непроверенное за
   * проверенное — ровно то слово, которого владелец просил избегать.
   */
  const confirmationCount = useLaunchStore(
    useShallow((state) => {
      const boxes =
        state.internal.find((one) => one.integration.id === state.current)
          ?.integrationValue ?? state.global;
      const searched = new Set(
        (state.contentIntelligenceProvenance?.availableCitations || [])
          .filter((citation) => citation.provenance === 'SEARCH')
          .map((citation) => citation.citationId)
      );
      const used = new Set<string>();
      for (const box of boxes) {
        for (const citationId of box.usedCitationIds || []) {
          if (!searched.has(citationId)) used.add(citationId);
        }
      }
      return used.size;
    })
  );

  /**
   * «Свои тексты по теме» — то же, что видит модель
   * (`content-factory-next-m2eg.19`).
   *
   * Запрос собирается из текста, который человек уже написал: у поста нет ни
   * заголовка, ни названной темы, а первые триста знаков — это ровно то, о
   * чём он пишет. Площадка берётся у выбранного канала: ссылка из Telegram
   * ведёт в Telegram, а не в чужую ленту.
   */
  /**
   * Текст коробок поста без разметки — один на два вопроса о нём.
   *
   * «Свои тексты по теме» берут первые триста знаков, строка качества —
   * весь текст. Два селектора над одними и теми же коробками разошлись бы
   * ровно тогда, когда кто-то поправит один из них.
   */
  const editorText = useLaunchStore(
    useShallow((state) => {
      const boxes =
        state.internal.find((one) => one.integration.id === state.current)
          ?.integrationValue ?? state.global;
      return editorPlainText(boxes.map((box) => box.content).join(' '));
    })
  );
  const relatedPlatform =
    integrations.find((one) => one.id === current)?.identifier ?? null;
  const relatedOwnPosts = useRelatedOwnPosts(
    relatedQueryOf(editorText),
    relatedPlatform
  );

  /**
   * Отправка: одно выражение запрета, одна подпись действия
   * (`content-factory-next-m2eg.18`).
   *
   * До 07.09.2026 условия выключения были выписаны дважды — у основной кнопки
   * и у «Опубликовать сейчас», — слово в слово. Два списка одного запрета
   * расходятся ровно тогда, когда кто-то правит один из них.
   */
  const publishDisabled =
    !canWritePosts ||
    selectedIntegrations.length === 0 ||
    loading ||
    locked ||
    contentIntelligenceLoadState === 'loading' ||
    contentIntelligenceLoadState === 'error';

  const mainActionLabel = useMemo(() => {
    if (selectedIntegrations.length === 0) {
      // A button says what pressing it is for. "Check the circles above"
      // described the furniture instead — it named a shape on the screen and
      // left the reason out.
      return t('select_channel_first', 'Pick a channel');
    }
    if (dummy) return t('create_output', 'Create output');
    if (!existingData?.integration) return t('add_to_calendar', 'Add to calendar');
    if (existingData?.posts?.[0]?.state === 'DRAFT') return t('schedule', 'Schedule');
    return t('update', 'Update');
  }, [selectedIntegrations.length, dummy, existingData, t]);

  /** Что произойдёт со временем поста, если выбрать основное действие. */
  const mainActionHint = existingData?.integration
    ? composeCopy[voiceLocale].keepScheduledAt(date.local().format('HH:mm'))
    : composeCopy[voiceLocale].addToCalendarHint;

  const [publishMenuOpen, setPublishMenuOpen] = useState(false);
  const publishMenuRef = useRef<HTMLDivElement | null>(null);
  /*
    Щелчок мимо закрывает меню. `Menu` — это только состояние: где список
    стоит и чем он закрывается, решает место вызова, и так и написано в самом
    примитиве. Escape и Tab закрывает `MenuList` сам.
  */
  useEffect(() => {
    if (!publishMenuOpen) return;
    const close = (event: MouseEvent) => {
      if (!publishMenuRef.current?.contains(event.target as Node)) {
        setPublishMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [publishMenuOpen]);

  const currentIntegrationText = useMemo(() => {
    if (current === 'global') {
      return (
        <div className="flex items-center gap-[10px]">
          <div className="relative">
            <SettingsIcon size={15} className="text-cf-accent-ink" />
          </div>
          <div>Settings</div>
        </div>
      );
    }

    const currentIntegration = integrations.find((p) => p.id === current)!;

    return (
      <div className="flex items-center gap-[10px]">
        <div className="relative">
          <PlatformBadge identifier={currentIntegration.identifier} size={24} />
          <SettingsIcon
            size={15}
            className="text-cf-accent-ink absolute -end-[5px] -bottom-[5px]"
          />
        </div>
        <div>
          {currentIntegration.name} {t('channel_settings', 'Settings')}
        </div>
      </div>
    );
  }, [current]);

  const changeCustomer = useCallback(
    (customer: string) => {
      const neededIntegrations = integrations.filter(
        (p) => p?.customer?.id === customer
      );
      setSelectedIntegrations(
        neededIntegrations.map((p) => ({
          settings: {},
          selectedIntegrations: p,
        }))
      );
    },
    [integrations]
  );

  const askClose = useCallback(async () => {
    if (!activateExitButton || dummy) {
      return;
    }

    if (
      await deleteDialog(
        t(
          'are_you_sure_you_want_to_close_this_modal_all_data_will_be_lost',
          'Are you sure you want to close this modal? (all data will be lost)'
        ),
        t('yes_close_it', 'Yes, close it!')
      )
    ) {
      if (customClose) {
        customClose();
        return;
      }
      modal.closeAll();
    }
  }, [activateExitButton, dummy]);

  const deletePost = useCallback(async () => {
    setLoading(true);
    if (
      !(await deleteDialog(
        t(
          'are_you_sure_you_want_to_delete_post',
          'Are you sure you want to delete this post?'
        ),
        t('yes_delete_it', 'Yes, delete it!')
      ))
    ) {
      setLoading(false);
      return;
    }
    await fetch(`/posts/${existingData.group}`, {
      method: 'DELETE',
    });
    mutate();
    modal.closeAll();
    return;
  }, [existingData, mutate, modal]);

  const schedule = useCallback(
    (type: 'draft' | 'now' | 'schedule' | 'update') => async () => {
      if (
        contentIntelligenceProvenance?.errorCode ===
          'CONTENT_EVIDENCE_REQUIRED' ||
        contentIntelligenceLoadState === 'loading' ||
        contentIntelligenceLoadState === 'error'
      ) {
        toaster.show(
          contentIntelligenceLoadState === 'loading'
            ? t(
                'content_context_loading',
                'Content provenance is still loading. Please wait before saving.'
              )
            : contentIntelligenceFailure === 'CONTENT_EVIDENCE_REQUIRED'
            ? t(
                'content_evidence_required',
                'CONTENT_EVIDENCE_REQUIRED: Current evidence must be verified before this draft can be saved.'
              )
            : t(
                'content_context_unavailable',
                'Content provenance could not be verified. Reload or research the draft before saving.'
              ),
          'warning'
        );
        return;
      }
      if (
        (type === 'now' || type === 'schedule') &&
        (existingData?.posts?.[0]?.state === 'PUBLISHED' ||
          (existingData?.posts?.[0]?.state === 'QUEUE' &&
            dayjs().isAfter(date.utc())))
      ) {
        const whatToDo = await new Promise((resolve) => {
          modal.openModal({
            title: t('what_do_you_want_to_do', 'What do you want to do?'),
            children: (
              <div className="flex flex-col">
                <div className="text-[20px] mb-[20px]">
                  {t(
                    'post_already_published_what_to_do',
                    'This post was already published, what do you want to do?'
                  )}
                </div>
                <div className="flex w-full gap-[10px]">
                  <div className="flex-1 flex">
                    <Button
                      type="button"
                      className="flex-1"
                      onClick={() => resolve('update')}
                    >
                      {t(
                        'just_update_post_details',
                        'Just update the post details'
                      )}
                    </Button>
                  </div>
                  <div className="flex-1 flex">
                    <Button
                      type="button"
                      className="flex-1"
                      onClick={() => resolve('republish')}
                    >
                      {t('republish_the_post', 'Republish the post')}
                    </Button>
                  </div>
                </div>
              </div>
            ),
          });
        });

        if (whatToDo === 'update') {
          type = 'update';
        }
      }

      setLoading(true);

      // Pull the local values to build the payload, but rely on the server
      // (`/posts/valid`) for the actual validation — checkValidity now lives
      // server-side so it can't be bypassed.
      const allValues = await ref.current.getAllValues();

      const integrationById = (id: string) =>
        selectedIntegrations.find((p) => p.integration.id === id);

      const group = existingData.group || makeId(10);

      const posts = allValues.map((post: any) => ({
        integration: {
          id: post.id,
        },
        group,
        settings: { ...(post.settings || {}) },
        researchSources,
        // Editorial process stage, NOT delivery `state`: see
        // `editorial-stage.copy.ts`. `null` clears a stage that was set
        // before; omitting the field would leave whatever was saved alone,
        // which is wrong here because the picker is always shown and its
        // current value — including "unset" — is what the person chose.
        editorialStage,
        ...(contentIntelligenceProvenance
          ? {
              contentContextSnapshotId:
                contentIntelligenceProvenance.contentContextSnapshotId,
              brandProfileVersionId:
                contentIntelligenceProvenance.brandProfileVersionId,
            }
          : {}),
        value: post.values.map((value: any) => ({
          ...(value.id ? { id: value.id } : {}),
          content: value.content,
          delay: value.delay || 0,
          ...(contentIntelligenceProvenance
            ? { usedCitationIds: value.usedCitationIds || [] }
            : {}),
          image:
            (value?.media || []).map(
              ({ id, path, alt, thumbnail, thumbnailTimestamp }: any) => ({
                id,
                path,
                alt,
                thumbnail,
                thumbnailTimestamp,
              })
            ) || [],
        })),
      }));

      if (!dummy) {
        const checkAllValid = await (
          await fetch('/posts/valid', {
            method: 'POST',
            body: JSON.stringify({ type, posts }),
          })
        ).json();

        const focus = (id: string, where: 'fix' | 'preview') => {
          integrationById(id)?.ref?.current?.[where]?.();
        };

        const notEnoughChars = checkAllValid.filter((p: any) => p.emptyContent);

        for (const item of notEnoughChars) {
          toaster.show(
            t(
              'channel_validation_message',
              '{{platform}} ({{name}}): {{message}}',
              {
                platform: capitalize(item.identifier.split('-')[0]),
                name: item.name,
                message: t(
                  'post_needs_content_or_image',
                  'Your post should have at least one character or one image.'
                ),
              }
            ),
            'warning'
          );
          setLoading(false);
          focus(item.id, 'preview');
          return;
        }

        if (type !== 'draft') {
          for (const item of checkAllValid) {
            if (item.valid === false) {
              toaster.show(
                t(
                  'channel_validation_message',
                  '{{platform}} ({{name}}): {{message}}',
                  {
                    platform: capitalize(item.identifier.split('-')[0]),
                    name: item.name,
                    message:
                      item.settingsError ||
                      t('please_fix_your_settings', 'Please fix your settings'),
                  }
                ),
                'warning'
              );
              focus(item.id, 'fix');
              setLoading(false);
              setShowSettings(true);
              return;
            }

            if (item.errors !== true) {
              toaster.show(
                t(
                  'channel_validation_message',
                  '{{platform}} ({{name}}): {{message}}',
                  {
                    platform: capitalize(item.identifier.split('-')[0]),
                    name: item.name,
                    message: item.errors,
                  }
                ),
                'warning'
              );
              focus(item.id, 'preview');
              setLoading(false);
              setShowSettings(false);
              return;
            }

            if (item.tooLong) {
              toaster.show(
                t(
                  'channel_validation_message',
                  '{{platform}} ({{name}}): {{message}}',
                  {
                    platform: item.identifier,
                    name: item.name,
                    message: t(
                      'post_is_too_long',
                      'post is too long, please fix it'
                    ),
                  }
                ),
                'warning'
              );
              focus(item.id, 'preview');
              setLoading(false);
              return;
            }
          }
        }
      }

      const shortlinkPreference = shortlinkPreferenceData?.shortlink || 'ASK';

      let shortLink = false;

      if (!dummy && shortlinkPreference !== 'NO') {
        const shortLinkUrl = await (
          await fetch('/posts/should-shortlink', {
            method: 'POST',
            body: JSON.stringify({
              messages: allValues
                // platforms that remove links won't keep shortlinks either
                .filter(
                  (p: any) => !integrationById(p.id)?.integration?.stripLinks
                )
                .flatMap((p: any) => p.values.flatMap((a: any) => a.content)),
            }),
          })
        ).json();

        if (shortLinkUrl.ask) {
          if (shortlinkPreference === 'YES') {
            // Automatically shortlink without asking
            shortLink = true;
          } else {
            // ASK: Show the dialog
            shortLink = await deleteDialog(
              t(
                'shortlink_urls_question',
                'Do you want to shortlink the URLs? it will let you get statistics over clicks'
              ),
              t('yes_shortlink_it', 'Yes, shortlink it!'),
              undefined,
              t('no_original_urls', 'No, original URLs')
            );
          }
        }
      }

      const data = {
        type,
        ...(repeater ? { inter: repeater } : {}),
        tags,
        shortLink,
        date: date.utc().format('YYYY-MM-DDTHH:mm:ss'),
        posts,
      };

      if (dummy) {
        modal.openModal({
          title: '',
          children: <DummyCodeComponent code={data} />,
          classNames: {
            modal: 'w-[100%] bg-transparent text-cf-ink',
          },
          size: '100%',
          withCloseButton: false,
          closeOnEscape: true,
          closeOnClickOutside: true,
        });

        setLoading(false);
      }

      if (!dummy) {
        if (addEditSets) {
          addEditSets(data);
        } else {
          const response = await fetch('/posts', {
            method: 'POST',
            body: JSON.stringify(data),
          });

          // Раньше окно закрывалось одинаково и после успеха, и после отказа:
          // человек видел «сохранено», а черновика не было нигде
          // (`content-factory-next-fn33.49`). Теперь неуспешный ответ
          // оставляет окно открытым и говорит причину словами сервера.
          if (!response.ok) {
            const refusal = await postSaveErrorMessage(response, t);
            if (refusal) {
              toaster.show(refusal, 'warning');
            }
            setLoading(false);
            return;
          }

          mutate();
          toaster.show(
            !existingData.integration
              ? t('added_successfully', 'Added successfully')
              : t('updated_successfully', 'Updated successfully')
          );
        }
        if (customClose) {
          setTimeout(() => {
            customClose();
          }, 2000);
        }

        if (!addEditSets) {
          modal.closeAll();
        }
      }
    },
    [
      ref,
      repeater,
      tags,
      date,
      addEditSets,
      dummy,
      shortlinkPreferenceData,
      researchSources,
      contentIntelligenceProvenance,
      contentIntelligenceLoadState,
      contentIntelligenceFailure,
    ]
  );

  return (
    <div className="w-full h-full flex-1 p-[40px] flex relative">
      <div className="flex flex-1 bg-cf-surface border border-cf-border rounded-[12px] flex-col">
        <div className="flex-1 flex">
          <div className="flex flex-col flex-1 border-e border-cf-border">
            {/*
              * Значок происхождения снят с первого экрана окна
              * (`content-factory-next-fn33.28.10`).
              *
              * Он печатал `creationMethod` как есть — сырое значение
              * перечисления: «WEB», «API», «MCP», «AUTOPOST», «CLI», — и
              * подсказку к нему по-английски («Created via WEB»). Человеку,
              * который открыл своё окно поста, слово «WEB» не сообщает
              * ничего: он и так знает, что пишет пост в браузере, потому что
              * прямо сейчас это и делает.
              *
              * Значок не удалён из продукта: в календаре и в предпросмотре он
              * различает посты, пришедшие из API, MCP и автопостинга, и там
              * это настоящий факт о записи. Убран он ровно оттуда, где всегда
              * показывал «WEB» и ничего больше.
              */}
            <div className="bg-cf-canvas border-b border-cf-border h-[64px] rounded-s-[12px] !rounded-b-[0] flex items-center gap-[12px] px-[20px] cf-heading-md">
              {/*
                Заголовок называет то, что человек делает прямо сейчас
                (`content-factory-next-fn33.90.10`). «Создать пост» стояло над
                уже написанным постом, открытым из календаря, — и над постом,
                открытым на чтение Пользователем, которому создавать нечего.
                Три случая, три слова; выбирает их то же выражение, что
                закрывает кнопки, поэтому шапка и низ окна не могут разойтись.
              */}
              {!existingData?.integration
                ? t('create_post_title', 'Create Post')
                : canWritePosts
                ? t('edit_post_title', 'Edit Post')
                : t('view_post_title', 'Post')}
              {existingData.posts?.[0]?.contentPieceId && (
                <Link
                  href={`/content/pieces/${encodeURIComponent(existingData.posts[0].contentPieceId)}`}
                  onClick={async (event) => {
                    event.preventDefault();
                    const href = event.currentTarget.href;
                    if (canWritePosts && !(await deleteDialog(
                      t('are_you_sure_you_want_to_close_this_modal_all_data_will_be_lost', 'Are you sure you want to close this modal? (all data will be lost)'),
                      t('yes_close_it', 'Yes, close it!')
                    ))) return;
                    customClose ? customClose() : modal.closeAll();
                    router.push(href);
                  }}
                  className="cf-label-md text-cf-accent underline underline-offset-4"
                >
                  {voiceLocale === 'ru' ? 'К заготовке' : 'Go to piece'}
                </Link>
              )}
            </div>
            <div className="flex-1 flex flex-col gap-[16px]">
              <div
                className={clsx('flex-1 relative', showSettings && 'hidden')}
              >
                <div
                  id="social-content"
                  className="gap-[32px] flex flex-col pe-[8px] pt-[20px] ps-[20px] absolute top-0 left-0 w-full h-full overflow-x-hidden overflow-y-scroll scrollbar scrollbar-thumb-cf-border-strong scrollbar-track-cf-surface"
                >
                  <div className="flex w-full">
                    <div className="flex flex-1">
                      <PicksSocialsComponent toolTip={true} />
                    </div>
                    <div>
                      {!dummy && (
                        <SelectCustomer
                          onChange={changeCustomer}
                          integrations={integrations}
                        />
                      )}
                    </div>
                  </div>
                  <div className="flex flex-1 gap-[6px] flex-col">
                    <div>{!existingData.integration && <SelectCurrent />}</div>
                    <div className="flex-1 flex">
                      {!hide && (
                        <EditorWrapper
                          totalPosts={1}
                          value=""
                          readOnly={!canWritePosts}
                        />
                      )}
                    </div>
                    {/**
                      * Строка качества — под текстом, а не сбоку от него
                      * (`content-factory-next-fn33.28.4`, решение владельца
                      * 07.09.2026). Она называет только то, на что стоит
                      * взглянуть: штампы и «не похоже на вас». Чистый текст
                      * не получает ни строки — подтверждение того, что всё в
                      * порядке, приучает пролистывать ту единственную
                      * строку, которая сообщает.
                      *
                      * Ничего не запрещает и ничего не ждёт: сохранение,
                      * расписание и отправка о ней не знают.
                      */}
                    <DraftQualityLine
                      locale={voiceLocale}
                      text={editorText}
                      platform={relatedPlatform}
                    />
                    <div
                      id="social-empty"
                      className={clsx(
                        'pb-[16px]'
                        // current !== 'global' && 'hidden'
                      )}
                    />
                  </div>
                </div>
              </div>
              <div
                id="wrapper-settings"
                className={clsx(
                  'pb-[20px] px-[20px] select-none',
                  showSettings && 'flex-1 flex pt-[20px]',
                  current === 'global' && 'hidden'
                )}
              >
                <div className="flex-1 flex flex-col rounded-[12px] gap-[12px] overflow-hidden bg-cf-surface-subtle">
                  <div
                    onClick={() => setShowSettings(!showSettings)}
                    className={clsx(
                      'bg-cf-accent rounded-[12px] flex items-center gap-[8px] cursor-pointer p-[12px]',
                      showSettings ? '!rounded-b-none' : ''
                    )}
                  >
                    <div className="flex-1 cf-label-md text-cf-accent-ink">
                      {currentIntegrationText}
                    </div>
                    <div>
                      <ChevronDownIcon
                        rotated={showSettings}
                        className="text-cf-accent-ink"
                      />
                    </div>
                  </div>
                  <div
                    className={clsx(
                      !showSettings ? 'hidden' : 'flex-1',
                      'cf-body-sm text-cf-ink relative'
                    )}
                  >
                    <div className="absolute left-0 top-0 w-full h-full flex flex-col overflow-x-hidden overflow-y-auto scrollbar scrollbar-thumb-cf-border-strong scrollbar-track-cf-surface-subtle">
                      <div
                        id="social-settings"
                        className="flex flex-col gap-[20px] bg-cf-canvas"
                      />
                    </div>
                  </div>
                  <style>
                    {`#social-settings [data-id="${current}"] {display: block !important;}`}
                  </style>
                </div>
              </div>
            </div>
          </div>
          <div className="w-[580px] flex flex-col">
            <div className="bg-cf-canvas border-b border-cf-border h-[64px] rounded-e-[12px] !rounded-b-[0] flex items-center px-[20px] cf-heading-md">
              <div className="flex-1">{t('post_preview', 'Post Preview')}</div>
              {/*
                Крестик — кнопка, а не значок с обработчиком нажатия
                (`content-factory-next-tu3k.9.11`). До этого закрыть окно
                мышью было можно, а с клавиатуры нет: `<svg onClick>` не
                получает фокус, не отзывается на Enter и Space и не имеет
                имени, которое прочла бы программа чтения с экрана. Теперь это
                обычная кнопка системы: имя у неё есть, фокус виден, обе
                клавиши работают сами.

                Escape здесь не обрабатывается намеренно: оболочка окна
                (`layout/new-modal.tsx`) вешает его на верхнее окно всегда и
                спрашивает тем же вопросом. Второй обработчик задал бы вопрос
                дважды.
              */}
              <Button
                type="button"
                variant="quiet"
                iconOnly
                aria-label={t('close_post_window', 'Close the post window')}
                title={t('close_post_window', 'Close the post window')}
                onClick={askClose}
              >
                <CloseIcon className="text-cf-ink-muted" />
              </Button>
            </div>
            <div className="flex-1 relative">
              <Scrollable
                scrollClasses="!pe-[20px]"
                className="absolute top-0 p-[20px] pe-[8px] left-0 w-full h-full overflow-x-hidden overflow-y-scroll scrollbar scrollbar-thumb-cf-border-strong scrollbar-track-cf-surface"
              >
                <ShowAllProviders ref={ref} />
                {/**
                  * Одна строка происхождения вместо двух поверхностей.
                  *
                  * Здесь стояли панель «Проверенный контекст» и лента
                  * «Применённый аватар»: пять значений через точку, две кнопки
                  * без разницы между ними и объяснение устройства генератора
                  * человеку, который просто пишет пост. 04.09.2026 владелец
                  * решил, что окно даёт только полезное. У поста без контекста
                  * здесь нет вообще ничего — обычный пост человек написал сам,
                  * и сообщать ему об этом нечего.
                  *
                  * Предложение по черновику стоит ниже: оно про один
                  * конкретный текст, а не про инструмент.
                  */}
                {contentIntelligenceProvenance && (
                  <div className="mt-[16px]">
                    <ProvenanceLine
                      provenance={contentIntelligenceProvenance}
                      confirmationCount={
                        confirmationCount > 0 ? confirmationCount : undefined
                      }
                    />
                  </div>
                )}
                {/**
                  * Состав и отказ стоят под строкой происхождения, а не
                  * вместо неё.
                  *
                  * Строка говорит, из чего пост собран; это — что в нём
                  * помечено как взятое из поиска и чего в нём нет
                  * (`content-factory-next-fn33.131`,
                  * `content-factory-next-ec48.2`). Разные вопросы, и оба
                  * возникают только тогда, когда человек что-то брал: у поста
                  * без такого материала здесь пусто.
                  */}
                <UnverifiedEvidenceNote
                  count={contentIntelligenceProvenance?.unverifiedCount}
                  searchCount={
                    contentIntelligenceProvenance?.searchEvidenceCount
                  }
                  locale={voiceLocale}
                />
                {/**
                  * Свои прежние тексты по теме — справка, а не выбор
                  * (`content-factory-next-m2eg.19`). Стоит рядом с «Что взято
                  * и откуда» и по той же причине: оба блока отвечают на
                  * вопрос «что стоит за этим текстом», и разводить их по
                  * разным углам окна значило бы задавать один вопрос дважды.
                  */}
                <RelatedOwnPostsNote
                  related={relatedOwnPosts}
                  locale={voiceLocale}
                />
                <DraftGapNote gap={props.draftGap} locale={voiceLocale} />
              </Scrollable>
            </div>
          </div>
        </div>
        {/*
          Причина без кнопки рядом — и это не потеря.
          07.09.2026 отсюда ушла «Проверил» вместе со своей причиной
          (`content-factory-next-m2eg.17`): она не проверяла ничего, она
          записывала, что человек сказал «проверил», и стояла перед каждым
          постом, написанным продуктом. Оставшиеся причины шага не предлагают —
          они называют состояние, которое человек снимает не здесь.
        */}
        {blockReason !== 'none' && (
          <div className="select-none px-[20px] pb-[8px] flex items-center justify-end gap-[12px]">
            <ComposeBlockReasonNote reason={blockReason} t={t} />
          </div>
        )}
        <div className="select-none h-[84px] py-[20px] border-t border-cf-border flex items-center">
          <div className="flex-1 flex ps-[20px] gap-[8px]">
            {!dummy && (
              <TagsComponent
                name="tags"
                label={t('tags', 'Tags')}
                disabled={!canWritePosts}
                initial={tags}
                onChange={(e) => {
                  setTags(e.target.value);
                }}
              />
            )}

            {!dummy && (
              <RepeatComponent
                repeat={repeater}
                onChange={setRepeater}
                disabled={!canWritePosts}
              />
            )}

            {!dummy && (
              <EditorialStageSelect
                value={editorialStage}
                onChange={setEditorialStage}
                disabled={!canWritePosts}
                className="w-[160px]"
              />
            )}

            {/*
              Кнопка помощника: она и есть то нажатие, которым поднимается
              провайдер (`content-factory-next-fn33.99`). До нажатия помощника
              в дереве нет, поэтому нет и его собственной круглой кнопки —
              вместо неё стоит эта, из того же ряда стандартных контролов.
              Пропадает она только там, где помощника нельзя позвать: там его и
              раньше было не позвать, просто это было видно не сразу.
            */}
            {!assistantOpen && assistantAvailable && canWritePosts && (
              <Button
                type="button"
                variant="quiet"
                onClick={openAssistant}
              >
                {t('your_assistant', 'Your Assistant')}
              </Button>
            )}
          </div>
          <div className="pe-[20px] flex items-center justify-end gap-[8px]">
            {existingData?.integration && canWritePosts && (
              <Button
                variant="destructive"
                onClick={deletePost}
                className="flex gap-[8px] items-center"
              >
                <div>
                  <TrashIcon />
                </div>
                <div>{t('delete_post', 'Delete Post')}</div>
              </Button>
            )}
            <DatePicker
              onChange={setDate}
              date={date}
              disabled={!canWritePosts}
            />
            {!addEditSets && (
              <Button
                variant="secondary"
                disabled={
                  !canWritePosts ||
                  selectedIntegrations.length === 0 ||
                  loading ||
                  locked ||
                  contentIntelligenceLoadState === 'loading' ||
                  contentIntelligenceLoadState === 'error' ||
                  contentIntelligenceProvenance?.errorCode ===
                    'CONTENT_EVIDENCE_REQUIRED'
                }
                aria-describedby={
                  blockReason === 'none'
                    ? undefined
                    : COMPOSE_BLOCK_REASON_NOTE_ID
                }
                onClick={schedule('draft')}
                loading={loading}
                loadingLabel={t('save_as_draft', 'Save as Draft')}
                className="px-[20px]"
              >
                {t('save_as_draft', 'Save as Draft')}
              </Button>
            )}
            {addEditSets && (
              <Button
                className="min-w-[180px] px-[20px]"
                disabled={
                  !canWritePosts ||
                  selectedIntegrations.length === 0 || loading || locked
                }
                loading={loading}
                loadingLabel={t('save_set', 'Save Set')}
                onClick={schedule('draft')}
              >
                {t('save_set', 'Save Set')}
              </Button>
            )}
            {/**
              * Отправка: одна кнопка и меню рядом с ней
              * (`content-factory-next-m2eg.18`, макет одобрен владельцем
              * 07.09.2026).
              *
              * До этого «Опубликовать сейчас» появлялась по НАВЕДЕНИЮ на
              * основную кнопку и висела над ней. С клавиатуры до неё было не
              * дойти вовсе, на сенсорном экране наведения нет, а мышью её
              * находили случайно — самое необратимое действие окна открывалось
              * жестом, которого никто не просил. Теперь его открывает стрелка:
              * щелчок или Enter, стрелки внутри, Escape закрывает. Наведение не
              * делает ничего.
              *
              * Меню — общий примитив `Menu`/`MenuList`, а не своя разметка:
              * `role="menu"`, написанный руками в файле приложения, валит
              * `tests/choice-control.contract.test.cjs`, и правильно валит —
              * роль без кареточной навигации за ней это обещание, которого
              * клавиатура не получает.
              */}
            {!addEditSets && (
              <div className="relative flex" ref={publishMenuRef}>
                <Menu open={publishMenuOpen} onOpenChange={setPublishMenuOpen}>
                  <Button
                    disabled={publishDisabled}
                    aria-describedby={
                      blockReason === 'none'
                        ? undefined
                        : COMPOSE_BLOCK_REASON_NOTE_ID
                    }
                    onClick={schedule('schedule')}
                    loading={loading}
                    className={clsx(
                      'min-w-[180px] px-[20px]',
                      // Половинки склеены в один контрол: скругления снаружи,
                      // стык внутри. У окна без меню кнопка круглая с обеих
                      // сторон, как была.
                      dummy ? 'rounded-[8px]' : 'rounded-s-[8px] rounded-e-none'
                    )}
                  >
                    {mainActionLabel}
                  </Button>
                  {!dummy && (
                    <MenuButton
                      aria-label={composeCopy[voiceLocale].morePublishingActions}
                      disabled={publishDisabled}
                      className={buttonClassName({
                        variant: 'primary',
                        className:
                          'w-[40px] px-0 rounded-s-none rounded-e-[8px] border-s border-cf-accent-ink',
                      })}
                    >
                      <DropdownArrowSmallIcon />
                    </MenuButton>
                  )}
                  {publishMenuOpen && !dummy && (
                    <MenuList className="menu-shadow absolute bottom-[calc(100%+8px)] end-0 z-[300] flex w-[280px] flex-col gap-[4px] border border-cf-border bg-cf-surface-raised p-[8px]">
                      {/*
                        «Опубликовать сейчас» стоит первым: меню открывают
                        ради него, а второй пункт повторяет то, что уже
                        написано на кнопке рядом, — он здесь для полноты
                        списка, а не для нового действия.
                      */}
                      <MenuCommand
                        layout="content"
                        onClick={schedule('now')}
                        className="flex flex-col items-start gap-[4px] rounded-[8px] px-[12px] py-[8px] text-start hover:bg-cf-surface-subtle"
                      >
                        <span className="cf-label-md text-cf-ink">
                          {t('post_now', 'Post Now')}
                        </span>
                        <span className="cf-caption text-cf-ink-muted">
                          {composeCopy[voiceLocale].postNowHint}
                        </span>
                      </MenuCommand>
                      <MenuCommand
                        layout="content"
                        onClick={schedule('schedule')}
                        className="flex flex-col items-start gap-[4px] rounded-[8px] px-[12px] py-[8px] text-start hover:bg-cf-surface-subtle"
                      >
                        <span className="cf-label-md text-cf-ink">
                          {mainActionLabel}
                        </span>
                        <span className="cf-caption text-cf-ink-muted">
                          {mainActionHint}
                        </span>
                      </MenuCommand>
                    </MenuList>
                  )}
                </Menu>
              </div>
            )}
          </div>
        </div>
      </div>
      {hasCopilot && (
      <AssistantPopup
        defaultOpen={true}
        hitEscapeToClose={false}
        clickOutsideToClose={true}
        instructions={`
You are an assistant that help the user to schedule their social media posts,
Here are the things you can do:
- Add a new comment / post to the list of posts
- Delete a comment / post from the list of posts
- Add content to the comment / post
- Activate or deactivate the comment / post

Post content can be added using the addPostContentFor{num} function.
After using the addPostFor{num} it will create a new addPostContentFor{num+ 1} function.
`}
      />
      )}
    </div>
  );
};

const Scrollable: FC<{
  className: string;
  scrollClasses: string;
  children: ReactNode;
}> = ({ className, scrollClasses, children }) => {
  const ref = useRef(undefined);
  const hasScroll = useHasScroll(ref);
  return (
    <div className={clsx(className, hasScroll && scrollClasses)} ref={ref}>
      {children}
    </div>
  );
};
