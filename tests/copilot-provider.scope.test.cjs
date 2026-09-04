const fs = require('node:fs');
const path = require('node:path');

const repositoryRoot = path.resolve(__dirname, '..');

const read = (relative) =>
  fs.readFileSync(path.join(repositoryRoot, relative), 'utf8');

const APP_SHELL =
  'apps/frontend/src/components/new-layout/layout.component.tsx';

/**
 * Экраны, которые сами открывают помощника: только на них и монтируется
 * провайдер (`content-factory-next-fn33.48`, `content-factory-next-fn33.93`).
 * Провайдер @copilotkit/react-core@1.10.6 при монтировании безусловно шлёт
 * POST availableAgents на runtimeUrl, поэтому на общей оболочке приложения это
 * платный вызов модели на каждой загрузке страницы.
 */
const CONSUMER_SURFACES = [
  'apps/frontend/src/components/new-launch/manage.modal.tsx',
  'apps/frontend/src/components/settings/signatures.component.tsx',
  'apps/frontend/src/components/autopost/autopost.tsx',
  'apps/frontend/src/components/plugs/plug.tsx',
];

/**
 * Выбор каналов рисуется и там, где помощника нельзя позвать (вебхуки,
 * каналы), поэтому он провайдера не поднимает: его подсказки регистрируются
 * только под уже поднятым.
 */
const PICK_PLATFORMS =
  'apps/frontend/src/components/launches/helpers/pick.platform.component.tsx';

/**
 * Эти файлы пользуются помощником, но провайдер им даёт родитель: `editor.tsx`
 * рисуется только внутри окна редактора поста, `agent.input.tsx` — только
 * внутри чата агента, у которого свой <CopilotKit>.
 */
const PROVIDED_BY_PARENT = [
  'apps/frontend/src/components/new-launch/editor.tsx',
  'apps/frontend/src/components/agents/agent.input.tsx',
];

/**
 * Единственная дверь, за которой позволено писать `<CopilotKit>`.
 *
 * Провайдер решает один вопрос — не поднимать второй такой же над уже
 * поднятым, — и решение это стоит держать в одном файле. Всё остальное просит
 * `<CopilotProvider>`.
 */
const COPILOT_KIT_DOOR = 'apps/frontend/src/components/copilot/copilot.provider.tsx';

/**
 * Одно исключение, и оно старое: окно чата с агентом поднимает свой
 * `<CopilotKit>` с другим `runtimeUrl` — рантайм агента, а не общий
 * `/copilot/chat`, — поэтому общей дверью оно не обходится. Список закрыт:
 * новая обёртка сюда не дописывается, она пишется через `<CopilotProvider>`.
 */
const COPILOT_KIT_GRANDFATHERED = [
  'apps/frontend/src/components/agents/agent.chat.tsx',
];

/**
 * Текст без блочных комментариев.
 *
 * Иначе страж считает обёрткой файл, который про обёртку только рассказывает:
 * `preview.wrapper.tsx` объясняет в шапке, почему `<CopilotKit>` оттуда убран,
 * и этого объяснения хватало, чтобы проверка осталась красной. Строчные
 * комментарии не трогаем: в них попадаются адреса с `//`, а обрезать по ним
 * значило бы прятать код, стоящий на той же строке.
 */
const withoutBlockComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '');

/** Все `.ts`/`.tsx` фронтенда, один обход на все проверки ниже. */
const frontendSources = () => {
  const roots = [path.join(repositoryRoot, 'apps/frontend/src')];
  const files = [];
  while (roots.length) {
    const current = roots.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules') continue;
        roots.push(full);
      } else if (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) {
        files.push(full);
      }
    }
  }
  return files.map((full) => ({
    relative: path.relative(repositoryRoot, full).split(path.sep).join('/'),
    source: fs.readFileSync(full, 'utf8'),
  }));
};

describe('помощник монтируется только там, где им пользуются', () => {
  test('оболочка приложения не подключает CopilotKit', () => {
    const source = read(APP_SHELL);
    expect(source).not.toMatch(/@copilotkit/);
    expect(source).not.toMatch(/CopilotKit/);
  });

  test.each(CONSUMER_SURFACES)('%s монтирует провайдер сам', (relative) => {
    const source = read(relative);
    expect(source).toMatch(/<CopilotProvider>/);
  });

  test('выбор каналов не поднимает помощника, а только подсказывает уже поднятому', () => {
    const source = read(PICK_PLATFORMS);
    expect(source).toMatch(/useHasCopilotProvider\(\)/);
    expect(source).not.toMatch(/<CopilotProvider>/);
    expect(source).toMatch(/hasCopilot && \(/);
  });

  test('каждый потребитель помощника либо монтирует провайдер, либо назван исключением', () => {
    const consumerPattern =
      /useCopilot(Action|Readable|Context|MessagesContext)|CopilotTextarea|CopilotPopup|CopilotChat\b/;
    const unguarded = [];
    for (const { relative, source } of frontendSources()) {
      if (!source.includes('@copilotkit')) continue;
      if (!consumerPattern.test(source)) continue;
      if (PROVIDED_BY_PARENT.includes(relative)) continue;
      if (COPILOT_KIT_GRANDFATHERED.includes(relative)) continue;
      if (
        /<CopilotProvider>|<CopilotKit|useHasCopilotProvider\(\)/.test(source)
      )
        continue;
      unguarded.push(relative);
    }

    expect(unguarded).toEqual([]);
  });

  /**
   * Проверка выше ловила только файлы, которые помощником *пользуются*: у неё
   * в отборе стоит `consumerPattern`, а `<CopilotKit` в него не входит.
   * Поэтому обёртка без единого потребителя под ней проходила молча — ровно
   * так `preview.wrapper.tsx` держал провайдер вокруг `/p/[id]` и модалки
   * расширения, и каждое открытие ссылки-предпросмотра стоило запроса
   * `availableAgents`. Обёртка — это и есть расход; считаем обёртки, а не
   * потребителей.
   */
  test('никто, кроме одной двери, не пишет <CopilotKit> сам', () => {
    const mounts = frontendSources()
      .filter(({ source }) => /<CopilotKit[\s>]/.test(withoutBlockComments(source)))
      .map(({ relative }) => relative)
      .filter(
        (relative) =>
          relative !== COPILOT_KIT_DOOR &&
          !COPILOT_KIT_GRANDFATHERED.includes(relative)
      )
      .sort();

    expect(mounts).toEqual([]);
  });

  test('дверь и её исключение существуют, иначе проверка выше пуста по ошибке', () => {
    for (const relative of [COPILOT_KIT_DOOR, ...COPILOT_KIT_GRANDFATHERED]) {
      expect(withoutBlockComments(read(relative))).toMatch(/<CopilotKit[\s>]/);
    }
  });
});
