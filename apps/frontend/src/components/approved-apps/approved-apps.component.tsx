'use client';

import { FC, Fragment, useCallback } from 'react';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import useSWR from 'swr';
import { Button } from '@contentfactory/react/form/button';
import { useToaster } from '@contentfactory/react/toaster/toaster';
import { deleteDialog } from '@contentfactory/react/helpers/delete.dialog';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';
import { McpConnectSection } from './mcp-connect.section';

const useApprovedApps = () => {
  const fetch = useFetch();
  const load = useCallback(async () => {
    return (await fetch('/user/approved-apps')).json();
  }, []);
  // Re-read when the tab or window comes back (walk review F4): an assistant
  // connected in another tab — the consent page it opened — shows up here
  // without a reload, as the MCP block's step 3 promises.
  return useSWR('approved-apps', load, {
    revalidateOnFocus: true,
    revalidateOnReconnect: false,
    revalidateIfStale: true,
  });
};

export const ApprovedAppsComponent: FC = () => {
  const fetch = useFetch();
  const toaster = useToaster();
  const t = useT();
  const { data: apps, mutate } = useApprovedApps();

  const revokeApp = useCallback(
    (app: any) => async () => {
      if (
        await deleteDialog(
          // One word for it, on the button and in the dialog (walk recheck
          // P3-a): «Отключить».
          t(
            'approved_app_disconnect_confirm',
            'Disconnect {{name}}? It will lose access to your account.',
            {
              name: app.oauthApp?.name,
              interpolation: { escapeValue: false },
            }
          ),
          t('mcp_disconnect', 'Disconnect')
        )
      ) {
        try {
          await fetch(`/user/approved-apps/${app.id}`, {
            method: 'DELETE',
          });
          toaster.show(
            t('approved_app_disconnected', 'Disconnected'),
            'success'
          );
          mutate();
        } catch {
          toaster.show(
            t('approved_app_disconnect_failed', 'Could not disconnect'),
            'warning'
          );
        }
      }
    },
    []
  );

  if (apps === undefined) {
    return null;
  }

  return (
    <div className="flex flex-col gap-[20px]">
      <McpConnectSection />
      <div className="flex flex-col">
        <h3 className="text-[20px]">
          {t('approved_apps', 'Approved Apps')}
        </h3>
        <div className="text-customColor18 mt-[4px]">
          {t(
            'apps_you_have_authorized',
            'Applications you have authorized to access your Content Factory account.'
          )}
        </div>
      </div>

      <div className="bg-sixth border-fifth border rounded-[4px] p-[24px]">
        {!apps?.length ? (
          <div className="text-customColor18">
            {t('no_approved_apps', 'No approved apps yet.')}
          </div>
        ) : (
          <div className="flex flex-col gap-[16px]">
            {apps.map((app: any) => (
              <div
                key={app.id}
                className="flex items-center justify-between p-[12px] border border-fifth rounded-[4px]"
              >
                <div className="flex items-center gap-[12px]">
                  {app.oauthApp?.picture?.path ? (
                    <img
                      src={app.oauthApp.picture.path}
                      alt={app.oauthApp.name}
                      className="w-[40px] h-[40px] rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-[40px] h-[40px] rounded-full bg-fifth flex items-center justify-center text-customColor18">
                      {app.oauthApp?.name?.[0]?.toUpperCase() || '?'}
                    </div>
                  )}
                  <div>
                    <div className="text-[14px] font-bold">
                      {app.oauthApp?.name}
                    </div>
                    {app.oauthApp?.description && (
                      <div className="text-customColor18 text-[12px]">
                        {app.oauthApp.description}
                      </div>
                    )}
                    <div className="text-customColor18 text-[12px]">
                      {t('authorized_on', 'Authorized on')}{' '}
                      {new Date(app.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>
                <Button onClick={revokeApp(app)}>
                  {/* One word for every approved app, button and dialog
                      alike (kcxz.26; walk recheck P3-a). */}
                  {t('mcp_disconnect', 'Disconnect')}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
