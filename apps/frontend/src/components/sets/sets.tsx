'use client';
import 'reflect-metadata';

import React, {
  FC,
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import useSWR from 'swr';
import { useUser } from '@contentfactory/frontend/components/layout/user.context';
import { Button } from '@contentfactory/react/form/button';
import { Input } from '@contentfactory/react/form/input';
import { useToaster } from '@contentfactory/react/toaster/toaster';
import clsx from 'clsx';
import { deleteDialog } from '@contentfactory/react/helpers/delete.dialog';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';
import { newDayjs } from '@contentfactory/frontend/components/layout/set.timezone';
import { useModals } from '@contentfactory/frontend/components/layout/new-modal';

type SetToOpen = { id?: string; name?: string; content?: string };
type SetEditor =
  typeof import('@contentfactory/frontend/components/new-launch/add.edit.modal').AddEditModal;
let setEditorImport: Promise<SetEditor> | undefined;

const loadSetEditor = () => {
  if (!setEditorImport) {
    setEditorImport = import('@contentfactory/frontend/components/new-launch/add.edit.modal')
      .then(({ AddEditModal }) => AddEditModal)
      .catch((error) => {
        setEditorImport = undefined;
        throw error;
      });
  }
  return setEditorImport;
};

const SaveSetModal: FC<{
  postData: any;
  initialValue?: string;
  onSave: (name: string) => void;
  onCancel: () => void;
}> = ({ postData, onSave, onCancel, initialValue }) => {
  const [name, setName] = useState(initialValue);
  const t = useT();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onSave(name.trim());
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <Input
          label={t('label_set_name', 'Set Name')}
          translationKey="label_set_name"
          name="setName"
          value={name}
          disableForm={true}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('sets_name_placeholder', 'Enter a name for this set')}
          autoFocus
        />
      </div>
      <div className="flex gap-2 justify-end">
        <Button type="button" secondary onClick={onCancel}>
          {t('cancel', 'Cancel')}
        </Button>
        <Button type="submit" disabled={!name.trim()}>
          {t('save', 'Save')}
        </Button>
      </div>
    </form>
  );
};

export const Sets: FC = () => {
  const fetch = useFetch();
  const user = useUser();
  const modal = useModals();
  const toaster = useToaster();
  const t = useT();
  const mounted = useRef(true);
  const opening = useRef(false);
  const openSequence = useRef(0);
  const pendingSet = useRef<SetToOpen | undefined>(undefined);
  const [editorLoad, setEditorLoad] = useState<{
    status: 'idle' | 'loading' | 'failed';
    setId?: string;
  }>({ status: 'idle' });

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      openSequence.current += 1;
      opening.current = false;
      pendingSet.current = undefined;
    };
  }, []);

  const cancelEditorOpen = useCallback(() => {
    openSequence.current += 1;
    opening.current = false;
    pendingSet.current = undefined;
    setEditorLoad({ status: 'idle' });
  }, []);

  const load = useCallback(async (path: string) => {
    return (await (await fetch(path)).json()).integrations;
  }, []);

  const { isLoading, data: integrations } = useSWR('/integrations/list', load, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
    revalidateOnMount: true,
    refreshWhenHidden: false,
    refreshWhenOffline: false,
    fallbackData: [],
  });

  const list = useCallback(async () => {
    return (await fetch('/sets')).json();
  }, []);

  const { data, mutate } = useSWR('sets', list, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
    revalidateOnMount: true,
    refreshWhenHidden: false,
    refreshWhenOffline: false,
  });

  const addSet = useCallback(
    (selectedSet?: SetToOpen) => async () => {
      if (opening.current) return;
      opening.current = true;
      const params = selectedSet ? { ...selectedSet } : undefined;
      const date = newDayjs();
      const sequence = ++openSequence.current;
      pendingSet.current = params;
      setEditorLoad({ status: 'loading', setId: params?.id });

      let AddEditModal: SetEditor;
      try {
        AddEditModal = await loadSetEditor();
      } catch {
        if (mounted.current && sequence === openSequence.current) {
          opening.current = false;
          setEditorLoad({ status: 'failed', setId: params?.id });
        }
        return;
      }
      if (!mounted.current || sequence !== openSequence.current) return;
      opening.current = false;
      pendingSet.current = undefined;
      setEditorLoad({ status: 'idle' });

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
            allIntegrations={integrations.map((p: any) => ({
              ...p,
            }))}
            {...(params?.id ? { set: JSON.parse(params.content) } : {})}
            addEditSets={(data) => {
              modal.openModal({
                title: t('save_as_set', 'Save as Set'),
                children: (
                  <SaveSetModal
                    initialValue={params?.name || ''}
                    postData={data}
                    onSave={async (name: string) => {
                      try {
                        await fetch('/sets', {
                          method: 'POST',
                          body: JSON.stringify({
                            ...(params?.id ? { id: params.id } : {}),
                            name,
                            content: JSON.stringify(data),
                          }),
                        });
                        modal.closeAll();
                        mutate();
                        toaster.show(
                          t('set_saved_successfully', 'Set saved successfully'),
                          'success'
                        );
                      } catch (error) {
                        toaster.show(
                          t('set_save_failed', 'Failed to save set'),
                          'warning'
                        );
                      }
                    }}
                    onCancel={() => modal.closeAll()}
                  />
                ),
              });
            }}
            reopenModal={() => {}}
            mutate={() => {}}
            integrations={integrations}
            date={date}
          />
        ),
        title: ``,
      });
    },
    [integrations, modal, fetch, mutate, toaster, t]
  );

  const deleteSet = useCallback(
    (data: any) => async () => {
      if (
        await deleteDialog(
          t(
            'delete_named_set_confirmation',
            'Are you sure you want to delete {{name}}?',
            { name: data.name }
          )
        )
      ) {
        await fetch(`/sets/${data.id}`, {
          method: 'DELETE',
        });
        mutate();
        toaster.show(
          t('set_deleted_successfully', 'Set deleted successfully'),
          'success'
        );
      }
    },
    []
  );

  return (
    <div className="flex flex-col">
      <h3 className="text-[20px]">
        {t('sets', 'Sets')} ({data?.length || 0})
      </h3>
      <div className="text-customColor18 mt-[4px]">
        {t(
          'manage_content_sets_description',
          'Manage your content sets for easy reuse across posts.'
        )}
      </div>
      <div className="my-[16px] mt-[16px] bg-sixth border-fifth items-center border rounded-[4px] p-[24px] flex gap-[24px]">
        <div className="flex flex-col w-full">
          {editorLoad.status === 'loading' && (
            <div className="mb-4 flex items-center gap-2">
              <p role="status" className="cf-body-sm text-cf-ink-muted">
                {t('loading', 'Loading')}
              </p>
              <Button variant="quiet" onClick={cancelEditorOpen}>
                {t('cancel', 'Cancel')}
              </Button>
            </div>
          )}
          {editorLoad.status === 'failed' && (
            <div className="mb-4 flex items-center gap-2">
              <p role="alert" className="cf-body-sm text-cf-ink">
                {t('error_occurred', 'An error occurred. Please try again.')}
              </p>
              <Button onClick={addSet(pendingSet.current)}>
                {t('try_again', 'Try Again')}
              </Button>
            </div>
          )}
          {!!data?.length && (
            <div className="grid grid-cols-[2fr,1fr,1fr] w-full gap-y-[10px]">
              <div>{t('name', 'Name')}</div>
              <div>{t('edit', 'Edit')}</div>
              <div>{t('delete', 'Delete')}</div>
              {data?.map((p: any) => (
                <Fragment key={p.id}>
                  <div className="flex flex-col justify-center">{p.name}</div>
                  <div className="flex flex-col justify-center">
                    <div>
                      <Button
                        onClick={addSet(p)}
                        disabled={editorLoad.status === 'loading'}
                        loading={
                          editorLoad.status === 'loading' &&
                          editorLoad.setId === p.id
                        }
                        loadingLabel={t('loading', 'Loading')}
                      >
                        {t('edit', 'Edit')}
                      </Button>
                    </div>
                  </div>
                  <div className="flex flex-col justify-center">
                    <div>
                      <Button onClick={deleteSet(p)}>
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
              onClick={addSet()}
              disabled={editorLoad.status === 'loading'}
              loading={editorLoad.status === 'loading' && !editorLoad.setId}
              loadingLabel={t('loading', 'Loading')}
              className={clsx((data?.length || 0) > 0 && 'my-[16px]')}
            >
              {t('add_set', 'Add set')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
