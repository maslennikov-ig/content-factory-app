#!/usr/bin/env python3
"""Clean safe local branches and worktrees for accepted child streams."""

from __future__ import annotations

import argparse
import pathlib
import subprocess
import sys
import tomllib


PLACEHOLDERS = {"", "n/a", "<repo-or-n/a>", "<branch>", "<base-branch>", "<absolute-path-or-unknown>", "<base-commit-or-unknown>"}


def parse_frontmatter(text: str) -> tuple[str, str]:
    if not text.startswith("---\n"):
        raise ValueError("file must start with YAML frontmatter")

    end = text.find("\n---\n", 4)
    if end == -1:
        raise ValueError("frontmatter closing marker not found")

    return text[4:end], text[end + 5 :]


def parse_artifact(path: pathlib.Path) -> dict[str, str]:
    frontmatter, _ = parse_frontmatter(path.read_text())
    values: dict[str, str] = {}
    for raw_line in frontmatter.splitlines():
        if not raw_line or raw_line.startswith(" ") or raw_line.startswith("-"):
            continue
        if ":" not in raw_line:
            continue
        key, value = raw_line.split(":", 1)
        values[key.strip()] = value.strip()
    return values


def run(cmd: list[str], cwd: pathlib.Path, check: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, cwd=cwd, text=True, capture_output=True, check=check)


def command_ok(cmd: list[str], cwd: pathlib.Path) -> bool:
    return subprocess.run(cmd, cwd=cwd, text=True, capture_output=True).returncode == 0


def branch_exists(git_root: pathlib.Path, branch: str) -> bool:
    return command_ok(["git", "show-ref", "--verify", f"refs/heads/{branch}"], git_root)


def ref_exists(git_root: pathlib.Path, ref: str) -> bool:
    return command_ok(["git", "show-ref", "--verify", ref], git_root)


def branch_merged_into_ref(git_root: pathlib.Path, branch: str, ref: str) -> bool:
    if ref in PLACEHOLDERS or not ref_exists(git_root, ref):
        return False
    return subprocess.run(
        ["git", "merge-base", "--is-ancestor", branch, ref],
        cwd=git_root,
        text=True,
        capture_output=True,
    ).returncode == 0


def branch_merged_into(git_root: pathlib.Path, branch: str, target: str) -> bool:
    if target in PLACEHOLDERS:
        return False
    return branch_merged_into_ref(git_root, branch, f"refs/heads/{target}")


def branch_delivered_to_remote(git_root: pathlib.Path, branch: str) -> bool:
    return branch_merged_into_ref(git_root, branch, f"refs/remotes/origin/{branch}")


def current_branch(git_root: pathlib.Path) -> str:
    result = run(["git", "rev-parse", "--abbrev-ref", "HEAD"], git_root)
    return result.stdout.strip()


def protected_names(contract: dict[str, object]) -> set[str]:
    names = {"main", "master", "develop", "dev"}
    delivery = contract.get("delivery", {})
    if isinstance(delivery, dict):
        for key in ("primary_branch", "dev_branch", "staging_branch", "docs_direct_sync_branch"):
            value = delivery.get(key)
            if isinstance(value, str) and value:
                names.add(value.split("/")[-1])
        for raw in delivery.get("protected_branches", []):
            if isinstance(raw, str) and raw:
                names.add(raw.split("/")[-1])
    return names


def git_root_for_artifact(repo_root: pathlib.Path, artifact: dict[str, str]) -> pathlib.Path:
    repo = artifact.get("repo", "")
    if repo and repo not in PLACEHOLDERS:
        candidate = repo_root / repo
        if candidate.exists():
            return candidate
        if repo == repo_root.name:
            return repo_root
    return repo_root


def artifact_is_accepted(artifact: dict[str, str]) -> bool:
    return artifact.get("status", "") in {"accepted", "merged"} or artifact.get("accepted_by_orchestrator", "") == "yes"


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--stage", required=True, dest="stage_id")
    parser.add_argument("--task", dest="task_id")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv[1:])

    repo_root = pathlib.Path.cwd()
    contract = tomllib.loads((repo_root / ".codex" / "orchestrator.toml").read_text())
    artifacts_dir = repo_root / ".codex" / "stages" / args.stage_id / "artifacts"
    artifacts = [parse_artifact(path) for path in sorted(artifacts_dir.glob("*.md"))] if artifacts_dir.exists() else []
    if args.task_id:
        artifacts = [artifact for artifact in artifacts if artifact.get("task_id") == args.task_id]
    if not artifacts:
        print("workspace cleanup OK (no matching delegated artifacts)")
        return 0

    protected = protected_names(contract)
    leftovers: list[str] = []
    cleaned: list[str] = []

    worktrees: set[tuple[pathlib.Path, pathlib.Path, str]] = set()
    branches: set[tuple[pathlib.Path, str, str, str, str]] = set()

    for artifact in artifacts:
        if not artifact_is_accepted(artifact):
            continue
        git_root = git_root_for_artifact(repo_root, artifact)
        worktree = artifact.get("worktree", "")
        branch = artifact.get("branch", "")
        base_branch = artifact.get("base_branch", "")
        delivery_method = artifact.get("delivery_method", "")
        task_id = artifact.get("task_id", "<unknown-task>")

        if worktree and worktree not in PLACEHOLDERS:
            worktrees.add((git_root, pathlib.Path(worktree), task_id))
        if branch and branch not in PLACEHOLDERS:
            branches.add((git_root, branch, base_branch, delivery_method, task_id))

    for git_root, worktree, task_id in sorted(worktrees, key=lambda item: str(item[1])):
        if worktree == git_root or worktree == repo_root:
            continue
        if not worktree.exists():
            continue
        print(f"worktree candidate: {worktree} ({task_id})")
        if args.dry_run:
            continue
        result = subprocess.run(
            ["git", "-C", str(git_root), "worktree", "remove", str(worktree)],
            text=True,
            capture_output=True,
        )
        if result.returncode == 0:
            cleaned.append(f"removed worktree {worktree}")
        else:
            leftovers.append(f"could not remove worktree {worktree} ({task_id}): {result.stderr.strip() or result.stdout.strip()}")

    for git_root, branch, base_branch, delivery_method, task_id in sorted(branches, key=lambda item: (str(item[0]), item[1])):
        if branch in protected or branch == base_branch:
            continue
        if branch == current_branch(git_root):
            continue
        if not branch_exists(git_root, branch):
            continue

        delivered = branch_delivered_to_remote(git_root, branch)
        merged = any(branch_merged_into(git_root, branch, target) for target in {base_branch, *protected})
        if not delivered and not merged:
            if delivery_method in {"cherry-pick", "manual integration"}:
                leftovers.append(
                    f"{git_root}:{branch} ({task_id}): accepted-content, not-git-merged; manual cleanup required"
                )
            else:
                leftovers.append(f"local branch still needed or not delivered: {git_root}:{branch} ({task_id})")
            continue

        print(f"branch candidate: {git_root}:{branch} ({task_id})")
        if args.dry_run:
            continue

        result = subprocess.run(["git", "-C", str(git_root), "branch", "-d", branch], text=True, capture_output=True)
        if result.returncode != 0 and (delivered or merged):
            result = subprocess.run(["git", "-C", str(git_root), "branch", "-D", branch], text=True, capture_output=True)

        if result.returncode == 0:
            cleaned.append(f"removed branch {git_root}:{branch} ({task_id})")
        else:
            leftovers.append(f"could not remove branch {git_root}:{branch} ({task_id}): {result.stderr.strip() or result.stdout.strip()}")

    for item in cleaned:
        print(item)

    if leftovers:
        for item in leftovers:
            print(item, file=sys.stderr)
        return 1

    print("workspace cleanup OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
