"""
List all indexed asset IDs for a given show's Marengo index.

Usage:
    python scripts/list_index_assets.py kn
    python scripts/list_index_assets.py tiwbg
    python scripts/list_index_assets.py rhoslc

Output: one asset_id per line (24-char hex), suitable for piping or review.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import requests
from dotenv import load_dotenv

# ── Config ────────────────────────────────────────────────────────────────────

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

BASE_URL = "https://api.twelvelabs.io/v1.3"

# Mirror of app/lib/shows.ts — keep in sync when adding new shows
SHOW_INDEX_IDS: dict[str, str] = {
    "kn": "6a2dba984c3eea0190eb15d2",
    "tiwbg": "6a2db9ab363f9692ab328682",
    "rhoslc": "6a14a5a034a962bb1b63c81f",
}

# ── Helpers ───────────────────────────────────────────────────────────────────

def get_headers() -> dict[str, str]:
    api_key = os.getenv("TL_API_KEY", "").strip()
    if not api_key:
        print("[ERROR] TL_API_KEY is not set in .env", file=sys.stderr)
        sys.exit(1)
    return {"x-api-key": api_key, "Content-Type": "application/json"}


def list_assets_for_index(index_id: str) -> list[str]:
    """Return all asset_ids from a Marengo index, handling pagination."""
    headers = get_headers()
    asset_ids: list[str] = []
    page = 1
    total_pages = 1

    print(f"[INFO] Fetching assets from index {index_id} …")

    while page <= total_pages:
        url = f"{BASE_URL}/indexes/{index_id}/indexed-assets?page={page}&page_limit=50"
        print(f"[INFO]   Page {page}/{total_pages} …")
        resp = requests.get(url, headers=headers)

        if not resp.ok:
            print(f"[ERROR] GET {url} -> {resp.status_code}: {resp.text[:200]}", file=sys.stderr)
            sys.exit(1)

        body = resp.json()

        # TL API wraps results in 'data'
        for item in body.get("data", []):
            # indexed-assets: '_id' is the indexed-video ID; 'asset_id' is the real asset ID
            # Jockey KS and Pegasus both need the 'asset_id' field, not '_id'
            asset_id = item.get("asset_id") or item.get("_id")
            if asset_id:
                asset_ids.append(asset_id)

        page_info = body.get("page_info", {})
        total_pages = page_info.get("total_page", 1)
        page += 1

    return asset_ids


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    if len(sys.argv) < 2:
        print(f"Usage: python {sys.argv[0]} <show>", file=sys.stderr)
        print(f"  <show> is one of: {', '.join(sorted(SHOW_INDEX_IDS))}", file=sys.stderr)
        sys.exit(1)

    show = sys.argv[1].lower().strip()
    if show not in SHOW_INDEX_IDS:
        print(f"[ERROR] Unknown show '{show}'. Known: {', '.join(sorted(SHOW_INDEX_IDS))}", file=sys.stderr)
        sys.exit(1)

    index_id = SHOW_INDEX_IDS[show]
    asset_ids = list_assets_for_index(index_id)

    if not asset_ids:
        print(f"[WARN] No assets found in index {index_id} for show '{show}'")
        return

    print(f"\n[RESULT] Found {len(asset_ids)} asset(s) for show '{show}' (index {index_id}):")
    for aid in asset_ids:
        print(aid)

    # Also print as a Python list for easy copy-paste into ranking.py
    print(f"\n# Python list:\nDEFAULT_ASSET_IDS_{show.upper()} = {asset_ids!r}")


if __name__ == "__main__":
    main()
