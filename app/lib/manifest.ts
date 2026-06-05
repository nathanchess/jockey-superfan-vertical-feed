import { readFileSync } from "fs";
import path from "path";
import type { FeedManifest, Segment } from "./types";

let cached: FeedManifest | null = null;

type ManifestFile = FeedManifest & {
  by_asset_id?: Record<string, { segments?: Segment[] }>;
};

/** Flatten v2 `by_asset_id` layout into a single `segments` array. */
function normalizeManifest(raw: ManifestFile): FeedManifest {
  let segments = raw.segments ?? [];
  if (segments.length === 0 && raw.by_asset_id) {
    segments = [];
    const assetIds = raw.asset_ids?.length
      ? raw.asset_ids
      : Object.keys(raw.by_asset_id);
    for (const aid of assetIds) {
      const block = raw.by_asset_id[aid];
      if (block?.segments?.length) segments.push(...block.segments);
    }
  }

  return {
    generated_at: raw.generated_at,
    asset_ids: raw.asset_ids ?? [...new Set(segments.map((s) => s.asset_id))],
    show_name: raw.show_name,
    segments,
  };
}

export function loadManifest(): FeedManifest {
  if (cached) return cached;
  const filePath = path.join(process.cwd(), "data", "feed_manifest_v2.json");
  const raw = JSON.parse(readFileSync(filePath, "utf-8")) as ManifestFile;
  cached = normalizeManifest(raw);
  return cached;
}
