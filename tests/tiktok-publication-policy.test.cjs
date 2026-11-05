'use strict';
const {loadTypeScriptModule} = require('./helpers/load-ts-module.cjs');
const policy = loadTypeScriptModule('libraries/nestjs-libraries/src/integrations/social/tiktok-publication-policy.ts');

test('every explicit Direct Post requires music and third-party branding adds the second exact versioned declaration', () => {
  const input = {content_posting_method: 'DIRECT_POST', brand_content_toggle: false, brand_organic_toggle: true};
  const before = JSON.stringify(input), own = policy.tikTokRequiredDeclarations(input);
  expect(own.map(value => value.id)).toEqual(['music_usage']);
  expect(policy.tikTokRequiredDeclarations({...input, brand_content_toggle: true}).map(value => value.id)).toEqual(['music_usage', 'branded_content']);
  expect(own[0]).toEqual({id: 'music_usage', version: 'tiktok-direct-post-declarations/v1', url: 'https://www.tiktok.com/legal/page/global/music-usage-confirmation/en'});
  expect(JSON.stringify(input)).toBe(before); expect(Object.isFrozen(own)).toBe(true); expect(Object.isFrozen(own[0])).toBe(true);
});

test('UPLOAD has no Direct Post declaration and unknown settings cannot silently omit a required policy', () => {
  expect(policy.tikTokRequiredDeclarations({content_posting_method: 'UPLOAD'})).toEqual([]);
  for (const input of [null, {}, {content_posting_method: 'DIRECT_POST'}, {content_posting_method: 'DIRECT_POST', brand_content_toggle: 'false'}, {content_posting_method: 'PUBLISH', brand_content_toggle: false}]) {
    expect(() => policy.tikTokRequiredDeclarations(input)).toThrow('TIKTOK_POLICY_SETTINGS_UNAVAILABLE');
  }
});
