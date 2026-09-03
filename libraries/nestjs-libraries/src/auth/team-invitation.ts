import { createHash } from 'node:crypto';
import { AuthService } from '@contentfactory/helpers/auth/auth.service';
import { ioRedis } from '@contentfactory/nestjs-libraries/redis/redis.service';
import {
  ASSIGNABLE_ORGANIZATION_ROLES,
  type AssignableOrganizationRole,
} from '@contentfactory/nestjs-libraries/user/organization.roles';

export const TEAM_INVITATION_TTL_SECONDS = 2 * 24 * 60 * 60;

type TeamInvitationClaims = {
  id: string;
  orgId: string;
  role: AssignableOrganizationRole;
  workspaceName: string;
  inviterName: string;
  inviterEmail: string;
  boundEmail?: string;
  timeLimit: string;
};

export type TeamInvitationPreview = Pick<
  TeamInvitationClaims,
  'workspaceName' | 'inviterName' | 'inviterEmail' | 'role'
>;

export class TeamInvitationError extends Error {
  constructor(
    public readonly code:
      | 'invite_invalid'
      | 'invite_used'
      | 'invite_email_mismatch'
      | 'invite_membership_failed',
    public readonly status: number,
    message: string
  ) {
    super(message);
  }
}
const invitationKey = (token: string) =>
  `team-invitation:${createHash('sha256').update(token).digest('hex')}`;

const normalizeEmail = (email: string) => email.trim().toLowerCase();

const isAssignableRole = (
  role: unknown
): role is AssignableOrganizationRole =>
  typeof role === 'string' &&
  (ASSIGNABLE_ORGANIZATION_ROLES as readonly string[]).includes(role);

const verifiedClaims = (token: string): TeamInvitationClaims => {
  let claims: Partial<TeamInvitationClaims> | null = null;
  try {
    claims = AuthService.verifyJWT(token) as Partial<TeamInvitationClaims>;
  } catch {
    throw new TeamInvitationError(
      'invite_invalid',
      410,
      'This invitation is invalid or has expired'
    );
  }

  const expiresAt = Date.parse(claims?.timeLimit || '');
  if (
    !claims ||
    typeof claims.id !== 'string' ||
    !claims.id ||
    typeof claims.orgId !== 'string' ||
    !claims.orgId ||
    !isAssignableRole(claims.role) ||
    typeof claims.workspaceName !== 'string' ||
    !claims.workspaceName ||
    typeof claims.inviterName !== 'string' ||
    !claims.inviterName ||
    typeof claims.inviterEmail !== 'string' ||
    !claims.inviterEmail ||
    (claims.boundEmail !== undefined &&
      (typeof claims.boundEmail !== 'string' || !claims.boundEmail)) ||
    !Number.isFinite(expiresAt) ||
    expiresAt <= Date.now()
  ) {
    throw new TeamInvitationError(
      'invite_invalid',
      410,
      'This invitation is invalid or has expired'
    );
  }

  return claims as TeamInvitationClaims;
};

const publicPreview = (claims: TeamInvitationClaims): TeamInvitationPreview => ({
  workspaceName: claims.workspaceName,
  inviterName: claims.inviterName,
  inviterEmail: claims.inviterEmail,
  role: claims.role,
});

export async function issueTeamInvitation(
  invitation: Omit<TeamInvitationClaims, 'timeLimit'>
) {
  const timeLimit = new Date(
    Date.now() + TEAM_INVITATION_TTL_SECONDS * 1000
  ).toISOString();
  const token = AuthService.signJWT({ ...invitation, timeLimit });
  await ioRedis.set(
    invitationKey(token),
    'issued',
    'EX',
    TEAM_INVITATION_TTL_SECONDS
  );
  return token;
}

export async function inspectTeamInvitation(
  token: string
): Promise<TeamInvitationPreview> {
  const claims = verifiedClaims(token);
  if (!(await ioRedis.get(invitationKey(token)))) {
    throw new TeamInvitationError(
      'invite_used',
      410,
      'This invitation has already been used'
    );
  }
  return publicPreview(claims);
}

export async function acceptTeamInvitation<T>(
  token: string,
  signedInEmail: string,
  addMember: (
    invitation: Pick<TeamInvitationClaims, 'id' | 'orgId' | 'role'>
  ) => Promise<T>
): Promise<{ invitation: TeamInvitationPreview; added: T }> {
  const claims = verifiedClaims(token);

  if (
    claims.boundEmail &&
    normalizeEmail(claims.boundEmail) !== normalizeEmail(signedInEmail)
  ) {
    throw new TeamInvitationError(
      'invite_email_mismatch',
      403,
      'This invitation belongs to another email address'
    );
  }

  // GETDEL is the single linearization point. If two requests arrive at once,
  // exactly one receives the marker and may write membership. The marker is
  // spent before the database call on purpose: a failed write needs a new
  // invitation rather than a replayable authority token.
  if (!(await ioRedis.getdel(invitationKey(token)))) {
    throw new TeamInvitationError(
      'invite_used',
      410,
      'This invitation has already been used'
    );
  }

  const added = await addMember({
    id: claims.id,
    orgId: claims.orgId,
    role: claims.role,
  });
  return { invitation: publicPreview(claims), added };
}
