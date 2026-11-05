const React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const {JSDOM}=require('jsdom');
const {loadWithMocks}=require('./helpers/load-ts-with-mocks.cjs');
const {loadTypeScriptModule}=require('./helpers/load-tsx.cjs');
const base='apps/frontend/src/components/content-intelligence/pieces/';
const shared=loadTypeScriptModule(base+'adaptation.cell.tsx');
const {piecesCopy}=loadTypeScriptModule(base+'pieces.copy.ts');
let locale='ru';
let renderedButtons=[];
const states=[['published'],['scheduled'],['failed',{}],['preparing'],['ready'],['uncertain'],['failed']];
const data={campaign:{id:'campaign',name:'Campaign',mode:'prepare_approve',state:'active',timeZone:'UTC',itemIds:[],allocations:[]},items:states.map(([state,delivery],index)=>({id:String(index),state,delivery,channelId:'channel',platform:'telegram',format:'post',scheduledAt:'2030-01-01T12:00:00Z',contentRevision:1,approvalDigest:'digest'})),findings:[],decisions:[]};
const {SocialFactoryCampaign}=loadWithMocks('apps/frontend/src/components/social-factory/campaign.tsx',{
 react:React,swr:{__esModule:true,default:()=>({data,isLoading:false,error:null,mutate:async()=>{}})},
 '@contentfactory/helpers/utils/custom.fetch':{useFetch:()=>async()=>{throw Error('No request is needed to render saved states');}},
 '@contentfactory/react/translation/use-interface-language':{useInterfaceLanguage:()=>locale},
 '@contentfactory/react/form/button':{Button:props=>{renderedButtons.push(props);return null;}},'@contentfactory/react/form/button-link':{ButtonLink:()=>null},
 '@contentfactory/react/form/select':{Select:({name,value,children})=>React.createElement('select',{name,value,onChange:()=>{}},children)},'@contentfactory/react/form/textarea':{Textarea:()=>null},
 '../ui/surface':{Status:({tone,children})=>React.createElement('span',{'data-tone':tone},children)},
 '../agents/agent.cards':{AgentCard:({children,aside})=>React.createElement('section',null,aside,children)},
 '../agents/agent.markdown':{AgentMarkdown:()=>null},
 '../content-intelligence/pieces/adaptation.cell':shared,
 '../content-intelligence/pieces/pieces.copy':{piecesCopy},
});

test.each(['collaborative','prepare_approve','autopilot'])('saved %s mode remains selected and the chat preparation request respects it', mode=>{
 locale='ru';data.campaign.mode=mode;renderedButtons=[];
 const onRequest=jest.fn();
 const dom=new JSDOM(renderToStaticMarkup(React.createElement(SocialFactoryCampaign,{campaignId:'campaign',onRequest})));
 try {
  const select=dom.window.document.querySelector('select[name="campaign-mode"]');
  expect([...select.options].map(option=>option.value)).toEqual(['collaborative','prepare_approve','autopilot']);
  expect(select.value).toBe(mode);
  renderedButtons.find(props=>props.children==='Подготовить материалы в чате').onClick();
  expect(onRequest).toHaveBeenCalledTimes(1);
  expect(onRequest.mock.calls[0][0]).toContain(mode==='autopilot'?'делегируй редакторскому эксперту':'покажи варианты каждого материала');
 } finally {dom.window.close();data.campaign.mode='prepare_approve';}
});
test.each(['ru','en'])('campaign publication states use shared words/tones and keep preparation uncertainty distinct (%s)',language=>{
 locale=language;const dom=new JSDOM(renderToStaticMarkup(React.createElement(SocialFactoryCampaign,{campaignId:'campaign'})));
 try{
  const badges=[...dom.window.document.querySelectorAll('ol > li > div:first-child [data-tone]')];
  for(const [index,state] of ['published','queued','error'].entries()){
   expect(badges[index].textContent).toBe(shared.stateWord(state,piecesCopy[locale]));
   expect(badges[index].getAttribute('data-tone')).toBe(shared.stateTone(state));
  }
  expect(badges[3].textContent).toBe(locale==='ru'?'Готовим':'Preparing');
  expect(badges[4].textContent).toBe(locale==='ru'?'Готово к проверке':'Ready for review');
  expect(badges[5].textContent).toBe(locale==='ru'?'Результат не подтверждён':'Result unconfirmed');
  expect(badges[5].getAttribute('data-tone')).toBe('warning');
  expect(badges[6].textContent).toBe(locale==='ru'?'Не удалось подготовить':'Preparation failed');
 }finally{dom.window.close();}
});
