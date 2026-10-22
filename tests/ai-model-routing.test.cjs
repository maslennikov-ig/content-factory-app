'use strict';

const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const roles = loadTypeScriptModule('libraries/nestjs-libraries/src/openai/ai.roles.ts');

describe('configurable native stage routing profiles', () => {
  test('an unset profile enables automatic selection with the configured stronger model', () => {
    expect(roles.resolveModelRoutingSettings(undefined, 'vendor/strong')).toEqual({
      enabled:true, advancedModel:'vendor/strong', advancedFlex:true,
    });
  });
  test('stored false and model/tier overrides survive resolution', () => {
    const raw={__modelRouting:{enabled:false,advancedModel:'vendor/other',advancedFlex:false}};
    expect(roles.resolveModelRoutingSettings(roles.readStoredModelRouting(raw),'vendor/default')).toEqual({
      enabled:false,advancedModel:'vendor/other',advancedFlex:false,
    });
    expect(roles.parseRoleModels(raw)).toEqual({});
  });
  test('stage pins remain authoritative, including review and its judge consumer', () => {
    const source={textModel:'base',imageModel:'image',roleModels:{draft:'core-pin',adapt:'channel-pin',review:'editor-pin'}};
    expect(roles.modelFor('draft',source)).toBe('core-pin');
    expect(roles.modelFor('adapt',source)).toBe('channel-pin');
    expect(roles.modelFor('judge',source)).toBe('editor-pin');
    expect(roles.isRoleModelPinned('judge',source)).toBe(true);
    expect(roles.isRoleModelPinned('agent',source)).toBe(false);
    expect(roles.routingStageFor('classify')).toBeUndefined();
    expect(roles.routingStageFor('judge')).toBe('review');
  });
  test('unusable stored profile metadata cannot become a model id', () => {
    expect(roles.readStoredModelRouting({__modelRouting:'wrong'})).toBeUndefined();
    expect(roles.readStoredModelRouting({__modelRouting:{advancedModel:'x'.repeat(101),enabled:'yes'}})).toEqual({});
  });
});
