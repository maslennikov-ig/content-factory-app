#!/usr/bin/env python3
"""Measure one streamed docker-save export without extracting any file.

The manifest, config and uncompressed diff IDs must agree. The byte bound
includes each full uncompressed layer tar (or sparse logical data, if larger).
Entries include implicit parent directories; repeated paths in different
layers count again. Unknown export formats fail rather than guessing Size.
"""

import argparse
import gzip
import hashlib
import io
import json
import re
import sys
import tarfile

MAX_BYTES = 1_000_000_000_000
MAX_ENTRIES = 10_000_000
MAX_OUTER_MEMBERS = 4096
MAX_JSON_BYTES = 1_048_576
MAX_TOTAL_JSON_BYTES = 8 * MAX_JSON_BYTES
MAX_LAYERS = 256
DIGEST = re.compile(r"sha256:[a-f0-9]{64}\Z")
CONFIG_PATH = re.compile(r"(?:blobs/sha256/([a-f0-9]{64})|([a-f0-9]{64})\.json)\Z")


class MeasurementError(ValueError):
    pass


class CountedReader:
    def __init__(self, source):
        self.source = source
        self.count = 0
        self.digest = hashlib.sha256()

    def read(self, size):
        # tarfile and the drain below use bounded reads; no whole-layer buffer.
        if size < 0 or size > MAX_JSON_BYTES:
            raise MeasurementError("Unbounded archive read")
        data = self.source.read(size)
        self.count += len(data)
        if self.count > MAX_BYTES:
            raise MeasurementError("Layer exceeds the byte bound")
        self.digest.update(data)
        return data


def archive_path(name):
    if not isinstance(name, str) or len(name) > 4096 or "\0" in name:
        raise MeasurementError("Unsupported archive path")
    if name.startswith("./"):
        name = name[2:]
    name = name.rstrip("/")
    parts = name.split("/")
    if not name or name.startswith("/") or any(part in ("", ".", "..") for part in parts):
        raise MeasurementError("Unsupported archive path")
    return name


def entry_path(entry):
    # Docker layers may explicitly describe their root. Count one per layer;
    # only an empty directory is valid here, never a file or a traversal path.
    if entry.name in (".", "./") and entry.isdir() and entry.size == 0:
        return "."
    return archive_path(entry.name)


def tar_header(prefix):
    if len(prefix) < 512:
        return False
    if prefix[:512] == b"\0" * 512:
        return True
    try:
        tarfile.TarInfo.frombuf(prefix[:512], "utf-8", "surrogateescape")
        return True
    except tarfile.TarError:
        return False


def measure_layer(buffered, compressed):
    source = gzip.GzipFile(fileobj=buffered) if compressed else buffered
    counted = CountedReader(source)
    paths = set()
    logical_bytes = 0
    emitted = 0
    with tarfile.open(fileobj=counted, mode="r|") as layer:
        for entry in layer:
            emitted += 1
            if emitted > MAX_ENTRIES:
                raise MeasurementError("Layer exceeds the entry bound")
            name = entry_path(entry)
            parts = name.split("/")
            for length in range(1, len(parts) + 1):
                paths.add("/".join(parts[:length]))
            if len(paths) > MAX_ENTRIES:
                raise MeasurementError("Layer exceeds the entry bound")
            if entry.isfile():
                if entry.size < 0:
                    raise MeasurementError("Negative file size")
                logical_bytes += entry.size
                if logical_bytes > MAX_BYTES:
                    raise MeasurementError("Layer exceeds the byte bound")
    # Include padding and verify gzip's trailer/diff ID even when tar ended.
    while counted.read(MAX_JSON_BYTES):
        pass
    return {
        "bytes": max(logical_bytes, counted.count),
        "entries": len(paths),
        "diff_id": "sha256:" + counted.digest.hexdigest(),
    }


def measure(stream, expected_diff_ids, include_download_bytes=False):
    metadata = {}
    layers = {}
    names = set()
    metadata_bytes = 0
    count = 0
    with tarfile.open(fileobj=stream, mode="r|") as outer:
        for entry in outer:
            count += 1
            if count > MAX_OUTER_MEMBERS:
                raise MeasurementError("Too many export members")
            name = entry_path(entry)
            if entry.isdir():
                continue
            if not entry.isfile() or name in names or entry.size > MAX_BYTES:
                raise MeasurementError("Unsupported or duplicate export member")
            names.add(name)
            extracted = outer.extractfile(entry)
            if extracted is None:
                raise MeasurementError("Unreadable export member")
            buffered = io.BufferedReader(extracted)
            prefix = buffered.peek(512)
            compressed = prefix.startswith(b"\x1f\x8b")
            if compressed or tar_header(prefix):
                layers[name] = measure_layer(buffered, compressed)
                layers[name]["stored_bytes"] = entry.size
                if len(layers) > MAX_LAYERS:
                    raise MeasurementError("Too many layers")
            else:
                if entry.size > MAX_JSON_BYTES:
                    raise MeasurementError("Unsupported large metadata member")
                data = buffered.read(MAX_JSON_BYTES + 1)
                metadata_bytes += len(data)
                if len(data) != entry.size or metadata_bytes > MAX_TOTAL_JSON_BYTES:
                    raise MeasurementError("Incomplete or excessive export metadata")
                metadata[name] = data
    manifest = json.loads(metadata.get("manifest.json", b"null"))
    if not isinstance(manifest, list) or len(manifest) != 1 or not isinstance(manifest[0], dict):
        raise MeasurementError("Export must describe exactly one image")
    image = manifest[0]
    config_path = archive_path(image.get("Config"))
    config_match = CONFIG_PATH.fullmatch(config_path)
    config_bytes = metadata.get(config_path)
    if not config_match or config_bytes is None:
        raise MeasurementError("Missing or unsupported image config")
    config_sha = config_match.group(1) or config_match.group(2)
    if hashlib.sha256(config_bytes).hexdigest() != config_sha:
        raise MeasurementError("Image config checksum mismatch")
    config = json.loads(config_bytes)
    diff_ids = config.get("rootfs", {}).get("diff_ids")
    if (
        not isinstance(diff_ids, list)
        or not diff_ids
        or len(diff_ids) > MAX_LAYERS
        or not all(isinstance(item, str) and DIGEST.fullmatch(item) for item in diff_ids)
        or diff_ids != expected_diff_ids
    ):
        raise MeasurementError("Export differs from the inspected image")
    references = image.get("Layers")
    if (
        not isinstance(references, list)
        or len(references) != len(diff_ids)
        or not all(isinstance(item, str) for item in references)
    ):
        raise MeasurementError("Missing layer manifest")
    references = [archive_path(item) for item in references]
    if set(references) != set(layers):
        raise MeasurementError("Missing or unrelated image layers")
    byte_count = 0
    entry_count = 0
    download_count = 0
    for reference, diff_id in zip(references, diff_ids):
        layer = layers[reference]
        if layer["diff_id"] != diff_id:
            raise MeasurementError("Layer checksum mismatch")
        byte_count += layer["bytes"]
        entry_count += layer["entries"]
        download_count += layer["stored_bytes"]
    if not 0 < byte_count <= MAX_BYTES or not 0 < entry_count <= MAX_ENTRIES:
        raise MeasurementError("Empty or excessive image measurement")
    if include_download_bytes:
        if not 0 < download_count <= MAX_BYTES:
            raise MeasurementError("Empty or excessive stored-layer measurement")
        return byte_count, entry_count, download_count
    return byte_count, entry_count


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--expected-diff-ids", required=True)
    parser.add_argument(
        "--include-download-bytes",
        action="store_true",
        help="Append the exact stored bytes of verified manifest-referenced layers",
    )
    options = parser.parse_args()
    try:
        expected = json.loads(options.expected_diff_ids)
        if not isinstance(expected, list):
            raise MeasurementError("Expected diff IDs must be an array")
        measurement = measure(sys.stdin.buffer, expected, options.include_download_bytes)
    except (ValueError, TypeError, AttributeError, OSError, EOFError, tarfile.TarError) as error:
        print("Cannot measure image layers: " + str(error), file=sys.stderr)
        return 1
    print(" ".join(str(value) for value in measurement))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
