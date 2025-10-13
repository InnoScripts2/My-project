#!/usr/bin/env python3
"""Normalize legacy DTC/VIN resources into JSON bundles for Android packaging."""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import sqlite3
import sys
from pathlib import Path
from typing import Dict, Iterable, List, Tuple

DEFAULT_DTC_COLUMNS = ["code", "description_ru", "description_en", "severity"]
CSV_ALIASES: Dict[str, str] = {
    "dtc": "code",
    "dtc_code": "code",
    "fault": "code",
    "descr": "description_ru",
    "description": "description_ru",
    "description_ru": "description_ru",
    "description_en": "description_en",
    "severity": "severity",
    "level": "severity",
}


def read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8-sig")
    except UnicodeDecodeError:
        return path.read_text(encoding="cp1251", errors="replace")


def load_csv(path: Path) -> Iterable[Dict[str, str]]:
    text = read_text(path)
    reader = csv.DictReader(text.splitlines())
    for row in reader:
        cleaned: Dict[str, str] = {}
        for key, value in row.items():
            if not key:
                continue
            normalized_key = key.strip().lower()
            cleaned[normalized_key] = (value or "").strip()
        if any(cleaned.values()):
            yield cleaned


def normalize_brand_name(name: str) -> str:
    normalized = re.sub(r"[^A-Za-z0-9]+", "_", name).strip("_")
    return normalized.upper() or "UNSPECIFIED"


TEXT_SKIP_PREFIXES = ("#", "//")
JSON_LINE_RE = re.compile(r'^"?(?P<code>[A-Za-z0-9_.-]+)"?\s*[:=]\s*"?(?P<desc>.+?)"?[;,]?$')


def parse_text_line(line: str) -> Dict[str, str] | None:
    stripped = line.strip()
    if not stripped:
        return None
    if stripped.startswith(TEXT_SKIP_PREFIXES):
        return None
    candidate = stripped.lstrip("-*•· ")
    if not candidate:
        return None
    match = JSON_LINE_RE.match(candidate)
    if match:
        code = match.group("code").strip()
        desc = match.group("desc").strip().rstrip(",;")
        return {"code": code, "description_en": desc}
    if "\t" in candidate:
        code, desc = candidate.split("\t", 1)
        return {"code": code.strip(), "description_en": desc.strip()}
    if ":" in candidate:
        left, right = candidate.split(":", 1)
        code = left.strip().strip('"')
        if code and right.strip():
            return {"code": code, "description_en": right.strip().strip('"')}
    parts = candidate.split(None, 1)
    if len(parts) == 2:
        code = parts[0].strip('"')
        desc = parts[1].strip().rstrip(",;")
        if code:
            return {"code": code, "description_en": desc}
    return None


def load_text_dtc(path: Path) -> Iterable[Dict[str, str]]:
    text = read_text(path)
    normalized_text = re.sub(r"<br\s*/?>", "\n", text, flags=re.IGNORECASE)
    for raw_line in normalized_text.splitlines():
        entry = parse_text_line(raw_line)
        if entry:
            yield entry


def normalize_row(row: Dict[str, str]) -> Dict[str, str]:
    normalized: Dict[str, str] = {key: "" for key in DEFAULT_DTC_COLUMNS}
    for key, value in row.items():
        target = CSV_ALIASES.get(key, key)
        if target in normalized:
            normalized[target] = value
    if not normalized["code"]:
        raise ValueError("DTC record without code")
    return normalized


def hash_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def persist_json(data: object, path: Path) -> Tuple[int, str]:
    packed = json.dumps(data, ensure_ascii=False, indent=2).encode("utf-8")
    path.write_bytes(packed)
    return len(packed), hash_bytes(packed)


def ensure_directory(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


SUPPORTED_SUFFIXES = {".csv", ".txt", ".md", ".tsv", ""}
SKIP_NAMES = {"readme", "trouble_code_description"}
SKIP_SUFFIXES = {".gif", ".png", ".jpg", ".jpeg"}


def iter_dtc_files(source: Path) -> Iterable[Path]:
    for file_path in sorted(source.rglob("*")):
        if not file_path.is_file():
            continue
        suffix = file_path.suffix.lower()
        if suffix in SKIP_SUFFIXES:
            continue
        if suffix not in SUPPORTED_SUFFIXES:
            continue
        stem_normalized = file_path.stem.lower()
        if stem_normalized in SKIP_NAMES:
            continue
        yield file_path


def load_dtc_records(path: Path) -> List[Dict[str, str]]:
    if path.suffix.lower() == ".csv":
        rows = list(load_csv(path))
    else:
        rows = list(load_text_dtc(path))
    unique: Dict[str, Dict[str, str]] = {}
    for row in rows:
        try:
            normalized = normalize_row(row)
        except ValueError:
            continue
        unique[normalized["code"].upper()] = normalized
    return [unique[key] for key in sorted(unique.keys())]


def export_dtc_catalog(source: Path, dest: Path, sqlite_path: Path | None) -> Dict[str, object]:
    bundles: List[Dict[str, object]] = []
    ensure_directory(dest)
    if sqlite_path:
        ensure_directory(sqlite_path.parent)
        conn = sqlite3.connect(sqlite_path)
        conn.execute(
            "CREATE TABLE IF NOT EXISTS dtc (code TEXT PRIMARY KEY, description_ru TEXT, description_en TEXT, severity TEXT)"
        )
        conn.execute("DELETE FROM dtc")
    else:
        conn = None
    for file_path in iter_dtc_files(source):
        records = load_dtc_records(file_path)
        if not records:
            continue
        brand = normalize_brand_name(file_path.stem)
        json_path = dest / f"dtc_{brand}.json"
        size, checksum = persist_json(records, json_path)
        if conn:
            conn.executemany(
                "INSERT OR REPLACE INTO dtc(code, description_ru, description_en, severity) VALUES(?, ?, ?, ?)",
                [(r["code"], r["description_ru"], r["description_en"], r["severity"]) for r in records],
            )
        bundles.append(
            {
                "brand": brand,
                "source": str(file_path.relative_to(source)),
                "output": str(json_path.relative_to(dest)),
                "records": len(records),
                "size": size,
                "sha256": checksum,
            }
        )
    if conn:
        conn.commit()
        conn.close()
    return {"dtc_catalogs": bundles}


def export_vin_patterns(source: Path, dest: Path) -> Dict[str, object]:
    ensure_directory(dest.parent)
    payload = {"files": []}
    for file_path in sorted(source.rglob("*")):
        if file_path.is_dir():
            continue
        payload["files"].append(
            {
                "name": file_path.name,
                "relative_path": str(file_path.relative_to(source)),
                "sha256": hash_bytes(file_path.read_bytes()),
                "size": file_path.stat().st_size,
            }
        )
    manifest_path = dest
    size, checksum = persist_json(payload, manifest_path)
    return {"vin_manifest": {"path": str(manifest_path.name), "size": size, "sha256": checksum}}


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Prepare diagnostic resources")
    parser.add_argument("--dtc", required=True, type=Path, help="Path to legacy DTC directory")
    parser.add_argument("--decoder", required=True, type=Path, help="Path to VIN decoder directory")
    parser.add_argument("--output", required=True, type=Path, help="Target directory for JSON bundles")
    parser.add_argument("--sqlite", type=Path, help="Optional SQLite database path for DTC catalog")
    return parser


def main(argv: List[str]) -> int:
    parser = build_arg_parser()
    args = parser.parse_args(argv)
    dtc_dir: Path = args.dtc
    decoder_dir: Path = args.decoder
    output_dir: Path = args.output
    if not dtc_dir.exists():
        parser.error(f"DTC directory not found: {dtc_dir}")
    if not decoder_dir.exists():
        parser.error(f"Decoder directory not found: {decoder_dir}")
    ensure_directory(output_dir)
    manifest: Dict[str, object] = {}
    manifest.update(export_dtc_catalog(dtc_dir, output_dir / "dtc", args.sqlite))
    manifest.update(export_vin_patterns(decoder_dir, output_dir / "vin_manifest.json"))
    manifest_path = output_dir / "manifest.json"
    persist_json(manifest, manifest_path)
    print(f"Resources prepared at {output_dir}")
    print(json.dumps(manifest, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
