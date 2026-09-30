'use client';

import { useState, type ReactNode } from 'react';
import copy from 'copy-to-clipboard';
import { Button } from '@contentfactory/react/form/button';
import { useToaster } from '@contentfactory/react/toaster/toaster';
import { useVariables } from '@contentfactory/react/helpers/variable.context';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';
import { DocsLink } from '@contentfactory/frontend/components/ui/docs-link';
import { Segmented } from '@contentfactory/frontend/components/ui/segmented';

type Assistant = 'claude' | 'chatgpt';

/** A menu path quoted inline — «Settings → Apps → Advanced settings» — reads
 * as a literal UI label rather than as prose, so it keeps its own mono chip
 * regardless of the sentence's language. */
const PathChip = ({ children }: { children: ReactNode }) => (
  <span className="cf-caption box-decoration-clone rounded-[4px] sm:whitespace-nowrap bg-cf-surface-subtle px-[8px] py-[4px] text-cf-ink">
    {children}
  </span>
);

/**
 * A translated sentence with one inline `PathChip` in it.
 *
 * `useT()` only substitutes plain strings (`{{name}}` → `String(value)`), so a
 * component can never travel through it — the fallback carries a literal
 * `%PATH%` marker instead, split back apart here once translation has run.
 */
const withPathChip = (sentence: string, chip: ReactNode) => {
  const [before, after] = sentence.split('%PATH%');
  return (
    <>
      {before}
      <PathChip>{chip}</PathChip>
      {after}
    </>
  );
};

const StepRow = ({
  index,
  title,
  children,
}: {
  index: number;
  title: string;
  children: ReactNode;
}) => (
  <div className="grid grid-cols-[36px_minmax(0,1fr)] items-start gap-[12px]">
    <div className="cf-label-sm pt-px text-cf-signature">
      {String(index).padStart(2, '0')}
    </div>
    <div className="flex flex-col gap-[4px]">
      <div className="cf-label-md text-cf-ink">{title}</div>
      <div className="cf-body-sm text-pretty text-cf-ink-muted">{children}</div>
    </div>
  </div>
);

/**
 * «Подключить Claude или ChatGPT» (`content-factory-next-kcxz.26`, live walk
 * W4 P2-A). It sits in «Одобренные приложения», which every member sees: any
 * member may connect (a USER gets reads only), and their connections are
 * listed right below it with «Отключить». One address, and the person signs in
 * with OAuth — no workspace key in a header or in the address.
 *
 * Drawn only while the instance serves MCP (`mcpEnabled`: `MCP_ENABLED` and
 * its URLs, review W5-26 F7, R5); the address answers 404 otherwise.
 *
 * The steps used to sit in one shared numbered list, Claude and ChatGPT
 * interleaved, and read as one mixed scenario (owner, live walk 30.09.2026,
 * `content-factory-next-kcxz.54`). `Segmented` — the existing cheap, reversible
 * switch (`components/ui/segmented`), the same one the intake screen uses for
 * its own three-way choice — now picks which assistant's steps show; the
 * server address stays shared above it, read once regardless of the choice.
 *
 * ChatGPT's steps also follow OpenAI's current help article rather than the
 * stale ones (`kcxz.53`): Developer mode moved to Settings → Apps → Advanced
 * settings, and on Plus/Pro it only reads — creating or changing anything
 * needs a Business, Enterprise or Edu workspace. Said once, as a plain note
 * rather than folded into a step: it is a limit on what ChatGPT can do here,
 * not an action to take. The note is styled as information (`cf-info-soft`),
 * not as a warning — nothing has gone wrong.
 */
export const McpConnectSection = () => {
  const t = useT();
  const toaster = useToaster();
  const { backendUrl, mcpUrl, mcpEnabled } = useVariables();
  const [assistant, setAssistant] = useState<Assistant>('claude');
  if (!mcpEnabled) return null;
  const url = `${(mcpUrl || backendUrl || '').replace(/\/+$/, '')}/mcp`;

  return (
    <section
      data-mcp-connect=""
      className="flex flex-col gap-[20px] rounded-cf-lg border border-cf-border bg-cf-surface p-[16px] sm:p-[20px]"
    >
      <div className="flex items-start justify-between gap-[12px]">
        <div className="flex flex-col gap-[4px]">
          <h3 className="cf-heading-md text-balance">
            {t('mcp_connect_title', 'Connect Claude or ChatGPT')}
          </h3>
          <p className="cf-body-sm max-w-prose text-pretty text-cf-ink-muted">
            {t(
              'mcp_connect_description',
              'The assistant signs in as you, in this workspace. Deleting, channels, publishing right away and AI keys stay here.'
            )}
          </p>
        </div>
        <DocsLink path="/operations/mcp-connect" />
      </div>

      <div className="flex flex-col gap-[8px]">
        <span className="cf-label-sm text-cf-ink-muted">
          {t('mcp_server_url', 'Server URL')}
        </span>
        <div className="flex flex-col items-stretch gap-[8px] sm:flex-row">
          <code className="flex min-h-[40px] min-w-0 flex-1 items-center break-all rounded-cf border border-cf-border bg-cf-surface-subtle px-[12px] py-[8px] cf-label-sm">
            {url}
          </code>
          <Button
            variant="secondary"
            type="button"
            className="w-full sm:w-auto"
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
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="shrink-0"
              aria-hidden="true"
            >
              <rect x="9" y="9" width="11" height="11" rx="2" />
              <path d="M5 15V6a2 2 0 0 1 2-2h9" />
            </svg>
            {t('copy_url', 'Copy')}
          </Button>
        </div>
      </div>

      <div className="h-px bg-cf-border" />

      <div className="flex flex-col gap-[16px]">
        <Segmented
          label={t(
            'mcp_connect_assistant_switch_label',
            'Which assistant you are connecting'
          )}
          value={assistant}
          onChange={setAssistant}
          className="w-full sm:w-auto"
          options={[
            { value: 'claude', label: t('mcp_connect_assistant_claude', 'Claude') },
            { value: 'chatgpt', label: t('mcp_connect_assistant_chatgpt', 'ChatGPT') },
          ]}
        />

        {assistant === 'claude' ? (
          <div className="flex flex-col gap-[12px]">
            <StepRow index={1} title={t('mcp_connect_claude_1_title', 'Add a connector')}>
              {withPathChip(
                t(
                  'mcp_connect_claude_1_body',
                  'In claude.ai: %PATH%. Name it Content Factory, address is the one copied above.'
                ),
                t(
                  'mcp_connect_menu_claude_connectors',
                  'Settings → Connectors → Add custom connector'
                )
              )}
            </StepRow>
            <StepRow
              index={2}
              title={t('mcp_connect_claude_2_title', 'Press “Connect”')}
            >
              {t(
                'mcp_connect_claude_2_body',
                'The Content Factory page opens. Check the workspace and choose Allow.'
              )}
            </StepRow>
            <StepRow
              index={3}
              title={t('mcp_connect_claude_3_title', 'Turn it on in chat')}
            >
              {t(
                'mcp_connect_claude_3_body',
                'In a new chat, open the tools menu by the composer and turn Content Factory on.'
              )}
            </StepRow>
          </div>
        ) : (
          <div className="flex flex-col gap-[12px]">
            <StepRow
              index={1}
              title={t('mcp_connect_chatgpt_1_title', 'Turn on Developer mode')}
            >
              {withPathChip(
                t('mcp_connect_chatgpt_1_body', 'In ChatGPT on the web: %PATH%.'),
                t(
                  'mcp_connect_menu_chatgpt_developer',
                  'Settings → Apps → Advanced settings → Developer mode'
                )
              )}
            </StepRow>
            <StepRow index={2} title={t('mcp_connect_chatgpt_2_title', 'Create an app')}>
              {withPathChip(
                t(
                  'mcp_connect_chatgpt_2_body',
                  '%PATH%: name it Content Factory, address is the one copied above, sign-in is OAuth.'
                ),
                t('mcp_connect_menu_chatgpt_create', 'Apps → Create')
              )}
            </StepRow>
            <StepRow index={3} title={t('mcp_connect_chatgpt_3_title', 'Allow access')}>
              {t(
                'mcp_connect_chatgpt_3_body',
                'On the Content Factory page that opens, choose Allow.'
              )}
            </StepRow>
            <div className="grid grid-cols-[16px_minmax(0,1fr)] items-start gap-[8px] rounded-cf bg-cf-info-soft p-[12px] text-cf-ink">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="mt-px shrink-0 text-cf-info"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="9" />
                <path d="M12 11v5" />
                <path d="M12 8h.01" />
              </svg>
              <p className="cf-body-sm text-pretty">
                <span className="cf-label-md">
                  {t(
                    'mcp_connect_chatgpt_readonly_lead',
                    'On Plus and Pro, ChatGPT can only read here'
                  )}
                </span>{' '}
                {t(
                  'mcp_connect_chatgpt_readonly_rest',
                  '— drafts, the plan, channels. Creating and scheduling needs Claude, or Business, Enterprise or Edu.'
                )}
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-[8px] cf-body-sm text-cf-ink-muted">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="shrink-0 text-cf-accent"
          aria-hidden="true"
        >
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
        <span>
          {t(
            'mcp_connect_footer_note',
            'The connection then appears below; «Disconnect» closes it.'
          )}
        </span>
      </div>
    </section>
  );
};
