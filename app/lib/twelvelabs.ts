const DEFAULT_BASE = "https://api.twelvelabs.io/v1.3";

export type AssetPlayback = {
  asset_id: string;
  status: string;
  hls_url: string | null;
  thumbnail_url: string | null;
  duration: number | null;
  filename: string | null;
};

type TlAssetResponse = {
  _id?: string;
  status?: string;
  filename?: string;
  duration?: number;
  thumbnail_url?: string;
  manifest_url?: string;
  hls?: { manifest_url?: string };
};

export function getTwelveLabsConfig(): { baseUrl: string; apiKey: string } | null {
  const apiKey = process.env.TL_API_KEY?.trim();
  if (!apiKey) return null;
  const baseUrl = (process.env.TWELVELABS_API_BASE ?? DEFAULT_BASE).replace(/\/$/, "");
  return { baseUrl, apiKey };
}

export function getIndexId(): string | null {
  return process.env.TL_INDEX_ID?.trim() || null;
}

type TlSearchItem = {
  start?: number;
  end?: number;
  video_id?: string;
  rank?: number;
  thumbnail_url?: string;
  transcription?: string;
  clips?: TlSearchItem[];
};

type TlSearchResponse = {
  data?: TlSearchItem[];
};

export type RawSearchHit = {
  asset_id: string;
  start_sec: number;
  end_sec: number;
  thumbnail_url: string | null;
  transcription: string | null;
  search_rank: number;
};

function flattenSearchItems(items: TlSearchItem[]): RawSearchHit[] {
  const hits: RawSearchHit[] = [];

  for (const item of items) {
    if (item.clips?.length) {
      for (const clip of item.clips) {
        if (!clip.video_id || clip.start == null || clip.end == null) continue;
        hits.push({
          asset_id: clip.video_id,
          start_sec: clip.start,
          end_sec: clip.end,
          thumbnail_url: clip.thumbnail_url ?? null,
          transcription: clip.transcription ?? null,
          search_rank: clip.rank ?? 0,
        });
      }
      continue;
    }

    if (!item.video_id || item.start == null || item.end == null) continue;
    hits.push({
      asset_id: item.video_id,
      start_sec: item.start,
      end_sec: item.end,
      thumbnail_url: item.thumbnail_url ?? null,
      transcription: item.transcription ?? null,
      search_rank: item.rank ?? 0,
    });
  }

  return hits;
}

export async function searchIndex(
  query: string,
  pageLimit = 24,
  /** Pass a show-specific index ID; falls back to global TL_INDEX_ID env var. */
  overrideIndexId?: string,
): Promise<RawSearchHit[]> {
  const config = getTwelveLabsConfig();
  const indexId = overrideIndexId ?? getIndexId();
  if (!config) throw new Error("TL_API_KEY is not configured");
  if (!indexId) throw new Error("No index ID configured for this show");

  const form = new FormData();
  form.append("index_id", indexId);
  form.append("query_text", query.trim());
  form.append("search_options", "visual");
  form.append("search_options", "audio");
  form.append("search_options", "transcription");
  form.append("group_by", "clip");
  form.append("operator", "or");
  form.append("page_limit", String(pageLimit));

  const res = await fetch(`${config.baseUrl}/search`, {
    method: "POST",
    headers: { "x-api-key": config.apiKey },
    body: form,
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Search failed (${res.status}): ${text.slice(0, 300)}`);
  }

  const body = (await res.json()) as TlSearchResponse;
  const hits = flattenSearchItems(body.data ?? []);
  const maps = await loadIndexedAssetMaps(config, indexId);
  return hits.map((hit) => ({
    ...hit,
    asset_id: resolveSearchVideoId(hit.asset_id, maps),
  }));
}

type TlIndexedAsset = {
  _id?: string;
  asset_id?: string;
  hls?: {
    video_url?: string;
    thumbnail_urls?: string[];
    status?: string;
  };
  system_metadata?: { duration?: number };
};

type TlIndexedAssetListResponse = {
  data?: TlIndexedAsset[];
};

type TlAssetIndexedAssetRef = {
  _id?: string;
  index?: { _id?: string };
};

type TlAssetIndexedAssetsResponse = {
  data?: TlAssetIndexedAssetRef[];
};

export type IndexVideoPreview = {
  video_id: string;
  asset_id: string;
  thumbnail_url: string | null;
  thumbnail_urls: string[];
  duration: number | null;
  hls_video_url: string | null;
};

type IndexedAssetThumbEntry = {
  asset_id: string;
  indexed_asset_id: string;
  thumbnail_urls: string[];
  duration: number | null;
  hls_video_url: string | null;
};

type IndexedAssetMaps = {
  byAssetId: Map<string, IndexedAssetThumbEntry>;
  /** Marengo search `video_id` → manifest asset id */
  byIndexedId: Map<string, string>;
};

// Cache keyed by indexId so different shows don't get stale entries from each other
const indexedAssetThumbCache = new Map<string, { at: number; maps: IndexedAssetMaps }>();

/** Marengo search returns indexed video ids; map them to asset ids for playback. */
function resolveSearchVideoId(videoId: string, maps: IndexedAssetMaps): string {
  if (maps.byAssetId.has(videoId)) return videoId;
  return maps.byIndexedId.get(videoId) ?? videoId;
}

const INDEXED_ASSET_CACHE_TTL_MS = 10 * 60 * 1000;

/** Pick the HLS thumbnail frame closest to `atSec` across the video duration. */
export function pickThumbnailAtTime(
  urls: string[],
  atSec: number,
  duration: number | null,
): string | null {
  if (urls.length === 0) return null;
  if (!duration || duration <= 0) return urls[0] ?? null;
  const idx = Math.min(
    urls.length - 1,
    Math.max(0, Math.floor((atSec / duration) * urls.length)),
  );
  return urls[idx] ?? urls[0] ?? null;
}

function parseIndexedAsset(item: TlIndexedAsset): IndexedAssetThumbEntry | null {
  if (!item._id || !item.asset_id) return null;
  return {
    asset_id: item.asset_id,
    indexed_asset_id: item._id,
    thumbnail_urls: item.hls?.thumbnail_urls ?? [],
    duration: item.system_metadata?.duration ?? null,
    hls_video_url: item.hls?.video_url ?? null,
  };
}

async function loadIndexedAssetMaps(
  config: { baseUrl: string; apiKey: string },
  indexId: string,
): Promise<IndexedAssetMaps> {
  const cached = indexedAssetThumbCache.get(indexId);
  if (cached && Date.now() - cached.at < INDEXED_ASSET_CACHE_TTL_MS) {
    return cached.maps;
  }

  const byAssetId = new Map<string, IndexedAssetThumbEntry>();
  const byIndexedId = new Map<string, string>();
  let page = 1;
  let hasNext = true;

  while (hasNext) {
    const res = await fetch(
      `${config.baseUrl}/indexes/${indexId}/indexed-assets?page=${page}&page_limit=50`,
      {
        headers: { "x-api-key": config.apiKey },
        next: { revalidate: 600 },
      },
    );

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Indexed assets list failed (${res.status}): ${text.slice(0, 200)}`);
    }

    const body = (await res.json()) as TlIndexedAssetListResponse & {
      page_info?: { has_next_page?: boolean };
    };

    for (const item of body.data ?? []) {
      const parsed = parseIndexedAsset(item);
      if (!parsed) continue;
      byAssetId.set(parsed.asset_id, parsed);
      byIndexedId.set(parsed.indexed_asset_id, parsed.asset_id);
    }

    hasNext = Boolean(body.page_info?.has_next_page);
    page += 1;
    if (page > 20) break;
  }

  const maps = { byAssetId, byIndexedId };
  indexedAssetThumbCache.set(indexId, { at: Date.now(), maps });
  return maps;
}

async function fetchIndexedAssetDetail(
  config: { baseUrl: string; apiKey: string },
  indexId: string,
  indexedAssetId: string,
): Promise<IndexedAssetThumbEntry | null> {
  const res = await fetch(
    `${config.baseUrl}/indexes/${indexId}/indexed-assets/${indexedAssetId}`,
    {
      headers: { "x-api-key": config.apiKey },
      cache: "no-store",
    },
  );
  if (!res.ok) return null;
  const detail = (await res.json()) as TlIndexedAsset;
  return parseIndexedAsset(detail);
}

async function fetchIndexedAssetByAssetId(
  config: { baseUrl: string; apiKey: string },
  indexId: string,
  assetId: string,
): Promise<IndexedAssetThumbEntry | null> {
  const listRes = await fetch(`${config.baseUrl}/assets/${assetId}/indexed-assets`, {
    headers: { "x-api-key": config.apiKey },
    next: { revalidate: 600 },
  });

  if (!listRes.ok) return null;

  const listBody = (await listRes.json()) as TlAssetIndexedAssetsResponse;
  const ref = (listBody.data ?? []).find((row) => row.index?._id === indexId);
  if (!ref?._id) return null;

  const detailRes = await fetch(
    `${config.baseUrl}/indexes/${indexId}/indexed-assets/${ref._id}`,
    {
      headers: { "x-api-key": config.apiKey },
      next: { revalidate: 600 },
    },
  );

  if (!detailRes.ok) return null;

  const detail = (await detailRes.json()) as TlIndexedAsset;
  return parseIndexedAsset(detail);
}

/**
 * Resolve thumbnails for a manifest/search asset_id via indexed-assets (not index video id).
 * `assetId` is the TwelveLabs asset id (24-char hex), not the indexed-asset id.
 */
export async function fetchIndexVideoPreview(
  assetId: string,
  atSec?: number,
): Promise<IndexVideoPreview> {
  const config = getTwelveLabsConfig();
  const indexId = getIndexId();
  if (!config) throw new Error("TL_API_KEY is not configured");
  if (!indexId) throw new Error("TL_INDEX_ID is not configured");

  if (!isKnownAssetIdFormat(assetId)) {
    throw new Error("Invalid asset id");
  }

  const maps = await loadIndexedAssetMaps(config, indexId);
  let entry = maps.byAssetId.get(assetId);

  if (!entry) {
    const fetched = await fetchIndexedAssetByAssetId(config, indexId, assetId);
    if (fetched) {
      entry = fetched;
      maps.byAssetId.set(assetId, fetched);
      maps.byIndexedId.set(fetched.indexed_asset_id, assetId);
    }
  }

  if (!entry) {
    throw new Error(`No indexed asset for asset id ${assetId}`);
  }

  const at = atSec ?? 0;
  const thumbnail_urls = entry.thumbnail_urls;

  return {
    video_id: entry.indexed_asset_id,
    asset_id: assetId,
    thumbnail_urls,
    thumbnail_url:
      pickThumbnailAtTime(thumbnail_urls, at, entry.duration) ??
      thumbnail_urls[0] ??
      null,
    duration: entry.duration,
    hls_video_url: entry.hls_video_url,
  };
}

async function fetchAssetDirect(
  config: { baseUrl: string; apiKey: string },
  assetId: string,
): Promise<AssetPlayback> {
  const res = await fetch(`${config.baseUrl}/assets/${assetId}`, {
    headers: { "x-api-key": config.apiKey },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Asset fetch failed (${res.status}): ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as TlAssetResponse;
  const hls_url = data.hls?.manifest_url ?? data.manifest_url ?? null;

  return {
    asset_id: data._id ?? assetId,
    status: data.status ?? "unknown",
    hls_url,
    thumbnail_url: data.thumbnail_url ?? null,
    duration: data.duration ?? null,
    filename: data.filename ?? null,
  };
}

function playbackFromIndexedEntry(entry: IndexedAssetThumbEntry): AssetPlayback {
  return {
    asset_id: entry.asset_id,
    status: "ready",
    hls_url: entry.hls_video_url,
    thumbnail_url: entry.thumbnail_urls[0] ?? null,
    duration: entry.duration,
    filename: null,
  };
}

const ASSET_ID_24HEX = /^[a-f0-9]{24}$/i;
const ASSET_ID_UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

function isKnownAssetIdFormat(id: string): boolean {
  return ASSET_ID_24HEX.test(id) || ASSET_ID_UUID.test(id);
}

// ─── Knowledge-store item → asset_id map ─────────────────────────────────────

type KsItemMap = Map<string, string>; // ks-item-uuid → asset_id (24-hex)

let ksItemMapCache: { at: number; ksId: string; map: KsItemMap } | null = null;
const KS_ITEM_CACHE_TTL_MS = 10 * 60 * 1000;

type TlKsItem = {
  _id?: string;
  asset_id?: string;
  status?: string;
};

async function loadKsItemMap(
  config: { baseUrl: string; apiKey: string },
  ksId: string,
): Promise<KsItemMap> {
  if (
    ksItemMapCache &&
    ksItemMapCache.ksId === ksId &&
    Date.now() - ksItemMapCache.at < KS_ITEM_CACHE_TTL_MS
  ) {
    return ksItemMapCache.map;
  }

  const map: KsItemMap = new Map();
  let page = 1;
  let hasNext = true;

  console.info(`[ks-items] Loading items for knowledge store ${ksId}`);

  while (hasNext) {
    const res = await fetch(
      `${config.baseUrl}/knowledge-stores/${ksId}/items?page=${page}&page_limit=50`,
      { headers: { "x-api-key": config.apiKey }, cache: "no-store" },
    );
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error(`[ks-items] list failed (${res.status}): ${errText.slice(0, 200)}`);
      break;
    }

    const body = (await res.json()) as {
      data?: TlKsItem[];
      page_info?: { has_next_page?: boolean };
    };

    for (const item of body.data ?? []) {
      if (item._id && item.asset_id) {
        // Full _id may be "ksi_<uuid>" — map both forms so Jockey's bare UUID hits too
        map.set(item._id, item.asset_id);
        const bareUuid = item._id.replace(/^ksi_/i, "");
        if (bareUuid !== item._id) map.set(bareUuid, item.asset_id);
      }
    }

    hasNext = Boolean(body.page_info?.has_next_page);
    page += 1;
    if (page > 20) break;
  }

  console.info(`[ks-items] Loaded ${map.size / 2} items (${map.size} map entries) from KS ${ksId}`);
  ksItemMapCache = { at: Date.now(), ksId, map };
  return map;
}

/**
 * Resolve a single KS item → asset_id. Tries both bare UUID and ksi_<uuid>.
 */
async function resolveKsItemId(
  config: { baseUrl: string; apiKey: string },
  ksId: string,
  itemId: string,
): Promise<string | null> {
  // Try the raw ID first, then with ksi_ prefix if it doesn't already have one
  const candidates = itemId.startsWith("ksi_")
    ? [itemId, itemId.replace(/^ksi_/i, "")]
    : [itemId, `ksi_${itemId}`];

  for (const tryId of candidates) {
    try {
      const res = await fetch(
        `${config.baseUrl}/knowledge-stores/${ksId}/items/${tryId}`,
        { headers: { "x-api-key": config.apiKey }, cache: "no-store" },
      );
      if (res.ok) {
        const data = (await res.json()) as TlKsItem;
        if (data.asset_id) {
          console.info(`[ks-items] Single lookup ${tryId} → asset_id ${data.asset_id}`);
          return data.asset_id;
        }
      } else {
        const errText = await res.text().catch(() => "");
        console.warn(`[ks-items] Single lookup ${tryId} failed (${res.status}): ${errText.slice(0, 120)}`);
      }
    } catch (e) {
      console.warn(`[ks-items] Single lookup ${tryId} threw:`, e);
    }
  }
  return null;
}

/**
 * Given a TL asset_id (24-hex), get playback via the index's indexed-assets path
 * (which always has hls.video_url) rather than the /assets/ endpoint (which may not).
 *
 * Chain: asset_id → /assets/{id}/indexed-assets → /indexes/{idx}/indexed-assets/{iid} → HLS
 */
async function fetchPlaybackViaIndex(
  config: { baseUrl: string; apiKey: string },
  indexId: string,
  assetId: string,
): Promise<AssetPlayback | null> {
  // 1. Check cached map first
  const maps = await loadIndexedAssetMaps(config, indexId);
  let entry = maps.byAssetId.get(assetId) ?? null;
  console.info(`[idx-lookup] asset ${assetId} in cached map: ${entry ? "hit" : "miss"}`);

  // 2. If not in bulk map, try the /assets/{id}/indexed-assets lookup
  if (!entry) {
    entry = await fetchIndexedAssetByAssetId(config, indexId, assetId);
    if (entry) {
      // Warm both directions of the cache
      maps.byAssetId.set(assetId, entry);
      maps.byIndexedId.set(entry.indexed_asset_id, assetId);
      console.info(`[idx-lookup] asset ${assetId} → indexed_asset ${entry.indexed_asset_id}, hls: ${entry.hls_video_url ? "yes" : "no"}`);
    } else {
      console.warn(`[idx-lookup] asset ${assetId} not found in index ${indexId}`);
    }
  }

  if (entry?.hls_video_url) return playbackFromIndexedEntry(entry);
  return null;
}

/**
 * Resolve playback for:
 *   • 24-char hex   → standard TL asset (manifest / Marengo search hit)
 *   • UUID          → Jockey knowledge-store item ID (needs KS → asset_id → index lookup)
 */
export async function fetchAssetPlayback(
  id: string,
  opts?: {
    /** Override the Marengo index to look up HLS in (default: TL_INDEX_ID env var) */
    indexId?: string | null;
    /** Override the Jockey KS to resolve UUID item IDs (default: TL_KS_ID env var) */
    ksId?: string | null;
  },
): Promise<AssetPlayback> {
  const config = getTwelveLabsConfig();
  if (!config) throw new Error("TL_API_KEY is not configured");
  if (!isKnownAssetIdFormat(id)) throw new Error("Invalid asset id");

  const indexId = opts?.indexId ?? getIndexId();

  // ── UUID path (Jockey KS item IDs) ───────────────────────────────────────
  if (ASSET_ID_UUID.test(id)) {
    // Prefer the caller-supplied ksId, then the per-show env var, then legacy TL_KS_ID
    const ksId = opts?.ksId ?? process.env.TL_KS_ID?.trim();
    let tlAssetId: string | null = null;

    if (ksId) {
      const ksMap = await loadKsItemMap(config, ksId);
      tlAssetId = ksMap.get(id) ?? null;
      console.info(`[playback] UUID ${id} → bulk map lookup (ks ${ksId}): ${tlAssetId ?? "miss"}`);

      if (!tlAssetId) {
        tlAssetId = await resolveKsItemId(config, ksId, id);
        if (tlAssetId) ksMap.set(id, tlAssetId);
        console.info(`[playback] UUID ${id} → single KS lookup: ${tlAssetId ?? "failed"}`);
      }
    } else {
      console.warn("[playback] No KS ID available — cannot resolve UUID IDs");
    }

    if (!tlAssetId) {
      throw new Error(`[playback] Could not resolve KS UUID ${id} to a TL asset_id`);
    }

    console.info(`[playback] UUID ${id} → asset_id ${tlAssetId} — fetching via index`);

    // Always go via index for KS-sourced IDs — /assets/ endpoint may lack HLS
    if (indexId) {
      const playback = await fetchPlaybackViaIndex(config, indexId, tlAssetId);
      if (playback) return playback;
    }

    // Index fallback: try direct /assets/ endpoint as last resort
    console.warn(`[playback] Index lookup failed for ${tlAssetId}, trying /assets/ direct`);
    return await fetchAssetDirect(config, tlAssetId);
  }

  // ── 24-hex path (manifest / Marengo search hits) ─────────────────────────
  // 1. Try the index first (always has HLS, less likely to 502)
  if (indexId) {
    const playback = await fetchPlaybackViaIndex(config, indexId, id);
    if (playback) return playback;
  }

  // 2. Fall back to direct /assets/ endpoint
  try {
    return await fetchAssetDirect(config, id);
  } catch (directErr) {
    if (!indexId) throw directErr;

    // 3. Last resort: try resolving as an indexed-video id (Marengo search)
    const maps = await loadIndexedAssetMaps(config, indexId);
    const resolved = resolveSearchVideoId(id, maps);
    if (resolved !== id) {
      const entry = maps.byAssetId.get(resolved);
      if (entry?.hls_video_url) return playbackFromIndexedEntry(entry);
      return await fetchAssetDirect(config, resolved);
    }

    throw directErr;
  }
}
