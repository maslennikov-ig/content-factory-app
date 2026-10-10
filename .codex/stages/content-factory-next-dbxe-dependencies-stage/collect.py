"""Bounded public advisory and package metadata evidence; never changes dependencies."""
import concurrent.futures
import hashlib
import html.parser
import json
import pathlib
import subprocess
import urllib.parse
import urllib.request
import yaml

ROOT = pathlib.Path(__file__).resolve().parents[3]
STAGE = pathlib.Path(__file__).resolve().parent
BASE = ROOT / '.codex/stages/content-factory-next-audit-20261009/dependency-bulk-final.actual.json'
baseline = json.loads(BASE.read_text())
lock = yaml.safe_load((ROOT / 'pnpm-lock.yaml').read_text())


def fetch(url, accept='application/json'):
    req = urllib.request.Request(url, headers={'Accept': accept, 'User-Agent': 'ContentFactory-local-dependency-review'})
    with urllib.request.urlopen(req, timeout=40) as response:
        return response.read()


class Text(html.parser.HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []
    def handle_data(self, data):
        value = data.strip()
        if value:
            self.parts.append(value)


def package(item):
    name, rows = item
    ranges = sorted({r['vulnerable_versions'] for r in rows if r['severity'] in ('critical', 'high')})
    if not ranges:
        return None
    raw = fetch('https://registry.npmjs.org/' + urllib.parse.quote(name, safe=''), 'application/vnd.npm.install-v1+json')
    data = json.loads(raw)
    versions = list(data['versions'])
    current = sorted({v for r in rows if r['severity'] in ('critical', 'high') for v in r['matched_versions']})
    proc = subprocess.run(['/home/me/.nvm/versions/node/v22.23.2/bin/node', '-e', """
const s=require('semver'),fs=require('fs'),d=JSON.parse(fs.readFileSync(0,'utf8'));
const versions=d.versions.filter(v=>s.valid(v)&&!s.prerelease(v)).sort(s.compare);
const choices=d.current.map(old=>({old,sameMajor:versions.find(v=>s.gte(v,old)&&s.major(v)===s.major(old)&&!d.ranges.some(r=>s.satisfies(v,r))),any:versions.find(v=>s.gte(v,old)&&!d.ranges.some(r=>s.satisfies(v,r)))}));
console.log(JSON.stringify(choices));
"""], input=json.dumps({'versions': versions, 'ranges': ranges, 'current': current}), cwd=ROOT, capture_output=True, text=True, check=True)
    choices = json.loads(proc.stdout)
    selected = {x[k] for x in choices for k in ('sameMajor', 'any') if x.get(k)}
    parents = sorted({node.split('(', 1)[0] for node, value in lock['snapshots'].items()
                      for section in ('dependencies', 'optionalDependencies') if name in value.get(section, {})})
    return name, {'registry': 'https://registry.npmjs.org/' + urllib.parse.quote(name, safe=''),
                  'current': current, 'ranges': ranges, 'choices': choices, 'parents': parents,
                  'selected_metadata': {v: data['versions'][v] for v in selected}, 'response_sha256': hashlib.sha256(raw).hexdigest()}


def advisory(row):
    url = row['url']
    raw = fetch(url, 'text/html')
    parser = Text()
    parser.feed(raw.decode())
    text = '\n'.join(parser.parts)
    start = text.find('Affected versions')
    end = text.find('Published to the GitHub Advisory Database', start)
    text = text[start:end if end >= start else start+15000]
    return url.rsplit('/', 1)[-1], {'url': url, 'sha256': hashlib.sha256(raw).hexdigest(), 'text': text[:22000]}


if __name__ == '__main__':
    packages = {}
    sources = {}
    errors = []
    critical = {r['url']: r for rows in baseline['advisories'].values() for r in rows if r['severity'] == 'critical'}
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        futures = {pool.submit(package, item): item[0] for item in baseline['advisories'].items()}
        futures.update({pool.submit(advisory, row): url for url, row in critical.items()})
        for future in concurrent.futures.as_completed(futures):
            key = futures[future]
            try:
                result = future.result()
                if result:
                    target = sources if key.startswith('https:') else packages
                    target[result[0]] = result[1]
            except Exception as error:
                errors.append({'target': key, 'error': str(error)})
    output = {'baseline_lock_sha256': baseline['lock_sha256'], 'packages': packages, 'critical_sources': sources, 'errors': errors}
    (STAGE / 'official-metadata.local.json').write_text(json.dumps(output, indent=2))
    for name, value in sorted(packages.items()):
        print(name, value['choices'])
    print('critical sources', len(sources), 'errors', errors)
