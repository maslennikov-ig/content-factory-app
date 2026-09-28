import {
  assertCapabilityInput,
  freeTextPaths,
} from './capability.input-guards';
import {
  QUESTION_RISKS,
  CAPABILITY_GROUPS,
  CARD_KINDS,
  RISK_CLASSES,
  toolNameOf,
  type CapabilityDeclaration,
} from './capability.types';
import { readDoorPolicies } from './door-policy';
import {
  avatarActivate,
  avatarAnalyse,
  avatarBind,
  avatarCreate,
  avatarDefault,
  avatarDelete,
  avatarLearn,
  avatarLearning,
  avatarList,
  avatarManual,
  avatarManualField,
  avatarOverview,
  avatarProposal,
  avatarProposalField,
  avatarRename,
  avatarRetire,
  avatarRuleForget,
  avatarSamples,
  avatarSamplesAdd,
  avatarSamplesDelete,
} from './catalogue/avatar.capabilities';
import {
  adaptationDelete,
  adaptationEdit,
  adaptationImage,
  adaptationReview,
  adaptationRewrite,
  channelWritingRemember,
  pieceAdapt,
} from './catalogue/adaptation.capabilities';
import {
  pieceCheckFacts,
  pieceCoreEdit,
  pieceCoreRebuild,
  pieceCoreRestore,
  pieceMaterialAdd,
  pieceResearch,
  pieceRewrite,
} from './catalogue/core.capabilities';
import {
  channelAutopilot,
  channelBotRename,
  channelConnect,
  channelDelete,
  channelDisable,
  channelOpen,
  channelPlan,
  channelPosts,
  channelTimes,
  channelWriting,
} from './catalogue/channel.capabilities';
import { channelsList, workspaceSnapshot } from './catalogue/overview.capabilities';
import {
  aiKeyClear,
  aiKeyEnter,
  aiMode,
  aiSearchKeyClear,
  aiSettings,
  aiUsage,
} from './catalogue/ai-settings.capabilities';
import {
  planAhead,
  planApply,
  planCalendar,
  planMove,
  planPlace,
  planPublishNow,
  planReady,
  planSchedule,
  planUnschedule,
} from './catalogue/plan.capabilities';
import {
  pieceAnswer,
  pieceArchive,
  pieceCreate,
  pieceDelete,
  pieceList,
  pieceOpen,
  pieceRename,
} from './catalogue/piece.capabilities';

/**
 * The catalogue (`content-factory-next-kcxz.6`, spec §5.2). W1 proved every
 * risk class but `secret` end to end at the unit level; the rest of the
 * catalogue lands group by group in its own tasks (`kcxz.12`: content intake,
 * questions, list, open, archive; `kcxz.13`: the core; `kcxz.14`: adaptations;
 * `kcxz.15`: the plan; `kcxz.18`: avatars; `kcxz.19`: channels; `kcxz.20`:
 * AI settings, the first `secret` capability).
 */
export const CAPABILITY_CATALOGUE: readonly CapabilityDeclaration[] = [
  workspaceSnapshot as CapabilityDeclaration,
  channelsList as CapabilityDeclaration,
  pieceList as CapabilityDeclaration,
  pieceOpen as CapabilityDeclaration,
  pieceRename as CapabilityDeclaration,
  pieceArchive as CapabilityDeclaration,
  pieceCreate as CapabilityDeclaration,
  pieceAnswer as CapabilityDeclaration,
  pieceCoreEdit as CapabilityDeclaration,
  pieceMaterialAdd as CapabilityDeclaration,
  pieceCoreRestore as CapabilityDeclaration,
  pieceCoreRebuild as CapabilityDeclaration,
  pieceResearch as CapabilityDeclaration,
  pieceCheckFacts as CapabilityDeclaration,
  pieceRewrite as CapabilityDeclaration,
  pieceAdapt as CapabilityDeclaration,
  channelWritingRemember as CapabilityDeclaration,
  adaptationReview as CapabilityDeclaration,
  adaptationRewrite as CapabilityDeclaration,
  adaptationEdit as CapabilityDeclaration,
  adaptationImage as CapabilityDeclaration,
  adaptationDelete as CapabilityDeclaration,
  pieceDelete as CapabilityDeclaration,
  planAhead as CapabilityDeclaration,
  planCalendar as CapabilityDeclaration,
  planReady as CapabilityDeclaration,
  planPlace as CapabilityDeclaration,
  planUnschedule as CapabilityDeclaration,
  planSchedule as CapabilityDeclaration,
  planPublishNow as CapabilityDeclaration,
  planMove as CapabilityDeclaration,
  planApply as CapabilityDeclaration,
  avatarList as CapabilityDeclaration,
  avatarOverview as CapabilityDeclaration,
  avatarProposal as CapabilityDeclaration,
  avatarManual as CapabilityDeclaration,
  avatarSamples as CapabilityDeclaration,
  avatarLearning as CapabilityDeclaration,
  avatarCreate as CapabilityDeclaration,
  avatarRename as CapabilityDeclaration,
  avatarDefault as CapabilityDeclaration,
  avatarBind as CapabilityDeclaration,
  avatarSamplesAdd as CapabilityDeclaration,
  avatarProposalField as CapabilityDeclaration,
  avatarManualField as CapabilityDeclaration,
  avatarAnalyse as CapabilityDeclaration,
  avatarLearn as CapabilityDeclaration,
  avatarActivate as CapabilityDeclaration,
  avatarSamplesDelete as CapabilityDeclaration,
  avatarDelete as CapabilityDeclaration,
  avatarRuleForget as CapabilityDeclaration,
  avatarRetire as CapabilityDeclaration,
  channelOpen as CapabilityDeclaration,
  channelPosts as CapabilityDeclaration,
  channelWriting as CapabilityDeclaration,
  channelPlan as CapabilityDeclaration,
  channelTimes as CapabilityDeclaration,
  channelAutopilot as CapabilityDeclaration,
  channelConnect as CapabilityDeclaration,
  channelBotRename as CapabilityDeclaration,
  channelDisable as CapabilityDeclaration,
  channelDelete as CapabilityDeclaration,
  aiSettings as CapabilityDeclaration,
  aiUsage as CapabilityDeclaration,
  aiMode as CapabilityDeclaration,
  aiKeyEnter as CapabilityDeclaration,
  aiKeyClear as CapabilityDeclaration,
  aiSearchKeyClear as CapabilityDeclaration,
];

/**
 * Refuses a catalogue that breaks a rule of the registry. Run when the agent
 * and the MCP server are built, and by the guard in `tests/`.
 */
export const assertCapabilityRegistry = (
  capabilities: readonly CapabilityDeclaration[]
) => {
  const ids = new Set<string>();
  const tools = new Set<string>();
  for (const capability of capabilities) {
    const { id } = capability;
    if (ids.has(id)) throw new Error(`Capability ${id} is declared twice.`);
    ids.add(id);
    const tool = toolNameOf(id);
    if (tools.has(tool)) {
      throw new Error(`Capability ${id} collides with another tool name ${tool}.`);
    }
    tools.add(tool);

    if (!RISK_CLASSES.includes(capability.risk)) {
      throw new Error(`Capability ${id} has no risk class.`);
    }
    if (!CAPABILITY_GROUPS.includes(capability.group)) {
      throw new Error(`Capability ${id} names an unknown group.`);
    }
    if (capability.card && !CARD_KINDS.includes(capability.card)) {
      throw new Error(`Capability ${id} names an unknown card kind.`);
    }
    if (capability.cardOf && !capability.card) {
      throw new Error(`Capability ${id} builds a card without a card kind.`);
    }
    if (!capability.label?.ru || !capability.label?.en || !capability.description) {
      throw new Error(`Capability ${id} lacks a label or a description.`);
    }

    const policies = readDoorPolicies(capability.door);
    if (capability.risk !== 'read' && !policies.length) {
      throw new Error(
        `Capability ${id} changes something through a door without @CheckPolicies.`
      );
    }

    // Every input capability asks; a paid one may pause for the person's
    // choice mid-run (spec §5.2, intake «paid + input»); nothing else asks.
    const asks = !!(capability.suspendSchema && capability.resumeSchema);
    const halfAsks = !asks && !!(capability.suspendSchema || capability.resumeSchema);
    if (
      halfAsks ||
      (capability.risk === 'input' && !asks) ||
      (asks && !QUESTION_RISKS.includes(capability.risk))
    ) {
      throw new Error(
        `Capability ${id}: every input capability, and only an input or a paid one, carries suspend and resume schemas.`
      );
    }
    // The secret card posts the value straight to the door; the tool that
    // opens it has nowhere a key could be typed (spec §1.5).
    if (capability.risk === 'secret' && freeTextPaths(capability.input).length) {
      throw new Error(
        `Capability ${id}: a secret capability takes no free text; the value never passes through the model.`
      );
    }

    // The approval card says what and where (spec §5.1): every confirm
    // capability describes its call, and nothing else pretends to.
    if ((capability.risk === 'confirm') !== !!capability.describeApproval) {
      throw new Error(
        `Capability ${id}: only the confirm class, and every one of it, describes its approval card.`
      );
    }

    assertCapabilityInput(capability);
  }
  return capabilities;
};
