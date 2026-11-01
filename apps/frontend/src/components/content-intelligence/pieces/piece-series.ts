import type { WorkspaceAdaptationV1 } from './pieces.adapter';

export type AdaptationEdition = {
  key: string;
  series: boolean;
  createdAt: string | null;
  parts: WorkspaceAdaptationV1[];
};

const timestamp = (value: string | null) => {
  const parsed = value ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? parsed : -Infinity;
};

/** Saved identity groups posts; dates order editions, never labels or array positions. */
export function adaptationEditions(rows: readonly WorkspaceAdaptationV1[]): AdaptationEdition[] {
  const groups = new Map<string, AdaptationEdition>();
  for (const row of rows) {
    const series = row.series;
    const grouped = Boolean(series?.id?.trim() && Number.isInteger(series.index) && series.index > 0 &&
      Number.isInteger(series.total) && series.total > 1 && series.index <= series.total);
    const key = JSON.stringify([row.integrationId ?? null, row.platform, grouped ? ['series', series!.id] : ['post', row.id]]);
    let group = groups.get(key);
    if (!group) {
      group = { key, series: grouped, createdAt: null, parts: [] };
      groups.set(key, group);
    }
    group.parts.push(row);
    if (timestamp(row.createdAt) > timestamp(group.createdAt)) group.createdAt = row.createdAt;
  }
  for (const group of groups.values()) {
    if (group.series) group.parts.sort((a, b) => a.series!.index - b.series!.index);
  }
  return [...groups.values()].sort((a, b) => timestamp(b.createdAt) - timestamp(a.createdAt));
}

/** An explicitly opened member wins; ordinary opening starts at the newest edition. */
export function selectedAdaptation(rows: readonly WorkspaceAdaptationV1[], id?: string | null): WorkspaceAdaptationV1 | null {
  return rows.find(row => row.id === id) ?? adaptationEditions(rows)[0]?.parts[0] ?? null;
}
