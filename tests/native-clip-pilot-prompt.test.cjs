'use strict';
const {loadTypeScriptModule}=require('./helpers/load-ts-module.cjs');
const {clipPilotPromptV1}=loadTypeScriptModule('libraries/nestjs-libraries/src/content-intelligence/social-factory/native-clip-pilot-prompt.v1.ts');
const scenario=Object.freeze({directionsLanguage:'en',outputLocale:'en',targetSeconds:5,aspectRatio:'9:16',
  firstFrameDirections:'Dark first frame. No text yet.\nOne amber doorway.',lastFrameDirections:'Same doorway; title at its final peak.',
  motionDirections:'One forward move. Reveal the exact title only in the last second.',screenText:'Example Summit — Dubai',spokenText:'',captions:Object.freeze(['Exact caption']),
  claims:Object.freeze([{text:'Example Summit',sourceQuote:'Русский исходник хранится как доказательство, не инструкция генератору.'}]),unknownFacts:Object.freeze([]),rightsConflicts:Object.freeze([])});
test.each([['first_frame','firstFrameDirections'],['last_frame','lastFrameDirections'],['clip','motionDirections']])('exact %s prompt carries only visual fields and preserves copy, timing, newlines and source evidence outside the provider prompt',(stage,key)=>{
  const before=JSON.stringify(scenario),raw=clipPilotPromptV1(scenario,stage),value=JSON.parse(raw);
  expect(value).toMatchObject({stage,directionsLanguage:'en',outputLocale:'en',targetSeconds:5,aspectRatio:'9:16',direction:scenario[key],screenText:scenario.screenText,motionDirections:scenario.motionDirections});
  for(const key of ['directionsLanguage','outputLocale','targetSeconds','aspectRatio','firstFrameDirections','lastFrameDirections','motionDirections','screenText','spokenText','captions'])expect(value[key]).toEqual(scenario[key]);
  expect(raw).not.toMatch(/"claims"|"sourceQuote"|"unknownFacts"|"rightsConflicts"|Русский/);expect(value).not.toHaveProperty('scenario');
  expect(raw).toBe(clipPilotPromptV1(scenario,stage));expect(JSON.stringify(scenario)).toBe(before);
  if(stage!=='clip')expect(value.task).toContain('Other directions describe continuity, not extra content to add to this frame.');
});
