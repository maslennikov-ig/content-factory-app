#!/usr/bin/env python3
"""Compare actual globals with the prior pinned official scanner/database."""
import collections
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys

STAGE = Path(__file__).resolve().parent
PRIOR = STAGE.parent / 'content-factory-next-dbxe-delivery-20261010'
image = sys.argv[1]
phase = sys.argv[2]
assert re.fullmatch(r'[a-z0-9./_-]+:[a-z0-9._-]+', image)
assert re.fullmatch(r'[a-z0-9-]+', phase)
env = {**os.environ, 'GRYPE_DB_CACHE_DIR': str(PRIOR / 'scanner-tools.local/db'),
       'GRYPE_DB_AUTO_UPDATE': 'false', 'GRYPE_CHECK_FOR_APP_UPDATE': 'false'}
scanner = PRIOR / 'scanner-tools.local/grype'
command = [str(scanner), 'docker:' + image, '--scope', 'squashed',
           '--exclude', '/app/**', '--output', 'json']
raw = STAGE / (phase + '-scan.raw.local.json')
log = STAGE / (phase + '-scan.local.log')
with raw.open('w') as out, log.open('w') as err:
    result = subprocess.run(command, env=env, stdout=out, stderr=err, timeout=360)
assert result.returncode == 0, 'scanner failed; raw output is not acceptance'
data = json.loads(raw.read_text())
os_records = [r for r in data['matches'] if r['artifact']['type'] == 'deb']
globals_records = [r for r in data['matches'] if r['artifact']['type'] != 'deb']

def item(row):
    a, v = row['artifact'], row['vulnerability']
    return {'package': a['name'], 'version': a['version'], 'type': a['type'],
            'vulnerability': v['id'], 'severity': v['severity'], 'fix': v.get('fix'),
            'officialSource': v.get('dataSource'),
            'locations': [p['path'] for p in a.get('locations', [])]}

receipt = {'capturedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
           'image': image, 'scanCompleted': True, 'scanner': 'Grype0.120.1',
           'scannerSha256': hashlib.sha256(scanner.read_bytes()).hexdigest(),
           'database': json.loads((PRIOR / 'scanner-db.local.json').read_text()),
           'scope': 'squashed final image outside /app; product graph separately accepted',
           'distro': data.get('distro'),
           'globalSeverityCounts': dict(collections.Counter(r['vulnerability']['severity'] for r in globals_records)),
           'osSeverityCounts': dict(collections.Counter(r['vulnerability']['severity'] for r in os_records)),
           'globalCriticalHigh': [item(r) for r in globals_records if r['vulnerability']['severity'] in ('Critical', 'High')],
           'osCriticalHigh': [item(r) for r in os_records if r['vulnerability']['severity'] in ('Critical', 'High')],
           'rawReportSha256': hashlib.sha256(raw.read_bytes()).hexdigest()}
(STAGE / (phase + '-scan.actual.json')).write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps({k: receipt[k] for k in ['image', 'scanCompleted', 'globalSeverityCounts', 'osSeverityCounts']}))
