"""Validate signed DTC resource packages.

The verifier checks three aspects:
1. Ed25519 signature matches the package bytes.
2. Canonical checksum matches the value stored in manifest.json.
3. Record count in data/*.json equals the manifest metadata.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import sys
import zipfile
from pathlib import Path
from typing import Dict, Iterable

try:  # Delay dependency check to provide a clear installation hint.
    from cryptography.hazmat.primitives import serialization  # type: ignore[import]
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey  # type: ignore[import]
except ImportError as exc:  # pragma: no cover - executed only when dependency is absent.
    raise SystemExit(
        "cryptography package is required. Install it with 'pip install cryptography'."
    ) from exc

CANONICAL_ZIP_TIMESTAMP = (2025, 1, 1, 0, 0, 0)
DEFAULT_PERMISSIONS = 0o644 << 16


def parse_args(argv: Iterable[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Verify a signed DTC resource package")
    parser.add_argument("--input", required=True, help="Path to the .obdresource archive")
    parser.add_argument("--signature", required=True, help="Path to the detached signature")
    parser.add_argument("--key", required=True, help="Path to the Ed25519 public key (PEM or raw bytes)")
    parser.add_argument(
        "--expected-key-id",
        help="Optional expected keyId to match against manifest",
    )
    return parser.parse_args(argv)


def load_public_key(key_path: Path) -> Ed25519PublicKey:
    data = key_path.read_bytes()
    try:
        return Ed25519PublicKey.from_public_bytes(data)
    except ValueError:
        key = serialization.load_pem_public_key(data)
        if not isinstance(key, Ed25519PublicKey):
            raise ValueError("Provided key is not an Ed25519 public key")
        return key


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
    return total


def load_archive_contents(archive_bytes: bytes) -> Dict[str, bytes]:
    payload: Dict[str, bytes] = {}
    with zipfile.ZipFile(io.BytesIO(archive_bytes), mode="r") as zf:
        for info in zf.infolist():
            if info.is_dir():
                continue
            name = info.filename
            if name.endswith("/"):
                continue
            payload[name] = zf.read(name)
    return payload


def main(argv: Iterable[str]) -> None:
    args = parse_args(argv)

    archive_path = Path(args.input).resolve()
    signature_path = Path(args.signature).resolve()
    key_path = Path(args.key).resolve()

    package_bytes = archive_path.read_bytes()
    signature = signature_path.read_bytes()

    public_key = load_public_key(key_path)
    public_key.verify(signature, package_bytes)

    payload = load_archive_contents(package_bytes)
    manifest_bytes = payload.get("manifest.json")
    if manifest_bytes is None:
        raise SystemExit("manifest.json is missing from archive")

    manifest = json.loads(manifest_bytes.decode("utf-8"))
    if not isinstance(manifest, dict):
        raise SystemExit("manifest.json must contain a JSON object")

    key_id = manifest.get("keyId")
    if not isinstance(key_id, str) or not key_id:
        raise SystemExit("Manifest is missing keyId or it is empty")
    if args.expected_key_id and key_id != args.expected_key_id:
        raise SystemExit(
            f"keyId mismatch: manifest={key_id}, expected={args.expected_key_id}"
        )

    expected_records = manifest.get("records")
    computed_records = count_records(payload)
    if expected_records != computed_records:
        raise SystemExit(
            f"Record count mismatch: manifest={expected_records}, computed={computed_records}"
        )

    canonical_manifest = dict(manifest)
    canonical_manifest["checksum"] = ""
    manifest_bytes_for_hash = render_manifest_bytes(canonical_manifest)

    contents_for_hash = dict(payload)
    contents_for_hash["manifest.json"] = manifest_bytes_for_hash

    canonical_archive = build_canonical_archive(contents_for_hash)
    checksum = hashlib.sha256(canonical_archive).hexdigest()

    if manifest.get("checksum") != checksum:
        raise SystemExit(
            f"Checksum mismatch: manifest={manifest.get('checksum')}, computed={checksum}"
        )

    print("Signature OK")
    print("Checksum OK")
    print("Record count OK")
    print(f"Package ID: {manifest.get('packageId', '<undefined>')}")
    print(f"Version: {manifest.get('version', '<undefined>')}")
    print(f"Records: {computed_records}")
    print(f"keyId: {key_id}")


if __name__ == "__main__":
    main(sys.argv[1:])
