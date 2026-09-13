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
}

export const INTAKE_SNAPSHOT_TTL_SECONDS = 60 * 60;

export const intakeSnapshotKey = (
  organizationId: string,
  actorUserId: string,
  id: string
): string => `intake:snapshot:${organizationId}:${actorUserId}:${id}`;
