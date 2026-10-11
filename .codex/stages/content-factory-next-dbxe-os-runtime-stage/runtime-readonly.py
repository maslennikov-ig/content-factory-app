#!/usr/bin/env python3
"""Current serving image/source/health/capacity; no host mutation or secrets."""
import datetime,hashlib,json,subprocess,urllib.request
from pathlib import Path
stage=Path(__file__).resolve().parent
ssh=["ssh","-o","BatchMode=yes","-o","ConnectTimeout=5","helixa-prod"]
def remote(command):
    r=subprocess.run([*ssh,command],capture_output=True,text=True,timeout=45)
    if r.returncode:raise RuntimeError("read-only host check failed: "+r.stderr[-400:])
    return r.stdout.strip()
app=json.loads(remote("docker inspect cf-next-app --format '{\"id\":\"{{.Id}}\",\"image\":\"{{.Config.Image}}\",\"configDigest\":\"{{.Image}}\",\"health\":\"{{.State.Health.Status}}\",\"restarts\":{{.RestartCount}},\"memoryLimit\":{{.HostConfig.Memory}},\"healthTest\":{{json .Config.Healthcheck.Test}}}'"))
assert app["image"]=="ghcr.io/maslennikov-ig/content-factory-next:755d19fa731d"
assert app["configDigest"]=="sha256:ea54f8c9ee610976cccaffb16a8cd860a85c67a9213a1d6a1ecd8d42113eec7f"
assert app["health"]=="healthy" and app["restarts"]==0 and app["memoryLimit"]==1879048192
assert app["healthTest"]==["CMD-SHELL","sh /app/var/docker/healthcheck.sh"]
remote("docker exec cf-next-app sh /app/var/docker/healthcheck.sh")
manifest=json.loads(remote("docker exec cf-next-app node -e 'console.log(JSON.stringify(require(\"/app/var/source/source.json\")))'"))
assert manifest["commit"]=="755d19fa731d524b151afe18c4394d8027030d58"
checks=[]
for path in ("/api/","/auth/login","/api/public/source/version","/api/public/source/archive"):
    with urllib.request.urlopen(urllib.request.Request("https://factory.aidevteam.ru"+path,headers={"Cache-Control":"no-cache"}),timeout=30) as r:
        h=hashlib.sha256();size=0;data=b""
        while chunk:=r.read(1024*1024):
            h.update(chunk);size+=len(chunk)
            if path.endswith("version"):data+=chunk
        if data:assert json.loads(data)["commit"]==manifest["commit"]
        if path.endswith("archive"):assert h.hexdigest()==manifest["sha256"] and size==manifest["bytes"]
        checks.append({"path":path,"status":r.status,"bytes":size,"sha256":h.hexdigest() if path.endswith("archive") else None})
foreign=sorted(remote("docker ps -aq --no-trunc").split());local=sorted(subprocess.check_output(["docker","ps","-aq","--no-trunc"],text=True).split())
capacity=remote("df -B1 --output=avail /srv").splitlines()[-1].strip()
assert int(capacity)>6*1024**3
rollback=remote("docker image inspect ghcr.io/maslennikov-ig/content-factory-next:cae3cd8340e0 --format '{{.Id}}'")
assert rollback=="sha256:a70e865a332aeae3701bfabc5fbb97f9c9b1d04596ab64536fa3c8eef0e8a053"
result={"capturedAt":datetime.datetime.now(datetime.timezone.utc).isoformat(),"status":"PASS", "productionMutations":0,"application":app,"sourceManifest":manifest,"endpoints":checks,
    "hostFreeBytes":int(capacity),"rollbackConfigDigest":rollback,"productionContainerIds":foreign,"localContainerIds":local,
    "nativeHealthExitCode":0,"boundary":"Current serving image/worker readiness/public login/source availability, not provider/model/client acceptance"}
(stage/"runtime-readonly.local.json").write_text(json.dumps(result,indent=2)+"\n")
print(json.dumps({k:v for k,v in result.items() if k not in ("productionContainerIds","localContainerIds")}))
