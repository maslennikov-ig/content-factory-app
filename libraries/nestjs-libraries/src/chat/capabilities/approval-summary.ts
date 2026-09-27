import { AGENT_APPROVAL_SUMMARY_MAX } from './agent-parts.contract';
import { approvalFingerprint } from './approval-fingerprint';
import {
  toolNameOf,
  type CapabilityDeclaration,
  type CapabilityIdentity,
} from './capability.types';
import type { CapabilityServices } from './mastra.adapter';

/**
 * The approval card's «what and where» (correctness review W1 F1, spec §5.1
 * `confirm`, §6.2).
 *
 * The fingerprint binds «Да» to the stored call; this makes the person see
 * that call. The words are the capability's own `describeApproval`, run over
 * the stored arguments parsed by the capability's schema, reading the entity
 * from the caller's organization — never text the model wrote.
 *
 * Mastra 1.71 has no native producer for an approval's reason: the
 * `tool-call-approval` chunk carries only the call, and the per-tool
 * `transform.display.approval` sees no request context, so it cannot read the
 * workspace for the caller. The door therefore puts the line on the native
 * AI SDK field (`tool-approval-request.reason` → `approval.requestReason`) and
 * on the thread's `pending` list.
 *
 * Only the browser reads it; it is never part of what the model reads.
 */

/** One line: control characters and runs of spaces folded, length capped. */
export const cleanApprovalSummary = (text: unknown): string | null => {
  if (typeof text !== 'string') return null;
  const line = text
    .replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!line) return null;
  return line.length > AGENT_APPROVAL_SUMMARY_MAX
    ? `${line.slice(0, AGENT_APPROVAL_SUMMARY_MAX - 1).trimEnd()}…`
    : line;
};

/**
 * The summary of one pending `confirm` call, or `null` for a tool that is not
 * a registry `confirm` capability. A description that fails, or arguments the
 * schema refuses, fall back to the capability's label: the card still says
 * what, and the call itself will be refused by its own checks.
 */
export const describeApprovalCall = async (
  capabilities: readonly CapabilityDeclaration[],
  services: CapabilityServices,
  identity: CapabilityIdentity,
  toolName: string | null | undefined,
  args: unknown
): Promise<string | null> => {
  if (!toolName) return null;
  const capability = capabilities.find(
    (candidate) => toolNameOf(candidate.id) === toolName
  );
  if (!capability || capability.risk !== 'confirm') return null;
  const label = capability.label[identity.language];
  const parsed = capability.input.safeParse(args ?? {});
  if (!parsed.success || !capability.describeApproval) return label;
  try {
    return (
      cleanApprovalSummary(
        await capability.describeApproval(
          { ...identity, service: services },
          parsed.data
        )
      ) ?? label
    );
  } catch {
    return label;
  }
};

/**
 * The digest of what a `confirm` call would send out now (review W2 F4), or
 * `null` for a tool whose approval binds only its arguments. A value that
 * cannot be read digests as `null` content: the call's own checks refuse it.
 */
export const approvalContentDigest = async (
  capabilities: readonly CapabilityDeclaration[],
  services: CapabilityServices,
  identity: CapabilityIdentity,
  toolName: string | null | undefined,
  args: unknown
): Promise<string | null> => {
  if (!toolName) return null;
  const capability = capabilities.find(
    (candidate) => toolNameOf(candidate.id) === toolName
  );
  if (!capability || capability.risk !== 'confirm' || !capability.approvalContent) {
    return null;
  }
  const parsed = capability.input.safeParse(args ?? {});
  let content: unknown = null;
  if (parsed.success) {
    try {
      content = (await capability.approvalContent({ ...identity, service: services }, parsed.data)) ?? null;
    } catch {
      content = null;
    }
  }
  return approvalFingerprint(`content:${toolName}`, { content });
};

/**
 * The fingerprint of «Да» bound to what goes out: the call and the content
 * digest the card was shown with. Granted beside the call's own fingerprint;
 * the hook recomputes it when the call runs.
 */
export const approvalContentFingerprint = (toolName: string, args: unknown, digest: string) =>
  `${approvalFingerprint(toolName, args)}.${digest.slice(0, 32)}`;

/**
 * The label people read for a registry tool, or `null` for a tool that is not
 * a product action (Mastra's skill and memory tools). The live stream carries
 * no tool title while a stored message does; the door adds it so a card says
 * the same before and after a reload (`content-factory-next-kcxz.29`, D5).
 */
export const capabilityToolTitle = (
  capabilities: readonly CapabilityDeclaration[],
  toolName: string | null | undefined,
  language: 'ru' | 'en'
): string | null => {
  if (!toolName) return null;
  const capability = capabilities.find(
    (candidate) => toolNameOf(candidate.id) === toolName
  );
  return capability ? capability.label[language] : null;
};
