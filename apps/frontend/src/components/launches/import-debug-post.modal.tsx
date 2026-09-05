'use client';

import { FC, useCallback, useMemo, useState } from 'react';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { useToaster } from '@contentfactory/react/toaster/toaster';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';
import { Button } from '@contentfactory/react/form/button';
import { Textarea } from '@contentfactory/react/form/textarea';
import { useIntegrationList } from '@contentfactory/frontend/components/launches/helpers/use.integration.list';
import { useSWRConfig } from 'swr';
import clsx from 'clsx';
import { ChannelMark } from '@contentfactory/frontend/components/ui/brand/channel-mark';
import { PlatformBadge } from '@contentfactory/react/platform/platform.badge';
import { postSaveErrorMessage } from '@contentfactory/frontend/components/new-launch/post-save-error';

interface DebugPostData {
  type: string;
  date: string;
  shortLink: boolean;
  tags: Array<{ value: string; label: string }>;
  posts: Array<{
    integration: { id: string };
    group: string;
    settings: { __type: string; [key: string]: any };
    value: Array<{
      content: string;
      image: Array<{
        id: string;
        path: string;
        alt?: string;
        thumbnail?: string;
      }>;
      delay: number;
    }>;
  }>;
  _debug: {
    providerIdentifier: string;
    providerName: string;
    state: string;
    error: string | null;
    errors: Array<{
      message: string;
      platform: string;
      body: string;
      createdAt: string;
    }>;
    originalGroup: string;
    originalPublishDate: string;
    exportedAt: string;
  };
}

export const ImportDebugPostModal: FC<{ close: () => void }> = ({ close }) => {
  const fetch = useFetch();
  const toaster = useToaster();
  const t = useT();
  const [jsonInput, setJsonInput] = useState('');
  const [parsed, setParsed] = useState<DebugPostData | null>(null);
  const [parseError, setParseError] = useState('');
  const [selectedIntegrationId, setSelectedIntegrationId] = useState('');
  const [importing, setImporting] = useState(false);
  const { data: integrations } = useIntegrationList();
  const { mutate } = useSWRConfig();

  const handleJsonChange = useCallback((value: string) => {
    setJsonInput(value);
    setParseError('');
    setParsed(null);
    setSelectedIntegrationId('');

    if (!value.trim()) return;

    try {
      const data = JSON.parse(value);
      if (!data.posts || !data._debug?.providerIdentifier) {
        setParseError(
          'Invalid debug JSON format. Missing posts or _debug data.'
        );
        return;
      }
      setParsed(data);
    } catch {
      setParseError('Invalid JSON');
    }
  }, []);

  const matchingIntegrations = useMemo((): any[] => {
    if (!parsed || !integrations?.length) return [];
    return integrations.filter(
      (i: any) => i.identifier === parsed._debug.providerIdentifier
    );
  }, [parsed, integrations]);

  const handleImport = useCallback(async () => {
    if (!parsed || !selectedIntegrationId) return;

    setImporting(true);
    try {
      const { _debug, ...payload } = parsed;
      const importPayload = {
        ...payload,
        type: 'draft',
        date: new Date().toISOString(),
        tags: [] as { value: string; label: string }[],
        posts: payload.posts.map((post) => ({
          ...post,
          integration: { id: selectedIntegrationId },
        })),
      };

      const response = await fetch('/posts', {
        method: 'POST',
        body: JSON.stringify(importPayload),
      });

      // Ответ не читался, и окно закрывалось одинаково после успеха и после
      // отказа — та же поломка, что в окне поста до `content-factory-next-
      // fn33.49`. Текст берётся тем же помощником, чтобы причина отказа
      // звучала одинаково в обоих окнах (`content-factory-next-fn33.81`).
      if (!response.ok) {
        const refusal = await postSaveErrorMessage(response, t);
        if (refusal) {
          toaster.show(refusal, 'warning');
        }
        return; // `finally` ниже снимает загрузку, окно остаётся открытым
      }

      await mutate(
        (key: string) =>
          typeof key === 'string' &&
          (key.startsWith('/posts-') || key.startsWith('/posts-list-')),
        undefined,
        { revalidate: true }
      );

      toaster.show(
        t('debug_post_imported', 'Post imported as draft successfully'),
        'success'
      );
      close();
    } catch {
      toaster.show(
        t('debug_post_import_failed', 'Failed to import post'),
        'warning'
      );
    } finally {
      setImporting(false);
    }
  }, [parsed, selectedIntegrationId, fetch, toaster, t, close, mutate]);

  return (
    <div className="flex flex-col gap-[16px] min-w-[500px]">
      <Textarea standalone
        layout="content"
        className="w-full p-[12px] rounded-[8px] bg-input border border-tableBorder text-textColor font-mono text-[13px] resize-y"
        placeholder={t(
          'paste_debug_json',
          'Paste the debug JSON copied from a failed post...'
        )}
        value={jsonInput}
        onChange={(e) => handleJsonChange(e.target.value)}
      />

      {parseError && (
        <div className="text-red-500 text-[13px]">{parseError}</div>
      )}

      {parsed && (
        <div className="flex flex-col gap-[12px]">
          <div className="flex flex-col gap-[8px] p-[12px] rounded-[8px] bg-input border border-tableBorder">
            <div className="text-[13px] font-[600] text-textColor">
              {t('debug_info', 'Debug Info')}
            </div>
            <div className="text-[12px] text-textColor/70 flex flex-col gap-[4px] min-w-0 break-all">
              <div>
                <span className="font-[500]">{t('provider', 'Provider')}:</span>{' '}
                {parsed._debug.providerIdentifier} ({parsed._debug.providerName}
                )
              </div>
              <div>
                <span className="font-[500]">{t('state', 'State')}:</span>{' '}
                <span
                  className={
                    parsed._debug.state === 'ERROR' ? 'text-red-500' : ''
                  }
                >
                  {parsed._debug.state}
                </span>
              </div>
              {parsed._debug.error && (
                <div>
                  <span className="font-[500]">{t('error', 'Error')}:</span>{' '}
                  <span className="text-red-400">{parsed._debug.error}</span>
                </div>
              )}
              {parsed._debug.errors?.length > 0 && (
                <div className="mt-[4px]">
                  <span className="font-[500]">
                    {t('error_details', 'Error Details')}:
                  </span>
                  <div className="mt-[4px] max-h-[100px] overflow-y-auto bg-newBgColor p-[8px] rounded-[4px] text-[11px] font-mono break-all whitespace-pre-wrap">
                    {parsed._debug.errors.map((err, i) => (
                      <div key={i} className="mb-[4px]">
                        [{err.platform}] {err.message}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <span className="font-[500]">
                  {t('original_date', 'Original Date')}:
                </span>{' '}
                {new Date(parsed._debug.originalPublishDate).toLocaleString()}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-[8px]">
            <div className="text-[13px] font-[600] text-textColor">
              {t('select_local_integration', 'Select Local Integration')}
              <span className="text-[12px] font-[400] text-textColor/60 ml-[8px]">
                ({parsed._debug.providerIdentifier})
              </span>
            </div>

            {matchingIntegrations.length === 0 ? (
              <div className="text-[13px] text-red-400">
                {t(
                  'no_matching_integrations',
                  `No ${parsed._debug.providerIdentifier} integrations found. Add one first.`
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-[6px]">
                {matchingIntegrations.map((integration) => (
                  <div
                    key={integration.id}
                    className={clsx(
                      'flex items-center gap-[10px] p-[10px] rounded-[8px] border cursor-pointer transition-all',
                      selectedIntegrationId === integration.id
                        ? 'border-cf-accent bg-cf-accent-soft'
                        : 'border-tableBorder hover:border-textColor/30'
                    )}
                    onClick={() => setSelectedIntegrationId(integration.id)}
                  >
                    {integration.picture ? (
                      <img
                        src={integration.picture}
                        className="w-[24px] h-[24px] rounded-[6px]"
                        alt={integration.name}
                      />
                    ) : (
                      <ChannelMark name={integration.name} size={24} />
                    )}
                    <div className="text-[13px] text-textColor">
                      {integration.name}
                    </div>
                    <PlatformBadge
                      identifier={integration.identifier}
                      size={16}
                      className="ml-auto"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          <Button
            onClick={handleImport}
            loading={importing}
            disabled={!selectedIntegrationId}
            className="rounded-[4px]"
          >
            {t('import_as_draft', 'Import as Draft')}
          </Button>
        </div>
      )}
    </div>
  );
};
