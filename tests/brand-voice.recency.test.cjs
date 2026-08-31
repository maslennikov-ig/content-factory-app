'use strict';

/**
 * Описание манеры идёт по свежим постам, отпечаток — по всему корпусу.
 *
 * ## Зачем этот страж
 *
 * Решение владельца 30.08.2026: «у человека меняется стиль, поэтому всегда
 * нужно брать более новые, какой бы объём он ни скидывал». До него свежесть
 * была свойством одних цитат, а числа профиля считались по всему корпусу.
 *
 * Замер на настоящем корпусе владельца — 153 поста, окно 40, новейшие 26 %
 * канала — показывает, что разница не косметическая: эмодзи 6 → 3 на тысячу
 * знаков, ссылки 33 % → 53 % постов, канцелярские существительные 10 % → 5,6 %.
 * То есть описание по всему корпусу рассказывало о манере, которую автор уже
 * оставил, и он это в описании узнал.
 *
 * ## Почему раздел проходит именно здесь
 *
 * Та же линия, что в §5.4 спецификации. ОПИСЫВАЮЩЕЕ отвечает на вопрос «как он
 * пишет сейчас», и там весь материал вредит. СУДЯЩЕЕ отвечает на вопрос «тот же
 * ли это человек», и там нужен весь материал, какой есть. Страж держит обе
 * половины сразу: сдвинуть одну, не заметив другую, — ровно та бесшумная
 * ошибка, ради которой раздел и записан.
 *
 * Ни одного вызова модели.
 */

const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');

const base =
  'libraries/nestjs-libraries/src/content-intelligence/brand-voice';

const analyzer = loadTypeScriptModule(`${base}/analyzer.ts`);
const examples = loadTypeScriptModule(`${base}/voice-examples.ts`);

const { RECENT_WINDOW, mostRecentSamples } = examples;

/**
 * Две манеры, различимые числом, а не на глаз.
 *
 * Старая — с эмодзи в каждой строке. Новая — без единого. Мерка, взявшая весь
 * корпус, покажет их смесь; мерка, взявшая окно, покажет только новую.
 */
const oldManner = (index) => `
🚀 Разбор недели номер ${index} — почему план опять поехал вправо 🔥

💡 Смотрите сами: поставщик сорвал сроки, а мы узнали об этом в пятницу.
🙌 Такое лечится только контрольной точкой в середине недели.

✅ Поставили точку на среду. ✅ Проверили остатки. ✅ Линию запустили в четверг.
`;

const newManner = (index) => `
Поставщика поменяли — старый срывал сроки третий месяц.

Новый везёт из Челябинска, доставка на два дня дольше. Зато по графику.

Отгрузка ${index} прошла по факту. Смена отработала ровно. Мы её приняли без лишних слов.

Сроки сдвинулись на два дня. Причина — поставка. Мастер предупредил заранее, и это правильно.
`;

/**
 * Корпус, у которого порядок во времени есть.
 *
 * `externalRef` — id сообщения выгрузки Telegram, и это единственное, что
 * упорядочивает корпус во времени. Старые посты получают меньшие номера.
 */
const sampleAt = (index, text) => ({
  code: `smp-${String(index).padStart(3, '0')}`,
  text,
  language: 'ru',
  contentHash: `hash-${String(index).padStart(3, '0')}`,
  externalRef: String(1000 + index),
});

/** Столько старых, чтобы окно их заведомо не вместило. */
const OLD_COUNT = RECENT_WINDOW * 2;
const NEW_COUNT = RECENT_WINDOW;

const corpus = [
  ...Array.from({ length: OLD_COUNT }, (_, i) => sampleAt(i, oldManner(i))),
  ...Array.from({ length: NEW_COUNT }, (_, i) =>
    sampleAt(OLD_COUNT + i, newManner(i))
  ),
];

const emojiOf = (result) => result.postHabits?.emoji?.perThousandChars ?? null;

describe('свежесть: описание берёт нынешнюю манеру, а не всю историю', () => {
  it('эмодзи в описании — из свежих постов, а не смесь двух манер', () => {
    const measured = analyzer.analyzeBrandVoice(corpus);

    // Половина корпуса написана с эмодзи в каждой строке, свежая половина — без
    // единого. Описание по всему корпусу дало бы что-то посередине.
    expect(emojiOf(measured)).toBe(0);
  });

  it('без свежести то же самое описание получилось бы другим', () => {
    /**
     * Тот же анализатор на корпусе БЕЗ порядка во времени: правило честно
     * отказывается сужать и берёт всё. Число обязано отличаться — иначе первый
     * случай проходил бы и с выключенной свежестью, то есть не сторожил бы её.
     */
    const unordered = corpus.map((one) => ({ ...one, externalRef: null }));
    const measured = analyzer.analyzeBrandVoice(unordered);

    expect(emojiOf(measured)).toBeGreaterThan(0);
  });

  it('отпечаток строится по всему обучающему корпусу, а не по окну', () => {
    /**
     * Судящая половина не сужается. Отпечаток отвечает «тот же ли это человек»,
     * и материал ему нужен весь: окно в сорок постов сделало бы мерку слабее
     * ровно там, где она и так слаба.
     */
    const measured = analyzer.analyzeBrandVoice(corpus);
    const split = analyzer.splitCorpus(corpus);
    const trainCount = corpus.filter(
      (one) => split[one.code] === 'TRAIN'
    ).length;

    expect(trainCount).toBeGreaterThan(RECENT_WINDOW);
    expect(measured.voicePrint.ngrams).not.toBeNull();
    // Отпечаток видел больше текстов, чем помещается в окно.
    expect(measured.sampleCount).toBe(trainCount);
    expect(measured.sampleCount).toBeGreaterThan(RECENT_WINDOW);
  });

  it('корпус без порядка во времени остаётся целым, а не сужается наугад', () => {
    const unordered = corpus.map((one) => ({ ...one, externalRef: null }));

    expect(mostRecentSamples(unordered, RECENT_WINDOW)).toHaveLength(
      unordered.length
    );
  });

  it('один пост без порядка выключает окно целиком, а не отправляется в конец', () => {
    /**
     * Честное чтение, а не строгое: один пост без id — это один пост
     * неизвестного возраста, и места ему нет ни среди свежих, ни среди старых.
     * Правило, тихо считающее такой пост самым старым, сузило бы выборку на
     * основании, которого назвать не может.
     */
    const mixed = corpus.map((one, index) =>
      index === 0 ? { ...one, externalRef: null } : one
    );

    expect(mostRecentSamples(mixed, RECENT_WINDOW)).toHaveLength(mixed.length);
  });

  it('корпус короче окна — сам себе окно', () => {
    const short = corpus.slice(-3);

    expect(mostRecentSamples(short, RECENT_WINDOW)).toHaveLength(short.length);
  });

  it('окно берёт новейшие по id сообщения, а не первые попавшиеся', () => {
    const picked = mostRecentSamples(corpus, RECENT_WINDOW);
    const ids = picked.map((one) => Number(one.externalRef));
    const everything = corpus.map((one) => Number(one.externalRef));
    const cutoff = [...everything].sort((a, b) => a - b)[
      everything.length - RECENT_WINDOW
    ];

    expect(picked).toHaveLength(RECENT_WINDOW);
    expect(Math.min(...ids)).toBe(cutoff);
  });
});
