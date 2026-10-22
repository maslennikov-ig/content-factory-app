import { PostgresStore } from '@mastra/pg';
import { Pool } from 'pg';

const mastraDatabaseUrl = process.env.MASTRA_DATABASE_URL;
const connectionString = mastraDatabaseUrl || process.env.DATABASE_URL;
if (!connectionString?.trim()) {
  throw new Error('A Mastra or product database connection is required.');
}
// Keep the pool alive through native drain and observability.shutdown().
// PostgresStore.close() intentionally leaves caller-owned pools open.
const mastraPool = new Pool({
  connectionString,
  max: 20,
  idleTimeoutMillis: 30_000,
});
mastraPool.on('error', () => {
  console.warn('Mastra PostgreSQL idle connection failed; the pool will reconnect.');
});

export const pStore = new PostgresStore({
  id: 'content-factory-store',
  pool: mastraPool,
  // Production uses a separately migrated Mastra database. Keep the fallback
  // for local environments that still rely on Mastra's automatic bootstrap.
  disableInit: Boolean(mastraDatabaseUrl),
});

let closePromise: Promise<void> | undefined;
export const closeMastraStore = (): Promise<void> =>
  (closePromise ??= mastraPool.end());
