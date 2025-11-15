"""Utility to validate records in logs/signing.log.

The tool checks that:
- each line is valid JSON;
- required fields are present;
- `packageId` + `version` pairs are unique unless `--allow-duplicates` is passed;
- `timestamp` values are in ISO 8601 `YYYY-MM-DDTHH:MM:SSZ` format;
- files referenced in `archive`, `signature`, and `manifest` exist (unless `--skip-path-checks`).

It exits with code 0 if all checks succeed, otherwise prints diagnostics and exits with 1.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
from pathlib import Path
from typing import Iterable, Tuple

REQUIRED_FIELDS = {
    "archive": str,
    "checksum": str,
    "keyId": str,
    "manifest": str,
    "packageId": str,
    "records": (int, float),
    "signature": str,
    "timestamp": str,
    "version": str,
}


def parse_args(argv: Iterable[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Validate signing log entries")
    parser.add_argument(
        "--log",
        default="logs/signing.log",
        help="Path to signing log (default: logs/signing.log)",
    )
    parser.add_argument(
        "--allow-duplicates",
        action="store_true",
        help="Allow duplicate packageId+version entries",
    )
    parser.add_argument(
        "--skip-path-checks",
        action="store_true",
        help="Skip existence checks for archive/signature/manifest paths",
    )
    return parser.parse_args(argv)


def parse_timestamp(value: str) -> None:
    try:
        dt.datetime.strptime(value, "%Y-%m-%dT%H:%M:%SZ")
    except ValueError as exc:  # pragma: no cover - validation failure path
        raise ValueError(f"Invalid timestamp format: {value!r}") from exc


def validate_entry(entry: dict, *, index: int, check_paths: bool) -> Tuple[str, str]:
    for field, expected in REQUIRED_FIELDS.items():
        if field not in entry:
            raise ValueError(f"Line {index}: missing field {field}")
        if not isinstance(entry[field], expected):
            raise ValueError(f"Line {index}: field {field} has unexpected type {type(entry[field]).__name__}")

    parse_timestamp(entry["timestamp"])

    if check_paths:
        for field in ("archive", "signature", "manifest"):
            path = Path(entry[field])
            if not path.exists():
                raise ValueError(f"Line {index}: {field} path does not exist: {path}")

    if isinstance(entry["records"], float) and not entry["records"].is_integer():
        raise ValueError(f"Line {index}: records must be integer-like (got {entry['records']})")

    return entry["packageId"], entry["version"]


def main(argv: Iterable[str]) -> int:
    args = parse_args(argv)
    log_path = Path(args.log)
    if not log_path.exists():
        print(f"Log not found: {log_path}", file=sys.stderr)
        return 1

    seen = set()
    with log_path.open("r", encoding="utf-8") as fh:
        for line_number, raw in enumerate(fh, start=1):
            raw = raw.strip()
            if not raw:
                continue
            try:
                entry = json.loads(raw)
            except json.JSONDecodeError as exc:
                print(f"Line {line_number}: invalid JSON ({exc})", file=sys.stderr)
                return 1
            try:
                key = validate_entry(entry, index=line_number, check_paths=not args.skip_path_checks)
            except ValueError as exc:
                print(str(exc), file=sys.stderr)
                return 1
            if not args.allow_duplicates and key in seen:
                print(f"Line {line_number}: duplicate entry for {key[0]} {key[1]}", file=sys.stderr)
                return 1
            seen.add(key)

    print(f"Validated {len(seen)} signing entries from {log_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
