import { Inject, Injectable, Optional } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { z } from 'zod';
import {
  AGENT_RUN_CLAIM_STORE,
  boundedRunClaimStore,
  inProcessRunClaimStore,
  type AgentRunClaimStore,
} from '../conductor/agent-run-claims';
import { approvalFingerprint } from './approval-fingerprint';

/**
 * A «Да» said in the conversation, over MCP (`content-factory-next-kcxz.49`,
 * spec §5.1).
 *
 * The web chat asks on a card: the autopilot consent of `piece.adapt`, the
 * approval of `plan.schedule` and `plan.move` (these two run on the person's
 * own request over MCP since `kcxz.52`). An MCP client has no such card
 * — claude.ai does not offer elicitation, and the owner wants the assistant
 * to ask in its own words (live walk 29.09.2026, step A4). So the call that
 * needs a «Да» does not run: it answers with the question, in the person's
 * language, and a confirmation code. The assistant asks the question as it
 * is, and after the person's «да» calls the same tool with the same arguments
 * and the code.
 *
 * The code is one-time, lives `MCP_CONFIRMATION_TTL_SECONDS`, and is bound to
 * the person, the workspace, the tool, its arguments and — for a post — the
 * text as it was when the question was asked: another call, another text or
 * a second use is refused and nothing runs. What the server cannot know is
 * whether the person, not the model, said «да»; the host's own approval of
 * the tool (a destructive hint) is the second check there.
 *
 * Kept in the chat's claim store (Redis, bounded), so a code asked on one
 * backend instance is answered on another.
 */

export const MCP_CONFIRMATION_TTL_SECONDS = 10 * 60;

/** The argument an MCP call carries its code in; never a product field. */
export const MCP_CONFIRMATION_FIELD = 'confirmation';

export const mcpConfirmationInput = z
  .string()
  .min(8)
  .max(64)
  .optional()
  .describe(
    'Only after the person said yes to the question this tool returned (`needsConfirmation`): the `confirmation` code from that answer, with the same other arguments. Never invent it; never pass it before the person answered.'
  );

const confirmationKey = (code: string) => `mcp-confirmation:${code}`;

export type ConfirmationScope = {
  organizationId: string;
  userId: string;
  toolName: string;
  /** The call's arguments without the code. */
  args: unknown;
  /** What goes out as stored now (`approvalContent`), when the tool has one. */
  content?: unknown;
};

const bindingOf = (scope: ConfirmationScope) =>
  approvalFingerprint(scope.toolName, {
    organizationId: scope.organizationId,
    userId: scope.userId,
    args: scope.args ?? {},
    content: scope.content ?? null,
  });

/** The run of a capability needs a «Да» first: the adapter asks for it. */
export class ConfirmationNeeded extends Error {
  constructor(readonly question: string) {
    super('The person confirms this call first.');
    this.name = 'ConfirmationNeeded';
  }
}

export const isConfirmationNeeded = (error: unknown): error is ConfirmationNeeded =>
  !!error &&
  typeof error === 'object' &&
  (error instanceof ConfirmationNeeded || (error as { name?: unknown }).name === 'ConfirmationNeeded') &&
  typeof (error as { question?: unknown }).question === 'string' &&
  !!(error as { question: string }).question.trim();

@Injectable()
export class McpConfirmationService {
  private readonly store: AgentRunClaimStore;

  constructor(
    @Optional() @Inject(AGENT_RUN_CLAIM_STORE) store?: AgentRunClaimStore
  ) {
    this.store = boundedRunClaimStore(store ?? inProcessRunClaimStore());
  }

  /** A new code for this call; the question goes to the person. */
  async issue(scope: ConfirmationScope): Promise<string> {
    const code = `cf-${randomBytes(12).toString('base64url')}`;
    await this.store.set(confirmationKey(code), bindingOf(scope), 'EX', MCP_CONFIRMATION_TTL_SECONDS);
    return code;
  }

  /**
   * Whether `code` was issued for exactly this call. Used once: a code that
   * matched is gone, a code for another call stays until it expires (the
   * right call may still come).
   */
  async redeem(code: string, scope: ConfirmationScope): Promise<boolean> {
    const key = confirmationKey(code);
    const stored = await this.store.get(key);
    if (typeof stored !== 'string' || stored !== bindingOf(scope)) return false;
    // Two calls with one code: only the one that deleted it runs.
    return (await this.store.del(key)) === 1;
  }
}
