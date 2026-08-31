'use strict';

/**
 * A Prisma stand-in small enough to read, shared by the suites that exercise
 * the voice section.
 *
 * Extracted rather than copied a second time: two hand-rolled databases drift,
 * and the day they disagree the disagreement looks like a product bug. The
 * shape it answers to is the one `voice-sample.repository.ts` and
 * `voice-profile.repository.ts` actually call — a narrower surface than
 * Prisma's, on purpose.
 */

const clone = (value) => (value === undefined ? value : structuredClone(value));

/**
 * `{ organizationId_id: { organizationId, id } }` is two conditions, not one.
 *
 * Prisma writes a compound unique key that way, and reading it as a plain field
 * would compare a row's missing `organizationId_id` against an object and match
 * nothing. Before 2026-08-25 no caller used one — a space held exactly one
 * avatar, so `where: { organizationId }` was a unique key on its own — and the
 * day that stopped being true, this fake would have gone on passing while the
 * real client threw.
 */
const flattenCompound = (where = {}) => {
  const flat = {};
  for (const [key, value] of Object.entries(where)) {
    if (
      key.includes('_') &&
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      key.split('_').every((part) => part in value)
    ) {
      Object.assign(flat, value);
      continue;
    }
    flat[key] = value;
  }
  return flat;
};

function matches(row, rawWhere = {}) {
  const where = flattenCompound(rawWhere);
  return Object.entries(where).every(([key, wanted]) => {
    // `OR` is how a nullable column is asked about — `{ in: [id, null] }` is
    // refused by the real client, and this fake used to accept it, which is
    // exactly how that shape reached production.
    if (key === 'OR') {
      return (wanted || []).some((branch) => matches(row, branch));
    }
    /**
     * `AND` — не украшение: он единственный способ сказать про nullable-колонку
     * «проставлена и не эта», не полагаясь на то, как конкретная версия клиента
     * трактует `not` над `NULL`.
     */
    if (key === 'AND') {
      return (wanted || []).every((branch) => matches(row, branch));
    }
    if (wanted && typeof wanted === 'object' && !Array.isArray(wanted)) {
      if ('in' in wanted) {
        if (wanted.in.some((one) => one === null || one === undefined)) {
          throw new Error(
            'Prisma отвергает null внутри `in`: спрашивайте про nullable-колонку через OR'
          );
        }
        return wanted.in.includes(row[key]);
      }
      if ('not' in wanted) {
        // `{ not: null }` — «колонка проставлена», и отсутствующее поле это
        // тот же `NULL`. Без этой ветки фейк считал бы `undefined !== null`
        // истиной и пропускал бы строки, которых настоящая база не отдаёт.
        if (wanted.not === null) {
          return row[key] !== null && row[key] !== undefined;
        }
        return row[key] !== wanted.not;
      }
      if ('gt' in wanted) return row[key] > wanted.gt;
      if ('gte' in wanted) return row[key] >= wanted.gte;
      if ('lt' in wanted) return row[key] < wanted.lt;
      if ('lte' in wanted) return row[key] <= wanted.lte;
    }
    if (wanted === null) return row[key] === null || row[key] === undefined;
    return row[key] === wanted;
  });
}

function sortRows(rows, orderBy) {
  const clauses = Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : [];
  return rows.sort((left, right) => {
    for (const clause of clauses) {
      const [key, direction] = Object.entries(clause)[0];
      if (left[key] === right[key]) continue;
      const order = left[key] > right[key] ? 1 : -1;
      return direction === 'desc' ? -order : order;
    }
    return 0;
  });
}

class InMemoryVoicePrisma {
  constructor() {
    this.state = {
      brandVoiceSample: [],
      brandVoiceMeasurement: [],
      profiles: [],
      versions: [],
      audits: [],
      users: [],
      contentContextSnapshot: [],
      contentPiece: [],
      contentDerivation: [],
      brandVoiceEdit: [],
      autoPost: [],
    };
    this.sequence = 0;
    this.model = this.client(() => this.state);
    this.transaction = {
      model: {
        $transaction: async (work) => work(this.client(() => this.state)),
      },
    };
  }

  client(read) {
    const create = (collection, prefix, data, unique = []) => {
      const rows = read()[collection];
      for (const keys of unique) {
        if (rows.some((row) => keys.every((key) => row[key] === data[key]))) {
          throw Object.assign(new Error('unique constraint'), { code: 'P2002' });
        }
      }
      this.sequence += 1;
      const stamp = new Date(1_700_000_000_000 + this.sequence * 1_000);
      const row = {
        id: data.id || `${prefix}-${this.sequence}`,
        createdAt: stamp,
        updatedAt: stamp,
        ...clone(data),
      };
      rows.push(row);
      return clone(row);
    };
    const updateMany = (collection, where, data) => {
      const rows = read()[collection].filter((row) => matches(row, where));
      for (const row of rows) {
        for (const [key, value] of Object.entries(clone(data))) {
          row[key] =
            value && typeof value === 'object' && 'increment' in value
              ? row[key] + value.increment
              : value;
        }
        row.updatedAt = new Date();
      }
      return { count: rows.length };
    };
    const findMany = (collection, { where, orderBy } = {}) =>
      sortRows(
        clone(read()[collection].filter((row) => matches(row, where))),
        orderBy
      );
    const findFirst = (collection, options = {}) =>
      findMany(collection, options)[0] || null;

    /**
     * `include: { activeVersion: true }` on a profile row.
     *
     * One helper rather than the same six lines in `findFirst` and `findMany`:
     * the avatars list reads many rows with their versions and the runtime
     * resolver reads one, and a fake where only one of those joins would let
     * «версия v3» disappear from a list while passing every single-row test.
     */
    const withActiveVersion = (profile, include) => {
      if (!profile || !include?.activeVersion) return profile;
      profile.activeVersion = profile.activeVersionId
        ? findFirst('versions', {
            where: {
              organizationId: profile.organizationId,
              id: profile.activeVersionId,
            },
          })
        : null;
      return profile;
    };

    const deleteMany = (collection, where) => {
      const rows = read()[collection];
      const kept = rows.filter((row) => !matches(row, where));
      const removed = rows.length - kept.length;
      rows.length = 0;
      rows.push(...kept);
      return { count: removed };
    };

    const table = (collection, prefix, unique = []) => ({
      findMany: (options) => findMany(collection, options),
      findFirst: (options) => findFirst(collection, options),
      findUnique: ({ where }) => findFirst(collection, { where }),
      create: ({ data }) => create(collection, prefix, data, unique),
      updateMany: ({ where, data }) => updateMany(collection, where, data),
      /**
       * `count` и `deleteMany` — на тех же строках, что и всё остальное.
       *
       * Считать в наборе своим кодом значило бы проверять арифметику набора:
       * правки меряются числом строк, и число, полученное иначе, чем их
       * отдаёт «база», ничего не говорит о продукте.
       */
      count: ({ where } = {}) =>
        read()[collection].filter((row) => matches(row, where)).length,
      deleteMany: ({ where } = {}) => deleteMany(collection, where),
    });

    return {
      // Dedup follows the schema: per avatar since 2026-08-26, so a person and
      // their brand can be measured from overlapping texts. Rows with no
      // avatar are the pre-2026-08-26 corpora, and Postgres treats their NULLs
      // as distinct — the fake matches that by comparing `undefined` to
      // `undefined`, which is why they still collide here and would not in the
      // database. No suite depends on that corner.
      brandVoiceSample: table('brandVoiceSample', 'sample', [
        ['organizationId', 'avatarId', 'contentHash'],
      ]),
      brandVoiceMeasurement: table('brandVoiceMeasurement', 'measurement'),
      user: table('users', 'user'),
      contentContextSnapshot: table('contentContextSnapshot', 'snapshot'),
      contentPiece: table('contentPiece', 'piece'),
      /**
       * Черновик, из которого вырос пост, — вместе с самим черновиком.
       *
       * Связь настоящая: `select: { contentPiece: { … } }` у Prisma тянет
       * строку из другой таблицы, и фейк, отдающий деривацию без неё, дал бы
       * репозиторию `undefined` там, где база отдаёт текст. Правка тогда
       * молча не записалась бы, а набор остался бы зелёным.
       */
      contentDerivation: {
        ...table('contentDerivation', 'derivation'),
        findFirst: ({ where, orderBy, select } = {}) => {
          const row = findFirst('contentDerivation', { where, orderBy });
          if (!row || !select?.contentPiece) return row;
          row.contentPiece = findFirst('contentPiece', {
            where: {
              organizationId: row.organizationId,
              id: row.contentPieceId,
            },
          });
          return row;
        },
      },
      // Пара «что предложили — что отправили». Уникальность по хешу пары:
      // пересохранение поста это одна правка, а не две.
      brandVoiceEdit: table('brandVoiceEdit', 'edit', [
        ['organizationId', 'avatarId', 'pairHash'],
      ]),
      // Deactivating a profile refuses while an autopost still points at it.
      // Empty here, and a suite that needs the refusal fills the collection.
      autoPost: table('autoPost', 'autopost'),
      projectBrandProfile: {
        // `orderBy` is honoured here since a space may hold several avatars:
        // without it the fake returns insertion order and the repository's
        // "default first, then oldest" rule would be untested.
        findFirst: ({ where, orderBy, include }) =>
          withActiveVersion(findFirst('profiles', { where, orderBy }), include),
        findMany: ({ where, orderBy, include } = {}) =>
          findMany('profiles', { where, orderBy }).map((profile) =>
            withActiveVersion(profile, include)
          ),
        findUnique: ({ where }) => findFirst('profiles', { where }),
        create: ({ data }) => create('profiles', 'profile', data),
        upsert: ({ where, create: data }) =>
          findFirst('profiles', { where }) ||
          create('profiles', 'profile', data),
        update: ({ where, data }) => {
          updateMany('profiles', where, data);
          return findFirst('profiles', { where });
        },
        updateMany: ({ where, data }) => updateMany('profiles', where, data),
      },
      projectBrandProfileVersion: {
        findFirst: ({ where, orderBy, include }) => {
          const version = findFirst('versions', { where, orderBy });
          if (!version || !include?.profile) return version;
          version.profile = findFirst('profiles', {
            where: {
              organizationId: version.organizationId,
              id: version.profileId,
            },
          });
          return version;
        },
        findMany: (options) => findMany('versions', options),
        create: ({ data }) => create('versions', 'version', data),
        updateMany: ({ where, data }) => updateMany('versions', where, data),
      },
      brandProfileAuditEvent: {
        create: ({ data }) => create('audits', 'audit', data),
        findMany: (options) => findMany('audits', options),
        // The manual wizard's pointer is read as "the newest row with this
        // action", which is one row and not a list.
        findFirst: (options) => findFirst('audits', options),
      },
    };
  }
}

module.exports = { InMemoryVoicePrisma, clone, matches, sortRows };
