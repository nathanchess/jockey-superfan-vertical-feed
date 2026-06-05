"""Copy slim segment manifest from repo data/ into app/data/ for Next.js."""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "feed_manifest.json"
DST = ROOT / "app" / "data" / "feed_manifest_v2.json"

sys.path.insert(0, str(ROOT))
from ranking import (
    apply_manifest_show_name,
    merge_jockey_boosts_onto_segments,
    resolve_jockey_feed_clips,
)


def main() -> None:
    manifest = json.loads(SRC.read_text(encoding="utf-8"))
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
        "generated_at": manifest.get("generated_at"),
        "asset_ids": manifest.get("asset_ids", []),
        "show_name": manifest.get("show_name"),
        "segments": segments,
    }
    DST.parent.mkdir(parents=True, exist_ok=True)
    DST.write_text(json.dumps(slim, indent=2), encoding="utf-8")
    print(f"Synced {len(slim['segments'])} segments -> {DST}")
    if jockey_clips:
        print(f"Merged jockey_boost onto {merged} segment(s) (of {len(jockey_clips)} jockey clips)")


if __name__ == "__main__":
    main()
