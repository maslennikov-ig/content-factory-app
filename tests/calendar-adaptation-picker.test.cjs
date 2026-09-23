'use strict';
/**
 * «Что публикуем» — the calendar's picker of ready adaptations.
 *
 * `97dq.50`, direction A of the 23.09.2026 canvas: choosing leads to the
 * piece's channel tab with the slot date (`?when=`), never to the old post
 * editor; «Чистый лист» became a quiet «+ Новая заготовка»; rows do not shrink
 * in the scrolling list (the overlap on screenshot B6_2).
 */
const React = require('react');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/launches' });
for (const key of ['window','document','navigator']) Object.defineProperty(global,key,{configurable:true,value:key==='window'?dom.window:dom.window[key]});
global.self = dom.window;
global.IS_REACT_ACT_ENVIRONMENT = true;
const { render, screen, fireEvent, cleanup, act } = require('@testing-library/react');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const dayjs = require('dayjs');
const h = React.createElement;
let role, mode, language, editorCalls, requests, closed, selectedDate, pushed, placeOk;
const channels = ['tg','vk','other'].map(id => ({id,name:`Channel ${id}`,identifier:'telegram',picture:'',type:'social',editor:'normal',time:[]}));
const rows = ['tg','vk'].map((id,i)=>({adaptationId:`a${i}`,pieceId:`piece${i}`,pieceCode:`cnt-0${i}`,title:`Title ${i}`,firstLine:'Text',integrationId:id,postId:`p${i}`,readyAt:'2026-09-08T10:00:00Z'}));
const request = async (url, options) => {
 requests.push({url,options});
 if (url.includes('/place')) return {ok:placeOk,json:async()=>({placement:{mode:'reserve',status:'reserved',date:'2030-09-11T15:00:00.000Z',autopilot:false,note:null}})};
 if (url.includes('ready-adaptations')) {
  if (mode==='error') return {ok:false};
  if (mode==='slots') return {ok:true,json:async()=>({version:'ready-adaptations/v1',items:[
   {...rows[0],slot:{status:'reserved',date:'2030-09-13T06:20:00Z',autopilot:false}},
   {...rows[1],slot:{status:'queued',date:'2030-09-13T06:20:00Z',autopilot:true}},
   {...rows[0],adaptationId:'a7',pieceId:'piece7',title:'Title 7',postId:'p7',slot:{status:'free',date:null,autopilot:false}},
  ]})};
  return {ok:true,json:async()=>({version:'ready-adaptations/v1',items:mode==='empty'?[]:mode==='twins'?[...rows,{...rows[0],adaptationId:'a9',firstLine:'Second version text',postId:'p9'}]:rows})};
 }
 return {ok:true,json:async()=>({})};
};
const mocks = {
 '@contentfactory/helpers/utils/custom.fetch': {useFetch:()=>request},
 '@contentfactory/react/translation/use-interface-language': {useInterfaceLanguage:()=>language},
 '../layout/user.context': {useUser:()=>({role})},
 '../layout/new-modal': {useModals:()=>({})},
 'next/navigation': {useRouter:()=>({push:href=>{pushed.push(href)}})},
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
beforeEach(()=>{role='ADMIN';mode='ready';language='ru';editorCalls=[];requests=[];closed=0;pushed=[];placeOk=true;selectedDate=dayjs('2030-09-11T15:00:00');});
// jsdom cannot navigate; the href is what the test reads.
document.addEventListener('click',event=>event.preventDefault());
afterEach(cleanup);
const mount=(extra={})=>render(h(AdaptationPicker,{integrations:channels,date:selectedDate,onClose:()=>{closed++},...extra}));

test('«Поставить на HH:mm» places the adaptation at the slot, then leads to the piece channel tab with the slot date (97dq.57)',async()=>{
 mount();
 await screen.findByText('Готовые адаптации · 2');
 expect(screen.getByRole('button',{name:'Поставить на 15:00'}).disabled).toBe(true);
 fireEvent.click(screen.getByRole('radio',{name:/Title 0/}));
 expect(screen.getByRole('button',{name:'Поставить на 15:00'}).disabled).toBe(false);
 await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Поставить на 15:00'}));});
 const write=requests.find(item=>item.options && item.options.method==='POST');
 expect(write.url).toBe('/content-intelligence/pieces/piece0/adaptations/a0/place?language=ru');
 expect(new Date(JSON.parse(write.options.body).date).getTime()).toBe(selectedDate.toDate().getTime());
 expect(pushed).toHaveLength(1);
 const url=new URL(pushed[0],'http://localhost');
 expect(url.pathname).toBe('/content/pieces/piece0');
 expect(url.searchParams.get('tab')).toBe('tg');
 expect(new Date(url.searchParams.get('when')).getTime()).toBe(selectedDate.toDate().getTime());
 expect(closed).toBe(1);
 expect(editorCalls).toHaveLength(0);
});

test('a refused placement stays in the window with words and navigates nowhere',async()=>{
 placeOk=false;mount();
 await screen.findByText('Title 0');
 fireEvent.click(screen.getByRole('radio',{name:/Title 0/}));
 await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Поставить на 15:00'}));});
 expect(screen.getByRole('alert').textContent).toContain('Не удалось поставить адаптацию');
 expect(pushed).toHaveLength(0);
 expect(closed).toBe(0);
});

test('rows say where the adaptation stands: planned and queued with their time, a draft without one is free (97dq.57)',async()=>{
 mode='slots';mount();
 await screen.findByText('Title 0');
 const slots=[...document.querySelectorAll('[data-picker-slot]')].map(el=>[el.getAttribute('data-picker-slot'),el.textContent]);
 const at=new Date('2030-09-13T06:20:00Z');
 const two=v=>String(v).padStart(2,'0');
 const moment=`${new Intl.DateTimeFormat('ru',{weekday:'short'}).format(at).replace('.','')} ${two(at.getDate())}.${two(at.getMonth()+1)} ${two(at.getHours())}:${two(at.getMinutes())}`;
 expect(slots).toEqual([
  ['reserved',`в плане · ${moment}`],
  ['queued',`в очереди · ${moment} · автопилот`],
  ['free','свободна'],
 ]);
});

test('rows: one-line title, caption «cnt-… · канал · готово DD.MM», and rows never shrink in the scrolling list',async()=>{
 mount();
 await screen.findByText('Title 0');
 const radios=screen.getAllByRole('radio').filter(el=>el.textContent.includes('cnt-'));
 expect(radios).toHaveLength(2);
 for (const radio of radios) expect(radio.className).toContain('shrink-0');
 expect(radios[0].textContent).toContain('cnt-00 · Channel tg · готово 08.09');
 expect(screen.getByText('Title 0').className).toContain('truncate');
 expect(screen.queryByText(/окне поста/)).toBeNull();
});

test('without a date the primary reads «Выбрать» and leads to the tab without `when`',async()=>{
 mount({date:undefined});
 await screen.findByText('Title 0');
 expect(screen.getByText('Дата не выбрана')).toBeTruthy();
 fireEvent.click(screen.getByRole('radio',{name:/Title 1/}));
 const href=screen.getByRole('link',{name:'Выбрать'}).getAttribute('href');
 expect(href).toBe('/content/pieces/piece1?tab=vk');
});

test('search and channel selection restrict rows and clear stale selection',async()=>{
 mount(); await screen.findByText('Title 0');
 fireEvent.click(screen.getByRole('radio',{name:/Title 0/}));
 fireEvent.change(screen.getByLabelText('Поиск по заголовку и каналу'),{target:{value:'Channel vk'}});
 expect(screen.queryByText('Title 0')).toBeNull();
 expect(screen.getByText('Title 1')).toBeTruthy();
 expect(screen.getByRole('button',{name:'Поставить на 15:00'}).disabled).toBe(true);
 fireEvent.change(screen.getByLabelText('Поиск по заголовку и каналу'),{target:{value:''}});
 fireEvent.click(screen.getByRole('radio',{name:'Channel tg'}));
 expect(screen.queryByText('Title 1')).toBeNull();
});

test('«+ Новая заготовка» replaces the blank page and links to the brief tab',async()=>{
 mode='empty';mount({initialChannel:'vk'});
 const link=await screen.findByRole('link',{name:'В контент →'});expect(link.getAttribute('href')).toBe('/content');
 expect(screen.queryByText('Чистый лист')).toBeNull();
 expect(screen.queryByText('пост без конвейера')).toBeNull();
 const fresh=screen.getByRole('link',{name:'Новая заготовка'});
 expect(fresh.getAttribute('href')).toBe('/content?tab=brief');
 fireEvent.click(fresh);expect(closed).toBe(1);expect(editorCalls).toHaveLength(0);
});

test('no channels: the picker points to Channels',async()=>{
 mode='empty';mount({date:undefined,integrations:[]});await screen.findByText('Готовых адаптаций пока нет');
 expect(screen.getByRole('link',{name:'Все каналы →'}).getAttribute('href')).toBe('/channels');
});

test('read-only role neither fetches nor offers a new piece',()=>{
 role='USER';mount();expect(screen.getByText('Планирование доступно редактору рабочего пространства.')).toBeTruthy();
 expect(requests).toHaveLength(0);expect(screen.getByRole('link',{name:'Новая заготовка'}).getAttribute('aria-disabled')).toBe('true');
});

test('loading and recoverable error states',async()=>{
 mode='loading';const view=mount();expect(screen.getByText('Загружаем адаптации')).toBeTruthy();view.unmount();
 mode='error';mount();await screen.findByText('Не удалось загрузить адаптации');mode='ready';fireEvent.click(screen.getByRole('button',{name:'Повторить'}));await screen.findByText('Title 0');
});

test('English labels are complete and mobile footer wraps',async()=>{
 language='en';const {container}=mount();await screen.findByText('Ready adaptations · 2');
 expect(screen.getByRole('link',{name:'New piece'})).toBeTruthy();
 expect(screen.getByRole('button',{name:'Place at 15:00'})).toBeTruthy();
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

/*
  Twelfth stand walk (23.09.2026): the slot's channel was not preselected,
  two adaptations of one piece to one channel looked like one duplicated row,
  and a channel without a picture drew the white placeholder disc.
*/
test('the slot channel is preselected; a channel with nothing ready falls back to «Все каналы»',async()=>{
 const view=mount({initialChannel:'vk'});
 await screen.findByText('Title 1');
 expect(screen.queryByText('Title 0')).toBeNull();
 expect(screen.getByRole('radio',{name:'Channel vk'}).getAttribute('aria-checked')).toBe('true');
 view.unmount();
 mount({initialChannel:'other'});
 await screen.findByText('Title 0');
 expect(screen.getByText('Title 1')).toBeTruthy();
 expect(screen.getByRole('radio',{name:'Все каналы'}).getAttribute('aria-checked')).toBe('true');
});

test('two adaptations of one piece to one channel are named by their own text',async()=>{
 mode='twins';mount();
 await screen.findByText('Second version text');
 expect(screen.getByText('Готовые адаптации · 3').className).toContain('whitespace-nowrap');
 expect(screen.queryByText('Title 0')).toBeNull();
 expect(screen.getAllByText('Text')).toHaveLength(1);
 expect(screen.getByText('Title 1')).toBeTruthy();
});

test('a channel with the placeholder picture shows its two-letter mark, not the white disc',async()=>{
 mount({integrations:channels.map(one=>({...one,picture:'/no-picture.jpg'}))});
 await screen.findByText('Title 0');
 expect(document.querySelector('img[src="/no-picture.jpg"]')).toBeNull();
 expect(screen.getAllByText('CT').length).toBeGreaterThan(0);
});
