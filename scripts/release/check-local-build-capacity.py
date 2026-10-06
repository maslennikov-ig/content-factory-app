#!/usr/bin/env python3
"""Measure local Docker builder capacity without pruning or pulling an image."""

from __future__ import annotations

import argparse
import json
import math
import os
import re
import subprocess
import sys
import uuid


def docker(*args: str) -> str:
    result = subprocess.run(
        ["docker", *args], text=True, capture_output=True, timeout=20, check=False
    )
    if result.returncode:
        raise RuntimeError("Docker capacity probe failed; check the local daemon/helper image")
    return result.stdout.strip()


def field(text: str, name: str) -> list[str]:
    return re.findall(rf"^{name}:\s*(\S+)\s*$", text, re.MULTILINE)


def measure(helper_image: str) -> dict[str, object]:
    context = docker("context", "show")
    endpoint = docker("context", "inspect", context, "--format", "{{.Endpoints.docker.Host}}")
    effective_endpoint = endpoint if os.environ.get("DOCKER_CONTEXT") else os.environ.get("DOCKER_HOST", endpoint)
    if not effective_endpoint.startswith("unix://"):
        raise ValueError("Remote or unsupported Docker endpoint; local capacity is unknown")
    builder = docker("buildx", "inspect")
    if field(builder, "Driver") != ["docker"] or field(builder, "Endpoint") != [context]:
        raise ValueError("Capacity is unknown for this builder; select a local single-node docker driver")
    image_id = docker("image", "inspect", helper_image, "--format", "{{.Id}}")
    if not re.fullmatch(r"sha256:[a-f0-9]{64}", image_id):
        raise ValueError("Local helper image identity is unknown")

    # A WSL host path can be translated by Docker Desktop into a bind mount
    # from the wrong distro. The container root measures the daemon's image
    # filesystem for the verified docker driver, not WSL's apparently free disk.
    probe_name = f"cf-build-capacity-{uuid.uuid4().hex}"
    try:
        output = docker(
            "run", "--rm", "--name", probe_name, "--pull=never", "--network", "none",
            "--read-only", "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
            "--entrypoint", "/bin/sh", image_id, "-c", "df -Pk /; df -Pi /",
        )
    finally:
        # Only this invocation's uniquely named temporary container is owned.
        subprocess.run(["docker", "rm", "-f", probe_name], capture_output=True, timeout=10, check=False)
    rows = [line.split() for line in output.splitlines() if line.split() and line.split()[-1] == "/"]
    if len(rows) != 2 or any(len(row) != 6 or not row[3].isdigit() for row in rows):
        raise ValueError("Unrecognized builder filesystem capacity; refusing to guess")
    return {
        "docker_context": context,
        "builder_driver": "docker",
        "storage": "daemon-container-root",
        "available_bytes": int(rows[0][3]) * 1024,
        "available_inodes": int(rows[1][3]),
        "helper_image_id": image_id,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--min-free-gib", required=True, type=float, help="planned extra build headroom; no implicit estimate")
    parser.add_argument("--min-free-inodes", type=int, default=100_000)
    parser.add_argument("--helper-image", default="alpine:3.20", help="already cached image with sh and df; never pulled")
    args = parser.parse_args()
    if not math.isfinite(args.min_free_gib) or args.min_free_gib <= 0 or args.min_free_inodes < 0:
        parser.error("headroom must be finite and positive; inodes must be nonnegative")
    result: dict[str, object] = {
        "result": "UNKNOWN", "required_bytes": math.ceil(args.min_free_gib * 1024**3),
        "required_inodes": args.min_free_inodes,
    }
    try:
        result.update(measure(args.helper_image))
        sufficient = result["available_bytes"] >= result["required_bytes"] and result["available_inodes"] >= args.min_free_inodes
        result["result"] = "PASS" if sufficient else "INSUFFICIENT_CAPACITY"
    except (OSError, ValueError, RuntimeError, subprocess.TimeoutExpired) as exc:
        result["reason"] = str(exc) if not isinstance(exc, subprocess.TimeoutExpired) else "Docker capacity probe timed out"
    print(json.dumps(result, sort_keys=True))
    return 0 if result["result"] == "PASS" else 1


if __name__ == "__main__":
    sys.exit(main())
