const {loadTypeScriptModule}=require('./helpers/load-ts-module.cjs');
const base='libraries/nestjs-libraries/src/content-intelligence/social-factory/';
const schemas=loadTypeScriptModule(base+'contracts/social-factory.production.schemas.v1.ts');
const wire=loadTypeScriptModule(base+'attribution/helixa-exchange.v1.ts');
const tokens=new Map();
function token(name){if(!tokens.has(name))tokens.set(name,class{});return tokens.get(name);}
const otherImports=new Proxy({}, {get:(_,name)=>{
 if(name==='AuthorizationActions'||name==='Sections')return new Proxy({}, {get:(_,key)=>key});
 if(['CheckPolicies','GetOrgFromRequest','GetUserFromRequest'].includes(name))return()=>()=>{};
 return token(name);
}});
function resolve(request){
 if(request==='zod'||request==='@nestjs/common')return undefined;
 if(request.endsWith('/social-factory.production.schemas.v1'))return schemas;
 if(request.endsWith('/helixa-exchange.v1'))return wire;
 if(request.endsWith('/social-factory.schemas.v1'))return loadTypeScriptModule(base+'contracts/social-factory.schemas.v1.ts');
 if(request==='../capability.types')return{defineCapability:value=>value,door:()=>({})};
 return otherImports;
}
const {SocialFactoryController}=loadTypeScriptModule('apps/backend/src/api/routes/social-factory.controller.ts',{}, {resolve});
const {helixaRead}=loadTypeScriptModule('libraries/nestjs-libraries/src/chat/capabilities/catalogue/social-factory-production.capabilities.ts',{}, {resolve});
const linkId='c'.repeat(64);
test('existing API and chat read doors select the server-owned exact link method with the actual tenant',async()=>{
 const exchange={readAttributedOutcomes:jest.fn(async()=>({status:'available',response:'exact'})),exchange:jest.fn(async()=>({status:'not_connected'}))};
 const controller=Object.create(SocialFactoryController.prototype);controller.exchange=exchange;
 const input={operation:'crm.outcomes.read',projectId:'project',resourceIds:['deal'],attributionLinkId:linkId};
 expect(await controller.readHelixa({id:'org'},input)).toEqual({status:'available',response:'exact'});
 expect(exchange.readAttributedOutcomes).toHaveBeenLastCalledWith('org',linkId,{projectId:'project',recordIds:['deal']});
 const ctx={organizationId:'org',service:()=>exchange};
 expect(await helixaRead.run(ctx,helixaRead.input.parse(input))).toEqual({status:'available',response:'exact'});
 expect(exchange.readAttributedOutcomes).toHaveBeenCalledTimes(2);expect(exchange.exchange).not.toHaveBeenCalled();
 await controller.readHelixa({id:'org'},{operation:'knowledge.read',resourceIds:['claim']});
 await helixaRead.run(ctx,helixaRead.input.parse({operation:'crm.outcomes.read',projectId:'project',resourceIds:['deal']}));
 expect(exchange.exchange).toHaveBeenLastCalledWith('org',{protocol:wire.HELIXA_EXCHANGE_PROTOCOL,operation:'crm.outcomes.read',projectId:'project',recordIds:['deal']});
});
test('tool input remains a ZodObject and both runtime doors reject invalid cross-field combinations',async()=>{
 expect(helixaRead.input).toBeInstanceOf(require('zod').z.ZodObject);
 const invalids=[
  {operation:'knowledge.read',resourceIds:['claim'],attributionLinkId:linkId},
  {operation:'crm.outcomes.read',resourceIds:['deal'],attributionLinkId:linkId},
  {operation:'crm.outcomes.read',projectId:'project',resourceIds:['deal'],attributionLinkId:'invented'},
  {operation:'crm.outcomes.read',projectId:'project',resourceIds:['deal'],trackingMatch:{}},
  {operation:'crm.outcomes.read',projectId:'project',resourceIds:['deal'],organizationId:'foreign'},
 ];
 for(const input of invalids){
  const controller=Object.create(SocialFactoryController.prototype);controller.exchange={readAttributedOutcomes:jest.fn(),exchange:jest.fn()};
  await expect(controller.readHelixa({id:'org'},input)).rejects.toThrow();
  await expect(Promise.resolve().then(()=>helixaRead.run({organizationId:'org',service:()=>controller.exchange},input))).rejects.toThrow();
  expect(controller.exchange.exchange).not.toHaveBeenCalled();expect(controller.exchange.readAttributedOutcomes).not.toHaveBeenCalled();
 }
});
