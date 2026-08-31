#!/usr/bin/env python3
"""Validate repository-local links in the durable documentation set."""

from __future__ import annotations

import argparse
import re
import sys
from collections import defaultdict
from pathlib import Path
from urllib.parse import unquote, urlsplit


LINK_PATTERN = re.compile(r"(?<!!)\[[^\]]*\]\(([^)]+)\)")
HEADING_PATTERN = re.compile(r"^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$")
HTML_TAG_PATTERN = re.compile(r"<[^>]+>")
EXTERNAL_SCHEMES = {"data", "http", "https", "mailto", "tel"}


def markdown_sources(root: Path) -> list[Path]:
    sources = sorted((root / "docs").rglob("*.md")) if (root / "docs").exists() else []
    for candidate in (root / "README.md", root / ".codex" / "project-index.md"):
        if candidate.is_file():
            sources.append(candidate)
    return sources


def github_slug(text: str) -> str:
    text = HTML_TAG_PATTERN.sub("", text)
    text = re.sub(r"[`*_~]", "", text).strip().lower()
    text = re.sub(r"[^\w\- ]", "", text, flags=re.UNICODE)
    return re.sub(r"\s+", "-", text)


def heading_anchors(path: Path) -> set[str]:
    anchors: set[str] = set()
    occurrences: defaultdict[str, int] = defaultdict(int)
    in_fence = False

    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.lstrip()
        if stripped.startswith("```") or stripped.startswith("~~~"):
            in_fence = not in_fence
            continue
        if in_fence:
            continue

        match = HEADING_PATTERN.match(line)
        if not match:
            continue
        base = github_slug(match.group(1))
        if not base:
            continue
        duplicate_index = occurrences[base]
        occurrences[base] += 1
        anchors.add(base if duplicate_index == 0 else f"{base}-{duplicate_index}")

    return anchors


def link_destination(raw: str) -> str:
    destination = raw.strip()
    if destination.startswith("<") and ">" in destination:
        return destination[1 : destination.index(">")]
    return destination.split(maxsplit=1)[0]


def is_external(destination: str) -> bool:
    return urlsplit(destination).scheme.lower() in EXTERNAL_SCHEMES


def display_path(root: Path, path: Path) -> str:
    try:
        return path.relative_to(root).as_posix()
    except ValueError:
        return str(path)


def validate(root: Path) -> list[str]:
    root = root.resolve()
    errors: list[str] = []
    anchor_cache: dict[Path, set[str]] = {}

    for source in markdown_sources(root):
        in_fence = False
        for line_number, line in enumerate(
            source.read_text(encoding="utf-8").splitlines(), start=1
        ):
            stripped = line.lstrip()
            if stripped.startswith("```") or stripped.startswith("~~~"):
                in_fence = not in_fence
                continue
            if in_fence:
                continue

            for match in LINK_PATTERN.finditer(line):
                destination = link_destination(match.group(1))
                if not destination or is_external(destination):
                    continue

                split = urlsplit(destination)
                path_text = unquote(split.path)
                fragment = unquote(split.fragment).lower()
                target = source if not path_text else (source.parent / path_text).resolve()

                if not target.exists():
                    errors.append(
                        f"{display_path(root, source)}:{line_number}: "
                        f"missing local target '{destination}'"
                    )
                    continue

                if not fragment:
                    continue
                if not target.is_file() or target.suffix.lower() not in {".md", ".mdx"}:
                    errors.append(
                        f"{display_path(root, source)}:{line_number}: "
                        f"anchor '#{fragment}' points to a non-Markdown target '{path_text}'"
                    )
                    continue

                if target not in anchor_cache:
                    anchor_cache[target] = heading_anchors(target)
                if fragment not in anchor_cache[target]:
                    errors.append(
                        f"{display_path(root, source)}:{line_number}: "
                        f"missing anchor '#{fragment}' in '{display_path(root, target)}'"
                    )

    return errors


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--root",
        type=Path,
        default=Path.cwd(),
        help="repository root (defaults to the current directory)",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    errors = validate(args.root)
    if errors:
        print("Documentation link errors:")
        for error in errors:
            print(f"- {error}")
        return 1

    print(f"Documentation links OK ({len(markdown_sources(args.root.resolve()))} files checked)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
