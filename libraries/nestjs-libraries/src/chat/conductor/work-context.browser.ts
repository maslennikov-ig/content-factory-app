import { z } from 'zod';
import { BrandProfileRepository } from '@contentfactory/nestjs-libraries/content-intelligence/brand-profile/brand-profile.repository';
import { IntegrationRepository } from '@contentfactory/nestjs-libraries/database/prisma/integrations/integration.repository';
import type { CapabilityDeclaration, CapabilityIdentity } from '../capabilities/capability.types';
import type { CapabilityGate } from '../capabilities/capability.admission';
import type { CapabilityServices } from '../capabilities/mastra.adapter';
import { forbiddenWorkContext, invalidWorkContext } from './work-context';

const querySchema = z.object({
  kind: z.enum(['avatar', 'channel']),
  q: z.string().trim().max(200).optional(),
  limit: z.union([z.number(), z.string().regex(/^\d{1,2}$/).transform(Number)]).pipe(z.number().int().min(1).max(50)).optional(),
  cursor: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/).optional(),
  ids: z.string().max(3_096).transform((value) => value.split(',')).pipe(z.array(z.string().regex(/^[A-Za-z0-9_-]{1,128}$/)).min(1).max(24)).optional(),
}).strict().refine((value) => !(value.ids && value.cursor));

type BrowserDependencies = {
  services: CapabilityServices;
  gate: CapabilityGate;
  capabilities: readonly CapabilityDeclaration[];
};

/** A bounded, free metadata reader. It cannot load credentials, corpus or texts. */
export class AgentWorkObjectBrowser {
  constructor(private readonly deps: BrowserDependencies) {}

  async browse(identity: CapabilityIdentity, query: unknown) {
    const parsed = querySchema.safeParse(query);
    if (!parsed.success) throw invalidWorkContext();
    const { kind, q, cursor, ids } = parsed.data;
    const limit = ids ? ids.length : parsed.data.limit ?? 24;
    const capability = this.deps.capabilities.find((one) => one.id === (kind === 'avatar' ? 'avatar.list' : 'channels.list'));
    if (!capability || !(await this.deps.gate.check(capability.door, identity)).allowed) throw forbiddenWorkContext();
    const options = { limit, ...(q ? { q } : {}), ...(cursor ? { cursor } : {}), ...(ids ? { ids } : {}) };
    const rows = kind === 'avatar'
      ? await this.deps.services(BrandProfileRepository).browseAvatars(identity.organizationId, options)
      : await this.deps.services(IntegrationRepository).browseChannels(identity.organizationId, options);
    const items = rows.slice(0, limit).map((row) => {
      if ('activeVersionId' in row) return { id: row.id, name: row.name?.slice(0, 200) ?? null, analysed: !!(row.activeVersionId && row.activeVersion) };
      return { id: row.id, name: row.name?.slice(0, 200) ?? null, disabled: !!row.disabled, refreshNeeded: !!row.refreshNeeded, inBetweenSteps: !!row.inBetweenSteps };
    });
    const hasMore = rows.length > limit;
    return { items, hasMore, cursor: hasMore ? items[items.length - 1]?.id ?? null : null };
  }
}
