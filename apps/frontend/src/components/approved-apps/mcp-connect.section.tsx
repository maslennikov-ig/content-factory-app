'use client';

import copy from 'copy-to-clipboard';
import { Button } from '@contentfactory/react/form/button';
import { useToaster } from '@contentfactory/react/toaster/toaster';
import { useVariables } from '@contentfactory/react/helpers/variable.context';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';
import { DocsLink } from '@contentfactory/frontend/components/ui/docs-link';

/**
 * «Подключить Claude или ChatGPT» (`content-factory-next-kcxz.26`, live walk
 * W4 P2-A). It sits in «Одобренные приложения», which every member sees: any
 * member may connect (a USER gets reads only), and their connections are
 * listed right below it with «Отключить». One address, and the person signs in
 * with OAuth — no workspace key in a header or in the address.
 *
 * Drawn only while the instance serves MCP (`mcpEnabled`: `MCP_ENABLED` and
 * its URLs, review W5-26 F7, R5); the address answers 404 otherwise.
 */
export const McpConnectSection = () => {
  const t = useT();
  const toaster = useToaster();
  const { backendUrl, mcpUrl, mcpEnabled } = useVariables();
  if (!mcpEnabled) return null;
  const url = `${(mcpUrl || backendUrl || '').replace(/\/+$/, '')}/mcp`;

  return (
    <section
      data-mcp-connect=""
      className="flex flex-col gap-[16px] rounded-cf-lg border border-cf-border bg-cf-surface p-[20px]"
    >
      <div className="flex items-start justify-between gap-[12px]">
        <div className="flex flex-col gap-[4px]">
          <h3 className="cf-heading-md text-balance">
            {t('mcp_connect_title', 'Connect Claude or ChatGPT')}
          </h3>
          <p className="cf-body-sm max-w-prose text-pretty text-cf-ink-muted">
            {t(
              'mcp_connect_description',
              'Add Content Factory to your assistant as a connector. It signs in with OAuth as you, in this workspace, and can do what your role allows. Deleting, connecting channels, publishing right away and AI keys stay here.'
            )}
          </p>
        </div>
        <DocsLink path="/operations/mcp-connect" />
      </div>
      <div className="flex flex-col gap-[8px]">
        <span className="cf-label-md">{t('mcp_server_url', 'Server URL')}</span>
        <code className="cf-label-sm break-all rounded-cf border border-cf-border bg-cf-surface-subtle px-[12px] py-[8px]">
          {url}
        </code>
        <div className="flex gap-[8px]">
          <Button
            variant="secondary"
            type="button"
            onClick={() => {
              copy(url);
              toaster.show(
                t('copied_to_clipboard_named', '{{name}} copied to clipboard', {
                  name: t('mcp_server_url', 'Server URL'),
                }),
                'success'
              );
            }}
          >
            {t('copy_url', 'Copy URL')}
          </Button>
        </div>
      </div>
      <ol className="cf-body-sm flex list-decimal flex-col gap-[4px] ps-[20px] text-cf-ink-muted">
        <li>
          {t(
            'mcp_connect_step_claude',
            'Claude: Settings → Connectors → Add custom connector, then paste the URL.'
          )}
        </li>
        <li>
          {t(
            'mcp_connect_step_chatgpt',
            'ChatGPT: turn on developer mode, create a connector, paste the URL and choose OAuth.'
          )}
        </li>
        <li>
          {t(
            'mcp_connect_step_allow',
            'Sign in and choose Allow on the Content Factory page that opens. The connection then appears below; «Disconnect» closes it.'
          )}
        </li>
      </ol>
    </section>
  );
};
