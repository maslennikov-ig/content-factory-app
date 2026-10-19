'use strict';

const FACT = { factKey: 'f1', statement: 'Команда сократила созвоны на час.', status: 'confirmed', selected: true, sourceUrl: 'https://example.org/meeting-study' };
const OTHER = { factKey: 'f2', statement: 'Непроверенное предположение.', status: 'unverified', selected: false };
const SOURCE = { url: FACT.sourceUrl, title: 'Исследование встреч', excerpt: FACT.statement };

module.exports = {
  id: 'model-led-research-continuations',
  title: 'Чтение и поиск не создают текст; модель продолжает собственные снимки с явным происхождением выбора',
  covers: ['piece.read', 'research.search', 'piece.create.from-research', 'piece.research.apply'],
  world: {
    researchFacts: [FACT, OTHER], coreResearchFacts: [FACT, OTHER], intakeQuestions: [],
    chatResearch: { summary: 'Сокращение встреч подтверждено исследованием.', facts: [{ text: FACT.statement, sourceUrl: FACT.sourceUrl }], sources: [SOURCE], readerAssessment: 'Источник отвечает на вопрос.', fromCache: false },
  },
  turns: [
    {
      say: 'Прочитай суть cnt-1 и проверь факты о созвонах. Пока ничего не меняй.',
      model: [
        [['tool', 'piece_read', { pieceId: 'p1', part: 'core', offset: 0, length: 12 }]],
        [['tool', 'research_search', { query: 'Как сократить созвоны?', level: 'quick', queries: ['meeting reduction study'] }]],
        [['text', 'Прочитал начало и нашёл исследование; ничего не сохранял.']],
      ],
    },
    {
      say: 'Подготовь новую заготовку с исследованием.',
      model: [
        [['tool', 'piece_create', { text: 'Подготовь новую заготовку с исследованием.', inputKind: 'instruction', research: 'standard' }]],
        [['text', 'Исследование готово, оцениваю найденные опоры.']],
      ],
    },
    {
      say: 'Продолжи по подтверждённой опоре.',
      model: [
        [['tool', 'piece_create_from-research', { snapshotKey: 'snap-1', factKeys: ['f1'] }]],
        [['tool', 'piece_read', { pieceId: 'p9' }]],
        [['text', 'Новая заготовка cnt-9 сохранена, текст проверен.']],
      ],
    },
    {
      say: 'Обнови исходную cnt-1, проверь факты и выбери подходящие сам.',
      model: [
        [['tool', 'piece_research', { pieceId: 'p1', level: 'quick' }]],
        [['tool', 'piece_research_apply', { pieceId: 'p1', snapshotKey: 'core-snap-1', factKeys: ['f1'] }]],
        [['tool', 'piece_read', { pieceId: 'p1' }]],
        [['text', 'Исходная заготовка обновлена, прежняя суть осталась в истории.']],
      ],
    },
  ],
  check: (run) => {
    const [readOnly, investigated, created, updated] = run.turns;
    const output = (turn, name) => {
      const result = turn.outputs.find((one) => one.toolName === name).output;
      return { ...result, summary: result.summary?.untrustedData?.value ?? result.summary };
    };
    const original = 'Созвоны без повестки съедают день.';
    expect(output(readOnly, 'piece_read')).toMatchObject({ ok: true, summary: { pieceId: 'p1', title: 'Про созвоны', text: original.slice(0, 12), offset: 0, nextOffset: 12, truncated: true, totalCharacters: original.length, revision: expect.stringMatching(/^[a-f0-9]{64}$/) } });
    const search = output(readOnly, 'research_search');
    expect(search).toMatchObject({ ok: true, summary: { query: 'Как сократить созвоны?', sourceCount: 1, fromCache: false, outcome: 'results' } });
    expect(JSON.stringify(search)).toContain(FACT.sourceUrl);
    expect(JSON.stringify(search)).toContain(FACT.statement);
    expect(readOnly.admissions.map(([operation]) => operation)).toEqual(['agent', 'web_research']);
    expect(run.requests.filter(([name]) => name === 'research.search')).toEqual([
      ['research.search', 'Как сократить созвоны?', { level: 'quick', language: 'ru', readerResponse: true, queries: ['meeting reduction study'] }],
    ]);
    // The first two turns report actual evidence, no human choice or phantom draft.
    expect(readOnly.data.filter((part) => part.type === 'data-piece')).toEqual([]);
    expect(investigated.suspended).toEqual([]);
    expect(output(investigated, 'piece_create')).toMatchObject({ ok: true, summary: { outcome: 'research-ready', snapshotKey: 'snap-1', waitingOnCard: 0 } });
    expect(JSON.stringify(output(investigated, 'piece_create'))).toContain(FACT.statement);
    expect(output(created, 'piece_create_from-research')).toMatchObject({ ok: true, summary: { pieceId: 'p9', code: 'cnt-9', factsKept: 1, factsCard: 'not_shown', selectionOrigin: 'model', outcome: 'created' } });
    expect(output(created, 'piece_read')).toMatchObject({ ok: true, summary: { pieceId: 'p9', text: 'Подготовь новую заготовку с исследованием.' } });
    expect(output(updated, 'piece_research_apply')).toMatchObject({ ok: true, summary: { pieceId: 'p1', applied: true, kept: 1, selectionOrigin: 'model', factsCard: 'not_shown', waitingOnCard: 0 } });
    expect(output(updated, 'piece_read')).toMatchObject({ ok: true, summary: { pieceId: 'p1', text: `${original} С опорами.` } });
    expect(run.requests.filter(([name]) => name === 'intake')).toHaveLength(1);
    expect(run.requests.filter(([name]) => name === 'intake.from-research')).toEqual([
      ['intake.from-research', 'user-1', { snapshotKey: 'snap-1', selectedKeys: ['f1'], origin: 'model' }],
    ]);
    expect(run.requests.filter(([name]) => name === 'piece.research.apply')).toEqual([
      ['piece.research.apply', 'p1', 'user-1', { snapshotKey: 'core-snap-1', selectedKeys: ['f1'] }],
    ]);
    expect(run.writes).toEqual([['piece.created', 'p9'], ['piece.research.applied', 'p1', ['f1']]]);
    expect(run.world.pieces.find((piece) => piece.id === 'p9')).toMatchObject({ facts: ['f1'], createdBy: 'user-1', researchSelection: { origin: 'model', selectedKeys: ['f1'] } });
    expect(run.world.pieces.find((piece) => piece.id === 'p1')).toMatchObject({ facts: ['f1'], researchSelection: { origin: 'model', selectedKeys: ['f1'] }, revisions: expect.arrayContaining([expect.objectContaining({ text: original })]) });
    expect(run.world.pieces.find((piece) => piece.id === 'p0')).toMatchObject({ title: 'Старое', archivedAt: '2026-09-01T00:00:00.000Z' });
    for (const turn of run.turns) expect(turn.suspended).toEqual([]);
  },
};
