import React, { useCallback } from 'react';
import { useModals } from '@contentfactory/frontend/components/layout/new-modal';
import dayjs from 'dayjs';
import { useCalendar } from '@contentfactory/frontend/components/launches/calendar.context';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';
import { SetSelectionModal } from '@contentfactory/frontend/components/launches/calendar';
import { useOpenPostEditor } from '@contentfactory/frontend/components/new-launch/compose.modal';
import { ModalWrapperComponent } from '@contentfactory/frontend/components/new-launch/modal.wrapper.component';
import { Button } from '@contentfactory/react/form/button';
import { useUser } from '@contentfactory/frontend/components/layout/user.context';
import { isOrganizationEditor } from '@contentfactory/nestjs-libraries/user/organization.roles';
import { railPairClass } from '@contentfactory/frontend/components/launches/channel-rail';

/**
 * Главное действие рейки каналов.
 *
 * `content-factory-next-tu3k.13`: кнопка отличается от соседей заливкой и
 * ничем больше — та же высота 40, тот же радиус, тот же шаг. Свёрнутая рейка
 * оставляет знак и уводит имя в `aria-label`; развёрнутая пара «Пост» и
 * «Заготовка» делит строку пополам, и подпись там короткая — «Чистый лист» в
 * половину строки не помещается.
 */
export const NewPost = ({ collapsed = false }: { collapsed?: boolean }) => {
  const fetch = useFetch();
  const modal = useModals();
  const { integrations, reloadCalendarView, sets } = useCalendar();
  const t = useT();
  const user = useUser();
  const openPostEditor = useOpenPostEditor();

  const createAPost = useCallback(async () => {
    const date = (await (await fetch('/posts/find-slot')).json()).date;

    const set: any = !sets.length
      ? undefined
      : await new Promise((resolve) => {
          modal.openModal({
            title: t('select_set', 'Select a Set'),
            closeOnClickOutside: true,
            closeOnEscape: true,
            withCloseButton: false,
            onClose: () => resolve('exit'),
            classNames: {
              modal: 'text-textColor',
            },
            children: (
              <SetSelectionModal
                sets={sets}
                onSelect={(selectedSet) => {
                  resolve(selectedSet);
                  modal.closeAll();
                }}
                onContinueWithoutSet={() => {
                  resolve(undefined);
                  modal.closeAll();
                }}
              />
            ),
          });
        });

    if (set === 'exit') return;

    await openPostEditor({
      integrations,
      ...(set?.content ? { set: JSON.parse(set.content) } : {}),
      reopenModal: createAPost,
      mutate: reloadCalendarView,
      date: dayjs.utc(date).local(),
    });
  }, [integrations, sets, openPostEditor]);

  // Since 05.09.2026 the doors this button leads to — `POST /posts` and the
  // schedule beside it — carry `Sections.EDITOR`
  // (`content-factory-next-fn33.90`). The refusal they return is honest, but
  // a person would meet it only after writing the post, so `USER` does not
  // get the button at all. Same reasoning, and the same shape, as
  // `add.provider.component.tsx`.
  if (!isOrganizationEditor(user?.role)) {
    return null;
  }

  /*
    Подпись развёрнутой кнопки — существующий ключ `post`: «Пост». Половина
    строки рейки это 110px, и «Чистый лист» рядом со знаком туда не встаёт
    (`content-factory-next-tu3k.13`).

    Доступное имя равно тому, что видно: кнопка с подписью «Пост» и
    `aria-label` «Чистый лист» — это две разные кнопки для того, кто говорит
    экрану вслух. Полное имя двери остаётся именем свёрнутой кнопки, где
    подписи нет вовсе.
  */
  const label = t('create_new_post', 'Blank page');
  const shortLabel = t('post', 'Post');

  return (
    <Button
      onClick={createAPost}
      variant="primary"
      iconOnly={collapsed}
      density="standard"
      aria-label={collapsed ? label : shortLabel}
      className={railPairClass(collapsed, 'flex items-center outline-none')}
    >
      {collapsed ? (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="21"
          height="20"
          viewBox="0 0 21 20"
          fill="none"
          className="min-w-[21px] min-h-[20px]"
        >
          <path
            d="M10.5001 4.16699V15.8337M4.66675 10.0003H16.3334"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        <div className="text-[14px] truncate">{shortLabel}</div>
      )}
    </Button>
  );
};
