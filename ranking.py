"""
Superfan feed ranking and Pegasus 1.5 scene segmentation (Step 0 manifest).
"""

from __future__ import annotations

import json
import os
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from collections.abc import Iterator
from typing import Any

import requests
from dotenv import load_dotenv
from functools import lru_cache

_ENV_PATH = Path(__file__).resolve().parent / ".env"
load_dotenv(_ENV_PATH)

# Pegasus 1.5 + time_based_metadata output token ceiling (see SDK analyze_async.tasks.create docs).
#
# With fixed 30s windows, Pegasus may emit more segment instances than the
# natural-beat mode. Lower this so the task doesn't fail with:
# "input exceeded model context window".
PEGASUS_15_SEGMENTATION_MAX_TOKENS = 8192
SEGMENT_MIN_DURATION_SEC = 10.0
SEGMENT_MAX_DURATION_SEC = 30.0
DEFAULT_ASSET_IDS = [
    "6a14ddbaddce351fa0ae8952",
    "6a14ddba163adca316ecc289",
    "6a14ddba853a852798e911d5",
    "6a14ddba15649e226a0448c8",
    "6a14ddbbbe7b2161f2b604f0",
]
DEFAULT_COMBINED_MANIFEST_PATH = Path(__file__).resolve().parent / "data" / "rhoslc_feed_manifest.json"
BASE_URL = "https://api.twelvelabs.io/v1.3"
DEFAULT_JOCKEY_TOP_N = 30
JOCKEY_MATCH_TOLERANCE_SEC = 15
_HEX_ASSET_ID_RE = re.compile(r"^[a-f0-9]{24}$", re.IGNORECASE)

SCORE_BASE = 1.0
SCORE_SUBTAG = 0.25
SCORE_INTENSITY = 0.5
SCORE_JOCKEY = 1.0

PREFERENCE_PROFILES = {
    "drama_addict": {
        "categories": ["fights_confrontation", "shade_gossip", "emotional_moments"],
        "intensity_preference": "high",
        "subtag_boosts": ["screaming", "walkout", "betrayal"],
    },
    "fashion_obsessed": {
        "categories": ["luxury_fashion", "parties_nightlife"],
        "intensity_preference": "any",
        "subtag_boosts": ["designer_clothes", "jewelry_moment", "brand_callout"],
    },
    "romance_fan": {
        "categories": ["romance_relationships", "emotional_moments"],
        "intensity_preference": "medium",
        "subtag_boosts": ["kiss", "heartfelt_confession", "reconciliation"],
    },
}

# Primary category -> allowed subtags (Pegasus segment enums + ranking boosts).
CATEGORY_ENUMS: dict[str, list[str]] = {
    "fights_confrontation": [
        "screaming",
        "crying",
        "walkout",
        "physical_altercation",
        "hair_pulling",
        "table_flip",
        "glass_throw",
    ],
    "luxury_fashion": [
        "designer_clothes",
        "jewelry_moment",
        "fancy_cars",
        "mansion_tour",
        "shopping_spree",
        "brand_callout",
    ],
    "romance_relationships": [
        "kiss",
        "date_night",
        "proposal",
        "breakup_moment",
        "flirting",
        "jealousy_scene",
        "reconciliation",
    ],
    "humor_awkward": [
        "awkward_silence",
        "verbal_slip",
        "physical_comedy",
        "reaction_shot",
        "shade_throwing",
        "side_eye",
    ],
    "parties_nightlife": [
        "club_scene",
        "dinner_party",
        "champagne_toast",
        "dance_moment",
        "group_outing",
        "vacation_scene",
    ],
    "emotional_moments": [
        "heartfelt_confession",
        "apology",
        "vulnerability",
        "family_moment",
        "tears_of_joy",
        "support_scene",
    ],
    "shade_gossip": [
        "talking_behind_back",
        "revealing_secret",
        "confrontation_buildup",
        "alliance_forming",
        "betrayal",
    ],
}

PRIMARY_CATEGORIES: tuple[str, ...] = tuple(CATEGORY_ENUMS.keys())

# Flat 1D subtag catalog (<= 50 values for per-item enum on array fields).
SUBTAG_ENUM: list[str] = list(
    dict.fromkeys(tag for tags in CATEGORY_ENUMS.values() for tag in tags)
)
SUBTAG_ENUM_SET = set(SUBTAG_ENUM)

# Pegasus sometimes emits category slugs or loose labels in subtags[].
SUBTAG_ALIASES: dict[str, str] = {
    "group_fight": "physical_altercation",
    "drama": "betrayal",
    "friendship_drama": "betrayal",
    "tears": "crying",
    "confrontation": "confrontation_buildup",
}


def normalize_subtag(tag: str) -> str:
    if tag in SUBTAG_ENUM_SET:
        return tag
    return SUBTAG_ALIASES.get(tag, tag)


def score_segment_row(seg: dict[str, Any], p: dict[str, Any]) -> tuple[float, dict[str, float]]:
    breakdown: dict[str, float] = {"base": SCORE_BASE}
    score = SCORE_BASE
    credited: set[str] = set()
    categories = set(p["categories"])
    subtag_boosts = set(p["subtag_boosts"])

    def credit(key: str) -> None:
        if key in credited:
            return
        credited.add(key)
        score += SCORE_SUBTAG
        breakdown[key] = SCORE_SUBTAG

    for raw_tag in seg.get("subtags", []):
        tag = normalize_subtag(raw_tag)
        if tag in subtag_boosts and tag in SUBTAG_ENUM_SET:
            credit(f"subtag_{tag}")
            continue
        if (
            raw_tag in PRIMARY_CATEGORIES
            and raw_tag in categories
            and raw_tag != seg["primary_category"]
        ):
            credit(f"category_{raw_tag}")

    if intensity_matches_preference(seg["emotional_intensity"], p["intensity_preference"]):
        score += SCORE_INTENSITY
        breakdown["intensity"] = SCORE_INTENSITY
    if seg.get("jockey_boost"):
        score += SCORE_JOCKEY
        breakdown["jockey"] = SCORE_JOCKEY
    return score, breakdown

# POST /responses json_schema — same taxonomy + 0–10 intensity as Pegasus segments.
JOCKEY_FEED_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "feed_clips": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "asset_id": {"type": "string"},
                    "start_sec": {"type": "number"},
                    "end_sec": {"type": "number"},
                    "primary_category": {
                        "type": "string",
                        "enum": list(PRIMARY_CATEGORIES),
                    },
                    "subtags": {
                        "type": "array",
                        "items": {
                            "type": "string",
                            "enum": SUBTAG_ENUM,
                        },
                    },
                    "feed_headline": {"type": "string"},
                    "emotional_intensity": {
                        "type": "integer",
                        "minimum": 0,
                        "maximum": 10,
                    },
                    "key_participants": {
                        "type": "array",
                        "items": {"type": "string"},
                    },
                    "show_name": {
                        "type": "string",
                        "description": (
                            "Series/franchise title for this clip; should match the "
                            "top-level show_name when part of the same program."
                        ),
                    },
                    "cross_episode_significance": {"type": "string"},
                    "jockey_reasoning": {"type": "string"},
                },
                "required": [
                    "asset_id",
                    "start_sec",
                    "end_sec",
                    "primary_category",
                    "feed_headline",
                    "emotional_intensity",
                    "show_name",
                    "cross_episode_significance",
                    "jockey_reasoning",
                ],
            },
        },
        "show_name": {
            "type": "string",
            "description": (
                "Official or best-inferred title of the series/franchise represented "
                "across the knowledge store (e.g. 'The Real Housewives of Salt Lake City')."
            ),
        },
        "season_context": {"type": "string"},
    },
    "required": ["show_name", "feed_clips"],
}

JOCKEY_INSTRUCTIONS = (
    "You are a reality-TV superfan feed curator. Analyze the full video inventory "
    "in this knowledge store and identify the most shareable, emotionally resonant, "
    "cross-episode defining moments for a vertical clip feed. "
    "Infer show_name from on-screen branding, cast, narration, or episode context. "
    "Use only primary_category and subtag slugs from the response schema enums. "
    "Rate emotional_intensity as an integer from 0 (neutral) to 10 (maximum). "
    "Write all viewer-facing prose for superfans who watch the full series—not producers."
)

JOCKEY_USER_PROMPT_TEMPLATE = (
    "Find the top {top_n} most significant cross-episode moments across all videos "
    "in this knowledge store.\n\n"
    "Return show_name (series title for the corpus), optional season_context, and feed_clips.\n\n"
    "For each clip include: asset_id, start_sec, end_sec, primary_category, subtags, "
    "feed_headline, emotional_intensity (0–10), key_participants, show_name, "
    "cross_episode_significance, and jockey_reasoning.\n\n"
    "cross_episode_significance: Explain how this moment connects to storylines, callbacks, "
    "or character arcs across multiple episodes of the same show. Name the show explicitly "
    "(use show_name). Write for viewers who follow the full series—why this beat matters "
    "in the larger run of the show, not just in isolation.\n\n"
    "jockey_reasoning: 2–3 sentences framed for feed viewers. Structure: (1) What this "
    "segment highlights. (2) Why that makes a great clip for specific superfan types "
    "(e.g. drama addicts, fashion fans, romance fans—pick those that fit the moment). "
    "(3) Why Jockey elevated it using corpus-wide context across all of [show_name] in "
    "the knowledge store. Use the show title by name; tie the moment to series-wide importance."
)

def intensity_matches_preference(
    emotional_intensity: int,
    intensity_preference: str,
) -> bool:
    """
    Map segment emotional_intensity (0–10) to persona intensity_preference.

    Persona values: high (8–10), medium (6–8), any (always matches — no intensity gate).
    """
    if intensity_preference == "any":
        return True
    if intensity_preference == "high":
        return emotional_intensity >= 8
    if intensity_preference == "medium":
        return 6 <= emotional_intensity <= 8
    return False


class DiversifiedFeedIterator:
    """
    Endless vertical-feed iterator: interleaves top-scored clips per category.

    Each round yields one segment from each category (highest scores first within
    the category), then advances depth. When all depths are exhausted, loops from
    the top — mimics infinite scroll while keeping diversity and strong scores.
    """

    def __init__(
        self,
        segments: list[dict[str, Any]],
        profile: str,
        preference_profiles: dict[str, Any],
    ) -> None:
        p = preference_profiles[profile]
        categories = set(p["categories"])

        buckets: dict[str, list[dict[str, Any]]] = {}
        for seg in segments:
            if seg["primary_category"] not in categories:
                continue
            score, breakdown = score_segment_row(seg, p)
            row = {**seg, "match_score": score, "score_breakdown": breakdown}
            buckets.setdefault(seg["primary_category"], []).append(row)

        for cat in buckets:
            buckets[cat].sort(key=lambda s: s["match_score"], reverse=True)

        self._buckets = buckets
        self._category_order = sorted(
            buckets.keys(),
            key=lambda c: buckets[c][0]["match_score"],
            reverse=True,
        )
        self._max_depth = max((len(v) for v in buckets.values()), default=0)
        self._depth = 0
        self._cat_index = 0
        self._scroll_index = 0

    def __iter__(self) -> Iterator[dict[str, Any]]:
        return self

    def __next__(self) -> dict[str, Any]:
        if not self._category_order:
            raise StopIteration
        n_cats = len(self._category_order)
        for _ in range(n_cats * max(self._max_depth, 1)):
            cat = self._category_order[self._cat_index]
            if self._depth < len(self._buckets[cat]):
                seg = {
                    **self._buckets[cat][self._depth],
                    "scroll_index": self._scroll_index,
                }
                self._scroll_index += 1
                self._cat_index = (self._cat_index + 1) % n_cats
                if self._cat_index == 0:
                    self._depth += 1
                    if self._depth >= self._max_depth:
                        self._depth = 0
                return seg
            self._cat_index = (self._cat_index + 1) % n_cats
            if self._cat_index == 0:
                self._depth += 1
                if self._depth >= self._max_depth:
                    self._depth = 0
        raise StopIteration

FEED_MOMENT_SEGMENT_ID = "feed_moment"

FEED_MOMENT_SEGMENT_DESCRIPTION = (
    "A self-contained 30-second highlight beat for a vertical superfan feed. "
    "Each window should capture one complete moment: argument, reveal, joke, "
    "celebration, fashion beat, or emotional turn. Prefer natural story boundaries "
    "within the 30s window; skip dead air or filler unless that is the beat."
)

_EXPLANATION_FIELD_HINT = (
    "Why-this-clip copy for superfans. Structure: (1) 'This segment highlights …' "
    "(2) '…which is why it makes for a great clip for [audience type] fans watching [show_name].' "
    "Pick audience from primary_category (drama, fashion, romance, gossip, etc.). "
    "Use show_name field for the series title."
)

_SUBTAG_FIELD_HINT = (
    "Array of 1–5 subtag slugs (use only values from the item enum). "
    "Prefer subtags that fit the segment primary_category."
)
_CATEGORY_FIELD_HINT = (
    "Dominant superfan-feed taxonomy slug for this segment (use only the field enum)."
)

_SHOW_NAME_FIELD_HINT = (
    "Series/franchise title from on-screen text, cast, or narration "
    "(e.g. 'The Real Housewives of Salt Lake City'). Empty string if unknown."
)

@lru_cache(maxsize=1)
def feed_moment_segment_definition() -> Any:
    from twelvelabs.types import SegmentDefinition, SegmentField, SegmentFieldItems

    return SegmentDefinition(
        id=FEED_MOMENT_SEGMENT_ID,
        description=FEED_MOMENT_SEGMENT_DESCRIPTION,
        fields=[
            SegmentField(
                name="primary_category",
                type="string",
                description=_CATEGORY_FIELD_HINT,
                enum=list(PRIMARY_CATEGORIES),
            ),
            SegmentField(
                name="subtags",
                type="array",
                description=_SUBTAG_FIELD_HINT,
                items=SegmentFieldItems(type="string", enum=SUBTAG_ENUM),
            ),
            SegmentField(
                name="emotional_intensity",
                type="integer",
                description=(
                    "How emotionally charged this segment is for a viewer: "
                    "1 = calm/neutral, 10 = maximum intensity (rage, devastation, euphoria, shock)."
                ),
                minimum=1,
                maximum=10,
            ),
            SegmentField(
                name="description",
                type="string",
                description=(
                    "Objective summary of what happens in this segment: who is involved, "
                    "what they do and say, setting, and tone. Use names when visible or "
                    "spoken; otherwise role labels (e.g. 'host', 'guest')."
                ),
            ),
            SegmentField(
                name="show_name",
                type="string",
                description=_SHOW_NAME_FIELD_HINT,
            ),
            SegmentField(
                name="explanation",
                type="string",
                description=_EXPLANATION_FIELD_HINT,
            ),
            SegmentField(
                name="feed_headline",
                type="string",
                description=(
                    "Short, punchy card headline for a vertical feed (under ~12 words), "
                    "no spoilers beyond this segment."
                ),
            ),
            SegmentField(
                name="key_participants",
                type="array",
                description=(
                    "People on screen or clearly speaking in this segment (cast, hosts, "
                    "guests). Max ~6 names or role labels."
                ),
                items=SegmentFieldItems(type="string"),
            ),
        ],
    )


def generate_feed_metadata(
    asset_id: str,
    *,
    poll_interval_sec: float = 5.0,
    custom_id: str | None = None,
) -> dict[str, Any]:
    """
    Run Pegasus 1.5 time-based segmentation on a TwelveLabs asset and return a manifest.

    Uses `analysis_mode=time_based_metadata` with custom segment fields aligned to
    CATEGORY_ENUMS / SUBTAG_ENUM. Segments are fixed at SEGMENT_MIN/MAX_DURATION_SEC (30s).
    """
    from twelvelabs import TwelveLabs
    from twelvelabs.types import AsyncResponseFormat, VideoContext_AssetId

    client = TwelveLabs(api_key=os.environ["TL_API_KEY"])

    create_response = client.analyze_async.tasks.create(
        model_name="pegasus1.5",
        video=VideoContext_AssetId(asset_id=asset_id),
        analysis_mode="time_based_metadata",
        temperature=0.2,
        max_tokens=PEGASUS_15_SEGMENTATION_MAX_TOKENS,
        min_segment_duration=SEGMENT_MIN_DURATION_SEC,
        max_segment_duration=SEGMENT_MAX_DURATION_SEC,
        custom_id=custom_id,
        response_format=AsyncResponseFormat(
            type="segment_definitions",
            segment_definitions=[feed_moment_segment_definition()],
        ),
    )

    task_id = create_response.task_id
    while True:
        task = client.analyze_async.tasks.retrieve(task_id=task_id)
        if task.status == "ready":
            break
        if task.status == "failed":
            raise RuntimeError(f"Segmentation task {task_id} failed: {task.error.message}")
        time.sleep(poll_interval_sec)

    raw_segments = json.loads(task.result.data)[FEED_MOMENT_SEGMENT_ID]
    segments = [
        {
            "segment_id": f"{asset_id[:8]}_seg_{i:04d}",
            "asset_id": asset_id,
            "start_sec": seg["start_time"],
            "end_sec": seg["end_time"],
            "duration_sec": round(seg["end_time"] - seg["start_time"], 3),
            **seg["metadata"],
        }
        for i, seg in enumerate(raw_segments)
    ]
    return {
        "asset_id": asset_id,
        "task_id": task_id,
        "status": task.status,
        "segments": segments,
        "raw_segment_count": len(segments),
        "usage": {
            "output_tokens": task.result.usage.output_tokens,
            "input_tokens": task.result.usage.input_tokens,
        },
    }

def save_feed_manifest(manifest: dict[str, Any], path: str | Path) -> Path:
    """Write manifest JSON for offline ranking."""
    out = Path(path)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return out

def build_combined_feed_manifest(
    asset_ids: list[str],
    *,
    poll_interval_sec: float = 5.0,
) -> dict[str, Any]:
    """
    Run Pegasus segmentation on each asset and return one lookup-friendly document.

    Keys:
      - by_asset_id: per-asset manifests from generate_feed_metadata
      - segments: flat list of every segment (includes asset_id on each row)
    """
    by_asset_id: dict[str, dict[str, Any]] = {}
    all_segments: list[dict[str, Any]] = []

    for i, asset_id in enumerate(asset_ids, start=1):
        print(f"[{i}/{len(asset_ids)}] Segmenting asset {asset_id} ...")
        manifest = generate_feed_metadata(
            asset_id,
            poll_interval_sec=poll_interval_sec,
            custom_id=f"superfan-seg-{asset_id[:8]}",
        )
        by_asset_id[asset_id] = manifest
        all_segments.extend(manifest["segments"])
        print(
            f"  -> {manifest['raw_segment_count']} segments "
            f"(task {manifest['task_id']})"
        )

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "asset_ids": asset_ids,
        "by_asset_id": by_asset_id,
        "segments": all_segments,
        "total_segments": len(all_segments),
    }

def list_knowledge_store_items(
    ks_id: str | None = None,
    *,
    api_key: str | None = None,
    base_url: str = BASE_URL,
    sort_by: str = "created_at",
    limit_per_page: int = 50,
) -> list[dict[str, Any]]:
    """
    List all items in a knowledge store (paginated).

    GET /knowledge-stores/{ks_id}/items?sort_by=created_at
    Each item has `_id` (ksi_…) and `asset_id` (24-char hex for GET /assets).
    """
    ks_id = ks_id or os.environ["TL_KS_ID"]
    api_key = api_key or os.environ["TL_API_KEY"]
    headers = {"x-api-key": api_key, "Content-Type": "application/json"}

    items: list[dict[str, Any]] = []
    page = 1
    while True:
        response = requests.get(
            f"{base_url}/knowledge-stores/{ks_id}/items",
            headers=headers,
            params={
                "sort_by": sort_by,
                "page": page,
                "limit_per_page": limit_per_page,
            },
            timeout=60,
        )
        response.raise_for_status()
        payload = response.json()
        items.extend(payload.get("data", []))
        page_info = payload.get("page_info") or {}
        total_page = page_info.get("total_page", page)
        if page >= total_page:
            break
        page += 1
    return items


def build_ks_item_asset_lookup(items: list[dict[str, Any]]) -> dict[str, str]:
    """
    Build lookup keys → 24-char hex asset_id.

    Jockey often returns the KSI UUID without the `ksi_` prefix; Pegasus segments use
    hex asset_id from ingest.
    """
    lookup: dict[str, str] = {}
    for item in items:
        ksi_id = item.get("_id")
        asset_id = item.get("asset_id")
        if not ksi_id or not asset_id:
            continue
        asset_id = str(asset_id).lower()
        lookup[ksi_id] = asset_id
        if ksi_id.startswith("ksi_"):
            lookup[ksi_id[4:]] = asset_id
    return lookup


def resolve_asset_id_from_ks(raw_id: str, lookup: dict[str, str]) -> str | None:
    """Map Jockey/KS citation id or hex asset_id → canonical 24-char hex."""
    raw = raw_id.strip()
    if _HEX_ASSET_ID_RE.match(raw):
        return raw.lower()
    if raw in lookup:
        return lookup[raw]
    if not raw.startswith("ksi_"):
        prefixed = f"ksi_{raw}"
        if prefixed in lookup:
            return lookup[prefixed]
    return None


def resolve_jockey_feed_clips(
    feed_clips: list[dict[str, Any]],
    lookup: dict[str, str] | None = None,
    *,
    ks_id: str | None = None,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """
    Rewrite each clip's asset_id to 24-char hex using the KS item listing.

    Preserves the original value on `jockey_asset_id_raw` when remapped.
    """
    if lookup is None:
        ks_items = list_knowledge_store_items(ks_id)
        lookup = build_ks_item_asset_lookup(ks_items)

    resolved: list[dict[str, Any]] = []
    stats = {"mapped": 0, "already_hex": 0, "unmapped": 0, "lookup_keys": len(lookup)}

    for clip in feed_clips:
        row = dict(clip)
        raw = str(row.get("asset_id", ""))
        hex_id = resolve_asset_id_from_ks(raw, lookup)
        if hex_id:
            if _HEX_ASSET_ID_RE.match(raw):
                stats["already_hex"] += 1
            else:
                stats["mapped"] += 1
                row["jockey_asset_id_raw"] = raw
            row["asset_id"] = hex_id
        else:
            stats["unmapped"] += 1
        resolved.append(row)

    return resolved, stats


def merge_jockey_boosts_onto_segments(
    segments: list[dict[str, Any]],
    feed_clips: list[dict[str, Any]],
    *,
    tolerance_sec: float = JOCKEY_MATCH_TOLERANCE_SEC,
) -> int:
    """Set jockey_boost on segments that overlap a resolved Jockey clip in time."""
    merged = 0
    for seg in segments:
        for clip in feed_clips:
            if seg.get("asset_id") != clip.get("asset_id"):
                continue
            if abs(seg["start_sec"] - clip["start_sec"]) > tolerance_sec:
                continue
            seg["jockey_boost"] = True
            if clip.get("cross_episode_significance"):
                seg["cross_episode_significance"] = clip["cross_episode_significance"]
            if clip.get("jockey_reasoning"):
                seg["jockey_reasoning"] = clip["jockey_reasoning"]
            if clip.get("show_name"):
                seg["show_name"] = clip["show_name"]
            merged += 1
            break
    return merged


def apply_manifest_show_name(
    segments: list[dict[str, Any]],
    show_name: str | None,
) -> None:
    """Fill missing segment show_name from corpus-level Jockey inference."""
    if not show_name:
        return
    for seg in segments:
        if not seg.get("show_name"):
            seg["show_name"] = show_name


def generate_jockey_top_n_segments(
    asset_manifests: list[dict[str, Any]],
    *,
    top_n: int = DEFAULT_JOCKEY_TOP_N,
    ks_id: str | None = None,
) -> dict[str, Any]:
    """
    Cross-episode top moments via Jockey POST /responses (jockey1.0 + knowledge store).

    Taxonomy enums match Pegasus (PRIMARY_CATEGORIES, SUBTAG_ENUM, intensity 0–10).
    Pass ks_id to override the TL_KS_ID env var (used for multi-show support).
    """
    resolved_ks_id = ks_id or os.environ.get("TL_KS_ID", "")
    if not resolved_ks_id:
        raise ValueError("No KS ID available. Set TL_KS_ID or pass ks_id= explicitly.")
    body = {
        "model": "jockey1.0",
        "knowledge_store_id": resolved_ks_id,
        "instructions": JOCKEY_INSTRUCTIONS,
        "input": [
            {
                "type": "message",
                "role": "user",
                "content": JOCKEY_USER_PROMPT_TEMPLATE.format(top_n=top_n),
            }
        ],
        "text": {
            "format": {
                "type": "json_schema",
                "name": "superfan_feed",
                "schema": JOCKEY_FEED_SCHEMA,
            }
        },
        "stream": False,
    }
    response = requests.post(
        f"{BASE_URL}/responses",
        headers={
            "x-api-key": os.environ["TL_API_KEY"],
            "Content-Type": "application/json",
        },
        json=body,
        timeout=600,
    )
    response.raise_for_status()
    payload = response.json()
    for block in payload.get("output", []):
        for part in block.get("content", []):
            text = part.get("text")
            if text:
                return json.loads(text)
    raise RuntimeError(f"Jockey response had no JSON text output: {list(payload.keys())}")


def rank_segments(
    segments: list[dict[str, Any]],
    profile: str,
    preference_profiles: dict[str, Any],
    *,
    top_n: int = 20,
) -> list[dict[str, Any]]:
    """First top_n clips in diversified scroll order (see DiversifiedFeedIterator)."""
    feed: list[dict[str, Any]] = []
    scroll = DiversifiedFeedIterator(segments, profile, preference_profiles)
    for _ in range(top_n):
        feed.append(next(scroll))
    return feed


def run_jockey_step(
    manifest_path: Path | str = DEFAULT_COMBINED_MANIFEST_PATH,
    *,
    refresh_api: bool = True,
    ks_id: str | None = None,
) -> Path:
    """
    Step 2: Jockey top-N clips → KS asset_id remap → merge jockey_boost onto segments.

    Set refresh_api=False to only remap/merge existing jockey_feed_clips (no API call).
    Pass ks_id to override the TL_KS_ID env var (used for multi-show support).
    """
    path = Path(manifest_path)
    manifest = json.loads(path.read_text(encoding="utf-8"))
    segments = manifest.get("segments", [])
    if not segments and manifest.get("by_asset_id"):
        for aid in manifest.get("asset_ids", []):
            segments.extend(manifest["by_asset_id"].get(aid, {}).get("segments", []))
        manifest["segments"] = segments

    for seg in segments:
        seg.pop("jockey_boost", None)
        seg.pop("jockey_reasoning", None)
        seg.pop("cross_episode_significance", None)

    if refresh_api or not manifest.get("jockey_feed_clips"):
        print("Step 2: Jockey cross-episode top moments (API)...", flush=True)
        jockey_payload = generate_jockey_top_n_segments([], ks_id=ks_id)
        feed_clips_raw = jockey_payload.get("feed_clips", [])
        if jockey_payload.get("show_name"):
            manifest["show_name"] = jockey_payload["show_name"]
            print(f"  show_name: {manifest['show_name']}", flush=True)
        if jockey_payload.get("season_context"):
            manifest["season_context"] = jockey_payload["season_context"]
        print(f"  -> {len(feed_clips_raw)} clips from Jockey", flush=True)
    else:
        print("Step 2: Using existing jockey_feed_clips (refresh_api=False)", flush=True)
        feed_clips_raw = manifest["jockey_feed_clips"]

    apply_manifest_show_name(manifest["segments"], manifest.get("show_name"))

    # Pass ks_id so the lookup fetches from the correct show's KS (not the legacy TL_KS_ID)
    feed_clips, map_stats = resolve_jockey_feed_clips(feed_clips_raw, ks_id=ks_id)
    print(f"  KS asset map: {map_stats}", flush=True)

    manifest["jockey_feed_clips"] = feed_clips
    manifest["jockey_generated_at"] = datetime.now(timezone.utc).isoformat()
    merged = merge_jockey_boosts_onto_segments(manifest["segments"], feed_clips)
    apply_manifest_show_name(manifest["segments"], manifest.get("show_name"))
    print(f"  jockey_boost merged onto {merged} segment(s)", flush=True)

    save_feed_manifest(manifest, path)
    print(f"Saved {path}", flush=True)
    return path


def main() -> Path:
    print("Step 3: Profile ranking (diversified scroll order)...", flush=True)
    manifest = json.loads(DEFAULT_COMBINED_MANIFEST_PATH.read_text(encoding="utf-8"))
    for profile in PREFERENCE_PROFILES:
        feed = rank_segments(
            manifest["segments"],
            profile,
            PREFERENCE_PROFILES,
        )
        manifest[f"feed_{profile}"] = feed
        print(f"\n=== {profile} (first 5 scroll positions) ===", flush=True)
        for seg in feed[:5]:
            breakdown = ", ".join(f"{k}={v}" for k, v in seg["score_breakdown"].items())
            print(
                f"scroll #{seg['scroll_index'] + 1}  match_score={seg['match_score']:.2f}  ({breakdown})",
                flush=True,
            )
            print(f"    {seg['feed_headline']}", flush=True)
            print(
                f"    category={seg['primary_category']}  subtags={seg.get('subtags', [])}  intensity={seg['emotional_intensity']}",
                flush=True,
            )
            print(f"    why: {seg['explanation']}", flush=True)
            if seg.get("jockey_reasoning"):
                print(f"    jockey: {seg['jockey_reasoning']}", flush=True)
            if seg.get("cross_episode_significance"):
                print(f"    cross-episode: {seg['cross_episode_significance']}", flush=True)
        print(f"  scroll feed (first page): {len(feed)} clips", flush=True)

    save_feed_manifest(manifest, DEFAULT_COMBINED_MANIFEST_PATH)
    print(f"Updated {DEFAULT_COMBINED_MANIFEST_PATH}")
    return DEFAULT_COMBINED_MANIFEST_PATH


def run_segmentation_step(
    asset_ids: list[str] | None = None,
    *,
    manifest_path: Path | str = DEFAULT_COMBINED_MANIFEST_PATH,
) -> Path:
    """Step 0/1: Pegasus segmentation on all assets → combined manifest."""
    ids = asset_ids or DEFAULT_ASSET_IDS
    print(f"Step 1: Pegasus segmentation ({SEGMENT_MIN_DURATION_SEC}s segments)...", flush=True)
    manifest = build_combined_feed_manifest(ids)
    path = save_feed_manifest(manifest, manifest_path)
    print(f"Saved {len(manifest['segments'])} segments -> {path}", flush=True)
    return path


if __name__ == "__main__":
    import sys

    # ── Per-show asset IDs and manifest paths ─────────────────────────────────
    # Index IDs are in app/lib/shows.ts; asset IDs come from `list_index_assets.py`.
    # Run `python scripts/list_index_assets.py <show>` to get updated asset IDs.
    SHOW_ASSET_IDS: dict[str, list[str]] = {
        "rhoslc": DEFAULT_ASSET_IDS,
        "kn": [
            "6a2dbc155f48616a1efccfa1",
            "6a2dbc135f48616a1efccf9d",
            "6a2dbc12363f9692ab3286cf",
            "6a2dbc10f383f92c3dad9f46",
        ],
        "tiwbg": [
            "6a2dbaaaf383f92c3dad9f22",
            "6a2dbaaa4c3eea0190eb15d3",
            "6a2dbaa95f48616a1efccf6a",
            "6a2dba780d802ff693544740",
            "6a2dbaa25f48616a1efccf67",
        ],
    }

    SHOW_MANIFEST_PATHS: dict[str, Path] = {
        "rhoslc": Path(__file__).resolve().parent / "data" / "rhoslc_feed_manifest.json",
        "kn":     Path(__file__).resolve().parent / "data" / "kn_feed_manifest.json",
        "tiwbg":  Path(__file__).resolve().parent / "data" / "tiwbg_feed_manifest.json",
    }

    # KS IDs read from .env per show (set by pre-processing/knowledge_store.py)
    SHOW_KS_ENV_KEYS: dict[str, str] = {
        "rhoslc": "TL_KS_ID_RHOSLC",
        "kn":     "TL_KS_ID_KN",
        "tiwbg":  "TL_KS_ID_TIWBG",
    }

    # ── Parse args: python ranking.py <command> [show] [--merge-only] ─────────
    args = sys.argv[1:]
    command = args[0] if args else "rank"

    # Show arg can be positional second arg, e.g. `python ranking.py jockey kn`
    show = None
    for a in args[1:]:
        if a in SHOW_MANIFEST_PATHS:
            show = a
            break

    merge_only = "--merge-only" in args

    if show:
        manifest_path = SHOW_MANIFEST_PATHS[show]
        asset_ids = SHOW_ASSET_IDS.get(show, [])
        ks_env_key = SHOW_KS_ENV_KEYS.get(show, "TL_KS_ID")
        ks_id = os.environ.get(ks_env_key, "").strip() or os.environ.get("TL_KS_ID", "").strip()
        print(f"[INFO] Show: {show}", flush=True)
        print(f"[INFO] Manifest: {manifest_path}", flush=True)
        print(f"[INFO] KS ID ({ks_env_key}): {ks_id or '(not set)'}", flush=True)
    else:
        # Legacy: default to rhoslc
        manifest_path = DEFAULT_COMBINED_MANIFEST_PATH
        asset_ids = DEFAULT_ASSET_IDS
        ks_id = os.environ.get("TL_KS_ID", "").strip()
        print("[INFO] No show specified — defaulting to rhoslc", flush=True)

    if command == "jockey":
        if not ks_id:
            print(
                f"[ERROR] KS ID not set. Run `python pre-processing/knowledge_store.py {show or 'rhoslc'}` first.",
                file=sys.stderr,
                flush=True,
            )
            sys.exit(1)
        run_jockey_step(manifest_path, refresh_api=not merge_only, ks_id=ks_id)

    elif command == "segment":
        if show and not asset_ids:
            print(
                f"[ERROR] No asset IDs configured for show '{show}'.\n"
                f"  Run: python scripts/list_index_assets.py {show}\n"
                f"  Then paste the IDs into SHOW_ASSET_IDS['{show}'] in ranking.py",
                file=sys.stderr,
                flush=True,
            )
            sys.exit(1)
        run_segmentation_step(asset_ids=asset_ids or None, manifest_path=manifest_path)

    else:
        main()
