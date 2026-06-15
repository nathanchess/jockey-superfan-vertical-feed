"""Copy slim segment manifest from repo data/ into app/data/ for Next.js."""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Map show slug -> (source under data/, destination under app/data/)
SHOW_SYNC_PATHS: dict[str, tuple[Path, Path]] = {
    "kn": (
        ROOT / "data" / "kn_feed_manifest.json",
        ROOT / "app" / "data" / "kn_feed_manifest.json",
    ),
    "tiwbg": (
        ROOT / "data" / "tiwbg_feed_manifest.json",
        ROOT / "app" / "data" / "tiwbg_feed_manifest.json",
    ),
    "rhoslc": (
        ROOT / "data" / "rhoslc_feed_manifest.json",
        ROOT / "app" / "data" / "rhoslc_feed_manifest.json",
    ),
}

DEFAULT_SHOW = "kn"

sys.path.insert(0, str(ROOT))
from ranking import (
    apply_manifest_show_name,
    merge_jockey_boosts_onto_segments,
    resolve_jockey_feed_clips,
)


def sync_show(show_id: str = DEFAULT_SHOW) -> None:
    paths = SHOW_SYNC_PATHS.get(show_id)
    if not paths:
        known = ", ".join(sorted(SHOW_SYNC_PATHS))
        raise SystemExit(f"Unknown show {show_id!r}. Known: {known}")

    src, dst = paths
    if not src.is_file():
        raise SystemExit(f"Source manifest not found: {src}")

    manifest = json.loads(src.read_text(encoding="utf-8"))
    segments = manifest.get("segments", [])
    if not segments and manifest.get("by_asset_id"):
        segments = []
        for aid in manifest.get("asset_ids", []):
            block = manifest["by_asset_id"].get(aid, {})
            segments.extend(block.get("segments", []))

    jockey_clips_raw = manifest.get("jockey_feed_clips", [])
    if jockey_clips_raw:
        jockey_clips, map_stats = resolve_jockey_feed_clips(jockey_clips_raw)
        print(f"KS asset map: {map_stats}")
    else:
        jockey_clips = []
    merged = merge_jockey_boosts_onto_segments(segments, jockey_clips) if jockey_clips else 0
    apply_manifest_show_name(segments, manifest.get("show_name"))

    slim = {
        "show_id": show_id,
        "generated_at": manifest.get("generated_at"),
        "asset_ids": manifest.get("asset_ids", []),
        "show_name": manifest.get("show_name"),
        "segments": segments,
    }
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(json.dumps(slim, indent=2), encoding="utf-8")
    print(f"Synced {len(slim['segments'])} segments -> {dst}")
    if jockey_clips:
        print(f"Merged jockey_boost onto {merged} segment(s) (of {len(jockey_clips)} jockey clips)")


def main() -> None:
    show_id = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_SHOW
    sync_show(show_id)


if __name__ == "__main__":
    main()
