import { TopTitle } from '@contentfactory/frontend/components/launches/helpers/top.title.component';
import React, { FC, useCallback, useState } from 'react';
import { useModals } from '@contentfactory/frontend/components/layout/new-modal';
import { Integration } from '@prisma/client';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { Button } from '@contentfactory/react/form/button';
import { Slider } from '@contentfactory/react/form/slider';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';
import { Select } from '@contentfactory/react/form/select';
import { useToaster } from '@contentfactory/react/toaster/toaster';
import { useVariables } from '@contentfactory/react/helpers/variable.context';
import { isOrganizationEditor } from '@contentfactory/nestjs-libraries/user/organization.roles';
import { useUser } from '@contentfactory/frontend/components/layout/user.context';
import { ChannelWritingProfile } from '@contentfactory/frontend/components/channels/channel-writing-profile';

export const Element: FC<{
  setting: any;
  onChange: (value: any) => void;
}> = (props) => {
  const { setting, onChange } = props;
  const [value, setValue] = useState(setting.value);
  return (
    <div className="flex flex-col gap-[10px]">
      <div>{setting.title}</div>
      <div className="text-[14px]">{setting.description}</div>
      <Slider
        value={value === true ? 'on' : 'off'}
        onChange={() => {
          setValue(!value);
          onChange(!value);
        }}
        fill={true}
      />
    </div>
  );
};
export const SettingsModal: FC<{
  integration: Integration & {
    contentLanguage: 'en' | 'ru';
    customer?: {
      id: string;
      name: string;
    };
  };
  onClose: () => void;
}> = (props) => {
  const fetch = useFetch();
  const t = useT();
  const toaster = useToaster();
  const { onClose, integration } = props;
  const modal = useModals();
  const { language } = useVariables();
  const user = useUser();
  const [values, setValues] = useState(
    JSON.parse(integration?.additionalSettings || '[]')
  );
  const [contentLanguage, setContentLanguage] = useState<'en' | 'ru'>(
    integration.contentLanguage === 'ru' ? 'ru' : 'en'
  );
  const [saving, setSaving] = useState(false);
  const changeValue = useCallback(
    (index: number) => (value: any) => {
      const newValues = [...values];
      newValues[index].value = value;
      setValues(newValues);
    },
    [values]
  );
  const save = useCallback(async () => {
    setSaving(true);
    try {
      const responses = await Promise.all([
        fetch(`/integrations/${integration.id}/settings`, {
          method: 'POST',
          body: JSON.stringify({
            additionalSettings: JSON.stringify(values),
          }),
        }),
        fetch(`/integrations/${integration.id}/content-language`, {
          method: 'PUT',
          body: JSON.stringify({ contentLanguage }),
        }),
      ]);

      // Closing on a rejected save told the author their channel now writes in
      // Russian while autopost kept publishing English. The dialog stays open
      // instead, with the values they entered still in it.
      if (responses.some((response) => !response.ok)) {
        toaster.show(
          t(
            'channel_settings_not_saved',
            'Could not save the channel settings. Please try again.'
          ),
          'warning'
        );
        return;
      }

      modal.closeAll();
      onClose();
    } finally {
      setSaving(false);
    }
  }, [
    contentLanguage,
    fetch,
    integration.id,
    modal,
    onClose,
    t,
    toaster,
    values,
  ]);
  return (
    <div>
      <div className="mt-[16px] flex flex-col gap-[16px]">
        <Select
          disableForm
          name="contentLanguage"
          label={t('content_language', 'Content language')}
          value={contentLanguage}
          onChange={(event) =>
            setContentLanguage(event.target.value === 'ru' ? 'ru' : 'en')
          }
        >
          <option value="en">{t('content_language_en', 'English')}</option>
          <option value="ru">{t('content_language_ru', 'Russian')}</option>
        </Select>
        {values.map((setting: any, index: number) => (
          <Element
            key={setting.title}
            setting={setting}
            onChange={changeValue(index)}
          />
        ))}
      </div>

      <div className="my-[16px] flex gap-[10px]">
        <Button onClick={save} loading={saving}>
          {t('save', 'Save')}
        </Button>
      </div>

      {/*
        Как пишем в канал и его «План» (`97dq.70`): та же панель, что справа
        во вкладке канала у поста, в области канала. Владелец искал режим
        плана здесь, рядом с «Изменить расписание», и не находил.
      */}
      <div data-channel-settings-writing="true" className="mb-[16px] min-w-0">
        <ChannelWritingProfile
          integrationId={integration.id}
          integrationName={integration.name}
          locale={language?.startsWith('ru') ? 'ru' : 'en'}
          canWrite={isOrganizationEditor(user?.role)}
        />
      </div>
    </div>
  );
};
