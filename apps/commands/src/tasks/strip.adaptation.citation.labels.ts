import { Command, Option } from 'nestjs-command';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaRepository } from '@contentfactory/nestjs-libraries/database/prisma/prisma.service';
import { IntegrationManager } from '@contentfactory/nestjs-libraries/integrations/integration.manager';
import { editorHtml } from '@contentfactory/nestjs-libraries/content-intelligence/brief/editor-html';
import {
  hasCitationLabels,
  stripCitationLabels,
} from '@contentfactory/nestjs-libraries/content-intelligence/text-quality/citation-labels';

/**
 * Разовая чистка черновиков, в текст которых попали метки источников.
 *
 * `content-factory-next-97dq.40`, десятый заход 22.09.2026: адаптация Telegram
 * закончила два абзаца «[E2]» и «[E5]» — адресами строк блока материала,
 * которые модель скопировала в текст. Новые адаптации метки теряют при записи
 * (`stripCitationLabels` в `PieceService.persist`); эта команда — для тех, что
 * записаны раньше, и устроена тем же образом, что `adaptations:rerender-bold`:
 *
 *  - **только `DRAFT`**. Вышедший пост продукт не переписывает никогда;
 *  - **только пост, который никто не трогал руками**. Пост считается машинным,
 *    когда он слово в слово равен отрисовке сохранённого тела
 *    (`editorHtml(body, editor)`). Любая ручная правка ломает равенство, и
 *    строка пропускается и называется в отчёте — там решает человек;
 *  - **тело и пост меняются вместе, в одной транзакции**, и каждая запись
 *    проверяет, что строка всё ещё та, которую прочли: чужая запись между
 *    чтением и записью откатывает обе, и строка уходит в пропущенные;
 *  - **область называется в каждом запросе**.
 *
 * Идемпотентность: после первого прохода в теле меток нет, и второй прогон
 * работы не находит.
 *
 * Умолчание — показать и ничего не писать. Запись включается `--apply`.
 */

/** Строка, какой её читает чистка: тело, пост и канал поста. */
export type CitationLabelsBackfillRow = {
  id: string;
  body: string | null;
  post: {
    id: string;
    content: string | null;
    integration: { providerIdentifier: string } | null;
  } | null;
};

type UpdateMany = (args: unknown) => Promise<{ count: number }>;

/** Ровно тот кусок Prisma, которым пользуется команда. */
export type CitationLabelsBackfillClient = {
  organization: {
    findMany(args: unknown): Promise<Array<{ id: string }>>;
  };
  contentDerivation: {
    findMany(args: unknown): Promise<CitationLabelsBackfillRow[]>;
  };
  $transaction<T>(
    run: (tx: {
      post: { updateMany: UpdateMany };
      contentDerivation: { updateMany: UpdateMany };
    }) => Promise<T>
  ): Promise<T>;
};

/** Запись не совпала с прочитанным: строку кто-то тронул между делом. */
class RowMoved extends Error {}

@Injectable()
export class StripAdaptationCitationLabels {
  private readonly _logger = new Logger(StripAdaptationCitationLabels.name);

  constructor(
    private _prisma: PrismaRepository<any>,
    private _integrationManager: IntegrationManager
  ) {}

  private client(): CitationLabelsBackfillClient {
    return this._prisma.model as unknown as CitationLabelsBackfillClient;
  }

  @Command({
    command: 'adaptations:strip-citation-labels',
    describe:
      'Remove source labels such as [E2] from DRAFT adaptations and their machine-rendered posts (dry run by default)',
  })
  async strip(
    @Option({
      name: 'apply',
      describe: 'Write the cleaned bodies and posts; without it nothing is written',
      type: 'boolean',
      default: false,
    })
    apply: boolean,
    @Option({
      name: 'dry-run',
      describe:
        'Show what would change and write nothing. This is what happens without --apply; passing both keeps the safe side',
      type: 'boolean',
      default: false,
    })
    dryRun: boolean
  ) {
    const write = apply === true && dryRun !== true;
    const client = this.client();
    const organizations = await client.organization.findMany({
      select: { id: true },
    });
    let seen = 0;
    let rewritten = 0;
    const skipped: string[] = [];
    const touched: string[] = [];

    for (const organization of organizations) {
      const rows = await client.contentDerivation.findMany({
        where: {
          organizationId: organization.id,
          post: {
            is: {
              organizationId: organization.id,
              state: 'DRAFT',
              deletedAt: null,
            },
          },
        },
        select: {
          id: true,
          body: true,
          post: {
            select: {
              id: true,
              content: true,
              integration: { select: { providerIdentifier: true } },
            },
          },
        },
      });

      for (const row of rows) {
        const body = row.body || '';
        const post = row.post;
        if (!post || !hasCitationLabels(body)) continue;
        seen += 1;
        const editor = this.editorOf(post.integration?.providerIdentifier);
        const content = post.content || '';
        // Пост — в точности отрисовка этого тела? Тогда он машинный, и чистка
        // ничего человеческого не затрёт. Иначе руки были, и строка остаётся.
        if (!editor || content !== editorHtml(body, editor)) {
          skipped.push(post.id);
          continue;
        }
        const cleanBody = stripCitationLabels(body).trim();
        if (!cleanBody) {
          skipped.push(post.id);
          continue;
        }
        const cleanContent = editorHtml(cleanBody, editor);
        touched.push(post.id);
        if (!write) continue;
        try {
          await client.$transaction(async (tx) => {
            const posts = await tx.post.updateMany({
              where: {
                id: post.id,
                organizationId: organization.id,
                state: 'DRAFT',
                deletedAt: null,
                content,
              },
              data: { content: cleanContent },
            });
            if (posts.count !== 1) throw new RowMoved();
            const derivations = await tx.contentDerivation.updateMany({
              where: { id: row.id, organizationId: organization.id, body },
              data: { body: cleanBody },
            });
            if (derivations.count !== 1) throw new RowMoved();
          });
          rewritten += 1;
        } catch (error) {
          if (!(error instanceof RowMoved)) throw error;
          skipped.push(post.id);
        }
      }
    }

    this._logger.log(
      write
        ? `Cleaned ${rewritten} of ${touched.length} draft adaptations (${seen} carry source labels, ${skipped.length} left untouched)`
        : `Dry run: ${touched.length} draft adaptations would be cleaned (${seen} carry source labels, ${skipped.length} left untouched). Pass --apply to write.`
    );
    if (touched.length) this._logger.log(`Posts: ${touched.join(', ')}`);
    if (skipped.length)
      this._logger.log(`Left untouched: ${skipped.join(', ')}`);
    return { seen, planned: touched.length, rewritten, skipped: skipped.length };
  }

  /** Разметку решает провайдер канала, а не колонка: та же таблица, что у поста. */
  private editorOf(
    providerIdentifier?: string
  ): 'none' | 'normal' | 'markdown' | 'html' | null {
    if (!providerIdentifier) return null;
    const provider =
      this._integrationManager.getSocialIntegration(providerIdentifier);
    return (provider?.editor as 'none' | 'normal' | 'markdown' | 'html') ?? null;
  }
}
