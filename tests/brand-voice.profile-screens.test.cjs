'use strict';

/**
 * Showing the voice: the passport, the eight scales, the version history.
 *
 * Three rules here are decisions the design argued for, and each is the kind
 * that quietly erodes: a bar chart grows a radar chart, a corridor gets drawn
 * in the wrong units and still looks like a chart, and an "unchanged" row gets
 * dropped from a comparison because it seemed like noise.
 */

const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '..');
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  pretendToBeVisual: true,
  url: 'http://localhost/',
});
for (const key of ['window', 'document', 'navigator']) {
  Object.defineProperty(global, key, {
    configurable: true,
    value: key === 'window' ? dom.window : dom.window[key],
  });
}
global.IS_REACT_ACT_ENVIRONMENT = true;
const { cleanup, render, screen, within } = require('@testing-library/react');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const base = 'apps/frontend/src/components/brand-voice';
const copy = loadTypeScriptModule(`${base}/voice-copy.ts`);
const scalesScreen = loadTypeScriptModule(`${base}/voice-scales.screen.tsx`);
const passportScreen = loadTypeScriptModule(`${base}/voice-passport.screen.tsx`);
const versionsScreen = loadTypeScriptModule(`${base}/voice-versions.screen.tsx`);

const source = (file) =>
  fs.readFileSync(path.join(root, base, file), 'utf8');

/**
 * Source with its comments blanked.
 *
 * A file explaining why it has no radar chart contains the word "radar", and a
 * scan that could not tell using from mentioning would fail the file for
 * documenting its own decision. The same mistake `ai-artefacts.ts` exists to
 * avoid, in a test this time.
 */
const code = (file) =>
  source(file)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1 ');

afterEach(cleanup);

const scaleValue = (over = {}) => ({
  kind: 'value',
  raw: 14.2,
  display: copy.toDisplay(14.2, 'sentenceLength'),
  low: 10,
  high: 18,
  observations: 980,
  sampleCount: 16,
  exampleText: 'Причина — поставка.',
  exampleSampleCode: 'smp-02',
  ...over,
});

describe('the eight scales', () => {
  test('the corridor is drawn in the same coordinates as the value', () => {
    // The corridor for "how long the phrases are" is 10–18 *words* and the
    // value is 14.2 words. Placing the mark through the domain and the bar as
    // a raw percentage puts them in different coordinate systems, and the
    // corridor lands where the value can never fall — a chart that looks like
    // it works and is not true.
    expect(copy.toDisplay(10, 'sentenceLength')).toBe(17);
    expect(copy.toDisplay(18, 'sentenceLength')).toBe(39);
    expect(copy.toDisplay(14.2, 'sentenceLength')).toBe(28);

    const value = copy.toDisplay(14.2, 'sentenceLength');
    expect(value).toBeGreaterThan(copy.toDisplay(10, 'sentenceLength'));
    expect(value).toBeLessThan(copy.toDisplay(18, 'sentenceLength'));

    expect(source('voice-scales.screen.tsx')).toContain('corridorStart');
    // Both the read-only bar and the draggable one map through the domain.
    // `shown` is the entry with any unsaved handle position laid over it, so
    // dragging cannot slip into a second coordinate system halfway.
    expect(source('voice-scales.screen.tsx')).toContain('toDisplay(shown.low');
    expect(source('voice-corridor.control.tsx')).toContain(
      'toDisplay(low, scaleKey)'
    );
    expect(source('voice-corridor.control.tsx')).toContain(
      'SCALE_DOMAIN[scaleKey]'
    );
  });

  test('a per-cent scale keeps its own units untouched', () => {
    expect(copy.toDisplay(26, 'listParagraphs')).toBe(26);
    expect(copy.toDisplay(74, 'dashCopula')).toBe(74);
  });

  test('a value outside the corridor is said in words, not only coloured', () => {
    render(
      React.createElement(scalesScreen.VoiceScalesScreen, {
        locale: 'ru',
        scales: {
          listParagraphs: scaleValue({ raw: 26, display: 26, low: 8, high: 20 }),
        },
      })
    );

    expect(screen.getByText(copy.voiceCopy.ru.scalesAbove)).toBeTruthy();
  });

  test('a scale with too few observations says so instead of showing a number', () => {
    render(
      React.createElement(scalesScreen.VoiceScalesScreen, {
        locale: 'ru',
        scales: {
          questions: { kind: 'gap', reason: 'TOO_FEW_POSITIVE', positives: 4 },
        },
      })
    );

    // The design says it in words, and the words carry the reason.
    expect(screen.getByText(/мало, чтобы считать привычкой/)).toBeTruthy();
    expect(screen.queryByText('4%')).toBeNull();
  });

  test('one failed scale announces itself and leaves the others working', () => {
    render(
      React.createElement(scalesScreen.VoiceScalesScreen, {
        locale: 'ru',
        scales: {
          sentenceLength: scaleValue(),
          sentenceSpread: { kind: 'gap', reason: 'FAILED', positives: 0 },
        },
      })
    );

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain(
      copy.voiceCopy.ru.scalesFailedRest
    );
    expect(screen.getByText('14,2')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: copy.voiceCopy.ru.scalesRecount })
    ).toBeTruthy();
  });

  test('there is no radar chart and no single voice score', () => {
    const text = code('voice-scales.screen.tsx');

    // Checking the thing, not the word. The file names the decision it made —
    // "почему не паутина" — and a scan for the word would fail it for
    // explaining itself, which is the mistake `ai-artefacts.ts` exists to
    // avoid. What is actually forbidden is a chart: a charting dependency, or
    // a polar element rendered by hand.
    expect(text).not.toMatch(
      /from '(?:recharts|chart\.js|victory|@nivo\/[^']+|d3(?:-shape)?)'/
    );
    expect(text).not.toMatch(/<(?:Radar|PolarGrid|PolarAngleAxis|RadialBar)\b/);
    // Eight axes in a circle cannot be compared with each other, cannot be
    // read aloud, and suggest a "shape" of a personality that is not there.
    expect(text).not.toMatch(/<(?:svg|circle|path)\b/);
    // A single number would collapse eight observations into a rating with
    // nothing to do.
    expect(text).not.toMatch(/overallScore|voiceScore|totalScore/);
  });

  test('every bar is readable without seeing it', () => {
    render(
      React.createElement(scalesScreen.VoiceScalesScreen, {
        locale: 'ru',
        scales: { sentenceLength: scaleValue() },
      })
    );

    const bar = screen.getByRole('img');
    expect(bar.getAttribute('aria-label')).toContain('14,2');
    expect(bar.getAttribute('aria-label')).toContain('10');
  });
});

describe('the passport', () => {
  const voice = {
    whoSpeaks: 'Служба новостей завода',
    tone: 'Спокойно и по делу',
    audience: 'К своим: смены, мастера',
    neverSay: ['мы рады сообщить'],
    versionLabel: 'v3',
    activeSince: '22.08.2026',
    sampleCount: 16,
    charCount: 15200,
  };

  test('"no voice" is a variant of the card, not a hole', () => {
    render(
      React.createElement(passportScreen.VoicePassportScreen, {
        locale: 'ru',
        voice: null,
      })
    );

    expect(screen.getByText(copy.voiceCopy.ru.passportNoVoice)).toBeTruthy();
    expect(screen.getByText(/рабочий режим, а не ошибка/)).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  test('the four sentences and both measurements are shown together', () => {
    render(
      React.createElement(passportScreen.VoicePassportScreen, {
        locale: 'ru',
        voice: {
          ...voice,
          sentenceLength: { value: '14,2', low: 10, high: 18 },
          dashShare: '74%',
        },
      })
    );

    for (const text of [voice.whoSpeaks, voice.tone, voice.audience]) {
      expect(screen.getByText(text)).toBeTruthy();
    }
    // The words rest on something counted rather than asserted.
    expect(screen.getByText('14,2')).toBeTruthy();
    expect(screen.getByText('74%')).toBeTruthy();
  });

  test('no measurement under this version says so, rather than printing a lying zero', () => {
    // `sampleCount`/`charCount` simply absent — the shape `passport()` sends
    // for a hand-written voice, or one activated without its own analysis.
    const { sampleCount, charCount, ...unmeasured } = voice;
    render(
      React.createElement(passportScreen.VoicePassportScreen, {
        locale: 'ru',
        voice: unmeasured,
      })
    );

    expect(
      screen.getByText(copy.voiceCopy.ru.passportUnmeasured)
    ).toBeTruthy();
    expect(screen.queryByText(new RegExp(copy.voiceCopy.ru.passportSamples))).toBeNull();
    expect(screen.queryByText(/16/)).toBeNull();
  });

  test('a measured voice still prints its counts, unchanged', () => {
    render(
      React.createElement(passportScreen.VoicePassportScreen, {
        locale: 'ru',
        voice,
      })
    );

    expect(screen.getByText(/16/)).toBeTruthy();
    expect(screen.getByText(/15[\s ]?200|15,200|15200/)).toBeTruthy();
    expect(
      screen.queryByText(copy.voiceCopy.ru.passportUnmeasured)
    ).toBeNull();
  });

  test('a thin corpus is labelled, not hidden and not blocked', () => {
    render(
      React.createElement(passportScreen.VoicePassportScreen, {
        locale: 'ru',
        voice: { ...voice, confidence: 'LOW' },
      })
    );

    expect(screen.getByText(/Корпус тонкий/)).toBeTruthy();
  });

  /**
   * Примеры автора — самая сильная часть голоса по обоим ответам исследования
   * и одновременно та, о которой у человека есть готовое мнение: это его
   * собственные тексты. Поэтому они на карточке, и поэтому мнению есть куда
   * деться — убрать один или подобрать набор заново.
   */
  const withExamples = {
    ...voice,
    examples: [
      { text: 'Сел разбирать прогон и посчитал руками.' },
      { text: 'Собрал стенд за вечер и сразу об него обжёгся.' },
    ],
  };

  test('the author own posts are shown, with what they are for', () => {
    render(
      React.createElement(passportScreen.VoicePassportScreen, {
        locale: 'ru',
        voice: withExamples,
      })
    );

    expect(screen.getByText(copy.voiceCopy.ru.passportExamples)).toBeTruthy();
    expect(
      screen.getByText(copy.voiceCopy.ru.passportExamplesHint)
    ).toBeTruthy();
    withExamples.examples.forEach((one) =>
      expect(screen.getByText(one.text)).toBeTruthy()
    );
  });

  test('removing one and picking again are offered only to somebody who may', () => {
    const removed = [];
    let refreshed = 0;
    render(
      React.createElement(passportScreen.VoicePassportScreen, {
        locale: 'ru',
        voice: withExamples,
        onRemoveExample: (index) => removed.push(index),
        onRefreshExamples: () => {
          refreshed += 1;
        },
      })
    );

    const removeButtons = screen.getAllByRole('button', { name: /Убрать/ });
    expect(removeButtons).toHaveLength(2);
    removeButtons[1].click();
    screen
      .getByRole('button', { name: copy.voiceCopy.ru.passportExamplesRefresh })
      .click();

    expect(removed).toEqual([1]);
    expect(refreshed).toBe(1);
  });

  test('without the handlers the card shows the examples and changes nothing', () => {
    render(
      React.createElement(passportScreen.VoicePassportScreen, {
        locale: 'ru',
        voice: withExamples,
      })
    );

    // The hints stay: explaining a field is not changing it, and a reader
    // without the right to edit still has to understand what they are reading.
    // Every control that writes is absent — not disabled.
    for (const label of [
      copy.voiceCopy.ru.passportEdit,
      copy.voiceCopy.ru.passportExampleRemove,
      copy.voiceCopy.ru.passportExamplesRefresh,
      copy.voiceCopy.ru.passportExampleAdd,
    ]) {
      expect(
        screen.queryAllByRole('button', { name: new RegExp(label) })
      ).toHaveLength(0);
    }
    expect(screen.getByText(withExamples.examples[0].text)).toBeTruthy();
  });

  test('a voice with no examples says nothing about them', () => {
    render(
      React.createElement(passportScreen.VoicePassportScreen, {
        locale: 'ru',
        voice,
        onRemoveExample: () => {},
        onRefreshExamples: () => {},
      })
    );

    expect(screen.queryByText(copy.voiceCopy.ru.passportExamples)).toBeNull();
  });
});

describe('versions and comparison', () => {
  const versions = [
    {
      id: 'v3',
      label: 'v3',
      lifecycle: 'PUBLISHED',
      active: true,
      changedAt: '22.08.2026',
      actor: 'А. Ким',
    },
    {
      id: 'v2',
      label: 'v2',
      lifecycle: 'ARCHIVED',
      changedAt: '02.07.2026',
      actor: 'М. Соловьёва',
    },
  ];

  const comparison = {
    from: 'v2',
    to: 'v3',
    fields: [
      { field: 'WHO_SPEAKS', was: 'Пресс-служба', became: 'Служба новостей', changed: true },
      { field: 'AUDIENCE', was: 'К своим', became: 'К своим', changed: false },
    ],
  };

  test('unchanged fields are listed beside changed ones', () => {
    render(
      React.createElement(versionsScreen.VoiceVersionsScreen, {
        locale: 'ru',
        versions,
        selected: ['v2', 'v3'],
        comparison,
      })
    );

    // A table showing only differences leaves it unclear whether the other
    // fields were compared at all. The mark lives in a column of its own now:
    // stacked under the field name, «Никогда не говорим» and «БЕЗ ИЗМЕНЕНИЙ»
    // read as one phrase.
    expect(screen.getByText(copy.voiceCopy.ru.comparisonUnchanged)).toBeTruthy();
    expect(
      screen.getAllByText(copy.voiceCopy.ru.comparisonChangedMark).length
    ).toBeGreaterThan(0);
    // Named the way the card above names them, from one place, in the reader's
    // language — the server used to build these in Russian and call the same
    // five fields something else than the passport does.
    expect(screen.getByText(copy.voiceCopy.ru.passportWhoSpeaks)).toBeTruthy();
    expect(screen.getByText(copy.voiceCopy.ru.passportAudience)).toBeTruthy();
  });

  test('a line empty in both versions is named under the table, not drawn as a blank row', () => {
    render(
      React.createElement(versionsScreen.VoiceVersionsScreen, {
        locale: 'ru',
        versions,
        selected: ['v2', 'v3'],
        comparison: {
          ...comparison,
          fields: [
            ...comparison.fields.filter((one) => one.field !== 'NEVER_SAY'),
            { field: 'NEVER_SAY', was: '', became: '', changed: false },
          ],
        },
      })
    );

    // Название поля, «БЕЗ ИЗМЕНЕНИЙ» под ним и две пустые клетки справа —
    // именно это владелец прочитал как поломку, и был прав: сравнивать там
    // нечего.
    expect(
      document.querySelector('[data-voice-field="NEVER_SAY"]')
    ).toBeNull();
    expect(
      document.querySelector('[data-voice-comparison-blank]')
    ).not.toBeNull();
    expect(screen.getByText(/Не заполнено ни в одной из версий/)).toBeTruthy();
  });

  test('the comparison is by field, not by line', () => {
    const text = code('voice-versions.screen.tsx');

    expect(text).not.toMatch(/diffLines|jsdiff|createPatch/);
    expect(text).toContain('data-voice-field-changed');
  });

  test('restoring is described as creating a version, never as rewriting', () => {
    render(
      React.createElement(versionsScreen.VoiceVersionsScreen, {
        locale: 'ru',
        state: 'success',
        versions,
        selected: [],
      })
    );

    const status = screen.getByRole('status');
    // Posts point at the version that wrote them. Moving a pointer instead of
    // adding a version would be lying about what produced old text.
    expect(status.textContent).toMatch(/Возврат создаст версию v3 с полями v2/);
    expect(status.textContent).toContain('История не переписывается');
  });

  test('a member without rights still sees the history', () => {
    render(
      React.createElement(versionsScreen.VoiceVersionsScreen, {
        locale: 'ru',
        state: 'restricted',
        versions,
        canRestore: false,
      })
    );

    expect(screen.getByText('v3')).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: /Вернуть/ })
    ).toBeNull();
  });
});

describe('both languages are complete', () => {
  test('every key exists in Russian and English', () => {
    const ru = Object.keys(copy.voiceCopy.ru).sort();
    const en = Object.keys(copy.voiceCopy.en).sort();

    expect(en).toEqual(ru);
  });

  test('every scale has a caption and a unit in both languages', () => {
    for (const key of copy.SCALE_ORDER) {
      for (const locale of ['ru', 'en']) {
        expect(copy.scaleLabels[locale][key].label.length).toBeGreaterThan(3);
        expect(copy.scaleLabels[locale][key].unit.length).toBeGreaterThan(2);
      }
    }
  });

  test('the eight scales are listed in the order the design shows them', () => {
    expect([...copy.SCALE_ORDER]).toEqual([
      'sentenceLength',
      'sentenceSpread',
      'shortSentences',
      'listParagraphs',
      'questions',
      'dashCopula',
      'firstPerson',
      'nominalisation',
    ]);
  });
});
