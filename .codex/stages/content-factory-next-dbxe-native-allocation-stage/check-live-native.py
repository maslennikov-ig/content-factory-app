#!/usr/bin/env python3
"""Selected native identity, health, source and capacity. No host writes."""
import datetime
import hashlib
import json
from pathlib import Path
import subprocess
import urllib.request

stage = Path(__file__).resolve().parent
ssh = ['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=5', 'helixa-prod']

def remote(command, data=None):
    result = subprocess.run([*ssh, command], input=data, text=True, capture_output=True, timeout=45)
    if result.returncode:
        raise RuntimeError('Read-only host check failed: ' + result.stderr[-500:])
    return result.stdout.strip()

native = json.loads(remote('docker exec -i cf-next-app node', (stage / 'live-native.cjs').read_text()))
assert (native['node'], native['sharp'], native['vips']) == ('22.23.2', '0.35.5', '8.18.7')
assert native['addonHash'] == 'cf896cc1b7f3ae9c3e8eb3d7b2b198b8de2824ff7d0681d684bab5a825def335'
assert native['libvipsHash'] == '4aa73553408c3964071728f4a231a8e86918e39bc49f1fbae75355f7ea933ea9'
assert native['systemLibstdcppHash'] == 'e7848e32af4932840ba775169041759a2a8dd5a008af360e5c55bce506eebcf4'
assert native['nextSharpSameInstance']
assert not any(native[k] for k in ('preloadConfigured', 'libraryPathConfigured', 'vipsModulePathConfigured'))
assert len(native['roleOverrides']) == 3
assert {item['role'] for item in native['roleOverrides']} == {'backend', 'orchestrator', 'frontend'}
assert not any(item[k] for item in native['roleOverrides'] for k in ('preloadConfigured', 'libraryPathConfigured', 'vipsModulePathConfigured'))
application = json.loads(remote('docker inspect cf-next-app --format \'{"image":"{{.Config.Image}}","configDigest":"{{.Image}}","health":"{{.State.Health.Status}}","restarts":{{.RestartCount}},"memoryLimit":{{.HostConfig.Memory}}}\''))
assert application == {
    'image': 'ghcr.io/maslennikov-ig/content-factory-next:755d19fa731d',
    'configDigest': 'sha256:ea54f8c9ee610976cccaffb16a8cd860a85c67a9213a1d6a1ecd8d42113eec7f',
    'health': 'healthy', 'restarts': 0, 'memoryLimit': 1879048192,
}
remote('docker exec cf-next-app sh /app/var/docker/healthcheck.sh')
source = native['sourceManifest']
assert source['commit'] == '755d19fa731d524b151afe18c4394d8027030d58'
endpoints = []
for path in ('/api/', '/auth/login', '/api/public/source/version', '/api/public/source/archive'):
    request = urllib.request.Request('https://factory.aidevteam.ru' + path, headers={'Cache-Control': 'no-cache'})
    with urllib.request.urlopen(request, timeout=30) as response:
        data = response.read()
        assert response.status == 200
        if path.endswith('version'):
            assert json.loads(data)['commit'] == source['commit']
        if path.endswith('archive'):
            assert len(data) == source['bytes'] and hashlib.sha256(data).hexdigest() == source['sha256']
        endpoints.append({'path': path, 'status': response.status, 'bytes': len(data)})
free = int(remote('df -B1 --output=avail /srv').splitlines()[-1])
assert free > 6 * 1024 ** 3
assert remote('docker image inspect ghcr.io/maslennikov-ig/content-factory-next:cae3cd8340e0 --format "{{.Id}}"') == 'sha256:a70e865a332aeae3701bfabc5fbb97f9c9b1d04596ab64536fa3c8eef0e8a053'
result = {
    'capturedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'status': 'PASS', 'productionMutations': 0,
    'application': application, 'native': native, 'endpoints': endpoints,
    'nativeHealthExitCode': 0, 'hostFreeBytes': free, 'rollbackVerified': True,
    'sourceArchiveMatchesManifest': True,
    'boundary': 'Current native/image/source/worker availability only; no provider/model/client acceptance',
}
(stage / 'live-native.actual.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({k: result[k] for k in ('status', 'productionMutations', 'application', 'hostFreeBytes', 'nativeHealthExitCode')}))
