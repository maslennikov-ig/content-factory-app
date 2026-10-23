import { artifactKey, type AgentArtifact, type AgentWorkspaceV1 } from './agent.contract';

const keyOf = artifactKey;

export type ArtifactWorkspaceState = {
  artifacts: AgentArtifact[];
  active: string | null;
  activeSource: 'produced' | 'selected' | 'restored' | null;
  hidden: boolean;
  dirty: readonly string[];
  unread: readonly string[];
  ready: boolean;
  interacted: boolean;
};

export const emptyArtifactWorkspace = (ready = true): ArtifactWorkspaceState => ({
  artifacts: [], active: null, activeSource: null, hidden: false, dirty: [], unread: [], ready, interacted: false,
});

export const distinctArtifacts = (artifacts: readonly AgentArtifact[]): AgentArtifact[] => {
  const distinct = new Map<string, AgentArtifact>();
  for (const artifact of artifacts) {
    const key = keyOf(artifact);
    const previous = distinct.get(key);
    distinct.delete(key);
    distinct.set(key, previous ? {
      ...previous, ...artifact,
      title: artifact.title ?? previous.title,
      code: artifact.code ?? previous.code,
      data: { ...previous.data, ...artifact.data },
    } : artifact);
  }
  return [...distinct.values()];
};

type WorkspaceAction =
  | { type: 'produced'; artifacts: readonly AgentArtifact[] }
  | { type: 'select'; artifact: AgentArtifact }
  | { type: 'hide' }
  | { type: 'dirty'; key: string }
  | { type: 'remove'; key: string }
  | { type: 'restore'; artifacts: readonly AgentArtifact[]; workspace: AgentWorkspaceV1 | null };

/** Pure selection transitions: receiving a result never overrides a hidden or edited pane. */
export function artifactWorkspaceReducer(state: ArtifactWorkspaceState, action: WorkspaceAction): ArtifactWorkspaceState {
  if (action.type === 'hide') return { ...state, hidden: true, unread: [], interacted: true };
  if (action.type === 'dirty') return state.dirty.includes(action.key) ? state : {
    ...state, dirty: [...state.dirty, action.key],
  };
  if (action.type === 'remove') return {
    ...state,
    artifacts: state.artifacts.filter((artifact) => keyOf(artifact) !== action.key),
    active: state.active === action.key ? null : state.active,
    activeSource: state.active === action.key ? null : state.activeSource,
    dirty: state.dirty.filter((key) => key !== action.key),
    unread: state.unread.filter((key) => key !== action.key),
  };
  if (action.type === 'restore') {
    const artifacts = distinctArtifacts([...action.artifacts, ...state.artifacts]);
    if (state.interacted) return { ...state, artifacts, ready: true };
    const saved = action.workspace?.activeArtifact;
    const active = saved ? artifactKey(saved) : action.workspace ? null : artifacts.at(-1) ? keyOf(artifacts.at(-1)!) : null;
    return { ...state, artifacts, active, activeSource: 'restored', hidden: !!action.workspace && !saved, ready: true };
  }
  const incoming = action.type === 'select' ? [action.artifact] : action.artifacts;
  const artifacts = distinctArtifacts([...state.artifacts, ...incoming]);
  if (action.type === 'select') return {
    ...state, artifacts, active: keyOf(action.artifact), activeSource: 'selected', hidden: false, unread: [], interacted: true,
  };
  const latest = incoming.at(-1);
  const previous = new Set(state.artifacts.map(keyOf));
  const newKeys = incoming.map(keyOf).filter((key) => !previous.has(key));
  const protectedPane = state.hidden || !!state.active && state.dirty.includes(state.active);
  const activate = latest && newKeys.includes(keyOf(latest)) && state.ready && !protectedPane;
  return {
    ...state, artifacts,
    active: activate ? keyOf(latest) : state.active,
    activeSource: activate ? 'produced' : state.activeSource,
    unread: protectedPane ? [...new Set([...state.unread, ...newKeys])] : state.unread,
  };
}

/** Save only bounded refs; the selected object always remains in the same payload. */
export const persistedArtifactSelection = (state: ArtifactWorkspaceState) => {
  const active = state.hidden ? null : state.artifacts.find((artifact) => keyOf(artifact) === state.active) ?? null;
  const latest = state.artifacts.slice(-24);
  if (active && !latest.some((artifact) => keyOf(artifact) === keyOf(active))) latest[0] = active;
  return { artifacts: latest, activeArtifact: active };
};
