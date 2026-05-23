#!/usr/bin/env python3
"""Live Nimble test with structured CT.gov API params.

Usage (from backend/):
  uv run python scripts/test_nimble_structured.py
  uv run python scripts/test_nimble_structured.py --location "Boston" --cancer-type "testicular cancer"
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

# Allow running as a script without installing the package
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import app.bootstrap_env  # noqa: F401

from app.clients.nimble_client import TrialSearchParams, extract_structured, extract_search_page


def main() -> None:
    parser = argparse.ArgumentParser(description="Test Nimble structured trial extract")
    parser.add_argument("--cancer-type", default="testicular cancer")
    parser.add_argument("--location", default="Boston")
    parser.add_argument("--requirements", default=None)
    parser.add_argument("--page-size", type=int, default=5)
    parser.add_argument(
        "--mode",
        choices=["api", "search", "both"],
        default="api",
        help="api=CT.gov JSON via Nimble vx6; search=rendered search page",
    )
    args = parser.parse_args()

    params = TrialSearchParams(
        cancer_type=args.cancer_type,
        location=args.location,
        requirements=args.requirements,
        page_size=args.page_size,
    )

    if args.mode in ("api", "both"):
        print("=== Structured API extract (Nimble → CT.gov API v2) ===")
        result = extract_structured(params)
        print(json.dumps(result, indent=2)[:4000])
        print(f"\n→ {result['resultCount']} trials\n")

    if args.mode in ("search", "both"):
        print("=== Search page scrape (Nimble vx10 + render) ===")
        raw = extract_search_page(params)
        from app.clients.nimble_client import count_trial_results

        count = count_trial_results(raw)
        print("nimble status:", raw.get("status"), "| NCT ids found:", count)


if __name__ == "__main__":
    main()
