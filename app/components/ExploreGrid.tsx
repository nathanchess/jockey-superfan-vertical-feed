"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MetaChip } from "@/components/MetaChip";
import { PersonaEmptyState } from "@/components/PersonaEmptyState";
import { PersonaSelect, type PersonaOption } from "@/components/PersonaSelect";
import { ReasoningPanel } from "@/components/ReasoningPanel";
import { useShow } from "@/components/ShowProvider";
import { ExploreRawDataPanel, ExploreRawDataToggle } from "@/components/ExploreRawDataPanel";
import { SegmentPlayer } from "@/components/SegmentPlayer";
import { StrandIcon } from "@/components/StrandIcon";
import { CATEGORY_LABELS, formatCategoryLabel } from "@/lib/categoryLabels";
import { clipGridKey } from "@/lib/clipKey";
import { dedupeClips } from "@/lib/dedupeClips";
import { similarSearchQuery, SUGGESTED_QUERIES, categoryMomentsSearchQuery } from "@/lib/exploreSuggestions";
import type { GridClip } from "@/lib/exploreRawData";
import { formatLabel } from "@/lib/formatLabel";
import { formatTimestampRange } from "@/lib/format";
import { PREFERENCE_PROFILES, PROFILE_LABELS } from "@/lib/profiles";
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

const EXPLORE_BROWSE_LIMIT = 48;
const EXPLORE_SEARCH_LIMIT = 12;
const TOP_PICKS_COUNT = 12;
const CATEGORY_ROW_LIMIT = 5;

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

function groupClipsByCategory(clips: GridClip[]): Map<string, GridClip[]> {
  const map = new Map<string, GridClip[]>();
  for (const clip of clips) {
    const category = clip.primary_category ?? "other";
    const bucket = map.get(category) ?? [];
    bucket.push(clip);
    map.set(category, bucket);
  }
  return map;
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
  compact = false,
}: {
  clip: GridClip;
  index: number;
  onSelect: (c: GridClip) => void;
  compact?: boolean;
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
      className={`explore-grid-item explore-grid-item--visible group cursor-pointer ${compact ? "w-[188px] shrink-0 snap-start" : ""}`}
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
        <div className="pointer-events-none absolute inset-0 bg-linear-to-t from-black/95 via-black/35 to-transparent" />
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 p-4 pb-5">
          <p
            className={`font-semibold leading-snug text-white ${
              compact ? "line-clamp-3 text-xs" : "line-clamp-3 text-base"
            }`}
          >
            {clip.feed_headline}
          </p>
          {!compact && clip.description && (
            <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-white/75">
              {clip.description}
            </p>
          )}
          <p className="mt-1.5 text-[11px] text-white/65">{formatTimestampRange(clip.start_sec, clip.end_sec)}</p>
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

function FeaturedHeroCard({
  clip,
  onSelect,
}: {
  clip: GridClip;
  onSelect: (c: GridClip) => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [hlsUrl, setHlsUrl] = useState<string | null>(() => hlsCache.get(clip.asset_id) ?? null);

  useEffect(() => {
    const el = ref.current;
    if (!el || hlsCache.has(clip.asset_id)) {
      if (hlsCache.has(clip.asset_id)) setHlsUrl(hlsCache.get(clip.asset_id)!);
      return;
    }

    let ac: AbortController | null = null;
    const obs = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      obs.disconnect();
      ac = new AbortController();
      void fetchHlsUrl(clip.asset_id, ac.signal).then((url) => {
        if (!ac?.signal.aborted && url) setHlsUrl(url);
      });
    }, { threshold: 0.1 });

    obs.observe(el);
    return () => {
      obs.disconnect();
      ac?.abort();
    };
  }, [clip.asset_id]);

  const normalized = clip.match_score != null ? normalizeMatchScore(clip.match_score) : null;
  const tierColors =
    normalized !== null ? MATCH_SCORE_TIER_COLORS[matchScoreTier(normalized)] : null;

  return (
    <button
      ref={ref}
      type="button"
      onClick={() => onSelect(clip)}
      className="group w-full overflow-hidden rounded-2xl text-left ring-1 ring-border transition-shadow hover:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      aria-label={`Featured clip: ${clip.feed_headline}`}
    >
      <div className="grid gap-0 md:grid-cols-[1.4fr_1fr]">
        <div className="relative aspect-video overflow-hidden bg-brand-charcoal md:min-h-[240px]">
          <div className="absolute inset-0" style={{ background: cardGradient(clip.asset_id) }} />
          {hlsUrl && (
            <SegmentPlayer
              hlsUrl={hlsUrl}
              startSec={clip.start_sec}
              endSec={clip.end_sec}
              autoPlay={false}
              objectFit="cover"
              hideCenterPlay
              className="absolute inset-0"
            />
          )}
          <div className="pointer-events-none absolute inset-0 bg-linear-to-t from-black/50 to-transparent" />
          <span className="pointer-events-none absolute left-4 top-4 rounded-full bg-black/45 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-white/90 backdrop-blur-sm">
            Featured pick
          </span>
        </div>
        <div className="flex flex-col justify-center gap-3 bg-surface p-5 md:p-6">
          <p className="text-[10px] font-medium uppercase tracking-wider text-text-tertiary">
            Top match · {formatCategoryLabel(clip.primary_category)}
          </p>
          <h2 className="text-xl font-semibold leading-snug text-text-primary md:text-2xl">
            {clip.feed_headline}
          </h2>
          <p className="line-clamp-3 text-sm leading-relaxed text-text-secondary">
            {clip.description}
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="rounded-full border border-border-light bg-card px-2.5 py-1 text-xs text-text-secondary">
              {formatTimestampRange(clip.start_sec, clip.end_sec)}
            </span>
            {normalized !== null && tierColors && (
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums ${tierColors.bg} ${tierColors.text}`}>
                {normalized} match
              </span>
            )}
            <span className="inline-flex items-center gap-1 text-xs font-medium text-accent">
              Watch clip
              <StrandIcon name="arrow-box-right" className="h-3.5 w-3.5" />
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}

// ─── ClipModal ────────────────────────────────────────────────────────────────
function ClipModal({
  clip,
  profile,
  showId,
  showName,
  onClose,
  onSearchSimilar,
}: {
  clip: GridClip | null;
  profile: ProfileId;
  showId: string;
  showName: string | null;
  onClose: () => void;
  onSearchSimilar: (query: string) => void;
}) {
  const [playback, setPlayback] = useState<AssetPlaybackResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rankedClip, setRankedClip] = useState<RankedSegment | null>(null);
  const [reasoningOpen, setReasoningOpen] = useState(false);

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
    if (!clip) {
      setRankedClip(null);
      setReasoningOpen(false);
      return;
    }

    const params = new URLSearchParams({
      show: showId,
      profile,
      segment_id: clip.segment_id,
      asset_id: clip.asset_id,
      start_sec: String(clip.start_sec),
      end_sec: String(clip.end_sec),
    });

    const ac = new AbortController();
    void fetch(`/api/segment?${params}`, { signal: ac.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { clip?: RankedSegment } | null) => {
        if (!ac.signal.aborted) setRankedClip(body?.clip ?? null);
      })
      .catch(() => {
        if (!ac.signal.aborted) setRankedClip(null);
      });

    return () => ac.abort();
  }, [clip, profile, showId]);

  useEffect(() => {
    if (!clip) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (reasoningOpen) {
        setReasoningOpen(false);
      } else {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [clip, onClose, reasoningOpen]);

  if (!clip) return null;

  const normalized =
    rankedClip?.match_score != null
      ? normalizeMatchScore(rankedClip.match_score)
      : clip.match_score != null
        ? normalizeMatchScore(clip.match_score)
        : null;
  const tierColors =
    normalized !== null ? MATCH_SCORE_TIER_COLORS[matchScoreTier(normalized)] : null;
  const shortsHref = `/?segment=${encodeURIComponent(clip.segment_id)}`;
  const similarQuery = similarSearchQuery({
    primary_category: clip.primary_category,
    feed_headline: clip.feed_headline,
  });

  return (
    <>
      <div className="explore-modal-backdrop fixed inset-0 z-100 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose} role="presentation">
        <div className="explore-modal-panel relative max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-background shadow-2xl ring-1 ring-border" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
          <button type="button" onClick={onClose} className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white transition-colors hover:bg-black/70" aria-label="Close">
            <StrandIcon name="close" className="h-4 w-4" />
          </button>
          <div className="relative aspect-video w-full overflow-hidden bg-brand-charcoal">
            {loading && <div className="flex h-full min-h-[220px] items-center justify-center"><Spinner className="h-8 w-8 text-text-tertiary" /></div>}
            {!loading && playback?.hls_url && <SegmentPlayer hlsUrl={playback.hls_url} startSec={clip.start_sec} endSec={clip.end_sec} poster={playback.thumbnail_url} />}
            {!loading && error && <div className="flex h-full min-h-[220px] items-center justify-center p-6 text-center text-sm text-error">{error}</div>}
          </div>
          <div className="space-y-4 p-5">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-text-tertiary">
                {formatCategoryLabel(clip.primary_category)}
                {isSearchHit(clip) && " · Search result"}
              </p>
              <h2 className="mt-1 text-lg font-semibold text-text-primary">{clip.feed_headline}</h2>
              <p className="mt-2 text-sm leading-relaxed text-text-secondary">{clip.description}</p>
            </div>

            <div className="flex flex-wrap gap-2">
              <MetaChip label="Duration" value={formatTimestampRange(clip.start_sec, clip.end_sec)} />
              {clip.emotional_intensity != null && (
                <MetaChip label="Intensity" value={`${clip.emotional_intensity}/10`} />
              )}
              {normalized !== null && tierColors && (
                <MetaChip
                  label="Match score"
                  value={`${normalized}/100`}
                  valueClassName={tierColors.text}
                />
              )}
            </div>

            <div className="flex flex-wrap gap-2 border-t border-border-light pt-4">
              <Link
                href={shortsHref}
                className="inline-flex items-center gap-2 rounded-xl bg-brand-charcoal px-4 py-2 text-sm font-medium text-text-inverse transition-opacity hover:opacity-90"
              >
                <StrandIcon name="play-boxed" className="h-4 w-4" />
                Open in Shorts
              </Link>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onSearchSimilar(similarQuery);
                }}
                className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-card"
              >
                <StrandIcon name="search" className="h-4 w-4" />
                Search for more moments
              </button>
              {rankedClip && (
                <button
                  type="button"
                  onClick={() => setReasoningOpen(true)}
                  className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:border-accent hover:bg-accent-light"
                >
                  <StrandIcon name="analyze" className="h-4 w-4 text-accent" />
                  Why this clip
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <ReasoningPanel
        clip={rankedClip}
        profileId={profile}
        manifestShowName={showName}
        open={reasoningOpen}
        onClose={() => setReasoningOpen(false)}
        elevated
      />
    </>
  );
}

// ─── ExploreGrid ──────────────────────────────────────────────────────────────
export function ExploreGrid() {
  const { showId, ready: showReady } = useShow();
  const router = useRouter();
  const searchParams = useSearchParams();
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
  const urlSyncedRef = useRef(false);

  useEffect(() => {
    const q = searchParams.get("q")?.trim();
    if (q) {
      setSearchQuery(q);
      setActiveQuery(q);
    }
    urlSyncedRef.current = true;
  }, [searchParams]);

  useEffect(() => {
    if (!urlSyncedRef.current) return;
    const next = activeQuery
      ? `/explore?q=${encodeURIComponent(activeQuery)}`
      : "/explore";
    const current = searchParams.get("q");
    const currentPath =
      current != null && current.length > 0
        ? `/explore?q=${encodeURIComponent(current)}`
        : "/explore";
    if (next !== currentPath) {
      router.replace(next, { scroll: false });
    }
  }, [activeQuery, router, searchParams]);

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
    if (!showReady) return;
    const reqId = ++reqIdRef.current;
    setStatus("loading");
    setFetchError(null);
    setSelectedClip(null);
    setShowRawData(false);

    const showQ = `show=${showId}`;
    const url = activeQuery
      ? `/api/search?${showQ}&q=${encodeURIComponent(activeQuery)}&profile=${profile}`
      : `/api/feed?${showQ}&profile=${profile}&offset=0&limit=${EXPLORE_BROWSE_LIMIT}`;

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
          newClips = dedupeClips(s.results).slice(0, EXPLORE_SEARCH_LIMIT);
        } else {
          const p = body as FeedPageResponse;
          name = p.show_name ?? null;
          newClips = dedupeClips(p.clips);
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
  }, [profile, activeQuery, showId, showReady]);

  const handleProfileChange = useCallback((p: ProfileId) => {
    setProfile(p);
  }, []);

  const applySearch = useCallback((query: string) => {
    const trimmed = query.trim();
    setSearchQuery(trimmed);
    setActiveQuery(trimmed || null);
  }, []);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    applySearch(searchQuery);
  };

  const onSearchKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setSearchQuery("");
      setSearchFocused(false);
      setActiveQuery(null);
    }
  };

  const loading = status === "loading";
  const browseMode = !activeQuery;

  const featuredClip = browseMode && clips.length > 0 ? clips[0] : null;
  const topPicks = useMemo(() => {
    if (!browseMode || clips.length <= 1) return browseMode ? clips : clips;
    return clips.slice(1, 1 + TOP_PICKS_COUNT);
  }, [browseMode, clips]);

  const categoryRows = useMemo(() => {
    if (!browseMode || clips.length === 0) return [];
    const grouped = groupClipsByCategory(clips);
    const personaCategories = PREFERENCE_PROFILES[profile].categories;
    const ordered = [
      ...personaCategories.filter((c) => grouped.has(c)),
      ...[...grouped.keys()].filter((c) => !personaCategories.includes(c)),
    ];

    return ordered
      .map((category) => ({
        category,
        label: CATEGORY_LABELS[category as keyof typeof CATEGORY_LABELS] ?? formatLabel(category),
        clips: (grouped.get(category) ?? []).slice(0, CATEGORY_ROW_LIMIT),
      }))
      .filter((row) => row.clips.length > 0);
  }, [browseMode, clips, profile]);

  const sectionTitle = activeQuery ? `Results for "${activeQuery}"` : "Top picks for you";
  const sectionSub = activeQuery
    ? `Moments matching your search${showName ? ` · ${showName}` : ""}`
    : `Best clips ranked for your persona${showName ? ` · ${showName}` : ""}`;
  const displayClips = browseMode ? topPicks : clips;

  return (
    <div className="explore-page flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-background">
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden">
        <div className="mx-auto max-w-6xl min-w-0 px-6 py-8 md:px-10 md:py-10">

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

            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
                Try searching
              </p>
              <div className="flex flex-wrap gap-2">
                {SUGGESTED_QUERIES[profile].map((query) => (
                  <button
                    key={query}
                    type="button"
                    onClick={() => applySearch(query)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                      activeQuery === query
                        ? "border-accent bg-accent-light text-text-primary"
                        : "border-border-light bg-surface text-text-secondary hover:border-accent/40 hover:bg-card hover:text-text-primary"
                    }`}
                  >
                    {query}
                  </button>
                ))}
              </div>
            </div>
          </header>

          {browseMode && featuredClip && status === "ready" && (
            <section className="explore-section-enter mb-10">
              <FeaturedHeroCard clip={featuredClip} onSelect={setSelectedClip} />
            </section>
          )}

          {browseMode && categoryRows.length > 0 && status === "ready" && (
            <div className="mb-10 min-w-0 space-y-8">
              {categoryRows.map(({ category, label, clips: rowClips }) => (
                <section key={category} className="explore-section-enter min-w-0 space-y-3">
                  <div className="flex items-end justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="text-lg font-semibold text-text-primary">{label}</h2>
                      <p className="mt-0.5 text-sm text-text-secondary">
                        Browse {label.toLowerCase()}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => applySearch(categoryMomentsSearchQuery(category))}
                      className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-border-light bg-surface px-2.5 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-border hover:bg-card hover:text-text-primary"
                    >
                      <StrandIcon name="search" className="h-3.5 w-3.5" />
                      Search for more moments
                    </button>
                  </div>
                  <div className="min-w-0 overflow-hidden">
                    <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1 snap-x snap-mandatory">
                    {rowClips.map((clip, i) => (
                      <GridCard
                        key={clipGridKey(clip)}
                        clip={clip}
                        index={i}
                        onSelect={setSelectedClip}
                        compact
                      />
                    ))}
                    </div>
                  </div>
                </section>
              ))}
            </div>
          )}

          {/* Grid section */}
          <section className="space-y-4">
            <div className="explore-section-enter flex items-end justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-text-primary">{sectionTitle}</h2>
                <p className="mt-0.5 text-sm text-text-secondary">{sectionSub}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {loading && <Spinner className="h-5 w-5 text-text-tertiary" />}
                {status === "ready" && displayClips.length > 0 && (
                  <ExploreRawDataToggle
                    open={showRawData}
                    onToggle={() => setShowRawData((v) => !v)}
                  />
                )}
              </div>
            </div>

            <ExploreRawDataPanel
              open={showRawData && status === "ready" && displayClips.length > 0}
              clips={displayClips}
              showName={showName}
              profileLabel={PROFILE_LABELS[profile]}
              activeQuery={activeQuery}
            />

            {status === "error" && fetchError && (
              <p className="rounded-xl border border-error/30 bg-error/5 px-4 py-3 text-sm text-error">{fetchError}</p>
            )}
            {status === "ready" && displayClips.length === 0 && !activeQuery && (
              <PersonaEmptyState profileId={profile} />
            )}
            {status === "ready" && displayClips.length === 0 && activeQuery && (
              <div className="py-8 text-center">
                <p className="text-sm text-text-secondary">
                  No results for &ldquo;{activeQuery}&rdquo;. Try a different search or switch personas.
                </p>
              </div>
            )}

            {loading && displayClips.length === 0 ? (
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
                {Array.from({ length: 6 }, (_, i) => (
                  <div key={`sk-${i}`} className="aspect-9/14 animate-pulse rounded-2xl bg-card" />
                ))}
              </div>
            ) : (
              <div className={`grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6 transition-opacity duration-300 ${loading ? "pointer-events-none opacity-50" : "opacity-100"}`}>
                {displayClips.map((clip, i) => (
                  <GridCard key={clipGridKey(clip)} clip={clip} index={i} onSelect={setSelectedClip} />
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      <ClipModal
        clip={selectedClip}
        profile={profile}
        showId={showId}
        showName={showName}
        onClose={() => setSelectedClip(null)}
        onSearchSimilar={applySearch}
      />
    </div>
  );
}
