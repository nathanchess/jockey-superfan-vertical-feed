"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { PersonaSelect, type PersonaOption } from "@/components/PersonaSelect";
import { ExploreRawDataPanel, ExploreRawDataToggle } from "@/components/ExploreRawDataPanel";
import { SegmentPlayer } from "@/components/SegmentPlayer";
import { StrandIcon } from "@/components/StrandIcon";
import { clipGridKey } from "@/lib/clipKey";
import { dedupeClips } from "@/lib/dedupeClips";
import type { GridClip } from "@/lib/exploreRawData";
import { formatTimestampRange } from "@/lib/format";
import { PROFILE_LABELS } from "@/lib/profiles";
import {
  matchScoreTier,
  MATCH_SCORE_TIER_COLORS,
  normalizeMatchScore,
} from "@/lib/scoreDisplay";
import type {
  AssetPlaybackResponse,
  FeedPageResponse,
  ProfileId,
  RankedSegment,
  SearchHit,
  SearchResponse,
} from "@/lib/types";

const EXPLORE_CLIP_LIMIT = 12;

// Module-level HLS URL cache so persona switches reuse already-fetched URLs
const hlsCache = new Map<string, string>();

async function fetchHlsUrl(assetId: string, signal?: AbortSignal): Promise<string | null> {
  const hit = hlsCache.get(assetId);
  if (hit) return hit;
  const res = await fetch(`/api/assets/${assetId}`, { signal });
  if (!res.ok) return null;
  const body = (await res.json()) as AssetPlaybackResponse;
  if (body.hls_url) hlsCache.set(assetId, body.hls_url);
  return body.hls_url ?? null;
}

function isSearchHit(clip: GridClip): clip is SearchHit {
  return "search_rank" in clip;
}

// Deterministic per-asset gradient so every idle card has a unique colour
function cardGradient(assetId: string): string {
  let h = 0;
  for (let i = 0; i < assetId.length; i++) h = (h * 31 + assetId.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return `linear-gradient(135deg,hsl(${hue},35%,22%),hsl(${(hue + 60) % 360},25%,12%))`;
}

// ─── Spinning loader ──────────────────────────────────────────────────────────
function Spinner({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block shrink-0 animate-spin bg-current ${className}`}
      style={{
        maskImage: "url(/strand/icons/spinner.svg)",
        WebkitMaskImage: "url(/strand/icons/spinner.svg)",
        maskSize: "contain",
        WebkitMaskSize: "contain",
        maskRepeat: "no-repeat",
        WebkitMaskRepeat: "no-repeat",
        maskPosition: "center",
        WebkitMaskPosition: "center",
      }}
    />
  );
}

// ─── GridCard ─────────────────────────────────────────────────────────────────
function GridCard({
  clip,
  index,
  onSelect,
}: {
  clip: GridClip;
  index: number;
  onSelect: (c: GridClip) => void;
}) {
  const articleRef = useRef<HTMLElement>(null);
  const [hovered, setHovered] = useState(false);
  const [hlsUrl, setHlsUrl] = useState<string | null>(() => hlsCache.get(clip.asset_id) ?? null);
  const [hlsLoading, setHlsLoading] = useState(false);

  const prevAssetRef = useRef(clip.asset_id);
  // Reset when persona switches update the clip prop in-place (same card, new asset)
  useEffect(() => {
    if (prevAssetRef.current === clip.asset_id) return;
    prevAssetRef.current = clip.asset_id;
    setHovered(false);
    setHlsLoading(false);
    setHlsUrl(hlsCache.get(clip.asset_id) ?? null);
  }, [clip.asset_id]);

  // Fetch HLS URL as soon as the card enters the viewport (not waiting for hover)
  useEffect(() => {
    const el = articleRef.current;
    if (!el) return;

    // Already cached — apply immediately
    if (hlsCache.get(clip.asset_id)) {
      setHlsUrl(hlsCache.get(clip.asset_id)!);
      return;
    }

    let ac: AbortController | null = null;

    const obs = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      obs.disconnect();

      ac = new AbortController();
      setHlsLoading(true);
      console.log(`[GridCard ${index}] visible → fetching HLS ${clip.asset_id}`);

      fetchHlsUrl(clip.asset_id, ac.signal)
        .then((url) => {
          if (ac?.signal.aborted) return;
          console.log(`[GridCard ${index}] HLS ${url ? "ready" : "null"}`);
          if (url) setHlsUrl(url);
        })
        .catch(() => {/* ignore */})
        .finally(() => { if (!ac?.signal.aborted) setHlsLoading(false); });
    }, { threshold: 0.1 });

    obs.observe(el);
    return () => { obs.disconnect(); ac?.abort(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clip.asset_id, index]);

  const normalized = clip.match_score != null ? normalizeMatchScore(clip.match_score) : null;
  const tier = normalized !== null ? matchScoreTier(normalized) : null;
  const tierColors = tier ? MATCH_SCORE_TIER_COLORS[tier] : null;

  return (
    <article
      ref={articleRef}
      className="explore-grid-item explore-grid-item--visible group cursor-pointer"
      style={{ animationDelay: `${Math.min(index, 11) * 50}ms` }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onSelect(clip)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(clip); } }}
      role="button"
      tabIndex={0}
      aria-label={`Play: ${clip.feed_headline}`}
    >
      <div className="relative aspect-9/14 overflow-hidden rounded-2xl bg-brand-charcoal shadow-sm ring-1 ring-border transition-transform duration-300 group-hover:scale-[1.02] group-hover:shadow-md">
        {/* Gradient — always the bottom layer / fallback */}
        <div className="absolute inset-0" style={{ background: cardGradient(clip.asset_id) }} />

        {/* SegmentPlayer mounted as soon as HLS URL is ready.
            autoPlay=false → seeks to startSec and freezes (thumbnail).
            playOnHover=true → starts playing when hovered. */}
        {hlsUrl && (
          <SegmentPlayer
            hlsUrl={hlsUrl}
            startSec={clip.start_sec}
            endSec={clip.end_sec}
            autoPlay={false}
            playOnHover
            isHovered={hovered}
            loopWhileHovered
            objectFit="cover"
            hideCenterPlay
            stopClickPropagation
            className="absolute inset-0"
          />
        )}

        {/* Spinner while fetching the HLS URL */}
        {hlsLoading && !hlsUrl && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Spinner className="h-9 w-9 text-white/60" />
          </div>
        )}

        {/* Play icon — visible when idle, fades on hover */}
        <div className="absolute inset-0 flex items-center justify-center transition-opacity duration-200 group-hover:opacity-0">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/15 text-white/90 backdrop-blur-sm">
            <StrandIcon name="play" className="h-5 w-5" />
          </span>
        </div>

        {/* Text gradient + labels */}
        <div className="pointer-events-none absolute inset-0 bg-linear-to-t from-black/80 via-black/15 to-transparent" />
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 p-3 pb-5">
          <p className="line-clamp-2 text-sm font-semibold leading-snug text-white">{clip.feed_headline}</p>
          <p className="mt-1 text-[11px] text-white/70">{formatTimestampRange(clip.start_sec, clip.end_sec)}</p>
        </div>
        {normalized !== null && (
          <span className={`pointer-events-none absolute right-2 top-2 z-10 rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums backdrop-blur-sm ${tierColors?.bg ?? "bg-black/50"} ${tierColors?.text ?? "text-white"}`}>
            {normalized}
          </span>
        )}
      </div>
    </article>
  );
}

// ─── ClipModal ────────────────────────────────────────────────────────────────
function ClipModal({ clip, onClose }: { clip: GridClip | null; onClose: () => void }) {
  const [playback, setPlayback] = useState<AssetPlaybackResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!clip) return;
    // Use cached HLS URL if available to avoid extra fetch
    const cached = hlsCache.get(clip.asset_id);
    if (cached) {
      setPlayback({ asset_id: clip.asset_id, status: "ready", hls_url: cached, thumbnail_url: null, duration: null, filename: null });
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setPlayback(null);
    const ac = new AbortController();
    fetch(`/api/assets/${clip.asset_id}`, { signal: ac.signal })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Failed to load video");
        if (!ac.signal.aborted) { hlsCache.set(clip.asset_id, body.hls_url); setPlayback(body); }
      })
      .catch((e) => { if (!ac.signal.aborted) setError(e instanceof Error ? e.message : "Failed"); })
      .finally(() => { if (!ac.signal.aborted) setLoading(false); });
    return () => ac.abort();
  }, [clip]);

  useEffect(() => {
    if (!clip) return;
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [clip, onClose]);

  if (!clip) return null;

  return (
    <div className="explore-modal-backdrop fixed inset-0 z-100 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose} role="presentation">
      <div className="explore-modal-panel relative w-full max-w-3xl overflow-hidden rounded-2xl bg-background shadow-2xl ring-1 ring-border" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <button type="button" onClick={onClose} className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white transition-colors hover:bg-black/70" aria-label="Close">
          <StrandIcon name="close" className="h-4 w-4" />
        </button>
        <div className="relative aspect-video w-full overflow-hidden bg-brand-charcoal">
          {loading && <div className="flex h-full min-h-[220px] items-center justify-center"><Spinner className="h-8 w-8 text-text-tertiary" /></div>}
          {!loading && playback?.hls_url && <SegmentPlayer hlsUrl={playback.hls_url} startSec={clip.start_sec} endSec={clip.end_sec} poster={playback.thumbnail_url} />}
          {!loading && error && <div className="flex h-full min-h-[220px] items-center justify-center p-6 text-center text-sm text-error">{error}</div>}
        </div>
        <div className="space-y-2 p-5">
          <h2 className="text-lg font-semibold text-text-primary">{clip.feed_headline}</h2>
          <p className="text-sm leading-relaxed text-text-secondary">{clip.description}</p>
          <p className="text-xs text-text-tertiary">{formatTimestampRange(clip.start_sec, clip.end_sec)}{isSearchHit(clip) && " · Search result"}</p>
        </div>
      </div>
    </div>
  );
}

// ─── ExploreGrid ──────────────────────────────────────────────────────────────
export function ExploreGrid() {
  const [profiles, setProfiles] = useState<PersonaOption[]>([]);
  const [profile, setProfile] = useState<ProfileId>("drama_addict");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeQuery, setActiveQuery] = useState<string | null>(null);
  const [searchFocused, setSearchFocused] = useState(false);
  const [selectedClip, setSelectedClip] = useState<GridClip | null>(null);

  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [clips, setClips] = useState<GridClip[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [showName, setShowName] = useState<string | null>(null);
  const [showRawData, setShowRawData] = useState(false);
  const reqIdRef = useRef(0);

  // Load personas once
  useEffect(() => {
    console.log("[ExploreGrid] mount");
    fetch("/api/profiles")
      .then((r) => r.json())
      .then((d: { profiles: PersonaOption[] }) => setProfiles(d.profiles))
      .catch(() => {});
  }, []);

  // Load clips when profile or search query changes
  useEffect(() => {
    const reqId = ++reqIdRef.current;
    setStatus("loading");
    setFetchError(null);
    setSelectedClip(null);
    setShowRawData(false);

    const url = activeQuery
      ? `/api/search?q=${encodeURIComponent(activeQuery)}&profile=${profile}`
      : `/api/feed?profile=${profile}&offset=0&limit=${EXPLORE_CLIP_LIMIT}`;

    console.log(`[ExploreGrid] reqId=${reqId} fetching ${url}`);
    let stale = false;

    fetch(url, { cache: "no-store" })
      .then(async (res) => {
        const body = await res.json();
        if (stale || reqId !== reqIdRef.current) return;
        if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);

        let newClips: GridClip[];
        let name: string | null = null;
        if (activeQuery) {
          const s = body as SearchResponse;
          name = s.show_name ?? null;
          newClips = dedupeClips(s.results).slice(0, EXPLORE_CLIP_LIMIT);
        } else {
          const p = body as FeedPageResponse;
          name = p.show_name ?? null;
          newClips = dedupeClips(p.clips).slice(0, EXPLORE_CLIP_LIMIT);
        }
        console.log(`[ExploreGrid] reqId=${reqId} → ${newClips.length} clips`);
        setClips(newClips);
        setShowName(name);
        setStatus("ready");
      })
      .catch((e) => {
        if (stale || reqId !== reqIdRef.current) return;
        const msg = e instanceof Error ? e.message : "Failed";
        console.error(`[ExploreGrid] reqId=${reqId} error:`, msg);
        setFetchError(msg);
        setStatus("error");
      });

    return () => { stale = true; };
  }, [profile, activeQuery]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setActiveQuery(searchQuery.trim() || null);
  };

  const onSearchKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") { setSearchQuery(""); setSearchFocused(false); setActiveQuery(null); }
  };

  const handleProfileChange = useCallback((p: ProfileId) => {
    console.log(`[ExploreGrid] persona ${profile} → ${p}`);
    setProfile(p);
  }, [profile]);

  const loading = status === "loading";
  const sectionTitle = activeQuery ? `Results for "${activeQuery}"` : "Top picks for you";
  const sectionSub = activeQuery
    ? `Moments matching your search${showName ? ` · ${showName}` : ""}`
    : `Best clips ranked for your persona${showName ? ` · ${showName}` : ""}`;

  return (
    <div className="explore-page flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-6 py-8 md:px-10 md:py-10">

          {/* Header */}
          <header className="explore-header-enter mb-8 space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-2">
                <h1 className="text-3xl font-semibold tracking-tight text-text-primary md:text-4xl">Explore</h1>
                <p className="max-w-lg text-base text-text-secondary">Search within your favorite shows</p>
              </div>
              {profiles.length > 0 && (
                <div className="shrink-0">
                  <PersonaSelect profiles={profiles} value={profile} onChange={handleProfileChange} />
                </div>
              )}
            </div>

            <form onSubmit={onSubmit} className="relative max-w-2xl">
              <div className={`search-bar-shell rounded-2xl transition-all duration-300 ${searchFocused ? "search-bar-shell--focused" : ""}`}>
                <div className="relative flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3.5 shadow-sm">
                  <StrandIcon name="search" className={`h-5 w-5 shrink-0 transition-colors ${searchFocused ? "text-accent" : "text-text-tertiary"}`} />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onFocus={() => setSearchFocused(true)}
                    onBlur={() => setSearchFocused(false)}
                    onKeyDown={onSearchKeyDown}
                    placeholder="Type any query — e.g. heated argument at the dinner table"
                    className="min-w-0 flex-1 bg-transparent text-base text-text-primary placeholder:text-text-tertiary focus:outline-none"
                    aria-label="Search show moments"
                  />
                  {searchQuery && (
                    <button type="button" onClick={() => { setSearchQuery(""); setActiveQuery(null); }} className="shrink-0 rounded-md p-1 text-text-tertiary hover:text-text-primary" aria-label="Clear">
                      <StrandIcon name="close" className="h-4 w-4" />
                    </button>
                  )}
                  <button type="submit" disabled={loading || !searchQuery.trim()} className="shrink-0 rounded-xl bg-brand-charcoal px-4 py-2 text-sm font-medium text-text-inverse hover:opacity-90 disabled:opacity-40">
                    Search
                  </button>
                </div>
              </div>
            </form>
          </header>

          {/* Grid section */}
          <section className="space-y-4">
            <div className="explore-section-enter flex items-end justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-text-primary">{sectionTitle}</h2>
                <p className="mt-0.5 text-sm text-text-secondary">{sectionSub}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {loading && <Spinner className="h-5 w-5 text-text-tertiary" />}
                {status === "ready" && clips.length > 0 && (
                  <ExploreRawDataToggle
                    open={showRawData}
                    onToggle={() => setShowRawData((v) => !v)}
                  />
                )}
              </div>
            </div>

            <ExploreRawDataPanel
              open={showRawData && status === "ready" && clips.length > 0}
              clips={clips}
              showName={showName}
              profileLabel={PROFILE_LABELS[profile]}
              activeQuery={activeQuery}
            />

            {status === "error" && fetchError && (
              <p className="rounded-xl border border-error/30 bg-error/5 px-4 py-3 text-sm text-error">{fetchError}</p>
            )}
            {status === "ready" && clips.length === 0 && (
              <p className="py-12 text-center text-sm text-text-tertiary">No clips found.</p>
            )}

            {loading && clips.length === 0 ? (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 lg:gap-5">
                {Array.from({ length: 8 }, (_, i) => (
                  <div key={`sk-${i}`} className="aspect-9/14 animate-pulse rounded-2xl bg-card" />
                ))}
              </div>
            ) : (
              <div className={`grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 lg:gap-5 transition-opacity duration-300 ${loading ? "pointer-events-none opacity-50" : "opacity-100"}`}>
                {clips.map((clip, i) => (
                  <GridCard key={clipGridKey(clip)} clip={clip} index={i} onSelect={setSelectedClip} />
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      <ClipModal clip={selectedClip} onClose={() => setSelectedClip(null)} />
    </div>
  );
}
