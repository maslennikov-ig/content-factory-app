import { PostgresStore } from '@mastra/pg';

const mastraDatabaseUrl = process.env.MASTRA_DATABASE_URL;

export const pStore = new PostgresStore({
  id: 'content-factory-store',
  connectionString: mastraDatabaseUrl || process.env.DATABASE_URL!,
  // Production uses a separately migrated Mastra database. Keep the fallback
  // for local environments that still rely on Mastra's automatic bootstrap.
  disableInit: Boolean(mastraDatabaseUrl),
});
