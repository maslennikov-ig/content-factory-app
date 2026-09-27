import { Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  PermissionsService,
  ROLE_SECTIONS,
} from '@contentfactory/backend/services/auth/permissions/permissions.service';
import {
  AbilityPolicy,
  CHECK_POLICIES_KEY,
} from '@contentfactory/backend/services/auth/permissions/permissions.ability';
import type { OrganizationRole } from '@contentfactory/nestjs-libraries/user/organization.roles';
import type {
  CapabilityDeclaration,
  CapabilityDoor,
  CapabilityIdentity,
} from './capability.types';

/**
 * A capability borrows its door's `@CheckPolicies` (`content-factory-next-kcxz.6`,
 * spec §4.2, ADR-0012 §1). The policies are read from the handler's metadata,
 * not copied into the declaration, and evaluated by the very function
 * `PoliciesGuard` calls — so the chat and the screen cannot drift.
 */

const reflector = new Reflector();

/** The handler's policies; `undefined` when the door does not exist. */
export const doorHandler = (door: CapabilityDoor) => {
  const handler = door?.controller?.prototype?.[door.method];
  return typeof handler === 'function' ? (handler as Function) : undefined;
};

export const readDoorPolicies = (door: CapabilityDoor): AbilityPolicy[] => {
  const handler = doorHandler(door);
  if (!handler) {
    throw new Error(
      `Door ${door?.controller?.name}.${door?.method} does not exist.`
    );
  }
  return reflector.get<AbilityPolicy[]>(CHECK_POLICIES_KEY, handler) || [];
};

/**
 * Whether a role could ever pass the door, read from the one role table
 * `PermissionsService` owns. Plan limits are left to the per-call check: a
 * workspace out of posts this month still sees the action and hears why.
 *
 * This is what `activeTools` is built from, so a USER is not shown write tools
 * only to be refused by them (spec §4.2).
 */
export const roleMayUse = (
  capability: Pick<CapabilityDeclaration, 'door'>,
  role: OrganizationRole
) =>
  readDoorPolicies(capability.door).every(([, section]) => {
    const holdsRole = ROLE_SECTIONS[section];
    return holdsRole ? holdsRole(role) : true;
  });

export type DoorVerdict = {
  allowed: boolean;
  /** `action:section` of every policy the door carries. */
  policies: string[];
  /** The first policy that failed, when one did. */
  refused?: string;
};

@Injectable()
export class DoorPolicyGate {
  constructor(private readonly permissions: PermissionsService) {}

  /** The full check `PoliciesGuard` runs: role sections and plan limits. */
  async check(
    door: CapabilityDoor,
    identity: CapabilityIdentity
  ): Promise<DoorVerdict> {
    const policies = readDoorPolicies(door);
    const named = policies.map(([action, section]) => `${action}:${section}`);
    if (!policies.length) return { allowed: true, policies: named };
    const ability = await this.permissions.check(
      identity.organizationId,
      new Date(identity.organizationCreatedAt),
      identity.role,
      policies
    );
    const refused = policies.find(
      ([action, section]) => !ability.can(action, section)
    );
    return refused
      ? {
          allowed: false,
          policies: named,
          refused: `${refused[0]}:${refused[1]}`,
        }
      : { allowed: true, policies: named };
  }
}
