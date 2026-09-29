'use strict';

const { factRows, INJECTED } = require('./fact-rows.cjs');

/**
 * «Свои тексты по теме» and the free cliché check from the chat (kcxz.24).
 * The own texts are this workspace's posts that went out with an address,
 * ranked by the real index — not a draft, not a piece, not another
 * workspace's post — and reach the model as data: a post that gives orders is
 * quoted, never obeyed. The check is the door's own `slopCheck`, so it finds
 * what the post window finds; it spends and writes nothing. A stranger's
 * English post pasted into a Russian chat is checked by the English rules —
 * the text's script decides, not the interface (review W4-24 F9) — and the
 * hints stay in the person's language.
 */
const PASTED =
  'Давайте разберёмся. Важно отметить, что это не просто созвон, а настоящий вызов для команды. В современном мире каждая минута на счету.';
const FOREIGN =
  "In today's fast-paced world, it is important to note that this is not just a meeting, it is a game-changer. Let's delve into it.";

module.exports = {
  id: 'text-related-slop-check',
  title: 'Свои тексты по теме и проверка на штампы — бесплатно, ничего не записано',
  covers: ['texts.related', 'text.slop_check'],
  world: factRows(),
  turns: [
    {
      say: 'Что я уже писал про созвоны?',
      model: [[['tool', 'texts_related', { topic: 'созвоны' }]], [['text', 'Два поста.']]],
    },
    {
      say: `Проверь на штампы для канала про работу: ${PASTED}`,
      model: [[['tool', 'text_slop_check', { text: PASTED, channelId: 'c1' }]], [['text', 'Есть штампы.']]],
    },
    {
      say: `А этот чужой пост? ${FOREIGN}`,
      model: [[['tool', 'text_slop_check', { text: FOREIGN }]], [['text', 'И тут штампы.']]],
    },
  ],
  check: (run) => {
    const [related, check, foreign] = run.turns;
    const found = related.outputs[0].output;
    expect(found.ok).toBe(true);
    expect(found.summary.untrustedData.sources).toEqual(['channel-post']);
    const posts = found.summary.untrustedData.value.related;
    expect(posts.map((one) => one.url).sort()).toEqual(['https://t.me/work/101', 'https://t.me/work/102']);
    expect(posts.find((one) => one.url === 'https://t.me/work/102').excerpt).toContain(INJECTED);
    expect(posts[0]).toMatchObject({ platform: 'telegram' });
    expect(JSON.stringify(found)).not.toContain('t.me/other');
    expect(JSON.stringify(found)).not.toContain('черновик');

    // The same report the door gives for the same text and platform.
    const { slopCheck } = require('../../helpers/load-ts-module.cjs').loadTypeScriptModule(
      'libraries/nestjs-libraries/src/content-intelligence/text-quality/slop-check.ts'
    );
    const door = slopCheck(PASTED, { platform: 'telegram', locale: 'ru' });
    const report = check.outputs[0].output.summary.untrustedData.value;
    expect(check.outputs[0].output.summary.untrustedData.sources).toEqual(['foreign-post']);
    expect(report).toMatchObject({ verdict: door.verdict, score: door.score, words: door.metrics.words });
    expect(report.findings).toHaveLength(door.findings.length);
    expect(report.findings.length).toBeGreaterThan(0);
    expect(report.findings[0].hint).toBe(door.findings[0].hint.ru);
    expect(report.language).toBe('ru');

    // English text, Russian interface: the English rules, Russian hints.
    const english = slopCheck(FOREIGN, { locale: 'en' });
    const foreignReport = foreign.outputs[0].output.summary.untrustedData.value;
    expect(foreignReport).toMatchObject({ language: 'en', verdict: english.verdict, score: english.score });
    expect(foreignReport.findings.map((one) => one.found)).toEqual(english.findings.map((one) => one.excerpt));
    expect(foreignReport.findings.length).toBeGreaterThan(0);
    expect(foreignReport.findings[0].hint).toBe(english.findings[0].hint.ru);

    expect(run.writes).toEqual([]);
    expect(run.admissions.filter(([operation]) => operation !== 'agent')).toEqual([]);
  },
};
