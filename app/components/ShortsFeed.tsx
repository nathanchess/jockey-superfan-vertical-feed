"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CategoryPills, IntensityBar } from "@/components/ClipMetadata";
import { ClipTransition, type SlideDirection } from "@/components/ClipTransition";
import { HorizontalClipStrip } from "@/components/HorizontalClipStrip";
import { MatchScoreRing } from "@/components/MatchScoreRing";
import { PersonaEmptyState } from "@/components/PersonaEmptyState";
import { PersonaSelect, type PersonaOption } from "@/components/PersonaSelect";
import { useShow } from "@/components/ShowProvider";
import { ReasoningPanel } from "@/components/ReasoningPanel";
import { SegmentPlayer } from "@/components/SegmentPlayer";
import { StrandIcon } from "@/components/StrandIcon";
import { clipGridKey } from "@/lib/clipKey";
import { formatTimestampRange } from "@/lib/format";
import { formatLabel } from "@/lib/formatLabel";
import { PROFILE_LABELS } from "@/lib/profiles";
import { trackClientTelemetry } from "@/lib/telemetry";
import { normalizeMatchScore } from "@/lib/scoreDisplay";
import type { AssetPlaybackResponse, FeedPageResponse, ProfileId, RankedSegment } from "@/lib/types";

const SCROLL_COOLDOWN_MS = 520;

type ShortsFeedProps = {
  initialSegmentId?: string;
};

export function ShortsFeed({ initialSegmentId }: ShortsFeedProps) {
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
  const [relatedOpen, setRelatedOpen] = useState(false);
  const [manifestShowName, setManifestShowName] = useState<string | null>(null);
  const [relatedClips, setRelatedClips] = useState<RankedSegment[]>([]);
  const [loadingRelated, setLoadingRelated] = useState(false);

  const feedRef = useRef<HTMLDivElement>(null);
  const scrollLock = useRef(false);
  const assetCache = useRef(new Map<string, AssetPlaybackResponse>());
  const deepLinkHandled = useRef(false);

  const clip = clips[index] ?? null;
  const clipKey = clip ? clipGridKey(clip) : "empty";

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
    deepLinkHandled.current = false;
    void loadFeed(profile, 0, true);
  }, [profile, showId, showReady, loadFeed]);

  useEffect(() => {
    if (!initialSegmentId || !showReady || loadingFeed || deepLinkHandled.current) return;

    const idx = clips.findIndex((c) => c.segment_id === initialSegmentId);
    if (idx >= 0) {
      setIndex(idx);
      deepLinkHandled.current = true;
      return;
    }

    if (clips.length === 0) return;

    void fetch(
      `/api/segment?show=${showId}&profile=${profile}&segment_id=${encodeURIComponent(initialSegmentId)}`,
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { clip?: RankedSegment } | null) => {
        if (!body?.clip || deepLinkHandled.current) return;
        deepLinkHandled.current = true;
        setClips((prev) => {
          if (prev.some((c) => c.segment_id === body.clip!.segment_id)) return prev;
          return [body.clip!, ...prev];
        });
        setIndex(0);
      })
      .catch(() => {
        deepLinkHandled.current = true;
      });
  }, [initialSegmentId, showReady, loadingFeed, clips, showId, profile]);

  useEffect(() => {
    if (!clip || !showReady) {
      setRelatedClips([]);
      return;
    }

    const ac = new AbortController();
    setLoadingRelated(true);
    const params = new URLSearchParams({
      show: showId,
      profile,
      asset_id: clip.asset_id,
      start_sec: String(clip.start_sec),
      end_sec: String(clip.end_sec),
      primary_category: clip.primary_category,
      limit: "6",
    });

    void fetch(`/api/related?${params}`, { signal: ac.signal })
      .then((r) => (r.ok ? r.json() : { clips: [] }))
      .then((body: { clips: RankedSegment[] }) => {
        if (!ac.signal.aborted) setRelatedClips(body.clips ?? []);
      })
      .catch(() => {
        if (!ac.signal.aborted) setRelatedClips([]);
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoadingRelated(false);
      });

    return () => ac.abort();
  }, [clip?.segment_id, clip?.asset_id, clip?.start_sec, clip?.end_sec, clip?.primary_category, profile, showId, showReady]);

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
    setRelatedOpen(false);
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

  const jumpToClip = useCallback(
    (target: RankedSegment) => {
      const targetKey = clipGridKey(target);
      const idx = clips.findIndex((c) => clipGridKey(c) === targetKey);
      if (idx >= 0) {
        setSlideDirection(idx > index ? "down" : "up");
        setIndex(idx);
        return;
      }
      setSlideDirection("down");
      setClips((prev) => {
        if (prev.some((c) => clipGridKey(c) === targetKey)) return prev;
        return [...prev, target];
      });
      setIndex(clips.length);
    },
    [clips, index],
  );

  useEffect(() => {
    const el = feedRef.current;
    if (!el || clips.length === 0) return;

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
  }, [goNext, goPrev, clips.length]);

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

  const hasRelatedClips = relatedClips.length > 0;
  const feedEmpty = !loadingFeed && !feedError && clips.length === 0;

  const playbackReady =
    Boolean(clip && playback?.asset_id === clip.asset_id && playback.hls_url);

  const videoPanel = clip ? (
    <div className="relative mx-auto aspect-video h-full max-h-full w-full max-w-4xl overflow-hidden rounded-2xl bg-brand-charcoal shadow-md ring-1 ring-border">
      {playbackReady && playback && (
        <SegmentPlayer
          key={clipGridKey(clip)}
          hlsUrl={playback.hls_url!}
          startSec={clip.start_sec}
          endSec={clip.end_sec}
          poster={playback.thumbnail_url}
          durationLabel={formatTimestampRange(clip.start_sec, clip.end_sec)}
        />
      )}
      {(!playbackReady || loadingPlayback) && (
        <div className="absolute inset-0 flex items-center justify-center bg-brand-charcoal">
          <StrandIcon name="spinner" className="h-8 w-8 animate-pulse text-text-tertiary" />
        </div>
      )}
      {!loadingPlayback && playbackError && !playbackReady && (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-error">
          {playbackError}
        </div>
      )}
    </div>
  ) : null;

  const personaControl =
    profiles.length > 0 ? (
      <PersonaSelect profiles={profiles} value={profile} onChange={setProfile} />
    ) : null;

  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_1fr_auto] overflow-hidden bg-background">
      <header className="relative z-20 shrink-0 border-b border-border bg-background px-6 py-3 md:px-10 md:py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            {loadingFeed && (
              <p className="text-sm text-text-tertiary">Loading feed…</p>
            )}
            {feedError && !loadingFeed && (
              <p className="text-sm text-error">{feedError}</p>
            )}
            {clip && !loadingFeed && (
              <p className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
                Clip {clip.scroll_index + 1}
                {clips.length > 0 && ` · ${index + 1} of ${clips.length}`}
              </p>
            )}
          </div>
          {personaControl}
        </div>

        {clip && !loadingFeed && (
          <ClipTransition clipKey={clipKey} direction={slideDirection}>
            <div className="mt-3 max-h-[20vh] space-y-3 overflow-y-auto overscroll-contain pr-1">
              <h1 className="text-xl font-semibold leading-snug text-text-primary md:text-2xl">
                {clip.feed_headline}
              </h1>

              <p className="max-w-4xl line-clamp-2 text-sm leading-relaxed text-text-secondary md:text-base">
                {clip.description}
              </p>

              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                <CategoryPills category={clip.primary_category} subtags={clip.subtags} />
                <IntensityBar value={clip.emotional_intensity} />
              </div>
            </div>
          </ClipTransition>
        )}
      </header>

      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {feedEmpty ? (
          <div className="flex flex-1 items-center justify-center px-4 py-8">
            <PersonaEmptyState profileId={profile} />
          </div>
        ) : (
          <>
        <div
          ref={feedRef}
          className={`relative flex h-full min-h-0 flex-1 items-center justify-center overflow-hidden px-4 py-3 transition-[padding] duration-300 md:px-10 ${
            relatedOpen ? "pb-1" : ""
          }`}
        >
          <div className="flex h-full min-h-0 min-w-0 max-w-[calc(56rem+4.5rem)] items-center justify-center gap-4 md:gap-6">
            <div className="flex h-full min-h-0 min-w-0 flex-1 items-center justify-center">
              {clip && (
                <ClipTransition clipKey={clipKey} direction={slideDirection} fill>
                  {videoPanel}
                </ClipTransition>
              )}
            </div>

            {clip && (
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

              {clip && clipNormalized !== null && (
                <MatchScoreRing
                  score={clip.match_score}
                  active={reasoningOpen}
                  onClick={() => {
                    setReasoningOpen(true);
                    void trackClientTelemetry({
                      event: "reasoning_panel_opened",
                      profile,
                      segment_id: clip.segment_id,
                    });
                  }}
                  title="Scoring & reasoning"
                />
              )}

              {(hasRelatedClips || loadingRelated) && (
                <button
                  type="button"
                  className={
                    relatedOpen
                      ? `${analyzeBtn} border-accent bg-accent-light text-accent`
                      : `${analyzeBtn} border-border bg-background text-text-primary hover:border-accent hover:bg-accent-light`
                  }
                  onClick={() => setRelatedOpen((open) => !open)}
                  disabled={!clip || loadingRelated || !hasRelatedClips}
                  aria-label="View related moments"
                  aria-expanded={relatedOpen}
                  title="Related moments"
                >
                  {loadingRelated ? (
                    <StrandIcon name="spinner" className="h-5 w-5 animate-pulse text-text-tertiary" />
                  ) : (
                    <StrandIcon
                      name="entity-collection"
                      className={`h-5 w-[calc(1.25rem*14/12)] transition-colors ${
                        relatedOpen
                          ? "text-accent"
                          : "text-text-primary group-hover:text-accent"
                      }`}
                    />
                  )}
                </button>
              )}

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
            )}
          </div>
        </div>

        <div
          className={`related-drawer-shell shrink-0 px-4 md:px-10 ${relatedOpen && hasRelatedClips ? "related-drawer-shell--open" : ""}`}
        >
          <div className="related-drawer-shell__inner">
            {hasRelatedClips && clip && (
              <div
                className="related-drawer-panel border-t border-border-light bg-surface px-1 py-3"
                role="dialog"
                aria-label="Related moments"
                aria-hidden={!relatedOpen}
              >
                <HorizontalClipStrip
                  title="Related moments"
                  subtitle={`More ${formatLabel(clip.primary_category)} clips for your persona`}
                  clips={relatedClips}
                  activeClipKey={clip ? clipGridKey(clip) : null}
                  onSelect={jumpToClip}
                  actionHref="/explore"
                  actionLabel="Explore similar"
                  actionIcon="grid"
                  onClose={() => setRelatedOpen(false)}
                />
              </div>
            )}
          </div>
        </div>
          </>
        )}
      </div>

      <p className="shrink-0 pb-2 pt-1 text-center text-xs text-text-tertiary">
        {feedEmpty
          ? `Switch persona above to find clips for ${PROFILE_LABELS[profile]}.`
          : "Scroll or use arrows for the next clip"}
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
