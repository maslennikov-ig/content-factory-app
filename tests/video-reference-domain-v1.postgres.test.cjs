const {create, assertDisposableDatabaseV1, FIXTURE_REFERENCE} = require('./helpers/video-domain-v1.fixture.cjs');
const databaseUrl = process.env.CF_VIDEO_DATABASE_URL;
if (databaseUrl) assertDisposableDatabaseV1(databaseUrl);
(databaseUrl ? describe : describe.skip)('owned image -> actual dimension validation -> durable provider request', () => {
  test.each(['wan-3.0', 'kling-3.0-standard', 'kling-3.0-pro'])('%s preserves reference and request bytes on ambiguous same-key recovery', async model => {
    const f = await create(databaseUrl);
    try {
      const reference = await f.db.media.create({data: {organizationId: f.org.id, name: 'owned-reference.png', path: FIXTURE_REFERENCE}});
      const settings = {...f.clipSettings, model, aspectRatio: '1:1'};
      if (model !== 'wan-3.0') delete settings.resolution;
      const ready = await f.ready({settings, referenceMediaIds: [reference.id]});
      const job = await f.service.launch(f.org.id, f.user.id, ready.launch);
      f.transport.submitScript.higgsfield.push('transport');
      await f.runToTerminal(job.id);
      expect(f.transport.submits).toHaveLength(2);
      expect(f.transport.submits[1]).toEqual(f.transport.submits[0]);
      const request = f.transport.submits[0];
      expect(request.endpoint).toMatch(/\/image-to-video$/);
      expect(JSON.parse(request.body).image_url).toBe(FIXTURE_REFERENCE);
      // Quote/submit JSON values must match; jsonb may reorder keys before
      // the first submit. Every paid replay above must retain identical bytes.
      expect(JSON.parse(f.transport.estimates[0].body)).toEqual(JSON.parse(request.body));
      expect((await f.service.get(f.org.id, job.id)).snapshot.brief.referenceMediaIds).toEqual([reference.id]);
      if (model !== 'wan-3.0') {
        expect(JSON.parse(request.body)).not.toHaveProperty('resolution');
        expect(JSON.parse(request.body)).not.toHaveProperty('aspect_ratio');
      }
    } finally {await f.close();}
  });

  test('Kling reference aspect mismatch and unsupported presenter locale perform no video submits', async () => {
    const f = await create(databaseUrl);
    try {
      const reference = await f.db.media.create({data: {organizationId: f.org.id, name: 'owned-reference.png', path: FIXTURE_REFERENCE}});
      const settings = {...f.clipSettings, model: 'kling-3.0-standard', aspectRatio: '16:9'};
      delete settings.resolution;
      const draft = await f.prepare({settings, referenceMediaIds: [reference.id]});
      await expect(f.service.preflight(f.org.id, f.user.id, draft.id)).rejects.toMatchObject({code: 'video_reference_aspect_mismatch'});
      const presenter = await f.prepare({settings: {...f.presenterSettings, locale: 'ja-JP'}});
      await expect(f.service.preflight(f.org.id, f.user.id, presenter.id)).rejects.toMatchObject({code: 'video_voice_locale_unsupported'});
      expect(f.transport.submits).toHaveLength(0);
    } finally {await f.close();}
  });
});
