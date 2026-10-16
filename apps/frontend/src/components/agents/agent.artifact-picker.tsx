'use client';

import { useRef, useState } from 'react';
import useSWR from 'swr';
import { Button } from '@contentfactory/react/form/button';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { Dialog } from '@contentfactory/frontend/components/ui/layers';
import { Input } from '@contentfactory/react/form/input';
import { ConfirmButton } from '@contentfactory/frontend/components/ui/confirm-button';
import { PIECES_API, fetchPieceDetail } from '@contentfactory/frontend/components/content-intelligence/pieces/pieces.adapter';
import { artifactKey, type AgentArtifact } from './agent.contract';
import { artifactName } from './agent.cards';
import type { AgentWords } from './agent.copy';
import { AgentArtifactLiveStatus, useArtifactMetadata, type ArtifactMetadata } from './agent.artifact-metadata';
import { withPieceData } from './agent.piece-data';

function ArtifactPickerRow({ artifact, selected, onSelect, onRemove, words, metadata, metadataKnown }: {
  artifact: AgentArtifact;
  selected: boolean;
  onSelect: (artifact: AgentArtifact) => void;
  onRemove: (key: string) => void;
  words: AgentWords;
  metadata?: ArtifactMetadata;
  metadataKnown: boolean;
}) {
  const t = useT();
  const request = useFetch();
  const pieceId = artifact.kind === 'piece' ? artifact.id : typeof artifact.data.pieceId === 'string' ? artifact.data.pieceId : null;
  const detail = useSWR(pieceId ? PIECES_API.detail(pieceId) : null, () => fetchPieceDetail(async (url) => {
    const response = await request(url);
    if (!response.ok) throw new Error(String(response.status));
    return response;
  }, pieceId!), { revalidateOnFocus: false });
  const unavailable = detail.error && /404|403/.test(String(detail.error)) || metadataKnown && !metadata;
  const enriched = withPieceData(artifact, detail.data ?? null);
  const name = metadata?.name || (artifact.kind === 'piece' && detail.data?.piece.title ? detail.data.piece.title : artifactName(enriched, words));
  return (
    <li className="flex min-w-0 items-center gap-[8px] border-b border-cf-border py-[8px] last:border-b-0">
      <Button type="button" variant={selected ? 'secondary' : 'quiet'} className="min-w-0 flex-1 justify-start" innerClassName="min-w-0 flex-1 justify-start" disabled={!!unavailable} onClick={() => onSelect({ ...artifact, title: name })}>
        <span className="flex min-w-0 flex-1 flex-col items-start text-start">
          <span className="max-w-full truncate cf-label-md">{name}</span>
          <span className="cf-caption text-cf-ink-muted">{unavailable ? t('assistant_context_unavailable', 'This object is no longer available') : words.card.kinds[artifact.kind]}</span>
          {!unavailable ? <AgentArtifactLiveStatus artifact={enriched} metadata={metadata} /> : null}
        </span>
      </Button>
      {unavailable ? <ConfirmButton label={t('remove', 'Remove')} armedLabel={t('remove', 'Remove')} onConfirm={() => onRemove(artifactKey(artifact))} /> : null}
      {detail.error && !unavailable ? <Button type="button" density="dense" variant="quiet" onClick={() => void detail.mutate()}>{words.history.retry}</Button> : null}
    </li>
  );
}

/** Distinct objects of this personal thread; opening the chooser never sends a message. */
export function AgentArtifactPicker({ artifacts, active, unread, onSelect, onRemove, words }: {
  artifacts: readonly AgentArtifact[];
  active: string | null;
  unread: number;
  onSelect: (artifact: AgentArtifact) => void;
  onRemove: (key: string) => void;
  words: AgentWords;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const ordered = [...artifacts].reverse();
  const knownNames = useRef(new Map<string, string>());
  const search = query.trim().toLocaleLowerCase();
  const visible = ordered.filter((artifact) => !search || (knownNames.current.get(artifactKey(artifact)) || artifactName(artifact, words)).toLocaleLowerCase().includes(search));
  const paged = visible.slice(page * 24, (page + 1) * 24);
  const metadata = useArtifactMetadata(paged, open);
  for (const artifact of paged) {
    const name = metadata.get(artifact)?.name;
    if (name) knownNames.current.set(artifactKey(artifact), name);
  }
  return (
    <>
      <Button type="button" density="dense" variant="quiet" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
        {t('assistant_artifacts', 'Artifacts')} · {artifacts.length}
        {unread ? <span className="rounded-full bg-cf-accent-soft px-[8px] cf-caption text-cf-accent" aria-label={t('assistant_new_artifact', 'New artifact')}>{unread}</span> : null}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={t('assistant_artifacts', 'Artifacts')}>
        <div className="flex min-w-0 flex-col gap-[12px]">
          <Input standalone name="artifacts-search" value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} label={t('assistant_artifact_search', 'Search artifacts')} />
          {metadata.error ? <div role="status" className="flex items-center gap-[8px] cf-body-sm text-cf-ink-muted">{words.history.failedTitle}<Button type="button" variant="quiet" density="dense" onClick={metadata.retry}>{words.history.retry}</Button></div> : null}
          {!visible.length ? <p className="cf-body-sm text-cf-ink-muted">{search ? t('assistant_no_results', 'No matching objects') : t('assistant_artifacts_empty', 'No artifacts in this conversation yet')}</p> : (
            <ul className="max-h-[56dvh] overflow-y-auto">
              {paged.map((artifact) => <ArtifactPickerRow key={artifactKey(artifact)} artifact={artifact} selected={active === artifactKey(artifact)} metadata={metadata.get(artifact)} metadataKnown={metadata.known(artifact)} words={words} onRemove={onRemove} onSelect={(selected) => { onSelect(selected); setOpen(false); }} />)}
            </ul>
          )}
          {visible.length > 24 ? <div className="flex justify-end gap-[8px]"><Button type="button" variant="quiet" density="dense" disabled={page === 0} onClick={() => setPage(page - 1)}>{t('previous', 'Previous')}</Button><Button type="button" variant="quiet" density="dense" disabled={(page + 1) * 24 >= visible.length} onClick={() => setPage(page + 1)}>{t('next', 'Next')}</Button></div> : null}
        </div>
      </Dialog>
    </>
  );
}
