'use strict';

const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');
const base =
  'libraries/nestjs-libraries/src/content-intelligence/social-factory/editorial/playbooks/';
const {
  getEditorialPlaybook,
  listEditorialPlaybooks,
  buildEditorialProductionInstructions,
} = loadTypeScriptModule(`${base}editorial-playbooks.v1.ts`);
const { inspectEditorialMaterial } = loadTypeScriptModule(
  `${base}editorial-material-inspection.v1.ts`
);
const inspect = (material) =>
  inspectEditorialMaterial(
    material.platform,
    material.format,
    material,
    '2026-11-03T12:00:00Z'
  );
const {localCompositionMaterialDigestV2}=loadTypeScriptModule('libraries/nestjs-libraries/src/content-intelligence/social-factory/editorial/local-composition-evidence.v2.ts');

// These are fictional evaluation packets, not provider receipts, customer facts
// or media-library acceptance. Every media ID here belongs to a synthetic test.
const examples = {
  b2bRu: {
    title: 'Передавайте решение, а не только карточку',
    hook: 'Представим: договор подписан, а на первом звонке клиент заново объясняет задачу.',
    body: 'Учебный пример команды Northbridge Ops. В передаче от продаж к внедрению запишите четыре вещи: желаемый результат, ограничения, согласованные решения и открытые вопросы. Затем проверьте одну передачу: какой вопрос пришлось задать второй раз? Это диагностический приём, а не доказательство экономии или универсальный норматив.',
    cta: 'Какой вопрос ваша команда обычно уточняет повторно?',
  },
  b2bEn: {
    title: 'A handoff needs decisions',
    hook: 'In this fictional onboarding, sales passed a record; delivery still needs the decision.',
    body: 'A teaching scenario from fictional Northbridge Ops: record the intended outcome, constraints, agreed decisions and unresolved questions. Review one handoff for information the customer had to repeat. This is a diagnostic suggestion, not a measured client result.',
    cta: 'Which decision does your team most often have to reconstruct?',
  },
  localRu: {
    title: 'Что спросить перед первым занятием керамикой',
    hook: 'Учебный пример мастерской «Глина у парка»: результат занятия и готовое изделие могут быть разными этапами.',
    body: 'Перед записью уточните, что входит в занятие, кто выполняет обжиг и как сообщают о готовности. В этом вымышленном примере расписание и цены не заданы, поэтому не обещаем свободные места, срок готовности или конкретную стоимость.',
    cta: 'Какой этап вы хотели бы увидеть подробнее?',
  },
  localEn: {
    title: 'Three questions before a first pottery class',
    hook: 'A fictional studio example: the class and collecting a finished piece are separate steps.',
    body: 'Ask what the session includes, who handles firing, and how collection is arranged. The fictional Parkside Clay brief supplies no prices or timetable, so this packet makes no offer, availability promise or claim about drying time.',
    cta: 'Which part would you like the studio to demonstrate?',
  },
  productRu: {
    title: 'Зачем органайзеру отдельные секции',
    hook: 'Учебный концепт: одна большая коробка или отдельные секции для кабелей?',
    body: 'В вымышленном концепте Deskfield одна коробка оставляет свободное место, а разделённая помогает задавать отдельные категории. Это выбор устройства хранения, а не проверенное обещание экономить время. Сравним два рисунка с одинаковым набором кабелей.',
    cta: 'Какой вариант вы бы попробовали на своём столе?',
  },
  productEn: {
    title: 'One box or separate compartments?',
    hook: 'This fictional Deskfield concept trades open space for explicit cable categories.',
    body: 'Compare two drawn layouts containing the same cables. A single box leaves flexible space; compartments make categories visible. This is a design exercise, not a tested time-saving, durability or sustainability claim.',
    cta: 'Which layout would you try on your desk?',
  },
};

function asset(kind, role, id, durationSeconds) {
  return {
    id,
    kind,
    role,
    mediaId: `synthetic-${id}`,
    mimeType:
      kind === 'subtitle'
        ? 'text/vtt'
        : `${kind}/${kind === 'video' ? 'mp4' : 'png'}`,
    ...(kind !== 'subtitle' ? { width: 1080, height: 1920 } : {}),
    ...(durationSeconds ? { durationSeconds } : {}),
    provenance: { revision: 'synthetic-v1', sourceIds: ['fictional-brief'] },
  };
}

function material(platform, format, example = examples.b2bRu) {
  const result = {
    version: 1,
    channelId: 'fictional-channel',
    platform,
    format,
    ...example,
    caption: example.body,
    assets: [],
    ctaSurface: 'reply',
    settings: {},
    evidence: [
      {
        id: 'fictional-brief',
        sourceId: 'fictional-brief',
        source: 'Explicitly fictional evaluation brief',
        capturedAt: '2026-11-03T10:00:00Z',
        access: 'first_party',
        rights: 'permitted',
        factStatus: 'verified',
        note: 'Verified only as an authored fictional brief; no real customer outcomes.',
      },
    ],
    playbook: { version: 'social-editorial/v1', sourceDate: '2026-11-03' },
  };
  if (platform === 'telegram')
    Object.assign(result.settings, {
      lengthChoiceId: 'specific-diagnostic-compact',
      renderedText: `${result.title}\n${result.hook}\n${result.body}\n${result.cta}`,
    });
  if (format === 'thread')
    Object.assign(result, {
      posts: [
        { index: 1, text: `${example.hook}\n${example.cta}` },
        { index: 2, text: example.body },
        {
          index: 3,
          text: 'Boundary: some context should stay private. Which information would you deliberately exclude from this handoff?',
        },
      ],
    });
  if (format === 'thread') result.settings.maxPostCharacters = 500;
  if (format === 'carousel' || format === 'story') {
    const texts =
      format === 'story'
        ? [example.hook]
        : [example.hook, example.body, example.cta];
    result.slides = texts.map((text, index) => ({
      index: index + 1,
      text,
      assetId: `slide-${index + 1}`,
    }));
    result.assets = result.slides.map((slide) =>
      asset('image', 'slide', slide.assetId)
    );
    result.settings.slideCount = texts.length;
  }
  if (['reel', 'short', 'long_video'].includes(format)) {
    const duration = format === 'long_video' ? 420 : 45;
    result.script = [example.hook, example.body, example.cta].join('\n');
    result.assets = [
      asset('video', 'final', 'final-video', duration),
      asset('subtitle', 'captions', 'captions'),
      asset('image', 'cover', 'cover'),
    ];
    result.scenes = [
      {
        index: 1,
        startSeconds: 0,
        endSeconds: 5,
        spokenText: example.hook,
        visualIntent:
          'Show the two authored concept layouts side by side; label this a fictional example.',
      },
      {
        index: 2,
        startSeconds: 5,
        endSeconds: duration - 5,
        spokenText: example.body,
        visualIntent:
          'Highlight each stated design choice on the matching concept drawing; avoid unrelated stock footage.',
      },
      {
        index: 3,
        startSeconds: duration - 5,
        endSeconds: duration,
        spokenText: example.cta,
        visualIntent:
          'Return to the two layouts and display the actual viewer question.',
      },
    ];
    if (format === 'long_video')
      result.settings.chapterStarts = [0, 60, 180, 300];
  }
  return result;
}

test.each([
  ['telegram', 'post', 'b2bRu'],
  ['telegram', 'post', 'localEn'],
  ['threads', 'thread', 'b2bEn'],
  ['instagram', 'carousel', 'localRu'],
  ['instagram', 'carousel', 'localEn'],
  ['instagram', 'story', 'localEn'],
  ['instagram', 'reel', 'productRu'],
  ['youtube', 'short', 'productEn'],
  ['tiktok', 'short', 'productEn'],
])(
  'accepts structurally assembled %s/%s fictional %s material',
  (platform, format, key) => {
    expect(inspect(material(platform, format, examples[key]))).toMatchObject({
      complete: true,
      issues: [],
    });
  }
);

test('every production playbook distinguishes obligations, advice and experiments and exposes sources', () => {
  expect(listEditorialPlaybooks()).toHaveLength(8);
  for (const book of listEditorialPlaybooks()) {
    expect(new Set(book.rules.map((entry) => entry.kind))).toEqual(
      new Set(['requirement', 'recommendation', 'experiment'])
    );
    expect(
      book.rules.every(
        (entry) => entry.sourceDate === '2026-11-03' && entry.source
      )
    ).toBe(true);
    expect(
      buildEditorialProductionInstructions(book.platform, book.format)
    ).toContain('not platform requirements or guarantees');
  }
  expect(() => getEditorialPlaybook('youtube', 'carousel')).toThrow(
    'Unsupported editorial format'
  );
});

test("a caller cannot mutate the next channel's policy", () => {
  const book = getEditorialPlaybook('telegram', 'post');
  book.rules[0].instruction = 'invent proof';
  book.deliverables.push('unexpected');
  expect(
    getEditorialPlaybook('telegram', 'post').rules[0].instruction
  ).not.toBe('invent proof');
  expect(getEditorialPlaybook('telegram', 'post').deliverables).not.toContain(
    'unexpected'
  );
});

test('a visual instruction or pending render cannot stand in for an actual carousel asset', () => {
  const packet = material('instagram', 'carousel', examples.localEn);
  packet.assets[1].mediaId = '';
  packet.slides[2].assetId = 'render-job-not-a-file';
  expect(inspect(packet).issues.map((entry) => entry.code)).toEqual(
    expect.arrayContaining(['unfinished_asset', 'missing_slide_asset'])
  );
});

test('five Story frames are five campaign items rather than one story material', () => {
  const packet = material('instagram', 'story', examples.localEn);
  packet.slides = Array.from({ length: 5 }, (_, index) => ({
    ...packet.slides[0],
    index: index + 1,
  }));
  expect(inspect(packet).issues).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ code: 'invalid_frame_count' }),
    ])
  );
});

test('Telegram preserves negotiated length, final rich-text parsing and full body continuation', () => {
  const packet = material('telegram', 'post');
  delete packet.settings.lengthChoiceId;
  packet.settings.renderedText = 'я'.repeat(4097);
  expect(inspect(packet).issues.map((entry) => entry.code)).toEqual(
    expect.arrayContaining(['missing_length_choice', 'telegram_text_limit'])
  );
  packet.assets = [asset('image', 'illustration', 'diagram')];
  packet.caption = 'Краткое пояснение схемы';
  packet.settings.lengthChoiceId = 'chosen';
  packet.settings.renderedCaption = 'я'.repeat(1025);
  expect(inspect(packet).issues.map((entry) => entry.code)).toEqual(
    expect.arrayContaining(['telegram_text_limit', 'telegram_body_delivery'])
  );
  packet.settings.renderedCaption = packet.caption;
  packet.settings.telegramTextContinuation = packet.body;
  expect(inspect(packet).complete).toBe(true);
});

test('Threads retains a complete ordered conversation and applies the selected transport limit', () => {
  const packet = material('threads', 'thread', examples.b2bEn);
  packet.posts[1].index = 3;
  packet.posts[0].text = 'a'.repeat(501);
  expect(inspect(packet).issues.map((entry) => entry.code)).toEqual(
    expect.arrayContaining(['invalid_thread_post', 'thread_text_limit'])
  );
});

test('Shorts reject a description click CTA while retaining an honest channel CTA', () => {
  const packet = material('youtube', 'short', examples.productEn);
  packet.cta = 'Click the link in the description';
  packet.ctaSurface = 'description';
  expect(inspect(packet).issues).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ code: 'short_nonclickable_cta' }),
    ])
  );
  packet.cta = 'More design exercises on the channel';
  packet.ctaSurface = 'bio';
  expect(inspect(packet).complete).toBe(true);
});

test('an outline and a short opening do not pass as a finished seven-minute video', () => {
  const packet = material('youtube', 'long_video', examples.productEn);
  packet.scenes = packet.scenes.slice(0, 1);
  packet.script = '';
  packet.assets = packet.assets.filter((entry) => entry.role !== 'cover');
  expect(inspect(packet).issues.map((entry) => entry.code)).toEqual(
    expect.arrayContaining([
      'missing_script',
      'missing_finished_asset',
      'scene_duration_mismatch',
    ])
  );
});

test('unknown rights, missing provenance and expired evidence stop structural readiness', () => {
  const packet = material('instagram', 'carousel', examples.localRu);
  packet.evidence[0].rights = 'unknown';
  packet.evidence[0].expiresAt = '2026-11-03T11:59:59Z';
  packet.assets[0].provenance.sourceIds = ['unresolved'];
  expect(inspect(packet).issues.map((entry) => entry.code)).toEqual(
    expect.arrayContaining([
      'unresolved_source_rights',
      'expired_evidence',
      'unknown_asset_source',
    ])
  );
});

test('structural readiness retains human/semantic quality and provider acceptance gates', () => {
  const result = inspect(material('instagram', 'reel', examples.productRu));
  expect(result.reviewRequired.join('\n')).toContain(
    'does not establish editorial quality'
  );
  expect(result).not.toHaveProperty('published');
  expect(result).not.toHaveProperty('receipt');
});

test('malformed generated array entries produce issues instead of crashing approval', () => {
  const packet = material('instagram', 'carousel', examples.localEn);
  packet.assets.push(null);
  packet.evidence.push(null);
  packet.slides.push(null);
  const result = inspect(packet);
  expect(result.complete).toBe(false);
  expect(result.issues.map((entry) => entry.code)).toEqual(
    expect.arrayContaining([
      'invalid_asset',
      'invalid_evidence',
      'invalid_slide',
    ])
  );
});

test('asset provenance resolves canonical source IDs rather than evidence observation IDs', () => {
  const packet = material('instagram', 'carousel', examples.localEn);
  packet.evidence[0].id = 'observation-847';
  expect(inspect(packet).complete).toBe(true);
  packet.assets[0].provenance.sourceIds = ['observation-847'];
  expect(inspect(packet).issues).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ code: 'unknown_asset_source' }),
    ])
  );
  delete packet.evidence[0].sourceId;
  expect(inspect(packet).complete).toBe(false);
});

function thirdPartyPacket(overrides = {}) {
  const packet = material('instagram', 'carousel', examples.localEn);
  Object.assign(packet.evidence[0], {
    id: 'licensed-observation-1',
    sourceId: 'fictional-brief',
    access: 'licensed',
    originPlatform: 'web',
    grantId: 'editorial-grant',
    purpose: 'editorial',
    consentExpiresAt: '2026-11-04T12:00:00Z',
    ...overrides,
  });
  return packet;
}

test('a currently valid third-party editorial grant permits structural assembly', () => {
  expect(inspect(thirdPartyPacket()).complete).toBe(true);
});

test.each([
  [{ revokedAt: '2026-11-03T11:00:00Z' }, 'revoked_source_permission'],
  [{ consentExpiresAt: '2026-11-03T12:00:00Z' }, 'expired_source_permission'],
  [{ consentExpiresAt: 'invalid' }, 'expired_source_permission'],
  [{ consentExpiresAt: undefined }, 'missing_editorial_permission'],
  [{ purpose: 'discovery' }, 'missing_editorial_permission'],
  [{ purpose: undefined }, 'missing_editorial_permission'],
  [{ grantId: '' }, 'missing_editorial_permission'],
])(
  'a third-party grant with %j cannot approve editorial reuse',
  (overrides, code) => {
    const result = inspect(thirdPartyPacket(overrides));
    expect(result.complete).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code })])
    );
  }
);

test.each(['upload', 'public', 'first_party'])(
  'Telegram origin retains permission requirements through %s acquisition',
  (access) => {
    const packet = thirdPartyPacket({
      access,
      originPlatform: 'telegram',
      purpose: 'discovery',
    });
    expect(inspect(packet).issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'missing_editorial_permission' }),
      ])
    );
  }
);

test('a first-party source does not require a third-party grant, but explicit revocation still invalidates it', () => {
  const packet = material('telegram', 'post', examples.b2bRu);
  expect(inspect(packet).complete).toBe(true);
  packet.evidence[0].revokedAt = '2026-11-03T11:00:00Z';
  expect(inspect(packet).issues).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ code: 'revoked_source_permission' }),
    ])
  );
});

test('ctaSurface=none is valid only when the material has no CTA text', () => {
  const packet = material('instagram', 'carousel', examples.localEn);
  packet.ctaSurface = 'none';
  expect(inspect(packet)).toMatchObject({
    complete: false,
    issues: expect.arrayContaining([
      expect.objectContaining({
        code: 'contradictory_cta_surface',
        field: 'ctaSurface',
      }),
    ]),
  });
  packet.cta = '   ';
  expect(inspect(packet).complete).toBe(true);
  delete packet.cta;
  expect(inspect(packet).complete).toBe(true);
});

test('server-resolved plain web registry authority does not require an invented scoped grant', () => {
  const packet = material('instagram', 'carousel', examples.localEn);
  Object.assign(packet.evidence[0], {
    access: 'public',
    originPlatform: 'web',
    sourceUrl: 'https://example.com/guide',
    ownerScope: 'org-a',
    permissionBasis: 'registry_confirmed',
    rightsConfirmedAt: '2026-11-03T10:00:00Z',
    sourceRevision: 'snapshot-a',
    purpose: 'editorial',
  });
  expect(inspect(packet).complete).toBe(true);
  packet.evidence[0].sourceUrl = 'https://t.me/channel/123';
  expect(inspect(packet).issues).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ code: 'invalid_registry_authority' }),
    ])
  );
  packet.evidence[0].sourceUrl = 'https://example.com/guide';
  packet.evidence[0].rightsConfirmedAt = '2026-11-04T10:00:00Z';
  expect(inspect(packet).complete).toBe(false);
  packet.evidence[0].rightsConfirmedAt = '2026-11-03T10:00:00Z';
  packet.evidence[0].originPlatform = 'youtube';
  expect(inspect(packet).complete).toBe(false);
});

test('finished video accepts authoritative burned captions without a sidecar only with measured provenance', () => {
  const packet = material('instagram', 'reel', examples.productRu);
  expect(inspect(packet).complete).toBe(true); // Existing owned sidecar path.
  packet.assets = packet.assets.filter(entry => entry.kind !== 'subtitle');
  const video = packet.assets.find(entry => entry.role === 'final');
  video.provenance.jobId = 'final-job';
  video.videoEvidence = {metadata:{source:'mp4_bytes',sha256:'a'.repeat(64)},captions:{burned:'provider_confirmed',sourceJobIds:['final-job']}};
  expect(inspect(packet).complete).toBe(true);
  video.videoEvidence.captions = {burned:'retained_scene_lineage',sourceJobIds:['scene-job']};
  expect(inspect(packet).complete).toBe(true);
  for (const burned of ['unverified','requested','authored_timed_cues']) {
    video.videoEvidence.captions = {burned,sourceJobIds:['final-job']};
    expect(inspect(packet).issues).toEqual(expect.arrayContaining([expect.objectContaining({code:'missing_finished_asset'})]));
  }
  video.videoEvidence.captions = {burned:'provider_confirmed',sourceJobIds:[]};
  expect(inspect(packet).complete).toBe(false);
  video.videoEvidence.captions.sourceJobIds = ['other-job'];
  expect(inspect(packet).complete).toBe(false);
  video.videoEvidence.captions.sourceJobIds = ['final-job'];
  video.videoEvidence.metadata.sha256 = 'not-a-sha256';
  expect(inspect(packet).complete).toBe(false);
  video.videoEvidence.metadata.sha256 = 'a'.repeat(64);
  delete video.provenance.jobId;
  expect(inspect(packet).complete).toBe(false);
});

test('local authored caption evidence permits structural readiness without inventing provider jobs or speech alignment',()=>{
 const packet=material('instagram','reel',examples.productRu);packet.assets=packet.assets.filter(a=>a.kind!=='subtitle');
 packet.sourceArtifact={version:1,kind:'piece',pieceId:'source-piece',revision:'b'.repeat(64)};
 const video=packet.assets.find(a=>a.role==='final');video.provenance.provider='local-composition.v2';delete video.provenance.jobId;
 video.videoEvidence={metadata:{source:'mp4_bytes',sha256:'a'.repeat(64)},captions:{burned:'unverified',sourceJobIds:[]},localComposition:{version:2,engineVersion:'local-composition/2.1',renderKey:'c'.repeat(64),manifestDigest:'d'.repeat(64),approvedSettingsDigest:'e'.repeat(64),sourceArtifact:packet.sourceArtifact,textSha256:'f'.repeat(64),materialDigest:localCompositionMaterialDigestV2(packet),outputSha256:'a'.repeat(64),screenOnly:false,speechAlignment:'unverified',captions:{kind:'authored_timed_text',sourceJobIds:[],speechAlignment:'unverified'},textRendering:{physicalBurn:true,cuesSha256:'a'.repeat(64),cueCount:1,screenTitleCount:0,speechCaptionCount:1,speechCaptionsSha256:'a'.repeat(64)}}};
 expect(inspect(packet).complete).toBe(true);expect(video.videoEvidence.localComposition.speechAlignment).toBe('unverified');
 video.videoEvidence.localComposition.textRendering.physicalBurn=false;expect(inspect(packet).complete).toBe(false);
 video.videoEvidence.localComposition.textRendering.physicalBurn=true;packet.script+=' Changed';expect(inspect(packet).complete).toBe(false);
 delete packet.sourceArtifact;expect(()=>inspect(packet)).not.toThrow();expect(inspect(packet).complete).toBe(false);
});
