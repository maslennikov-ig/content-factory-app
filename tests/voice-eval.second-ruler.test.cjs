'use strict';

/**
 * The second ruler's arithmetic, without downloading a model.
 *
 * The weights are a developer's local instrument and never enter this
 * repository, so a suite that needed them would be a suite that runs nowhere.
 * What is checked here is everything between the embedding and the number: the
 * author's print is the mean direction of the *training* half, the distance is
 * cosine, and the report speaks the same shape the first ruler's does — because
 * the whole point of the second ruler is that the two can be laid side by side.
 */

const path = require('node:path');
const fs = require('node:fs');

const secondRuler = require('../scripts/evidence/voice-eval/second-ruler.cjs');

describe('вторая мерка объявляет, чем она меряет', () => {
  it('обе модели названы вместе с лицензией', () => {
    expect(secondRuler.MODELS.luar).toEqual({
      repo: 'rrivera1849/LUAR-MUD',
      licence: 'Apache-2.0',
    });
    expect(secondRuler.MODELS.mstyledistance).toEqual({
      repo: 'StyleDistance/mstyledistance',
      licence: 'MIT',
    });
  });

  it('неизвестная модель отвергается по имени, а не молча', () => {
    expect(() =>
      secondRuler.measureWithSecondRuler({
        pulled: { corpus: { language: 'ru' }, samples: [] },
        generations: [],
        model: 'нет-такой',
      })
    ).toThrow(/unknown second ruler/u);
  });

  it('среда живёт вне репозитория и не попадает в него', () => {
    const gitignore = fs.readFileSync(
      path.join(__dirname, '..', '.gitignore'),
      'utf8'
    );

    expect(gitignore).toContain(
      'scripts/evidence/voice-eval/second-ruler/.venv/'
    );
    expect(gitignore).toContain(
      'scripts/evidence/voice-eval/second-ruler/weights/'
    );
  });

  it('в libraries вторая мерка не проникла', () => {
    const libraries = path.join(__dirname, '..', 'libraries');
    const hits = [];
    const walk = (directory) => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === 'node_modules') continue;
          walk(full);
          continue;
        }
        if (!entry.name.endsWith('.ts')) continue;
        const text = fs.readFileSync(full, 'utf8');
        if (/LUAR|mstyledistance|second-ruler/u.test(text)) hits.push(full);
      }
    };
    walk(libraries);

    expect(hits).toEqual([]);
  });
});
