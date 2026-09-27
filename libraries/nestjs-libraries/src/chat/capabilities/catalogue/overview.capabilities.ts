import { z } from 'zod';
import { OnboardingController } from '@contentfactory/backend/api/routes/onboarding.controller';
import { IntegrationsController } from '@contentfactory/backend/api/routes/integrations.controller';
import { OnboardingRepository } from '@contentfactory/nestjs-libraries/database/prisma/onboarding/onboarding.repository';
import { IntegrationService } from '@contentfactory/nestjs-libraries/database/prisma/integrations/integration.service';
import { PieceService } from '@contentfactory/nestjs-libraries/content-intelligence/pieces/piece.service';
import { VoiceService } from '@contentfactory/nestjs-libraries/content-intelligence/brand-voice/voice.service';
import { AiUsageService } from '@contentfactory/nestjs-libraries/openai/ai.usage.service';
import { isOrganizationEditor } from '@contentfactory/nestjs-libraries/user/organization.roles';
import {
  defineCapability,
  door,
  type CapabilityRunContext,
} from '../capability.types';

/**
 * Overview and channels, read side (spec §5.2). Both doors carry no policy on
 * purpose — any member reads the workspace's own rows — so neither does the
 * capability; the role filter lets every role see them.
 */

/** Pieces the snapshot names; the rest are one «Контент» click away. */
const SNAPSHOT_PIECES = 10;
/** Channels and avatars the snapshot names; a workspace rarely has more. */
const SNAPSHOT_CHANNELS = 10;
const SNAPSHOT_AVATARS = 10;

type SnapshotChannel = {
  id: string;
  name: string;
  platform: string;
  disabled: boolean;
  /** `none` · `reserve` · `autopilot`; `null` when it could not be read. */
  planMode: string | null;
};
type SnapshotAvatar = {
  id: string;
  name: string | null;
  isDefault: boolean;
  analysed: boolean;
};
type SnapshotAllowance =
  | { mode: 'included'; remaining: number; limit: number; resetsAt: string }
  | { mode: 'unlimited' | 'workspace_key' | 'unavailable' };

export type WorkspaceSnapshot = {
  /** The onboarding counts (`GET /onboarding/progress`): what exists. */
  counts: Record<string, number>;
  pieces: Array<{ id: string; code: string; title: string }>;
  channels?: SnapshotChannel[];
  avatars?: SnapshotAvatar[];
  /** The avatar that writes when nobody is named; `null` when none can. */
  defaultAvatarId?: string | null;
  allowance?: SnapshotAllowance;
};

/**
 * A part of the snapshot that could not be read is left out, never guessed:
 * the agent reads product state at the start of every turn (spec §4.6), and a
 * failed side read must not take the whole turn down with it.
 */
const settled = async <T>(read: () => Promise<T>): Promise<T | undefined> => {
  try {
    return await read();
  } catch {
    return undefined;
  }
};

export const readWorkspaceSnapshot = async (
  ctx: Pick<
    CapabilityRunContext,
    'organizationId' | 'userId' | 'role' | 'language' | 'service'
  >
): Promise<WorkspaceSnapshot> => {
  const [progress, list, channelRows, avatarList, allowance] =
    await Promise.all([
      ctx.service(OnboardingRepository).progress(ctx.organizationId),
      ctx.service(PieceService).list(ctx.organizationId, {}, ctx.language),
      settled(() =>
        ctx
          .service(IntegrationService)
          .getIntegrationsForChannelList(ctx.organizationId)
      ),
      settled(() =>
        ctx.service(VoiceService).avatars({
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          canManage: isOrganizationEditor(ctx.role),
        })
      ),
      settled(() => ctx.service(AiUsageService).readAllowance(ctx.organizationId)),
    ]);
  const counts = Object.fromEntries(
    Object.entries(progress).filter(([, value]) => typeof value === 'number')
  ) as Record<string, number>;

  const channels = channelRows
    ? await Promise.all(
        channelRows.slice(0, SNAPSHOT_CHANNELS).map(async (row) => ({
          id: row.id,
          name: row.name,
          platform: row.providerIdentifier,
          disabled: !!row.disabled,
          planMode:
            (
              await settled(() =>
                ctx
                  .service(IntegrationService)
                  .getPlanMode(ctx.organizationId, row.id)
              )
            )?.planMode ?? null,
        }))
      )
    : undefined;

  return {
    counts,
    pieces: (list?.pieces ?? [])
      .filter((piece) => !piece.archivedAt)
      .slice(0, SNAPSHOT_PIECES)
      .map((piece) => ({ id: piece.id, code: piece.code, title: piece.title })),
    ...(channels ? { channels } : {}),
    ...(avatarList
      ? {
          avatars: avatarList.avatars.slice(0, SNAPSHOT_AVATARS).map((one) => ({
            id: one.id,
            name: one.name,
            isDefault: one.isDefault,
            analysed: one.analysed,
          })),
          defaultAvatarId: avatarList.defaultAvatarId,
        }
      : {}),
    ...(allowance
      ? {
          allowance:
            allowance.mode === 'included'
              ? {
                  mode: 'included' as const,
                  remaining: allowance.remaining,
                  limit: allowance.limit,
                  resetsAt: allowance.resetsAt,
                }
              : { mode: allowance.mode },
        }
      : {}),
  };
};

export const workspaceSnapshot = defineCapability({
  id: 'workspace.snapshot',
  group: 'overview',
  label: { ru: 'Что есть в пространстве', en: 'Workspace overview' },
  description:
    'Read what the workspace has now: counts of channels, avatars, voice samples, facts, pieces, drafts, adaptations and scheduled posts; the pieces in work, the channels with their plan mode, the avatars with the default one, and the AI allowance left. Free. The same snapshot opens every turn; call it again only after something changed in this turn.',
  input: z.object({}),
  risk: 'read',
  door: door(OnboardingController, 'progress'),
  // Piece titles can come from a pasted foreign post, channel names from the
  // platform, avatar names from whoever typed them.
  untrusted: ['workspace-text'],
  run: async (ctx): Promise<WorkspaceSnapshot> => readWorkspaceSnapshot(ctx),
  summarize: (output) => ({ ...output }),
});

type ChannelRow = {
  id: string;
  name: string;
  platform: string;
  disabled: boolean;
  refreshNeeded: boolean;
  posts: number;
};

export const channelsList = defineCapability({
  id: 'channels.list',
  group: 'channels',
  label: { ru: 'Каналы', en: 'Channels' },
  description:
    'List the connected channels with their ids, platform, whether they are switched off or need reconnecting, and how many posts each has. Free. Use it before anything that needs a channel id.',
  input: z.object({}),
  risk: 'read',
  door: door(IntegrationsController, 'getIntegrationList'),
  // Channel names are set on the platform, by whoever owns the channel there.
  untrusted: ['workspace-text'],
  run: async (ctx): Promise<{ channels: ChannelRow[] }> => {
    const rows = await ctx
      .service(IntegrationService)
      .getIntegrationsForChannelList(ctx.organizationId);
    return {
      channels: rows.map((row) => ({
        id: row.id,
        name: row.name,
        platform: row.providerIdentifier,
        disabled: !!row.disabled,
        refreshNeeded: !!row.refreshNeeded,
        posts: row._count?.posts ?? 0,
      })),
    };
  },
  summarize: (output) => ({ channels: output.channels }),
});
