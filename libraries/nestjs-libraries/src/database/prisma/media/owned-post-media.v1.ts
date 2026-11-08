type StoredMedia = { id: string; path: string; organizationId: string; deletedAt?: Date | null; thumbnail?: string | null; thumbnailTimestamp?: number | null; alt?: string | null; [key: string]: unknown };
type Lookup = { byId: (organizationId: string, id: string) => Promise<StoredMedia | null>; byPath: (organizationId: string, path: string) => Promise<StoredMedia | null>; exists: (id: string) => Promise<boolean> };

function belongsToConfiguredStorage(path: string): boolean {
  if (!/^https:/i.test(path)) return true;
  const target = new URL(path);
  return [process.env.CLOUDFLARE_BUCKET_URL, process.env.FRONTEND_URL && process.env.FRONTEND_URL.replace(/\/$/, '') + '/uploads'].some(value => {
    if (!value) return false;
    const base = new URL(value);
    return target.origin === base.origin && target.pathname.startsWith(base.pathname.replace(/\/$/, '') + '/');
  });
}

/** An ID never grants authority to the client-supplied path alongside it. */
export async function resolveOwnedPostMediaV1(organizationId: string, references: any[], lookup: Lookup) {
  if (!Array.isArray(references) || references.length > 100) throw new Error('MEDIA_REFERENCES_INVALID');
  let changed = false;
  const items = await Promise.all(references.map(async reference => {
    if (!reference || typeof reference !== 'object') throw new Error('MEDIA_REFERENCE_INVALID');
    const external = typeof reference.path === 'string' && !belongsToConfiguredStorage(reference.path);
    const stored = reference.id ? await lookup.byId(organizationId, reference.id)
      : typeof reference.path === 'string' && belongsToConfiguredStorage(reference.path) ? await lookup.byPath(organizationId, reference.path) : undefined;
    if (stored && (stored.organizationId !== organizationId || stored.deletedAt)) throw new Error('MEDIA_NOT_OWNED');
    if (!stored) {
      // Legacy public API IDs may be client attachment labels. They cannot
      // disguise an existing foreign/deleted library ID as an external label.
      if (!external || (reference.id && await lookup.exists(reference.id))) throw new Error('MEDIA_NOT_OWNED');
    }
    const thumbnail = reference.thumbnail !== undefined ? reference.thumbnail : stored?.thumbnail;
    if (thumbnail && belongsToConfiguredStorage(thumbnail)) {
      const cover = await lookup.byPath(organizationId, thumbnail);
      if (!cover || cover.deletedAt || cover.organizationId !== organizationId) throw new Error('MEDIA_COVER_NOT_OWNED');
    }
    if (stored && reference.path !== stored.path) changed = true;
    return { ...reference, ...stored, alt: reference.alt !== undefined ? reference.alt : stored?.alt,
      thumbnail, thumbnailTimestamp: reference.thumbnailTimestamp !== undefined ? reference.thumbnailTimestamp : stored?.thumbnailTimestamp };
  }));
  return { items, changed };
}
