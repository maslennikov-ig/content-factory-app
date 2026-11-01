import { artifactChannelId, readSavedAdaptationQualityReview, type AgentBlock } from './agent.contract';

type ArtifactBlock = Extract<AgentBlock, { type: 'artifact' }>;
export type SeriesGroup = { type: 'series'; key: string; members: ArtifactBlock[] };
export type ConversationGroup = SeriesGroup | { type: 'blocks'; blocks: AgentBlock[] };

/** Existing native generation reviews the collection; its carrier is not its scope. */
export function seriesQualityReview(members: SeriesGroup['members']) {
  const identity = members[0] && seriesIdentity(members[0]);
  if (!identity) return null;
  const reviews = members
    .filter(member => !member.removed && seriesIdentity(member)?.key === identity.key)
    .map(member => readSavedAdaptationQualityReview(member.artifact.data))
    .filter((review): review is NonNullable<typeof review> => review !== null);
  if (!reviews.length) return null;
  return {
    status: reviews.every(review => review.status === 'unavailable') ? 'unavailable' as const : 'partial' as const,
    missingRequirements: [...new Set(reviews.flatMap(review => review.missingRequirements))],
    unsupportedClaims: [...new Set(reviews.flatMap(review => review.unsupportedClaims))],
  };
}

/** Only server identity joins members; arbitrary intervening blocks stay in place. */
export function seriesIdentity(block: AgentBlock): { key: string; index: number } | null {
  if (block.type !== 'artifact' || block.artifact.kind !== 'adaptation') return null;
  const { data } = block.artifact;
  const series = data.series;
  const piece = data.pieceId;
  const channel = artifactChannelId(block.artifact);
  if (!series || typeof series !== 'object' || !('id' in series) || !('index' in series) || !('total' in series)) return null;
  const { id, index, total } = series;
  if (typeof id !== 'string' || !id.trim() || typeof piece !== 'string' || !piece.trim() || !channel ||
      typeof index !== 'number' || !Number.isInteger(index) || index < 1 ||
      typeof total !== 'number' || !Number.isInteger(total) || total <= 1 || total < index) return null;
  return { key: JSON.stringify([piece, channel, id, total]), index };
}

/** Group at the first occurrence, without changing the underlying artifacts. */
export function groupSeriesBlocks(groups: readonly AgentBlock[][]): ConversationGroup[] {
  const output: ConversationGroup[] = [];
  const byId = new Map<string, SeriesGroup>();
  for (const blocks of groups) {
    const identity = blocks.length === 1 ? seriesIdentity(blocks[0]) : null;
    if (!identity) { output.push({ type: 'blocks', blocks }); continue; }
    let group = byId.get(identity.key);
    if (!group) {
      group = { type: 'series', key: identity.key, members: [] };
      byId.set(identity.key, group);
      output.push(group);
    }
    group.members.push(blocks[0] as ArtifactBlock);
  }
  for (const group of byId.values()) group.members.sort((a, b) => seriesIdentity(a)!.index - seriesIdentity(b)!.index);
  return output;
}
