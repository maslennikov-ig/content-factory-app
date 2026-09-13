'use strict';

/**
 * `content-factory-next-75xn.23` (F14). The rows a sweep brings back that are
 * not leads, refused before any model is paid to think about them.
 *
 * Twelve of the forty rows the owner judged by hand on 13.09.2026 were junk,
 * and six of those were somebody's Facebook, X or Instagram post about the
 * news rather than the news. These rules are deliberately blunt and
 * deliberately deterministic: a workspace with no model key must get a feed
 * without mirrors in it, and every row refused here is a row the `classify`
 * call never pays for.
 */

const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const {
  discoveryJunkReason,
  isDiscoveryJunk,
  isSocialMirror,
  isPdf,
  sharedStemCount,
  uniqueStems,
  MINIMUM_EXCERPT_LETTERS,
} = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/content-intelligence/leads/lead-junk.ts'
);

const TOPIC = 'комиссии Wildberries и Ozon';
const STEMS = uniqueStems(TOPIC);
const PROSE =
  'Комиссии маркетплейсов впервые превысили сорок процентов от стоимости товара, ' +
  'пишет издание со ссылкой на продавцов и данные площадок.';

const row = (over = {}) => ({
  url: 'https://www.kommersant.ru/doc/8908235',
  title: 'Комиссии на маркетплейсах выросли',
  excerpt: PROSE,
  ...over,
});

describe('somebody’s post about the news is not the news', () => {
  test.each([
    ['https://www.facebook.com/kommersant.ru/posts/abc'],
    ['https://x.com/delfoo/status/2090782767789293849'],
    ['https://twitter.com/someone/status/1'],
    ['https://www.instagram.com/p/DcCARvMOlzR'],
    ['https://vk.com/wall-1_2'],
    ['https://t.me/channel/42'],
    ['https://www.threads.net/@someone/post/1'],
    ['https://www.tiktok.com/@someone/video/1'],
    ['https://m.facebook.com/story.php?id=1'],
    ['https://www.youtube.com/shorts/abc'],
    ['https://www.linkedin.com/posts/someone_activity-1'],
  ])('%s is a mirror', (url) => {
    expect(isSocialMirror(url)).toBe(true);
    expect(discoveryJunkReason(row({ url }), STEMS)).toBe('SOCIAL_MIRROR');
  });

  test('the rest of those sites is not refused wholesale', () => {
    // A YouTube video page and a LinkedIn article are ordinary pages; only
    // the two path shapes that mean «somebody reposted something» are out.
    expect(isSocialMirror('https://www.youtube.com/watch?v=abc')).toBe(false);
    expect(isSocialMirror('https://www.linkedin.com/pulse/article-slug')).toBe(false);
    // And a host that merely ends in the same letters is a different site.
    expect(isSocialMirror('https://notfacebook.com/a')).toBe(false);
  });
});

describe('a PDF is not a lead', () => {
  test('by extension, and by content type when a page was read', () => {
    expect(isPdf('https://vestnik.example/article/download/194.pdf')).toBe(true);
    expect(isPdf('https://vestnik.example/article/download/194', 'application/pdf')).toBe(
      true
    );
    expect(discoveryJunkReason(row({ url: 'https://x.example/a.pdf' }), STEMS)).toBe('PDF');
    expect(isPdf('https://x.example/pdf-guide')).toBe(false);
  });
});

describe('a row a person cannot read is not a lead', () => {
  test(`fewer than ${MINIMUM_EXCERPT_LETTERS} letters of text, or none at all, is refused`, () => {
    expect(discoveryJunkReason(row({ excerpt: null }), STEMS)).toBe('SHORT_TEXT');
    expect(discoveryJunkReason(row({ excerpt: 'Комиссии выросли.' }), STEMS)).toBe(
      'SHORT_TEXT'
    );
    expect(discoveryJunkReason(row(), STEMS)).toBeNull();
  });

  test('an engine that scores its own row below a half is believed', () => {
    expect(discoveryJunkReason(row({ score: 0.31 }), STEMS)).toBe('LOW_SCORE');
    expect(discoveryJunkReason(row({ score: 0.74 }), STEMS)).toBeNull();
    // An engine that gives no score has not given a low one.
    expect(discoveryJunkReason(row({ score: undefined }), STEMS)).toBeNull();
    expect(discoveryJunkReason(row({ score: null }), STEMS)).toBeNull();
  });
});

describe('a page that shares no word with the topic', () => {
  test('a page with no word of the topic in it is out', () => {
    const stems = uniqueStems('Temporal workflow engine releases');
    const speeches = {
      url: 'https://www.kimi.ai/ru/resources/persuasive-speech-topics',
      title: '100 тем для убедительной речи',
      excerpt:
        'Подборка идей для выступления: от школьной формы до пользы утренних ' +
        'пробежек, с советами, как построить аргументацию и удержать внимание зала.',
    };

    expect(discoveryJunkReason(speeches, stems)).toBe('OFF_TOPIC');
  });

  test('one shared word is where the rules stop and the judge starts', () => {
    // The release notes of an unrelated product landed in a topic about
    // Temporal because both say «release» (F14). One shared stem is a real
    // signal and a weak one, so this rule keeps the row and
    // `lead-discovery-judge.ts` is the thing that reads it and says no. The
    // boundary is written down here so neither side quietly takes the other's
    // job.
    const stems = uniqueStems('Temporal workflow engine releases');
    const incode = {
      url: 'https://developer.incode.com/release-notes/platform-release-notes-2026',
      title: 'Platform Release Notes 2026 - Incode Developer Hub',
      excerpt:
        'This page lists the platform updates shipped by the Incode identity ' +
        'product during the year, with the version numbers and the dates of each.',
    };

    expect(sharedStemCount(stems, `${incode.title} ${incode.excerpt}`)).toBe(1);
    expect(discoveryJunkReason(incode, stems)).toBeNull();
  });

  test('a crude stem is enough to keep a declined Russian word', () => {
    const stems = uniqueStems('регулирование ИИ в Европе');

    expect(sharedStemCount(stems, 'Новое в регулировании ИИ')).toBe(1);
    expect(
      discoveryJunkReason(
        {
          url: 'https://proton.me/blog/eu-ai-act',
          title: 'Что меняет регулирование искусственного интеллекта',
          excerpt:
            'Европейский регламент вводит обязанности для поставщиков систем ' +
            'искусственного интеллекта и называет сроки, к которым их нужно исполнить.',
        },
        stems
      )
    ).toBeNull();
  });

  test('a topic with no word of five letters refuses nobody', () => {
    // «ИИ» has no stem to compare with, and «no evidence» must not read as
    // «no match»: every row of such a topic goes on to the model.
    const stems = uniqueStems('ИИ');

    expect(stems.size).toBe(0);
    expect(isDiscoveryJunk(row(), stems)).toBe(false);
  });
});
