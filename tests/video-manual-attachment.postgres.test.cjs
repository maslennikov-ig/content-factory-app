const fs = require('node:fs');
const path = require('node:path');
const fixture = require('./helpers/video-subscription-domain.fixture.cjs');
const { codeOf } = require('./helpers/video-subscription-provider-fixture.cjs');
const databaseUrl = process.env.CF_VIDEO_DATABASE_URL;
if (databaseUrl) fixture.assertDisposableDatabaseV1(databaseUrl);
const domain = databaseUrl ? describe : describe.skip;
const withFixture = async run => { const f = await fixture.create(databaseUrl); try { return await run(f); } finally { await f.close(); } };

domain('manual upload attaches actual owned MP4 bytes through the shared Prisma facade', () => {
  jest.setTimeout(30000);

  test('concurrent duplicate attachment produces one row, exact draft snapshot and playable/downloadable bytes with zero submits', () => withFixture(async f => {
    const draft = await f.prepare(); const media = await f.addOwnedVideo();
    const input = {draftId: draft.id, version: draft.version, mediaId: media.id};
    const rows = await Promise.all([f.access.attach(f.org.id, f.user.id, input), f.access.attach(f.org.id, f.user.id, input)]);
    expect(rows[0].id).toBe(rows[1].id); expect(rows[0].access).toEqual({kind: 'manual'});
    expect(rows[0].cost).toEqual({amount: null, unit: null, certainty: 'external_unknown'});
    expect(rows[0].snapshot).toEqual({brief: draft.brief, settings: draft.settings});
    expect(await f.db.videoManualAttachment.count({where: {organizationId: f.org.id}})).toBe(1);
    await f.db.userOrganization.updateMany({where: {organizationId: f.org.id, userId: f.otherUser.id}, data: {role: 'USER'}});
    expect((await f.access.download(f.org.id, f.otherUser.id, rows[0].id)).bytes.equals(f.mp4)).toBe(true);
    expect((await f.access.list(f.org.id, f.user.id, f.pieceId)).map(j => j.id)).toContain(rows[0].id);
    expect(f.provider.state.submits).toHaveLength(0); expect(f.transport.submits).toHaveLength(0); expect(f.provider.state.quotes).toHaveLength(0);
  }));

  test('actual MP4 uploaded with legacy image metadata is promoted to video and attaches only once', () => withFixture(async f => {
    const draft = await f.prepare();
    const media = await f.addOwnedVideo({data: {type: 'image', fileSize: 1}});
    expect(media.type).toBe('image');
    const input = {draftId: draft.id, version: draft.version, mediaId: media.id};
    const attached = await f.access.attach(f.org.id, f.user.id, input);
    const replay = await f.access.attach(f.org.id, f.user.id, input);
    expect(replay.id).toBe(attached.id); expect(attached.result.type).toBe('video');
    const promoted = await f.db.media.findUniqueOrThrow({where: {id: media.id}});
    expect(promoted.type).toBe('video'); expect(promoted.fileSize).toBe(f.mp4.length);
    expect((await f.access.download(f.org.id, f.user.id, attached.id)).bytes.equals(f.mp4)).toBe(true);
    expect(await f.db.videoManualAttachment.count({where: {organizationId: f.org.id}})).toBe(1);
    expect(f.provider.state.submits).toHaveLength(0); expect(f.transport.submits).toHaveLength(0); expect(f.provider.state.quotes).toHaveLength(0);
  }));

  test('foreign media, actual image bytes, false MP4 bytes, stale draft and reader mutation all fail before attachment', () => withFixture(async f => {
    const draft = await f.prepare(); const own = await f.addOwnedVideo(); const foreign = await f.addOwnedVideo({org: f.otherOrg.id});
    const image = await f.addOwnedVideo({data: {type: 'image', name: 'photo.png'}});
    const imageRelative = new URL(image.path).pathname.slice('/uploads/'.length);
    fs.writeFileSync(path.join(f.uploadDirectory, imageRelative), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZGwAAAABJRU5ErkJggg==', 'base64'));
    const attempt = async (mediaId, actor = f.user.id, version = draft.version) => { try { await f.access.attach(f.org.id, actor, {draftId: draft.id, version, mediaId}); } catch (error) { return codeOf(error); } return null; };
    expect(await attempt(foreign.id)).toBe('VIDEO_OWNED_FILE_UNAVAILABLE');
    expect(await attempt(image.id)).toBe('VIDEO_RESULT_NOT_MP4');
    expect(await attempt(own.id, f.user.id, draft.version + 1)).toBe('VIDEO_DRAFT_CHANGED');
    await f.db.userOrganization.updateMany({where: {organizationId: f.org.id, userId: f.otherUser.id}, data: {role: 'USER'}});
    expect(await attempt(own.id, f.otherUser.id)).toBe('VIDEO_ACCESS_DENIED');
    const relative = new URL(own.path).pathname.slice('/uploads/'.length);
    fs.writeFileSync(path.join(f.uploadDirectory, relative), Buffer.from('A filename and MIME label are not a video.'));
    expect(await attempt(own.id)).toBe('VIDEO_RESULT_NOT_MP4');
    expect(await f.db.videoManualAttachment.count({where: {organizationId: f.org.id}})).toBe(0);
    expect((await f.db.media.findUniqueOrThrow({where: {id: image.id}})).type).toBe('image');
    expect(f.provider.state.submits).toHaveLength(0); expect(f.transport.submits).toHaveLength(0);
  }));
  test('oversized local upload is rejected before allocating its file contents', () => withFixture(async f => {
    const draft = await f.prepare(); const media = await f.addOwnedVideo();
    const disk = require('node:path').join(f.uploadDirectory, new URL(media.path).pathname.slice('/uploads/'.length));
    await require('node:fs/promises').truncate(disk, 100 * 1024 * 1024 + 1);
    let error; try { await f.access.attach(f.org.id,f.user.id,{draftId:draft.id,version:draft.version,mediaId:media.id}); } catch (e) {error=e;}
    expect(codeOf(error)).toBe('VIDEO_RESULT_TOO_LARGE');
    expect(await f.db.videoManualAttachment.count({where:{organizationId:f.org.id}})).toBe(0);
    expect(f.provider.state.submits).toHaveLength(0);
  }));

});
