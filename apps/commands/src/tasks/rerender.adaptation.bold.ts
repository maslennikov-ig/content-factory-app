import { Command, Option } from 'nestjs-command';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaRepository } from '@contentfactory/nestjs-libraries/database/prisma/prisma.service';
import { IntegrationManager } from '@contentfactory/nestjs-libraries/integrations/integration.manager';
import {
  editorHtml,
  escape,
} from '@contentfactory/nestjs-libraries/content-intelligence/brief/editor-html';
import { hasBoldPair } from '@contentfactory/helpers/utils/bold-markers';

/**
 * Разовый перерисовщик черновиков, написанных до волны выделения.
 *
 * `content-factory-next-97dq.2`, разбор корректности P1-5. Тело адаптации
 * всегда хранило `**жирный**`, но в пост его переводили только с этой волны.
 * После выкладки страница заготовки показывает такой черновик жирным, а
 * очередь Telegram всё ещё несёт звёздочки — человек теряет единственное
 * место, где поломка была видна, и узнаёт о ней из вышедшего поста.
 *
 * Что здесь считается безопасным, и почему именно так:
 *
 *  - **только `DRAFT`**. Вышедший пост продукт не переписывает никогда;
 *  - **только пост, который никто не трогал руками**. Совпадение проверяется
 *    не догадкой, а пересчётом: тело прогоняется прежней сборкой (экранирование
 *    и абзацы, без перевода выделения), и если получившееся слово в слово равно
 *    сохранённому `content`, значит пост — это в точности машинная отрисовка
 *    этого тела. Любая ручная правка, картинка, ссылка или чужая разметка ломают
 *    равенство, и строка пропускается;
 *  - **только тело с закрытой парой**. Без выделения перерисовывать нечего;
 *  - **область называется всегда**. Запрос идёт по одной области за раз, и
 *    список областей берётся явным обходом: «обнови все черновики» без
 *    названной области — это запрос, который однажды выполнят не там.
 *
 * Идемпотентность — следствие той же проверки: после первого прохода `content`
 * уже не равен прежней сборке, и вторая попытка ничего не находит.
 *
 * Умолчание — показать и ничего не писать. Запись включается `--apply`.
 */

/** Строка, какой её читает перерисовщик: тело, пост и канал поста. */
export type BoldBackfillRow = {
  id: string;
  body: string | null;
  post: {
    id: string;
    content: string | null;
    integration: { providerIdentifier: string } | null;
  } | null;
};

/** Ровно тот кусок Prisma, которым пользуется команда. */
export type BoldBackfillClient = {
  organization: {
    findMany(args: unknown): Promise<Array<{ id: string }>>;
  };
  contentDerivation: {
    findMany(args: unknown): Promise<BoldBackfillRow[]>;
  };
  post: {
    updateMany(args: unknown): Promise<{ count: number }>;
  };
};

/**
 * Сборка поста ДО этой волны: экранирование и абзацы, без перевода выделения.
 *
 * Живёт здесь, а не рядом с `editorHtml`: это форма прошлого, нужная ровно
 * одной разовой команде, и в общем модуле она была бы приглашением отрисовать
 * ею что-нибудь ещё.
 */
export const preBoldEditorHtml = (
  text: string,
  editor: 'none' | 'normal' | 'markdown' | 'html'
): string => {
  const body = (text || '').replace(/\r\n?/gu, '\n').trim();
  if (!body) return '';
  if (editor !== 'html' && editor !== 'normal') return body;
  return body
    .split(/\n{2,}/u)
    .map((block) => {
      const inner = escape(block.replace(/\n/gu, ' ').trim());
      return inner ? `<p>${inner}</p>` : '';
    })
    .filter(Boolean)
    .join('');
};

@Injectable()
export class RerenderAdaptationBold {
  private readonly _logger = new Logger(RerenderAdaptationBold.name);

  constructor(
    private _prisma: PrismaRepository<any>,
    private _integrationManager: IntegrationManager
  ) {}

  private client(): BoldBackfillClient {
    return this._prisma.model as unknown as BoldBackfillClient;
  }

  @Command({
    command: 'adaptations:rerender-bold',
    describe:
      'Re-render DRAFT posts of adaptations whose stored body has bold markers (dry run by default)',
  })
  async rerender(
    @Option({
      name: 'apply',
      describe: 'Write the re-rendered posts; without it nothing is written',
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
    // Писать — только по явной просьбе, и `--dry-run` сильнее `--apply`:
    // из двух прочтений одной командной строки выигрывает то, что ничего не
    // меняет.
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
        const body = (row.body || '').trim();
        const post = row.post;
        if (!body || !post || !hasBoldPair(body)) continue;
        seen += 1;
        const editor = this.editorOf(post.integration?.providerIdentifier);
        if (!editor) {
          skipped.push(post.id);
          continue;
        }
        const fresh = editorHtml(body, editor);
        // Пост — в точности прежняя отрисовка этого тела? Тогда он машинный, и
        // перерисовка ничего человеческого не затрёт. Иначе руки были, и
        // строка остаётся как есть.
        if ((post.content || '') !== preBoldEditorHtml(body, editor)) {
          skipped.push(post.id);
          continue;
        }
        if (fresh === (post.content || '')) continue;
        touched.push(post.id);
        if (!write) continue;
        const { count } = await client.post.updateMany({
          where: {
            id: post.id,
            organizationId: organization.id,
            state: 'DRAFT',
            deletedAt: null,
          },
          data: { content: fresh },
        });
        rewritten += count;
      }
    }

    this._logger.log(
      write
        ? `Re-rendered ${rewritten} of ${touched.length} draft posts (${seen} adaptations carry bold, ${skipped.length} left untouched)`
        : `Dry run: ${touched.length} draft posts would be re-rendered (${seen} adaptations carry bold, ${skipped.length} left untouched). Pass --apply to write.`
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
