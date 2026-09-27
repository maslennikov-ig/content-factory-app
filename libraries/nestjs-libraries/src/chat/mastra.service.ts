import { Injectable, type Type } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Mastra } from '@mastra/core/mastra';
import { ConsoleLogger } from '@mastra/core/logger';
import { pStore } from '@contentfactory/nestjs-libraries/chat/mastra.store';
import { AiUsageService } from '@contentfactory/nestjs-libraries/openai/ai.usage.service';
import {
  getAiSdkProvider,
  getModelForRole,
} from '@contentfactory/nestjs-libraries/openai/ai.clients';
import { PermissionsService } from '@contentfactory/backend/services/auth/permissions/permissions.service';
import { DoorPolicyGate } from '@contentfactory/nestjs-libraries/chat/capabilities/door-policy';
import type { CapabilityGate } from '@contentfactory/nestjs-libraries/chat/capabilities/capability.admission';
import { buildConductorAgent } from '@contentfactory/nestjs-libraries/chat/conductor/conductor.agent';
import { CONDUCTOR_AGENT_ID } from '@contentfactory/nestjs-libraries/chat/conductor/conductor.context';
import { CAPABILITY_CATALOGUE } from '@contentfactory/nestjs-libraries/chat/capabilities/capability.registry';
import {
  approvalContentDigest,
  capabilityToolTitle,
  describeApprovalCall,
} from '@contentfactory/nestjs-libraries/chat/capabilities/approval-summary';
import type { CapabilityIdentity } from '@contentfactory/nestjs-libraries/chat/capabilities/capability.types';
import { createConductorMemory } from '@contentfactory/nestjs-libraries/chat/conductor/conductor.memory';

/**
 * The one Mastra instance of the backend and its one agent, the conductor
 * (`content-factory-next-kcxz.7`). It replaced `LoadToolsService` and the
 * eleven inherited upstream tools on 27.09.2026.
 *
 * Nest services reach the agent's capabilities through `ModuleRef` — the same
 * provider instances the screens' doors use — and the door policies through
 * the `PermissionsService` `PoliciesGuard` uses.
 */
@Injectable()
export class MastraService {
  private instance?: Mastra;

  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly aiUsage: AiUsageService
  ) {}

  private service = <T>(token: Type<T>): T =>
    this.moduleRef.get(token, { strict: false });

  /** Resolved on first use: `PermissionsService` lives in the API module. */
  private gate(): CapabilityGate {
    let gate: DoorPolicyGate | undefined;
    return {
      check: (door, identity) =>
        (gate ??= new DoorPolicyGate(this.service(PermissionsService))).check(
          door,
          identity
        ),
    };
  }

  async mastra() {
    this.instance ??= new Mastra({
      storage: pStore,
      agents: {
        [CONDUCTOR_AGENT_ID]: buildConductorAgent({
          services: this.service,
          gate: this.gate(),
          memory: createConductorMemory(pStore),
          // Inside the turn's `agent` admission, so every step lands in its
          // ledger; the model is the chat model of role `agent` (flex chain,
          // interactive profile).
          model: ({ organizationId }) =>
            this.aiUsage.prepareModelExecution(
              organizationId,
              'agent',
              async () =>
                (await getAiSdkProvider(organizationId)).chat(
                  await getModelForRole(organizationId, 'agent')
                )
            ),
        }),
      },
      logger: new ConsoleLogger({ level: 'info' }),
    });
    return this.instance;
  }

  /**
   * The approval card's «what and where» for a stored `confirm` call, read
   * with the same services the capabilities use (correctness review W1 F1).
   */
  describeApproval(
    identity: CapabilityIdentity,
    toolName: string | null | undefined,
    args: unknown
  ): Promise<string | null> {
    return describeApprovalCall(
      CAPABILITY_CATALOGUE,
      this.service,
      identity,
      toolName,
      args
    );
  }

  /**
   * The digest of what a stored `confirm` call would send out now, or `null`
   * when its approval binds only the call (review W2 F4).
   */
  approvalContent(
    identity: CapabilityIdentity,
    toolName: string | null | undefined,
    args: unknown
  ): Promise<string | null> {
    return approvalContentDigest(CAPABILITY_CATALOGUE, this.service, identity, toolName, args);
  }

  /** The label of a registry tool in the caller's language (kcxz.29, D5). */
  toolTitle(identity: CapabilityIdentity, toolName: string | null | undefined) {
    return capabilityToolTitle(CAPABILITY_CATALOGUE, toolName, identity.language);
  }

  async conductor() {
    return (await this.mastra()).getAgentById(CONDUCTOR_AGENT_ID);
  }
}
