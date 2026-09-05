import React, { FC, Fragment, useCallback } from 'react';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import useSWR from 'swr';
import { Button } from '@contentfactory/react/form/button';
import clsx from 'clsx';
import { useModals } from '@contentfactory/frontend/components/layout/new-modal';
import { TopTitle } from '@contentfactory/frontend/components/launches/helpers/top.title.component';
import { array, boolean, object, string } from 'yup';
import { FormProvider, useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import { CopilotProvider } from '@contentfactory/frontend/components/copilot/copilot.provider';
import { AssistedTextarea } from '@contentfactory/frontend/components/copilot/assisted.textarea';
import { Select } from '@contentfactory/react/form/select';
import { useToaster } from '@contentfactory/react/toaster/toaster';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';
import { deleteDialog } from '@contentfactory/react/helpers/delete.dialog';
export const SignaturesComponent: FC<{
  appendSignature?: (value: string) => void;
}> = (props) => {
  const { appendSignature } = props;
  const fetch = useFetch();
  const modal = useModals();
  const toaster = useToaster();
  const t = useT();
  const load = useCallback(async () => {
    return (await fetch('/signatures')).json();
  }, []);
  const { data, mutate } = useSWR('signatures', load);
  const addSignature = useCallback(
    (data?: any) => () => {
      modal.openModal({
        title: data
          ? t('edit_signature', 'Edit Signature')
          : t('add_signature', 'Add Signature'),
        withCloseButton: true,
        children: <AddOrRemoveSignature data={data} reload={mutate} />,
      });
    },
    [mutate]
  );

  const deleteSignature = useCallback(
    (data: any) => async () => {
      if (
        await deleteDialog(
          t(
            'are_you_sure_you_want_to_delete',
            `Are you sure you want to delete?`,
            { name: data.content.slice(0, 15) + '...' }
          )
        )
      ) {
        await fetch(`/signatures/${data.id}`, {
          method: 'DELETE',
        });
        mutate();
        toaster.show(
          t('signature_deleted_successfully', 'Signature deleted successfully'),
          'success'
        );
      }
    },
    []
  );

  return (
    <div className="flex flex-col">
      <h3 className="cf-heading-md text-cf-ink">
        {t('signatures', 'Signatures')}
      </h3>
      <div className="mt-[4px] cf-body-md text-cf-ink-muted">
        {t(
          'you_can_add_signatures_to_your_account_to_be_used_in_your_posts',
          'You can add signatures to your account to be used in your posts.'
        )}
      </div>
      <div className="my-[16px] flex items-center gap-[24px] rounded-[8px] border border-cf-border bg-cf-surface p-[24px]">
        <div className="flex flex-col w-full">
          {!!data?.length && (
            <div
              className={`grid ${
                !!appendSignature
                  ? 'grid-cols-[1fr,1fr,1fr,1fr,1fr]'
                  : 'grid-cols-[1fr,1fr,1fr,1fr]'
              } w-full gap-y-[10px]`}
            >
              <div>{t('content', 'Content')}</div>
              <div className="text-center">{t('auto_add', 'Auto Add?')}</div>
              {!!appendSignature && (
                <div className="text-center">{t('actions', 'Actions')}</div>
              )}
              <div className="text-center">{t('edit', 'Edit')}</div>
              <div className="text-center">{t('delete', 'Delete')}</div>
              {data?.map((p: any) => (
                <Fragment key={p.id}>
                  <div className="relative flex-1 me-[20px] overflow-x-hidden">
                    <div className="absolute start-0 line-clamp-1 top-[50%] -translate-y-[50%] text-ellipsis">
                      {p.content.slice(0, 15) + '...'}
                    </div>
                  </div>
                  <div className="flex flex-col justify-center relative me-[20px]">
                    <div className="text-center w-full absolute start-0 line-clamp-1 top-[50%] -translate-y-[50%]">
                      {p.autoAdd ? 'Yes' : 'No'}
                    </div>
                  </div>
                  {!!appendSignature && (
                    <div className="flex justify-center">
                      <Button onClick={() => appendSignature(p.content)}>
                        {t('use_signature', 'Use Signature')}
                      </Button>
                    </div>
                  )}
                  <div className="flex justify-center">
                    <div>
                      <Button onClick={addSignature(p)}>
                        {t('edit', 'Edit')}
                      </Button>
                    </div>
                  </div>
                  <div className="flex justify-center">
                    <div>
                      <Button onClick={deleteSignature(p)}>
                        {t('delete', 'Delete')}
                      </Button>
                    </div>
                  </div>
                </Fragment>
              ))}
            </div>
          )}
          <div>
            <Button
              onClick={addSignature()}
              className={clsx((data?.length || 0) > 0 && 'my-[16px]')}
            >
              {t('add_a_signature', 'Add a signature')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
const details = object().shape({
  content: string().required(),
  autoAdd: boolean().required(),
});
const AddOrRemoveSignature: FC<{
  data?: any;
  reload: () => void;
}> = (props) => {
  const { data, reload } = props;
  const toast = useToaster();
  const fetch = useFetch();
  const form = useForm({
    resolver: yupResolver(details),
    values: {
      content: data?.content || '',
      autoAdd: data?.autoAdd || false,
    },
  });
  const text = form.watch('content');
  const autoAdd = form.watch('autoAdd');
  const modal = useModals();
  const callBack = useCallback(
    async (values: any) => {
      await fetch(data?.id ? `/signatures/${data.id}` : '/signatures', {
        method: data?.id ? 'PUT' : 'POST',
        body: JSON.stringify(values),
      });
      toast.show(
        data?.id
          ? 'Signature updated successfully'
          : 'Signature added successfully',
        'success'
      );
      modal.closeCurrent();
      reload();
    },
    [data, modal]
  );

  const t = useT();

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(callBack)}>
        <div className="relative flex gap-[20px] flex-col flex-1 rounded-[4px] pt-0">
          <Button
            iconOnly
            size={28}
            aria-label={t('close', 'Close')}
            variant="quiet"
            className="outline-none absolute end-[20px] top-[15px] mantine-UnstyledButton-root mantine-ActionIcon-root cursor-pointer mantine-Modal-close mantine-1dcetaa"
            type="button"
            onClick={() => modal.closeCurrent()}
          >
            <svg
              viewBox="0 0 15 15"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
            >
              <path
                d="M11.7816 4.03157C12.0062 3.80702 12.0062 3.44295 11.7816 3.2184C11.5571 2.99385 11.193 2.99385 10.9685 3.2184L7.50005 6.68682L4.03164 3.2184C3.80708 2.99385 3.44301 2.99385 3.21846 3.2184C2.99391 3.44295 2.99391 3.80702 3.21846 4.03157L6.68688 7.49999L3.21846 10.9684C2.99391 11.193 2.99391 11.557 3.21846 11.7816C3.44301 12.0061 3.80708 12.0061 4.03164 11.7816L7.50005 8.31316L10.9685 11.7816C11.193 12.0061 11.5571 12.0061 11.7816 11.7816C12.0062 11.557 12.0062 11.193 11.7816 10.9684L8.31322 7.49999L11.7816 4.03157Z"
                fill="currentColor"
                fillRule="evenodd"
                clipRule="evenodd"
              ></path>
            </svg>
          </Button>

          <div className="relative bg-cf-surface-subtle">
            {/*
  Помощник монтируется у самого поля, а не вокруг всего приложения: его
  провайдер обращается к рантайму сразу при монтировании
  (`content-factory-next-fn33.48`, `content-factory-next-fn33.93`), и не
  монтируется вовсе там, где отвечать некому: без ключа AI это был
  `POST /copilot/chat -> 503` на каждом открытии (`content-factory-next-fn33.28.16`).
*/}
            <CopilotProvider requireAvailable>
              <AssistedTextarea
                className={clsx(
                  '!min-h-40 !max-h-80 p-2 overflow-x-hidden scrollbar scrollbar-thumb-cf-accent bg-bigStrip outline-none'
                )}
                value={text}
                onChange={(e) => {
                  form.setValue('content', e.target.value);
                }}
                placeholder={t(
                  'signature_placeholder',
                  'Write your signature...'
                )}
                purpose={`Assist me in writing social media signature`}
              />
            </CopilotProvider>
          </div>

          <Select
            label="Auto add signature?"
            translationKey="label_auto_add_signature"
            {...form.register('autoAdd', {
              setValueAs: (value) => value === 'true',
            })}
          >
            <option value="false">{t('no', 'No')}</option>
            <option value="true">{t('yes', 'Yes')}</option>
          </Select>

          <Button type="submit">{t('save', 'Save')}</Button>
        </div>
      </form>
    </FormProvider>
  );
};
