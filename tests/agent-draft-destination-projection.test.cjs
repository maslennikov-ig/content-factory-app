const React=require('react');const {JSDOM}=require('jsdom');
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost/agents/thread'});
for(const key of ['window','document','navigator'])Object.defineProperty(global,key,{configurable:true,value:key==='window'?dom.window:dom.window[key]});
global.IS_REACT_ACT_ENVIRONMENT=true;
const {render,waitFor,cleanup}=require('@testing-library/react');const {SWRConfig}=require('swr');
const {loadTypeScriptModule:load}=require('./helpers/load-tsx.cjs');
const contract=load('apps/frontend/src/components/agents/agent.contract.ts');
const {useVerifiedDraftDestinations}=load('apps/frontend/src/components/agents/agent.revalidate.ts');
const {artifactWorkspaceReducer:reduce,emptyArtifactWorkspace,persistedArtifactSelection}=load('apps/frontend/src/components/agents/agent.workspace-state.ts');
const destination={version:1,kind:'draft',id:'owned-destination',publishable:false,actorId:'actor'};
const created=overrides=>({id:'created',role:'assistant',parts:[{type:'tool-campaign_draft_destination_create',title:'Draft',state:'output-available',output:{ok:true,capability:'campaign.draft_destination_create',summary:{untrustedData:{value:{destination:{...destination,...overrides}}}}}}]});
const channel=id=>({id:'profile',role:'assistant',parts:[{type:'tool-channel_editorial_profile_save',title:'Profile',state:'output-available',output:{ok:true,card:{kind:'channel',id}}},{type:'data-channel',data:{kind:'channel',id}}]});
const artifact=(kind,id)=>({kind,id,title:id,code:null,data:{id}});
afterEach(cleanup);

test('only successful native typed creation for the current actor nominates a draft, with no ID-prefix heuristic',()=>{
 expect(contract.draftDestinationCandidatesOf([created()],'actor','org')).toEqual(['owned-destination']);
 expect(contract.draftDestinationCandidatesOf([created({actorId:'other'})],'actor','org')).toEqual([]);
 expect(contract.draftDestinationCandidatesOf([created({organizationId:'other'})],'actor','org')).toEqual([]);
 expect(contract.draftDestinationCandidatesOf([created({kind:'channel',id:'draft-real-channel'})],'actor','org')).toEqual([]);
 const failed=created();failed.parts[0].output.ok=false;
 expect(contract.draftDestinationCandidatesOf([failed],'actor','org')).toEqual([]);
});

test('verified projection removes only the false channel reference, retains immutable history and current campaign/piece selection through reload',()=>{
 const history=[created(),channel('owned-destination'),channel('draft-real-channel')];const original=JSON.stringify(history);
 const verified=new Set(['owned-destination']);
 expect(contract.artifactsOf(history).map(a=>a.id)).toContain('owned-destination');
 expect(contract.artifactsOf(history,verified).map(a=>a.id)).toEqual(['draft-real-channel']);
 expect(contract.readMessageBlocks(history[1],[],new Set(),[],verified).some(b=>b.type==='artifact')).toBe(false);
 let state=reduce(emptyArtifactWorkspace(),{type:'produced',artifacts:[artifact('channel','owned-destination'),artifact('channel','draft-real-channel'),artifact('piece','piece'),artifact('campaign','current')]});
 state=reduce(state,{type:'select',artifact:artifact('campaign','current')});state=reduce(state,{type:'dirty',key:'piece:piece'});
 const repaired=reduce(state,{type:'produced',artifacts:contract.artifactsOf(history,verified),draftDestinationIds:[...verified]});
 expect(repaired.active).toBe('campaign:current');expect(repaired.dirty).toEqual(['piece:piece']);
 const saved={version:'assistant-workspace/v1',...persistedArtifactSelection(repaired),workContext:{version:'assistant-work-context/v1',kind:'campaign',id:'current'}};
 expect(saved.artifacts.map(a=>a.id)).toEqual(['piece','current','draft-real-channel']);
 expect(contract.withoutDraftChannelRefs(saved,verified)).toBe(saved);
 const raw={...saved,artifacts:[{kind:'channel',id:'owned-destination'},...saved.artifacts]};
 expect(contract.withoutDraftChannelRefs(raw,verified)).toEqual(saved);
 const reloaded=reduce(emptyArtifactWorkspace(false),{type:'restore',artifacts:saved.artifacts.map(contract.refToArtifact),workspace:saved});
 expect(reloaded.active).toBe('campaign:current');expect(reloaded.artifacts.some(a=>a.id==='owned-destination')).toBe(false);
 expect(JSON.stringify(history)).toBe(original);
});

function drawProof({scope={organizationId:'org',actorId:'actor',threadId:'thread'},candidates=['owned-destination'],request}){
 let latest;function Probe(){latest=useVerifiedDraftDestinations(candidates,scope,request);return React.createElement('span',null,latest.pending?'pending':[...latest.ids].join(','));}
 const value={provider:()=>new Map(),dedupingInterval:0,loadingTimeout:0,revalidateOnFocus:false};
 const view=render(React.createElement(SWRConfig,{value},React.createElement(Probe)));
 return {view,current:()=>latest,Probe,value};
}

test.each(['missing','forbidden','network','connected','foreign_actor','foreign_org'])('failed or unknown current server proof (%s) preserves the channel',async mode=>{
 const request=jest.fn(async()=>{
  if(mode==='network')throw Error('offline');
  if(mode==='missing'||mode==='forbidden')return {ok:false,status:mode==='missing'?404:403};
  return {ok:true,json:async()=>({profile:{channelId:'owned-destination'},...(mode==='connected'?{}:{destination:{...destination,...(mode==='foreign_actor'?{actorId:'other'}:{}),...(mode==='foreign_org'?{organizationId:'other'}:{})}})})};
 });
 const proof=drawProof({request});await waitFor(()=>expect(proof.current()?.pending).toBe(false));
 expect([...proof.current().ids]).toEqual([]);expect(request).toHaveBeenCalledWith('/social-factory/channels/owned-destination/profile');
 expect(contract.artifactsOf([channel('owned-destination')],proof.current().ids)).toHaveLength(1);
});

test('verification is read-only, holds pending state and isolates cached proof by org, actor and thread',async()=>{
 let finish;const response=new Promise(resolve=>{finish=resolve;});
 const request=jest.fn(()=>response);const scope={organizationId:'org',actorId:'actor',threadId:'thread'};
 const first=drawProof({scope,request});
 await waitFor(()=>expect(first.current()?.pending).toBe(true));
 finish({ok:true,json:async()=>({profile:{channelId:'owned-destination'},destination})});
 await waitFor(()=>expect([...first.current().ids]).toEqual(['owned-destination']));
 first.view.unmount();
 for(const changed of [{organizationId:'other'},{actorId:'other'},{threadId:'other'}]){
  let latest;const nextScope={...scope,...changed};
  const nextRequest=jest.fn(async()=>({ok:false,status:404}));
  function Next(){latest=useVerifiedDraftDestinations(['owned-destination'],nextScope,nextRequest);return null;}
  const view=render(React.createElement(SWRConfig,{value:first.value},React.createElement(Next)));
  await waitFor(()=>expect(nextRequest).toHaveBeenCalledTimes(1));await waitFor(()=>expect(latest.pending).toBe(false));
  expect([...latest.ids]).toEqual([]);view.unmount();
 }
 expect(request.mock.calls.every(args=>args.length===1)).toBe(true);
});
