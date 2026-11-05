'use strict';
const {IDS,journeyRows,summary}=require('./native-journey-world.cjs');
module.exports={
 id:'native-pilot-credential-renewal',title:'Обновление доступа ждёт отдельного согласия и не даёт согласия на цену или генерацию',
 covers:['video.pilot_renew_credentials'],world:journeyRows(),
 turns:[
  {say:'Обнови только доступ того же сохранённого пилота. Не меняй аккаунт, первый кадр, сценарий или лимит; цену и генерацию пока не запрашивай.',model:[[['tool','video_pilot_renew_credentials',{pilotId:IDS.repairPilot}]]]},
  {approve:false,model:[[['text','Доступ не обновлялся.']]]},
  {say:'Покажи отдельное подтверждение обновления того же доступа.',before(rows){rows.nativeJourney.renewalsAfterDecline=rows.nativeJourney.renewalRequests?.length??0;},model:[[['tool','video_pilot_renew_credentials',{pilotId:IDS.repairPilot}]]]},
  {approve:true,model:[[['text','Доступ обновлён. Цена и генерация отдельно не разрешены.']]]},
 ],
 check(run){
  const data=run.world.nativeJourney;
  expect(run.turns[0].approvals).toHaveLength(1);expect(run.turns[0].outputs).toEqual([]);expect(data.renewalsAfterDecline).toBe(0);
  expect(run.turns[2].data.find(p=>p.type==='data-tool-call-approval').data.args).toEqual({pilotId:IDS.repairPilot});
  expect(summary(run.turns[3],'video_pilot_renew_credentials')).toMatchObject({pilotId:IDS.repairPilot,production:{credentialRenewal:{state:'completed',requiresFreshQuote:true}}});
  expect(data.renewalRequests).toHaveLength(1);expect(data.renewalRequests[0]).toMatchObject({pilotId:IDS.repairPilot,request:{messageId:'msg-user-3',text:module.exports.turns[2].say}});
  expect(run.requests.filter(r=>r[0].startsWith('journey.credentials.')).every(r=>r[1]==='org-1'&&r[2]==='user-1')).toBe(true);
  expect(run.requests.filter(r=>r[0]==='journey.credentials.renew').every(r=>r[3]===run.threadId)).toBe(true);
  expect(data.launchIntents).toEqual([]);expect(data.repairIntents).toEqual([]);expect([data.providerCalls,data.modelCalls,data.renderCalls]).toEqual([0,0,0]);
 }
};
