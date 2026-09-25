'use strict';

/**
 * `content-factory-next-xmfb.12`. The current piece flow stores the claims a
 * person chose inside `ContentPiece.brief.brief.facts`. The onboarding count
 * used to look only at the older cross-piece `ContentFact` memory, so a
 * workspace with completed pieces could remain forever on “add a claim”.
 */

const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');

const repositoryModule = loadTypeScriptModule(
  'libraries/nestjs-libraries/src/database/prisma/onboarding/onboarding.repository.ts',
  {
    '@nestjs/common': { Injectable: () => (target) => target },
    '@contentfactory/nestjs-libraries/database/prisma/prisma.service': {
      PrismaRepository: class PrismaRepository {},
    },
  }
);

const adapter = loadTypeScriptModule(
  'apps/frontend/src/components/onboarding/onboarding.adapter.ts'
);

const storedPiece = (facts) => ({
  brief: {
    brief: {
      inputKind: 'thought',
      facts,
    },
  },
});

describe('onboarding progress follows the current piece fact store', () => {
  test('repository counts only facts that the piece will actually use', async () => {
    const findMany = jest.fn().mockResolvedValue([
      storedPiece([]),
      // Found rows are opt-in: an unselected search result is not an
      // assertion the person chose for the piece.
      storedPiece([
        {
          statement: 'Search result left out',
          kind: 'found',
          status: 'confirmed',
          selected: false,
        },
      ]),
      storedPiece([
        {
          statement: 'Search result accepted',
          kind: 'found',
          status: 'confirmed',
          selected: true,
        },
      ]),
      // A person's own claim is used by default. `selected: false` only
      // suppresses it when a conflict/correction made selection meaningful.
      storedPiece([
        {
          statement: 'Own statement',
          kind: 'own',
          status: 'confirmed',
          selected: false,
        },
        {
          statement: 'Conflicting statement left out',
          kind: 'own',
          status: 'conflicting',
          selected: false,
        },
      ]),
      // Old stored facts have no v2 selection fields and still represent the
      // claim that closed this step before those fields existed.
      storedPiece([{ statement: 'Legacy statement', origin: 'input' }]),
      storedPiece([{ statement: '   ', kind: 'own' }]),
    ]);

    const prisma = {
      model: {
        integration: {
          count: jest.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(1),
        },
        brandVoiceSample: { count: jest.fn().mockResolvedValue(2) },
        projectBrandProfile: { count: jest.fn().mockResolvedValue(1) },
        contentFact: { count: jest.fn().mockResolvedValue(0) },
        contentPiece: {
          count: jest.fn().mockResolvedValue(6),
          findMany,
          findFirst: jest.fn().mockResolvedValue({ id: 'piece-7' }),
        },
        post: {
          count: jest.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(1),
        },
        contentDerivation: { count: jest.fn().mockResolvedValue(4) },
      },
    };

    const result = await new repositoryModule.OnboardingRepository(
      prisma
    ).progress('workspace-1');

    expect(findMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'workspace-1',
        kind: 'CORE',
        archivedAt: null,
      },
      select: { brief: true },
    });
    expect(prisma.model.projectBrandProfile.count).toHaveBeenCalledWith({
      where: {
        organizationId: 'workspace-1',
        deletedAt: null,
        activeVersionId: { not: null },
      },
    });
    expect(result).toEqual({
      channels: 1,
      voiceSamples: 2,
      avatars: 1,
      facts: 0,
      pieceFacts: 3,
      pieces: 6,
      drafts: 1,
      scheduled: 1,
      adaptations: 4,
      planModes: 1,
      latestPieceId: 'piece-7',
    });
    // The piece touched last, for the adaptation step's links — only its id.
    expect(prisma.model.contentPiece.findFirst).toHaveBeenCalledWith({
      where: { organizationId: 'workspace-1', kind: 'CORE', archivedAt: null },
      orderBy: { updatedAt: 'desc' },
      select: { id: true },
    });
    // 2q28.6: adaptations of live CORE pieces, and channels whose plan mode
    // somebody chose — `NULL` reads as «Бронь» but decides nothing.
    expect(prisma.model.contentDerivation.count).toHaveBeenCalledWith({
      where: {
        organizationId: 'workspace-1',
        piece: { kind: 'CORE', archivedAt: null },
      },
    });
    expect(prisma.model.integration.count).toHaveBeenCalledWith({
      where: {
        organizationId: 'workspace-1',
        deletedAt: null,
        disabled: false,
        planMode: { not: null },
      },
    });
  });

  test('an avatar filled in by hand closes the avatar step without samples (fn33.157)', () => {
    const handFilled = { ...adapter.EMPTY_PROGRESS, avatars: 1 };
    expect(adapter.stepIsDone('avatar', handFilled)).toBe(true);
    expect(adapter.factIsDone(handFilled)).toBe(false);
    expect(adapter.readProgress({ avatars: 1 }).avatars).toBe(1);
    // An older answer without the field reads as zero, never as done.
    expect(adapter.stepIsDone('avatar', adapter.readProgress({}))).toBe(false);
  });

  test('a selected piece fact ticks only the optional claim', () => {
    const onlyPiece = {
      ...adapter.EMPTY_PROGRESS,
      pieces: 1,
    };
    expect(adapter.factIsDone(onlyPiece)).toBe(false);

    const withSelectedFact = {
      ...onlyPiece,
      pieceFacts: 1,
    };
    expect(adapter.factIsDone(withSelectedFact)).toBe(true);
    expect(adapter.stepIsDone('adaptation', withSelectedFact)).toBe(false);
    expect(adapter.stepIsDone('plan', withSelectedFact)).toBe(false);
  });

  test('malformed legacy brief JSON cannot invent completion or break progress', () => {
    const count = repositoryModule.selectedPieceFactCount;
    expect(count(null)).toBe(0);
    expect(count({ brief: 'old shape' })).toBe(0);
    expect(count({ brief: { facts: 'not an array' } })).toBe(0);
    expect(count({ brief: { facts: [null, {}, { statement: '  ' }] } })).toBe(
      0
    );
  });

  test('the production count shape completes all five steps', () => {
    expect(
      adapter.allStepsDone({
        channels: 1,
        voiceSamples: 1769,
        // The samples alone no longer close the avatar step (2q28.13).
        avatars: 1,
        facts: 0,
        pieceFacts: 76,
        pieces: 13,
        drafts: 2,
        scheduled: 2,
      })
    ).toBe(true);
  });

  test('older progress responses remain readable and do not invent facts', () => {
    expect(adapter.readProgress({ pieces: 3 }).pieceFacts).toBe(0);
    expect(adapter.factIsDone(adapter.readProgress({ pieces: 3 }))).toBe(false);
  });
});
