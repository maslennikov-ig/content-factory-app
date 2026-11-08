const {loadTypeScriptModule} = require('./helpers/load-ts-module.cjs');
const actualDto = loadTypeScriptModule('libraries/nestjs-libraries/src/dtos/posts/providers-settings/tiktok.dto.ts');

class BadBody extends Error {
  constructor(identifier, _json, _body, message) { super(message); this.identifier = identifier; }
}
const {TiktokProvider} = loadTypeScriptModule('libraries/nestjs-libraries/src/integrations/social/tiktok.provider.ts', {
  '@contentfactory/helpers/utils/media.source': {spoolMediaSource:async path=>({path,size:123,dispose:async()=>{}})},
  '@contentfactory/nestjs-libraries/dtos/posts/providers-settings/tiktok.dto': actualDto,
  '@contentfactory/nestjs-libraries/integrations/social.abstract': {SocialAbstract: class {
    assetBoolean(value) { return value === true || value === 'true'; }
  }, BadBody, RefreshToken: class RefreshToken extends Error {}},
  '@contentfactory/nestjs-libraries/chat/rules.description.decorator': {Rules: () => () => {}},
}, {sources: {'@contentfactory/helpers/utils/has.extension': 'libraries/helpers/src/utils/has.extension.ts'},
  resolve: request => request.startsWith('@contentfactory/') && !request.endsWith('/social.abstract') &&
    !request.endsWith('/rules.description.decorator') && !request.endsWith('/has.extension') && !request.endsWith('/tiktok.dto') && !request.endsWith('/media.source') ? {} : undefined});

function fixture(path, settings) {
  const provider = new TiktokProvider();
  provider.creatorInfo = jest.fn(async () => ({creatorNickname: 'Synthetic owner',
    privacyLevelOptions: ['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'FOLLOWER_OF_CREATOR', 'SELF_ONLY'],
    commentDisabled: false, duetDisabled: false, stitchDisabled: false, maxVideoDurationSeconds: 300}));
  provider.tiktokMediaSize = jest.fn(async () => 123);
  provider.inspectVideoForTikTok = jest.fn(async () => ({durationSeconds: 5, size: 123}));
  provider.fetch = jest.fn(async () => ({json: async () => ({data: {publish_id: 'synthetic-publish'}})}));
  provider.uploadedVideoSuccess = jest.fn(async () => ({url: 'https://example.com/synthetic', id: 'synthetic-post'}));
  const post = {id: 'local-post', message: 'Approved caption', media: [{path}], settings};
  return {provider, post, send: () => provider.post('channel', 'synthetic-token', [post], {profile: 'synthetic-owner'})};
}

test.each([undefined, '', 'PUBLIC', 'SELF_ONLY ', null, 1])('TikTok Direct Post refuses unselected or invalid privacy before any media read or request (%p)', async privacy_level => {
  for (const path of ['https://example.com/owned.mp4', 'https://example.com/owned.jpg']) {
    const f = fixture(path, {content_posting_method: 'DIRECT_POST', privacy_level});
    await expect(f.send()).rejects.toMatchObject({identifier: 'tiktok-privacy-required'});
    expect(f.provider.tiktokMediaSize).not.toHaveBeenCalled(); expect(f.provider.fetch).not.toHaveBeenCalled();
    expect(f.provider.uploadedVideoSuccess).not.toHaveBeenCalled();
    expect(f.provider.creatorInfo).not.toHaveBeenCalled();
    expect(f.provider.inspectVideoForTikTok).not.toHaveBeenCalled();
  }
});

test.each(['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'FOLLOWER_OF_CREATOR', 'SELF_ONLY'])('TikTok preserves the exact explicit privacy choice on photo and video requests (%s)', async privacy_level => {
  for (const path of ['https://example.com/owned.mp4', 'https://example.com/owned.jpg']) {
    const f = fixture(path, {content_posting_method: 'DIRECT_POST', privacy_level});
    await f.send();
    expect(f.provider.fetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse(f.provider.fetch.mock.calls[0][1].body);
    expect(body.post_info.privacy_level).toBe(privacy_level);
    expect(body).not.toHaveProperty('method');
  }
});

test('TikTok inbox continuation still omits privacy instead of inventing a direct publication choice', async () => {
  const f = fixture('https://example.com/owned.mp4', {content_posting_method: 'UPLOAD'});
  await f.send();
  expect(f.provider.fetch.mock.calls[0][0]).toContain('/inbox/video/init/');
  expect(JSON.parse(f.provider.fetch.mock.calls[0][1].body).post_info).toEqual({title: 'Approved caption'});
  expect(JSON.parse(f.provider.fetch.mock.calls[0][1].body)).not.toHaveProperty('method');
  expect(f.provider.creatorInfo).not.toHaveBeenCalled();
  expect(f.provider.inspectVideoForTikTok).not.toHaveBeenCalled();
});

test('a valid enum unavailable to the current account cannot initialize an upload', async () => {
  const f = fixture('https://example.com/owned.mp4', {content_posting_method: 'DIRECT_POST', privacy_level: 'PUBLIC_TO_EVERYONE'});
  f.provider.creatorInfo.mockResolvedValue({privacyLevelOptions: ['SELF_ONLY']});
  await expect(f.send()).rejects.toMatchObject({identifier: 'tiktok-privacy-required'});
  expect(f.provider.creatorInfo).toHaveBeenCalledWith('synthetic-token');
  expect(f.provider.tiktokMediaSize).not.toHaveBeenCalled(); expect(f.provider.fetch).not.toHaveBeenCalled();
});

test('current account checks bind the actual prepared body even if caller settings change during the read', async () => {
  const f = fixture('https://example.com/owned.mp4', {content_posting_method: 'DIRECT_POST', privacy_level: 'PUBLIC_TO_EVERYONE'});
  f.provider.creatorInfo.mockImplementation(async () => {
    f.post.settings.privacy_level = 'SELF_ONLY';
    return {privacyLevelOptions: ['SELF_ONLY']};
  });
  await expect(f.send()).rejects.toMatchObject({identifier: 'tiktok-privacy-required'});
  expect(f.provider.fetch).not.toHaveBeenCalled(); expect(f.provider.tiktokMediaSize).not.toHaveBeenCalled();
});

test.each([['comment', 'commentDisabled'], ['duet', 'duetDisabled'], ['stitch', 'stitchDisabled']])('changed account interaction %s is refused before media reads', async (field, flag) => {
  const f = fixture('https://example.com/owned.mp4', {content_posting_method: 'DIRECT_POST', privacy_level: 'SELF_ONLY', [field]: true});
  f.provider.creatorInfo.mockResolvedValue({privacyLevelOptions: ['SELF_ONLY'], [flag]: true});
  await expect(f.send()).rejects.toMatchObject({identifier: 'tiktok-interactions-changed'});
  expect(f.provider.tiktokMediaSize).not.toHaveBeenCalled(); expect(f.provider.fetch).not.toHaveBeenCalled();
});

const creatorData = () => ({creator_nickname: 'Synthetic owner', privacy_level_options: ['SELF_ONLY'], comment_disabled: true,
  duet_disabled: true, stitch_disabled: false, max_video_post_duration_sec: 300});
test('the real creator-info method uses the current authenticated endpoint and returns no token or extra provider fields', async () => {
  const f = fixture('', {});
  f.provider.fetch.mockResolvedValue({json: async () => ({error: {code: 'ok'}, data: {...creatorData(), private_extra: 'must-not-leave'}})});
  const result = await TiktokProvider.prototype.creatorInfo.call(f.provider, 'synthetic-token');
  expect(result).toEqual({creatorNickname: 'Synthetic owner', privacyLevelOptions: ['SELF_ONLY'], commentDisabled: true,
    duetDisabled: true, stitchDisabled: false, maxVideoDurationSeconds: 300});
  const [url, init] = f.provider.fetch.mock.calls[0];
  expect(url).toBe('https://open.tiktokapis.com/v2/post/publish/creator_info/query/');
  expect(init.method).toBe('POST'); expect(init.redirect).toBe('error'); expect(init.signal).toBeDefined();
  expect(init.headers.Authorization).toBe('Bearer synthetic-token');
});

test.each([
  {privacy_level_options: []}, {privacy_level_options: ['PUBLIC']}, {privacy_level_options: ['SELF_ONLY', 'SELF_ONLY']},
  {comment_disabled: 'false'}, {creator_nickname: undefined}, {max_video_post_duration_sec: 0},
])('malformed creator-info cannot fabricate account eligibility (%#)', async change => {
  const f = fixture('', {});
  f.provider.fetch.mockResolvedValue({json: async () => ({error: {code: 'ok'}, data: {...creatorData(), ...change}})});
  await expect(TiktokProvider.prototype.creatorInfo.call(f.provider, 'synthetic-token')).rejects.toMatchObject({identifier: 'tiktok-creator-info-unavailable'});
});

test('HTTP200 creator posting-cap error cannot become a ready account', async () => {
  const f = fixture('', {});
  f.provider.fetch.mockResolvedValue({json: async () => ({error: {code: 'spam_risk_too_many_posts'}, data: creatorData()})});
  await expect(TiktokProvider.prototype.creatorInfo.call(f.provider, 'synthetic-token')).rejects.toMatchObject({identifier: 'tiktok-creator-info-unavailable'});
});

test.each([{disclose: true}, {disclose: false, brand_content_toggle: true}, {brand_content_toggle: true, privacy_level: 'SELF_ONLY'}])('inconsistent disclosure or private branded content cannot reach the provider (%#)', async change => {
  const f = fixture('https://example.com/owned.mp4', {content_posting_method: 'DIRECT_POST', privacy_level: 'PUBLIC_TO_EVERYONE', ...change});
  await expect(f.send()).rejects.toMatchObject({identifier: 'tiktok-disclosure-invalid'});
  expect(f.provider.fetch).not.toHaveBeenCalled(); expect(f.provider.creatorInfo).not.toHaveBeenCalled();
});

test('a current account duration limit is enforced against inspected bytes before upload initialization', async () => {
  const f = fixture('https://example.com/owned.mp4', {content_posting_method: 'DIRECT_POST', privacy_level: 'SELF_ONLY'});
  f.provider.inspectVideoForTikTok.mockResolvedValue({durationSeconds: 301, size: 123});
  await expect(f.send()).rejects.toMatchObject({identifier: 'tiktok-video-too-long'});
  expect(f.provider.fetch).not.toHaveBeenCalled(); expect(f.provider.tiktokMediaSize).not.toHaveBeenCalled();
  f.provider.inspectVideoForTikTok.mockRejectedValue(Error('Unsupported bytes'));
  await expect(f.send()).rejects.toMatchObject({identifier: 'tiktok-video-inspection-unavailable'});
  expect(f.provider.fetch).not.toHaveBeenCalled();
});

test('the initialized video and inspected path stay bound if caller media changes during inspection', async () => {
  const f = fixture('https://example.com/owned.mp4', {content_posting_method: 'DIRECT_POST', privacy_level: 'SELF_ONLY'});
  f.provider.inspectVideoForTikTok.mockImplementation(async () => {
    f.post.media[0].path = 'https://example.com/changed.jpg';
    return {durationSeconds: 5, size: 123};
  });
  await f.send();
  expect(f.provider.inspectVideoForTikTok).toHaveBeenCalledWith('https://example.com/owned.mp4', expect.objectContaining({path:'https://example.com/owned.mp4',size:123}));
  const body = JSON.parse(f.provider.fetch.mock.calls[0][1].body);
  expect(body.source_info).toMatchObject({source: 'FILE_UPLOAD', video_size: 123});
  expect(body.media_type).toBeUndefined();
});
