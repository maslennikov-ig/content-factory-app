'use client';

import { useState, useCallback } from 'react';
import { useSWRConfig } from 'swr';
import { useUser } from '../layout/user.context';
import copy from 'copy-to-clipboard';
import { useToaster } from '@contentfactory/react/toaster/toaster';
import { useVariables } from '@contentfactory/react/helpers/variable.context';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';
import { DocsLink } from '@contentfactory/frontend/components/ui/docs-link';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { useDecisionModal } from '@contentfactory/frontend/components/layout/new-modal';
import { DeveloperComponent } from '@contentfactory/frontend/components/developer/developer.component';
import clsx from 'clsx';
import { Button } from '@contentfactory/react/form/button';
import {
  RadioGroup,
  RadioOption,
} from '@contentfactory/react/choice/radio.group';
import {
  Tab,
  TabList,
  TabPanel,
  Tabs,
} from '@contentfactory/react/choice/tabs';
import { PublicApiSurface } from './public-api.surface';

const mcpClients = [
  'Claude Code',
  'Cursor',
  'VS Code / Copilot',
  'Windsurf',
  'Amp',
  'Codex',
  'Gemini CLI',
  'Warp',
] as const;

type McpClient = (typeof mcpClients)[number];

const getMcpConfig = (
  client: McpClient,
  method: 'header' | 'path',
  mcpBase: string,
  apiKey: string
): { config: string; hint: string } => {
  const urlWithKey = `${mcpBase}/mcp/${apiKey}`;
  const urlBase = `${mcpBase}/mcp`;
  const bearer = `Bearer ${apiKey}`;

  const json = (obj: object) => JSON.stringify(obj, null, 2);

  if (method === 'path') {
    switch (client) {
      case 'Claude Code':
        return {
          config: `claude mcp add content-factory --transport http "${urlWithKey}"`,
          hint: 'Run this command in your terminal.',
        };
      case 'Cursor':
        return {
          config: json({
            mcpServers: { 'content-factory': { url: urlWithKey } },
          }),
          hint: 'Add to .cursor/mcp.json in your project root.',
        };
      case 'VS Code / Copilot':
        return {
          config: json({
            servers: { 'content-factory': { type: 'http', url: urlWithKey } },
          }),
          hint: 'Add to .vscode/mcp.json in your project root.',
        };
      case 'Windsurf':
        return {
          config: json({
            mcpServers: { 'content-factory': { serverUrl: urlWithKey } },
          }),
          hint: 'Add to ~/.codeium/windsurf/mcp_config.json',
        };
      case 'Amp':
        return {
          config: `amp mcp add content-factory ${urlWithKey}`,
          hint: 'Run this command in your terminal.',
        };
      case 'Codex':
        return {
          config: `# ~/.codex/config.toml\n\n[mcp_servers.content-factory]\nurl = "${urlWithKey}"`,
          hint: 'Add to ~/.codex/config.toml',
        };
      case 'Gemini CLI':
        return {
          config: json({
            mcpServers: { 'content-factory': { url: urlWithKey } },
          }),
          hint: 'Add to ~/.gemini/settings.json',
        };
      case 'Warp':
        return {
          config: json({ 'content-factory': { url: urlWithKey } }),
          hint: 'Settings > MCP Servers > + Add, then paste this config.',
        };
    }
  }

  switch (client) {
    case 'Claude Code':
      return {
        config: `claude mcp add --transport http content-factory ${urlBase} --header "Authorization: ${bearer}"`,
        hint: 'Run this command in your terminal.',
      };
    case 'Cursor':
      return {
        config: json({
          mcpServers: {
            'content-factory': {
              url: urlBase,
              headers: { Authorization: bearer },
            },
          },
        }),
        hint: 'Add to .cursor/mcp.json in your project root.',
      };
    case 'VS Code / Copilot':
      return {
        config: json({
          servers: {
            'content-factory': {
              type: 'http',
              url: urlBase,
              headers: { Authorization: bearer },
            },
          },
        }),
        hint: 'Add to .vscode/mcp.json in your project root.',
      };
    case 'Windsurf':
      return {
        config: json({
          mcpServers: {
            'content-factory': {
              serverUrl: urlBase,
              headers: { Authorization: bearer },
            },
          },
        }),
        hint: 'Add to ~/.codeium/windsurf/mcp_config.json',
      };
    case 'Amp':
      return {
        config: json({
          'amp.mcpServers': {
            'content-factory': {
              url: urlBase,
              headers: { Authorization: bearer },
            },
          },
        }),
        hint: 'Add to your Amp settings.json',
      };
    case 'Codex':
      return {
        config: `# ~/.codex/config.toml\n\n[mcp_servers.content-factory]\nurl = "${urlBase}"\nhttp_headers = { "Authorization" = "${bearer}" }`,
        hint: 'Add to ~/.codex/config.toml',
      };
    case 'Gemini CLI':
      return {
        config: json({
          mcpServers: {
            'content-factory': {
              url: urlBase,
              headers: { Authorization: bearer },
            },
          },
        }),
        hint: 'Add to ~/.gemini/settings.json',
      };
    case 'Warp':
      return {
        config: json({
          'content-factory': {
            url: urlBase,
            headers: { Authorization: bearer },
          },
        }),
        hint: 'Settings > MCP Servers > + Add, then paste this config.',
      };
  }
};

const CopyButton = ({ text, label }: { text: string; label: string }) => {
  const toaster = useToaster();
  const t = useT();
  return (
    <Button variant="secondary"
      type="button"
      onClick={() => {
        copy(text);
        toaster.show(
          t('copied_to_clipboard_named', '{{name}} copied to clipboard', {
            name: label,
          }),
          'success'
        );
      }}
 className="cursor-pointer px-[16px] transition-colors rounded-[8px] text-[13px] font-[600] flex items-center"
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
        <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
      </svg>
      {label}
    </Button>
  );
};

const McpSection = ({
  user,
  mcpBase,
}: {
  user: { publicApi: string };
  mcpBase: string;
}) => {
  const t = useT();
  const [activeClient, setActiveClient] = useState<McpClient>('Claude Code');
  const [method, setMethod] = useState<'header' | 'path'>('header');
  const [revealed, setRevealed] = useState(false);

  const { config, hint } = getMcpConfig(
    activeClient,
    method,
    mcpBase,
    user.publicApi
  );

  const remoteUrl = `${mcpBase}/mcp/${user.publicApi}`;
  const cliUrl = `${mcpBase}/mcp`;

  const maskedConfig = revealed
    ? config
    : config.replace(
        new RegExp(user.publicApi.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
        '*'.repeat(user.publicApi.length)
      );

  const maskedRemoteUrl = revealed
    ? remoteUrl
    : remoteUrl.replace(user.publicApi, '*'.repeat(user.publicApi.length));

  return (
    <div className="bg-newBgColorInnerInner rounded-[12px] border border-newBorder overflow-hidden">
      <div className="bg-newBgColorInner px-[20px] py-[14px] border-b border-newBorder flex items-start justify-between gap-[12px]">
        <div>
          <div className="text-[15px] font-[600]">
            {t('mcp_client_configuration', 'MCP Client Configuration')}
          </div>
          <div className="text-[13px] text-customColor18 mt-[2px]">
            {t(
              'connect_your_mcp_client_to_schedule_your_posts_faster',
              'Connect the Content Factory MCP server to your client (Http streaming) to schedule your posts faster.'
            )}
          </div>
        </div>
        <div className="flex gap-[6px] shrink-0 pt-[2px]">
          <DocsLink path="/mcp/introduction" />
        </div>
      </div>
      <div className="p-[20px] flex flex-col gap-[16px]">
        <div className="flex flex-col gap-[6px]">
          <div className="text-[13px] font-[600] text-customColor18">
            {t('auth_method', 'Authentication')}
          </div>
          <RadioGroup
            className="flex gap-[6px]"
            aria-label={t('auth_method', 'Authentication')}
            value={method}
            onChange={(next) => setMethod(next as 'header' | 'path')}
          >
            {(['header', 'path'] as const).map((m) => (
              <RadioOption
                key={m}
                value={m}
                density="dense"
                className={clsx(
                  'cursor-pointer px-[14px] text-[13px] font-[500] rounded-[8px] transition-colors',
                  method === m
                    ? 'bg-cf-accent text-cf-accent-ink'
                    : 'bg-btnSimple text-customColor18 hover:bg-boxHover hover:text-textColor'
                )}
              >
                {m === 'header'
                  ? t('cli_claude_code_codex', 'CLI (Claude Code / Codex)')
                  : t('remote_servers', 'Remote servers (ChatGPT, Claude)')}
              </RadioOption>
            ))}
          </RadioGroup>
        </div>
        {method === 'header' && (
          <div className="flex flex-col gap-[6px]">
            <div className="text-[13px] font-[600] text-customColor18">
              {t('mcp_client', 'Client')}
            </div>
            <RadioGroup
              className="flex flex-wrap gap-[6px]"
              aria-label={t('mcp_client', 'Client')}
              value={activeClient}
              onChange={(next) => setActiveClient(next as McpClient)}
            >
              {mcpClients.map((client) => (
                <RadioOption
                key={client}
                value={client}
                density="dense"
                  className={clsx(
                    'cursor-pointer px-[14px] text-[13px] font-[500] rounded-[8px] transition-colors',
                    activeClient === client
                      ? 'bg-cf-accent text-cf-accent-ink'
                      : 'bg-btnSimple text-customColor18 hover:bg-boxHover hover:text-textColor'
                  )}
                >
                  {client}
                </RadioOption>
              ))}
            </RadioGroup>
          </div>
        )}
        <div className="flex flex-col gap-[8px]">
          <div className="text-[12px] text-customColor18 font-[500]">
            {method === 'header'
              ? hint
              : t(
                  'remote_server_url_hint',
                  'Paste this URL into your remote MCP client (ChatGPT, Claude, etc.).'
                )}
          </div>
          <pre className="bg-newBgColorInner border border-newBorder rounded-[8px] p-[16px] text-[13px] whitespace-pre-wrap break-all overflow-x-auto leading-[1.6]">
            {method === 'header' ? maskedConfig : maskedRemoteUrl}
          </pre>
          <div className="flex gap-[8px]">
            <Button variant="secondary"
              type="button"
              onClick={() => setRevealed(!revealed)}
 className="cursor-pointer px-[16px] transition-colors rounded-[8px] text-[13px] font-[600] flex items-center"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {revealed ? (
                  <>
                    <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" />
                    <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </>
                ) : (
                  <>
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </>
                )}
              </svg>
              {revealed ? t('hide', 'Hide') : t('reveal', 'Reveal')}
            </Button>
            <CopyButton
              text={method === 'header' ? config : remoteUrl}
              label={t('copy', 'Copy')}
            />
            {method === 'header' && (
              <CopyButton text={cliUrl} label={t('copy_url', 'Copy URL')} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const PublicApiContent = () => {
  const user = useUser();
  const { backendUrl, frontEndUrl, mcpUrl } = useVariables();
  const toaster = useToaster();
  const fetch = useFetch();
  const decision = useDecisionModal();
  const { mutate } = useSWRConfig();
  const [reveal, setReveal] = useState(false);
  const t = useT();

  const rotateKey = useCallback(async () => {
    const approved = await decision.open({
      title: t('rotate_api_key', 'Rotate API Key?'),
      description: t(
        'rotate_api_key_description',
        'This will generate a new API key and invalidate the current one. Any integrations using the old key will stop working.'
      ),
      approveLabel: t('rotate', 'Rotate'),
      cancelLabel: t('cancel', 'Cancel'),
    });
    if (!approved) return;
    await fetch('/user/api-key/rotate', { method: 'POST' });
    await mutate('/user/self');
    setReveal(false);
    toaster.show(
      t('api_key_rotated', 'API Key rotated successfully'),
      'success'
    );
  }, [decision, fetch, mutate, toaster]);

  if (!user) {
    return <PublicApiSurface state="loading" />;
  }
  if (!user.publicApi) {
    return <PublicApiSurface state="restricted" />;
  }

  const mcpBase = mcpUrl || backendUrl;

  return (
    <PublicApiSurface state={reveal ? 'selected' : 'default'}>
    <div className="flex flex-col gap-[40px]">
      <div className="text-[14px] text-textColor leading-[1.7]">
        {t(
          'api_auth_note_line1',
          'Use your API Key to automate your own account.'
        )}
        <br />
        {t(
          'api_auth_note_line2',
          'If you are building a product that schedules posts on behalf of other Content Factory users,'
        )}
        <br />
        {t(
          'api_auth_note_line3',
          'create an OAuth App under the "Apps" tab. Your users will authorize your app via OAuth2,'
        )}
        <br />
        {t(
          'api_auth_note_line4',
          'and you will receive a pos_ prefixed token that works with the API, MCP, and CLI — just like an API Key.'
        )}
      </div>
      <div className="bg-newBgColorInnerInner rounded-[12px] border border-newBorder overflow-hidden">
        <div className="bg-newBgColorInner px-[20px] py-[14px] border-b border-newBorder flex items-start justify-between gap-[12px]">
          <div>
            <div className="text-[15px] font-[600]">
              {t('api_key', 'API Key')}
            </div>
            <div className="text-[13px] text-customColor18 mt-[2px]">
              {t(
                'use_the_api_to_integrate_with_your_tools',
                'Use the Content Factory API to integrate with your tools.'
              )}
            </div>
          </div>
          <div className="flex gap-[6px] shrink-0 pt-[2px]">
            <DocsLink path="/public-api" />
            <a
              className="cursor-pointer px-[16px] h-[36px] bg-cf-accent hover:bg-cf-accent-hover text-cf-accent-ink transition-colors rounded-[8px] text-[13px] font-[600] flex items-center gap-[6px]"
              href="https://www.npmjs.com/package/n8n-nodes-postiz" // brand-scan:allow third-party package
              target="_blank"
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
              {t('n8n_node', 'N8N Node')}
            </a>
          </div>
        </div>
        <div className="p-[20px] flex flex-col gap-[16px]">
          <div className="bg-newBgColorInner border border-newBorder rounded-[8px] px-[16px] h-[44px] flex items-center overflow-hidden">
            <code className="text-[14px] flex-1 truncate">
              {reveal ? (
                user.publicApi
              ) : (
                <span className="flex items-center">
                  <span className="blur-sm select-none">
                    {user.publicApi.slice(0, -5)}
                  </span>
                  <span>{user.publicApi.slice(-5)}</span>
                </span>
              )}
            </code>
          </div>
          <div className="flex gap-[8px]">
            <Button variant="secondary"
              type="button"
              onClick={() => setReveal(!reveal)}
 className="cursor-pointer px-[16px] transition-colors rounded-[8px] text-[13px] font-[600] flex items-center"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {reveal ? (
                  <>
                    <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" />
                    <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </>
                ) : (
                  <>
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </>
                )}
              </svg>
              {reveal ? t('hide', 'Hide') : t('reveal', 'Reveal')}
            </Button>
            <CopyButton text={user.publicApi} label={t('copy', 'Copy')} />
            <Button variant="secondary"
              type="button"
              onClick={rotateKey}
 className="cursor-pointer px-[16px] transition-colors rounded-[8px] text-[13px] font-[600] flex items-center"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21.5 2v6h-6" />
                <path d="M21.34 15.57a10 10 0 11-.57-8.38L21.5 8" />
              </svg>
              {t('rotate_key', 'Rotate Key')}
            </Button>
            <Button variant="secondary"
              type="button"
              data-tooltip-id="tooltip"
              data-tooltip-content={t(
                'payload_wizard_description',
                'Building a POST request to /posts can be complex. Use the wizard to schedule a post with the UI, then copy the generated payload.'
              )}
              onClick={() =>
                window.open(`${frontEndUrl}/modal/dark/all`, '_blank')
              }
 className="cursor-pointer px-[16px] transition-colors rounded-[8px] text-[13px] font-[600] flex items-center"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
              {t('open_wizard', 'Open Wizard')}
            </Button>
          </div>
        </div>
      </div>

      <McpSection user={user} mcpBase={mcpBase} />
    </div>
    </PublicApiSurface>
  );
};

export const PublicComponent = () => {
  const t = useT();
  const [subTab, setSubTab] = useState<'api' | 'developer'>('api');

  return (
    <Tabs
      value={subTab}
      onChange={(next) => setSubTab(next as 'api' | 'developer')}
    >
      <div className="flex flex-col gap-[20px]">
        <TabList
          className="flex gap-[6px]"
          aria-label={t('developer_sections', 'Developer sections')}
        >
          {(['api', 'developer'] as const).map((tab) => (
            <Tab
              key={tab}
              value={tab}
              className={clsx(
                'cursor-pointer px-[20px] text-[15px] font-[600] rounded-[8px] transition-colors',
                subTab === tab
                  ? 'bg-cf-accent text-cf-accent-ink'
                  : 'bg-btnSimple text-customColor18 hover:bg-boxHover hover:text-textColor'
              )}
            >
              {tab === 'api' ? t('access', 'Access') : t('apps', 'Apps')}
            </Tab>
          ))}
        </TabList>
        <TabPanel value={subTab}>
          {subTab === 'api' && <PublicApiContent />}
          {subTab === 'developer' && <DeveloperComponent />}
        </TabPanel>
      </div>
    </Tabs>
  );
};
