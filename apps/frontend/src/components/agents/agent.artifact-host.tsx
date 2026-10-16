'use client';

import { useEffect, useState } from 'react';
import { artifactKey, type AgentArtifact } from './agent.contract';
import type { AgentWords } from './agent.copy';
import { ArtifactEditor, type WriteFromLead } from './agent.panel';
import { AssistantArtifactBoundary } from './assistant.workspace-context';

/** One copy of each visited real editor, retained while hidden or another object is selected. */
export function AgentArtifactHost({ artifact, available, words, onDirty, onWriteFromLead, onSelectArtifact }: {
  artifact: AgentArtifact | null;
  available: readonly AgentArtifact[];
  words: AgentWords;
  onDirty: (key: string) => void;
  onWriteFromLead?: WriteFromLead;
  onSelectArtifact: (artifact: AgentArtifact) => void;
}) {
  const [visited, setVisited] = useState<AgentArtifact[]>(() => artifact ? [artifact] : []);
  const activeKey = artifact ? artifactKey(artifact) : null;
  useEffect(() => {
    if (!artifact) return;
    setVisited((previous) => previous.some((one) => artifactKey(one) === artifactKey(artifact))
      ? previous.map((one) => artifactKey(one) === artifactKey(artifact) ? artifact : one)
      : [...previous, artifact]);
  }, [artifact]);
  const availableKeys = new Set(available.map(artifactKey));
  return (
    <AssistantArtifactBoundary>
      {visited.map((one) => {
        const key = artifactKey(one);
        return (
          <div key={key} data-assistant-editor={key} style={{ display: activeKey === key && availableKeys.has(key) ? undefined : 'none' }} className="min-h-full px-[16px] py-[20px] xl:px-[24px]" onInput={(event) => {
            const target = event.target as HTMLElement;
            if (target.matches('[contenteditable="true"]')) onDirty(key);
          }} onChange={(event) => {
            const target = event.target as HTMLElement;
            if (target.matches('select,input:not([type="search"]),textarea')) onDirty(key);
          }}>
            <ArtifactEditor artifact={one} words={words} onWriteFromLead={onWriteFromLead} onSelectArtifact={onSelectArtifact} />
          </div>
        );
      })}
    </AssistantArtifactBoundary>
  );
}
