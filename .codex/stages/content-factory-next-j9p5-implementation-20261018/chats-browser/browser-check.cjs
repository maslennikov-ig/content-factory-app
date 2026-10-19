const {createRequire}=require('node:module');const {chromium}=createRequire('/home/me/code/content-factory-next-worktrees/j9p5-model-led-20261018/package.json')('playwright-core');
(async()=>{const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});const report=[];
for(const [width,theme] of [[390,'dark'],[1440,'light']]){
 const c=await b.newContext({viewport:{width,height:900},locale:'ru-RU',colorScheme:theme,reducedMotion:'reduce'});await c.addCookies([{name:'i18next',value:'ru',url:'http://localhost:4219'}]);const p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(String(e)));
 await p.goto(`http://localhost:4219/interface-review/agents?locale=ru&theme=${theme}&viewport=${width}&state=default`,{waitUntil:'networkidle',timeout:120000});
 const chats=p.getByRole('button',{name:'Чаты',exact:true});await chats.click();await p.keyboard.press('Escape');if(!await chats.evaluate(e=>e===document.activeElement))throw Error('Dialog did not restore keyboard focus');
 async function choose(number){await chats.click();await p.getByRole('dialog',{name:'Чаты',exact:true}).getByRole('link',{name:new RegExp(`Синтетический чат ${number} `)}).click()}
 await choose(1);await p.getByRole('button',{name:'Предыдущие сообщения',exact:true}).click();await p.getByText('review-chat-0 · 6: Synthetic saved message / Сохранённое сообщение.',{exact:true}).waitFor();await p.getByRole('button',{name:'Предыдущие сообщения',exact:true}).click();await p.getByText('review-chat-0 · 1: Synthetic saved message / Сохранённое сообщение.',{exact:true}).waitFor();
 if(await p.getByRole('button',{name:'Предыдущие сообщения',exact:true}).count())throw Error('Oldest page did not finish');
 await p.getByRole('textbox').fill('Draft A');await choose(2);await p.getByRole('textbox').fill('Draft B');await choose(1);if(await p.getByRole('textbox').inputValue()!=='Draft A')throw Error('Draft A lost');
 await p.getByRole('button',{name:'Новый чат',exact:true}).click();await p.getByRole('textbox').fill('Unsent new draft');await choose(2);await p.getByRole('button',{name:'Новый чат',exact:true}).click();if(await p.getByRole('textbox').inputValue()!=='Unsent new draft')throw Error('Unsent draft lost');
 await p.getByRole('textbox').press('Enter');await p.getByText('Synthetic new chat / Новый чат',{exact:true}).first().waitFor();await choose(2);await p.waitForTimeout(2300);if(await p.getByText(/Synthetic delayed response for/).count()) {const visible=await p.getByText(/Synthetic delayed response for/).isVisible();if(visible)throw Error('Late stream leaked to another chat')}
 if(await p.getByRole('textbox').inputValue()!=='Draft B')throw Error('Draft B lost after late stream');
 await chats.click();await p.getByRole('dialog',{name:'Чаты',exact:true}).getByRole('link',{name:/Synthetic new chat/}).click();await p.getByText(/Synthetic delayed response for review-new-/).waitFor();
 await p.getByRole('button',{name:'Contextual host',exact:true}).click();await chats.click();await p.getByRole('dialog',{name:'Чаты',exact:true}).waitFor();await p.keyboard.press('Escape');
 const overflow=await p.evaluate(()=>({horizontal:document.documentElement.scrollWidth>innerWidth,vertical:document.documentElement.scrollHeight>innerHeight+2}));
 await p.screenshot({path:`/home/me/code/content-factory-next-worktrees/j9p5-model-led-20261018/.codex/stages/content-factory-next-j9p5-implementation-20261018/chats-browser/${width}-${theme}-flow.png`,fullPage:true});
 report.push({width,theme,errors,overflow,api:await p.evaluate(()=>window.__chatReview)});await c.close();
}
await b.close();console.log(JSON.stringify(report,null,2))})().catch(e=>{console.error(e);process.exitCode=1});
