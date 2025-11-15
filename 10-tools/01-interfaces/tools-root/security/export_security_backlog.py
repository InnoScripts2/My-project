"""Convert the security backlog markdown into a JSON task payload for external trackers."""
from __future__ import annotations

import argparse
import csv
import json
import re
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Iterable, List

RE_TASK_TITLE = re.compile(r"^### Task: (?P<title>.+)$")
RE_FIELD = re.compile(r"^- \*\*(?P<key>[^*]+)\*\*: (?P<value>.+)$")

@dataclass
class BacklogTask:
    title: str
    description: str
    owners: List[str]
    due: str
    tags: List[str]
    category: str
    source: str

    def to_json(self) -> dict:
        return {
            "title": self.title,
            "description": self.description,
            "owners": self.owners,
            "due": self.due,
            "tags": self.tags,
            "category": self.category,
            "source": self.source,
        }


def normalise_people(raw: str) -> List[str]:
    return [part.strip() for part in raw.split(",") if part.strip()]


def normalise_tags(raw: str) -> List[str]:
    return [part.strip() for part in raw.split(",") if part.strip()]


def parse_backlog(path: Path) -> Iterable[BacklogTask]:
    category = None
    current: dict[str, str] = {}

    def flush_current() -> Iterable[BacklogTask]:
        nonlocal current
        if not current:
            return []
        missing = {key for key in ("title", "description", "owner", "due", "tags", "category") if key not in current}
        if missing:
            raise ValueError(f"Incomplete task definition for '{current.get('title', 'unknown')}', missing: {', '.join(sorted(missing))}")
        task = BacklogTask(
            title=current["title"],
            description=current["description"],
            owners=normalise_people(current["owner"]),
            due=current["due"],
            tags=normalise_tags(current["tags"]),
            category=current["category"],
            source=path.as_posix(),
        )
        current = {}
        return [task]

    with path.open("r", encoding="utf-8") as handle:
        for raw_line in handle:
            line = raw_line.rstrip()
            if line.startswith("## ") and not line.startswith("###"):
                # Flush previous task before switching category.
                yield from flush_current()
                category = line[3:].strip()
                continue
            match_title = RE_TASK_TITLE.match(line)
            if match_title:
                yield from flush_current()
                current = {"title": match_title.group("title"), "category": category or "Uncategorised"}
                continue
            match_field = RE_FIELD.match(line)
            if match_field and current:
                key = match_field.group("key").strip().lower()
                value = match_field.group("value").strip()
                current[key] = value
                continue
        yield from flush_current()


def run(argv: Iterable[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Export security backlog tasks to JSON")
    parser.add_argument(
        "--input",
        type=Path,
        default=Path("docs/internal/update-security-boards-backlog.md"),
        help="Path to backlog markdown file",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("outbox/security-backlog-tasks.json"),
        help="Destination JSON file",
    )
    parser.add_argument(
        "--azure-csv",
        type=Path,
        help="Optional path to export Azure Boards-friendly CSV",
    )
    parser.add_argument(
        "--timestamp",
        action="store_true",
        help="Add exportedAtUtc field with current UTC timestamp",
    )
    args = parser.parse_args(list(argv) if argv is not None else None)

    tasks = list(parse_backlog(args.input))
    timestamp = None
    if args.timestamp:
        timestamp = datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")

    payload = {
        "exportedAtUtc": timestamp,
        "source": args.input.as_posix(),
        "tasks": [task.to_json() for task in tasks],
    }
    if payload["exportedAtUtc"] is None:
        payload.pop("exportedAtUtc")

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=True, indent=2)

    if args.azure_csv:
        args.azure_csv.parent.mkdir(parents=True, exist_ok=True)
        with args.azure_csv.open("w", encoding="utf-8", newline="") as handle:
            writer = csv.writer(handle)
            writer.writerow(["Title", "Description", "Assigned To", "Due Date", "Tags", "Category", "Source"])
            for task in tasks:
                writer.writerow(
                    [
                        task.title,
                        task.description,
                        "; ".join(task.owners),
                        task.due,
                        "; ".join(task.tags),
                        task.category,
                        task.source,
                    ]
                )


if __name__ == "__main__":
    run()
