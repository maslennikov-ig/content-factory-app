'use strict';

const { PrismaClient } = require('@prisma/client');
const { HttpException } = require('@nestjs/common');
const { loadMediaCredits } = require('./helpers/media-credits.module.cjs');

const databaseUrl = process.env.CF_CREDITS_DATABASE_URL;
(databaseUrl ? describe : describe.skip)(
  'inherited media credits with owned disposable PostgreSQL',
  () => {
    let db, verifier;
    const clients = [];
    const previousStripe = process.env.STRIPE_PUBLISHABLE_KEY;

    beforeAll(async () => {
      const url = new URL(databaseUrl);
      if (
        process.env.CF_CREDITS_DATABASE_DISPOSABLE !== '1' ||
        url.hostname !== '127.0.0.1' ||
        url.pathname !== '/cf_dbxe_completion_backend_test'
      ) {
        throw new Error(
          'Only the explicitly owned disposable media-credits database is allowed'
        );
      }
      db = new PrismaClient({ datasourceUrl: databaseUrl });
      verifier = new PrismaClient({ datasourceUrl: databaseUrl });
      clients.push(db, verifier);
      await db.organization.createMany({
        data: ['quota', 'foreign'].map((id) => ({
          id,
          name: `Synthetic ${id}`,
        })),
      });
    });
    afterAll(async () => {
      await Promise.all(clients.map((client) => client.$disconnect()));
      if (previousStripe === undefined)
        delete process.env.STRIPE_PUBLISHABLE_KEY;
      else process.env.STRIPE_PUBLISHABLE_KEY = previousStripe;
    });
    beforeEach(async () => {
      process.env.STRIPE_PUBLISHABLE_KEY = 'synthetic-enabled-billing';
      await db.credits.deleteMany({});
      await db.media.deleteMany({});
    });

    const rendezvous = () => {
      let reads = 0,
        release;
      const ready = new Promise((resolve) => {
        release = resolve;
      });
      return async () => {
        reads += 1;
        if (reads === 2) release();
        await ready;
      };
    };

    function fixture({ overlap = false, failAt, unbilled = false } = {}) {
      const storage = {
        uploadSimple: async () => {
          if (failAt === 'storage')
            throw new Error('synthetic storage failure');
          return 'https://synthetic.invalid/generated-media.png';
        },
      };
      const {
        SubscriptionRepository,
        SubscriptionService,
        MediaRepository,
        MediaService,
      } = loadMediaCredits({ storage });
      const org = {
        id: 'quota',
        isTrailing: false,
        subscription: {
          subscriptionTier: 'STANDARD',
          createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      };
      if (unbilled) {
        delete process.env.STRIPE_PUBLISHABLE_KEY;
        delete org.subscription;
      }
      const effects = [],
        admissions = [],
        readGate = rendezvous(),
        transactionReadGate = rendezvous();
      const services = [0, 1].map((request) => {
        const client = new PrismaClient({ datasourceUrl: databaseUrl });
        clients.push(client);
        const state = { active: false, attempts: 0, reads: 0 };
        const creditRepository = {
          model: {
            credits: {
              create: (args) => client.credits.create(args),
              delete: (args) => client.credits.delete(args),
              groupBy: async (args) => {
                const rows = await client.credits.groupBy(args);
                if (overlap) await readGate();
                return rows;
              },
            },
          },
        };
        const transactions = {
          model: {
            $transaction: async (run, options) => {
              state.active = true;
              state.attempts += 1;
              admissions.push(options);
              try {
                return await client.$transaction(
                  async (tx) =>
                    run({
                      credits: {
                        create: (args) => tx.credits.create(args),
                        groupBy: async (args) => {
                          const rows = await tx.credits.groupBy(args);
                          state.reads += 1;
                          if (overlap && state.reads === 1)
                            await transactionReadGate();
                          return rows;
                        },
                      },
                    }),
                  options
                );
              } finally {
                state.active = false;
              }
            },
          },
        };
        const repository = new SubscriptionRepository(
          creditRepository,
          null,
          null,
          creditRepository,
          null,
          transactions
        );
        const subscriptions = new SubscriptionService(repository, null, null);
        const provider = async (type) => {
          const rows = await verifier.credits.findMany({
            where: { organizationId: org.id, type },
          });
          effects.push({
            request,
            type,
            transactionActive: state.active,
            committedReservations: rows.length,
          });
          if (failAt === 'provider')
            throw new HttpException('synthetic provider refusal', 422);
          return 'iVBORw0KGgo=';
        };
        const media = new MediaService(
          new MediaRepository({ model: client }),
          {
            generateImageFromDescription: () => provider('ai_images'),
            generateImage: () => provider('ai_images'),
          },
          subscriptions,
          {
            getVideoByName: () => ({
              trial: true,
              instance: {
                processAndValidate: async () => {},
                process: () => provider('ai_videos'),
              },
            }),
          }
        );
        return { media, subscriptions, state };
      });
      const run = (request, type) =>
        type === 'ai_images'
          ? services[request].media.generateImageIntoLibrary(
              org,
              'synthetic image'
            )
          : services[request].media.generateVideo(org, {
              type: 'synthetic',
              output: 'horizontal',
              customParams: {},
            });
      return { org, effects, admissions, services, run };
    }

    test.each(['ai_images', 'ai_videos'])(
      'overlapping %s allowance1 reads produce one committed reservation and fake provider effect',
      async (type) => {
        const test = fixture({ overlap: true });
        const results = await Promise.allSettled([
          test.run(0, type),
          test.run(1, type),
        ]);
        expect(
          results.filter(
            (result) => result.status === 'fulfilled' && result.value !== false
          )
        ).toHaveLength(1);
        expect(test.effects).toHaveLength(1);
        expect(test.effects[0]).toMatchObject({
          transactionActive: false,
          committedReservations: 1,
        });
        expect(
          await db.credits.count({ where: { organizationId: 'quota', type } })
        ).toBe(1);
        expect(
          await db.media.count({ where: { organizationId: 'quota' } })
        ).toBe(1);
        expect(
          test.admissions.every(
            (options) => options.isolationLevel === 'Serializable'
          )
        ).toBe(true);
        expect(
          test.services.map((service) => service.state.attempts).sort()
        ).toEqual([1, 2]);
      }
    );

    test.each(['ai_images', 'ai_videos'])(
      '%s provider failure refunds only its own reservation and keeps the refusal',
      async (type) => {
        await db.credits.create({
          data: { organizationId: 'foreign', type, credits: 7 },
        });
        const failing = fixture({ failAt: 'provider' });
        await expect(failing.run(0, type)).rejects.toMatchObject({
          status: 422,
        });
        expect(
          await db.credits.count({ where: { organizationId: 'quota' } })
        ).toBe(0);
        expect(
          await db.credits.count({ where: { organizationId: 'foreign' } })
        ).toBe(1);
        const succeeding = fixture();
        await expect(succeeding.run(0, type)).resolves.toMatchObject({
          id: expect.any(String),
        });
        expect(succeeding.effects).toHaveLength(1);
        expect(
          await db.credits.count({ where: { organizationId: 'quota', type } })
        ).toBe(1);
      }
    );

    test.each([
      ['ai_images', 1],
      ['ai_videos', 0],
    ])(
      '%s storage failure preserves the existing charge/refund boundary (%s credit)',
      async (type, remaining) => {
        const failing = fixture({ failAt: 'storage' });
        await expect(failing.run(0, type)).rejects.toMatchObject({
          status: 500,
        });
        expect(failing.effects).toHaveLength(1);
        expect(
          await db.credits.count({ where: { organizationId: 'quota', type } })
        ).toBe(remaining);
        expect(await db.media.count({})).toBe(0);
      }
    );

    test('unbilled FREE images remain a counter: both requests execute without inherited quota transactions', async () => {
      const test = fixture({ overlap: true, unbilled: true });
      const results = await Promise.all([
        test.run(0, 'ai_images'),
        test.run(1, 'ai_images'),
      ]);
      expect(results.every((result) => result.id)).toBe(true);
      expect(test.effects).toHaveLength(2);
      expect(test.admissions).toEqual([]);
      expect(
        await db.credits.count({
          where: { organizationId: 'quota', type: 'ai_images' },
        })
      ).toBe(2);
    });

    test('only the current organization/type/window consumes the inherited allowance', async () => {
      await db.credits.createMany({
        data: [
          {
            organizationId: 'quota',
            type: 'ai_images',
            credits: 50,
            createdAt: new Date('2000-01-01T00:00:00Z'),
          },
          { organizationId: 'quota', type: 'ai_videos', credits: 50 },
          { organizationId: 'foreign', type: 'ai_images', credits: 50 },
        ],
      });
      const test = fixture();
      await expect(test.run(0, 'ai_images')).resolves.toMatchObject({
        id: expect.any(String),
      });
      await expect(test.run(1, 'ai_images')).resolves.toBe(false);
      expect(test.effects).toHaveLength(1);
      expect(await db.credits.count({})).toBe(4);
    });
  }
);
