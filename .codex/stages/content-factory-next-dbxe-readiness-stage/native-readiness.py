"""One root-owned bounded native readiness acceptance; no production resources."""
import argparse
import datetime
import hashlib
import json
import pathlib
import re
import secrets
import shutil
import subprocess
import tempfile
import time

stage = pathlib.Path(__file__).resolve().parent
repo = stage.parents[2]
parser = argparse.ArgumentParser()
parser.add_argument("--output", type=pathlib.Path)
parser.add_argument("--validate-only", action="store_true")
arguments = parser.parse_args()
if not arguments.validate_only and arguments.output is None:
    parser.error("--output is required for native acceptance")
output = arguments.output.resolve() if arguments.output else None
if output and (output.parent != stage or output.exists()):
    raise RuntimeError("output_must_be_new_file_in_own_stage")

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def tree_digest(files):
    return hashlib.sha256(json.dumps(files, sort_keys=True, separators=(",", ":")).encode()).hexdigest()

manifest_path = stage / "build-manifest.local.json"
manifest = json.loads(manifest_path.read_text())
if manifest.get("status") != "compiled":
    raise RuntimeError("passing_compiler_manifest_required")
compiled = pathlib.Path(manifest["compiled_directory"]).resolve()
if compiled != stage / "compiled":
    raise RuntimeError("unexpected_compiled_directory")
for name, expected in manifest["source_files"].items():
    path = (repo / name).resolve()
    if not path.is_relative_to(repo) or digest(path) != expected:
        raise RuntimeError("source_changed_since_compile:" + name)
compiled_files = {str(path.relative_to(compiled)): digest(path)
                  for path in compiled.rglob("*") if path.is_file() and path.suffix != ".tsbuildinfo"}
if compiled_files != manifest["compiled_files"]:
    raise RuntimeError("compiled_tree_changed_since_compile")
dockerfile = (repo / "Dockerfile").read_text()
health = re.search(r"(?m)^HEALTHCHECK[^\n]*\\\n[ \t]+CMD [^\n]+", dockerfile)
if not health or health.group(0).splitlines()[-1].strip() != "CMD sh /app/var/docker/healthcheck.sh":
    raise RuntimeError("unexpected_production_health_instruction")
base_image = "ghcr.io/maslennikov-ig/content-factory-next:cae3cd8340e0"
base_id = "sha256:53cefe055fa9c3a2559afbb2f029932836d391715c53805132c1ac246ea669b0"
token = secrets.token_hex(5)
prefix = "cf-readiness-" + token
label = "content-factory.readiness"
network = prefix + "-net"
candidate = prefix + ":local"
created = []
network_id = None
candidate_id = None
redactions = set()
result = {"schema": "cf-native-readiness/v1", "status": "incomplete",
          "started_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
          "source_head": manifest["base_head"], "build_manifest_sha256": digest(manifest_path),
          "runner_sha256": digest(pathlib.Path(__file__)),
          "acceptance_command": ["python3", str(pathlib.Path(__file__)), "--output", str(output)],
          "source_files": manifest["source_files"], "compiled_tree_sha256": tree_digest(compiled_files),
          "temporal_dependencies": manifest["temporal_dependencies"], "base_image": base_image,
          "production_mutations": 0, "external_calls_permitted": False,
          "fresh_database": True, "backup_restored": False, "resources": []}

def scrub(value):
    for private in sorted(redactions, key=len, reverse=True):
        value = value.replace(private, "[owned-fixture-redacted]")
    return value

def run(args, timeout=60, check=True):
    process = subprocess.run(args, text=True, capture_output=True, timeout=timeout)
    if check and process.returncode:
        raise RuntimeError("command_failed:" + args[0] + ":" + scrub(process.stderr[-1200:]))
    return process

def docker(*args, timeout=60, check=True):
    return run(["docker", *args], timeout, check)

def inventory():
    return {
        "containers": set(docker("ps", "-aq", "--no-trunc").stdout.split()),
        "networks": set(docker("network", "ls", "--quiet", "--no-trunc").stdout.split()),
        "images": set(docker("image", "ls", "--quiet", "--no-trunc").stdout.split()),
    }

def checkpoint(name):
    print(json.dumps({"phase": name}), flush=True)

def wait_for(check, seconds, label_name):
    until = time.monotonic() + seconds
    while time.monotonic() < until:
        if check():
            return
        time.sleep(1)
    raise RuntimeError("timeout:" + label_name)

def create(role, image, options=(), command=()):
    name = prefix + "-" + role
    entry = {"role": role, "name": name, "id": None}
    created.append(entry)
    cid = docker("run", "-d", "--name", name, "--label", label + "=" + token,
                 "--network", network, "--network-alias", "cf-readiness-" + role,
                 *options, image, *command).stdout.strip()
    entry["id"] = cid
    result["resources"].append(entry.copy())
    return name

def exec_node(app, code, timeout=30, check=True):
    return docker("exec", app, "node", "-e", code, timeout=timeout, check=check)

context = docker("context", "show").stdout.strip()
endpoint = docker("context", "inspect", context, "--format", "{{.Endpoints.docker.Host}}").stdout.strip()
if context not in {"default", "desktop-linux"} or not endpoint.startswith(("unix://", "npipe://")):
    raise RuntimeError("local_docker_context_required")
observed_base = docker("image", "inspect", "--format", "{{.Id}}", base_image).stdout.strip()
if observed_base != base_id:
    raise RuntimeError("pinned_native_base_image_mismatch")
result["docker_context"] = context
result["base_image_id"] = observed_base
if arguments.validate_only:
    print(json.dumps({"status": "preflight_pass", "source_files": len(manifest["source_files"]),
                      "compiled_files": len(compiled_files), "compiled_tree_sha256": result["compiled_tree_sha256"],
                      "base_image_id": observed_base, "resources_created": 0}))
    raise SystemExit(0)
before = inventory()
result["foreign_inventory_before"] = {key: sorted(value) for key, value in before.items()}

try:
    checkpoint("build_owned_derivative")
    with tempfile.TemporaryDirectory(prefix=prefix + "-", dir="/tmp") as temporary:
        context_path = pathlib.Path(temporary)
        shutil.copytree(compiled, context_path / "orchestrator-dist",
                        ignore=shutil.ignore_patterns("*.tsbuildinfo"))
        shutil.copy2(repo / "var/docker/healthcheck.sh", context_path / "healthcheck.sh")
        candidate_dockerfile = (
            "FROM " + base_image + "\n"
            # Removal happens only in this new derivative, never in the base or a running container.
            "RUN rm -rf /app/apps/orchestrator/dist\n"
            "COPY orchestrator-dist/ /app/apps/orchestrator/dist/\n"
            "COPY healthcheck.sh /app/var/docker/healthcheck.sh\n" + health.group(0) + "\n"
        )
        (context_path / "Dockerfile").write_text(candidate_dockerfile)
        (stage / (prefix + "-Dockerfile.local.txt")).write_text(candidate_dockerfile)
        build = docker("build", "--network=none", "--pull=false", "--label", label + "=" + token,
                       "--tag", candidate, "--iidfile", str(context_path / "image.id"),
                       str(context_path), timeout=90, check=False)
        (stage / (prefix + "-image-build.local.log")).write_text(scrub(build.stdout + build.stderr))
        if build.returncode:
            raise RuntimeError("owned_derivative_build_failed")
        candidate_id = (context_path / "image.id").read_text().strip()
        result["candidate_image"] = candidate
        result["candidate_image_id"] = candidate_id
        metadata = json.loads(docker("image", "inspect", "--format",
            '{"id":{{json .Id}},"health":{{json .Config.Healthcheck}},"ownership":{{json .Config.Labels}}}',
            candidate).stdout)
        if metadata["id"] != candidate_id or metadata["ownership"].get(label) != token:
            raise RuntimeError("candidate_image_ownership_mismatch")
        result["candidate_healthcheck"] = metadata["health"]
        expected_health = ["CMD-SHELL", health.group(0).splitlines()[-1].strip()[4:]]
        if metadata["health"]["Test"] != expected_health:
            raise RuntimeError("candidate_health_instruction_mismatch")

        docker("network", "create", "--internal", "--label", label + "=" + token, network)
        network_meta = json.loads(docker("network", "inspect", network).stdout)[0]
        network_id = network_meta["Id"]
        if not network_meta["Internal"] or network_meta["Labels"].get(label) != token:
            raise RuntimeError("internal_network_ownership_mismatch")
        result["network_internal"] = True
        pg = create("pg", "postgres:17-alpine", ("--memory", "384m", "--tmpfs", "/var/lib/postgresql/data",
            "-e", "POSTGRES_USER=readiness", "-e", "POSTGRES_PASSWORD=readiness_disposable",
            "-e", "POSTGRES_DB=readiness_app"))
        redactions.add("readiness_disposable")
        create("redis", "redis:7.2-alpine", ("--memory", "64m"),
               ("redis-server", "--save", "", "--appendonly", "no"))
        wait_for(lambda: docker("exec", pg, "pg_isready", "-U", "readiness", check=False).returncode == 0,
                 45, "owned_postgres_ready")
        create("temporal", "temporalio/auto-setup:1.28.1", ("--memory", "768m",
            "-e", "DB=postgres12", "-e", "DB_PORT=5432", "-e", "POSTGRES_USER=readiness",
            "-e", "POSTGRES_PWD=readiness_disposable", "-e", "POSTGRES_SEEDS=cf-readiness-pg",
            "-e", "DBNAME=readiness_temporal", "-e", "VISIBILITY_DBNAME=readiness_visibility",
            "-e", "DEFAULT_NAMESPACE=default", "-e", "DEFAULT_NAMESPACE_RETENTION=24h", "-e", "ENABLE_ES=false"))
        jwt = secrets.token_hex(32)
        redactions.add(jwt)
        env = {
            "DATABASE_URL": "postgresql://readiness:readiness_disposable@cf-readiness-pg:5432/readiness_app?connection_limit=5",
            "MASTRA_DATABASE_URL": "postgresql://readiness:readiness_disposable@cf-readiness-pg:5432/readiness_app?connection_limit=5",
            "REDIS_URL": "redis://cf-readiness-redis:6379", "TEMPORAL_ADDRESS": "cf-readiness-temporal:7233",
            "TEMPORAL_NAMESPACE": "default", "TEMPORAL_TLS": "false", "TEMPORAL_API_KEY": "",
            "EXCLUDE_QUEUE": "", "JWT_SECRET": jwt, "MAIN_URL": "http://localhost:5000",
            "FRONTEND_URL": "http://localhost:5000", "NEXT_PUBLIC_BACKEND_URL": "http://localhost:5000/api",
            "BACKEND_INTERNAL_URL": "http://localhost:3000", "STORAGE_PROVIDER": "local",
            "UPLOAD_DIRECTORY": "/uploads", "NEXT_PUBLIC_UPLOAD_DIRECTORY": "/uploads",
            "NODE_ENV": "production", "IS_GENERAL": "true", "DO_NOT_TRACK": "1",
            "NEXT_TELEMETRY_DISABLED": "1", "DISABLE_REGISTRATION": "true",
            "SENTRY_DSN": "", "SENTRY_ENVIRONMENT": "readiness-isolated",
        }
        envfile = context_path / "app.env"
        envfile.write_text("\n".join(key + "=" + value for key, value in env.items()) + "\n")
        envfile.chmod(0o600)
        schema_engine = repo / "node_modules/@prisma/engines/schema-engine-debian-openssl-3.0.x"
        if digest(schema_engine) != "431f23f13da76244d6cffe1b7a8d80f544e0812eed009492cf545f220d88a4b2":
            raise RuntimeError("verified_disposable_schema_engine_mismatch")
        schema = repo / "libraries/nestjs-libraries/src/database/prisma/schema.prisma"
        result["disposable_schema_sha256"] = digest(schema)
        initializer = create("initializer", candidate, ("--memory", "512m", "--env-file", str(envfile),
            "-v", str(schema_engine) + ":/readiness/schema-engine:ro",
            "-v", str(schema) + ":/readiness/schema.prisma:ro",
            "-e", "PRISMA_SCHEMA_ENGINE_BINARY=/readiness/schema-engine",
            "-e", "PRISMA_QUERY_ENGINE_LIBRARY=/app/node_modules/.prisma/client/libquery_engine-debian-openssl-3.0.x.so.node",
            "--entrypoint", "sh"), ("-c", "/app/node_modules/.bin/prisma db push --skip-generate --schema /readiness/schema.prisma"))
        if docker("wait", initializer, timeout=90).stdout.strip() != "0":
            raise RuntimeError("fresh_disposable_schema_initialization_failed")
        result["disposable_schema_initialized"] = True
        checkpoint("start_owned_native_app")
        app = create("app", candidate, ("--memory", "1792m", "--memory-swap", "1792m",
                                      "--env-file", str(envfile), "-v", str(envfile) + ":/app/.env:ro"))
        app_meta = json.loads(docker("inspect", "--format",
            '{"memory":{{.HostConfig.Memory}},"swap":{{.HostConfig.MemorySwap}},'
            '"ports":{{json .HostConfig.PortBindings}},"health":{{json .Config.Healthcheck}}}', app).stdout)
        if app_meta["memory"] != 1792 * 1024 * 1024 or app_meta["swap"] != 1792 * 1024 * 1024 or app_meta["ports"]:
            raise RuntimeError("native_fixture_cap_or_ports_changed")
        if app_meta["health"]["Test"] != expected_health:
            raise RuntimeError("running_container_health_instruction_mismatch")
        result["native_app_configuration"] = app_meta
        version_code = "console.log(JSON.stringify(Object.fromEntries(['@temporalio/client','@temporalio/worker','nestjs-temporal-core'].map(n=>[n,require(n+'/package.json').version]))))"
        versions = json.loads(exec_node(app, version_code).stdout)
        if versions != manifest["temporal_dependencies"]:
            raise RuntimeError("inherited_temporal_dependency_version_mismatch")
        result["inherited_temporal_dependencies"] = versions
        tree_code = (
            "const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');"
            "const base='/app/apps/orchestrator/dist',files={};"
            "function scan(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){"
            "const p=path.join(dir,e.name);if(e.isDirectory())scan(p);else if(e.isFile())"
            "files[path.relative(base,p)]=crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')}}"
            "scan(base);const ordered=Object.fromEntries(Object.entries(files).sort(([a],[b])=>a.localeCompare(b,'en')));"
            "console.log(JSON.stringify({files,health:crypto.createHash('sha256').update(fs.readFileSync('/app/var/docker/healthcheck.sh')).digest('hex')}));"
        )
        copied = json.loads(exec_node(app, tree_code).stdout)
        if copied["files"] != compiled_files or copied["health"] != digest(repo / "var/docker/healthcheck.sh"):
            raise RuntimeError("candidate_current_module_hash_mismatch")
        result["candidate_current_modules_match"] = True
        result["candidate_health_script_sha256"] = copied["health"]

        def http_probe(url):
            probe = docker("exec", app, "curl", "-sS", "--max-time", "3", "-w", "\n%{http_code}", url, check=False)
            body, _, status = probe.stdout.rpartition("\n")
            return {"status": int(status) if status.isdigit() else 0,
                    "body": body, "curl_exit": probe.returncode}

        def api():
            return http_probe("http://127.0.0.1:5000/api/")

        def ready():
            return http_probe("http://127.0.0.1:3002/health/status")

        def image_health():
            test = app_meta["health"]["Test"]
            command = ["sh", "-c", test[1]] if test[0] == "CMD-SHELL" else test[1:]
            started = time.monotonic()
            probe = docker("exec", app, *command, timeout=7, check=False)
            return {"command": test, "exit": probe.returncode, "elapsed_ms": round((time.monotonic() - started) * 1000)}

        wait_for(lambda: api()["status"] == 200, 180, "native_api_liveness")
        wait_for(lambda: ready()["status"] == 200, 120, "native_idle_worker_readiness")
        pm2_code = "const p=require('/usr/local/lib/node_modules/pm2');p.connect(e=>{if(e)throw e;p.list((e,l)=>{if(e)throw e;console.log(JSON.stringify(l.map(x=>({name:x.name,pid:x.pid,status:x.pm2_env.status,restarts:x.pm2_env.restart_time}))));p.disconnect()})})"
        initial = json.loads(exec_node(app, pm2_code).stdout)
        orchestrator = next(entry for entry in initial if entry["name"] == "orchestrator")
        if orchestrator["status"] != "online":
            raise RuntimeError("native_orchestrator_not_online")
        result["pm2_before"] = initial
        client_begin = "const {Connection,Client}=require('@temporalio/client');(async()=>{const c=await Connection.connect({address:process.env.TEMPORAL_ADDRESS});const client=new Client({connection:c,namespace:'default'});try{"
        client_end = "}finally{await c.close()}})().catch(e=>{console.error(e.name);process.exitCode=1})"
        queue_code = (
            "const mod=require('/app/apps/orchestrator/dist/libraries/nestjs-libraries/src/temporal/temporal.module');"
            "const {TEMPORAL_MODULE_OPTIONS}=require('nestjs-temporal-core');"
            "const registered=mod.getTemporalModule(true,'/owned/workflows',[]);"
            "const options=registered.providers.find(p=>p.provide===TEMPORAL_MODULE_OPTIONS).useValue;"
            "console.log(JSON.stringify(options.workers.map(w=>({name:w.taskQueue,workflow:!!w.workflowsPath}))));"
        )
        queues = json.loads(exec_node(app, queue_code).stdout)
        if len(queues) != 33 or len({queue["name"] for queue in queues}) != 33 or [q["name"] for q in queues if q["workflow"]] != ["main"]:
            raise RuntimeError("expected_32_provider_plus_main_placement_changed")
        result["configured_queues"] = queues

        def pollers(pid):
            # Identity comes from installed SDK1.15.0 defaultWorkerOptions:
            # process.pid + '@' + os.hostname(), unchanged core registration.
            code = client_begin + "const identity=" + str(pid) + "+'@'+require('node:os').hostname();const checks=[];"
            code += "for(const q of " + json.dumps(queues) + "){for(const type of(q.workflow?[1,2]:[2])){"
            code += "const r=await c.withDeadline(Date.now()+2000,()=>c.workflowService.describeTaskQueue({namespace:'default',taskQueue:{name:q.name},taskQueueType:type}));"
            code += "const p=(r.pollers||[]).filter(x=>x.identity===identity);"
            code += "const ages=p.map(x=>Date.now()-(Number(x.lastAccessTime.seconds.toString())*1000+(x.lastAccessTime.nanos||0)/1000000));"
            code += "checks.push({queue:q.name,type,currentIdentityPollers:p.length,agesMs:ages});}}console.log(JSON.stringify(checks));" + client_end
            return json.loads(exec_node(app, code, timeout=60).stdout)

        idle = pollers(orchestrator["pid"])
        if len(idle) != 34 or any(not entry["currentIdentityPollers"] or not any(0 <= age <= 120000 for age in entry["agesMs"]) for entry in idle):
            raise RuntimeError("native_idle_required_pollers_missing_or_stale")
        result["idle_pollers"] = idle
        result["api_before"] = api()
        result["readiness_before"] = ready()
        result["health_before"] = image_health()
        if result["health_before"]["exit"] != 0:
            raise RuntimeError("native_idle_health_command_refused")
        checkpoint("stop_only_owned_worker")
        exec_node(app, "const p=require('/usr/local/lib/node_modules/pm2');p.connect(e=>{if(e)throw e;p.stop('orchestrator',e=>{p.disconnect();if(e)throw e;console.log('stopped')})})")
        wait_for(lambda: ready()["status"] != 200, 10, "stopped_worker_readiness_refusal")
        result["pm2_stopped"] = json.loads(exec_node(app, pm2_code).stdout)
        result["api_while_worker_stopped"] = api()
        result["readiness_while_worker_stopped"] = ready()
        result["health_while_worker_stopped"] = image_health()
        if result["api_while_worker_stopped"]["status"] != 200 or result["health_while_worker_stopped"]["exit"] == 0:
            raise RuntimeError("stopped_worker_not_visible_with_live_api")
        workflow_id = prefix + "-missing-integration"
        start_code = client_begin + "const h=await client.workflow.start('refreshTokenWorkflow',{workflowId:" + json.dumps(workflow_id)
        start_code += ",taskQueue:'main',args:[{organizationId:'readiness-missing-org',integrationId:'readiness-missing-integration'}]});console.log(JSON.stringify({workflowId:h.workflowId,runId:h.firstExecutionRunId}));" + client_end
        result["queued_while_worker_stopped"] = json.loads(exec_node(app, start_code).stdout)
        history_code = client_begin + "const h=client.workflow.getHandle(" + json.dumps(workflow_id) + ");const d=await h.describe();const history=await h.fetchHistory();"
        history_code += "console.log(JSON.stringify({status:d.status.name,eventCount:history.events.length,completedEvents:history.events.filter(e=>e.workflowExecutionCompletedEventAttributes).length,activityCompletions:history.events.filter(e=>e.activityTaskCompletedEventAttributes).length}));" + client_end
        result["pending_history"] = json.loads(exec_node(app, history_code).stdout)
        if result["pending_history"]["status"] != "RUNNING" or result["pending_history"]["activityCompletions"] != 0:
            raise RuntimeError("owned_safe_workflow_not_pending")
        checkpoint("restart_worker_and_resume_owned_workflow")
        exec_node(app, "const p=require('/usr/local/lib/node_modules/pm2');p.connect(e=>{if(e)throw e;p.start('orchestrator',e=>{p.disconnect();if(e)throw e;console.log('started')})})")
        wait_for(lambda: ready()["status"] == 200, 120, "restarted_worker_readiness")
        result["pm2_restarted"] = json.loads(exec_node(app, pm2_code).stdout)
        restarted = next(entry for entry in result["pm2_restarted"] if entry["name"] == "orchestrator")
        if restarted["status"] != "online" or restarted["pid"] == orchestrator["pid"]:
            raise RuntimeError("owned_native_worker_not_restarted")
        result["restarted_pollers"] = pollers(restarted["pid"])
        if any(not entry["currentIdentityPollers"] or not any(0 <= age <= 120000 for age in entry["agesMs"]) for entry in result["restarted_pollers"]):
            raise RuntimeError("restarted_current_identity_pollers_missing")
        value_code = client_begin + "const h=client.workflow.getHandle(" + json.dumps(workflow_id) + ");"
        value_code += "const value=await Promise.race([h.result(),new Promise((_,reject)=>{const t=setTimeout(()=>reject(Error('owned_result_timeout')),45000);t.unref()})]);console.log(JSON.stringify({value}));" + client_end
        result["resumed_workflow_result"] = json.loads(exec_node(app, value_code, timeout=50).stdout)
        result["completed_history"] = json.loads(exec_node(app, history_code).stdout)
        if result["resumed_workflow_result"] != {"value": False} or result["completed_history"]["status"] != "COMPLETED" or result["completed_history"]["activityCompletions"] != 1:
            raise RuntimeError("owned_pending_read_only_workflow_did_not_resume")
        result["api_after"] = api()
        result["readiness_after"] = ready()
        result["health_after"] = image_health()
        if result["api_after"]["status"] != 200 or result["readiness_after"]["status"] != 200 or result["health_after"]["exit"] != 0:
            raise RuntimeError("readiness_or_native_health_did_not_recover")
        result["status"] = "pass"
        result["limits"] = [
            "Bounded derivative with current complete orchestrator dist; inherited backend supplies API liveness.",
            "Inherited SDK/core versions match installed versions; source/dist/image hashes match.",
            "Pending missing-integration workflow resumes its read-only DB activity; no provider effect is claimed.",
            "No full release/task8, production deployment, host recovery or client acceptance.",
        ]
except Exception as error:
    result["status"] = "failed"
    result["error_type"] = type(error).__name__
    result["error"] = scrub(str(error))[-1800:]
    for entry in created:
        if entry["role"] in {"app", "temporal", "initializer"}:
            logs = docker("logs", "--tail", "80", entry["id"] or entry["name"], check=False)
            (stage / (prefix + "-" + entry["role"] + ".local.log")).write_text(scrub(logs.stdout + logs.stderr))
finally:
    checkpoint("cleanup_exact_owned_resources")
    cleanup = []
    for entry in reversed(created):
        selected = entry["id"] or entry["name"]
        owned = docker("inspect", "--format", "{{index .Config.Labels \"" + label + "\"}}", selected, check=False)
        if owned.returncode == 0 and owned.stdout.strip() == token:
            removed = docker("rm", "-f", selected, check=False).returncode == 0
            cleanup.append({"id": selected, "removed": removed})
        else:
            cleanup.append({"id": selected, "removed": False, "already_absent": owned.returncode != 0})
    result["cleanup"] = cleanup
    selected_network = network_id or network
    meta = docker("network", "inspect", selected_network, check=False)
    result["network_removed"] = meta.returncode != 0
    if meta.returncode == 0 and (json.loads(meta.stdout)[0].get("Labels") or {}).get(label) == token:
        result["network_removed"] = docker("network", "rm", selected_network, check=False).returncode == 0
    own_image = docker("image", "inspect", candidate, check=False)
    result["candidate_image_removed"] = own_image.returncode != 0
    if own_image.returncode == 0:
        image_meta = json.loads(own_image.stdout)[0]
        if (image_meta["Config"].get("Labels") or {}).get(label) == token and (candidate_id is None or image_meta["Id"] == candidate_id):
            result["candidate_image_removed"] = docker("image", "rm", candidate, check=False).returncode == 0
    after = inventory()
    result["foreign_inventory_preserved"] = {key: before[key].issubset(after[key]) for key in before}
    result["owned_containers_remaining"] = docker("ps", "-aq", "--filter", "label=" + label + "=" + token).stdout.split()
    if (any(not entry["removed"] and not entry.get("already_absent") for entry in cleanup)
            or not result["network_removed"] or not result["candidate_image_removed"]
            or result["owned_containers_remaining"] or not all(result["foreign_inventory_preserved"].values())):
        result["status"] = "failed"
        result["cleanup_failed"] = True
    result["finished_at"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    with output.open("x") as file:
        json.dump(result, file, indent=2)
    print(json.dumps({"status": result["status"], "output": str(output),
                      "cleanup_failed": result.get("cleanup_failed", False)}), flush=True)
if result["status"] != "pass":
    raise SystemExit(1)
