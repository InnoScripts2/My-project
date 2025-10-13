from __future__ import annotations

import pathlib
import sys


PACKAGE_NAMESPACE_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(PACKAGE_NAMESPACE_ROOT) not in sys.path:
    sys.path.insert(0, str(PACKAGE_NAMESPACE_ROOT))

from packages.selfservice_diagnostics import summarize_dtc


def test_summarize_dtc_counts_occurrences() -> None:
    result = summarize_dtc(["P0420", "P0300", "P0420"])
    assert result == {"P0420": 2, "P0300": 1}
