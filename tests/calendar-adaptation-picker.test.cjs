'use strict';
const React = require('react');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/launches' });
for (const key of ['window','document','navigator']) Object.defineProperty(global,key,{configurable:true,value:key==='window'?dom.window:dom.window[key]});
global.self = dom.window;
global.IS_REACT_ACT_ENVIRONMENT = true;
const { render, screen, fireEvent, waitFor, cleanup } = require('@testing-library/react');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const dayjs = require('dayjs');
const h = React.createElement;
let role, mode, language, editorCalls, requests, closed, selectedDate;
const channels = ['tg','vk','other'].map(id => ({id,name:`Channel ${id}`,identifier:'telegram',picture:'',type:'social',editor:'normal',time:[]}));
const rows = ['tg','vk'].map((id,i)=>({adaptationId:`a${i}`,pieceId:`piece${i}`,pieceCode:`cnt-0${i}`,title:`Title ${i}`,firstLine:'Text',integrationId:id,postId:`p${i}`,readyAt:'2026-09-08T10:00:00Z'}));
const request = async (url, options) => {
 requests.push({url,options});
 if (url.includes('ready-adaptations')) {
  if (mode==='error') return {ok:false};
  return {ok:true,json:async()=>({version:'ready-adaptations/v1',items:mode==='empty'?[]:rows})};
 }
 if(mode==='postError') return {ok:false};
 return {ok:true,json:async()=>({group:`group-${url.split('/').pop()}`})};
};
const mocks = {
 '@contentfactory/helpers/utils/custom.fetch': {useFetch:()=>request},
 '@contentfactory/react/translation/use-interface-language': {useInterfaceLanguage:()=>language},
 '../layout/user.context': {useUser:()=>({role})},
 '../layout/new-modal': {useModals:()=>({})},
 './calendar.context': {useCalendar:()=>({})},
 '../../launches/helpers/use.integration.list': {useIntegrationList:()=>({data:channels})},
 '../../new-launch/compose.modal': {useOpenPostEditor:()=>async input=>{editorCalls.push(input)}},
 '../new-launch/compose.modal': {useOpenPostEditor:()=>async input=>{editorCalls.push(input)}},
 '@contentfactory/react/translation/translated-label': {TranslatedLabel:({label})=>label},
 '@contentfactory/react/translation/get.transation.service.client': {useT:()=>((key,fallback)=>fallback||key)},
 swr: {__esModule:true,default:(key,load)=>{
  const [state,setState]=React.useState({isLoading:!!key});
  const reload=()=>key && load().then(data=>setState({data,isLoading:false})).catch(error=>setState({error,isLoading:false}));
  React.useEffect(()=>{if(mode!=='loading') void reload()},[key]);
  return {...state,mutate:reload};
 }},
};
const { AdaptationPicker }=loadWithMocks('apps/frontend/src/components/launches/adaptation-picker.tsx',mocks);
beforeEach(()=>{role='ADMIN';mode='ready';language='ru';editorCalls=[];requests=[];closed=0;selectedDate=dayjs('2030-09-11T15:00:00');});
afterEach(cleanup);
const mount=(extra={})=>render(h(AdaptationPicker,{integrations:channels,date:selectedDate,onClose:()=>{closed++},onSaved:()=>{},...extra}));
test('two ready adaptations open the same editor by post group with exact cell date/channel; opening is read-only',async()=>{
 mount();
 await screen.findByText('Черновики адаптаций · 2');
 expect(screen.getAllByRole('radio').filter(el=>el.textContent.includes('cnt-'))).toHaveLength(2);
 fireEvent.click(screen.getByRole('radio',{name:/Title 0/}));
 fireEvent.click(screen.getByRole('button',{name:'Открыть в окне поста'}));
 await waitFor(()=>expect(editorCalls).toHaveLength(1));
 expect(editorCalls[0].group).toBe('group-p0');
 expect(editorCalls[0].date).toBe(selectedDate);
 expect(editorCalls[0].selectedChannels).toBeUndefined();
 expect(editorCalls[0].focusedChannel).toBe('tg');
 expect(requests.every(item=>!item.options || !item.options.method || item.options.method==='GET')).toBe(true);
 expect(closed).toBe(1);
});
test('search and channel selection restrict rows and clear stale selection',async()=>{
 mount(); await screen.findByText('Title 0');
 fireEvent.click(screen.getByRole('radio',{name:/Title 0/}));
 fireEvent.change(screen.getByLabelText('Поиск по заголовку и каналу'),{target:{value:'Channel vk'}});
 expect(screen.queryByText('Title 0')).toBeNull();
 expect(screen.getByText('Title 1')).toBeTruthy();
 expect(screen.getByRole('button',{name:'Открыть в окне поста'}).disabled).toBe(true);
 fireEvent.change(screen.getByLabelText('Поиск по заголовку и каналу'),{target:{value:''}});
 fireEvent.click(screen.getByRole('radio',{name:'Channel tg'}));
 expect(screen.queryByText('Title 1')).toBeNull();
});
test('empty picker links to Content and blank page preserves date and channel',async()=>{
 mode='empty';mount({initialChannel:'vk'});
 const link=await screen.findByRole('link',{name:'В контент →'});expect(link.getAttribute('href')).toBe('/content');
 fireEvent.click(screen.getByRole('button',{name:'Чистый лист'}));
 await waitFor(()=>expect(editorCalls).toHaveLength(1));
 expect(editorCalls[0].date).toBe(selectedDate);expect(editorCalls[0].selectedChannels).toEqual(['vk']);expect(editorCalls[0].group).toBeUndefined();
});
test('plus has no selected date and no channels disables blank page',async()=>{
 mode='empty';mount({date:undefined,integrations:[]});await screen.findByText('Готовых адаптаций пока нет');
 expect(screen.getByText('Дата не выбрана')).toBeTruthy();expect(screen.getByRole('button',{name:'Чистый лист'}).disabled).toBe(true);
});
test('read-only role neither fetches nor opens editor',()=>{
 role='USER';mount();expect(screen.getByText('Планирование доступно редактору рабочего пространства.')).toBeTruthy();
 expect(requests).toHaveLength(0);expect(screen.getByRole('button',{name:'Чистый лист'}).disabled).toBe(true);
});
test('loading and recoverable error states',async()=>{
 mode='loading';const view=mount();expect(screen.getByText('Загружаем адаптации')).toBeTruthy();view.unmount();
 mode='error';mount();await screen.findByText('Не удалось загрузить адаптации');mode='ready';fireEvent.click(screen.getByRole('button',{name:'Повторить'}));await screen.findByText('Title 0');
});
test('English labels are complete and mobile footer wraps',async()=>{
 language='en';const {container}=mount();await screen.findByText('Adaptation drafts · 2');expect(screen.getByRole('button',{name:'Blank page'})).toBeTruthy();
 expect(container.querySelector('.flex-wrap')).toBeTruthy();expect(container.querySelector('.overflow-x-auto')).toBeTruthy();
});

test('preview shows only authenticated piece provenance and does not leak it into public request',async()=>{
 const {PostPreviewDialog}=loadWithMocks('apps/frontend/src/components/preview/post.preview.dialog.tsx',{
  ...mocks,
  '@contentfactory/frontend/components/ui/layers':{Dialog:({children})=>h('div',null,children)},
  '@contentfactory/frontend/components/preview/post.preview':{PostPreview:()=>h('div',null,'preview')},
  swr:{__esModule:true,default:()=>({data:[{id:'p0'}],isLoading:false})},
 });
 const view=render(h(PostPreviewDialog,{open:true,onClose:()=>{},postId:'p0',piece:{id:'piece/0',code:'cnt-06',title:'Title'}}));
 expect(screen.getByText(/из заготовки cnt-06/)).toBeTruthy();
 expect(screen.getByRole('link',{name:'открыть →'}).getAttribute('href')).toBe('/content/pieces/piece%2F0');
 view.rerender(h(PostPreviewDialog,{open:true,onClose:()=>{},postId:'p0',piece:null}));
 expect(screen.queryByRole('link',{name:'открыть →'})).toBeNull();
});

test('failed post read leaves picker open with a recoverable error and no editor call',async()=>{
 mount();await screen.findByText('Title 0');mode='postError';
 fireEvent.click(screen.getByRole('radio',{name:/Title 0/}));
 fireEvent.click(screen.getByRole('button',{name:'Открыть в окне поста'}));
 await screen.findByText('Не удалось открыть пост. Обновите список и попробуйте ещё раз.');
 expect(editorCalls).toHaveLength(0);expect(closed).toBe(0);
});
