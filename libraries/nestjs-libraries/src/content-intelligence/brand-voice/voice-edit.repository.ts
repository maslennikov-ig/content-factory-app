import { Injectable, Optional } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaRepository } from '@contentfactory/nestjs-libraries/database/prisma/prisma.service';
import { htmlToPlainText } from './html-text';

/**
 * Что предложил продукт и что человек отправил вместо этого.
 *
 * ## Зачем это вообще собирается
 *
 * Порог похожести снимается на настоящих текстах других авторов системы —
 * единственном бесплатном отрицательном материале, который есть. Замер
 * 27.08.2026 назвал границу этого материала: при трёх процентах пропущенных
 * чужих ЛЮДЕЙ порог пропускает 2%, 23% и 45% ГЕНЕРАЦИЙ. Текст, написанный
 * моделью под голос человека, прячется лучше, чем посторонний, и сузить это
 * может только материал того же рода — то, что продукт написал этому
 * пространству сам, и то, что автор в этом исправил.
 *
 * ## Чего этот файл не делает
 *
 * Не влияет на генерацию. Ни на промпт, ни на порог, ни на примеры. Правки
 * копятся и меряются, и только после замера на стенде — той же меркой, что
 * судит всё остальное, — решается, помогают ли они. Порядок строгий и он же
 * граница осторожности: «система учится на ваших правках» без замера это
 * обещание, а не свойство. `tests/brand-voice.edits.test.cjs` держит эту
 * границу красной проверкой.
 *
 * ## Чьи это данные
 *
 * Автора. Живут, пока живёт аватар: `deleteAvatar` стирает их, а не передаёт
 * наследнику — правка без своего автора это два чужих друг другу текста.
 * Ничего чужого сюда не попадает: обе половины пары написаны внутри одного
 * пространства.
 */

type PrismaClientLike = Record<string, any>;

/**
 * Имя, под которым правки достаются сохранению поста.
 *
 * Строкой, а не классом, ровно по той же причине, что и `VOICE_ASSIST_PORT`:
 * `posts.service.ts` живёт в другом дереве и поднимается там, где раздела
 * «Контент» нет вовсе — воркер публикации собирает его же. Импорт класса
 * притащил бы туда весь голосовой модуль и уронил бы сборку тех, кто грузит
 * сервис постов в одиночку.
 */
export const VOICE_EDIT_PORT = 'VOICE_EDIT_REPOSITORY';

export type VoiceEditInput = {
  organizationId: string;
  avatarId: string;
  profileVersionId?: string | null;
  postId?: string | null;
  language?: string;
  /** Черновик, как его предложил продукт. */
  proposedText: string;
  /** Текст, как его отправил человек. */
  sentText: string;
};

export type StoredVoiceEdit = {
  id: string;
  organizationId: string;
  avatarId: string;
  profileVersionId: string | null;
  postId: string | null;
  language: string;
  proposedText: string;
  sentText: string;
  proposedChars: number;
  sentChars: number;
  pairHash: string;
  changed: boolean;
  createdAt: Date;
  deletedAt: Date | null;
};

/**
 * Разметка не привычка.
 *
 * Пост живёт в форме как HTML, и пара, сравнённая по тегам, объявила бы
 * правкой смену `<p>` на `<div>`. Сравнивается то же, что меряет проверка
 * текста, — plain text с приведёнными пробелами.
 */
const measurable = (text: string): string =>
  htmlToPlainText(text ?? '')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Ключ пары, а не двух текстов по отдельности.
 *
 * Пересохранение одного и того же поста — одна правка. Без этого автосохранение
 * умножило бы одно наблюдение на число нажатий «сохранить», и будущий замер
 * посчитал бы вес усидчивости за вес материала.
 */
const pairHashOf = (proposed: string, sent: string): string =>
  createHash('sha256').update(`${proposed}\u0000${sent}`).digest('hex');

const isUniqueViolation = (error: unknown): boolean =>
  !!error &&
  typeof error === 'object' &&
  'code' in error &&
  String((error as { code: unknown }).code) === 'P2002';

@Injectable()
export class VoiceEditRepository {
  constructor(
    private readonly _database: PrismaRepository<any>,
    @Optional() private readonly _now: () => Date = () => new Date()
  ) {}

  private client(): PrismaClientLike {
    return this._database.model as PrismaClientLike;
  }

  /**
   * @returns id новой строки, либо `null`, когда писать нечего или такая пара
   *   уже записана. Повтор это ответ, а не поломка.
   */
  async record(input: VoiceEditInput): Promise<string | null> {
    const proposed = measurable(input.proposedText);
    const sent = measurable(input.sentText);
    /**
     * Пустая половина — не наблюдение.
     *
     * Пост, написанный человеком с нуля, не имеет черновика модели, и пара,
     * где одна сторона пуста, обучала бы порог отличать текст от пустоты.
     */
    if (!proposed || !sent) return null;

    try {
      const row = await this.client().brandVoiceEdit.create({
        data: {
          organizationId: input.organizationId,
          avatarId: input.avatarId,
          profileVersionId: input.profileVersionId ?? null,
          postId: input.postId ?? null,
          language: input.language ?? 'ru',
          proposedText: proposed,
          sentText: sent,
          proposedChars: proposed.length,
          sentChars: sent.length,
          pairHash: pairHashOf(proposed, sent),
          // Отправленный без единой правки черновик — тоже наблюдение, и
          // притом ценное: он говорит, что мерке этот текст сойдёт за
          // авторский, хотя автор его не писал.
          changed: proposed !== sent,
          createdAt: this._now(),
        },
        select: { id: true },
      });
      return row.id as string;
    } catch (error) {
      if (isUniqueViolation(error)) return null;
      throw error;
    }
  }

  /**
   * Правка по сохранённому посту: черновик находится сам.
   *
   * Предложение продукта лежит в `ContentPiece.body` — тексте, который написал
   * брифовый путь, — а пост связан с ним через `ContentDerivation`. Аватар
   * берётся оттуда же, через версию голоса, которой черновик написан: спросить
   * об этом вызывающую сторону значило бы поверить клиенту в том, чей это
   * голос, а клиент шлёт то, что открыто в форме.
   *
   * Пост, у которого черновика продукта нет, наблюдением не является и молча
   * пропускается: человек написал его сам, и «модель предложила пустоту»
   * ничему не научит.
   *
   * @returns id записанной правки или `null`
   */
  async recordFromPost(
    organizationId: string,
    postId: string,
    sentText: string
  ): Promise<string | null> {
    if (!measurable(sentText)) return null;

    const derivation = (await this.client().contentDerivation.findFirst({
      where: { organizationId, postId },
      orderBy: [{ createdAt: 'asc' }],
      select: {
        brandProfileVersionId: true,
        contentPiece: { select: { body: true, language: true } },
      },
    })) as {
      brandProfileVersionId: string | null;
      contentPiece: { body: string; language: string } | null;
    } | null;

    const proposed = derivation?.contentPiece?.body;
    const versionId = derivation?.brandProfileVersionId;
    if (!proposed || !versionId) return null;

    const version = (await this.client().projectBrandProfileVersion.findFirst({
      where: { organizationId, id: versionId },
      select: { profileId: true },
    })) as { profileId: string } | null;
    if (!version?.profileId) return null;

    return this.record({
      organizationId,
      avatarId: version.profileId,
      profileVersionId: versionId,
      postId,
      language: derivation?.contentPiece?.language ?? 'ru',
      proposedText: proposed,
      sentText,
    });
  }

  /** Правки одного аватара, свежие первыми. Для замера, а не для генерации. */
  async list(
    organizationId: string,
    avatarId: string,
    limit = 200
  ): Promise<StoredVoiceEdit[]> {
    return (await this.client().brandVoiceEdit.findMany({
      where: { organizationId, avatarId, deletedAt: null },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
    })) as StoredVoiceEdit[];
  }

  /**
   * Черновики, которые человек переписал, — как их предложил продукт.
   *
   * Отрицательные примеры для рабочей точки (`content-factory-next-pl1.5`):
   * не чужой человек, а машина, писавшая на темы этого автора. Замер
   * 28.08.2026 на трёх корпусах — порог, снятый в том числе на них, пускает
   * 8,0% генераций там, где порог по одним чужим людям пускал 33,0%.
   *
   * **Только переписанные.** Черновик, отправленный без единой правки, автор
   * признал своим; отрицательным примером он не является и порог по нему
   * поехал бы вниз. Это то же различие, которое считает `counts`.
   *
   * **Только этого языка.** Точка снимается на языке разбора, и русская пара в
   * английской калибровке отделяется по алфавиту, а не по авторству, — то есть
   * кладёт порог на пол, показывая при этом прекрасные числа.
   *
   * Свежие первыми: голос меняется вместе с корпусом, и черновик, написанный
   * старой версией профиля, отвечает на вопрос про другого автора.
   */
  async rewrittenDrafts(
    organizationId: string,
    avatarId: string,
    language: string,
    limit = 200
  ): Promise<string[]> {
    const rows = (await this.client().brandVoiceEdit.findMany({
      where: {
        organizationId,
        avatarId,
        deletedAt: null,
        changed: true,
        language,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
    })) as StoredVoiceEdit[];
    return rows.map((one) => one.proposedText);
  }

  /**
   * Сколько правок набралось и сколько из них человек действительно тронул.
   *
   * Второе число и есть материал: черновик, отправленный без изменений,
   * отрицательным примером не является — автор его признал своим.
   */
  async counts(
    organizationId: string,
    avatarId: string
  ): Promise<{ total: number; changed: number }> {
    const where: Record<string, unknown> = {
      organizationId,
      avatarId,
      deletedAt: null,
    };
    const [total, changed] = await Promise.all([
      this.client().brandVoiceEdit.count({ where }),
      this.client().brandVoiceEdit.count({ where: { ...where, changed: true } }),
    ]);
    return { total: Number(total), changed: Number(changed) };
  }

  /**
   * Стереть правки удалённого аватара.
   *
   * Совсем, а не пометкой: тексты человека держатся ровно столько, сколько
   * держится автор, для которого они собраны. Наследнику они не переходят —
   * это правки в чужом голосе, и порог, снятый на них, был бы порогом про
   * другого человека.
   */
  async eraseForAvatar(
    organizationId: string,
    avatarId: string
  ): Promise<number> {
    const result = await this.client().brandVoiceEdit.deleteMany({
      where: { organizationId, avatarId },
    });
    return Number(result?.count ?? 0);
  }
}

export const __testing = { measurable, pairHashOf };
