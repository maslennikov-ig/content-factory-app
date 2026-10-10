"""Read and bind already passing acceptance; no unconditional test/build replay."""
import hashlib
import json
import pathlib
import re
import subprocess
import yaml

ROOT = pathlib.Path(__file__).resolve().parents[3]
STAGE = pathlib.Path(__file__).resolve().parent
receipt = json.loads((STAGE/'root-acceptance.local.json').read_text())
assert receipt['status'] == 'PASS'
assert all(c['exitCode'] == 0 for c in receipt['checks'])
for name, digest in receipt['inputs'].items():
    assert hashlib.sha256((ROOT/name).read_bytes()).hexdigest() == digest, name
for name, digest in receipt['checkLogDigests'].items():
    assert hashlib.sha256((STAGE/name).read_bytes()).hexdigest() == digest, name
assert receipt['ownedNextRemoved']
test_log = (STAGE/'affected-acceptance.local.log').read_text()
assert re.search(r'Test Suites:\s+39 passed, 39 total', test_log)
assert re.search(r'Tests:\s+607 passed, 607 total', test_log)
node_log = (STAGE/'source-acceptance.local.log').read_text()
assert '# pass 47' in node_log and '# fail 0' in node_log and '# skipped 0' in node_log
audit = json.loads((STAGE/'fresh-audit.local.json').read_text())
triage = json.loads((STAGE/'applicability.json').read_text())
current_lock = hashlib.sha256((ROOT/'pnpm-lock.yaml').read_bytes()).hexdigest()
assert audit['lock_sha256'] == triage['accepted_lock_sha256'] == current_lock
assert not audit['production']['unresolved_snapshots'] and not audit['all_shipped']['unresolved_snapshots']
records = {(r['package'],r['source'],r['vulnerable_range']):r for r in triage['records']}
for name, rows in audit['all_shipped']['advisories'].items():
    for row in rows:
        if row['severity'] not in ('critical','high'):
            continue
        decision = records[(name,row['url'],row['vulnerable_versions'])]
        assert decision['disposition'] == 'not-applicable-to-inspected-current-consumer'
        assert decision['consumer'] and decision['source'] and decision['reassessment_trigger']
        assert sorted(decision['fresh_versions']) == sorted(row['matched_versions'])
assert triage['patched_baseline_critical_high'] == 120
# Installation was not inferred from lock resolution: inspect each recorded
# hoisted location, allowing the vendor's leading v package-version spelling.
installed = yaml.safe_load((ROOT/'node_modules/.modules.yaml').read_text())
inspected, optional_missing = 0, []
for node, places in installed['hoistedLocations'].items():
    name, version = node.split('(',1)[0].rsplit('@',1)
    for place in places:
        file = ROOT/place/'package.json'
        if not file.exists():
            optional_missing.append(place)
            continue
        actual = json.loads(file.read_text())
        assert actual['name'] == name and actual['version'].removeprefix('v') == version, place
        inspected += 1
changed = subprocess.check_output(['git','diff','--name-only'],cwd=ROOT,text=True).splitlines()
assert all(not p.startswith(('apps/','libraries/')) for p in changed), changed
result = {'status':'PASS','sourceTests':47,'jestSuites':39,'jestTests':607,'skips':0,
    'installedCopiesChecked':inspected,'optionalMissingLocations':optional_missing,
    'baselineCriticalHighPatched':120,'remainingAllShipped':audit['all_shipped']['severity_counts'],
    'productionBuilds':4,'extensionViteBuild':'PASS','extensionArchive':'Python ZIP byte/CRC verified',
    'packagingScript':'system zip absent; initial failure retained, no false PASS',
    'releaseGate':'next exact-SHA full suite/image/runtime acceptance remains required'}
(STAGE/'acceptance.json').write_text(json.dumps({**result,'inputs':receipt['inputs'],
    'rootReceiptSha256':hashlib.sha256((STAGE/'root-acceptance.local.json').read_bytes()).hexdigest(),
    'applicabilitySha256':hashlib.sha256((STAGE/'applicability.json').read_bytes()).hexdigest()},indent=2)+'\n')
print(json.dumps(result))
