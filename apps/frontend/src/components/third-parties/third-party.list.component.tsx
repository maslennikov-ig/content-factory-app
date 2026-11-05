'use client';

import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import React, { FC, useCallback, useState } from 'react';
import { Button } from '@contentfactory/react/form/button';
import { useRouter } from 'next/navigation';
import { useModals } from '@contentfactory/frontend/components/layout/new-modal';
import { FieldValues, FormProvider, useForm } from 'react-hook-form';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';
import { Input } from '@contentfactory/react/form/input';
import { useToaster } from '@contentfactory/react/toaster/toaster';
import { ModalWrapperComponent } from '@contentfactory/frontend/components/new-launch/modal.wrapper.component';
import type { HubProviderV1, ThirdPartyHubV1 } from '@contentfactory/nestjs-libraries/3rdparties/thirdparty-hub.v1';
import { isOrganizationAdmin } from '@contentfactory/nestjs-libraries/user/organization.roles';
import { useUser } from '../layout/user.context';
import { VideoSubscriptions } from '../videos/video-subscriptions';
import { VideoProviderSettings } from '../videos/video-provider-settings';
import { useIntegrationHubWords } from './integration-hub.copy';
import { useVideoAccessWords } from '../videos/video-access.copy';
import { useVideoPersonalWords } from '../videos/video-personal.copy';

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
  const canAdmin = isOrganizationAdmin(useUser()?.role);
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
      if (!canAdmin) return;
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
            <Input label={t('label_api_key', 'API Key')} name="api" secret disabled={!canAdmin || loading} />
          </div>
          <div>
            <Button loading={loading} loadingLabel={t('saving', 'Saving')} disabled={!canAdmin} type="submit">
              {t('add_integration', 'Add Integration')}
            </Button>
          </div>
        </form>
      </FormProvider>
    </div>
  );
};

export const ThirdPartyListComponent: FC<{ reload: () => void; hub: ThirdPartyHubV1; returnPath: string | null }> = (props) => {
  const modals = useModals();
  const t = useT();
  const { reload, hub, returnPath } = props;
  const words = useIntegrationHubWords(); const access = useVideoAccessWords(); const personalWords = useVideoPersonalWords();
  const canAdmin = isOrganizationAdmin(useUser()?.role);

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
    [modals, reload, t]
  );

  const personal = (provider: HubProviderV1) => modals.openModal({ title: [provider.title, words.personal].join(' · '),
    withCloseButton: true, children: <VideoSubscriptions providerFilter={provider.identifier as 'heygen' | 'higgsfield'} returnPath={returnPath ?? ''} canConnect={!!returnPath} connectBlockedMessage={words.invalidReturn} onChanged={reload} /> });
  const api = (provider: HubProviderV1) => modals.openModal({title: [provider.title, words.api].join(' · '), withCloseButton: true,
    children: <VideoProviderSettings inHub providerFilter={provider.identifier as 'heygen' | 'higgsfield'} apiSources={provider.api.connections} />});

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-4 gap-[10px] justify-items-center justify-center">
      {hub.providers.map(p => (
        <div
          key={p.identifier}
          data-integration-provider={p.identifier}
          className="w-full h-full p-[20px] min-h-[100px] text-[14px] bg-newTableHeader rounded-[8px] text-textColor relative flex flex-col gap-[15px]"
        >
          <div>
            {p.api.legacyAvailable && <img
              className="w-[32px] h-[32px]"
              src={`/icons/third-party/${p.identifier}.png`}
              alt=""
            />}
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
          {p.personal && <section className="flex flex-col gap-[8px] border-t border-cf-border pt-[12px]" aria-label={words.personal}>
            <h3 className="cf-label-md">{words.personal}</h3>
            <p className="cf-body-sm text-cf-ink-muted">{words.personalNote}</p>
            <p className="cf-body-sm">{hub.video.connections.some(c => c.provider === p.identifier && ['connected', 'discovery_required'].includes(c.state) && c.workspaceGranted === true) ? access.connected : hub.video.connections.some(c => c.provider === p.identifier && ['connected', 'discovery_required'].includes(c.state) && c.workspaceGranted !== true) ? personalWords.workspaceAccessRequired : hub.video.connections.some(c => c.provider === p.identifier && c.state === 'reauth_required') ? access.reconnect : access.disconnected}</p>
            <Button variant="secondary" onClick={() => personal(p)}>{words.manage}</Button>
          </section>}
          <section className="flex flex-col gap-[8px] border-t border-cf-border pt-[12px]" aria-label={words.api}>
            <h3 className="cf-label-md">{words.api}</h3>
            {!canAdmin && <p className="cf-body-sm text-cf-ink-muted">{words.admin}</p>}
            {p.api.legacyAvailable && <Button variant="secondary" disabled={!canAdmin} onClick={addApiKey(p.title, p.identifier)}>{p.api.videoAvailable ? words.legacyApi : t('add', 'Add')}</Button>}
            {p.api.videoAvailable && <Button variant="secondary" disabled={!canAdmin} onClick={() => api(p)}>{words.videoApi}</Button>}
            {p.api.legacyAvailable && p.api.videoAvailable && <p className="cf-body-sm text-cf-ink-muted">{words.bindingNote}</p>}
          </section>
        </div>
      ))}
    </div>
  );
};
