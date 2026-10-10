#!/usr/bin/env python3
"""Actual Prisma proof against one owned loopback-only disposable database."""
import json
import os
from pathlib import Path
import subprocess
import time
import uuid

ROOT = Path(__file__).resolve().parents[3]
STAGE = Path(__file__).resolve().parent
ENV = {**os.environ, 'PATH': '/home/me/.nvm/versions/node/v22.23.2/bin:' + os.environ['PATH']}
checks = []
container = None

def capture(args):
    return subprocess.check_output(args, cwd=ROOT, env=ENV, text=True).strip()

def logged(name, args, env):
    with (STAGE / (name + '.local.log')).open('w') as log:
        result = subprocess.run(args, cwd=ROOT, env=env, stdout=log, stderr=subprocess.STDOUT)
    checks.append({'name': name, 'exitCode': result.returncode, 'command': args})
    if result.returncode:
        raise RuntimeError(name + ' failed; inspect its log')

before = capture(['docker', 'ps', '-aq']).splitlines()
receipt = {'boundary': 'synthetic disposable PostgreSQL, no live media/account/provider calls',
           'baseline': capture(['git', 'rev-parse', 'HEAD']), 'checks': checks, 'status': 'FAIL'}
try:
    name = 'cf-dbxe-media-' + uuid.uuid4().hex[:12]
    container = capture(['docker', 'run', '--pull=never', '--detach', '--name', name,
        '--label', 'cf.stage=dbxe-media', '--memory', '512m', '--tmpfs', '/var/lib/postgresql/data:rw',
        '-p', '127.0.0.1::5432', '-e', 'POSTGRES_USER=cf_media',
        '-e', 'POSTGRES_PASSWORD=synthetic-only-password', '-e', 'POSTGRES_DB=cf_media_dbxe_test',
        'sha256:742f40ea20b9ff2ff31db5458d127452988a2164df9e17441e191f3b72252193'])
    for _ in range(100):
        if subprocess.run(['docker', 'exec', container, 'pg_isready', '-U', 'cf_media', '-d', 'cf_media_dbxe_test'],
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0:
            break
        time.sleep(.25)
    else:
        raise RuntimeError('Owned PostgreSQL did not become ready')
    port = capture(['docker', 'port', container, '5432/tcp']).rsplit(':', 1)[1]
    url = f'postgresql://cf_media:synthetic-only-password@127.0.0.1:{port}/cf_media_dbxe_test'
    fixture_env = {**ENV, 'DATABASE_URL': url, 'CF_MEDIA_DATABASE_URL': url, 'CF_MEDIA_DATABASE_DISPOSABLE': '1'}
    receipt['fixture'] = {'container': container, 'name': name, 'loopbackOnly': True, 'database': 'cf_media_dbxe_test'}
    logged('disposable-schema', ['pnpm', 'exec', 'prisma', 'db', 'push', '--skip-generate',
        '--schema', 'libraries/nestjs-libraries/src/database/prisma/schema.prisma'], fixture_env)
    logged('native-postgres', ['pnpm', 'exec', 'jest', '--runInBand', '--runTestsByPath',
        'tests/media-ownership.postgres.test.cjs', '--json', '--outputFile=' + str(STAGE / 'native-jest.local.json')], fixture_env)
    receipt['status'] = 'PASS'
except Exception as error:
    receipt['failure'] = str(error)
finally:
    if container:
        label = capture(['docker', 'inspect', '--format', '{{ index .Config.Labels "cf.stage" }}', container])
        if label != 'dbxe-media':
            raise RuntimeError('Refusing cleanup of a nonowned container')
        subprocess.run(['docker', 'rm', '-f', container], check=True, stdout=subprocess.DEVNULL)
        receipt['ownedFixtureRemoved'] = True
    after = capture(['docker', 'ps', '-aq']).splitlines()
    receipt['preexistingContainerCount'] = len(before)
    receipt['foreignContainersMissing'] = sorted(set(before) - set(after))
    (STAGE / 'native-postgres.actual.json').write_text(json.dumps(receipt, indent=2) + '\n')
    print(json.dumps(receipt), flush=True)
raise SystemExit(0 if receipt['status'] == 'PASS' else 1)
