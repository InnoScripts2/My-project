"""Utility for packaging and signing DTC resource bundles.

The script expects a working directory containing:
- manifest.json
- data/ with JSON exports produced by prepare_resources.py
- licenses/ with original attribution files

It recalculates the record count, normalises the manifest, builds a
canonical ZIP archive (.obdresource) and writes an Ed25519 detached
signature next to the archive.
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import io
import json
import sys
import zipfile
from pathlib import Path
from typing import Dict, Iterable

try:  # Delay dependency check to emit a clear instruction for missing packages.
    from cryptography.hazmat.primitives import serialization  # type: ignore[import]
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey  # type: ignore[import]
except ImportError as exc:  # pragma: no cover - executed only when dependency is absent.
    raise SystemExit(
        "cryptography package is required. Install it with 'pip install cryptography'."
    ) from exc

CANONICAL_ZIP_TIMESTAMP = (2025, 1, 1, 0, 0, 0)
DEFAULT_PERMISSIONS = 0o644 << 16


def parse_args(argv: Iterable[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Package and sign DTC resources")
    parser.add_argument("--input", required=True, help="Path to the working directory with manifest/data/licenses")
    parser.add_argument("--key", required=True, help="Path to the Ed25519 private key (PEM or raw bytes)")
    parser.add_argument("--output", required=True, help="Destination .obdresource file")
    parser.add_argument(
        "--signature-output",
        help="Optional signature path; defaults to <output>.sig",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Overwrite existing archive and signature",
    )
    parser.add_argument(
        "--key-id",
        default="primary",
        help="Identifier of the signing key to embed in manifest (default: primary)",
    )
    parser.add_argument(
        "--log",
        default="logs/signing.log",
        help="Path to JSONL log with signing events (default: logs/signing.log)",
    )
    return parser.parse_args(argv)


def load_private_key(key_path: Path) -> Ed25519PrivateKey:
    data = key_path.read_bytes()
    try:
        return Ed25519PrivateKey.from_private_bytes(data)
    except ValueError:
        key = serialization.load_pem_private_key(data, password=None)
        if not isinstance(key, Ed25519PrivateKey):
            raise ValueError("Provided key is not an Ed25519 private key")
        return key


def read_manifest(manifest_path: Path) -> Dict[str, object]:
    with manifest_path.open("r", encoding="utf-8") as fh:
        manifest = json.load(fh)
    if not isinstance(manifest, dict):
        raise ValueError("manifest.json must contain a JSON object")
    return manifest


def ensure_created_at(manifest: Dict[str, object]) -> None:
    if not manifest.get("createdAtUtc"):
        now = dt.datetime.now(tz=dt.timezone.utc).replace(microsecond=0)
        manifest["createdAtUtc"] = now.isoformat().replace("+00:00", "Z")


def collect_payload(root: Path, subdir: str) -> Dict[str, bytes]:
    folder = root / subdir
    result: Dict[str, bytes] = {}
    if not folder.exists():
        return result
    for path in sorted(folder.rglob("*")):
        if not path.is_file():
            continue
        relative_parts = path.relative_to(folder).parts
        if any(part.startswith(".") for part in relative_parts):
            continue
        arcname = f"{subdir}/{path.relative_to(folder).as_posix()}"
        result[arcname] = path.read_bytes()
    return result


def render_manifest_bytes(manifest: Dict[str, object]) -> bytes:
    return json.dumps(manifest, ensure_ascii=False, sort_keys=True, indent=2).encode("utf-8")


def build_canonical_archive(contents: Dict[str, bytes]) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        for arcname in sorted(contents):
            info = zipfile.ZipInfo(arcname)
            info.date_time = CANONICAL_ZIP_TIMESTAMP
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = DEFAULT_PERMISSIONS
            zf.writestr(info, contents[arcname])
    return buffer.getvalue()


def count_records(payload: Dict[str, bytes]) -> int:
    total = 0
    for arcname, blob in payload.items():
        if not arcname.startswith("data/") or not arcname.endswith(".json"):
            continue
        data = json.loads(blob.decode("utf-8"))
        if isinstance(data, list):
            total += len(data)
        elif isinstance(data, dict):
            candidates = (data.get("records"), data.get("items"), data.get("entries"))
            for candidate in candidates:
                if isinstance(candidate, list):
                    total += len(candidate)
                    break
            else:
                raise ValueError(f"Unsupported JSON structure in {arcname}")
        else:
            raise ValueError(f"Unsupported JSON structure in {arcname}")
    if total == 0:
        raise ValueError("No records found in data/ directory")
    return total


def append_signing_log(log_path: Path, entry: Dict[str, object]) -> None:
    log_path.parent.mkdir(parents=True, exist_ok=True)
    with log_path.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(entry, ensure_ascii=False, sort_keys=True))
        fh.write("\n")


def main(argv: Iterable[str]) -> None:
    args = parse_args(argv)
    input_dir = Path(args.input).resolve()
    manifest_path = input_dir / "manifest.json"
    data_dir = input_dir / "data"
    licenses_dir = input_dir / "licenses"

    if not input_dir.exists():
        raise SystemExit(f"Input directory not found: {input_dir}")
    for required in (manifest_path, data_dir, licenses_dir):
        if not required.exists():
            raise SystemExit(f"Required path missing: {required}")

    manifest = read_manifest(manifest_path)
    manifest["keyId"] = args.key_id
    ensure_created_at(manifest)

    payload = {}
    payload.update(collect_payload(input_dir, "data"))
    payload.update(collect_payload(input_dir, "licenses"))

    if not payload:
        raise SystemExit("No payload files discovered in data/ or licenses/")

    record_count = count_records(payload)
    manifest["records"] = record_count

    canonical_manifest = dict(manifest)
    canonical_manifest["checksum"] = ""
    manifest_bytes_for_hash = render_manifest_bytes(canonical_manifest)

    contents_for_hash = dict(payload)
    contents_for_hash["manifest.json"] = manifest_bytes_for_hash
    canonical_archive = build_canonical_archive(contents_for_hash)
    checksum = hashlib.sha256(canonical_archive).hexdigest()

    manifest["checksum"] = checksum
    manifest_bytes_final = render_manifest_bytes(manifest)

    contents_final = dict(payload)
    contents_final["manifest.json"] = manifest_bytes_final
    final_archive = build_canonical_archive(contents_final)

    output_path = Path(args.output).resolve()
    signature_path = (
        Path(args.signature_output).resolve()
        if args.signature_output
        else output_path.with_suffix(output_path.suffix + ".sig")
    )

    if not args.force:
        for target in (output_path, signature_path):
            if target.exists():
                raise SystemExit(f"Refusing to overwrite existing file: {target}")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    signature_path.parent.mkdir(parents=True, exist_ok=True)

    output_path.write_bytes(final_archive)
    manifest_path.write_text(render_manifest_bytes(manifest).decode("utf-8"), encoding="utf-8")

    private_key = load_private_key(Path(args.key))
    signature = private_key.sign(final_archive)
    signature_path.write_bytes(signature)

    log_entry = {
        "timestamp": dt.datetime.now(tz=dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "packageId": manifest.get("packageId"),
        "version": manifest.get("version"),
        "records": record_count,
        "checksum": checksum,
        "keyId": manifest.get("keyId"),
        "archive": str(output_path),
        "signature": str(signature_path),
        "manifest": str(manifest_path),
    }
    append_signing_log(Path(args.log).resolve(), log_entry)

    print(f"Archive: {output_path}")
    print(f"Signature: {signature_path}")
    print(f"Package ID: {manifest.get('packageId', '<undefined>')}")
    print(f"Version: {manifest.get('version', '<undefined>')}")
    print(f"Records: {record_count}")
    print(f"Checksum: {checksum}")


if __name__ == "__main__":
    main(sys.argv[1:])
