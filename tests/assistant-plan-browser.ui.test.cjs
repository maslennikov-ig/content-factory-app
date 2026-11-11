'use strict';

const React = require('react');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://factory.test/' });
Object.assign(global, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, MutationObserver: dom.window.MutationObserver });
global.IS_REACT_ACT_ENVIRONMENT = true;
const { render, fireEvent, waitFor, cleanup } = require('@testing-library/react');
const { SWRConfig } = require('swr');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const h = React.createElement;
let reads;
const videoDrafts=[{id:'22222222-2222-4222-8222-222222222222',pieceId:'11111111-1111-4111-8111-111111111111',version:1,title:'Summit invitation · HeyGen · Russian · Video script · v1',settings:{provider:'heygen',mode:'presenter',locale:'ru'}},
  {id:'33333333-3333-4333-8333-333333333333',pieceId:'11111111-1111-4111-8111-111111111111',version:2,title:'Summit invitation · HeyGen · English · Video script · v2',settings:{provider:'heygen',mode:'presenter',locale:'en'}}];
const response = (id, hasMore = false) => ({ items: [{ id, adaptationId: id, pieceId: `piece-${id}`, postId: `post-${id}`, channelId: 'channel-1', title: `План ${id}`, slot: { status: 'reserved', date: '2026-10-20T10:00:00Z' } }], hasMore, cursor: hasMore ? id : null });
const request = async (path) => {
  reads.push(path);
  const url = new URL(path, 'https://factory.test');
  if(url.pathname==='/media/video-prompts')return {ok:true,json:async()=>videoDrafts};
  return { ok: true, json: async () => response(url.searchParams.has('q') ? 'p026' : url.searchParams.has('cursor') ? 'p024' : 'p000', !url.searchParams.has('cursor') && !url.searchParams.has('q')) };
};
const { AgentWorkspaceBrowserContent } = loadWithMocks('apps/frontend/src/components/agents/agent.workspace-browser.tsx', {
  react: React,
  '@contentfactory/helpers/utils/custom.fetch': { useFetch: () => request },
  '@contentfactory/react/translation/get.transation.service.client': { useT: () => (key) => key },
  '@contentfactory/react/translation/use-interface-language': { useInterfaceLanguage: () => 'ru' },
  '@contentfactory/react/form/button': { Button: ({ children, onClick, disabled }) => h('button', { onClick, disabled }, children) },
  '@contentfactory/react/form/button-link': { ButtonLink: ({ children, href }) => h('a', { href }, children) },
  '@contentfactory/react/form/input': { Input: ({ label, value, onChange }) => h('input', { 'aria-label': label, value, onChange }) },
  '@contentfactory/frontend/components/ui/layers': { Dialog: () => null },
  '@contentfactory/frontend/components/ui/surface': { ErrorState: ({ title }) => h('p', null, title), SkeletonRows: () => h('p', null, 'Loading') },
});
const {SavedVideoDrafts}=loadWithMocks('apps/frontend/src/components/videos/video-drafts.tsx',{
  react:React,
  '@contentfactory/helpers/utils/custom.fetch':{useFetch:()=>request},
  '@contentfactory/react/translation/get.transation.service.client':{useT:()=> (_key,fallback)=>fallback},
  '../layout/user.context':{useUser:()=>({orgId:'org',id:'owner'})},
  '@contentfactory/react/form/button':{Button:({children,onClick})=>h('button',{onClick},children)},
  '@contentfactory/react/form/button-link':{ButtonLink:({children,href})=>h('a',{href},children)},
  '../ui/surface':{ErrorState:({title})=>h('p',null,title),SkeletonRows:()=>h('p',null,'Loading')},
});
afterEach(cleanup);
afterAll(() => dom.window.close());

test('plan page, cursor and search are sent to the shared metadata endpoint; selection keeps the exact target', async () => {
  reads = [];
  const onSelect = jest.fn();
  const view = render(h(SWRConfig, { value: { provider: () => new Map(), dedupingInterval: 0, loadingTimeout: 0 } }, h(AgentWorkspaceBrowserContent, { initialKind: 'plan', onSelect, words: { panel: { loading: 'Loading' }, history: { failedTitle: 'Failed', retry: 'Retry' } } })));
  await waitFor(() => expect(view.getByText('План p000')).toBeTruthy());
  expect(reads[0]).toBe('/agent/workspace/browser?limit=24&kind=plan');
  fireEvent.click(view.getByText('next'));
  await waitFor(() => expect(view.getByText('План p024')).toBeTruthy());
  expect(new URL(reads.at(-1), 'https://factory.test').searchParams.get('cursor')).toBe('p000');
  fireEvent.change(view.getByLabelText('assistant_workspace_search'), { target: { value: 'Материал p026' } });
  await waitFor(() => expect(view.getByText('План p026')).toBeTruthy());
  const search = new URL(reads.at(-1), 'https://factory.test').searchParams;
  expect(search.get('q')).toBe('Материал p026');
  expect(search.has('cursor')).toBe(false);
  expect(view.getByText('previous').disabled).toBe(true);
  fireEvent.click(view.getByText('План p026'));
  expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ kind: 'plan', id: 'p026', data: expect.objectContaining({ pieceId: 'piece-p026', channelId: 'channel-1', adaptationId: 'p026' }) }));
  expect(reads.every((path) => path.startsWith('/agent/workspace/browser?'))).toBe(true);
});
test('canonical media list shows both existing named scripts and opens the English v2 actual draft',async()=>{
  reads=[];
  const view=render(h(SWRConfig,{value:{provider:()=>new Map(),dedupingInterval:0}},h(SavedVideoDrafts)));
  await waitFor(()=>expect(view.getByText(videoDrafts[1].title)).toBeTruthy());
  expect(view.getByText(videoDrafts[0].title)).toBeTruthy();
  const row=view.getByText(videoDrafts[1].title).closest('li');const link=row.querySelector('a');
  const target=new URL(link.getAttribute('href'),'https://factory.test');
  expect(target.pathname).toBe('/media');expect(target.searchParams.get('video')).toBe('1');expect(target.searchParams.get('draftId')).toBe(videoDrafts[1].id);expect(target.searchParams.get('pieceId')).toBe(videoDrafts[1].pieceId);
  expect(view.container.textContent).not.toContain('MP4');expect(reads).toEqual(['/media/video-prompts?metadata=1']);
});
test('existing workspace browser video category selects the saved script reference without generating or duplicating it',async()=>{
  reads=[];const onSelect=jest.fn();
  const view=render(h(SWRConfig,{value:{provider:()=>new Map(),dedupingInterval:0}},h(AgentWorkspaceBrowserContent,{initialKind:'video',onSelect,words:{panel:{loading:'Loading'},history:{failedTitle:'Failed',retry:'Retry'}}})));
  await waitFor(()=>expect(view.getByText(videoDrafts[1].title)).toBeTruthy());fireEvent.click(view.getByText(videoDrafts[1].title));
  expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({kind:'media',id:'library',title:videoDrafts[1].title,data:expect.objectContaining({videoDraftId:videoDrafts[1].id,pieceId:videoDrafts[1].pieceId})}));
  expect(reads).toEqual(['/media/video-prompts?metadata=1']);
});
test('saved video artifact metadata cache keys isolate both actor and workspace',()=>{
  let metadataUser={orgId:'org-a',id:'owner-a'};const keys=[];
  const {useArtifactMetadata}=loadWithMocks('apps/frontend/src/components/agents/agent.artifact-metadata.tsx',{
    swr:Object.assign(key=>{keys.push(key);return {};},{useSWRConfig:()=>({cache:new Map(),mutate:jest.fn()}),unstable_serialize:require('swr').unstable_serialize}),
    '@contentfactory/helpers/utils/custom.fetch':{useFetch:()=>request},
    '../layout/user.context':{useUser:()=>metadataUser},
    '@contentfactory/react/translation/use-interface-language':{useInterfaceLanguage:()=> 'en'},
    '../videos/video.copy':{useVideoWords:()=>({script:'Spoken script',prompt:'Video prompt'})},
    './agent.piece-data':{pieceIdOf:()=>null,useLoadedPiece:()=>null},
    '@contentfactory/frontend/components/channels/channel-parts':{ChannelStatus:()=>null},
    '@contentfactory/frontend/components/content-intelligence/pieces/adaptation.cell':{stateWord:()=>''},
  });
  const artifacts=[{kind:'media',id:'library',title:null,code:null,data:{videoDraftId:videoDrafts[1].id}}];
  for(const user of [{orgId:'org-a',id:'owner-a'},{orgId:'org-a',id:'owner-b'},{orgId:'org-b',id:'owner-a'}]){
    metadataUser=user;useArtifactMetadata(artifacts,true);
  }
  const videoKeys=keys.filter(Array.isArray);
  expect(videoKeys).toHaveLength(3);expect(new Set(videoKeys.map(key=>JSON.stringify(key))).size).toBe(3);
  expect(videoKeys.map(key=>key.slice(1))).toEqual([['org-a','owner-a'],['org-a','owner-b'],['org-b','owner-a']]);
});

test('clip artifact names reuse the same owned per-pilot SWR view while fresh reads only coalesce in flight',async()=>{
  const swr=require('swr');
  const contract=require('./helpers/load-tsx.cjs').loadTypeScriptModule('apps/frontend/src/components/agents/agent.contract.ts');
  const ref={id:'saved-pilot',pieceId:'saved-piece',threadId:'original-chat'};
  const raw={pilotId:ref.id,pieceId:ref.pieceId,threadId:ref.threadId,state:'reviewed',sourceCurrent:true,models:[],outputLocale:'en',sourceTitle:'Saved summit invitation'};
  const artifact={kind:'piece',id:ref.pieceId,title:null,code:null,data:{clipPilotId:ref.id}};
  const key=['clip-preproduction','org','owner',ref.threadId,ref.id], cache=new Map();
  cache.set(swr.unstable_serialize(key),{data:contract.readClipPreproduction(raw,ref)});
  const metadataRequest=jest.fn();
  const {useArtifactMetadata}=loadWithMocks('apps/frontend/src/components/agents/agent.artifact-metadata.tsx',{
    react:React,swr,
    '@contentfactory/helpers/utils/custom.fetch':{useFetch:()=>metadataRequest},
    '../layout/user.context':{useUser:()=>({orgId:'org',id:'owner'})},
    './agent.piece-data':{pieceIdOf:()=>null,useLoadedPiece:()=>null},
    '@contentfactory/frontend/components/channels/channel-parts':{ChannelStatus:()=>null},
    '@contentfactory/frontend/components/content-intelligence/pieces/adaptation.cell':{stateWord:()=>''},
  });
  function Name(){const metadata=useArtifactMetadata([artifact],true,ref.threadId);return h('span',null,metadata.get(artifact)?.name);}
  const view=render(h(SWRConfig,{value:{provider:()=>cache}},h(React.Fragment,null,h(Name),h(Name))));
  await waitFor(()=>expect(view.getAllByText('Higgsfield · EN · Saved summit invitation')).toHaveLength(2));
  expect(metadataRequest).not.toHaveBeenCalled();
  const {clipPreproductionKey,readOwnedClipPreproduction}=loadWithMocks('apps/frontend/src/components/agents/agent.preproduction-read.ts',{'./agent.contract':contract,swr});
  let release;const gate=new Promise(resolve=>{release=resolve;});
  const fresh=jest.fn(async()=>{await gate;return {ok:true,status:200,json:async()=>raw};});
  const first=readOwnedClipPreproduction(clipPreproductionKey('org','owner',ref),ref,fresh);
  const concurrent=readOwnedClipPreproduction(clipPreproductionKey('org','owner',ref),ref,fresh);
  expect(first).toBe(concurrent);release();await first;
  expect(fresh).toHaveBeenCalledTimes(1);
  await readOwnedClipPreproduction(clipPreproductionKey('org','owner',ref),ref,fresh);
  expect(fresh).toHaveBeenCalledTimes(2);
});

test('clip artifact title ignores a saved placeholder and uses the actual saved scenario line',()=>{
  const {clipPreproductionTitle}=loadWithMocks('apps/frontend/src/components/agents/agent.preproduction-read.ts');
  const saved={sourceTitle:'title',outputLocale:'en',scenario:{screenText:'\nMEGACAMPUS SUMMIT / DUBAI\nNext saved line',spokenText:'Saved spoken invitation'}};
  const before=JSON.stringify(saved);
  for(const sourceTitle of ['title','Untitled','Заголовок','без названия','безназвания'])
    expect(clipPreproductionTitle({...saved,sourceTitle})).toBe('Higgsfield · EN · MEGACAMPUS SUMMIT / DUBAI');
  expect(clipPreproductionTitle({...saved,sourceTitle:'Actual authored title'})).toBe('Higgsfield · EN · Actual authored title');
  expect(clipPreproductionTitle({...saved,scenario:{screenText:'\n ',spokenText:'\nSaved spoken invitation\nNext line'}})).toBe('Higgsfield · EN · Saved spoken invitation');
  expect(clipPreproductionTitle({...saved,sourceTitle:'A'.repeat(100)})).toBe(`Higgsfield · EN · ${'A'.repeat(80)}`);
  expect(JSON.stringify(saved)).toBe(before);
});
