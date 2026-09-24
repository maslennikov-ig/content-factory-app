'use strict';

/**
 * Экранирование тела при публикации: что уходит получателю разметки, а что —
 * получателю простого текста.
 *
 * `content-factory-next-97dq.11`, находка рецензента девятой волны.
 * `stripHtmlValidation` для типа `html` сначала выбрасывал теги, а потом снимал
 * экранирование — то есть возвращал разметку ПОСЛЕ проверки. Тело, где
 * написано `&lt;script&gt;`, уходило в HTML-кампанию Listmonk
 * (`listmonk.provider.ts`) и в содержимое записи WordPress
 * (`wordpress.provider.ts`) живым тегом. Источник — текст области, но с
 * галочкой «это чужой текст» содержимое приходит извне.
 *
 * Здесь закреплены оба правила, потому что они противоположны и их легко
 * перепутать:
 *
 *  - получателю РАЗМЕТКИ экранирование не снимают вовсе: `&lt;` и есть
 *    правильный способ написать «меньше» в HTML;
 *  - получателю ТЕКСТА снимают — но после `striptags` и ровно один раз, иначе
 *    либо пропадает написанное человеком, либо `&amp;lt;` превращается в знак.
 */

const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const { stripHtmlValidation } = loadTypeScriptModule(
  'libraries/helpers/src/utils/strip.html.validation.ts'
);
const { htmlToPlainText } = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/content-intelligence/brand-voice/html-text.ts'
);

// Тела, как их хранит редактор: текст экранирован, разметка — теги.
const SCRIPT = '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>';
const COMPARISON = '<p>a &lt; b &amp;&amp; c</p>';
const DOUBLE_ESCAPED = '<p>&amp;lt;</p>';
const BOLD = '<p><strong>жирный</strong> и &lt;b&gt;буквами&lt;/b&gt;</p>';

/** Ровно тот вызов, который делает публикация (`post.activity.ts`). */
const publish = (type, content) =>
  stripHtmlValidation(
    type,
    content,
    true,
    false,
    !/<\/?[a-z][\s\S]*>/i.test(content),
    undefined
  );

/** Теги, которые получателю разметки разрешены. Всё прочее — не разметка. */
const ALLOWED = /<\/?(?:ul|li|h1|h2|h3|p|strong|u|a)(?:\s[^>]*)?>/gi;

describe('получателю разметки экранирование не снимается', () => {
  test.each([
    ['скрипт в теле', SCRIPT],
    ['сравнение', COMPARISON],
    ['написанное буквами `&lt;`', DOUBLE_ESCAPED],
    ['выделение и теги буквами', BOLD],
  ])('%s: живого тега в сообщении нет', (_name, content) => {
    const message = publish('html', content);

    // Единственная разметка в сообщении — разрешённые теги. Всё, что осталось
    // после их удаления, не должно содержать ни одной угловой скобки: значит,
    // текст ушёл текстом.
    expect(message.replace(ALLOWED, '')).not.toMatch(/[<>]/);
    expect(message).not.toMatch(/<script/i);
  });

  test('скрипт остаётся написанным, а не работающим', () => {
    expect(publish('html', SCRIPT)).toBe(
      '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>'
    );
  });

  test('написанное человеком не пропадает и не становится разметкой', () => {
    expect(publish('html', COMPARISON)).toBe('<p>a &lt; b &amp;&amp; c</p>');
  });

  test('`&amp;lt;` остаётся тем, что человек написал буквами', () => {
    expect(publish('html', DOUBLE_ESCAPED)).toBe('<p>&amp;lt;</p>');
  });

  test('выделение доезжает до получателя: Telegram делает из него `<b>`', () => {
    const message = publish('html', BOLD);

    expect(message).toContain('<strong>жирный</strong>');
    // Вторая половина канона волны — в `telegram.provider.ts`: `<strong>`
    // становится `<b>`. Здесь проверяется вход в неё.
    expect(
      message.replace(/<strong>/g, '<b>').replace(/<\/strong>/g, '</b>')
    ).toContain('<b>жирный</b>');
    // А `<b>`, написанный человеком буквами, разметкой не становится.
    expect(message).toContain('&lt;b&gt;буквами&lt;/b&gt;');
  });
});

describe('получателю простого текста экранирование снимается один раз', () => {
  test.each(['none', 'normal'])(
    '%s: написанный буквами тег остаётся текстом целиком',
    (type) => {
      // Ни один знак не пропал: `striptags` работает ДО снятия экранирования,
      // иначе от написанного осталось бы только «alert(1)».
      expect(publish(type, SCRIPT)).toContain('<script>alert(1)</script>');
    }
  );

  test.each(['none', 'normal'])(
    '%s: сравнение читается как написано',
    (type) => {
      expect(publish(type, COMPARISON)).toContain('a < b && c');
    }
  );

  test.each(['none', 'normal'])(
    '%s: `&amp;lt;` не разэкранируется дважды',
    (type) => {
      expect(publish(type, DOUBLE_ESCAPED)).toContain('&lt;');
      expect(publish(type, DOUBLE_ESCAPED)).not.toMatch(/(^|[^;])</);
    }
  );

  test('`normal` по-прежнему рисует выделение начертанием', () => {
    expect(publish('normal', '<p><strong>bold</strong></p>')).toBe('𝗯𝗼𝗹𝗱');
    // Кириллицы в таблице начертаний нет и не было: слово остаётся словом, а
    // написанный буквами тег рядом — буквами.
    expect(publish('normal', BOLD)).toBe('жирный и <b>буквами</b>');
  });

  test('сущность внутри выделения не превращается в обломок начертания', () => {
    // `convertToAscii` переводил в начертание каждый знак подряд, поэтому
    // `&lt;` внутри `<strong>` становился `&𝗹𝘁;`, и внизу помощника стояли
    // четыре строки, узнающие такие обломки. Сущность — один знак, а не буквы.
    const message = publish(
      'normal',
      '<p><strong>a &lt; b &amp; c</strong></p>'
    );

    expect(message).toBe('𝗮 < 𝗯 & 𝗰');
  });

  /*
    `content-factory-next-97dq.17`: получатели markdown (dev.to, Hashnode,
    Medium, Whop) рендерят сущности сами, а голый `<b>` исполняют как HTML.
    Экранирование им оставляется, как получателю разметки; Discord снимает
    его сам, в провайдере.
  */
  test('markdown: написанный буквами тег уходит сущностями, а не тегом', () => {
    expect(
      publish('markdown', '<p>&lt;b&gt;x&lt;/b&gt; a &amp;lt; b</p>')
    ).toBe('&lt;b&gt;x&lt;/b&gt; a &amp;lt; b\n');
    expect(publish('markdown', SCRIPT)).not.toMatch(/<script/i);
    // Строка с `>` в начале не становится цитатой.
    expect(publish('markdown', '<p>&gt; не цитата</p>')).toBe(
      '&gt; не цитата\n'
    );
  });

  test('`markdown` по-прежнему отдаёт пару звёздочек', () => {
    expect(publish('markdown', '<p><strong>bold</strong></p>')).toContain(
      '**bold**'
    );
  });
});

/**
 * Обычные тела: выход обязан совпасть с выпущенным до знака.
 *
 * Разбор корректности второго выпуска, P1-1: `97dq.11` перестал снимать
 * сущности получателю разметки — и вместе с `&lt;` перестал снимать `&nbsp;`,
 * который в тело кладёт не человек, а сам `serialize(parseFragment())` из
 * каждого неразрывного пробела. В Telegram это шесть знаков вместо пробела или
 * отказ отправки.
 *
 * Поэтому корпус, и поэтому именно так: каждая клетка закреплена тем, что
 * печатал ВЫПУЩЕННЫЙ помощник (снято прогоном обеих версий бок о бок), кроме
 * семи названных ниже клеток, ради которых волна и писалась. Новое расхождение
 * на обычном теле — красный тест, а не заметка в отчёте.
 */
const NBSP = ' ';

const BODIES = {
  nbspLiteral: `<p>5${NBSP}000 рублей</p>`,
  nbspEntity: '<p>5&nbsp;000 рублей</p>',
  quotes: '<p>Он сказал: «да» и "нет" и don\'t</p>',
  emoji: '<p>Готово 🎉 и 👍 — поехали</p>',
  linkQuery: '<p><a href="https://x.ru/?a=1&amp;b=2">ссылка</a></p>',
  strong: '<p><strong>жирный</strong> текст</p>',
  underline: '<p><u>подчёркнутый</u> текст</p>',
  mention:
    '<p>Привет <span data-mention-id="42" data-mention-label="Ivan">Ivan</span></p>',
  list: '<ul><li>раз</li><li>два</li></ul>',
  headings: '<h1>Заголовок</h1><p>тело</p>',
  paragraphs: '<p>Первый</p><p>Второй</p>',
  ampersand: '<p>Rock &amp; Roll</p>',
  dash: '<p>тире — и дефис -</p>',
  plain: '<p>Обычное тело без ничего</p>',
  escapedTag: '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>',
  escapedCompare: '<p>a &lt; b &amp;&amp; c</p>',
  doubleEscaped: '<p>&amp;lt;</p>',
};

/** Что печатал помощник выпуска `2542f433e993` на тех же телах. */
const RELEASED = {
  none: {
    nbspLiteral: '5 000 рублей',
    nbspEntity: '5 000 рублей',
    quotes: 'Он сказал: «да» и "нет" и don\'t',
    emoji: 'Готово 🎉 и 👍 — поехали',
    linkQuery: 'ссылка',
    strong: 'жирный текст',
    underline: 'подчёркнутый текст',
    mention: 'Привет Ivan',
    list: 'раздва',
    headings: 'Заголовоктело',
    paragraphs: 'ПервыйВторой',
    ampersand: 'Rock & Roll',
    dash: 'тире — и дефис -',
    plain: 'Обычное тело без ничего',
    escapedTag: '<script>alert(1)</script>',
    escapedCompare: 'a < b && c',
    doubleEscaped: '&lt;',
  },
  normal: {
    nbspLiteral: '5 000 рублей',
    nbspEntity: '5 000 рублей',
    quotes: 'Он сказал: «да» и "нет" и don\'t',
    emoji: 'Готово 🎉 и 👍 — поехали',
    linkQuery: 'https://x.ru/?a=1&b=2',
    strong: 'жирный текст',
    underline: 'подчёркнутый текст',
    mention: 'Привет @Ivan',
    list: '<ul><li>раз</li><li>два</li></ul>',
    headings: 'Заголовок\nтело',
    paragraphs: 'Первый\nВторой',
    ampersand: 'Rock & Roll',
    dash: 'тире — и дефис -',
    plain: 'Обычное тело без ничего',
    escapedTag: '<script>alert(1)</script>',
    escapedCompare: 'a < b && c',
    doubleEscaped: '<',
  },
  markdown: {
    nbspLiteral: '5 000 рублей\n',
    nbspEntity: '5 000 рублей\n',
    quotes: 'Он сказал: «да» и "нет" и don\'t\n',
    emoji: 'Готово 🎉 и 👍 — поехали\n',
    linkQuery: '[ссылка](https://x.ru/?a=1&b=2)\n',
    strong: '**жирный** текст\n',
    underline: '__подчёркнутый__ текст\n',
    mention: 'Привет @Ivan\n',
    list: '- раз- два',
    headings: '# Заголовок\nтело\n',
    paragraphs: 'Первый\nВторой\n',
    ampersand: 'Rock & Roll\n',
    dash: 'тире — и дефис -\n',
    plain: 'Обычное тело без ничего\n',
    escapedTag: '<script>alert(1)</script>\n',
    escapedCompare: 'a < b && c\n',
    doubleEscaped: '<\n',
  },
  html: {
    nbspLiteral: '<p>5 000 рублей</p>',
    nbspEntity: '<p>5 000 рублей</p>',
    quotes: '<p>Он сказал: «да» и "нет" и don\'t</p>',
    emoji: '<p>Готово 🎉 и 👍 — поехали</p>',
    linkQuery: '<p><a href="https://x.ru/?a=1&b=2">ссылка</a></p>',
    strong: '<p><strong>жирный</strong> текст</p>',
    underline: '<p><u>подчёркнутый</u> текст</p>',
    mention: '<p>Привет @Ivan</p>',
    list: '<ul><li>раз</li><li>два</li></ul>',
    headings: '<h1>Заголовок</h1><p>тело</p>',
    paragraphs: '<p>Первый</p><p>Второй</p>',
    ampersand: '<p>Rock & Roll</p>',
    dash: '<p>тире — и дефис -</p>',
    plain: '<p>Обычное тело без ничего</p>',
    escapedTag: '<p><script>alert(1)</script></p>',
    escapedCompare: '<p>a < b && c</p>',
    doubleEscaped: '<p>&lt;</p>',
  },
};

/**
 * Названные клетки, и только они. Слева — что печатал выпуск, справа — что решено
 * печатать: экранированное остаётся экранированным получателю разметки, а
 * `&amp;lt;` перестаёт разэкранироваться дважды получателю текста.
 */
const INTENDED = {
  // `<p><script>alert(1)</script></p>` — живой тег в письме и в записи.
  'html/escapedTag': '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>',
  // `<p>a < b && c</p>` — начало тега в письме, отказ разбора в Telegram.
  'html/escapedCompare': '<p>a &lt; b &amp;&amp; c</p>',
  // `<p>&lt;</p>` — написанное буквами становилось знаком.
  'html/doubleEscaped': '<p>&amp;lt;</p>',
  // `<p>Rock & Roll</p>` — голый `&`, который Telegram обязан получить
  // экранированным, а письмо и запись прочитают как «&».
  'html/ampersand': '<p>Rock &amp; Roll</p>',
  // То же в значении атрибута: `?a=1&b=2` — верное написание ссылки в HTML
  // это `&amp;`, и браузер вернёт из него `&`.
  'html/linkQuery': '<p><a href="https://x.ru/?a=1&amp;b=2">ссылка</a></p>',
  // `<` вместо написанных букв `&lt;` — двойное разэкранирование.
  'normal/doubleEscaped': '&lt;',
  // Получателю markdown экранирование оставляется (`97dq.17`): dev.to и
  // Hashnode исполняют голый `<script>`/`<b>`, а сущность печатают знаком.
  'markdown/doubleEscaped': '&amp;lt;\n',
  'markdown/escapedTag': '&lt;script&gt;alert(1)&lt;/script&gt;\n',
  'markdown/escapedCompare': 'a &lt; b &amp;&amp; c\n',
  'markdown/ampersand': 'Rock &amp; Roll\n',
  'markdown/linkQuery': '[ссылка](https://x.ru/?a=1&amp;b=2)\n',
};

describe('на обычных телах выход совпадает с выпущенным', () => {
  const mention = (id, name) => `@${name}`;

  for (const type of ['none', 'normal', 'markdown', 'html']) {
    test.each(Object.keys(BODIES))(`${type}: %s`, (name) => {
      const content = BODIES[name];
      const expected =
        INTENDED[`${type}/${name}`] !== undefined
          ? INTENDED[`${type}/${name}`]
          : RELEASED[type][name];

      expect(
        stripHtmlValidation(
          type,
          content,
          true,
          false,
          !/<\/?[a-z][\s\S]*>/i.test(content),
          mention
        )
      ).toBe(expected);
    });
  }

  test('неразрывный пробел доезжает пробелом, а не шестью знаками', () => {
    // Telegram из именованных сущностей понимает только `&lt;`, `&gt;`,
    // `&amp;` и `&quot;`; `&nbsp;` он напечатал бы буквами или отказался бы
    // разбирать сообщение целиком. В тело его кладёт parse5, а не человек.
    const message = publish('html', BODIES.nbspLiteral);

    expect(message).not.toContain('&nbsp;');
    expect(message).toBe('<p>5 000 рублей</p>');
    expect(message.codePointAt(4)).toBe(0x20);
  });
});

describe('текст для мер голоса разэкранируется один раз', () => {
  test('`&amp;lt;` остаётся написанным словом', () => {
    expect(htmlToPlainText('<p>&amp;lt;</p>')).toBe('&lt;');
  });

  test('обычные сущности читаются как знаки', () => {
    expect(htmlToPlainText('<p>a &lt; b &amp;&amp; c</p>')).toBe('a < b && c');
  });

  test('абзацы остаются границами абзацев', () => {
    expect(htmlToPlainText('<p>Первая.</p><p>Вторая.</p>')).toBe(
      'Первая.\n\nВторая.'
    );
  });
});
