#!/usr/bin/env python3
"""One root acceptance, with an explicitly owned disposable PostgreSQL."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import time
import uuid

ROOT = Path('/home/me/code/content-factory-next')
STAGE = ROOT / '.codex/stages/content-factory-next-dbxe-access-stage'
NODE = '/home/me/.nvm/versions/node/v22.23.2/bin'
ENV = {**os.environ, 'PATH': NODE + ':' + os.environ['PATH']}
SUITES = [
    'access-organization-key', 'access-token-purpose', 'access-legacy-oauth',
    'access-cookie-origin', 'access-provider-credentials', 'access-public-policies',
    'access-boundaries.postgres', 'auth-middleware-membership', 'public.api.approval',
    'same-origin-mutation', 'user-password-change', 'user-identity.auth',
    'password-hashing', 'password.policy.contract', 'registration.approval',
    'registration.invitation', 'registration.growth-event', 'newsletter.subscription',
    'telegram.auth.flow', 'oauth.state.binding', 'auth-invitation-preview',
    'team-invitation-flow', 'pending-account-rejection', 'admin-account-delete',
    'backend.cors', 'permissions.service', 'roles-matrix.guard',
    'role-doors.three-roles', 'superadmin-role.guard', 'organization.create',
    'organization.selector', 'integration.default-posting-times',
    'channel-delete.other-doors', 'workspace-activation.growth-event',
]

def capture(args):
    return subprocess.check_output(args, cwd=ROOT, env=ENV, text=True).strip()

def logged(name, args, env=ENV):
    started = time.monotonic()
    with (STAGE / f'{name}.log').open('w') as output:
        result = subprocess.run(args, cwd=ROOT, env=env, stdout=output, stderr=subprocess.STDOUT)
    check = {'name': name, 'command': args, 'exitCode': result.returncode,
             'seconds': round(time.monotonic() - started, 3)}
    checks.append(check)
    print(json.dumps(check), flush=True)
    if result.returncode:
        raise RuntimeError(f'{name} failed; read {name}.log')

checks = []
before = capture(['docker', 'ps', '-aq']).splitlines()
container = None
receipt = {'stage': 'content-factory-next-dbxe-access-stage',
           'boundary': 'local-source/http/disposable-postgres; no deployment/provider calls',
           'baselineHead': capture(['git', 'rev-parse', 'HEAD']), 'checks': checks,
           'node': capture(['node', '--version']), 'pnpm': capture(['pnpm', '--version']),
           'status': 'FAIL'}
try:
    name = 'cf-dbxe-access-' + uuid.uuid4().hex[:12]
    container = capture(['docker', 'run', '--pull=never', '--detach', '--name', name,
        '--label', 'cf.stage=dbxe-access', '--memory', '512m',
        '--tmpfs', '/var/lib/postgresql/data:rw', '-p', '127.0.0.1::5432',
        '-e', 'POSTGRES_USER=cf_access', '-e', 'POSTGRES_PASSWORD=synthetic-only-password',
        '-e', 'POSTGRES_DB=cf_access_dbxe_test', 'postgres:17-alpine'])
    for _ in range(80):
        ready = subprocess.run(['docker', 'exec', container, 'pg_isready', '-U', 'cf_access', '-d', 'cf_access_dbxe_test'],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if ready.returncode == 0:
            break
        time.sleep(0.25)
    else:
        raise RuntimeError('Owned PostgreSQL did not become ready')
    port = capture(['docker', 'port', container, '5432/tcp']).rsplit(':', 1)[1]
    db_url = f'postgresql://cf_access:synthetic-only-password@127.0.0.1:{port}/cf_access_dbxe_test'
    test_env = {**ENV, 'DATABASE_URL': db_url, 'CF_ACCESS_DATABASE_URL': db_url,
                'CF_ACCESS_DATABASE_DISPOSABLE': '1', 'STRIPE_SECRET_KEY': '',
                'JWT_SECRET': 'synthetic-root-acceptance-secret'}
    receipt['fixture'] = {'id': container, 'name': name, 'database': 'cf_access_dbxe_test', 'disposable': True}
    logged('disposable-schema', ['pnpm', 'exec', 'prisma', 'db', 'push', '--skip-generate',
        '--schema', 'libraries/nestjs-libraries/src/database/prisma/schema.prisma'], test_env)
    logged('focused-acceptance', ['pnpm', 'exec', 'jest', '--runInBand', '--detectOpenHandles',
        '--runTestsByPath', *[f'tests/{name}.test.cjs' for name in SUITES]], test_env)
    logged('backend-types-final', ['pnpm', 'exec', 'tsc', '-p', 'apps/backend/tsconfig.json', '--noEmit', '--incremental', 'false'])
    logged('docs-final', ['pnpm', 'run', 'docs:check'])
    logged('process-final', ['bash', 'scripts/orchestration/run_process_verification.sh', '--stage',
        'content-factory-next-dbxe-access-stage'])
    logged('diff-final', ['git', 'diff', '--check'])
    changed = capture(['git', 'diff', '--name-only']).splitlines()
    added = [f'tests/{name}.test.cjs' for name in SUITES if name.startswith('access-')]
    added += ['libraries/nestjs-libraries/src/integrations/social/credential-families.ts',
              'docs/operations/access-token-migration.md']
    inputs = sorted(set(changed + added))
    receipt['inputs'] = {path: hashlib.sha256((ROOT / path).read_bytes()).hexdigest() for path in inputs}
    receipt['status'] = 'PASS'
except Exception as error:
    receipt['failure'] = str(error)
finally:
    if container:
        owned_label = capture(['docker', 'inspect', '--format', '{{ index .Config.Labels "cf.stage" }}', container])
        if owned_label == 'dbxe-access':
            subprocess.run(['docker', 'rm', '-f', container], check=True, stdout=subprocess.DEVNULL)
            receipt['ownedFixtureRemoved'] = True
    after = capture(['docker', 'ps', '-aq']).splitlines()
    receipt['foreignContainersMissing'] = sorted(set(before) - set(after))
    (STAGE / 'root-acceptance.actual.json').write_text(json.dumps(receipt, indent=2) + '\n')
    print(json.dumps({'status': receipt['status'], 'failure': receipt.get('failure'),
                      'ownedFixtureRemoved': receipt.get('ownedFixtureRemoved'),
                      'foreignContainersMissing': receipt['foreignContainersMissing']}), flush=True)
raise SystemExit(0 if receipt['status'] == 'PASS' else 1)
