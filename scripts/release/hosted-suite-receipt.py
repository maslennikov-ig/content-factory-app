#!/usr/bin/env python3
"""Import and recheck the existing public Build evidence without rerunning tests."""

import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
from datetime import datetime
from pathlib import Path
from zipfile import BadZipFile, ZipFile


REPOSITORY = "maslennikov-ig/content-factory-app"
WORKFLOW = ".github/workflows/build.yml"
SUITE_JOB = "Full test suite (required)"
ARTIFACT = "full-suite-results"
SCHEMA = "content-factory/hosted-suite/v1"
SHA = re.compile(r"[0-9a-f]{40}")
DIGEST = re.compile(r"sha256:[0-9a-f]{64}")


def require(condition, message):
    if not condition:
        raise ValueError(message)


def positive(value):
    return type(value) is int and value > 0


def git(*args):
    return subprocess.check_output(["git", *args], text=True).strip()


def source_identity():
    origin = git("remote", "get-url", "origin")
    require(origin.removesuffix(".git") in {
        f"https://github.com/{REPOSITORY}", f"git@github.com:{REPOSITORY}",
    }, "Use the prepared public repository.")
    source = git("log", "-1", "--format=%(trailers:key=Source-Commit,valueonly)")
    require(SHA.fullmatch(source), "HEAD must have one full Source-Commit trailer.")
    return {"commit": git("rev-parse", "HEAD"), "tree": git("rev-parse", "HEAD^{tree}"),
            "sourceCommit": source}


def github(*parts):
    return ["gh", "api", "--hostname", "github.com", f"repos/{REPOSITORY}/actions/" + "/".join(parts)]


def api(*parts):
    return json.loads(subprocess.check_output(github(*parts)))


def passed(item):
    return item.get("status") == "completed" and item.get("conclusion") == "success"


def get_artifact(run_id, commit):
    run = api("runs", str(run_id))
    attempt = run["run_attempt"]
    require(positive(attempt) and run["id"] == run_id and passed(run)
            and run["path"] == WORKFLOW and run["event"] == "push"
            and run["head_branch"] == "main" and run["head_sha"] == commit
            and run["repository"]["full_name"] == run["head_repository"]["full_name"] == REPOSITORY,
            "Build must be a successful public main push on this exact commit.")

    jobs = api("runs", str(run_id), "jobs?filter=all&per_page=100")["jobs"]

    def latest_job(name):
        versions = [job for job in jobs if job["name"] == name]
        require(versions and all(job["run_id"] == run_id and job["head_sha"] == commit
                and positive(job["run_attempt"]) and job["run_attempt"] <= attempt for job in versions),
                f"Required job has no matching execution: {name}.")
        latest = max(versions, key=lambda job: job["run_attempt"])
        require(passed(latest), f"Required job did not pass: {name}.")
        return latest

    # A failed-job retry can keep the suite already accepted for this run.
    suite = latest_job(SUITE_JOB)
    latest_job("The suite, one year on")
    started = datetime.fromisoformat(suite["started_at"])
    finished = datetime.fromisoformat(suite["completed_at"])
    repo_id = run["repository"]["id"]
    expected_run = {"id": run_id, "head_sha": commit, "head_branch": "main",
                    "repository_id": repo_id, "head_repository_id": repo_id}
    artifacts = api("runs", str(run_id), f"artifacts?name={ARTIFACT}&per_page=100")["artifacts"]
    matching = [
        artifact for artifact in artifacts
        if artifact["name"] == ARTIFACT and artifact["expired"] is False
        and started <= datetime.fromisoformat(artifact["created_at"]) <= finished
        and all(artifact["workflow_run"].get(key) == value for key, value in expected_run.items())
    ]
    require(len(matching) == 1, "Expected one unexpired suite artifact from the successful attempt.")
    artifact = matching[0]
    return {"runId": run_id, "attempt": attempt, "suiteAttempt": suite["run_attempt"], "artifactId": artifact["id"],
            "digest": artifact["digest"], "size": artifact["size_in_bytes"]}


def summaries(archive, commit, proof):
    require(all(positive(proof[key]) for key in ("runId", "attempt", "suiteAttempt", "artifactId", "size"))
            and proof["suiteAttempt"] <= proof["attempt"]
            and DIGEST.fullmatch(proof["digest"]), "Invalid hosted artifact metadata.")
    with archive.open("rb") as stream:
        require(os.fstat(stream.fileno()).st_size == proof["size"], "Hosted artifact size mismatch.")
        digest = "sha256:" + hashlib.file_digest(stream, "sha256").hexdigest()
        require(digest == proof["digest"], "Hosted artifact digest mismatch.")
        with ZipFile(stream) as artifact:
            names = artifact.namelist()
            for name in ("coverage/complete/verification.json", "coverage/complete/coverage-final.json",
                         "coverage/expected-tests.json", "suite.log"):
                require(names.count(name) == 1 and artifact.getinfo(name).file_size > 2,
                        f"Missing or duplicate {name}.")
            verification = json.loads(artifact.read("coverage/complete/verification.json"))
            expected = json.loads(artifact.read("coverage/expected-tests.json"))
            lines = artifact.read("suite.log").decode().splitlines()

    files = verification["files"]
    require(verification["commit"] == commit and positive(files)
            and isinstance(expected, list) and all(isinstance(test, str) for test in expected)
            and len(expected) == len(set(expected)) == files
            and positive(verification["coverageFiles"]), "Incomplete discovery or coverage evidence.")
    for mode, shards in (("full", 4), ("calendar", 2)):
        totals = verification["totals"][mode]
        counts = ("suites", "passedSuites", "pendingSuites", "tests", "passed", "pending", "todo", "shards")
        require(all(type(totals[key]) is int and totals[key] >= 0 for key in counts)
                and totals["shards"] == shards and totals["suites"] == files
                and totals["passedSuites"] + totals["pendingSuites"] == files
                and totals["passedSuites"] > 0
                and totals["passed"] > 0 and totals["passed"] + totals["pending"] + totals["todo"] == totals["tests"],
                f"Incomplete {mode} Jest population.")
    full = verification["totals"]["full"]
    suites = f"Test Suites: {full['pendingSuites']} skipped, {full['passedSuites']} passed, {files} total"
    tests = (f"Tests:       {full['pending']} skipped, {full['todo']} todo, "
             f"{full['passed']} passed, {full['tests']} total")
    require(suites in lines and tests in lines, "Jest log totals differ from verified coverage.")

    def reported(pattern):
        matches = [line for line in lines if re.fullmatch(pattern, line)]
        require(len(matches) == 1, "Missing or ambiguous Node/Python summary.")
        return matches[0]

    node_pass = reported(r"# pass [1-9][0-9]*")
    node_fail = reported(r"# fail [0-9]+")
    require(node_fail == "# fail 0", "Node tests failed.")
    reported(r"Ran [1-9][0-9]* tests? in .+")
    python = reported(r"OK(?: \(.*\))?|FAILED \(.*\)")
    require(python.startswith("OK"), "Python tests failed.")
    return {"jest": {"suites": suites, "tests": tests}, "nodeTest": {"pass": node_pass, "fail": node_fail},
            "python": python, "files": files, "coverageFiles": verification["coverageFiles"]}


def archive_path(directory, proof):
    require(positive(proof["artifactId"]), "Invalid hosted artifact id.")
    return directory / f"hosted-suite-{proof['artifactId']}.zip"


def import_receipt(directory, identity, run_id):
    proof = get_artifact(run_id, identity["commit"])
    destination = archive_path(directory, proof)
    directory.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=directory) as temp:
        archive = Path(temp) / "suite.zip"
        with archive.open("wb") as output:
            subprocess.run(github("artifacts", str(proof["artifactId"]), "zip"), stdout=output, check=True)
        results = summaries(archive, identity["commit"], proof)
        require(source_identity() == identity, "Public source changed during import.")
        receipt = Path(temp) / "suite-receipt.json"
        receipt.write_text(json.dumps({"schema": SCHEMA, **identity, "github": proof, **results}, indent=2) + "\n")
        os.replace(archive, destination)
        os.replace(receipt, directory / receipt.name)


def check_receipt(directory, identity):
    receipt = json.loads((directory / "suite-receipt.json").read_text())
    require(receipt["schema"] == SCHEMA and all(receipt[key] == value for key, value in identity.items()),
            "Hosted receipt does not match this public commit and source trailer.")
    proof = receipt["github"]
    results = summaries(archive_path(directory, proof), identity["commit"], proof)
    require(all(receipt[key] == value for key, value in results.items()), "Hosted receipt summaries changed.")
    print(f"Public Build {proof['runId']} attempt {proof['attempt']} covers {identity['commit'][:12]} "
          f"with suite evidence from attempt {proof['suiteAttempt']}.")
    print(results["jest"]["suites"])
    print(results["jest"]["tests"])
    print(f"{results['nodeTest']['pass']}, {results['nodeTest']['fail']}; Python {results['python']}")


def main(args):
    require(args == ["check"] or (len(args) == 2 and args[0] == "import"
            and re.fullmatch(r"[1-9][0-9]*", args[1])),
            "Usage: python3 scripts/release/hosted-suite-receipt.py import <Build run id> | check")
    identity = source_identity()
    directory = Path(git("rev-parse", "--show-toplevel")) / "var/release"
    if args[0] == "import":
        import_receipt(directory, identity, int(args[1]))
    check_receipt(directory, identity)


if __name__ == "__main__":
    try:
        main(sys.argv[1:])
    except (OSError, ValueError, KeyError, TypeError, BadZipFile, subprocess.CalledProcessError) as error:
        sys.exit(f"REFUSING hosted release evidence: {error}")
