'use strict';

/**
 * The workspace a recorded scenario plays in (`content-factory-next-kcxz.11`):
 * rows in memory and the services the capabilities reach, answering from and
 * writing to those rows the way the real services do for their doors.
 *
 * Every method checks the organization it was handed, so a capability that
 * passed anything but the server-built identity fails the scenario instead of
 * reading an empty workspace. Every write is logged in `world.writes`.
 *
 * The paid service (`IntakeService.run`) admits its own `intake` operation
 * through the real `AiUsageService` the scenario hands in, exactly as the
 * door's generator does; whether it is absorbed by the turn's `agent`
 * admission or writes its own ledger row is what the scenario then reads.
 */

const ORGANIZATION_ID = 'org-1';
/** The scenario clock (the runner's `now`): «сейчас» of «Опубликовать сейчас». */
const NOW = '2026-09-27T10:00:00.000Z';

const baseRows = () => ({
  pieces: [
    {
      id: 'p1',
      code: 'cnt-1',
      title: 'Про созвоны',
      archivedAt: null,
      questions: [
        { field: 'audience', question: 'Для кого этот пост?', options: ['Руководители', 'Команда'] },
        { field: 'facts', key: 'ask-1', question: 'Какой случай был у вас?' },
      ],
      answers: [],
      body: 'Созвоны без повестки съедают день.',
      revisions: [
        { text: 'Первая суть.', writtenBy: 'model', replacedAt: '2026-09-20T10:00:00.000Z' },
      ],
      addedMaterial: [],
      materialPending: false,
    },
    { id: 'p0', code: 'cnt-0', title: 'Старое', archivedAt: '2026-09-01T00:00:00.000Z' },
  ],
  channels: [
    {
      id: 'c1',
      name: 'Канал про работу',
      providerIdentifier: 'telegram',
      disabled: false,
      refreshNeeded: false,
      planMode: 'reserve',
      posts: 2,
      profile: {
        version: 'channel-writing-profile/v2',
        lengthPolicy: { idealMin: 500, idealMax: 1000, hardMax: 1500 },
        emojiLevel: 'few',
        linkPolicy: 'end',
        hashtagPolicy: 'none',
        ctaKind: 'auto',
        formatPreference: 'auto',
        notes: 'Пишем коротко.',
        brandProfileId: 'a1',
      },
    },
  ],
  avatars: [
    { id: 'a1', name: 'Черновик голоса', isDefault: true, analysed: true, kind: 'PERSON', active: false },
  ],
  nextPiece: 9,
});

/** Applies a scenario's overrides to the base rows (shallow per table). */
const createWorld = (overrides = {}) => {
  const rows = { ...baseRows(), ...overrides };
  const writes = [];
  const reads = [];
  // What each door body looked like when it reached the service: the record
  // a scenario compares with what the screen sends.
  const requests = [];

  const scoped = (method, organizationId) => {
    if (organizationId !== ORGANIZATION_ID) {
      throw new Error(`${method} was called for organization ${organizationId}`);
    }
    reads.push(method);
  };
  const notFound = (what) =>
    Object.assign(new Error(`${what} not found`), { code: 'NOT_FOUND' });

  const pieceOf = (pieceId) => {
    const piece = rows.pieces.find((one) => one.id === pieceId);
    if (!piece) throw Object.assign(new Error('Заготовка не найдена.'), { code: 'PIECE_NOT_FOUND' });
    return piece;
  };
  /** The replaced core becomes the newest version, as `withRevision` keeps it. */
  const replaceCore = (piece, text, writtenBy) => {
    piece.revisions = [
      ...(piece.revisions ?? []),
      { text: piece.body ?? '', writtenBy: piece.writtenBy ?? 'model', replacedAt: '2026-09-27T10:00:00.000Z' },
    ];
    piece.body = text;
    piece.writtenBy = writtenBy;
  };

  const adaptationOf = (pieceId, adaptationId) => {
    const row = (rows.adaptations ?? []).find((one) => one.id === adaptationId && one.pieceId === pieceId);
    if (!row) throw Object.assign(new Error('Адаптации нет.'), { code: 'ADAPTATION_NOT_FOUND' });
    return row;
  };
  const channelOf = (integrationId) => {
    const channel = rows.channels.find((one) => one.id === integrationId);
    if (!channel) throw Object.assign(new Error('Канала нет.'), { code: 'PIECE_CHANNEL_UNKNOWN' });
    return channel;
  };
  /** «Ко всем N»: the channel's written drafts whose plan the mode would change. */
  const toApply = (integrationId) => {
    const mode = channelOf(integrationId).planMode;
    const target = mode === 'autopilot' ? 'queued' : mode === 'reserve' ? 'reserved' : 'draft';
    return (rows.adaptations ?? []).filter(
      (row) => row.integrationId === integrationId && row.state === 'draft' && row.plan?.status !== target
    );
  };
  /** A post of the calendar, as `getPosts` answers the calendar. */
  const postOf = (row) => {
    const piece = pieceOf(row.pieceId);
    const channel = channelOf(row.integrationId);
    return {
      id: row.postId,
      content: row.body ?? '',
      publishDate: new Date(row.date),
      state: row.state === 'queued' ? 'QUEUE' : row.state === 'published' ? 'PUBLISHED' : 'DRAFT',
      group: `g-${row.postId}`,
      integration: { id: channel.id, providerIdentifier: channel.providerIdentifier, name: channel.name, picture: null },
      piece: { id: piece.id, code: piece.code, title: piece.title },
      plan: row.plan?.status === 'reserved' ? 'reserve' : row.plan?.autopilot ? 'autopilot' : null,
    };
  };

  const servicesFor = ({ usage }) => ({
    OnboardingRepository: {
      progress: async (organizationId) => {
        scoped('OnboardingRepository.progress', organizationId);
        const live = rows.pieces.filter((piece) => !piece.archivedAt);
        return {
          channels: rows.channels.length,
          avatars: rows.avatars.length,
          pieces: live.length,
          drafts: 0,
          latestPieceId: live.at(-1)?.id ?? null,
        };
      },
    },
    PieceService: {
      // As the service answers the snapshot (every row) and the «Контент»
      // table (`q` over titles, archived only on request).
      list: async (organizationId, query = {}) => {
        scoped('PieceService.list', organizationId);
        requests.push(['piece.list', { ...query }]);
        const words = String(query.q ?? '').toLowerCase();
        const shown = rows.pieces.filter(
          (piece) =>
            (!query.q || piece.title.toLowerCase().includes(words)) &&
            (query.includeArchived || !piece.archivedAt)
        );
        return {
          state: rows.pieces.length ? 'default' : 'empty',
          columns: [],
          pieces: shown.map(({ questions, answers, body, ...piece }) => ({
            ...piece,
            date: '27.09.26',
          })),
        };
      },
      detail: async (organizationId, pieceId) => {
        scoped('PieceService.detail', organizationId);
        const piece = rows.pieces.find((one) => one.id === pieceId);
        if (!piece) {
          throw Object.assign(new Error('Заготовка не найдена.'), { code: 'PIECE_NOT_FOUND' });
        }
        return {
          state: 'default',
          piece: { id: piece.id, code: piece.code, title: piece.title, archivedAt: piece.archivedAt },
          core: {
            text: piece.body ?? 'Суть заготовки.',
            questions: { round: 0, items: piece.questions ?? [], answered: [] },
            revisions: piece.revisions ?? [],
            materialPending: piece.materialPending === true,
          },
          adaptations: (rows.adaptations ?? [])
            .filter((row) => row.pieceId === pieceId)
            .map((row) => ({ ...row })),
        };
      },
      archive: async (organizationId, pieceId, archived) => {
        scoped('PieceService.archive', organizationId);
        const piece = rows.pieces.find((one) => one.id === pieceId);
        if (!piece) throw notFound('piece');
        piece.archivedAt = archived ? '2026-09-27T10:00:00.000Z' : null;
        writes.push(['piece.archived', pieceId, archived]);
      },
      /* ---- The core (kcxz.13): the doors' services, over the same row ---- */
      editCore: async (organizationId, pieceId, input) => {
        scoped('PieceService.editCore', organizationId);
        const piece = pieceOf(pieceId);
        requests.push(['piece.core.edit', pieceId, { ...input }]);
        if (input.expected !== piece.body) {
          throw Object.assign(new Error('Суть изменилась.'), { code: 'PIECE_CORE_CHANGED' });
        }
        replaceCore(piece, input.text, 'person');
        writes.push(['piece.core.edited', pieceId]);
        return { text: piece.body, savedAt: '2026-09-27T10:00:00.000Z', revisions: piece.revisions.length };
      },
      appendMaterial: async (organizationId, pieceId, input) => {
        scoped('PieceService.appendMaterial', organizationId);
        const piece = pieceOf(pieceId);
        requests.push(['piece.material', pieceId, { ...input }]);
        piece.addedMaterial = [...(piece.addedMaterial ?? []), { text: input.text }];
        piece.materialPending = true;
        writes.push(['piece.material.added', pieceId]);
        return { addedMaterial: piece.addedMaterial, materialPending: true };
      },
      // `writeCore` over all the material: one `intake` operation.
      rebuildCore: async (organizationId, pieceId) => {
        scoped('PieceService.rebuildCore', organizationId);
        const piece = pieceOf(pieceId);
        await usage.executeAiOperation(organizationId, 'intake', async () => 'core');
        replaceCore(piece, `${piece.body} Пересобрано.`, 'model');
        piece.materialPending = false;
        writes.push(['piece.core.rebuilt', pieceId]);
        return { text: piece.body, revisions: piece.revisions.length };
      },
      restoreCore: async (organizationId, pieceId, input) => {
        scoped('PieceService.restoreCore', organizationId);
        const piece = pieceOf(pieceId);
        requests.push(['piece.core.restore', pieceId, { ...input }]);
        const chosen = piece.revisions?.[input.index];
        if (input.expected !== piece.body || !chosen || chosen.replacedAt !== input.replacedAt) {
          throw Object.assign(new Error('Версии нет.'), { code: 'PIECE_CORE_CHANGED' });
        }
        replaceCore(piece, chosen.text, chosen.writtenBy);
        writes.push(['piece.core.restored', pieceId, input.index]);
        return { text: piece.body, revisions: piece.revisions.length };
      },
      // The search (`web_research`) and its digest (`intake`); the preview is
      // kept under a snapshot key for the accept door.
      researchCore: async (organizationId, pieceId, userId, input) => {
        scoped('PieceService.researchCore', organizationId);
        pieceOf(pieceId);
        requests.push(['piece.research', pieceId, userId, { ...input }]);
        if (input.confirmWebSpend !== true) {
          throw Object.assign(new Error('Подтвердите поиск.'), { code: 'PIECE_RESEARCH_CONFIRM' });
        }
        await usage.executeAiOperation(organizationId, 'web_research', async () => 'found');
        await usage.executeAiOperation(organizationId, 'intake', async () => 'digest');
        const facts = (rows.coreResearchFacts ?? []).map((fact) => ({ ...fact }));
        const snapshotKey = `core-snap-${Object.keys(rows.coreSnapshots ?? {}).length + 1}`;
        rows.coreSnapshots = { ...(rows.coreSnapshots ?? {}), [snapshotKey]: { pieceId, facts } };
        return {
          version: 'piece-research/v1',
          snapshotKey,
          level: input.level ?? 'standard',
          input: 'core',
          facts,
          corrections: [],
          summary: null,
        };
      },
      acceptCoreResearch: async (organizationId, pieceId, userId, input) => {
        scoped('PieceService.acceptCoreResearch', organizationId);
        const piece = pieceOf(pieceId);
        requests.push(['piece.research.accept', pieceId, userId, JSON.parse(JSON.stringify(input))]);
        const saved = rows.coreSnapshots?.[input.snapshotKey];
        const allowed = new Set((saved?.facts ?? []).map((fact) => fact.factKey));
        if (!saved || saved.pieceId !== pieceId || input.selectedKeys.some((key) => !allowed.has(key))) {
          throw Object.assign(new Error('Выберите опоры.'), { code: 'PIECE_RESEARCH_SELECTION' });
        }
        await usage.executeAiOperation(organizationId, 'intake', async () => 'core');
        replaceCore(piece, `${piece.body} С опорами.`, 'model');
        piece.facts = input.selectedKeys.slice();
        writes.push(['piece.research.accepted', pieceId, input.selectedKeys.slice()]);
        return {};
      },
      // A check (claims, search, review) or a rewrite (review only); the
      // proposal comes back signed, as `reviewV2` answers the door.
      reviewV2: async (organizationId, pieceId, adaptationId, input) => {
        scoped('PieceService.reviewV2', organizationId);
        pieceOf(pieceId);
        requests.push(['piece.review', pieceId, adaptationId ?? null, { ...input }]);
        if (input.mode === 'web') {
          await usage.executeAiOperation(organizationId, 'content_classification', async () => 'claims');
          await usage.executeAiOperation(organizationId, 'web_research', async () => 'sources');
        }
        await usage.executeAiOperation(organizationId, 'text_generation', async () => 'review');
        const changes = (rows.reviewChanges ?? []).map((change) => ({ ...change }));
        const token = `token-${Object.keys(rows.proposals ?? {}).length + 1}`;
        // The text the proposal was made against: the accept door's
        // compare-and-swap refuses it once that text changed (kcxz.32, N2).
        const base = () =>
          adaptationId
            ? (rows.adaptations ?? []).find((one) => one.id === adaptationId)?.body
            : pieceOf(pieceId).body;
        rows.proposals = { ...(rows.proposals ?? {}), [token]: { pieceId, changes, base: base(), baseNow: base } };
        return {
          version: 'adaptation-review/v2',
          originalText: 'text',
          text: 'text',
          title: 'title',
          changes,
          verdict: changes.length ? 'review' : 'clean',
          summary: 'Сводка проверки.',
          token,
          slopBefore: 2,
          slopAfter: 0,
        };
      },
      acceptReviewV2: async (organizationId, pieceId, adaptationId, input) => {
        scoped('PieceService.acceptReviewV2', organizationId);
        const piece = pieceOf(pieceId);
        requests.push(['piece.review.accept', pieceId, adaptationId ?? null, JSON.parse(JSON.stringify(input))]);
        const proposal = rows.proposals?.[input.token];
        const allowed = new Set((proposal?.changes ?? []).filter((c) => c.basket !== 'ask').map((c) => c.id));
        if (!proposal || proposal.pieceId !== pieceId || input.selectedIds.some((id) => !allowed.has(id))) {
          throw Object.assign(new Error('Выберите правки.'), { code: 'REVIEW_SELECTION' });
        }
        if (proposal.baseNow() !== proposal.base) {
          // `reviewConflict()`: nothing is written.
          throw Object.assign(
            new Error('Черновик изменился после проверки или уже не является черновиком. Откройте актуальный текст и повторите проверку.'),
            { code: 'ADAPTATION_REVIEW_STALE' }
          );
        }
        replaceCore(piece, `${piece.body} Поправлено.`, 'model');
        writes.push(['piece.review.accepted', pieceId, input.selectedIds.slice()]);
        return {};
      },
      /* ---- Adaptations (kcxz.14) ---------------------------------------- */
      // The effective mode a new variant is placed by (post's own, else the channel's).
      adaptPlanMode: async (organizationId, pieceId, integrationId) => {
        scoped('PieceService.adaptPlanMode', organizationId);
        const piece = pieceOf(pieceId);
        const channel = rows.channels.find((one) => one.id === integrationId);
        // The post's own mode first, as `planModeFor` (review W2 F16).
        const mode = piece.planModes?.[integrationId] ?? channel?.planMode ?? null;
        // Somebody switches the channel right after this read — between the
        // capability's check and the service's write (review W2 F2).
        if (rows.switchModeAfterRead && channel && channel.id === rows.switchModeAfterRead.channelId) {
          channel.planMode = rows.switchModeAfterRead.to;
          rows.switchModeAfterRead = undefined;
        }
        return mode;
      },
      prepareAdapt: async (organizationId, pieceId, request) => {
        scoped('PieceService.prepareAdapt', organizationId);
        pieceOf(pieceId);
        requests.push(['piece.adapt', pieceId, JSON.parse(JSON.stringify(request))]);
        const channel = rows.channels.find((one) => one.id === request.integrationId);
        if (!channel) {
          throw Object.assign(new Error('Канала нет.'), { code: 'INTEGRATION_NOT_FOUND' });
        }
        const firstOnChannel = !(rows.adaptations ?? []).some(
          (row) => row.pieceId === pieceId && row.integrationId === channel.id
        );
        return { pieceId, request, channel, firstOnChannel, kind: request.kind ?? 'post' };
      },
      // The door's generator: the interview asks first on a new channel
      // (`asksBeforeAdapting`), otherwise the text is written and saved as a
      // new row — a repeat is a new variant, the old one stays.
      adapt: async function* (organizationId, plan, _userId, consent = {}) {
        scoped('PieceService.adapt', organizationId);
        const { channel, request } = plan;
        yield {
          name: 'adapt-started',
          pieceId: plan.pieceId,
          kind: plan.kind,
          channel: { id: channel.id, name: channel.name, providerIdentifier: channel.providerIdentifier },
        };
        const asks =
          plan.firstOnChannel &&
          !(request.answers ?? []).length &&
          !request.skipInterview &&
          !(request.decideKeys ?? []).length;
        if (asks) {
          await usage.executeAiOperation(organizationId, 'intake', async () => 'questions');
          const questions = (rows.adaptQuestions ?? []).map((one) => ({ ...one }));
          if (questions.length) {
            yield { name: 'questions', questions, round: 1 };
            return;
          }
        }
        await usage.executeAiOperation(organizationId, 'text_generation', async () => 'post');
        const adaptations = (rows.adaptations = rows.adaptations ?? []);
        // The mode as the write reads it (under the channel lock), and the
        // queue only with the call's consent (review W2 F2).
        const autopilot = channel.planMode === 'autopilot';
        const queued = autopilot && consent.queueAllowed !== false;
        const row = {
          id: `a${adaptations.length + 1}`,
          pieceId: plan.pieceId,
          kind: plan.kind,
          platform: channel.providerIdentifier,
          integrationId: channel.id,
          integrationName: channel.name,
          body: 'Текст поста.',
          mediaId: null,
          state: queued ? 'queued' : 'draft',
          plan: queued
            ? { status: 'queued', autopilot: true, current: true }
            : autopilot
              ? { status: 'reserved', autopilot: false, current: true, note: 'consent-needed' }
              : null,
          answers: (request.answers ?? []).map((one) => ({ ...one })),
          decideKeys: (request.decideKeys ?? []).slice(),
          skipInterview: request.skipInterview === true,
        };
        adaptations.push(row);
        writes.push(['adaptation.created', row.id, channel.id]);
        yield { name: 'adaptation', adaptation: { ...row } };
        yield { name: 'done', adaptationId: row.id, postId: null };
      },
      editAdaptation: async (organizationId, pieceId, adaptationId, input) => {
        scoped('PieceService.editAdaptation', organizationId);
        const row = (rows.adaptations ?? []).find((one) => one.id === adaptationId && one.pieceId === pieceId);
        if (!row) throw Object.assign(new Error('Адаптации нет.'), { code: 'ADAPTATION_NOT_FOUND' });
        requests.push(['adaptation.edit', pieceId, adaptationId, JSON.parse(JSON.stringify(input))]);
        if (typeof input.body === 'string') row.body = input.body;
        if (input.image !== undefined) row.mediaId = input.image ? input.image.id : null;
        writes.push(['adaptation.edited', adaptationId]);
        return { adaptation: { ...row } };
      },
      deleteAdaptation: async (organizationId, pieceId, adaptationId) => {
        scoped('PieceService.deleteAdaptation', organizationId);
        const before = (rows.adaptations ?? []).length;
        rows.adaptations = (rows.adaptations ?? []).filter(
          (one) => !(one.id === adaptationId && one.pieceId === pieceId)
        );
        if (rows.adaptations.length === before) {
          throw Object.assign(new Error('Адаптации нет.'), { code: 'ADAPTATION_NOT_FOUND' });
        }
        writes.push(['adaptation.deleted', adaptationId]);
      },
      /* ---- The plan (kcxz.15): the calendar doors' services -------------- */
      // The picker's rows: drafts and queued posts that can enter or move.
      readyAdaptations: async (organizationId, limit, integrationIds) => {
        scoped('PieceService.readyAdaptations', organizationId);
        requests.push(['plan.ready', limit, integrationIds ?? null]);
        return {
          version: 'ready-adaptations/v1',
          items: (rows.adaptations ?? [])
            .filter((row) => row.postId && ['draft', 'queued'].includes(row.state))
            .filter((row) => !integrationIds || integrationIds.includes(row.integrationId))
            .map((row) => ({
              adaptationId: row.id,
              pieceId: row.pieceId,
              pieceCode: pieceOf(row.pieceId).code,
              title: pieceOf(row.pieceId).title,
              firstLine: row.body ?? '',
              integrationId: row.integrationId,
              postId: row.postId,
              readyAt: '2026-09-27T10:00:00.000Z',
              slot: row.state === 'queued'
                ? { status: 'queued', date: row.date, autopilot: false }
                : row.plan?.status === 'reserved'
                  ? { status: 'reserved', date: row.date, autopilot: false }
                  : { status: 'free', date: null, autopilot: false },
            })),
        };
      },
      // «Поставить на ЧЧ:ММ»: by the channel's mode — a reserve, a draft with a
      // time, or on autopilot the queue; a queued post moves and stays queued.
      placeAdaptation: async (organizationId, pieceId, adaptationId, input, _language, consent = {}) => {
        scoped('PieceService.placeAdaptation', organizationId);
        requests.push(['plan.place', pieceId, adaptationId, { ...input }]);
        const row = adaptationOf(pieceId, adaptationId);
        // Read as the lock reads it: now, not when the capability checked —
        // the post's own mode first (`planModeFor`).
        const piece = pieceOf(pieceId);
        let mode = piece.planModes?.[row.integrationId] ?? channelOf(row.integrationId).planMode;
        if (consent.queueAllowed === false && (row.state === 'queued' || mode === 'autopilot')) {
          throw Object.assign(new Error('Поставить так значит отправить без подтверждения.'), {
            code: 'ADAPTATION_QUEUE_NEEDS_CONSENT',
            status: 409,
          });
        }
        // The chat's «поставь бронью» on a channel «Без плана»: this post's own
        // mode becomes «Бронь» under the lock (kcxz.31 D5). `noPostModes`: a
        // store without the tag columns, where the post stays a draft.
        if (consent.reserve === true && mode === 'draft' && row.state === 'draft' && !rows.noPostModes) {
          piece.planModes = { ...(piece.planModes ?? {}), [row.integrationId]: 'reserve' };
          writes.push(['post.mode', pieceId, row.integrationId, 'reserve']);
          mode = 'reserve';
        }
        let status;
        if (row.state === 'queued') status = 'queued';
        else if (mode === 'autopilot') {
          row.state = 'queued';
          status = 'queued';
        } else status = mode === 'draft' ? 'draft' : 'reserved';
        row.date = input.date;
        row.plan = { status, date: input.date, autopilot: mode === 'autopilot', current: true };
        writes.push(['plan.placed', adaptationId, status, input.date]);
        return {
          adaptation: { ...row },
          placement: { mode, status, date: input.date, autopilot: mode === 'autopilot', note: null },
        };
      },
      // «Запланировать» / «Опубликовать сейчас»: the draft joins the queue.
      scheduleAdaptation: async (organizationId, pieceId, adaptationId, input) => {
        scoped('PieceService.scheduleAdaptation', organizationId);
        requests.push(['plan.schedule', pieceId, adaptationId, { ...input }]);
        const row = adaptationOf(pieceId, adaptationId);
        if ((rows.queueBusy ?? []).includes(adaptationId)) {
          throw Object.assign(
            new Error('Другая версия этой заготовки уже выходит в этом канале. Дождитесь её выхода или выберите время позже.'),
            { code: 'ADAPTATION_QUEUE_BUSY', status: 409 }
          );
        }
        if (row.state !== 'draft') {
          throw Object.assign(
            new Error('Этот пост уже не черновик. Чтобы править его, сначала снимите его с расписания.'),
            { code: 'ADAPTATION_NOT_DRAFT', status: 409 }
          );
        }
        const date = input.now === true ? NOW : input.date;
        row.state = 'queued';
        row.date = date;
        row.plan = { status: 'queued', date, autopilot: false, current: true };
        writes.push(['plan.scheduled', adaptationId, input.now === true ? 'now' : date]);
        return { adaptation: { ...row } };
      },
      unscheduleAdaptation: async (organizationId, pieceId, adaptationId) => {
        scoped('PieceService.unscheduleAdaptation', organizationId);
        requests.push(['plan.unschedule', pieceId, adaptationId]);
        const row = adaptationOf(pieceId, adaptationId);
        if (row.state !== 'queued') {
          throw Object.assign(new Error('Этот пост не стоит в расписании: снимать нечего.'), {
            code: 'ADAPTATION_NOT_QUEUED',
            status: 409,
          });
        }
        row.state = 'draft';
        row.plan = { status: 'reserved', date: row.date, autopilot: false, current: true };
        writes.push(['plan.unscheduled', adaptationId]);
        return { adaptation: { ...row } };
      },
      // Written posts of the channel the mode would change.
      channelPlanImpact: async (organizationId, integrationId) => {
        scoped('PieceService.channelPlanImpact', organizationId);
        const channel = channelOf(integrationId);
        return { integrationId, planMode: channel.planMode, count: toApply(integrationId).length };
      },
      applyChannelPlanMode: async (organizationId, integrationId, expected) => {
        scoped('PieceService.applyChannelPlanMode', organizationId);
        requests.push(['plan.apply', integrationId, { planMode: expected }]);
        const channel = channelOf(integrationId);
        if (expected !== channel.planMode) {
          throw Object.assign(
            new Error('Режим канала уже сменился. Написанные посты не тронуты — выберите, к каким применить новый режим.'),
            { code: 'CHANNEL_PLAN_MODE_CHANGED', status: 409 }
          );
        }
        const changed = toApply(integrationId);
        for (const row of changed) {
          if (channel.planMode === 'autopilot') row.state = 'queued';
          row.plan = {
            status: channel.planMode === 'autopilot' ? 'queued' : channel.planMode === 'reserve' ? 'reserved' : 'draft',
            date: row.date ?? null,
            autopilot: channel.planMode === 'autopilot',
            current: true,
          };
        }
        writes.push(['plan.applied', integrationId, channel.planMode, changed.length]);
        return { integrationId, planMode: channel.planMode, count: changed.length, applied: changed.length };
      },
      prepareAnswer: async (organizationId, pieceId, request, language) => {
        scoped('PieceService.prepareAnswer', organizationId);
        const piece = rows.pieces.find((one) => one.id === pieceId);
        if (!piece) {
          throw Object.assign(new Error('Заготовка не найдена.'), { code: 'PIECE_NOT_FOUND' });
        }
        if (piece.archivedAt) {
          throw Object.assign(new Error('Заготовка в архиве.'), { code: 'PIECE_ARCHIVED' });
        }
        requests.push(['piece.answer', pieceId, JSON.parse(JSON.stringify(request))]);
        return {
          pieceId,
          language,
          request,
          core: { questions: { items: piece.questions ?? [] }, ...(piece.postLink ? { postLink: piece.postLink } : {}) },
        };
      },
      // The door's generator: at most one `draft` generation under `intake`,
      // every open question closed by an answer or by «Решите за меня».
      answer: async function* (organizationId, plan, userId) {
        scoped('PieceService.answer', organizationId);
        const piece = rows.pieces.find((one) => one.id === plan.pieceId);
        yield { name: 'answer-started', pieceId: plan.pieceId, round: 1 };
        // `writeCore`: operation `intake`; the `draft` role is the model's, not the row's.
        await usage.executeAiOperation(organizationId, 'intake', async () => 'rewritten');
        const given = plan.request.answers ?? [];
        piece.answers = (piece.questions ?? []).map((question) => {
          const answer = given.find((one) =>
            question.key ? one.key === question.key : !one.key && one.field === question.field
          );
          return answer
            ? { field: question.field, ...(question.key ? { key: question.key } : {}), text: answer.text, origin: 'person' }
            : { field: question.field, ...(question.key ? { key: question.key } : {}), text: '', origin: 'model' };
        });
        piece.questions = [];
        // kcxz.37 (F9): everything handed over closes an asked link question
        // as «Без ссылки»; a link the person gave stays.
        if (piece.linkQuestion && !piece.postLink && !given.length) {
          piece.postLink = { url: null, origin: 'author', answeredAt: '2026-09-27T12:00:00.000Z' };
        }
        writes.push(['piece.answered', piece.id, userId]);
        // The stored answers ride on the event, as `PieceService.answer` sends them.
        yield {
          name: 'piece',
          pieceId: piece.id,
          code: piece.code,
          core: {
            text: 'Новая суть.',
            questions: { answered: piece.answers },
            ...(piece.postLink ? { postLink: piece.postLink } : {}),
          },
        };
        yield { name: 'done', pieceId: piece.id };
      },
      updateTitle: async (organizationId, pieceId, title) => {
        scoped('PieceService.updateTitle', organizationId);
        const piece = rows.pieces.find((one) => one.id === pieceId);
        if (!piece) throw notFound('piece');
        piece.title = title;
        writes.push(['piece.title', pieceId, title]);
        return { ...piece };
      },
      approvalSubject: async (organizationId, pieceId) => {
        scoped('PieceService.approvalSubject', organizationId);
        const index = rows.pieces.findIndex((one) => one.id === pieceId);
        if (index === -1) return null;
        const piece = rows.pieces[index];
        return { id: piece.id, code: piece.code, title: piece.title };
      },
      delete: async (organizationId, pieceId) => {
        scoped('PieceService.delete', organizationId);
        const before = rows.pieces.length;
        rows.pieces = rows.pieces.filter((one) => one.id !== pieceId);
        if (rows.pieces.length === before) throw notFound('piece');
        writes.push(['piece.deleted', pieceId]);
      },
    },
    IntakeService: {
      prepare: async (organizationId, body) => {
        scoped('IntakeService.prepare', organizationId);
        requests.push(['intake', JSON.parse(JSON.stringify(body))]);
        return { planned: body };
      },
      run: async function* (organizationId, plan, userId) {
        scoped('IntakeService.run', organizationId);
        const body = plan.planned;
        const kind = body.inputKind ?? 'thought';
        // A second request with the kept rows continues the first one's
        // snapshot instead of repeating it (`75xn.19`).
        const resumed = Array.isArray(body.researchSelections)
          ? rows.snapshots?.[body.snapshotKey] ?? null
          : null;
        yield { name: 'intake-started', inputKind: kind, sources: [kind] };
        if (!resumed) {
          // The door's generator: its model step is an `intake` operation.
          await usage.executeAiOperation(organizationId, 'intake', async () => 'extracted');
          if (kind === 'foreign_post') {
            yield { name: 'claims', claims: [{ statement: 'Созвоны съедают день' }] };
          }
        }
        yield { name: 'brief-started' };
        const research = body.options?.researchEnabled === true;
        if (research && !resumed) {
          const level = body.options.researchLevel;
          yield { name: 'research-started', level, count: 3 };
          await usage.executeAiOperation(organizationId, 'web_research', async () => 'found');
          const facts = (rows.researchFacts ?? []).map((fact) => ({ ...fact }));
          if (!Array.isArray(body.researchSelections)) {
            const snapshotKey = `snap-${Object.keys(rows.snapshots ?? {}).length + 1}`;
            rows.snapshots = { ...(rows.snapshots ?? {}), [snapshotKey]: { facts, level } };
            yield { name: 'research-ready', level, facts, snapshotKey, corrections: [] };
            yield {
              name: 'research-selection-required',
              level,
              facts,
              snapshotKey,
              corrections: [],
            };
            yield { name: 'brief-filled', brief: { facts } };
            yield { name: 'done', pieceId: null };
            return;
          }
        }
        if (resumed) {
          yield { name: 'research-ready', level: resumed.level, facts: resumed.facts, snapshotKey: body.snapshotKey, corrections: [] };
        }
        yield { name: 'brief-filled', brief: {} };
        const number = rows.nextPiece++;
        const piece = {
          id: `p${number}`,
          code: `cnt-${number}`,
          title: String(body.input).slice(0, 40),
          archivedAt: null,
          body: body.input,
          inputKind: kind,
          language: body.language,
          research: body.options?.researchEnabled ?? null,
          ...(Array.isArray(body.researchSelections)
            ? { facts: body.researchSelections.slice() }
            : {}),
          createdBy: userId,
          questions: (
            rows.intakeQuestions ?? [
              { field: 'audience', question: 'Для кого?' },
              { field: 'facts', key: 'ask-1', question: 'Какой итог?' },
            ]
          ).map((question) => ({ ...question })),
          answers: [],
        };
        // The core is written now only when nothing is left to ask
        // (`finish`): `writeCore` admits its own `intake` operation.
        if (!piece.questions.length) {
          await usage.executeAiOperation(organizationId, 'intake', async () => 'core');
        }
        rows.pieces.push(piece);
        writes.push(['piece.created', piece.id]);
        yield { name: 'piece', pieceId: piece.id, code: piece.code, core: { body: piece.body } };
        // The event `IntakeService.run` yields after the piece (not the wire
        // contract's `piece-questions`, which the service never yields: the
        // fake used it and hid kcxz.29 D4).
        yield { name: 'questions', questions: piece.questions, round: 0 };
        yield { name: 'done', pieceId: piece.id };
      },
    },
    IntegrationService: {
      getIntegrationsForChannelList: async (organizationId) => {
        scoped('IntegrationService.getIntegrationsForChannelList', organizationId);
        return rows.channels.map(({ posts, planMode, profile, ...channel }) => ({
          ...channel,
          _count: { posts },
        }));
      },
      getWritingProfile: async (organizationId, id) => {
        scoped('IntegrationService.getWritingProfile', organizationId);
        const channel = rows.channels.find((one) => one.id === id);
        if (!channel) throw notFound('channel');
        return { integrationId: id, profile: JSON.parse(JSON.stringify(channel.profile ?? {})) };
      },
      updateWritingProfile: async (organizationId, id, body) => {
        scoped('IntegrationService.updateWritingProfile', organizationId);
        const channel = rows.channels.find((one) => one.id === id);
        if (!channel) throw notFound('channel');
        requests.push(['channel.writing-profile', id, JSON.parse(JSON.stringify(body))]);
        writes.push(['channel.profile.updated', id]);
        return { integrationId: id, profile: body };
      },
      getPlanMode: async (organizationId, id) => {
        scoped('IntegrationService.getPlanMode', organizationId);
        const channel = rows.channels.find((one) => one.id === id);
        if (!channel) throw notFound('channel');
        return { integrationId: id, planMode: channel.planMode };
      },
    },
    VoiceService: {
      avatars: async ({ organizationId }) => {
        scoped('VoiceService.avatars', organizationId);
        return {
          avatars: rows.avatars.map((avatar) => ({ ...avatar })),
          defaultAvatarId: rows.avatars.find((avatar) => avatar.isDefault)?.id ?? null,
        };
      },
      // What the activation would refuse, asked before the consent card
      // (kcxz.29, D7). An avatar row with `ready: false` has empty lines.
      activationBlocker: async (actor, mode) => {
        scoped('VoiceService.activationBlocker', actor.organizationId);
        const avatar = actor.avatarId
          ? rows.avatars.find((one) => one.id === actor.avatarId)
          : rows.avatars.find((one) => one.isDefault);
        if (!avatar) {
          return Object.assign(new Error('Предложения голоса нет.'), {
            name: 'VoiceError',
            code: 'VOICE_PROFILE_NOT_FOUND',
          });
        }
        return avatar.ready === false
          ? Object.assign(
              new Error(`Голос нельзя включить (${mode}), пока пусто строк: 1.`),
              { name: 'VoiceError', code: 'VOICE_FIELDS_INCOMPLETE' }
            )
          : null;
      },
      activateProposal: async (actor, body) => {
        scoped('VoiceService.activateProposal', actor.organizationId);
        const avatar = actor.avatarId
          ? rows.avatars.find((one) => one.id === actor.avatarId)
          : rows.avatars.find((one) => one.isDefault);
        if (!avatar) throw notFound('avatar');
        if (!actor.canManage || body.consentGiven !== true) {
          throw Object.assign(new Error('refused'), { code: 'VOICE_REFUSED' });
        }
        avatar.active = true;
        if (body.avatarName) avatar.name = body.avatarName;
        writes.push(['avatar.activated', avatar.id, body.mode ?? null]);
        return { state: {}, voice: { name: avatar.name } };
      },
    },
    PostsService: {
      // `/analytics/ahead`: reserves and queued posts from today, by channel.
      getPlanAhead: async (organizationId, query) => {
        scoped('PostsService.getPlanAhead', organizationId);
        requests.push(['plan.ahead', { ...query }]);
        const live = (rows.adaptations ?? []).filter((row) => row.date && row.state !== 'published');
        const counts = (list) => {
          const reserved = list.filter((row) => row.state === 'draft' && row.plan?.status === 'reserved').length;
          const queued = list.filter((row) => row.state === 'queued').length;
          const dates = list.map((row) => row.date).sort();
          return { reserved, queued, planned: reserved + queued, planUntil: dates.length ? dates.at(-1).slice(0, 10) : null };
        };
        return {
          version: 'plan-ahead/v2',
          today: NOW.slice(0, 10),
          timeZone: query.timeZone,
          horizon: 60,
          days: 0,
          until: null,
          emptyFrom: NOW.slice(0, 10),
          daysWithPosts: 0,
          strip: [],
          published7d: 0,
          ...counts(live),
          channels: rows.channels.map((channel) => ({
            integrationId: channel.id,
            name: channel.name,
            days: 0,
            until: null,
            emptyFrom: NOW.slice(0, 10),
            published7d: 0,
            ...counts(live.filter((row) => row.integrationId === channel.id)),
          })),
        };
      },
      // The calendar's read (`GET /posts`): posts between the two instants.
      getPosts: async (organizationId, query) => {
        scoped('PostsService.getPosts', organizationId);
        requests.push(['plan.calendar', { ...query }]);
        const from = new Date(query.startDate).getTime();
        const to = new Date(query.endDate).getTime();
        return (rows.adaptations ?? [])
          .filter((row) => row.postId && row.date)
          .filter((row) => !query.integrationId || row.integrationId === query.integrationId)
          .filter((row) => new Date(row.date).getTime() >= from && new Date(row.date).getTime() <= to)
          .map(postOf);
      },
      // `PUT /posts/:id/date`: a queued CF variant passes the one-queue gate.
      // `unscheduleBeforeMove`: the person takes the post off the schedule
      // after the capability read it as queued, before the service reads it.
      // The service moves only from `movableFrom` (default queue or draft).
      changeDate: async (organizationId, postId, date, action, movableFrom = ['QUEUE', 'DRAFT']) => {
        scoped('PostsService.changeDate', organizationId);
        requests.push(['post.date', postId, { date, action, movableFrom }]);
        const row = (rows.adaptations ?? []).find((one) => one.postId === postId);
        if (!row) throw Object.assign(new Error('Post not found'), { code: 'POST_NOT_FOUND' });
        if ((rows.unscheduleBeforeMove ?? []).includes(postId)) {
          row.state = 'draft';
          row.plan = null;
          rows.unscheduleBeforeMove = rows.unscheduleBeforeMove.filter((one) => one !== postId);
        }
        const readState = row.state === 'queued' ? 'QUEUE' : row.state === 'draft' ? 'DRAFT' : 'OTHER';
        if (action === 'schedule' && !movableFrom.includes(readState)) {
          throw Object.assign(
            new Error('This post is no longer scheduled or a draft (it may have just been published). Nothing was moved.'),
            { code: 'POST_STATE_CHANGED', status: 409 }
          );
        }
        if ((rows.queueBusyPosts ?? []).includes(postId)) {
          throw Object.assign(
            new Error('Another version of this post is already scheduled in this channel. Unschedule it first.'),
            { code: 'CF_QUEUE_BUSY', status: 409 }
          );
        }
        // The server reads the calendar's wall time as UTC (its zone).
        row.date = new Date(`${date}Z`).toISOString();
        if (row.plan) row.plan = { ...row.plan, date: row.date };
        writes.push(['post.date', postId, row.date]);
        return { publishDate: row.date };
      },
    },
    AiUsageService: {
      // What the snapshot line shows; the admissions themselves go through
      // the real service the door holds.
      readAllowance: async (organizationId) => {
        scoped('AiUsageService.readAllowance', organizationId);
        return { mode: 'workspace_key' };
      },
    },
  });

  return {
    rows,
    writes,
    reads,
    requests,
    servicesFor,
    /** What the scenario asserts on: the rows as they are now. */
    state: () =>
      JSON.parse(
        JSON.stringify({ ...rows, switchModeAfterRead: undefined, nextPiece: undefined, snapshots: undefined, researchFacts: undefined, intakeQuestions: undefined, coreSnapshots: undefined, coreResearchFacts: undefined, proposals: undefined, reviewChanges: undefined, adaptQuestions: undefined, queueBusy: undefined, queueBusyPosts: undefined, unscheduleBeforeMove: undefined })
      ),
  };
};

module.exports = { ORGANIZATION_ID, createWorld };
