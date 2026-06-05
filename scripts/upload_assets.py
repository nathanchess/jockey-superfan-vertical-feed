"""
Upload local MP4/MOV files to TwelveLabs as assets (multipart).

Usage (repo root):
  python scripts/upload_assets.py                    # all *.mp4 in assets/proxies/
  python scripts/upload_assets.py path/to/file.mp4   # single file

Requires TL_API_KEY in repo-root .env.
Prints asset IDs for DEFAULT_ASSET_IDS in ranking.py.
"""

from __future__ import annotations

import os
import sys
import time
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

DEFAULT_INPUT_DIR = ROOT / "assets" / "proxies"
VIDEO_SUFFIXES = {".mp4", ".mov", ".m4v", ".webm"}


def collect_files(args: list[str]) -> list[Path]:
    if args:
        paths = [Path(a).resolve() for a in args]
        for p in paths:
            if not p.is_file():
                raise SystemExit(f"Not a file: {p}")
            if p.suffix.lower() not in VIDEO_SUFFIXES:
                raise SystemExit(f"Unsupported extension: {p}")
        return paths

    if not DEFAULT_INPUT_DIR.is_dir():
        raise SystemExit(
            f"No input dir {DEFAULT_INPUT_DIR}. Pass file paths or create proxies first "
            f"(see assets/README.md)."
        )

    files = sorted(
        p for p in DEFAULT_INPUT_DIR.iterdir()
        if p.is_file() and p.suffix.lower() in VIDEO_SUFFIXES
    )
    if not files:
        raise SystemExit(f"No video files in {DEFAULT_INPUT_DIR}")
    return files


def upload_file(client, path: Path) -> str:
    from twelvelabs import TwelveLabs

    if not isinstance(client, TwelveLabs):
        raise TypeError("expected TwelveLabs client")

    def on_progress(progress) -> None:
        pct = getattr(progress, "percentage", None)
        done = getattr(progress, "completed_chunks", "?")
        total = getattr(progress, "total_chunks", "?")
        if pct is not None:
            print(f"  {path.name}: {pct:.1f}% ({done}/{total} chunks)", flush=True)

    print(f"Uploading {path.name} ({path.stat().st_size / (1024**2):.1f} MB)...", flush=True)
    result = client.multipart_upload.upload_file(
        str(path),
        filename=path.name,
        progress_callback=on_progress,
        max_workers=3,
    )
    asset_id = result.asset_id
    if not asset_id:
        raise RuntimeError(f"No asset_id returned for {path.name}")
    return asset_id


def poll_ready(asset_id: str, interval: float = 5.0) -> None:
    import requests

    api_key = os.environ["TL_API_KEY"]
    base = os.getenv("TWELVELABS_API_BASE", "https://api.twelvelabs.io/v1.3").rstrip("/")
    headers = {"x-api-key": api_key}

    while True:
        res = requests.get(f"{base}/assets/{asset_id}", headers=headers, timeout=60)
        res.raise_for_status()
        status = res.json().get("status", "unknown")
        if status == "ready":
            print(f"  Asset {asset_id} ready.", flush=True)
            return
        if status == "failed":
            raise RuntimeError(f"Asset {asset_id} failed processing")
        print(f"  status={status}, waiting...", flush=True)
        time.sleep(interval)


def main() -> None:
    api_key = os.getenv("TL_API_KEY", "").strip()
    if not api_key:
        raise SystemExit("Set TL_API_KEY in repo-root .env")

    from twelvelabs import TwelveLabs

    client = TwelveLabs(api_key=api_key)
    files = collect_files(sys.argv[1:])
    asset_ids: list[str] = []

    print(f"\nUploading {len(files)} file(s) to TwelveLabs\n", flush=True)
    for path in files:
        asset_id = upload_file(client, path)
        poll_ready(asset_id)
        asset_ids.append(asset_id)
        print(f"  -> {asset_id}\n", flush=True)

    print("Done. Add to ranking.py DEFAULT_ASSET_IDS:")
    print(repr(asset_ids))


if __name__ == "__main__":
    main()
