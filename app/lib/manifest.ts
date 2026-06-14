import { existsSync, readFileSync } from "fs";
import path from "path";
import {
  DEFAULT_SHOW_ID,
  getShowConfig,
  isShowId,
  SHOW_LIST,
  type ShowId,
} from "./shows";
import type { FeedManifest, Segment, ShowCatalogEntry } from "./types";

const cache = new Map<ShowId, FeedManifest>();

type ManifestFile = FeedManifest & {
  show_id?: string;
  by_asset_id?: Record<string, { segments?: Segment[] }>;
};

/** Flatten `by_asset_id` layout into a single `segments` array. */
function normalizeManifest(raw: ManifestFile, showId: ShowId): FeedManifest {
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

  const config = getShowConfig(showId);

  return {
    show_id: showId,
    generated_at: raw.generated_at,
    asset_ids: raw.asset_ids ?? [...new Set(segments.map((s) => s.asset_id))],
    show_name: raw.show_name ?? config.label,
    segments,
  };
}

function manifestPath(showId: ShowId): string {
  const file = getShowConfig(showId).manifestFile;
  return path.join(process.cwd(), "data", file);
}

export function manifestExists(showId: ShowId): boolean {
  return existsSync(manifestPath(showId));
}

export function loadManifest(showId: ShowId = DEFAULT_SHOW_ID): FeedManifest {
  const cached = cache.get(showId);
  if (cached) return cached;

  if (!isShowId(showId)) {
    throw new Error(`Unknown show: ${showId}`);
  }

  const filePath = manifestPath(showId);
  if (!existsSync(filePath)) {
    throw new Error(`Manifest not found for show "${showId}" (${filePath})`);
  }

  const raw = JSON.parse(readFileSync(filePath, "utf-8")) as ManifestFile;
  const normalized = normalizeManifest(raw, showId);
  cache.set(showId, normalized);
  return normalized;
}

/** Shows registered in shows.ts that have a manifest file on disk. */
export function listShowCatalog(): ShowCatalogEntry[] {
  return SHOW_LIST.map((show) => ({
    id: show.id,
    label: show.label,
    shortLabel: show.shortLabel,
    available: manifestExists(show.id),
  })).filter((s) => s.available);
}
