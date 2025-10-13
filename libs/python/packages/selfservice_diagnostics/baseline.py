"""Baseline heuristics for OBD-II diagnostic summaries."""

from __future__ import annotations

from typing import Iterable, Mapping


def summarize_dtc(codes: Iterable[str]) -> Mapping[str, int]:
    """Return a simple frequency map for detected diagnostic trouble codes.

    The implementation is intentionally minimal while the analytics pipeline
    is under construction.
    """
    summary: dict[str, int] = {}
    for code in codes:
        summary[code] = summary.get(code, 0) + 1
    return summary
