"use client";

import { useEffect, useRef, useState } from "react";
import { SegmentPlayer } from "@/components/SegmentPlayer";
import { StrandIcon } from "@/components/StrandIcon";
import { clipGridKey } from "@/lib/clipKey";
import { formatTimestampRange } from "@/lib/format";
import {
  matchScoreTier,
  MATCH_SCORE_TIER_COLORS,
  normalizeMatchScore,
} from "@/lib/scoreDisplay";
import type { RankedSegment } from "@/lib/types";

const hlsCache = new Map<string, string>();

function cardGradient(assetId: string): string {
  let h = 0;
  for (let i = 0; i < assetId.length; i++) h = (h * 31 + assetId.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return `linear-gradient(135deg,hsl(${hue},35%,22%),hsl(${(hue + 60) % 360},25%,12%))`;
}

async function fetchHlsUrl(assetId: string, signal?: AbortSignal): Promise<string | null> {
  const hit = hlsCache.get(assetId);
  if (hit) return hit;
  const res = await fetch(`/api/assets/${assetId}`, { signal });
  if (!res.ok) return null;
  const body = await res.json();
  if (body.hls_url) hlsCache.set(assetId, body.hls_url);
  return body.hls_url ?? null;
}

type HorizontalClipStripProps = {
  title: string;
  subtitle?: string;
  clips: RankedSegment[];
  activeClipKey?: string | null;
  onSelect: (clip: RankedSegment) => void;
  actionHref?: string;
  actionLabel?: string;
  actionIcon?: string;
  onClose?: () => void;
};

function StripCard({
  clip,
  active,
  onSelect,
}: {
  clip: RankedSegment;
  active: boolean;
  onSelect: (clip: RankedSegment) => void;
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

  const normalized = normalizeMatchScore(clip.match_score);
  const tier = matchScoreTier(normalized);
  const tierColors = MATCH_SCORE_TIER_COLORS[tier];

  return (
    <button
      ref={ref}
      type="button"
      onClick={() => onSelect(clip)}
      className={`group w-[128px] shrink-0 snap-start text-left transition-transform hover:scale-[1.02] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
        active ? "scale-[1.02]" : ""
      }`}
      aria-label={`Play related clip: ${clip.feed_headline}`}
      aria-current={active ? "true" : undefined}
    >
      <div
        className={`relative aspect-9/14 overflow-hidden rounded-xl bg-brand-charcoal shadow-sm ring-1 ${
          active ? "ring-accent ring-2" : "ring-border"
        }`}
      >
        <div className="absolute inset-0" style={{ background: cardGradient(clip.asset_id) }} />
        {hlsUrl && (
          <SegmentPlayer
            hlsUrl={hlsUrl}
            startSec={clip.start_sec}
            endSec={clip.end_sec}
            autoPlay={false}
            objectFit="cover"
            hideCenterPlay
            className="absolute inset-0 opacity-80"
          />
        )}
        <div className="pointer-events-none absolute inset-0 bg-linear-to-t from-black/85 via-black/20 to-transparent" />
        <span
          className={`pointer-events-none absolute right-1.5 top-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${tierColors.bg} ${tierColors.text}`}
        >
          {normalized}
        </span>
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 p-2.5">
          <p className="line-clamp-2 text-xs font-semibold leading-snug text-white">
            {clip.feed_headline}
          </p>
          <p className="mt-0.5 text-[10px] text-white/70">
            {formatTimestampRange(clip.start_sec, clip.end_sec)}
          </p>
        </div>
      </div>
    </button>
  );
}

export function HorizontalClipStrip({
  title,
  subtitle,
  clips,
  activeClipKey,
  onSelect,
  actionHref,
  actionLabel,
  actionIcon = "arrow-box-right",
  onClose,
}: HorizontalClipStripProps) {
  if (clips.length === 0) return null;

  return (
    <section className="w-full min-w-0 shrink-0 px-1">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-xs font-medium uppercase tracking-wider text-text-tertiary">{title}</h3>
          {subtitle && (
            <p className="mt-0.5 truncate text-sm text-text-secondary">{subtitle}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {actionHref && actionLabel && (
            <a
              href={actionHref}
              className="inline-flex items-center gap-1 rounded-lg border border-border-light bg-surface px-2.5 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-card hover:text-text-primary"
            >
              <StrandIcon name={actionIcon} className="h-3.5 w-3.5" />
              {actionLabel}
            </a>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1.5 text-text-secondary transition-colors hover:bg-card hover:text-text-primary"
              aria-label="Close related moments"
            >
              <StrandIcon name="close" className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
      <div className="min-w-0 overflow-hidden">
        <div className="-mx-1 flex gap-2.5 overflow-x-auto px-1 pb-1 snap-x snap-mandatory">
        {clips.map((clip) => {
          const key = clipGridKey(clip);
          return (
            <StripCard
              key={key}
              clip={clip}
              active={key === activeClipKey}
              onSelect={onSelect}
            />
          );
        })}
        </div>
      </div>
    </section>
  );
}
