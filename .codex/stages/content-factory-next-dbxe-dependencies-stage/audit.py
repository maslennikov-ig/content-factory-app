"""Bounded exact-lock audit, including optional aliases and shipped build tools."""
import collections
import datetime
import hashlib
import json
import pathlib
import re
import subprocess
import urllib.request
import yaml

ROOT = pathlib.Path(__file__).resolve().parents[3]
STAGE = pathlib.Path(__file__).resolve().parent
lock_path = ROOT / 'pnpm-lock.yaml'
lock = yaml.safe_load(lock_path.read_text())


def key(name, version):
    return version if re.match(r'^(?:@[^/()]+/)?[A-Za-z0-9._-]+@\d', version) else name + '@' + version


def walk(include_dev):
    queue = collections.deque()
    parents = {}
    for importer, data in lock['importers'].items():
        for section in ('dependencies', 'optionalDependencies', *(['devDependencies'] if include_dev else [])):
            for name, dep in data.get(section, {}).items():
                value = dep['version'] if isinstance(dep, dict) else dep
                if not value.startswith(('link:', 'file:', 'workspace:')):
                    node = key(name, value)
                    parents.setdefault(node, f'importer:{importer}/{section}/{name}')
                    queue.append(node)
    visited, unresolved = set(), set()
    while queue:
        node = queue.popleft()
        if node in visited:
            continue
        visited.add(node)
        snapshot = lock['snapshots'].get(node)
        if snapshot is None:
            unresolved.add(node)
            continue
        for section in ('dependencies', 'optionalDependencies'):
            for name, version in snapshot.get(section, {}).items():
                child = key(name, str(version))
                parents.setdefault(child, node)
                queue.append(child)
    payload = collections.defaultdict(set)
    paths = {}
    for node in visited:
        bare = node.split('(', 1)[0]
        name, version = bare.rsplit('@', 1)
        if not re.fullmatch(r'\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?', version):
            raise RuntimeError(f'Unrecognized locked version: {node}')
        payload[name].add(version)
        path, current, seen = [bare], node, {node}
        while current in parents:
            current = parents[current]
            path.append(current.split('(', 1)[0])
            if current.startswith('importer:') or current in seen:
                break
            seen.add(current)
        old = paths.get(bare)
        if old is None or len(path) < len(old):
            paths[bare] = list(reversed(path))
    return {k: sorted(v) for k, v in sorted(payload.items())}, paths, sorted(unresolved), len(visited)


if __name__ == '__main__':
    production, prod_paths, prod_missing, prod_count = walk(False)
    all_packages, all_paths, all_missing, all_count = walk(True)
    request = urllib.request.Request('https://registry.npmjs.org/-/npm/v1/security/advisories/bulk',
        data=json.dumps(all_packages).encode(), headers={'Content-Type': 'application/json'}, method='POST')
    with urllib.request.urlopen(request, timeout=45) as response:
        advisories = json.load(response)
    match = subprocess.run(['/home/me/.nvm/versions/node/v22.23.2/bin/node', '-e', """
const fs=require('fs'),semver=require('semver');
const d=JSON.parse(fs.readFileSync(0,'utf8')), out={production:{},all:{}};
for(const [kind,payload] of [['production',d.production],['all',d.all]]) {
for(const [name,rows] of Object.entries(d.advisories))for(const row of rows){
const versions=(payload[name]||[]).filter(v=>semver.satisfies(v,row.vulnerable_versions,{includePrerelease:true}));
if(versions.length)(out[kind][name]??=[]).push({...row,matched_versions:versions});
}} console.log(JSON.stringify(out));
"""], input=json.dumps({'production': production, 'all': all_packages, 'advisories': advisories}),
        cwd=ROOT, text=True, capture_output=True, check=True, timeout=20)
    matched = json.loads(match.stdout)
    output = {'schema': 'cf-lockfile-bulk-audit/v2', 'at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'method': 'One official bulk request; semver matching over bounded exact-lock graph. No pnpm path/metavulnerability expansion.',
        'official_source': 'https://docs.npmjs.com/cli/v11/commands/npm-audit/#bulk-advisory-endpoint',
        'lock_sha256': hashlib.sha256(lock_path.read_bytes()).hexdigest(),
        'manifest_sha256': hashlib.sha256((ROOT/'package.json').read_bytes()).hexdigest(),
        'production': {'visited_snapshots': prod_count, 'unresolved_snapshots': prod_missing,
            'advisories': matched['production'], 'paths': prod_paths},
        'all_shipped': {'visited_snapshots': all_count, 'unresolved_snapshots': all_missing,
            'advisories': matched['all'], 'paths': all_paths},
        'limits': ['Ranges are not proof of runtime exploitation.', 'Dockerfile copies build and dev dependencies into runtime.',
            'Optional platform packages are traversed; applicability is assessed separately.']}
    for kind in ('production', 'all_shipped'):
        output[kind]['severity_counts'] = dict(collections.Counter(r['severity'] for rows in output[kind]['advisories'].values() for r in rows))
    (STAGE / 'fresh-audit.local.json').write_text(json.dumps(output, indent=2)+'\n')
    print(json.dumps({k: {a:b for a,b in v.items() if a not in ('paths','advisories')} for k,v in output.items() if k in ('production','all_shipped')}, indent=2))
    for name, rows in output['all_shipped']['advisories'].items():
        retained = [r for r in rows if r['severity'] in ('critical', 'high')]
        if retained:
            print(name, [(r['severity'], r['matched_versions'], r['url'], r['title']) for r in retained])
    if prod_missing or all_missing:
        raise SystemExit(1)
