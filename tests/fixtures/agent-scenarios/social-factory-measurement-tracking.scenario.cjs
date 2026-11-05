'use strict';
const { IDS, measurementRows, summary, trackingInput } = require('./social-factory-measurement-world.cjs');
module.exports = {
  id: 'social-factory-measurement-tracking', title: 'Ссылка учитывает клики только после проверки публикации; клики не становятся CRM-сделками', covers: ['campaign.tracking_link', 'campaign.tracking_clicks'], world: measurementRows(),
  turns: [
    { say: 'Подготовь ссылку для этого поста и проверь клики', model: [[['tool', 'campaign_tracking_link', trackingInput]], [['tool', 'campaign_tracking_clicks', { linkId: IDS.link }]], [['text', 'Ссылка создана, но пока не подтверждена в опубликованном тексте.']]] },
    { say: 'Теперь ссылка действительно размещена в опубликованной версии; проверь и чужой ID', before(rows) { const data = rows.socialFactoryMeasurement; const item = data.items.find(row => row.id === IDS.telegram); item.publishedText = data.links.find(row => row.id === IDS.link).trackingUrl; item.contentRevision = 3; item.publication.revision = 3; }, model: [[['tool', 'campaign_tracking_clicks', { linkId: IDS.link }]], [['tool', 'campaign_tracking_clicks', { linkId: 'foreign-link' }]], [['text', '12 событий перехода; это не число людей, заявок, сделок или оплат.']]] },
    { say: 'Попробуй переиспользовать запрос для другой ссылки', model: [[['tool', 'campaign_tracking_link', { ...trackingInput, targetUrl: 'https://example.test/different' }]], [['tool', 'campaign_tracking_link', { ...trackingInput, channelId: 'c2', itemId: 'seed-item-1', requestId: 'instagram-caption-request' }]], [['text', 'Такой запрос уже связан с прежней ссылкой; ссылка в подписи Instagram не даёт прямого перехода.']]] },
  ],
  check(run) {
    const link = summary(run.turns[0], 'campaign_tracking_link').link;
    expect(link).toMatchObject({ id: IDS.link, campaignId: IDS.campaign, itemId: IDS.telegram, surface: 'post', level: 'post', placement: 'pending_verification' });
    expect(new URL(link.trackingUrl).searchParams.get('utm_content')).toBe(IDS.telegram);
    expect(summary(run.turns[0], 'campaign_tracking_clicks')).toMatchObject({ availability: 'unknown', value: null, reason: 'tracking_link_not_verified_in_published_revision' });
    expect(summary(run.turns[1], 'campaign_tracking_clicks')).toMatchObject({ availability: 'available', value: 12, level: 'post', source: 'short_link_provider' });
    expect(run.turns[1].outputs[1].output).toMatchObject({ ok: false, code: 'ATTRIBUTION_LINK_NOT_FOUND' });
    expect(run.turns[2].outputs[0].output).toMatchObject({ ok: false, code: 'ATTRIBUTION_REQUEST_REUSED' });
    expect(run.turns[2].outputs[1].output.summary.untrustedData.value).toMatchObject({ status: 'unavailable', reason: 'instagram_caption_urls_are_not_clickable' });
    expect(run.writes).toEqual([['social.tracking.created', IDS.link]]); expect(run.world.socialFactoryMeasurement.claimedLeads).toEqual([]);
  },
};
