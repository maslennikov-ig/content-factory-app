#!/usr/bin/env python3
"""One root-owned audit acceptance; never labels unresolved remediation passed."""
import hashlib,json,pathlib,subprocess
stage=pathlib.Path(__file__).resolve().parent
repo=stage.parents[2]
def read(path): return json.loads(path.read_text())
def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def check(condition,message):
    if not condition: raise RuntimeError(message)
baseline=read(stage/"baseline.actual.json")
records=read(stage/"baseline-os-records.actual.json")
check(sha(stage/"baseline-os-records.actual.json")==baseline["osSnapshotSha256"],"baseline changed")
metadata=read(stage/"research/metadata.actual.json")
triage=read(stage/"triage.actual.json")
check(sha(stage/"research/metadata.actual.json")==triage["metadataSha256"],"metadata changed")
originals={r["baselineRecordOrdinal"]:r["baselineRecord"] for v in metadata["vulnerabilities"] for r in v["baselineRecords"]}
check(set(originals)==set(range(1,117)),"metadata coverage incomplete")
check(all(originals[i]==r for i,r in enumerate(records,1)),"baseline metadata lost/rewritten")
check(len(triage["vulnerabilities"])==55,"CVE coverage incomplete")
check({v["cve"] for v in triage["vulnerabilities"]}=={v["cve"] for v in metadata["vulnerabilities"]},"CVE identities changed")
seen={}
for v in triage["vulnerabilities"]:
    for ordinal,record in zip(v["baselineOrdinals"],v["baselineRecords"],strict=True):
        check(ordinal not in seen and record==originals[ordinal],"triage record duplicate/loss")
        seen[ordinal]=record
    check(bool(v["officialSource"] and v["configuredCaller"] and v["affectedCondition"] and v["reevaluateWhen"]),"missing caller/source/trigger")
    check(v["fixApplied"] is False,"unexpected patch claim")
    if v["bookworm"]["fixed_version"] is not None:
        check(v["debianSourcePackage"] in ("openssl","pcre2","perl"),"unreviewed patch source")
        check(v["decision"]!="unresolved_native_risk_no_compatible_debian_fix","fixable risk left unidentified")
check(len(seen)==116,"triage record coverage incomplete")
check(triage["runtimeChanges"]==[],"unexpected runtime mutation")
prod=read(stage/"production-consumers.local.json")
native=read(stage/"native-baseline.local.json")
image_packages=native["results"][0]["stdout"].strip().splitlines()
prod_packages=prod["dpkg"].strip().splitlines()
check(sorted(image_packages)==sorted(prod_packages),"local/production package mismatch")
packages={x.split("\t")[0]:x.split("\t")[1:] for x in image_packages}
for v in triage["vulnerabilities"]:
    for record in v["baselineRecords"]:
        check(packages[record["package"]][0]==record["installedVersion"],"version mismatch")
        check(packages[record["package"]][1]==v["debianSourcePackage"],"source-package mismatch")
check(prod["node"]=="v22.23.2" and not prod["nodeSharedOpenSsl"] and prod["nodeOpenSsl"]=="3.5.7","Node baseline mismatch")
check({r["role"] for r in prod["roles"]}=={"backend","orchestrator","frontend","nginx"},"missing configured roles")
for name,fact in prod["fileFacts"].items():
    local=repo/('var/docker/nginx.conf' if name=='/etc/nginx/nginx.conf' else name.removeprefix('/app/'))
    check(sha(local)==fact["sha256"],"production source/config drift: "+name)
elf=read(stage/"elf-consumers.local.json")
check(elf["ownedContainerRemoved"] and len(elf["nativeDependencies"])==31,"incomplete native inventory/cleanup")
allocator=next(v for v in elf["symbols"] if v["file"].endswith("libstdc++.so.6"))
check(not allocator["alignedNewCallsPosixMemalign"],"allocator evidence changed")
check(sha(stage/"aligned-new-disassembly.local.txt")==allocator["disassemblySha256"],"disassembly changed")
check(any(v["alignedNewImports"] for v in elf["symbols"] if 'sharp-libvips-linux-x64' in v["file"]),"missing actual native consumer")
probe=read(stage/"aligned-new-probe.actual.json")
check(probe["normalAllocation"] and not probe["oversizedRejected"] and probe["writesBeyondAllocation"]==0,"native primitive finding not reproduced")
check(probe["ownedFixtureAutoRemoved"],"probe cleanup missing")
sharp=read(stage/"sharp-native.actual.json"); check(sharp["status"]=="PASS" and sharp["ownedFixtureAutoRemoved"],"native conversion failed")
runtime=read(stage/"runtime-readonly.local.json");check(runtime["status"]=="PASS" and runtime["productionMutations"]==0 and runtime["nativeHealthExitCode"]==0,"current runtime unavailable")
check(runtime["application"]["configDigest"]==triage["configDigest"],"wrong current image")
check(runtime["hostFreeBytes"]>6*1024**3,"host capacity insufficient")
release=read(repo/".codex/stages/content-factory-next-dbxe-delivery-20261010/delivery.actual.json")
check(runtime["sourceManifest"]==release["image"]["sourceArchive"],"source archive drift")
check(runtime["application"]["configDigest"]==release["image"]["platformConfigDigest"],"exact release identity mismatch")
current=subprocess.check_output(['git','diff','--name-only','d724f3b792f4518eebc04c854448904f565323fd'],cwd=repo,text=True).splitlines()
check(all(p.startswith('.codex/') or p.startswith('docs/') for p in current),"runtime/product diff requires a fresh release")
children=read_json=None
children=json.loads(subprocess.check_output(['bd','list','--all','--parent','content-factory-next-dbxe','--limit','100','--json'],cwd=repo,text=True))
epic=json.loads(subprocess.check_output(['bd','show','content-factory-next-dbxe','--json'],cwd=repo,text=True))[0]
byid={v['id']:v for v in [epic,*children]}
snapshot=read(repo/'.codex/goals/content-factory-next-dbxe/scope-criterion-snapshot.json')
for criterion in snapshot['criteria']:
    bead=criterion['criterion_id'].removeprefix('AC-')
    text=byid[bead]['acceptance_criteria'];check(text==criterion['text'] and hashlib.sha256(text.encode()).hexdigest()==criterion['text_digest'],'original requirement changed: '+bead)
check(byid['content-factory-next-dbxe.33']['acceptance_criteria']==baseline['selectedTask']['acceptanceCriteria'],'selected requirement changed')
check(byid['content-factory-next-dbxe.33']['status']=='in_progress','unresolved33 falsely closed')
check(byid['content-factory-next-dbxe.35']['status']=='open','remaining native risk lost')
check(byid['content-factory-next-dbxe.34']['status']=='open' and byid['content-factory-next-dbxe.8']['status']=='in_progress' and epic['status']=='open','unselected scope/epic falsely closed')
(stage/'scope-final.local.json').write_text(json.dumps({'originalCriteriaPreserved':len(snapshot['criteria']),'statuses':{k:byid[k]['status'] for k in ('content-factory-next-dbxe','content-factory-next-dbxe.8','content-factory-next-dbxe.33','content-factory-next-dbxe.34','content-factory-next-dbxe.35')},'children':len(children),'closedChildren':sum(v['status']=='closed' for v in children)},indent=2)+'\n')
print(json.dumps({'auditVerification':'PASS','remediation':'OPEN native35/33 and global34','records':116,'cves':55,'originalCriteriaPreserved':len(snapshot['criteria']),'productionMutations':0,'freshRuntime':'PASS','nativePrimitive':'defect reproduced without out-of-bounds writes','hostileImageReachability':'UNKNOWN'}))
