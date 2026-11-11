const {loadTypeScriptModule}=require('./helpers/load-ts-module.cjs');
const {decodeHeygenConsentLinkV1:decode}=loadTypeScriptModule('libraries/nestjs-libraries/src/videos/subscriptions/video-heygen-consent-link.v1.ts');
const value=(url,id='owned')=>({data:{avatar_group:{id,consent_status:'pending'},url}});
test('one-use consent link accepts only the expected owned group and a HeyGen hosted consent page',()=>{
  expect(decode(value('https://heygen.com/consent/abc-123'),'owned')).toEqual({groupId:'owned',url:'https://heygen.com/consent/abc-123'});
  const observed='https://app.heygen.com/avatars/api-video/record?token=synthetic-token_123';
  expect(decode(value(observed),'owned')).toEqual({groupId:'owned',url:observed});
  for (const url of ['https://heygen.com/avatars/api-video/record?token=x','https://app.heygen.com/avatars/api-video/record',
    'https://app.heygen.com/avatars/api-video/record?token=x&redirect=https%3A%2F%2Fevil.example',
    'https://app.heygen.com/avatars/api-video/record?token=x&token=y',
    'https://app.heygen.com/avatars/api-video/record?token=%2F',
    'https://app.heygen.com/avatars/api-video/record?token=x#fragment']) expect(()=>decode(value(url),'owned')).toThrow();
  for(const bad of [value('https://evil.example/consent/secret'),value('http://heygen.com/consent/secret'),value('https://user@heygen.com/consent/secret'),value('https://heygen.com/redirect?to=evil'),value('https://heygen.com/consent/secret#fragment'),value('https://heygen.com/consent/secret','other'),{data:{avatar_group:{id:'owned',consent_status:'accepted'},url:'https://heygen.com/consent/secret'}},{data:{error:{code:'failed'},avatar_group:{id:'owned',consent_status:'pending'},url:'https://heygen.com/consent/secret'}}])
    expect(()=>decode(bad,'owned')).toThrow();
});
