'use client';

import { useCallback, useId, useState } from 'react';
import useSWR from 'swr';
import { Button } from '@contentfactory/react/form/button';
import { Input } from '@contentfactory/react/form/input';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { useUser } from '@contentfactory/frontend/components/layout/user.context';
import { isOrganizationAdmin } from '@contentfactory/nestjs-libraries/user/organization.roles';
import {
  buildTypedKeyPayload,
  type StoredAiSettings,
} from '@contentfactory/frontend/components/settings/ai-provider.component';
import type { AgentSecretField } from './agent.contract';
import type { AgentWords } from './agent.copy';
import { AgentCard, OpenOnScreen } from './agent.cards';

/**
 * «Ключ» (spec §1.5, §6.2): the key is typed here and posted straight to the
 * AI settings door, the one the settings screen saves through. It never
 * enters the chat — not a message, not the memory, not a trace or a log —
 * and the field forgets it as soon as the door answers.
 *
 * The settings door is the administrator's. Anyone else reads who enters the
 * key instead of a field that would be refused.
 */

/** The settings screen's own cache key, so both read one answer. */
const AI_SETTINGS_KEY = 'ai-provider';
const AI_SETTINGS_DOOR = '/settings/ai';

type Stored = StoredAiSettings & {
  hasKey?: boolean;
  searchKeys?: Partial<Record<'tavily' | 'exa' | 'openrouter', boolean>>;
};

const ENGINE_NAME = { tavily: 'Tavily', exa: 'Exa' } as const;

export function SecretCard({
  secret,
  onContinue,
  words,
}: {
  secret: AgentSecretField;
  /** Say to the agent that the key is in place, in words, never the key. */
  onContinue: (text: string) => void;
  words: AgentWords;
}) {
  const w = words.secret;
  const user = useUser();
  const admin = isOrganizationAdmin(user?.role);
  const request = useFetch();
  const formId = useId();

  const settings = useSWR<Stored>(
    admin ? AI_SETTINGS_KEY : null,
    async () => (await request(AI_SETTINGS_DOOR)).json(),
    { revalidateOnFocus: false, revalidateIfStale: false }
  );

  const [key, setKey] = useState('');
  const [state, setState] = useState<
    'idle' | 'saving' | 'saved' | 'failed' | 'dismissed'
  >('idle');

  const stored =
    secret.field === 'workspace-key'
      ? settings.data?.hasKey === true
      : settings.data?.searchKeys?.[secret.engine] === true;

  const title =
    secret.field === 'workspace-key'
      ? w.workspaceTitle
      : w.searchTitle(ENGINE_NAME[secret.engine]);

  const save = useCallback(async () => {
    const typed = key.trim();
    if (!typed || !settings.data) return;
    setState('saving');
    try {
      const response = await request(AI_SETTINGS_DOOR, {
        method: 'POST',
        body: JSON.stringify(
          buildTypedKeyPayload(
            settings.data,
            secret.field === 'workspace-key'
              ? { field: 'workspace-key', key: typed }
              : { field: 'search-key', engine: secret.engine, key: typed }
          )
        ),
      });
      if (!response.ok) throw new Error(String(response.status));
      setKey('');
      setState('saved');
      await settings.mutate();
    } catch {
      setState('failed');
    }
  }, [key, request, secret, settings]);

  if (state === 'dismissed') {
    return (
      <p data-agent-card="secret" className="cf-caption text-cf-ink-muted">
        {w.dismissed}
      </p>
    );
  }

  return (
    <AgentCard
      cardKind="secret"
      glyph="lock"
      kind={w.kind}
      title={title}
      label={`${w.kind}: ${title}`}
      aside={<OpenOnScreen href="/settings" words={words} />}
      footer={
        !admin ? undefined : state === 'saved' ? (
          <Button
            type="button"
            density="dense"
            onClick={() => onContinue(w.continueText)}
          >
            {w.continue}
          </Button>
        ) : (
          <>
            <Button
              type="submit"
              form={formId}
              density="dense"
              disabled={!key.trim() || !settings.data}
              loading={state === 'saving'}
              loadingLabel={w.saving}
            >
              {w.save}
            </Button>
            <Button
              type="button"
              density="dense"
              variant="quiet"
              disabled={state === 'saving'}
              onClick={() => {
                setKey('');
                setState('dismissed');
              }}
            >
              {w.notNow}
            </Button>
            <span className="ms-auto cf-caption text-cf-ink-muted">{w.adminOnly}</span>
          </>
        )
      }
    >
      <p className="cf-body-sm text-cf-ink-muted [text-wrap:pretty]">
        {secret.field === 'workspace-key' ? w.workspaceLead : w.searchLead}
      </p>
      {!admin ? (
        <p className="cf-body-sm text-cf-ink">{w.notAdmin}</p>
      ) : state === 'saved' ? (
        <p role="status" className="cf-body-sm text-cf-ink">
          {w.saved}
        </p>
      ) : (
        <form
          id={formId}
          autoComplete="off"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <Input
            standalone
            secret
            disableForm
            label={w.field}
            value={key}
            autoComplete="off"
            spellCheck={false}
            placeholder={stored ? w.placeholderStored : w.placeholder}
            disabled={state === 'saving'}
            error={state === 'failed' ? w.failed : undefined}
            onChange={(event) => {
              setKey(event.target.value);
              if (state === 'failed') setState('idle');
            }}
          />
        </form>
      )}
    </AgentCard>
  );
}
