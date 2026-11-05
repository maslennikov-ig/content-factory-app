import { z } from 'zod';
import type { ContentSourceRegistryRepository } from '../../../source-registry/source-registry.repository';
import type { OptionalAnalyticsDocumentV1, AuthorizedAnalyticsSourceV1 } from './optional-analytics.types';

const point = z.object({
  id: z.string().min(1).max(240), title: z.string().min(1).max(1000), text: z.string().max(8000),
  url: z.string().url().max(2048), accountId: z.string().min(1).max(240),
  accountSize: z.number().finite().nonnegative().optional(), format: z.enum(['post','thread','carousel','story','reel','short','long_video']),
  metric: z.string().min(1).max(100), value: z.number().finite().nonnegative().nullable(),
  observedAt: z.string().datetime(), publishedAt: z.string().datetime(),
  window: z.object({ start: z.string().datetime(), end: z.string().datetime() }).strict(),
}).strict();
const exportSchema = z.object({ version: z.literal(1), provider: z.string().min(1).max(100), entries: z.array(point).max(200) }).strict();

/** A real offline adapter: licensed JSON exports enter through the existing governed source registry. */
export class LicensedAnalyticsExportAdapter {
  readonly id = 'licensed_registry_export_v1';
  readonly estimatedCost = 0;
  constructor(private readonly sources: Pick<ContentSourceRegistryRepository, 'getDraftMaterial'>) {}
  async read(organizationId: string, source: AuthorizedAnalyticsSourceV1, now = new Date()): Promise<OptionalAnalyticsDocumentV1[]> {
    const material = await this.sources.getDraftMaterial(organizationId, source.sourceId);
    if (material.source.organizationId !== organizationId || material.source.id !== source.sourceId || material.snapshot.purgedAt || material.source.archivedAt)
      throw new Error('ANALYTICS_SOURCE_UNAVAILABLE');
    if (material.snapshot.id !== source.sourceRevision || !source.permissionRevision || source.evidence.access !== 'licensed') throw new Error('ANALYTICS_AUTHORITY_MISMATCH');
    const text = material.snapshot.normalizedText;
    if (!text || Buffer.byteLength(text, 'utf8') > 8000 || !material.evidence.some((value) => value.excerpt === text)) throw new Error('ANALYTICS_EXPORT_INVALID');
    const parsed = exportSchema.safeParse(JSON.parse(text));
    if (!parsed.success) throw new Error('ANALYTICS_EXPORT_INVALID');
    const retainedUntil = Math.min(Date.parse(source.retainUntil), now.getTime() + 30 * 86400000,
      ...material.evidence.map((v) => v.freshUntil?.getTime() ?? Infinity));
    if (retainedUntil <= now.getTime()) throw new Error('ANALYTICS_SOURCE_EXPIRED');
    return parsed.data.entries.slice(0, 20).map((entry) => {
      if (Date.parse(entry.window.start) > Date.parse(entry.window.end) || Date.parse(entry.window.end) > Date.parse(entry.observedAt) ||
        Date.parse(entry.publishedAt) > Date.parse(entry.observedAt) || Date.parse(entry.observedAt) > now.getTime() ||
        Date.parse(entry.observedAt) <= now.getTime() - 30 * 86400000) throw new Error('ANALYTICS_WINDOW_INVALID');
      const url = new URL(entry.url);
      if (url.protocol !== 'https:' || url.username || url.password) throw new Error('ANALYTICS_EXPORT_INVALID');
      const host = url.hostname.toLowerCase();
      const isHost = (domain: string) => host === domain || host.endsWith(`.${domain}`);
      const knownOrigin = ['t.me', 'telegram.me', 'telegram.org'].some(isHost) ? 'telegram' : ['youtube.com', 'youtu.be'].some(isHost) ? 'youtube' : null;
      if (knownOrigin && source.evidence.originPlatform !== knownOrigin) throw new Error('ANALYTICS_ORIGIN_MISMATCH');
      const expiry = new Date(Math.min(retainedUntil, Date.parse(entry.observedAt) + 30 * 86400000)).toISOString();
      return { id: `${source.sourceId}:${entry.id}`, title: entry.title, text: entry.text, origin: (source.evidence.originPlatform as OptionalAnalyticsDocumentV1['origin']), retainUntil: expiry,
        evidence: { id: `${source.sourceId}:${material.snapshot.id}:${entry.id}`, sourceId: source.sourceId, source: parsed.data.provider,
          sourceUrl: url.toString(), sourceRevision: material.snapshot.id, capturedAt: entry.observedAt, expiresAt: expiry,
          access: 'licensed', rights: 'permitted', factStatus: 'unknown', originPlatform: (source.evidence.originPlatform as OptionalAnalyticsDocumentV1['origin']),
          ownerScope: organizationId, grantId: source.evidence.grantId, purpose: 'discovery', consentExpiresAt: source.retainUntil,
          note: `Licensed export; account ${entry.accountId}; original observation and window retained. No normalized/cross-owner score.` },
        performance: entry.value === null ? { availability: 'unknown', caveat: 'Export does not contain a measured value.' } : {
          availability: 'available', value: entry.value, metric: entry.metric, window: `${entry.window.start}/${entry.window.end}`,
          format: entry.format, accountSize: entry.accountSize, ageSeconds: Math.floor((Date.parse(entry.observedAt) - Date.parse(entry.publishedAt)) / 1000),
          observedAt: entry.observedAt, caveat: 'Licensed third-party observation; window, account size and format must match before comparison.' },
      };
    });
  }
}
