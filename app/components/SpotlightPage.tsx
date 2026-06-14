"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { SegmentPlayer } from "@/components/SegmentPlayer";
import { useShow } from "@/components/ShowProvider";
import { StrandIcon } from "@/components/StrandIcon";
import { LogoMark } from "@/components/StrandLogo";
import { formatTimestampRange } from "@/lib/format";
import { trackClientTelemetry } from "@/lib/telemetry";
import type { AssetPlaybackResponse } from "@/lib/types";

// ─── Types matching the two Jockey structured schemas ────────────────────────

type StorySceneRole =
  | "origin"
  | "buildup"
  | "tension"
  | "turning_point"
  | "season_defining"
  | "aftermath";

type SpotlightClip = {
  asset_id: string;
  start_sec: number;
  end_sec: number;
  headline: string;
  description: string;
  significance?: "season_defining" | "high" | "medium";
  relevance_score?: number;
  category?: string;
  key_participants?: string[];
  other_participants?: string[];
  emotional_intensity?: number;
  chronological_order?: number;
  scene_role?: StorySceneRole;
  bridge_text?: string;
};

type StoryScene = SpotlightClip & {
  chronological_order: number;
  scene_role: StorySceneRole;
};

type ActorSpotlightResult = {
  actor_name: string;
  summary: string;
  total_appearances?: number;
  top_relationships?: Array<{ name: string; dynamic: string }>;
  clips: SpotlightClip[];
};

type MomentDiscoveryResult = {
  story_title: string;
  story_summary: string;
  query_interpretation: string;
  key_characters?: string[];
  story_scenes: StoryScene[];
  clips?: StoryScene[];
  total_found?: number;
};

type SpotlightResponse = {
  mode: "actor_spotlight" | "moment_discovery";
  session_id: string | null;
  result: ActorSpotlightResult | MomentDiscoveryResult;
  raw?: {
    request?: unknown;
    output_text?: string;
    response_id?: string | null;
  };
  telemetry?: {
    duration_ms?: number;
  };
};

type Mode = "actor_spotlight" | "moment_discovery";

// ─── HLS cache (module-level) ─────────────────────────────────────────────────
const hlsCache = new Map<string, string>();
// Tracks IDs that returned a non-retryable error so we don't hammer the API.
// Cleared on each new Spotlight query so stale failures don't persist.
const failedHlsAssetIds = new Set<string>();

export function clearSpotlightHlsFailures() {
  failedHlsAssetIds.clear();
}

async function fetchHlsUrl(
  assetId: string,
  showId: string,
  signal?: AbortSignal,
): Promise<string | null> {
  // Key cache by both assetId and show so switching shows doesn't serve wrong HLS
  const cacheKey = `${showId}:${assetId}`;
  if (failedHlsAssetIds.has(cacheKey)) return null;
  const hit = hlsCache.get(cacheKey);
  if (hit) return hit;
  const res = await fetch(`/api/assets/${assetId}?show=${encodeURIComponent(showId)}`, { signal });
  if (!res.ok) {
    failedHlsAssetIds.add(cacheKey);
    return null;
  }
  const body = (await res.json()) as AssetPlaybackResponse;
  if (body.hls_url) {
    hlsCache.set(cacheKey, body.hls_url);
    failedHlsAssetIds.delete(cacheKey);
  } else {
    failedHlsAssetIds.add(cacheKey);
  }
  return body.hls_url ?? null;
}

// ─── Spinner ──────────────────────────────────────────────────────────────────
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

// ─── Clip card with lazy HLS load ─────────────────────────────────────────────
function SpotlightClipCard({
  clip,
  index,
  showId,
  onSelect,
}: {
  clip: SpotlightClip;
  index: number;
  showId: string;
  onSelect: (clip: SpotlightClip) => void;
}) {
  const articleRef = useRef<HTMLElement>(null);
  const [hovered, setHovered] = useState(false);
  const cacheKey = `${showId}:${clip.asset_id}`;
  const [hlsUrl, setHlsUrl] = useState<string | null>(() => hlsCache.get(cacheKey) ?? null);
  const [hlsLoading, setHlsLoading] = useState(false);

  // Load HLS when card enters viewport
  useEffect(() => {
    const el = articleRef.current;
    if (!el) return;
    if (hlsCache.get(cacheKey)) {
      setHlsUrl(hlsCache.get(cacheKey)!);
      return;
    }
    let ac: AbortController | null = null;
    const obs = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      obs.disconnect();
      ac = new AbortController();
      setHlsLoading(true);
      fetchHlsUrl(clip.asset_id, showId, ac.signal)
        .then((url) => { if (!ac?.signal.aborted && url) setHlsUrl(url); })
        .catch(() => {})
        .finally(() => { if (!ac?.signal.aborted) setHlsLoading(false); });
    }, { threshold: 0.1 });
    obs.observe(el);
    return () => { obs.disconnect(); ac?.abort(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clip.asset_id, showId]);

  // Badge for significance or relevance
  const badge = clip.significance === "season_defining"
    ? { label: "Season Defining", cls: "bg-yellow-500/20 text-yellow-300 ring-yellow-500/30" }
    : clip.significance === "high" || (clip.relevance_score != null && clip.relevance_score >= 8)
    ? { label: clip.relevance_score != null ? `${clip.relevance_score}/10` : "High", cls: "bg-accent/20 text-accent ring-accent/30" }
    : clip.relevance_score != null
    ? { label: `${clip.relevance_score}/10`, cls: "bg-white/10 text-white/70 ring-white/10" }
    : null;

  const participants = clip.key_participants ?? clip.other_participants ?? [];

  return (
    <article
      ref={articleRef}
      className="group cursor-pointer rounded-2xl overflow-hidden bg-card ring-1 ring-border transition-all duration-300 hover:ring-accent/40 hover:shadow-lg hover:shadow-accent/5"
      style={{ animationDelay: `${Math.min(index, 11) * 40}ms` }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onSelect(clip)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(clip); } }}
      role="button"
      tabIndex={0}
      aria-label={`Play: ${clip.headline}`}
    >
      {/* Video thumbnail area */}
      <div className="relative aspect-video overflow-hidden bg-brand-charcoal">
        {/* Gradient fallback */}
        <div className="absolute inset-0 bg-linear-to-br from-brand-charcoal to-black" />

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

        {hlsLoading && !hlsUrl && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Spinner className="h-7 w-7 text-white/50" />
          </div>
        )}

        {/* Play overlay */}
        <div className="absolute inset-0 flex items-center justify-center transition-opacity duration-200 group-hover:opacity-0">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white/90 backdrop-blur-sm">
            <StrandIcon name="play" className="h-4 w-4" />
          </span>
        </div>

        <div className="pointer-events-none absolute inset-0 bg-linear-to-t from-black/60 to-transparent" />

        {/* Badge top-right */}
        {badge && (
          <span className={`absolute right-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${badge.cls}`}>
            {badge.label}
          </span>
        )}
      </div>

      {/* Text */}
      <div className="p-4 space-y-2">
        <p className="text-[11px] font-medium tabular-nums text-text-tertiary">
          {formatTimestampRange(clip.start_sec, clip.end_sec)}
        </p>
        <p className="font-semibold text-sm leading-snug text-text-primary line-clamp-2">{clip.headline}</p>
        <p className="text-xs text-text-secondary leading-relaxed line-clamp-2">{clip.description}</p>
        {participants.length > 0 && (
          <p className="text-[11px] text-text-tertiary">
            {participants.slice(0, 3).join(", ")}
            {participants.length > 3 && ` +${participants.length - 3}`}
          </p>
        )}
      </div>
    </article>
  );
}

// ─── Clip modal ───────────────────────────────────────────────────────────────
function ClipModal({ clip, showId, onClose }: { clip: SpotlightClip | null; showId: string; onClose: () => void }) {
  const [hlsUrl, setHlsUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!clip) return;
    const cacheKey = `${showId}:${clip.asset_id}`;
    const cached = hlsCache.get(cacheKey);
    if (cached) { setHlsUrl(cached); return; }
    setLoading(true);
    setError(null);
    const ac = new AbortController();
    fetchHlsUrl(clip.asset_id, showId, ac.signal)
      .then((url) => { if (!ac.signal.aborted) { setHlsUrl(url); if (!url) setError("No HLS stream available"); } })
      .catch(() => { if (!ac.signal.aborted) setError("Failed to load video"); })
      .finally(() => { if (!ac.signal.aborted) setLoading(false); });
    return () => ac.abort();
  }, [clip, showId]);

  useEffect(() => {
    if (!clip) return;
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [clip, onClose]);

  if (!clip) return null;

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose} role="presentation">
      <div className="relative w-full max-w-3xl overflow-hidden rounded-2xl bg-background shadow-2xl ring-1 ring-border" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <button type="button" onClick={onClose} className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70" aria-label="Close">
          <StrandIcon name="close" className="h-4 w-4" />
        </button>
        <div className="relative aspect-video w-full overflow-hidden bg-brand-charcoal">
          {loading && <div className="flex h-full min-h-[200px] items-center justify-center"><Spinner className="h-8 w-8 text-text-tertiary" /></div>}
          {!loading && hlsUrl && <SegmentPlayer hlsUrl={hlsUrl} startSec={clip.start_sec} endSec={clip.end_sec} />}
          {!loading && error && <div className="flex h-full min-h-[200px] items-center justify-center text-sm text-error">{error}</div>}
        </div>
        <div className="space-y-2 p-5">
          <h2 className="text-lg font-semibold text-text-primary">{clip.headline}</h2>
          <p className="text-sm text-text-secondary leading-relaxed">{clip.description}</p>
          <p className="text-xs text-text-tertiary">{formatTimestampRange(clip.start_sec, clip.end_sec)}</p>
        </div>
      </div>
    </div>
  );
}

const SCENE_ROLE_META: Record<
  StorySceneRole,
  { label: string; dotClass: string; badgeClass: string; icon: string }
> = {
  origin: {
    label: "Origin",
    dotClass: "bg-sky-400 ring-sky-400/40",
    badgeClass: "bg-sky-500/15 text-sky-300 ring-sky-500/25",
    icon: "idea",
  },
  buildup: {
    label: "Buildup",
    dotClass: "bg-violet-400 ring-violet-400/40",
    badgeClass: "bg-violet-500/15 text-violet-300 ring-violet-500/25",
    icon: "arrow-box-up",
  },
  tension: {
    label: "Tension",
    dotClass: "bg-orange-400 ring-orange-400/40",
    badgeClass: "bg-orange-500/15 text-orange-300 ring-orange-500/25",
    icon: "warning",
  },
  turning_point: {
    label: "Turning Point",
    dotClass: "bg-accent ring-accent/40",
    badgeClass: "bg-accent/15 text-accent ring-accent/25",
    icon: "arrow-diagonal",
  },
  season_defining: {
    label: "Season Defining",
    dotClass: "bg-yellow-400 ring-yellow-400/50 story-trail-dot--peak",
    badgeClass: "bg-yellow-500/20 text-yellow-200 ring-yellow-500/35",
    icon: "analyze",
  },
  aftermath: {
    label: "Aftermath",
    dotClass: "bg-slate-400 ring-slate-400/40",
    badgeClass: "bg-slate-500/15 text-slate-300 ring-slate-500/25",
    icon: "arrow-box-down",
  },
};

function StorySceneStep({
  scene,
  index,
  isLast,
  showId,
  onSelect,
}: {
  scene: StoryScene;
  index: number;
  isLast: boolean;
  showId: string;
  onSelect: (clip: SpotlightClip) => void;
}) {
  const liRef = useRef<HTMLLIElement>(null);
  const articleRef = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);
  const [hovered, setHovered] = useState(false);
  const cacheKey = `${showId}:${scene.asset_id}`;
  const [hlsUrl, setHlsUrl] = useState<string | null>(() => hlsCache.get(cacheKey) ?? null);
  const [hlsLoading, setHlsLoading] = useState(false);
  const meta = SCENE_ROLE_META[scene.scene_role] ?? SCENE_ROLE_META.buildup;
  const participants = scene.key_participants ?? scene.other_participants ?? [];

  // Scroll-triggered fade-in
  useEffect(() => {
    const el = liRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          // Stagger each step slightly
          setTimeout(() => setVisible(true), index * 60);
          obs.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [index]);

  // Lazy HLS load when card enters viewport
  useEffect(() => {
    const el = articleRef.current;
    if (!el) return;
    if (hlsCache.get(cacheKey)) {
      setHlsUrl(hlsCache.get(cacheKey)!);
      return;
    }
    let ac: AbortController | null = null;
    const obs = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      obs.disconnect();
      ac = new AbortController();
      setHlsLoading(true);
      fetchHlsUrl(scene.asset_id, showId, ac.signal)
        .then((url) => { if (!ac?.signal.aborted && url) setHlsUrl(url); })
        .catch(() => {})
        .finally(() => { if (!ac?.signal.aborted) setHlsLoading(false); });
    }, { threshold: 0.15 });
    obs.observe(el);
    return () => { obs.disconnect(); ac?.abort(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene.asset_id, showId]);

  return (
    <li
      ref={liRef}
      className={`story-trail-step relative flex gap-5 pb-10 last:pb-0 ${visible ? "story-trail-step--visible" : ""}`}
    >
      {/* Timeline rail */}
      <div className="relative flex w-10 shrink-0 flex-col items-center">
        {!isLast && (
          <div
            className="story-trail-line absolute top-5 bottom-0 w-0.5 bg-linear-to-b from-accent/50 via-border to-border/30"
            style={{ animationDelay: `${index * 90 + 120}ms` }}
          />
        )}
        <span
          className={`relative z-10 flex h-10 w-10 items-center justify-center rounded-full ring-4 ring-background ${meta.dotClass}`}
          aria-hidden
        >
          <StrandIcon name={meta.icon} className="h-4 w-4 text-white" />
        </span>
        <span className="mt-1 text-[10px] font-bold tabular-nums text-text-tertiary">
          {scene.chronological_order}
        </span>
      </div>

      {/* Scene card */}
      <article
        ref={articleRef}
        className={`group min-w-0 flex-1 cursor-pointer overflow-hidden rounded-2xl border bg-card transition-all duration-300 hover:shadow-lg ${
          scene.scene_role === "season_defining"
            ? "border-yellow-500/35 hover:border-yellow-500/55 hover:shadow-yellow-500/10"
            : "border-border hover:border-accent/35 hover:shadow-accent/5"
        }`}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={() => onSelect(scene)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(scene); } }}
        role="button"
        tabIndex={0}
        aria-label={`Play scene ${scene.chronological_order}: ${scene.headline}`}
      >
        <div className="relative aspect-video overflow-hidden bg-brand-charcoal sm:aspect-2/1">
          <div className="absolute inset-0 bg-linear-to-br from-brand-charcoal to-black" />
          {hlsUrl && (
            <SegmentPlayer
              hlsUrl={hlsUrl}
              startSec={scene.start_sec}
              endSec={scene.end_sec}
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
          {hlsLoading && !hlsUrl && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Spinner className="h-7 w-7 text-white/50" />
            </div>
          )}
          <div className="absolute inset-0 flex items-center justify-center transition-opacity duration-200 group-hover:opacity-0">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white/90 backdrop-blur-sm">
              <StrandIcon name="play" className="h-4 w-4" />
            </span>
          </div>
          <div className="pointer-events-none absolute inset-0 bg-linear-to-t from-black/70 via-transparent to-transparent" />
          <span className={`absolute left-3 top-3 rounded-full px-2.5 py-1 text-[10px] font-semibold ring-1 ${meta.badgeClass}`}>
            {meta.label}
          </span>
          <span className="absolute right-3 top-3 text-[11px] font-medium tabular-nums text-white/80 drop-shadow-sm">
            {formatTimestampRange(scene.start_sec, scene.end_sec)}
          </span>
        </div>

        <div className="space-y-2 p-4 sm:p-5">
          <h3 className="text-base font-semibold leading-snug text-text-primary">{scene.headline}</h3>
          <p className="text-sm leading-relaxed text-text-secondary">{scene.description}</p>
          {participants.length > 0 && (
            <p className="text-[11px] text-text-tertiary">
              {participants.slice(0, 4).join(" · ")}
            </p>
          )}
          {scene.bridge_text && !isLast && (
            <p className="mt-3 flex items-start gap-2 border-t border-border pt-3 text-xs italic leading-relaxed text-text-tertiary">
              <StrandIcon name="arrow-box-right" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent/70" />
              {scene.bridge_text}
            </p>
          )}
        </div>
      </article>
    </li>
  );
}

function StoryTrail({
  result,
  showId,
  onSelect,
}: {
  result: MomentDiscoveryResult;
  showId: string;
  onSelect: (clip: SpotlightClip) => void;
}) {
  const scenes = (result.story_scenes?.length ? result.story_scenes : result.clips ?? []) as StoryScene[];

  return (
    <div className="space-y-8">
      {/* Story header */}
      <div className="overflow-hidden rounded-2xl border border-border bg-linear-to-br from-card via-surface to-card p-6 sm:p-8">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
            <StrandIcon name="document-list" className="h-6 w-6" />
          </span>
          <div className="min-w-0 flex-1 space-y-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-text-tertiary">Storyline</p>
              <h2 className="mt-1 text-xl font-semibold text-text-primary sm:text-2xl">
                {result.story_title || "Your Story Arc"}
              </h2>
            </div>
            {result.story_summary && (
              <p className="text-sm leading-relaxed text-text-secondary">{result.story_summary}</p>
            )}
            {result.query_interpretation && (
              <p className="text-xs leading-relaxed text-text-tertiary">
                <span className="font-medium text-text-secondary">Your question: </span>
                {result.query_interpretation}
              </p>
            )}
            {result.key_characters && result.key_characters.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {result.key_characters.map((name) => (
                  <span key={name} className="rounded-full bg-surface px-3 py-1 text-xs font-medium text-text-primary ring-1 ring-border">
                    {name}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Chronological trail */}
      {scenes.length > 0 ? (
        <div>
          <div className="mb-6 flex items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-semibold text-text-primary">Story Trail</h3>
              <p className="mt-0.5 text-xs text-text-tertiary">
                {scenes.length} scenes in chronological order — from first hint to defining moment
              </p>
            </div>
            <span className="hidden rounded-lg bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent sm:inline">
              Earliest → Latest
            </span>
          </div>
          <ol className="relative m-0 list-none p-0">
            {scenes.map((scene, i) => (
              <StorySceneStep
                key={`${scene.asset_id}-${scene.start_sec}-${scene.chronological_order}`}
                scene={scene}
                index={i}
                isLast={i === scenes.length - 1}
                showId={showId}
                onSelect={onSelect}
              />
            ))}
          </ol>
        </div>
      ) : (
        <p className="py-12 text-center text-sm text-text-tertiary">No story scenes found for this question.</p>
      )}
    </div>
  );
}

const MODE_OPTIONS: { value: Mode; label: string }[] = [
  { value: "actor_spotlight", label: "Actor Spotlight" },
  { value: "moment_discovery", label: "Moment Discovery" },
];

// ─── Local-storage query cache helpers ───────────────────────────────────────
const LS_CACHE_ENABLED_KEY = "spotlight_cache_enabled";
const LS_CACHE_PREFIX = "spotlight_result:";

function lsCacheKey(mode: Mode, query: string) {
  return `${LS_CACHE_PREFIX}${mode}:${query.trim().toLowerCase()}`;
}

function loadCachedResult(mode: Mode, query: string): SpotlightResponse | null {
  try {
    const raw = localStorage.getItem(lsCacheKey(mode, query));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { result: SpotlightResponse; ts: number };
    // Expire after 24 h
    if (Date.now() - parsed.ts > 24 * 60 * 60 * 1000) {
      localStorage.removeItem(lsCacheKey(mode, query));
      return null;
    }
    return parsed.result;
  } catch {
    return null;
  }
}

function saveCachedResult(mode: Mode, query: string, result: SpotlightResponse) {
  try {
    localStorage.setItem(lsCacheKey(mode, query), JSON.stringify({ result, ts: Date.now() }));
  } catch {
    // Quota exceeded — silently ignore.
  }
}

function isCacheEnabled(): boolean {
  try { return localStorage.getItem(LS_CACHE_ENABLED_KEY) === "1"; } catch { return false; }
}

function setCacheEnabled(on: boolean) {
  try { localStorage.setItem(LS_CACHE_ENABLED_KEY, on ? "1" : "0"); } catch { /* ignore */ }
}

type ShowExamples = Record<Mode, string[]>;

const SHOW_EXAMPLES: Record<string, ShowExamples> = {
  kn: {
    actor_spotlight: [
      "Gordon Ramsay",
      "Manny",
      "Christina",
      "Evelyn",
    ],
    moment_discovery: [
      "When did Ramsay find the worst kitchen hygiene violations?",
      "Trace the moment owners go from denial to acceptance",
      "When did the family finally break down and open up to Ramsay?",
      "How did the restaurant transformation unfold step by step?",
      "What was the most explosive confrontation between Ramsay and the owners?",
    ],
  },
  tiwbg: {
    actor_spotlight: [
      "Lauren",
      "Belinda",
      "Fran",
    ],
    moment_discovery: [
      "When did the castaways first face a serious survival crisis?",
      "How did the group's morale shift after the boiling water accident?",
      "Trace the debate about killing the pigs for food",
      "When did someone first ask to leave the island?",
      "What were the biggest turning points in the group's survival strategy?",
    ],
  },
  rhoslc: {
    actor_spotlight: [
      "Lisa Barlow",
      "Meredith Marks",
      "Monica Garcia",
      "Whitney Rose",
      "Heather Gay",
    ],
    moment_discovery: [
      "When did Lisa and Meredith's friendship start to fracture?",
      "How did Monica's feud with the group escalate across episodes?",
      "Trace the drama that unfolded on the Trixie Motel trip",
      "What was the first sign Heather and Lisa were falling apart?",
      "When did the group finally confront each other at the reunion?",
    ],
  },
};

const DEFAULT_EXAMPLES: ShowExamples = {
  actor_spotlight: ["Gordon Ramsay"],
  moment_discovery: ["What was the most dramatic moment across all episodes?"],
};

// ─── Main page ────────────────────────────────────────────────────────────────
export function SpotlightPage() {
  const { showId } = useShow();
  const [mode, setMode] = useState<Mode>("actor_spotlight");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SpotlightResponse | null>(null);
  const [showRawData, setShowRawData] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [selectedClip, setSelectedClip] = useState<SpotlightClip | null>(null);
  const [cacheEnabled, setCacheEnabledState] = useState(false);
  const [cacheHit, setCacheHit] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Hydrate cache toggle from localStorage after mount
  useEffect(() => {
    setCacheEnabledState(isCacheEnabled());
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    setResult(null);
    setError(null);
    setSessionId(null);
    setSelectedClip(null);
    failedHlsAssetIds.clear();
  }, [showId]);

  const handleModeChange = (m: Mode) => {
    if (m !== mode) {
      setMode(m);
      setResult(null);
      setError(null);
      setSessionId(null);
      setQuery("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
    setDropdownOpen(false);
  };

  const handleSubmit = useCallback(async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed || loading) return;

    // Check local cache first (if enabled)
    if (cacheEnabled) {
      const cached = loadCachedResult(mode, trimmed);
      if (cached) {
        setResult(cached);
        setCacheHit(true);
        failedHlsAssetIds.clear();
        void trackClientTelemetry({ event: "spotlight_cache_hit", mode, query_length: trimmed.length });
        return;
      }
    }

    setCacheHit(false);
    setLoading(true);
    setError(null);
    failedHlsAssetIds.clear();
    const requestStarted = performance.now();
    void trackClientTelemetry({
      event: "spotlight_submit",
      mode,
      query_length: trimmed.length,
      has_session: Boolean(sessionId),
    });
    try {
      const res = await fetch("/api/spotlight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          query: trimmed,
          session_id: sessionId ?? undefined,
          show: showId,
        }),
        cache: "no-store",
      });
      const body = await res.json() as SpotlightResponse & { error?: string };
      if (!res.ok) throw new Error(body.error ?? `Error ${res.status}`);
      setResult(body);
      if (body.session_id) setSessionId(body.session_id);
      // Persist to cache if enabled
      if (cacheEnabled) saveCachedResult(mode, trimmed, body);
      const durationMs = Math.round(performance.now() - requestStarted);
      void trackClientTelemetry({
        event: "spotlight_success",
        mode,
        duration_ms: durationMs,
        clips_count:
          mode === "moment_discovery"
            ? ((body.result as MomentDiscoveryResult).story_scenes ?? (body.result as MomentDiscoveryResult).clips ?? []).length
            : ((body.result as ActorSpotlightResult).clips ?? []).length,
        server_duration_ms: body.telemetry?.duration_ms ?? null,
      });
    } catch (e) {
      const durationMs = Math.round(performance.now() - requestStarted);
      setError(e instanceof Error ? e.message : "Something went wrong");
      void trackClientTelemetry({
        event: "spotlight_error",
        mode,
        duration_ms: durationMs,
        message: e instanceof Error ? e.message : "unknown_error",
      });
    } finally {
      setLoading(false);
    }
  }, [mode, query, sessionId, loading, cacheEnabled, showId]);

  const clips: SpotlightClip[] = result
    ? (result.result as ActorSpotlightResult | MomentDiscoveryResult).clips ?? []
    : [];
  const actorResult = result?.mode === "actor_spotlight" ? result.result as ActorSpotlightResult : null;
  const momentResult = result?.mode === "moment_discovery" ? result.result as MomentDiscoveryResult : null;

  const modeLabel = MODE_OPTIONS.find((o) => o.value === mode)!.label;
  const examples = SHOW_EXAMPLES[showId] ?? DEFAULT_EXAMPLES;
  const placeholder = mode === "actor_spotlight"
    ? `Enter a cast member name — e.g. "${examples.actor_spotlight[0]}"`
    : "Ask a story question — when did X happen?"; 

  const showEmpty = !loading && !result && !error;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <div className="min-h-0 flex-1 overflow-y-auto">

        {/* ── Hero / search area — centred when empty, compact after results ── */}
        <div className={`mx-auto w-full max-w-2xl px-6 transition-all duration-500 ${showEmpty ? "flex min-h-[60vh] flex-col items-center justify-center py-12 text-center" : "px-6 pt-8 pb-4 md:px-10"}`}>

          {/* Logo + title */}
          <div className={`flex flex-col items-center gap-3 ${showEmpty ? "mb-8 w-full" : "mb-6 flex-row gap-3 items-center w-full"}`}>
            {!showEmpty && <LogoMark className="h-7 w-7 transition-all duration-300" />}
            {showEmpty && <LogoMark className="h-12 w-12 transition-all duration-300" />}
            <div className={`${showEmpty ? "space-y-1" : ""} min-w-0 flex-1`}>
              <h1 className={`font-semibold tracking-tight text-text-primary transition-all duration-300 ${showEmpty ? "text-3xl md:text-4xl" : "text-xl"}`}>
                Jockey Spotlight
              </h1>
              {showEmpty && (
                <p className="text-base text-text-secondary max-w-sm mx-auto">
                  Follow your favorite characters and moments between cross-episodes with Jockey
                </p>
              )}
            </div>
            {/* Cache toggle — always visible */}
            <button
              type="button"
              onClick={() => {
                const next = !cacheEnabled;
                setCacheEnabledState(next);
                setCacheEnabled(next);
              }}
              title={cacheEnabled ? "Cache enabled — results saved locally" : "Cache disabled — each query hits Jockey"}
              className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                cacheEnabled
                  ? "border-accent/40 bg-accent/10 text-accent"
                  : "border-border bg-surface text-text-tertiary hover:text-text-secondary"
              }`}
              aria-pressed={cacheEnabled}
            >
              <span
                className={`inline-block h-3 w-5 rounded-full transition-colors ${cacheEnabled ? "bg-accent" : "bg-border"}`}
                aria-hidden
              >
                <span
                  className={`block h-3 w-3 rounded-full bg-white shadow transition-transform ${cacheEnabled ? "translate-x-2" : "translate-x-0"}`}
                />
              </span>
              Cache
            </button>
          </div>

          {/* Search bar */}
          <form onSubmit={handleSubmit} className={`w-full ${showEmpty ? "" : ""}`}>
            <div className={`search-bar-shell rounded-2xl transition-all duration-300 ${searchFocused ? "search-bar-shell--focused" : ""}`}>
              <div className="flex items-center gap-2 rounded-2xl border border-border bg-surface px-4 py-3 shadow-sm">

                {/* Left icon */}
                <StrandIcon
                  name={mode === "actor_spotlight" ? "profile" : "search"}
                  className={`h-5 w-5 shrink-0 transition-colors ${searchFocused ? "text-accent" : "text-text-tertiary"}`}
                />

                {/* Input */}
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setSearchFocused(false)}
                  placeholder={placeholder}
                  className="min-w-0 flex-1 bg-transparent text-base text-text-primary placeholder:text-text-tertiary focus:outline-none"
                  aria-label={placeholder}
                  autoFocus
                />

                {/* Clear */}
                {!loading && query && (
                  <button type="button" onClick={() => setQuery("")} className="shrink-0 rounded-md p-1 text-text-tertiary hover:text-text-primary" aria-label="Clear">
                    <StrandIcon name="close" className="h-4 w-4" />
                  </button>
                )}

                {/* Mode dropdown — mimics the "Pro ▾" pill in the screenshot */}
                <div ref={dropdownRef} className="relative shrink-0">
                  <button
                    type="button"
                    onClick={() => setDropdownOpen((o) => !o)}
                    className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-1.5 text-sm font-medium text-text-primary transition-colors hover:bg-surface"
                    aria-haspopup="listbox"
                    aria-expanded={dropdownOpen}
                  >
                    {modeLabel}
                    <StrandIcon name="expand" className={`h-3.5 w-3.5 text-text-tertiary transition-transform duration-150 ${dropdownOpen ? "rotate-180" : ""}`} />
                  </button>

                  {dropdownOpen && (
                    <div className="absolute right-0 top-full z-50 mt-1.5 w-52 overflow-hidden rounded-xl border border-border bg-surface shadow-lg" role="listbox">
                      {MODE_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          role="option"
                          aria-selected={opt.value === mode}
                          onClick={() => handleModeChange(opt.value)}
                          className={`flex w-full items-center gap-2.5 px-4 py-3 text-left text-sm transition-colors ${
                            opt.value === mode
                              ? "bg-accent/10 text-accent"
                              : "text-text-primary hover:bg-card"
                          }`}
                        >
                          <StrandIcon
                            name={opt.value === "actor_spotlight" ? "profile" : "search"}
                            className="h-4 w-4 shrink-0"
                          />
                          <div>
                            <p className="font-medium">{opt.label}</p>
                            <p className="text-[11px] text-text-tertiary">
                              {opt.value === "actor_spotlight" ? "Track a cast member's arc" : "Trace storylines across episodes"}
                            </p>
                          </div>
                          {opt.value === mode && (
                            <StrandIcon name="checkmark" className="ml-auto h-3.5 w-3.5 shrink-0 text-accent" />
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Submit */}
                <button
                  type="submit"
                  disabled={loading || !query.trim()}
                  className="shrink-0 flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-white transition-opacity hover:opacity-90 disabled:opacity-30"
                  aria-label="Search"
                >
                  {loading
                    ? <Spinner className="h-4 w-4" />
                    : <StrandIcon name="arrow-box-right" className="h-4 w-4" />
                  }
                </button>
              </div>
            </div>

            {/* Session indicator */}
            {sessionId && (
              <p className="mt-2 flex items-center gap-2 text-xs text-text-tertiary">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent" />
                Session active · follow-ups build on this context
                <button type="button" className="text-error hover:underline" onClick={() => { setSessionId(null); setResult(null); }}>
                  Clear
                </button>
              </p>
            )}
          </form>

          {/* Example queries — shown only on empty state */}
          {showEmpty && (
            <div className="mt-8 w-full">
              <p className="mb-3 text-xs font-medium uppercase tracking-wider text-text-tertiary">
                {mode === "actor_spotlight" ? "Try a cast member" : "Try a storyline question"}
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {examples[mode].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => { setQuery(s); inputRef.current?.focus(); }}
                    className="rounded-full border border-border bg-surface px-4 py-2 text-sm text-text-secondary transition-colors hover:border-accent/40 hover:bg-card hover:text-text-primary"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Results ── */}
        <div className="mx-auto max-w-5xl px-6 pb-12 md:px-10">
          {!loading && result && (
            <div className="mb-5 flex items-center justify-between gap-3 flex-wrap">
              {cacheHit ? (
                <span className="flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/8 px-2.5 py-1 text-[11px] font-medium text-accent">
                  <StrandIcon name="hourglass" className="h-3 w-3" />
                  From local cache
                </span>
              ) : <span />}
              <button
                type="button"
                onClick={() => {
                  setShowRawData((s) => !s);
                  void trackClientTelemetry({
                    event: "spotlight_raw_data_toggle",
                    mode: result.mode,
                    open: !showRawData,
                  });
                }}
                className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-card hover:text-text-primary"
              >
                {showRawData ? "Hide Raw Data" : "Show Raw Data"}
              </button>
            </div>           
          )}

          {!loading && result && showRawData && (
            <div className="mb-6 overflow-hidden rounded-xl border border-border bg-card">
              <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                <p className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                  Raw Jockey JSON
                </p>
                <p className="text-[11px] text-text-tertiary">
                  {result.raw?.response_id ? `response_id: ${result.raw.response_id}` : "response_id unavailable"}
                </p>
              </div>
              <pre className="max-h-88 overflow-auto px-4 py-3 text-[11px] leading-relaxed text-text-secondary">
                {JSON.stringify(
                  {
                    mode: result.mode,
                    session_id: result.session_id,
                    telemetry: result.telemetry,
                    raw: result.raw ?? null,
                    parsed_result: result.result,
                  },
                  null,
                  2,
                )}
              </pre>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mb-6 rounded-xl border border-error/30 bg-error/5 px-4 py-3 text-sm text-error">
              {error}
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="flex flex-col items-center gap-4 py-20">
              <Spinner className="h-10 w-10 text-accent" />
              <p className="text-sm text-text-secondary animate-pulse">
                {mode === "actor_spotlight"
                  ? `Jockey is analysing all episodes for "${query}"…`
                  : "Jockey is tracing the story across all episodes…"}
              </p>
            </div>
          )}

          {/* Actor Spotlight results */}
          {!loading && actorResult && (
            <div className="space-y-8">
              <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
                <div className="flex items-start gap-4">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
                    <StrandIcon name="profile" className="h-6 w-6" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-xl font-semibold text-text-primary">{actorResult.actor_name}</h2>
                    {actorResult.total_appearances != null && (
                      <p className="text-xs text-text-tertiary mt-0.5">{actorResult.total_appearances} appearances across all episodes</p>
                    )}
                    <p className="mt-3 text-sm leading-relaxed text-text-secondary">{actorResult.summary}</p>
                  </div>
                </div>
                {actorResult.top_relationships && actorResult.top_relationships.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-medium uppercase tracking-wider text-text-tertiary">Key Relationships</p>
                    <div className="flex flex-wrap gap-2">
                      {actorResult.top_relationships.map((rel) => (
                        <span key={rel.name} className="rounded-lg bg-surface px-3 py-1.5 text-xs ring-1 ring-border">
                          <span className="font-medium text-text-primary">{rel.name}</span>
                          <span className="ml-1.5 text-text-tertiary">· {rel.dynamic}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              {clips.length > 0 && (
                <div>
                  <h3 className="mb-4 text-base font-semibold text-text-primary">Top Moments</h3>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {clips.map((clip, i) => (
                      <SpotlightClipCard key={`${clip.asset_id}-${clip.start_sec}`} clip={clip} index={i} showId={showId} onSelect={setSelectedClip} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Moment Discovery — story trail */}
          {!loading && momentResult && (
            <StoryTrail result={momentResult} showId={showId} onSelect={setSelectedClip} />
          )}

        </div>
      </div>

      <ClipModal clip={selectedClip} showId={showId} onClose={() => setSelectedClip(null)} />
    </div>
  );
}
