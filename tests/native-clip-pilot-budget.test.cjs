'use strict';
const {loadTypeScriptModule}=require('./helpers/load-ts-module.cjs');
const {domain}=require('./helpers/native-clip-production.fixture.cjs');
const {clipDelegatedCapV1}=loadTypeScriptModule('libraries/nestjs-libraries/src/content-intelligence/social-factory/native-clip-pilot-budget.v1.ts',{'./campaign/domain':domain});
const basis=(first,clip)=>({contextDigest:'a'.repeat(64),rule:'ceil_125pct_two_first_plus_planning_clip/v1',firstFrame:{amount:first},clipPlanning:{amount:clip},lastFrameTerm:'estimate_same_as_first'});
test.each([['2.75','16.25','28'],['0.1','0.6','1'],['0','0','1'],['1.25','2.75','7']])('finite delegated cap uses exact decimal estimates/25percent/ceiling (%s,%s)',(first,clip,cap)=>{
  const value=basis(first,clip),before=JSON.stringify(value);expect(clipDelegatedCapV1(value)).toBe(cap);expect(JSON.stringify(value)).toBe(before);
});
test.each(['Infinity','NaN','-1','1e100','0.0000001','1.2 USD'])('unsupported quote amount cannot create a delegated cap (%s)',amount=>expect(()=>clipDelegatedCapV1(basis(amount,'1'))).toThrow());
