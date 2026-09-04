'use client';

import React, { FC, FormEvent, useCallback, useState } from 'react';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { Button } from '@contentfactory/react/form/button';
import { Input } from '@contentfactory/react/form/input';
import { useToaster } from '@contentfactory/react/toaster/toaster';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';

/**
 * `content-factory-next-fn33.36`: making a second workspace.
 *
 * One field, because a workspace is only a name at birth — everything else it
 * gets from the person who now administrates it. On success the whole page is
 * reloaded, the same as switching workspaces: the current workspace is decided
 * on the server for every request, and half the screen would otherwise still
 * be showing the old one.
 */
export const CreateOrganization: FC<{ onClose?: () => void }> = ({
  onClose,
}) => {
  const fetch = useFetch();
  const toast = useToaster();
  const t = useT();
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      const trimmed = name.trim();
      if (!trimmed || loading) {
        return;
      }

      setLoading(true);
      const response = await fetch('/user/organizations', {
        method: 'POST',
        body: JSON.stringify({ name: trimmed }),
      });

      if (!response.ok) {
        setLoading(false);
        toast.show(
          t(
            'organization_create_failed',
            'The workspace could not be created, please try again'
          ),
          'warning'
        );
        return;
      }

      onClose?.();
      window.location.reload();
    },
    [name, loading, onClose, t]
  );

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-[16px] w-full max-w-[420px]"
    >
      <Input
        standalone={true}
        autoFocus={true}
        maxLength={120}
        name="organizationName"
        label={t('organization_name', 'Workspace name')}
        placeholder={t('organization_name', 'Workspace name')}
        value={name}
        onChange={(event) => setName(event.target.value)}
        removeError={true}
      />
      <div className="flex justify-end gap-[8px]">
        <Button type="button" variant="secondary" onClick={onClose}>
          {t('cancel', 'Cancel')}
        </Button>
        <Button type="submit" loading={loading} disabled={!name.trim()}>
          {t('create_organization', 'Create workspace')}
        </Button>
      </div>
    </form>
  );
};
