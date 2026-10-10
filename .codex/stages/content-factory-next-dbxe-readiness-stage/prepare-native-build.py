"""Compile the current orchestrator with its installed Nest alias transformer."""
import hashlib
import json
import os
import pathlib
import subprocess
import sys

stage = pathlib.Path(__file__).resolve().parent
repo = stage.parents[2]
compiled = stage / "compiled"
node_bin = "/home/me/.nvm/versions/node/v22.23.2/bin"
environment = {**os.environ, "PATH": node_bin + ":" + os.environ["PATH"],
               "NODE_OPTIONS": "--max-old-space-size=4096"}
config = stage / "native-tsconfig.local.json"
config.write_text(json.dumps({
    "extends": str(repo / "apps/orchestrator/tsconfig.build.json"),
    "include": [str(repo / "apps/orchestrator/src/**/*.ts")],
    "compilerOptions": {"outDir": str(compiled),
                        "tsBuildInfoFile": str(compiled / "orchestrator.tsbuildinfo")},
}, indent=2) + "\n")
if compiled.is_symlink():
    raise RuntimeError("owned_compile_directory_must_not_be_a_symlink")

def capture(args, cwd=repo):
    return subprocess.check_output(args, cwd=cwd, env=environment, text=True).strip()

versions = {"node": capture(["node", "--version"]), "pnpm": capture(["pnpm", "--version"])}
if versions != {"node": "v22.23.2", "pnpm": "10.6.1"}:
    raise RuntimeError("compile_toolchain_mismatch")
cwd = repo / "apps/orchestrator"
command = ["pnpm", "exec", "nest", "build", "--path", os.path.relpath(config, cwd)]
log = stage / "orchestrator-compile-relative.local.log"
with log.open("w") as output:
    process = subprocess.run(command, cwd=cwd, env=environment, stdout=output,
                             stderr=subprocess.STDOUT, timeout=240)
if process.returncode:
    print(json.dumps({"status": "failed", "exit": process.returncode, "log": str(log)}))
    sys.exit(process.returncode)

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

build_info = json.loads((compiled / "orchestrator.tsbuildinfo").read_text())
source_paths = set()
for filename in build_info.get("fileNames", build_info.get("program", {}).get("fileNames", [])):
    target = (compiled / filename).resolve()
    if target.is_relative_to(repo) and "node_modules" not in target.relative_to(repo).parts:
        source_paths.add(target)
source_paths.update(repo / name for name in [
    "Dockerfile", "var/docker/healthcheck.sh", "var/docker/ecosystem.config.js",
    "package.json", "pnpm-lock.yaml", "tsconfig.base.json", "apps/orchestrator/package.json",
    "apps/orchestrator/tsconfig.json", "apps/orchestrator/tsconfig.build.json",
    "apps/orchestrator/nest-cli.json",
])
source_files = {str(path.relative_to(repo)): digest(path) for path in sorted(source_paths)}
compiled_files = {str(path.relative_to(compiled)): digest(path)
                  for path in sorted(compiled.rglob("*"))
                  if path.is_file() and path.suffix != ".tsbuildinfo"}
for required in ["main.js", "app.module.js", "health.controller.js", "worker-readiness.service.js"]:
    if "apps/orchestrator/src/" + required not in compiled_files:
        raise RuntimeError("missing_current_compiled_readiness_module")
dependencies = json.loads(capture(["node", "-e",
    "console.log(JSON.stringify(Object.fromEntries(['@temporalio/client','@temporalio/worker',"
    "'nestjs-temporal-core'].map(n=>[n,require(n+'/package.json').version]))))"]))
manifest = {"schema": "cf-native-readiness-build/v1", "status": "compiled",
    "base_head": capture(["git", "rev-parse", "HEAD"]), "command": command,
    "cwd": str(cwd), "versions": versions, "heap_mib": 4096,
    "compiler": "Installed Nest tsc builder with its tsconfig-paths before hook",
    "source_files": source_files, "compiled_files": compiled_files,
    "temporal_dependencies": dependencies, "compiled_directory": str(compiled),
    "log": str(log), "config_sha256": digest(config)}
(stage / "build-manifest.local.json").write_text(json.dumps(manifest, indent=2) + "\n")
print(json.dumps({"status": manifest["status"], "source_files": len(source_files),
                  "compiled_files": len(compiled_files), "manifest": str(stage / "build-manifest.local.json")}))
