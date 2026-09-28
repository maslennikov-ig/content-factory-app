'use client';

import { useCallback, useId, useState } from 'react';
import useSWR from 'swr';
import { Button } from '@contentfactory/react/form/button';
import { Input } from '@contentfactory/react/form/input';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { useUser } from '@contentfactory/frontend/components/layout/user.context';
import { isOrganizationAdmin } from '@contentfactory/nestjs-libraries/user/organization.roles';
import {
  aiKeyTarget,
  buildTypedKeyPayload,
  wrongSearchKey,
  type StoredAiSettings,
} from '@contentfactory/frontend/components/settings/ai-provider.component';
import { KEY_OWNER_NAMES } from '@contentfactory/nestjs-libraries/chat/conductor/secret-shapes';
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
 *
 * Opened by `ai.key.enter` (`kcxz.20`); the chat hears only that the card is
 * shown and, after «Продолжить», the person's words that it is saved.
 */

/** The settings screen's own cache key, so both read one answer. */
const AI_SETTINGS_KEY = 'ai-provider';
const AI_SETTINGS_DOOR = '/settings/ai';

type Stored = StoredAiSettings;

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

  // Read afresh whenever a card is drawn (review W3-20 F3): the chat may
  // have switched the mode since the answer was cached.
  const settings = useSWR<Stored>(
    admin ? AI_SETTINGS_KEY : null,
    async () => (await request(AI_SETTINGS_DOOR)).json(),
    { revalidateOnFocus: false }
  );

  const [key, setKey] = useState('');
  const [state, setState] = useState<
    'idle' | 'saving' | 'saved' | 'failed' | 'wrong' | 'dismissed'
  >('idle');

  // On «Ключи системы» the workspace's own keys sleep and the settings screen
  // has no field for them (`97dq.6`): a search key card says so instead of
  // taking a key, and the AI key card says saving moves the workspace to its
  // own key — what the settings door does with it (`buildTypedKeyPayload`).
  const onSystemKeys = settings.data?.usageMode === 'included';
  const asleep = secret.field === 'search-key' && onSystemKeys;
  // Whether this workspace saved its own key: never on «Ключи системы», where
  // the own keys sleep and the chat names none (review W3-20 F8), and for a
  // search key the workspace's own, not the system one behind it (F9).
  const stored =
    !onSystemKeys &&
    (secret.field === 'workspace-key'
      ? settings.data?.hasKey === true
      : settings.data?.workspaceSearchKeys?.[secret.engine] === true);
  // What the typed key is saved as, and whether it may be (F2).
  const typedKey = key.trim();
  const target =
    secret.field === 'workspace-key'
      ? aiKeyTarget(settings.data?.workspaceProvider, typedKey)
      : null;
  const wrong =
    target && 'wrong' in target
      ? w.wrongKey(KEY_OWNER_NAMES[target.wrong], 'OpenAI / OpenRouter')
      : secret.field === 'search-key' && typedKey
        ? (() => {
            const owner = wrongSearchKey(secret.engine, typedKey);
            return owner
              ? w.wrongKey(KEY_OWNER_NAMES[owner], ENGINE_NAME[secret.engine])
              : null;
          })()
        : null;
  const savesFor =
    target && 'provider' in target
      ? w.savesFor(target.provider === 'openrouter' ? 'OpenRouter' : 'OpenAI')
      : null;

  const title =
    secret.field === 'workspace-key'
      ? w.workspaceTitle
      : w.searchTitle(ENGINE_NAME[secret.engine]);

  const save = useCallback(async () => {
    const typed = key.trim();
    if (!typed || !settings.data) return;
    setState('saving');
    try {
      // The settings as they are now, not as the card was drawn (F3).
      const fresh = (await settings.mutate()) ?? settings.data;
      let body;
      if (secret.field === 'workspace-key') {
        const aim = aiKeyTarget(fresh.workspaceProvider, typed);
        if ('wrong' in aim) {
          setState('wrong');
          return;
        }
        body = buildTypedKeyPayload({ field: 'workspace-key', key: typed, provider: aim.provider });
      } else {
        // The search keys sleep on «Ключи системы»: nothing is posted.
        if (fresh.usageMode === 'included' || wrongSearchKey(secret.engine, typed)) {
          setState(fresh.usageMode === 'included' ? 'idle' : 'wrong');
          return;
        }
        body = buildTypedKeyPayload({ field: 'search-key', engine: secret.engine, key: typed });
      }
      const response = await request(AI_SETTINGS_DOOR, {
        method: 'POST',
        body: JSON.stringify(body),
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
        !admin || asleep ? undefined : state === 'saved' ? (
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
              disabled={!key.trim() || !settings.data || !!wrong}
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
        {secret.field === 'search-key'
          ? w.searchLead
          : onSystemKeys
            ? w.workspaceLeadSystem
            : w.workspaceLead}
      </p>
      {!admin ? (
        <p className="cf-body-sm text-cf-ink">{w.notAdmin}</p>
      ) : asleep ? (
        <p className="cf-body-sm text-cf-ink">{w.searchAsleep}</p>
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
            error={wrong ?? (state === 'failed' ? w.failed : undefined)}
            onChange={(event) => {
              setKey(event.target.value);
              if (state === 'failed' || state === 'wrong') setState('idle');
            }}
          />
          {savesFor && !wrong ? (
            <p className="cf-caption mt-[4px] text-cf-ink-muted">{savesFor}</p>
          ) : null}
        </form>
      )}
    </AgentCard>
  );
}
