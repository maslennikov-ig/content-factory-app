#!/usr/bin/env python3
"""Sanitized current live inventory, root-owned; never print credentials or rows."""
import json
from pathlib import Path
import subprocess

STAGE = Path(__file__).resolve().parent
SSH = ['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=5', 'helixa-prod']

script = r'''
const { PrismaClient } = require('@prisma/client');
const { Client } = require('pg');
const crypto = require('node:crypto');
(async () => {
  const db = new PrismaClient();
  const mastra = new Client({ connectionString: process.env.MASTRA_DATABASE_URL || process.env.DATABASE_URL });
  try {
    const organizations = await db.organization.findMany({ select: { apiKey: true,
      users: { select: { role: true, disabled: true, user: { select: { activated: true } } } } } });
    const roles = {};
    let workspacesWithExposableKey = 0;
    for (const organization of organizations) {
      const members = organization.users.filter(row => !row.disabled && row.user.activated);
      for (const row of members) roles[row.role] = (roles[row.role] || 0) + 1;
      if (organization.apiKey && members.some(row => !['ADMIN','SUPERADMIN'].includes(row.role))) workspacesWithExposableKey++;
    }
    const channels = await db.integration.groupBy({ by: ['providerIdentifier'],
      where: { deletedAt: null, disabled: false }, _count: { _all: true } });
    const posts = await db.post.groupBy({ by: ['state'], where: { deletedAt: null }, _count: { _all: true } });
    await mastra.connect();
    const columns = (await mastra.query("SELECT table_name, column_name, data_type, udt_name, is_nullable, column_default FROM information_schema.columns WHERE table_schema='public' AND table_name LIKE 'mastra_%' ORDER BY table_name, ordinal_position")).rows;
    const indexes = (await mastra.query("SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' AND tablename LIKE 'mastra_%' ORDER BY tablename,indexname")).rows;
    const tables = [...new Set(columns.map(row => row.table_name))];
    const rowCounts = {};
    for (const table of tables) {
      rowCounts[table] = Number((await mastra.query('SELECT count(*) AS n FROM "' + table.replaceAll('"','""') + '"')).rows[0].n);
    }
    const result = { capturedAt: new Date().toISOString(), namespace: process.env.TEMPORAL_NAMESPACE || 'default',
      cronEnabled: !!process.env.RUN_CRON, storageProvider: process.env.STORAGE_PROVIDER || 'local',
      mastraSeparateDatabase: !!process.env.MASTRA_DATABASE_URL, mastraSkipInit: process.env.MASTRA_STORAGE_SKIP_INIT === '1',
      organizations: organizations.length, keyWorkspaces: organizations.filter(row => !!row.apiKey).length,
      activeRoleCounts: roles, workspacesWithExposableKey,
      oauthAuthorizationCount: await db.oAuthAuthorization.count(),
      channels: channels.map(row => ({ provider: row.providerIdentifier, count: row._count._all })),
      postStateCounts: posts.map(row => ({ state: row.state, count: row._count._all })),
      mastra: { tableCount: tables.length,
        schemaSha256: crypto.createHash('sha256').update(JSON.stringify({columns,indexes})).digest('hex'), rowCounts } };
    console.log(JSON.stringify(result));
  } finally { await db.$disconnect(); await mastra.end(); }
})().catch(() => { console.log(JSON.stringify({ok:false,reason:'inventory_failed'})); process.exitCode=1; });
'''
result = subprocess.run([*SSH, 'docker exec -i cf-next-app node'], input=script,
                        text=True, capture_output=True, timeout=90)
if result.returncode:
    raise SystemExit('Read-only inventory failed; raw output is withheld')
try:
    value = json.loads(result.stdout)
except json.JSONDecodeError:
    raise SystemExit('Inventory did not return a single sanitized JSON object')
(STAGE / 'live-before.local.json').write_text(json.dumps(value, indent=2) + '\n')
print(json.dumps(value), flush=True)
