/**
 * Снимок первого прохода входа (`content-factory-next-75xn.19`, F5/F11).
 *
 * «Продолжить с выбранными опорами» раньше вызывало ту же дверь второй раз,
 * и сервер заново извлекал, заново заполнял бриф и заново искал: 22–25 секунд
 * ожидания и другие формулировки строк, из-за которых галочки терялись.
 * Теперь первый проход кладёт своё состояние сюда на час, а второй вызов
 * продолжает с записи заготовки.
 *
 * Токен, а не импорт `redis.service`: тот открывает сокет при загрузке модуля
 * (ловушка `zhv8`), а библиотечную службу грузит каждый набор тестов. Клиент
 * отдаёт `database.module.ts`; без него снимка нет и ход идёт как раньше.
 */
export const INTAKE_SNAPSHOT_STORE = 'INTAKE_SNAPSHOT_STORE';

export interface IntakeSnapshotStore {
  get(key: string): Promise<string | null | undefined>;
  set(key: string, value: string, mode: 'EX', seconds: number): Promise<unknown>;
  del(key: string): Promise<unknown>;
  /** Native atomic SET EX NX. Required for a model-origin saved continuation. */
  claim?(key: string, value: string, seconds: number): Promise<boolean>;
  /** All keys are claimed together, or none; shared with singleton continuations. */
  claimMany?(keys: string[], value: string, seconds: number): Promise<boolean>;
}

export const INTAKE_SNAPSHOT_TTL_SECONDS = 60 * 60;

export const intakeSnapshotKey = (
  organizationId: string,
  actorUserId: string,
  id: string
): string => `intake:snapshot:${organizationId}:${actorUserId}:${id}`;

/** One atomic command; no partial claims or release after an uncertain write. */
export const INTAKE_CLAIM_MANY_LUA = `
for _, key in ipairs(KEYS) do
  if redis.call('EXISTS', key) == 1 then return 0 end
end
for _, key in ipairs(KEYS) do
  redis.call('SET', key, ARGV[1], 'EX', ARGV[2], 'NX')
end
return 1
`;

export function redisIntakeSnapshotStore(redis: {
  get(key: string): Promise<any>; set(...args: any[]): Promise<any>; del(key: string): Promise<any>;
  eval?(...args: any[]): Promise<any>;
  claimMany?(keys: string[], value: string, seconds: number): Promise<boolean>;
}): IntakeSnapshotStore {
  return {
    get: key => redis.get(key),
    set: (key, value, mode, seconds) => redis.set(key, value, mode, seconds),
    del: key => redis.del(key),
    claim: async (key, value, seconds) => (await redis.set(key, value, 'EX', seconds, 'NX')) === 'OK',
    claimMany: async (keys, value, seconds) => {
      if (!keys.length || keys.length > 9 || new Set(keys).size !== keys.length ||
          !Number.isInteger(seconds) || seconds <= 0) throw new Error('Invalid bounded research claim');
      if (redis.claimMany) return redis.claimMany(keys, value, seconds);
      if (!redis.eval) throw new Error('Atomic multi-capture continuation is unavailable');
      return Number(await redis.eval(INTAKE_CLAIM_MANY_LUA, keys.length, ...keys, value, seconds)) === 1;
    },
  };
}
