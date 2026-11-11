/** A name derived from the saved draft, never a claim that a rendered video exists. */
export function videoDraftTitle(draft: {version?: number; title?: string; settings?: {provider?: string; mode?: string; locale?: string}; brief?: {keyMessage?: string; intent?: string}}): string {
  const provider = draft.settings?.provider === 'heygen' ? 'HeyGen' : draft.settings?.provider === 'higgsfield' ? 'Higgsfield' : 'Video';
  const locale = draft.settings?.locale || '';
  let language = locale.toUpperCase() || '?';
  try { language = new Intl.DisplayNames(['en'], {type: 'language'}).of(locale) || language; } catch { /* Retain the saved locale. */ }
  const kind = draft.settings?.mode === 'presenter' ? 'Video script' : 'Video prompt';
  const rawTopic = (draft.brief?.intent || draft.brief?.keyMessage || kind).replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  const topic = rawTopic.length > 80 ? `${rawTopic.slice(0, 79).trimEnd()}…` : rawTopic;
  return [topic, provider, language, kind, Number.isInteger(draft.version) ? `v${draft.version}` : ''].filter(Boolean).join(' · ');
}
