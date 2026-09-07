'use strict';

/**
 * Окно поста даёт только полезное (`content-factory-next-fn33.28.2`).
 *
 * Решения владельца 04.09.2026 (вечер) после живого прогона: окно — это ядро
 * Postiz плюс этап; панель «Проверенный контекст» и лента «Применённый
 * аватар» уходят с первого экрана, а вместо них одна строка происхождения и
 * только у поста, который контекст несёт; кнопка «Исследовать текущий
 * черновик» уходит из окна совсем — платное исследование начинается в разделе
 * «Контент», а дверь на сервере остаётся нетронутой; ряд тег/повтор/этап
 * собран из стандартных примитивов; оболочка — стандартный диалог, без своих
 * чисел.
 *
 * Четвёртое решение того вечера — «пост с подтверждениями ждёт явного решения
 * человека» — отменено 07.09.2026 (`content-factory-next-m2eg.17`): «Выключить
 * совсем, без галочек и без кнопки „Проверил“». Здесь проверяется, что ворот
 * больше нет, а дверь на сервере цела.
 *
 * Проверяется здесь то, что переживёт правку: поведение расчёта причины,
 * разметка строки происхождения и отсутствие исследовательского потока в
 * файлах окна. Числа геометрии держит `tests/design.guard.test.cjs`.
 */

const fs = require('node:fs');
const path = require('node:path');

const repositoryRoot = path.resolve(__dirname, '..');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const FILES = {
  manage: 'apps/frontend/src/components/new-launch/manage.modal.tsx',
  editor: 'apps/frontend/src/components/new-launch/editor.tsx',
  reason: 'apps/frontend/src/components/new-launch/compose-block-reason.tsx',
  line: 'apps/frontend/src/components/new-launch/provenance.line.tsx',
  tags: 'apps/frontend/src/components/launches/tags.component.tsx',
  repeat: 'apps/frontend/src/components/launches/repeat.component.tsx',
  stage: 'apps/frontend/src/components/launches/editorial-stage.select.tsx',
  quality: 'apps/frontend/src/components/new-launch/draft-quality.line.tsx',
};

const read = (relative) =>
  fs.readFileSync(path.join(repositoryRoot, relative), 'utf8');

/** Source with comments blanked, so a file may explain itself freely. */
const code = (relative) =>
  read(relative)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1 ');

describe('the post window gives only what is useful', () => {
  /* ---------------------------------------------------------------------
   * 1. One line of provenance, and only when the post carries context.
   * ------------------------------------------------------------------ */

  test('the origin line stands in the window, guarded by the context itself', () => {
    const manage = code(FILES.manage);

    expect(manage).toContain('<ProvenanceLine');
    const mount = manage.indexOf('<ProvenanceLine');
    expect(
      manage.slice(Math.max(0, mount - 200), mount)
    ).toMatch(/contentIntelligenceProvenance\s*&&/);

    // Ни панели контекста, ни ленты аватара на первом экране больше нет.
    expect(manage).not.toContain('VoiceRibbonContainer');
    expect(manage).not.toContain('AppliedVoiceLine');
    expect(manage).not.toContain('compatibility_sources');
  });

  /**
   * Контейнер ленты голоса удалён, а не оставлен «на всякий случай».
   *
   * 04.09.2026 окно перестало его звать, и с тех пор он не жил нигде: файл на
   * пятьсот строк, свой маршрут и своя платная правка предложения — и ни
   * одного места, откуда всё это поднималось бы. 07.09.2026 владелец решил
   * судьбу вопроса «похоже ли это на вас»: он стал отрезком строки качества
   * под редактором, а платная правка снята совсем.
   *
   * Ленточка сама (`voice-ribbon.tsx`) осталась: её берёт `AppliedVoiceLine` в
   * генераторе, и там она отвечает на настоящий вопрос.
   */
  test('the dead strip container is gone, and its paid repair with it', () => {
    for (const dead of [
      'apps/frontend/src/components/brand-voice/voice-ribbon.container.tsx',
      'apps/frontend/src/components/brand-voice/voice-spots.tsx',
    ]) {
      expect(fs.existsSync(path.join(repositoryRoot, dead))).toBe(false);
    }

    // Ни один файл продукта не зовёт платную правку предложения.
    const line = code(FILES.quality);
    expect(line).not.toContain('text-check/repair');
    expect(code(FILES.manage)).not.toContain('text-check/repair');

    // А презентационная ленточка на месте: её берёт генератор.
    expect(
      fs.existsSync(
        path.join(
          repositoryRoot,
          'apps/frontend/src/components/brand-voice/voice-ribbon.tsx'
        )
      )
    ).toBe(true);
  });

  /**
   * Строка качества стоит под редактором, а не сбоку от него.
   *
   * Решение владельца 07.09.2026 (`content-factory-next-fn33.28.4`): одна
   * строка под текстом в трёх местах. Здесь судится место и то, что окно её
   * не ждёт: ни одна кнопка низа не смотрит на её ответ.
   */
  test('the quality line stands under the editor and gates nothing', () => {
    const manage = code(FILES.manage);

    expect(manage).toContain('<DraftQualityLine');
    const editorMount = manage.indexOf('<EditorWrapper');
    const lineMount = manage.indexOf('<DraftQualityLine');
    expect(editorMount).toBeGreaterThan(-1);
    expect(lineMount).toBeGreaterThan(editorMount);

    // Ни `publishDisabled`, ни `blockReason` о ней не знают.
    const gate = manage.slice(
      manage.indexOf('const publishDisabled'),
      manage.indexOf('const schedule')
    );
    expect(gate).not.toContain('DraftQualityLine');
    expect(gate).not.toContain('quality');

    // Двери бесплатные и считают без модели: платного отсюда не зовётся.
    const line = code(FILES.quality);
    expect(line).toContain('slopCheck');
    expect(line).toContain('/text-check');
    expect(line).not.toContain('repair');
  });

  test('the line counts the confirmations behind this post', () => {
    const manage = code(FILES.manage);
    // Считаются подтверждения, вошедшие в коробки поста, а не всё, что выдал
    // контекст: контекст мог выдать двадцать, а в текст вошли три.
    expect(manage).toMatch(/usedCitationIds/);
    expect(manage).toMatch(/confirmationCount/);
    // Взятое из поиска подтверждением не считается (рецензия ec48, P1-1):
    // о находках говорит своя записка, а строка «Собрано из N подтверждений»
    // не должна выдавать непроверенное за проверенное.
    const counter = manage.slice(
      manage.indexOf('const confirmationCount'),
      manage.indexOf('return used.size;')
    );
    expect(counter).toMatch(/provenance === 'SEARCH'/);
    expect(counter).toMatch(/if \(!searched\.has\(citationId\)\) used\.add\(citationId\)/);

    const line = code(FILES.line);
    expect(line).toMatch(/assembledFrom\(/);
    // Идентификаторы и даты — под «Подробнее», и раскрытие нативное.
    expect(line).toContain('<details');
    expect(line).toMatch(/cf-label-sm|cf-caption/);
  });

  /* ---------------------------------------------------------------------
   * 2. The research flow is gone from the window; the door is untouched.
   * ------------------------------------------------------------------ */

  test('the window never calls research and never names it', () => {
    for (const file of [FILES.editor, FILES.manage]) {
      const source = code(file);
      expect(source).not.toMatch(/\/copilot\/research/);
      expect(source).not.toMatch(/research_current_draft/);
      expect(source).not.toMatch(/researchWeb/);
      expect(source).not.toMatch(/researchCurrentDraft/);
    }
  });

  test('the server door itself is left alone', () => {
    // Дверь остаётся: её убирает не эта задача, и раздел «Контент» ею живёт.
    const controller = read('apps/backend/src/api/routes/copilot.controller.ts');
    expect(controller).toMatch(/research/);
  });

  /* ---------------------------------------------------------------------
   * 3. Ворота «Проверил» сняты (`content-factory-next-m2eg.17`).
   *
   * Решение владельца 07.09.2026, дословно: «Выключить совсем, без галочек и
   * без кнопки „Проверил“». Кнопка ничего не проверяла — она записывала, что
   * человек сказал «проверил», — и стояла перед каждым постом, написанным
   * продуктом. Дверь на сервере осталась; окно её больше не зовёт.
   * ------------------------------------------------------------------ */

  test('a post assembled from evidence is no longer held back', () => {
    const { composeBlockReason } = loadTypeScriptModule(FILES.reason);
    const carrying = {
      locked: false,
      contentIntelligenceLoadState: 'ready',
      contentIntelligenceFailure: null,
      provenanceErrorCode: null,
    };

    expect(composeBlockReason(carrying)).toBe('none');

    // Причины, которые остались, отвечают ровно как отвечали: снятие ворот не
    // открывает окно, у которого контекст ещё грузится или отказал.
    expect(
      composeBlockReason({ ...carrying, contentIntelligenceLoadState: 'loading' })
    ).toBe('context-loading');
    expect(
      composeBlockReason({
        ...carrying,
        contentIntelligenceLoadState: 'error',
        contentIntelligenceFailure: 'CONTEXT_UNAVAILABLE',
      })
    ).toBe('context-error');
  });

  test('the window neither calls the review door nor keeps a button for it', () => {
    const manage = code(FILES.manage);

    expect(manage).not.toMatch(/context-review/);
    expect(manage).not.toMatch(/contentContextReviewedAt/);
    expect(manage).not.toMatch(/contextReviewedAt/);
    expect(manage).not.toMatch(/context_review_confirm/);

    // И ни одного условия, закрывавшего планирование и «опубликовать сейчас».
    expect(
      manage.match(/!!contentIntelligenceProvenance && !contextReviewedAt/g)
    ).toBeNull();
  });

  test('the server door itself stays where it is', () => {
    // Снимать дверь и колонки — отдельная работа: след уже принятых решений
    // не переписывается задним числом.
    const controller = read('apps/backend/src/api/routes/posts.controller.ts');
    expect(controller).toMatch(/context-review/);
  });

  /* ---------------------------------------------------------------------
   * 4. One row, one geometry, from the primitives that already exist.
   * ------------------------------------------------------------------ */

  test('tag, repeat and stage are the same control, not three', () => {
    // `content-factory-next-fn33.28.12`: этап досюда доехал нативным `Select`.
    // Рамка, высота, радиус и фон у него и правда совпадали с соседями —
    // расходилось то, что рисует не продукт: `appearance: auto`, браузерная
    // стрелка другой формы и толщины и текст 14px против 13px. Ряд из трёх
    // контролов одного назначения не может быть наполовину системным, поэтому
    // теперь все три — один примитив.
    for (const file of [FILES.tags, FILES.repeat, FILES.stage]) {
      const source = code(file);
      expect(source).toContain('MenuButton');
      expect(source).toContain('choice/choice.menu');
      // Своей высоты у ряда больше нет: её держит примитив.
      expect(source).not.toMatch(/h-\[44px\]/);
      // Белый текст на цвете, который выбрал человек, не поддаётся расчёту
      // контраста; цвет тега стал точкой рядом с именем.
      expect(source).not.toMatch(/text-\[#fff\]/);
    }
    // И ни одного нативного выбора в ряду не осталось.
    expect(code(FILES.stage)).not.toContain('<Select');
    expect(code(FILES.stage)).not.toContain('<option');
  });

  /* ---------------------------------------------------------------------
   * 5. The shell is the standard dialog, with no numbers of its own.
   * ------------------------------------------------------------------ */

  test('the shell borrows the dialog geometry instead of inventing it', () => {
    const manage = code(FILES.manage);
    expect(manage).not.toMatch(/rounded-\[20px\]/);
    expect(manage).toMatch(/rounded-s-\[12px\]/);
    expect(manage).toMatch(/cf-heading-md/);
    // Заголовок окна набран токеном, а не двадцатым кеглем руками.
    expect(manage).not.toMatch(/text-\[20px\] font-\[600\]/);
  });
});

/**
 * `content-factory-next-fn33.28.10`: сырое значение перечисления с первого
 * экрана окна.
 *
 * В шапке стоял значок `creationMethod`, печатавший «WEB» как есть, с
 * английской подсказкой «Created via WEB». Человеку, открывшему собственное
 * окно поста, это слово не сообщает ничего: он и так пишет пост в браузере.
 */
describe('the window header prints no enum value at a person', () => {
  test('the creation-method badge is gone from the compose window', () => {
    const manage = code(FILES.manage);

    expect(manage).not.toContain('CreationMethodBadge');
    expect(manage).not.toContain('creationMethod');
  });

  test('the badge itself is untouched, because elsewhere it says something true', () => {
    // В календаре и предпросмотре значок различает посты из API, MCP и
    // автопостинга — это настоящий факт о записи. Задача была снять его
    // оттуда, где он всегда показывал одно и то же, а не удалить из продукта.
    const badge =
      'apps/frontend/src/components/launches/creation.method.badge.tsx';
    expect(fs.existsSync(path.join(repositoryRoot, badge))).toBe(true);

    const consumers = [
      'apps/frontend/src/components/launches/calendar.tsx',
      'apps/frontend/src/components/preview/post.preview.tsx',
    ];
    for (const consumer of consumers) {
      expect(read(consumer)).toContain('CreationMethodBadge');
    }
  });
});
