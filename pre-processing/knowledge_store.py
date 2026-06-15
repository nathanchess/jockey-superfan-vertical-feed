"""
Create a Jockey Knowledge Store for a show and populate it with all assets from
that show's Marengo index.

Usage:
    python pre-processing/knowledge_store.py kn
    python pre-processing/knowledge_store.py tiwbg
    python pre-processing/knowledge_store.py rhoslc   # skip if already done

What this script does (with logging):
  1. Lists all indexed asset IDs from the show's Marengo index (paginated).
  2. Creates a new Jockey KS for the show (one-time; errors if already exists).
  3. Writes TL_KS_ID_<SHOW>=<ks_id> into the root .env file.
  4. Adds each asset to the KS and polls until it is ready.
"""

from __future__ import annotations

import os
import sys
import time
from pathlib import Path

import requests
from dotenv import load_dotenv

# ── Paths & config ────────────────────────────────────────────────────────────

ROOT = Path(__file__).resolve().parent.parent
LOCAL_ENV_PATH = ROOT / ".env"
load_dotenv(LOCAL_ENV_PATH)

BASE_URL = "https://api.twelvelabs.io/v1.3"

# Mirror of app/lib/shows.ts — keep in sync when adding new shows
SHOW_CONFIG: dict[str, dict] = {
    "kn": {
        "label": "Kitchen Nightmares",
        "index_id": "6a2dba984c3eea0190eb15d2",
        "ks_env_key": "TL_KS_ID_KN",
    },
    "tiwbg": {
        "label": "The Island with Bear Grylls",
        "index_id": "6a2db9ab363f9692ab328682",
        "ks_env_key": "TL_KS_ID_TIWBG",
    },
    "rhoslc": {
        "label": "The Real Housewives of Salt Lake City",
        "index_id": "6a14a5a034a962bb1b63c81f",
        "ks_env_key": "TL_KS_ID_RHOSLC",
    },
}

SUPERFAN_CTV_ENRICHMENT_JSON_SCHEMA = {
    "type": "json_schema",
    "json_schema": {
        "type": "object",
        "properties": {
            "primary_scene_category": {
                "type": "string",
                "description": "Dominant moment type for specific scene for vertical-feed taxonomy and profile matching",
            },
            "subtags": {
                "type": "array",
                "description": (
                    "Concrete visual/audio signals of scene for what is happening and can be heard in the scene"
                ),
                "items": {"type": "string"},
                "maxItems": 5,
            },
            "description": {
                "type": "string",
                "description": (
                    "Precise moment summary: who, what happened, tone, body language, "
                    "and dialogue subtext for long-form episodic TV. Should pinpoint exact names and map to people."
                ),
            },
            "emotional_intensity": {
                "type": "string",
                "description": "Salience for feed ranking and profile intensity preference",
                "enum": ["low", "medium", "high", "explosive"],
            },
            "key_figures": {
                "type": "array",
                "description": "On-screen people or named participants; pairs or groups in conflict/alliance when clear.",
                "items": {"type": "string"},
            },
            "feed_headline": {
                "type": "string",
                "description": "One short headline suitable for a vertical clip card",
            },
            "scene_setting": {
                "type": "string",
                "description": (
                    "Setting type: interview, ensemble_conversation, event, travel, "
                    "home, workplace, competition_stage, other"
                ),
            },
            "cross_episode_significance": {
                "type": "string",
                "description": (
                    "If inferable: recurring storyline, callback, finale/reunion relevance, "
                    "or franchise-defining beat; empty string if none"
                ),
            },
        },
        "required": [
            "primary_scene_category",
            "subtags",
            "description",
            "emotional_intensity",
            "key_figures",
            "feed_headline",
        ],
    },
}

# ── Helpers ───────────────────────────────────────────────────────────────────

def get_headers() -> dict[str, str]:
    api_key = os.getenv("TL_API_KEY", "").strip()
    if not api_key:
        print("[ERROR] TL_API_KEY is not set in .env", file=sys.stderr)
        sys.exit(1)
    return {"x-api-key": api_key, "Content-Type": "application/json"}


def read_env_value(key: str) -> str | None:
    """Read a specific key from the .env file (not os.environ, to get latest value)."""
    if not LOCAL_ENV_PATH.exists():
        return None
    for line in LOCAL_ENV_PATH.read_text(encoding="utf-8").splitlines():
        if line.startswith(f"{key}="):
            val = line[len(key) + 1:].strip()
            return val if val else None
    return None


def write_env_value(key: str, value: str) -> None:
    """Upsert a KEY=value line in the root .env file."""
    lines = LOCAL_ENV_PATH.read_text(encoding="utf-8").splitlines()
    new_lines = []
    found = False
    for line in lines:
        if line.startswith(f"{key}="):
            new_lines.append(f"{key}={value}")
            found = True
        else:
            new_lines.append(line)
    if not found:
        new_lines.append(f"{key}={value}")
    LOCAL_ENV_PATH.write_text("\n".join(new_lines) + "\n", encoding="utf-8")
    print(f"[ENV] Wrote {key}={value} -> {LOCAL_ENV_PATH}")


# ── Step 1: List assets from index ────────────────────────────────────────────

def list_index_assets(index_id: str) -> list[str]:
    headers = get_headers()
    asset_ids: list[str] = []
    page = 1
    total_pages = 1

    print(f"[STEP 1] Listing assets in index {index_id} …")

    while page <= total_pages:
        url = f"{BASE_URL}/indexes/{index_id}/indexed-assets?page={page}&page_limit=50"
        print(f"  Fetching page {page}/{total_pages} …")
        resp = requests.get(url, headers=headers)

        if not resp.ok:
            print(f"[ERROR] GET {url} -> {resp.status_code}: {resp.text[:300]}", file=sys.stderr)
            sys.exit(1)

        body = resp.json()
        for item in body.get("data", []):
            # indexed-assets: '_id' is the indexed-video ID; 'asset_id' is the real asset ID
            # Jockey KS needs the 'asset_id' field, not '_id'
            asset_id = item.get("asset_id") or item.get("_id")
            if asset_id:
                asset_ids.append(asset_id)

        page_info = body.get("page_info", {})
        total_pages = page_info.get("total_page", 1)
        page += 1

    print(f"  Found {len(asset_ids)} asset(s).")
    return asset_ids


# ── Step 2: Create knowledge store ────────────────────────────────────────────

def create_knowledge_store(show_label: str, ks_env_key: str) -> str:
    headers = get_headers()
    existing = read_env_value(ks_env_key)
    if existing:
        print(f"[STEP 2] KS already exists ({ks_env_key}={existing}). Skipping creation.")
        return existing

    print(f"[STEP 2] Creating Jockey KS for '{show_label}' …")
    resp = requests.post(
        f"{BASE_URL}/knowledge-stores",
        headers=headers,
        json={
            "name": f"superfan-{show_label.lower().replace(' ', '-')}",
            "ingestion_config": {
                "enrichment_config": SUPERFAN_CTV_ENRICHMENT_JSON_SCHEMA,
            },
        },
    )

    if not resp.ok:
        print(f"[ERROR] Create KS failed ({resp.status_code}): {resp.text[:300]}", file=sys.stderr)
        sys.exit(1)

    ks_id = resp.json().get("_id") or resp.json().get("id")
    if not ks_id:
        print(f"[ERROR] Unexpected response: {resp.json()}", file=sys.stderr)
        sys.exit(1)

    write_env_value(ks_env_key, ks_id)
    print(f"  Created KS: {ks_id}")
    return ks_id


# ── Step 3: Add assets to knowledge store ─────────────────────────────────────

def add_assets_to_ks(ks_id: str, asset_ids: list[str]) -> None:
    headers = get_headers()
    total = len(asset_ids)
    print(f"[STEP 3] Adding {total} asset(s) to KS {ks_id} …")

    for idx, asset_id in enumerate(asset_ids, start=1):
        print(f"  [{idx}/{total}] Adding asset {asset_id} …")

        resp = requests.post(
            f"{BASE_URL}/knowledge-stores/{ks_id}/items",
            headers=headers,
            json={"asset_id": asset_id},
        )

        if not resp.ok:
            print(f"  [WARN] Failed to add {asset_id} ({resp.status_code}): {resp.text[:200]}")
            continue

        item_id = resp.json().get("_id")
        if not item_id:
            print(f"  [WARN] No item_id returned for {asset_id}; skipping poll.")
            continue

        print(f"  Polling item {item_id} until ready …")
        poll_attempts = 0
        while True:
            poll_attempts += 1
            status_resp = requests.get(
                f"{BASE_URL}/knowledge-stores/{ks_id}/items/{item_id}",
                headers=headers,
            )

            if not status_resp.ok:
                print(f"  [WARN] Poll failed ({status_resp.status_code}) — retrying in 5s …")
                time.sleep(5)
                continue

            status = status_resp.json().get("status", "unknown")
            print(f"  status={status} (attempt {poll_attempts})")

            if status == "ready":
                print(f"  [OK] Asset {asset_id} is ready in KS.")
                break
            elif status == "failed":
                print(f"  [ERROR] Asset {asset_id} failed enrichment — skipping.")
                break
            else:
                time.sleep(5)

    print(f"[STEP 3] Done. All assets processed for KS {ks_id}.")


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    if len(sys.argv) < 2:
        print(f"Usage: python {sys.argv[0]} <show>", file=sys.stderr)
        print(f"  <show> is one of: {', '.join(sorted(SHOW_CONFIG))}", file=sys.stderr)
        sys.exit(1)

    show = sys.argv[1].lower().strip()
    if show not in SHOW_CONFIG:
        print(f"[ERROR] Unknown show '{show}'. Known: {', '.join(sorted(SHOW_CONFIG))}", file=sys.stderr)
        sys.exit(1)

    cfg = SHOW_CONFIG[show]
    print(f"=== Knowledge Store setup for '{cfg['label']}' (show={show}) ===\n")

    # Step 1: get all asset IDs from the Marengo index
    asset_ids = list_index_assets(cfg["index_id"])
    if not asset_ids:
        print("[WARN] No assets found — nothing to add to KS. Exiting.")
        sys.exit(0)

    # Step 2: create KS (idempotent — skips if already exists)
    ks_id = create_knowledge_store(cfg["label"], cfg["ks_env_key"])

    # Step 3: add assets to KS
    add_assets_to_ks(ks_id, asset_ids)

    print(f"\n=== Setup complete for '{cfg['label']}' ===")
    print(f"  KS ID : {ks_id}")
    print(f"  Assets: {len(asset_ids)}")
    print(f"\nNext steps:")
    print(f"  python ranking.py segment {show}")
    print(f"  python ranking.py jockey {show}")
    print(f"  python scripts/sync_manifest.py {show}")


if __name__ == "__main__":
    main()
