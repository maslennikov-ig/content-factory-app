import React, { useCallback } from 'react';
import { useModals } from '@contentfactory/frontend/components/layout/new-modal';
import dayjs from 'dayjs';
import { useCalendar } from '@contentfactory/frontend/components/launches/calendar.context';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';
import { SetSelectionModal } from '@contentfactory/frontend/components/launches/calendar';
import { AddEditModal } from '@contentfactory/frontend/components/new-launch/add.edit.modal';
import { ModalWrapperComponent } from '@contentfactory/frontend/components/new-launch/modal.wrapper.component';
import { Button } from '@contentfactory/react/form/button';
import { useUser } from '@contentfactory/frontend/components/layout/user.context';
import { isOrganizationEditor } from '@contentfactory/nestjs-libraries/user/organization.roles';

export const NewPost = () => {
  const fetch = useFetch();
  const modal = useModals();
  const { integrations, reloadCalendarView, sets } = useCalendar();
  const t = useT();
  const user = useUser();

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

    modal.openModal({
      id: 'add-edit-modal',
      closeOnClickOutside: false,
      removeLayout: true,
      closeOnEscape: false,
      withCloseButton: false,
      askClose: true,
      fullScreen: true,
      classNames: {
        modal: 'w-[100%] max-w-[1400px] text-textColor',
      },
      children: (
        <AddEditModal
          allIntegrations={integrations.map((p) => ({
            ...p,
          }))}
          {...(set?.content ? { set: JSON.parse(set.content) } : {})}
          reopenModal={createAPost}
          mutate={reloadCalendarView}
          integrations={integrations}
          date={dayjs.utc(date).local()}
        />
      ),
      size: '80%',
      title: ``,
    });
  }, [integrations, sets]);

  // Since 05.09.2026 the doors this button leads to — `POST /posts` and the
  // schedule beside it — carry `Sections.EDITOR`
  // (`content-factory-next-fn33.90`). The refusal they return is honest, but
  // a person would meet it only after writing the post, so `USER` does not
  // get the button at all. Same reasoning, and the same shape, as
  // `add.provider.component.tsx`.
  if (!isOrganizationEditor(user?.role)) {
    return null;
  }

  return (
    <Button
      onClick={createAPost}
      variant="primary"
 className="flex-1 px-[16px] group-[.sidebar]:p-0 rounded-md flex justify-center items-center outline-none"
    >
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
      <div className="flex-1 text-start text-[14px] group-[.sidebar]:hidden">
        {t('create_new_post', 'Create Post')}
      </div>
    </Button>
  );
};
