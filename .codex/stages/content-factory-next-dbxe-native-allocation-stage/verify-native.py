#!/usr/bin/env python3
"""Root-owned exact native-path acceptance. Fails on source/binary/input drift."""
import hashlib
import json
from pathlib import Path
import subprocess

stage = Path(__file__).resolve().parent
repo = stage.parents[2]
research = stage / 'research'
raw = research / 'child-native-source.local'
previous = repo / '.codex/stages/content-factory-next-dbxe-os-runtime-stage'

def read(path):
    return json.loads(path.read_text())

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def check(condition, message):
    if not condition:
        raise RuntimeError(message)

source = read(stage / 'source-abi.actual.json')
check(not source['osAllocatorPatched'] and source['runtimeChanges'] == [], 'unexpected patch claim')
check(sha(research / 'child-native-report.md') == source['childReportSha256'], 'report drift')
check(sha(research / 'child-native-disassembly.local.txt') == source['fullDisassemblySha256'], 'disassembly drift')
check(sha(research / 'child-native-callsite.local.txt') == source['machineCallsiteSha256'], 'machine path drift')
for item in source['focusedSources']:
    check(sha(raw / item['path']) == item['sha256'], 'vendor source drift: ' + item['path'])
fallbacks = {item['supersedesFailedFile']: item for item in source['languageFallbacks']}
for filename, digest in source['languageReceiptDigests'].items():
    check(sha(raw / filename) == digest, 'language receipt drift')
    for item in read(raw / filename):
        if item['status'] == 'OK':
            check(sha(raw / item['file']) == item['sha256'], 'language source drift: ' + item['file'])
        else:
            check(item['file'] in fallbacks and item['status'] == 'FAILED', 'unresolved language source: ' + item['file'])
for item in fallbacks.values():
    check(sha(raw / item['file']) == item['sha256'] and sha(raw / item['treeFile']) == item['treeFileSha256'], 'fallback source drift')
    data = (raw / item['file']).read_bytes()
    check(hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest() == item['gitBlobSha1'], 'fallback Git blob mismatch')
    tree = read(raw / item['treeFile'])
    check(not tree['truncated'] and tree['url'] == item['officialGitTree'], 'fallback tree identity mismatch')
    check(any(row['path'] == 'meson.build' and row['sha'] == item['gitBlobSha1'] for row in tree['tree']), 'fallback absent from official tree')
    check("'imagequant'" in data.decode() and "'c'" in data.decode() and "'2.4.1'" in data.decode(), 'fallback language/version changed')

bound = source['alignedNewCall']
check(bound['alignment'] == 4 and bound['minimumIccSize'] == 146 and bound['requestFormula'] == 'icc_size - 14', 'native bound changed')
size_max = (1 << 64) - 1
check(146 - 14 == 132 and size_max - 14 + 3 < size_max, 'size_t overflow exclusion failed')
check(bound['maximumFromMarker'] == 65533 - 14 and bound['maxRoundedFromMarker'] == ((65533 - 14 + 3) & ~3), 'APP2 bound changed')
icc = (raw / 'libultrahdr-2.0.2/lib/src/icc.cpp').read_text()
check(icc.index('icc_size < sizeof(ICCHeader) + kICCIdentifierSize') < icc.index('::operator new[]'), 'lower guard missing or late')
check('::operator new[](icc_size - kICCIdentifierSize, std::align_val_t(alignment_needs))' in icc, 'size derivation changed')
machine = (research / 'child-native-callsite.local.txt').read_text()
check(all(s in machine for s in ('cmp    $0x91,%rsi', 'lea    -0xe(%rsi),%r12', 'mov    $0x4,%esi', '403ab3:')), 'ABI instructions missing')
calls = read(research / 'child-native-aligned-calls.local.json')
check(calls['directCallCount'] == 1 and calls['binarySha256'] == source['artifactProvenance'][0]['binarySha256'], 'unreviewed native aligned call')
libvips = repo / 'node_modules/@img/sharp-libvips-linux-x64/lib/libvips-cpp.so.8.18.7'
addon = repo / 'node_modules/@img/sharp-linux-x64/lib/sharp-linux-x64-0.35.5.node'
for artifact, binary in zip(source['artifactProvenance'], (libvips, addon), strict=True):
    check(artifact['installedEqualsRegistryBinary'] and artifact['registryIntegrity'] == artifact['tarballIntegrity'], 'official SRI/binary mismatch')
    check(sha(binary) == artifact['binarySha256'], 'installed binary changed')
relocs = subprocess.check_output(['readelf', '--wide', '--relocs', str(libvips)], text=True)
aligned = [line for line in relocs.splitlines() if 'align_val' in line]
check(len(aligned) == 2 and all('R_X86_64_JUMP_SLOT' in line for line in aligned), 'new aligned symbol address/relocation')
check(any('_ZnamSt11align_val_t' in line for line in aligned), 'allocation ABI changed')

pbds = source['pbdsSourceCoverage']['sources']
check(len(pbds) == 9 and all(s['exists'] and s['filesInspected'] > 0 and not s['gnuPbdsMatches'] for s in pbds), 'PBDS source coverage incomplete')
check(len(source['languageReceiptDigests']) >= 3, 'remaining native language coverage missing')
consumer = read(stage / 'consumer-map.actual.json')
check(consumer['directSharpCallCount'] == 7 and consumer['runtimeChanges'] == [], 'consumer claim changed')
for file, digest in consumer['files'].items():
    check(sha(repo / file) == digest, 'product consumer drift: ' + file)

fixture = read(stage / 'native-image-probe.actual.json')
check(sha(stage / 'native-image-probe.cjs') == fixture['runnerSha256'], 'fixture runner changed')
check(fixture['sharp'] == '0.35.5' and fixture['vips'] == '8.18.7' and fixture['nextSharpSameInstance'], 'fixture native mismatch')
check(fixture['network'] == 'none' and fixture['readOnly'] and fixture['memoryCapBytes'] == 268435456, 'fixture boundary changed')
check(fixture['ownedFixtureRemoved'] and fixture['foreignContainersPreserved'] and fixture['writesBeyondAllocation'] == 0, 'fixture cleanup/write boundary failed')
check(all(fixture[k] == 'PASS' for k in ('normalConversion', 'tiffControl', 'bigtiffControl')), 'normal native controls failed')
cases = {case['name']: case for case in fixture['cases']}
check(len(cases) == 12, 'hostile/control sample coverage changed')
accepted = {'gif-unsigned16-canvas', 'ultrahdr-vendor-control', 'ultrahdr-icc-short-profile', 'ultrahdr-icc-maximum-marker-claimed-size-tags-u32'}
for name, case in cases.items():
    check(len(case['checks']) == 2, 'missing metadata/conversion case')
    check(all(c['rejected'] == (name not in accepted) for c in case['checks']), 'sample outcome drift: ' + name)
check(cases['gif-unsigned16-canvas']['checks'][0]['output'] == {'width': 32, 'height': 24}, 'GIF actual frame bound changed')
check(sha(raw / 'libultrahdr-2.0.2/tests/data/apple_gainmap_new.jpg') == fixture['vendorControl']['sha256'], 'vendor fixture changed')

live = read(stage / 'live-native.actual.json')
check(live['status'] == 'PASS' and live['productionMutations'] == 0 and live['nativeHealthExitCode'] == 0, 'live native/health check failed')
native = live['native']
check(native['libvipsHash'] == sha(libvips) and native['addonHash'] == sha(addon) and native['nextSharpSameInstance'], 'serving native differs')
check(not any(native[k] for k in ('preloadConfigured', 'libraryPathConfigured', 'vipsModulePathConfigured')), 'native override configured')
check({item['role'] for item in native['roleOverrides']} == {'backend', 'orchestrator', 'frontend'}, 'missing actual runtime role')
check(not any(item[k] for item in native['roleOverrides'] for k in ('preloadConfigured', 'libraryPathConfigured', 'vipsModulePathConfigured')), 'actual role native override configured')
release = read(repo / '.codex/stages/content-factory-next-dbxe-delivery-20261010/delivery.actual.json')
check(live['application']['configDigest'] == release['image']['platformConfigDigest'], 'serving image drift')
check(native['sourceManifest'] == release['image']['sourceArchive'] and live['sourceArchiveMatchesManifest'], 'source archive drift')
check(live['application']['memoryLimit'] == 1879048192 and live['application']['restarts'] == 0, 'runtime cap/restart drift')
check(live['rollbackVerified'] and live['hostFreeBytes'] > 6 * 1024 ** 3, 'rollback/capacity missing')

# Preserve the original complete OS triage and every original requirement.
baseline = read(previous / 'baseline.actual.json')
check(sha(previous / 'baseline-os-records.actual.json') == baseline['osSnapshotSha256'], 'OS baseline changed')
triage = read(previous / 'triage.actual.json')
metadata = read(previous / 'research/metadata.actual.json')
check(sha(previous / 'research/metadata.actual.json') == triage['metadataSha256'], 'original metadata changed')
records = read(previous / 'baseline-os-records.actual.json')
seen = {}
for entry in triage['vulnerabilities']:
    for ordinal, record in zip(entry['baselineOrdinals'], entry['baselineRecords'], strict=True):
        check(ordinal not in seen and record == records[ordinal - 1], 'scanner record changed/lost')
        seen[ordinal] = record
check(len(seen) == 116 and len(triage['vulnerabilities']) == 55 and triage['runtimeChanges'] == [], 'original OS coverage changed')
check({v['cve'] for v in triage['vulnerabilities']} == {v['cve'] for v in metadata['vulnerabilities']}, 'original CVE identity changed')

children = json.loads(subprocess.check_output(['bd', 'list', '--all', '--parent', 'content-factory-next-dbxe', '--limit', '100', '--json'], cwd=repo, text=True))
epic = json.loads(subprocess.check_output(['bd', 'show', 'content-factory-next-dbxe', '--json'], cwd=repo, text=True))[0]
byid = {b['id']: b for b in [epic, *children]}
snapshot = read(repo / '.codex/goals/content-factory-next-dbxe/scope-criterion-snapshot.json')
for criterion in snapshot['criteria']:
    bead = criterion['criterion_id'].removeprefix('AC-')
    text = byid[bead]['acceptance_criteria']
    check(text == criterion['text'] and hashlib.sha256(text.encode()).hexdigest() == criterion['text_digest'], 'original criterion drift')
for task in read(stage / 'baseline-task-contracts.actual.json')['tasks']:
    check(byid[task['id']]['acceptance_criteria'] == task['acceptance_criteria'], 'selected/follow-up contract changed')
check(byid['content-factory-next-dbxe.8']['status'] == 'in_progress' and byid['content-factory-next-dbxe.34']['status'] == 'open' and epic['status'] == 'open', 'unselected task falsely closed')
check(byid['content-factory-next-dbxe.33']['status'] in ('in_progress', 'closed') and byid['content-factory-next-dbxe.35']['status'] in ('in_progress', 'closed'), 'selected stage state invalid')
diff = subprocess.check_output(['git', 'diff', '--name-only', 'd724f3b792f4518eebc04c854448904f565323fd'], cwd=repo, text=True).splitlines()
check(all(p.startswith('.codex/') or p.startswith('docs/') for p in diff), 'runtime/product diff requires a fresh release')
check(len((repo / '.codex/handoff.md').read_text().splitlines()) <= 200, 'handoff too long')
check(len((repo / '.codex/project-index.md').read_text().splitlines()) <= 150, 'index too long')
(stage / 'scope-final.local.json').write_text(json.dumps({'originalCriteriaPreserved': len(snapshot['criteria']), 'statuses': {k: byid[k]['status'] for k in ('content-factory-next-dbxe', 'content-factory-next-dbxe.8', 'content-factory-next-dbxe.33', 'content-factory-next-dbxe.34', 'content-factory-next-dbxe.35')}, 'children': len(children), 'closedChildren': sum(b['status'] == 'closed' for b in children)}, indent=2) + '\n')
print(json.dumps({'rootVerification': 'PASS', 'alignedOverflow': 'EXCLUDED_AT_EXACT_IMAGE_CONSUMERS', 'gnuPbds': 'NO_TEMPLATE_CONSUMER_IN_BOUND_IMAGE_CHAIN', 'controlledInputs': 12, 'nativeChecks': 24, 'osAllocatorPatched': False, 'retainedScannerRecords': 116, 'originalCriteriaPreserved': len(snapshot['criteria']), 'productChanges': 0, 'productionMutations': 0}))
