"""One root-owned dependency acceptance, with local loopback and inert fixtures."""
import hashlib
import json
import os
import pathlib
import socket
import subprocess
import time
import urllib.error
import urllib.request
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[3]
STAGE = pathlib.Path(__file__).resolve().parent
ENV = {**os.environ, 'PATH': '/home/me/.nvm/versions/node/v22.23.2/bin:' + os.environ['PATH'],
       'NEXT_TELEMETRY_DISABLED': '1', 'DO_NOT_TRACK': '1', 'NODE_OPTIONS': '--max-old-space-size=4096'}
checks = []
receipt = {'schema': 'cf-dependency-root-acceptance/v1', 'boundary': 'local-dependency/loopback/build; no release/deploy',
    'node': subprocess.check_output(['node','--version'], env=ENV, text=True).strip(),
    'pnpm': subprocess.check_output(['pnpm','--version'], env=ENV, text=True).strip(),
    'checks': checks, 'status': 'FAIL'}


def run(name, command, timeout=900):
    start = time.monotonic()
    with (STAGE / (name + '.local.log')).open('w') as output:
        result = subprocess.run(command, cwd=ROOT, env=ENV, stdout=output, stderr=subprocess.STDOUT, timeout=timeout)
    check = {'name': name, 'command': command, 'exitCode': result.returncode, 'seconds': round(time.monotonic()-start, 2)}
    checks.append(check)
    print(json.dumps(check), flush=True)
    if result.returncode:
        raise RuntimeError(name + ' failed')


def frontend_smoke():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    base = f'http://127.0.0.1:{port}'
    env = {**ENV, 'NODE_ENV':'production', 'FRONTEND_URL':base, 'BACKEND_INTERNAL_URL':'http://127.0.0.1:9',
           'NEXT_PUBLIC_BACKEND_URL':'http://127.0.0.1:9', 'MCP_ENABLED':'false'}
    with (STAGE/'next-start.local.log').open('w') as output:
        process = subprocess.Popen(['node', str(ROOT/'node_modules/next/dist/bin/next'), 'start', '--hostname',
            '127.0.0.1', '--port', str(port)], cwd=ROOT/'apps/frontend', env=env,
            stdout=output, stderr=subprocess.STDOUT, start_new_session=True)
        try:
            results = {}
            for _ in range(80):
                if process.poll() is not None:
                    raise RuntimeError('Owned Next process exited before readiness')
                try:
                    with urllib.request.urlopen(base+'/auth/login', timeout=3) as response:
                        page = response.read()
                        results['login'] = {'status': response.status, 'bytes':len(page)}
                    break
                except (OSError, urllib.error.URLError):
                    time.sleep(0.25)
            else:
                raise RuntimeError('Owned Next did not become ready')
            try:
                urllib.request.urlopen(base+'/_next/image?url=https%3A%2F%2Fexample.test%2Fimage.png&w=64&q=75',timeout=3)
                raise RuntimeError('Non-allowlisted remote image unexpectedly accepted')
            except urllib.error.HTTPError as error:
                results['remote_image'] = {'status':error.code,'body':error.read().decode()}
                if error.code != 400:
                    raise RuntimeError('Expected safe remote-image400')
            checks.append({'name':'built-next-loopback-smoke','results':results,'exitCode':0})
            print(json.dumps(checks[-1]), flush=True)
        finally:
            process.terminate()
            try: process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)
            receipt['ownedNextRemoved'] = True


SUITES = ['dependency-security.compatibility','mcp.e2e','mcp.server','mcp-oauth','mcp-confirmation',
    'mcp-consent.answer','mcp-discovery.nginx','agent-capabilities.mcp-redaction','backend-memory.mcp-lazy',
    'backend-memory.linkedin-pdf-lazy','media.upload-limit','media.upload-failure','upload-module.wiring',
    'frontend-upload-stream-lifetime','brand-voice.sample-files','brand-voice.materials','brand-voice.routes',
    'webhook.delivery.ssrf','server-url-ssrf','backend.cors','voice-stream-liveness','voice-analysis-stream',
    'new-launch.ndjson-splitter','adaptation-rich-text','adaptation-inline-marks','adaptation-editor.emoji',
    'editor-html.bold','editorial-stage.editor-wiring','image-editor.behavior','image-editor.engine',
    'temporal-contract-signature.guard','temporal.search.attributes','email-service-silent-vs-broken.guard',
    'email-configuration-checker-resend-key.guard','email-resend-provider-swallow.guard',
    'access-cookie-origin','access-public-policies','auth-middleware-membership','permissions.service']

def main():
    try:
        run('affected-acceptance', ['pnpm','exec','jest','--runInBand','--detectOpenHandles','--runTestsByPath',
            *[f'tests/{name}.test.cjs' for name in SUITES]], timeout=600)
        run('source-acceptance', ['node','--test','--test-concurrency=1','tests/content-source-registry.test.cjs',
            'tests/content-source-fetch-gateway.test.cjs','tests/content-search-evidence.test.cjs'], timeout=300)
        run('production-builds', ['pnpm','-r','--workspace-concurrency=1','--filter','./apps/frontend',
            '--filter','./apps/backend','--filter','./apps/orchestrator','--filter','./apps/commands','run','build'])
        run('extension-vite-build', ['pnpm','--filter','./apps/extension','exec','vite','build'], timeout=180)
        # The host has no zip command. Validate an actual standard ZIP artifact
        # without claiming that the unrelated shell packaging command passed.
        artifact = STAGE/'extension-bundle.local.zip'
        dist = ROOT/'apps/extension/dist'
        with zipfile.ZipFile(artifact, 'w', zipfile.ZIP_DEFLATED) as bundle:
            for file in dist.rglob('*'):
                if file.is_file():
                    bundle.write(file, file.relative_to(dist).as_posix())
            bundle.write(ROOT/'apps/extension/manifest.json', 'manifest.json')
        with zipfile.ZipFile(artifact) as bundle:
            assert bundle.testzip() is None
            assert bundle.read('manifest.json') == (ROOT/'apps/extension/manifest.json').read_bytes()
            assert bundle.read('background.js') == (dist/'background.js').read_bytes()
        checks.append({'name':'extension-python-zip','exitCode':0,
            'sha256':hashlib.sha256(artifact.read_bytes()).hexdigest(),'manifestAndBundleByteExact':True})
        frontend_smoke()
        receipt['inputs'] = {p:hashlib.sha256((ROOT/p).read_bytes()).hexdigest()
            for p in ['package.json','pnpm-lock.yaml','tests/dependency-security.compatibility.test.cjs']}
        receipt['status'] = 'PASS'
    except Exception as error:
        receipt['failure'] = str(error)
    finally:
        (STAGE/'root-acceptance.local.json').write_text(json.dumps(receipt,indent=2)+'\n')
        print(json.dumps({'status':receipt['status'],'failure':receipt.get('failure')}),flush=True)
        if receipt['status'] != 'PASS':
            raise SystemExit(1)

if __name__ == "__main__":
    main()
