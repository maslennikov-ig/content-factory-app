'use client';

import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import useSWR from 'swr';
import React, { FC, useCallback, useState } from 'react';
import { Button } from '@contentfactory/react/form/button';
import { useRouter } from 'next/navigation';
import { useModals } from '@contentfactory/frontend/components/layout/new-modal';
import { FieldValues, FormProvider, useForm } from 'react-hook-form';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';
import { Input } from '@contentfactory/react/form/input';
import { useToaster } from '@contentfactory/react/toaster/toaster';
import { ModalWrapperComponent } from '@contentfactory/frontend/components/new-launch/modal.wrapper.component';

export const ApiModal: FC<{
  identifier: string;
  title: string;
  update: () => void;
}> = (props) => {
  const { title, identifier, update } = props;
  const fetch = useFetch();
  const router = useRouter();
  const modal = useModals();
  const toaster = useToaster();
  const t = useT();
  const [loading, setLoading] = useState(false);
  const closePopup = useCallback(() => {
    modal.closeAll();
  }, []);

  const methods = useForm({
    mode: 'onChange',
  });

  const close = useCallback(() => {
    if (closePopup) {
      return closePopup();
    }
    modal.closeAll();
  }, []);

  const submit = useCallback(
    async (data: FieldValues) => {
      setLoading(true);
      const add = await fetch(`/third-party/${identifier}`, {
        method: 'POST',
        body: JSON.stringify({
          api: data.api,
        }),
      });

      if (add.ok) {
        toaster.show(
          t('integration_added_successfully', 'Integration added successfully'),
          'success'
        );
        if (closePopup) {
          closePopup();
        } else {
          modal.closeAll();
        }
        router.refresh();
        if (update) update();
        return;
      }

      const { message } = await add.json();

      methods.setError('api', {
        message,
      });

      setLoading(false);
    },
    [props]
  );

  return (
    <div className="relative">
      <FormProvider {...methods}>
        <form
          className="gap-[8px] flex flex-col"
          onSubmit={methods.handleSubmit(submit)}
        >
          <div className="pt-[10px]">
            <Input label={t('label_api_key', 'API Key')} name="api" />
          </div>
          <div>
            <Button loading={loading} type="submit">
              {t('add_integration', 'Add Integration')}
            </Button>
          </div>
        </form>
      </FormProvider>
    </div>
  );
};

export const ThirdPartyListComponent: FC<{ reload: () => void }> = (props) => {
  const fetch = useFetch();
  const modals = useModals();
  const t = useT();
  const { reload } = props;

  const integrationsList = useCallback(async () => {
    return (await fetch('/third-party/list')).json();
  }, []);

  const { data } = useSWR('third-party-list', integrationsList, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
    revalidateOnMount: true,
    refreshWhenHidden: false,
    refreshWhenOffline: false,
  });

  const addApiKey = useCallback(
    (title: string, identifier: string) => () => {
      modals.openModal({
        title: t('add_api_key_for', 'Add API key for {{name}}', {
          name: title,
        }),
        withCloseButton: false,
        children: (
          <ApiModal identifier={identifier} title={title} update={reload} />
        ),
      });
    },
    []
  );

  return (
    <div className="grid grid-cols-4 gap-[10px] justify-items-center justify-center">
      {data?.map((p: any) => (
        <div
          onClick={addApiKey(p.title, p.identifier)}
          key={p.identifier}
          className="w-full h-full p-[20px] min-h-[100px] text-[14px] bg-newTableHeader hover:bg-newTableBorder rounded-[8px] transition-all text-textColor relative flex flex-col gap-[15px] cursor-pointer"
        >
          <div>
            <img
              className="w-[32px] h-[32px]"
              src={`/icons/third-party/${p.identifier}.png`}
            />
          </div>
          <div className="whitespace-pre-wrap text-left text-lg">{p.title}</div>
          {/*
            Описание провайдера приходит с сервера по-английски и печаталось
            как есть посреди русского экрана
            (`content-factory-next-fn33.74`). Ключ собирается из
            идентификатора, а серверный текст остаётся запасным вариантом для
            провайдера, которого локали ещё не знают.
          */}
          <div className="whitespace-pre-wrap text-left">
            {String(t(`third_party_description_${p.identifier}`, p.description))}
          </div>
          <div className="w-full flex">
            <Button className="w-full">{t('add', 'Add')}</Button>
          </div>
        </div>
      ))}
    </div>
  );
};
