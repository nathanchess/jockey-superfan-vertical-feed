"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ClipTransition, type SlideDirection } from "@/components/ClipTransition";
import { PersonaSelect, type PersonaOption } from "@/components/PersonaSelect";
import { useShow } from "@/components/ShowProvider";
import { ReasoningPanel } from "@/components/ReasoningPanel";
import { SegmentPlayer } from "@/components/SegmentPlayer";
import { StrandIcon } from "@/components/StrandIcon";
import { formatTimestampRange } from "@/lib/format";
import { trackClientTelemetry } from "@/lib/telemetry";
import {
  matchScoreTier,
  MATCH_SCORE_TIER_COLORS,
  normalizeMatchScore,
} from "@/lib/scoreDisplay";
import type { AssetPlaybackResponse, FeedPageResponse, ProfileId, RankedSegment } from "@/lib/types";

const SCROLL_COOLDOWN_MS = 520;

function formatLabel(value: string) {
  return value.replace(/_/g, " ");
}

function MetaChip({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-lg border border-border-light bg-card px-3 py-2">
      <p className="text-[10px] font-medium uppercase tracking-wider text-text-tertiary">{label}</p>
      <p className={`mt-0.5 text-sm font-medium ${valueClassName ?? "text-text-primary"}`}>
        {value}
      </p>
    </div>
  );
}

export function ShortsFeed() {
  const { showId, ready: showReady } = useShow();
  const [profiles, setProfiles] = useState<PersonaOption[]>([]);
  const [profile, setProfile] = useState<ProfileId>("drama_addict");
  const [clips, setClips] = useState<RankedSegment[]>([]);
  const [index, setIndex] = useState(0);
  const [slideDirection, setSlideDirection] = useState<SlideDirection>("down");
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingFeed, setLoadingFeed] = useState(true);
  const [feedError, setFeedError] = useState<string | null>(null);

  const [playback, setPlayback] = useState<AssetPlaybackResponse | null>(null);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [loadingPlayback, setLoadingPlayback] = useState(false);

  const [reasoningOpen, setReasoningOpen] = useState(false);
  const [manifestShowName, setManifestShowName] = useState<string | null>(null);

  const feedRef = useRef<HTMLDivElement>(null);
  const scrollLock = useRef(false);
  const assetCache = useRef(new Map<string, AssetPlaybackResponse>());

  const clip = clips[index] ?? null;
  const clipKey = clip?.segment_id ?? "empty";

  useEffect(() => {
    fetch("/api/profiles")
      .then((r) => r.json())
      .then((data: { profiles: PersonaOption[] }) => setProfiles(data.profiles))
      .catch(() => setFeedError("Failed to load personas"));
  }, []);

  const loadFeed = useCallback(
    async (nextProfile: ProfileId, nextOffset: number, replace: boolean) => {
      const startedAt = performance.now();
      setLoadingFeed(true);
      setFeedError(null);
      try {
        const res = await fetch(
          `/api/feed?show=${showId}&profile=${nextProfile}&offset=${nextOffset}&limit=20`,
        );
        if (!res.ok) {
          const body = await res.json();
          throw new Error(body.error ?? "Feed request failed");
        }
        const page: FeedPageResponse = await res.json();
        void trackClientTelemetry({
          event: "feed_page_loaded",
          profile: nextProfile,
          offset: nextOffset,
          replace,
          clips_count: page.clips.length,
          duration_ms: Math.round(performance.now() - startedAt),
        });
        if (page.show_name) setManifestShowName(page.show_name);
        setClips((prev) => (replace ? page.clips : [...prev, ...page.clips]));
        setOffset(nextOffset + page.clips.length);
        setHasMore(page.hasMore);
        if (replace) {
          setSlideDirection("down");
          setIndex(0);
        }

        // Pre-fetch HLS + thumbnail for every clip so navigation is instant
        page.clips.forEach((clip) => {
          if (assetCache.current.has(clip.asset_id)) return;
          fetch(`/api/assets/${clip.asset_id}`)
            .then((r) => r.json())
            .then((body) => {
              if (body.hls_url) assetCache.current.set(clip.asset_id, body);
            })
            .catch(() => {/* ignore */});
        });
      } catch (e) {
        void trackClientTelemetry({
          event: "feed_page_error",
          profile: nextProfile,
          offset: nextOffset,
          replace,
          duration_ms: Math.round(performance.now() - startedAt),
          message: e instanceof Error ? e.message : "feed_request_failed",
        });
        setFeedError(e instanceof Error ? e.message : "Feed request failed");
      } finally {
        setLoadingFeed(false);
      }
    },
    [showId],
  );

  useEffect(() => {
    if (!showReady) return;
    setClips([]);
    setIndex(0);
    setOffset(0);
    setHasMore(true);
    setSlideDirection("down");
    void loadFeed(profile, 0, true);
  }, [profile, showId, showReady, loadFeed]);

  const loadPlayback = useCallback(async (assetId: string) => {
    const cached = assetCache.current.get(assetId);
    if (cached) {
      setPlayback(cached);
      setPlaybackError(null);
      return;
    }

    setLoadingPlayback(true);
    setPlaybackError(null);
    try {
      const res = await fetch(`/api/assets/${assetId}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load video");
      assetCache.current.set(assetId, body);
      setPlayback(body);
    } catch (e) {
      setPlayback(null);
      setPlaybackError(e instanceof Error ? e.message : "Failed to load video");
    } finally {
      setLoadingPlayback(false);
    }
  }, []);

  useEffect(() => {
    if (!clip) {
      setPlayback(null);
      return;
    }
    void loadPlayback(clip.asset_id);
    setReasoningOpen(false);
  }, [clip?.asset_id, clip?.segment_id, loadPlayback]);

  const goNext = useCallback(() => {
    setSlideDirection("down");
    setIndex((i) => {
      const next = i + 1;
      if (next >= clips.length) {
        if (hasMore && !loadingFeed) void loadFeed(profile, offset, false);
        return i;
      }
      return next;
    });
  }, [clips.length, hasMore, loadingFeed, loadFeed, offset, profile]);

  const goPrev = useCallback(() => {
    setSlideDirection("up");
    setIndex((i) => Math.max(0, i - 1));
  }, []);

  useEffect(() => {
    const el = feedRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) < 24) return;
      e.preventDefault();
      if (scrollLock.current) return;
      scrollLock.current = true;
      window.setTimeout(() => {
        scrollLock.current = false;
      }, SCROLL_COOLDOWN_MS);
      if (e.deltaY > 0) goNext();
      else goPrev();
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [goNext, goPrev]);

  useEffect(() => {
    if (index >= clips.length - 3 && hasMore && !loadingFeed && clips.length > 0) {
      void loadFeed(profile, offset, false);
    }
  }, [index, clips.length, hasMore, loadingFeed, loadFeed, offset, profile]);

  const actionBtn =
    "group flex h-11 w-11 items-center justify-center rounded-full border border-border bg-background text-text-primary shadow-sm transition-colors hover:bg-card disabled:opacity-40";
  const analyzeBtn =
    "group flex h-11 w-11 items-center justify-center rounded-full border shadow-sm transition-colors disabled:opacity-40";

  const clipNormalized = clip ? normalizeMatchScore(clip.match_score) : null;
  const clipTier = clipNormalized !== null ? matchScoreTier(clipNormalized) : null;
  const clipTierColors = clipTier ? MATCH_SCORE_TIER_COLORS[clipTier] : null;

  const videoPanel = (
    <div className="relative aspect-video w-[min(880px,68vw)] max-w-full overflow-hidden rounded-2xl bg-brand-charcoal shadow-md ring-1 ring-border">
      {loadingPlayback && (
        <div className="flex h-full min-h-[200px] w-full items-center justify-center bg-card">
          <StrandIcon name="spinner" className="h-8 w-8 animate-pulse text-text-tertiary" />
        </div>
      )}
      {!loadingPlayback && playback?.hls_url && clip && (
        <SegmentPlayer
          key={clip.segment_id}
          hlsUrl={playback.hls_url}
          startSec={clip.start_sec}
          endSec={clip.end_sec}
          poster={playback.thumbnail_url}
        />
      )}
      {!loadingPlayback && playbackError && (
        <div className="flex h-full min-h-[200px] w-full items-center justify-center p-6 text-center text-sm text-error">
          {playbackError}
        </div>
      )}
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <header className="shrink-0 border-b border-border bg-background px-6 py-4 md:px-10">
        {clip ? (
          <ClipTransition clipKey={clipKey} direction={slideDirection}>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1 space-y-2 pr-0 sm:pr-8">
                  <p className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
                    Clip {clip.scroll_index + 1}
                    {clips.length > 0 && ` · ${index + 1} of ${clips.length}`}
                  </p>
                  <h1 className="text-xl font-semibold leading-snug text-text-primary md:text-2xl">
                    {clip.feed_headline}
                  </h1>
                </div>
                {profiles.length > 0 && (
                  <div className="shrink-0">
                    <PersonaSelect profiles={profiles} value={profile} onChange={setProfile} />
                  </div>
                )}
              </div>

              <p className="max-w-4xl text-sm leading-relaxed text-text-secondary md:text-base">
                {clip.description}
              </p>

              <div className="flex flex-wrap gap-2 md:gap-3">
                <MetaChip label="Category" value={formatLabel(clip.primary_category)} />
                <MetaChip label="Intensity" value={`${clip.emotional_intensity}/10`} />
                <MetaChip
                  label="Duration"
                  value={formatTimestampRange(clip.start_sec, clip.end_sec)}
                />
                <MetaChip
                  label="Match score"
                  value={clipNormalized !== null ? `${clipNormalized}/100` : "—"}
                  valueClassName={clipTierColors?.text}
                />
                {clip.subtags?.map((tag) => (
                  <MetaChip key={tag} label="Tag" value={formatLabel(tag)} />
                ))}
                {clip.key_participants && clip.key_participants.length > 0 && (
                  <div className="min-w-[200px] flex-1 rounded-lg border border-border-light bg-card px-3 py-2">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-text-tertiary">
                      Cast
                    </p>
                    <p className="mt-0.5 text-sm text-text-primary">
                      {clip.key_participants.join(", ")}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </ClipTransition>
        ) : (
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-text-tertiary">
              {loadingFeed ? "Loading feed…" : (feedError ?? "No clips")}
            </p>
            {profiles.length > 0 && (
              <PersonaSelect profiles={profiles} value={profile} onChange={setProfile} />
            )}
          </div>
        )}
      </header>

      <div
        ref={feedRef}
        className="flex min-h-0 flex-1 items-center justify-center gap-6 overflow-hidden px-4 py-6 md:gap-8 md:px-10"
      >
        <ClipTransition clipKey={clipKey} direction={slideDirection}>
          {videoPanel}
        </ClipTransition>

        <div className="flex w-14 shrink-0 flex-col items-center gap-3">
          <button
            type="button"
            className={actionBtn}
            onClick={goPrev}
            disabled={index === 0}
            aria-label="Previous clip"
          >
            <StrandIcon name="arrow-box-up" className="h-5 w-5" />
          </button>

          <button
            type="button"
            className={
              reasoningOpen
                ? `${analyzeBtn} border-accent bg-accent-light text-accent`
                : `${analyzeBtn} border-border bg-background text-text-primary hover:border-accent hover:bg-accent-light`
            }
            onClick={() => {
              setReasoningOpen(true);
              void trackClientTelemetry({
                event: "reasoning_panel_opened",
                profile,
                segment_id: clip?.segment_id ?? null,
              });
            }}
            disabled={!clip}
            aria-label="View match reasoning"
            title="Scoring & reasoning"
          >
            <StrandIcon
              name="analyze"
              className={`h-5 w-5 transition-colors ${
                reasoningOpen
                  ? "text-accent"
                  : "text-text-primary group-hover:text-accent"
              }`}
            />
          </button>

          <div className="flex flex-col items-center gap-0.5 py-1">
            <span
              className={`text-xs font-semibold tabular-nums ${
                clipTierColors?.text ?? "text-text-primary"
              }`}
            >
              {clipNormalized !== null ? clipNormalized : "—"}
            </span>
            <span className="text-[10px] text-text-tertiary">match</span>
          </div>

          <button
            type="button"
            className={actionBtn}
            onClick={goNext}
            disabled={!clip || (index >= clips.length - 1 && !hasMore)}
            aria-label="Next clip"
          >
            <StrandIcon name="arrow-box-down" className="h-5 w-5" />
          </button>
        </div>
      </div>

      <p className="pointer-events-none shrink-0 pb-3 text-center text-xs text-text-tertiary">
        Scroll or use arrows for the next clip
      </p>

      <ReasoningPanel
        clip={clip}
        profileId={profile}
        manifestShowName={manifestShowName}
        open={reasoningOpen}
        onClose={() => setReasoningOpen(false)}
      />
    </div>
  );
}
