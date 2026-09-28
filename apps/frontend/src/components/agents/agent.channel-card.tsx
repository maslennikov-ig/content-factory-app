'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@contentfactory/react/form/button';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { SkeletonRows } from '@contentfactory/frontend/components/ui/surface';
import { useIntegrationList } from '@contentfactory/frontend/components/launches/helpers/use.integration.list';
import { OnboardingTelegramGuide } from '@contentfactory/frontend/components/onboarding/onboarding.telegram';
import { onboardingCopy } from '@contentfactory/frontend/components/onboarding/onboarding.copy';
import { AgentCard } from './agent.cards';
import { AgentGlyph } from './agent.icons';
import {
  arrivedChannelOf,
  connectReturnOf,
  connectWindowOpen,
  type AgentArtifact,
  type AgentChannelConnect,
  type ConnectListRow,
  type ConnectReturn,
} from './agent.contract';
import type { AgentWords } from './agent.copy';

/**
 * «Подключение канала» in the conversation (`kcxz.19`, spec §6.2 «Channel
 * connect»), shown after the person's «Да».
 *
 * Telegram: the onboarding's own three steps (`OnboardingTelegramGuide` —
 * the bot as an admin, `/connect <word>`, the channel appearing by itself),
 * with the finishing hop bringing the person back to this conversation. A
 * platform with a sign-in window: one button that asks the add-channel door
 * for the window's address and goes there, as «Каналы» does, and comes back
 * here the same way. The word, the nonce and every token stay between the
 * browser, the door and the platform; the chat never carries them.
 *
 * Once a channel of that platform arrives that was not there when the card
 * was made — created after the card, within its window, and finished — the
 * card says so and opens it beside the chat (`arrivedChannelOf`, review
 * W3-19 P3-3). A failed return from the platform (`?precondition`, `?msg`)
 * is said on the card in plain words (P3-4).
 */

/** The React Native shell, as «Каналы» detects it (`add.provider.component.tsx`). */
type NativeShell = { postMessage?: (message: string) => void };
const nativeShell = (): NativeShell | null =>
  typeof window === 'undefined'
    ? null
    : ((window as unknown as { ReactNativeWebView?: NativeShell }).ReactNativeWebView ?? null);

export function ChannelConnectCard({
  connect,
  threadId,
  onOpen,
  words,
}: {
  connect: AgentChannelConnect;
  /** The conversation to come back to after the platform's window. */
  threadId: string | null;
  onOpen: (artifact: AgentArtifact) => void;
  words: AgentWords;
}) {
  const w = words.connect;
  const onboarding = onboardingCopy[words.locale];
  const request = useFetch();
  const { data, isLoading } = useIntegrationList();
  const [opening, setOpening] = useState(false);
  const [failed, setFailed] = useState(false);
  const [returned, setReturned] = useState<ConnectReturn | null>(null);
  const back = threadId ? `/agents/${encodeURIComponent(threadId)}` : '/agents';

  // The address the platform's return landed on, read once in the browser.
  useEffect(() => {
    if (typeof window !== 'undefined') setReturned(connectReturnOf(window.location.search));
  }, []);

  const openPlatform = useCallback(async () => {
    setFailed(false);
    setReturned(null);
    setOpening(true);
    // The mobile shell opens the window in the system browser and comes back
    // to the app, as «Каналы» does there; a WebView sign-in is refused.
    const shell = nativeShell();
    const redirect = shell ? 'contentfactory://integrations' : back;
    try {
      const response = await request(
        `/integrations/social/${encodeURIComponent(connect.provider)}?redirectUrl=${encodeURIComponent(redirect)}`
      );
      const body = response.ok ? await response.json() : null;
      if (!body?.url || body.err) throw new Error(String(response.status));
      if (typeof shell?.postMessage === 'function') {
        shell.postMessage(JSON.stringify({ type: 'open-external', url: String(body.url) }));
        setOpening(false);
        return;
      }
      // The same window, as the add-channel screen goes to the platform.
      window.location.href = String(body.url);
    } catch {
      setFailed(true);
      setOpening(false);
    }
  }, [request, connect.provider, back]);

  const rows = (Array.isArray(data) ? data : []) as ConnectListRow[];
  const arrived = arrivedChannelOf(connect, rows);
  // A return belongs to a card that could still be waiting for it.
  const returnLine =
    returned && connect.flow === 'oauth' && connectWindowOpen(connect, Date.now())
      ? returned.kind === 'precondition'
        ? w.returnPrecondition
        : w.returnFailed(returned.message)
      : null;

  if (arrived) {
    const artifact: AgentArtifact = {
      kind: 'channel',
      id: arrived.id,
      title: arrived.name,
      code: null,
      data: { kind: 'channel', id: arrived.id, name: arrived.name, provider: arrived.identifier },
    };
    return (
      <AgentCard
        cardKind="channel-connect"
        glyph="channels"
        kind={w.kind}
        title={w.connected(arrived.name)}
        label={`${w.kind}: ${w.connected(arrived.name)}`}
        footer={
          <Button type="button" density="dense" variant="secondary" onClick={() => onOpen(artifact)}>
            {w.openChannel}
            <AgentGlyph name="right" size={14} />
          </Button>
        }
      >
        <p role="status" className="cf-body-sm text-cf-ink [text-wrap:pretty]">
          {w.connectedLead}
        </p>
      </AgentCard>
    );
  }

  if (isLoading && !rows.length) {
    return (
      <AgentCard cardKind="channel-connect" glyph="channels" kind={w.kind} label={w.kind}>
        <SkeletonRows rows={2} label={w.checking} />
      </AgentCard>
    );
  }

  if (connect.flow === 'telegram') {
    return (
      <AgentCard
        cardKind="channel-connect"
        glyph="channels"
        kind={w.kind}
        title={w.telegramTitle}
        label={`${w.kind}: ${w.telegramTitle}`}
      >
        <OnboardingTelegramGuide
          words={onboarding.telegram}
          actionLabel={onboarding.steps.channel.action}
          redirectUrl={back}
        />
      </AgentCard>
    );
  }

  return (
    <AgentCard
      cardKind="channel-connect"
      glyph="channels"
      kind={w.kind}
      title={w.oauthTitle(connect.name)}
      label={`${w.kind}: ${w.oauthTitle(connect.name)}`}
      footer={
        <Button
          type="button"
          density="dense"
          loading={opening}
          loadingLabel={w.oauthAction(connect.name)}
          onClick={() => void openPlatform()}
        >
          {w.oauthAction(connect.name)}
          <AgentGlyph name="external" size={14} />
        </Button>
      }
    >
      <p className="max-w-[65ch] cf-body-sm text-cf-ink [text-wrap:pretty]">
        {w.oauthLead(connect.name)}
      </p>
      {failed ? (
        <p role="alert" className="cf-body-sm text-cf-ink [text-wrap:pretty]">
          {w.oauthFailed}
        </p>
      ) : returnLine ? (
        <p role="alert" className="cf-body-sm text-cf-ink [text-wrap:pretty]">
          {returnLine}
        </p>
      ) : null}
    </AgentCard>
  );
}
