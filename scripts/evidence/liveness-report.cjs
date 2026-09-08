#!/usr/bin/env node
'use strict';

/** Read-only wording retention measurement. No model, no private text in output.
 * DATABASE_URL must name a local stand/restored copy; optionally CF_LIVENESS_ORG
 * restricts the query to one workspace. Run with --output <report.md>.
 * This measures literal retention, not whether the writing sounds human.
 */
const fs = require('node:fs');
const path = require('node:path');
const { loadWithMocks } = require('../../tests/helpers/load-ts-with-mocks.cjs');
const { normalisedWords, wordShingles, sharedRuns } = loadWithMocks(
  'libraries/nestjs-libraries/src/content-intelligence/text-quality/anti-copy.ts',
  {}
);

function retention(personText, candidate, minWords) {
  const totalWords = normalisedWords(personText).length;
  const runs = sharedRuns(personText, wordShingles(candidate, minWords), minWords);
  const retainedWords = runs.reduce((total, run) => total + normalisedWords(run.text).length, 0);
  const sentences = personText.split(/(?<=[.!?…])\s+|\n+/u)
    .map(normalisedWords).filter((words) => words.length >= minWords);
  const candidateWords = ` ${normalisedWords(candidate).join(' ')} `;
  const retainedSentences = sentences.filter((words) =>
    candidateWords.includes(` ${words.join(' ')} `)
  ).length;
  return {
    minWords, totalWords, retainedWords,
    wordShare: totalWords >= minWords ? retainedWords / totalWords : null,
    eligibleSentences: sentences.length, retainedSentences,
    sentenceShare: sentences.length ? retainedSentences / sentences.length : null,
  };
}

function makeReport(pieces) {
  const eligible = pieces.filter((piece) => piece.kind === 'CORE' &&
    piece.brief?.brief?.inputKind === 'thought' &&
    typeof piece.brief.personText === 'string' && piece.brief.personText.trim());
  const rows = [];
  const groups = new Map();
  let missingBodies = 0;
  for (const [index, piece] of eligible.entries()) {
    const person = piece.brief.personText;
    const targets = [{ platform: 'суть', body: piece.body }, ...piece.derivations];
    for (const [targetIndex, target] of targets.entries()) {
      if (typeof target.body !== 'string' || !target.body.trim()) {
        missingBodies += 1;
        continue;
      }
      for (const n of [5, 8]) {
        const measured = retention(person, target.body, n);
        rows.push({ piece: index + 1, adaptation: targetIndex, platform: target.platform, ...measured });
        const key = `${target.platform}:${n}`;
        const group = groups.get(key) || {
          platform: target.platform, minWords: n, compared: 0, eligiblePairs: 0,
          totalWords: 0, retainedWords: 0, eligibleSentences: 0, retainedSentences: 0,
        };
        group.compared += 1;
        if (measured.wordShare !== null) {
          group.eligiblePairs += 1;
          group.totalWords += measured.totalWords;
          group.retainedWords += measured.retainedWords;
        }
        group.eligibleSentences += measured.eligibleSentences;
        group.retainedSentences += measured.retainedSentences;
        groups.set(key, group);
      }
    }
  }
  return { scannedPieces: pieces.length, eligiblePieces: eligible.length, missingBodies,
    adaptationPairs: rows.filter((row) => row.adaptation > 0 && row.minWords === 5).length, rows,
    groups: [...groups.values()].sort((a, b) => a.platform.localeCompare(b.platform) || a.minWords - b.minWords) };
}

const percent = (numerator, denominator) => denominator ? `${(100 * numerator / denominator).toFixed(1)}%` : 'нет данных';
const cell = (value) => String(value).replace(/[|\r\n]/g, ' ');
function markdown(report) {
  const lines = [
    '# Сохранность слов человека: замер без модели', '',
    'Источник: локальная база стенда или восстановленная копия. Только чтение через Prisma.',
    `Проверено заготовок: ${report.scannedPieces}; из мысли с сохранённым personText: ${report.eligiblePieces}; пустых тел пропущено: ${report.missingBodies}.`, '',
    `Подходящих адаптаций для сравнения со словами человека: ${report.adaptationPairs}.`, '',
    'Считаем долю исходных слов, покрытых совпавшими окнами по 5 и 8 слов. Пересекающиеся окна не удваивают слова. Регистр, пунктуация и ё/е не различаются — как в антикопии продукта.',
    'Предложение считается сохранённым, если вся его последовательность слов найдена в тексте. Предложения короче окна исключены из знаменателя. Сводная доля слов взвешена по длине исходных текстов; каждая адаптация — отдельное сравнение.',
    'Это проверка дословного переноса, а не оценка качества, фактов или живости. Отсутствие подходящих данных не означает успешную проверку. Тексты, заголовки, идентификаторы областей и пользователей в отчёт не попадают.', '',
    '| Площадка | Окно | Сравнений | Слова сохранены | Предложения сохранены |',
    '| --- | ---: | ---: | ---: | ---: |',
    ...report.groups.map((g) => `| ${cell(g.platform)} | ${g.minWords} | ${g.compared} | ${percent(g.retainedWords, g.totalWords)} | ${percent(g.retainedSentences, g.eligibleSentences)} |`), '',
    '| Заготовка в выборке | Адаптация (0 = суть) | Площадка | Окно | Слова | Предложения |',
    '| ---: | ---: | --- | ---: | ---: | ---: |',
    ...report.rows.map((r) => `| ${r.piece} | ${r.adaptation} | ${cell(r.platform)} | ${r.minWords} | ${r.wordShare === null ? 'нет данных' : percent(r.retainedWords, r.totalWords)} | ${percent(r.retainedSentences, r.eligibleSentences)} |`), '',
    report.adaptationPairs
      ? 'G1: перенос авторских слов показан отдельно в сути и адаптациях.'
      : 'G1: подходящих адаптаций из мысли в выборке нет; долю переноса в адаптацию установить нельзя. Ниже приведён только перенос в суть. Это ограничение данных, не успешная проверка адаптации.',
    'G2: короткий путь снимается по решению владельца; этот замер его не запускает. G3: доступные сохранённые данные проверены без повторного прогона владельцем и без платных вызовов.', '',
  ];
  return lines.join('\n');
}

async function readPieces(prisma, organizationId) {
  const pieces = [];
  let cursor;
  for (;;) {
    const batch = await prisma.contentPiece.findMany({
      where: { kind: 'CORE', ...(organizationId ? { organizationId } : {}) },
      select: { id: true, kind: true, body: true, brief: true,
        derivations: { select: { platform: true, body: true }, orderBy: { id: 'asc' } } },
      orderBy: { id: 'asc' }, take: 200, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    pieces.push(...batch);
    if (batch.length < 200) break;
    cursor = batch[batch.length - 1].id;
  }
  return pieces;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--output') throw new Error('usage: DATABASE_URL=<local-copy> node scripts/evidence/liveness-report.cjs --output <report.md>');
  const url = new URL(process.env.DATABASE_URL || '');
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('DATABASE_URL must name a local stand or restored copy');
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  try {
    const report = makeReport(await readPieces(prisma, process.env.CF_LIVENESS_ORG));
    fs.mkdirSync(path.dirname(args[1]), { recursive: true });
    fs.writeFileSync(args[1], markdown(report), { mode: 0o600 });
    console.log(JSON.stringify({ eligiblePieces: report.eligiblePieces, comparisons: report.rows.length, output: args[1] }));
  } finally { await prisma.$disconnect(); }
}

module.exports = { retention, makeReport, markdown, readPieces };
if (require.main === module) main().catch((error) => {
  // Prisma exceptions may include connection details; output only its code.
  console.error(error.code ? `Database read failed (${error.code})` : 'Report failed: check local DATABASE_URL, arguments and output access');
  process.exitCode = 1;
});
