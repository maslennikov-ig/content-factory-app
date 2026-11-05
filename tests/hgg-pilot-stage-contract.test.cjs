const {loadTypeScriptModule} = require('./helpers/load-ts-module.cjs');
const root='libraries/nestjs-libraries/src/videos/subscriptions/';
const contract=loadTypeScriptModule(root+'video-hgg-pilot-stage.v1.ts');
test('finite pilot authorization is exact credits and cannot accept unlimited, zero, exponent or arbitrary stages',()=>{
 const valid={id:'owner-answer',unit:'higgsfield_credit',pilotLimit:'25.5',stageLimit:'10',stages:['first_frame','last_frame','clip'],funding:'credits'};
 expect(contract.HggPilotAuthorizationSchemaV1.parse(valid)).toEqual(valid);
 for(const changed of [{pilotLimit:'0'},{pilotLimit:'Infinity'},{stageLimit:'1e2'},{funding:'unlimited'},{stages:['other']}])expect(contract.HggPilotAuthorizationSchemaV1.safeParse({...valid,...changed}).success).toBe(false);
});
test('missing parent port fails closed instead of silently admitting a paid stage',async()=>{
 const {HggPilotParentPortV1}=loadTypeScriptModule(root+'video-hgg-pilot-parent.port.v1.ts');
 const port=new HggPilotParentPortV1(); await expect(port.assertCurrentPilot({},{})).rejects.toMatchObject({response:{code:'VIDEO_PILOT_PARENT_UNAVAILABLE'}});
});
