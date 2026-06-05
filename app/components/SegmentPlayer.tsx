"use client";

import { useEffect, useRef, useState } from "react";
import type Hls from "hls.js";

type SegmentPlayerProps = {
  hlsUrl: string;
  startSec: number;
  endSec: number;
  poster?: string | null;
  onSegmentEnd?: () => void;
  /** When false, seek to startSec and pause (frozen frame). Default true. */
  autoPlay?: boolean;
  /** Play while `isHovered` is true; pause and rewind when false. */
  playOnHover?: boolean;
  isHovered?: boolean;
  /** Loop the segment while hovered instead of stopping at end. */
  loopWhileHovered?: boolean;
  objectFit?: "contain" | "cover";
  className?: string;
  /** Hide the large center play icon (grid preview). */
  hideCenterPlay?: boolean;
  /** Stop click from bubbling (grid cards open modal on article click). */
  stopClickPropagation?: boolean;
};

export function SegmentPlayer({
  hlsUrl,
  startSec,
  endSec,
  poster,
  onSegmentEnd,
  autoPlay = true,
  playOnHover = false,
  isHovered = false,
  loopWhileHovered = false,
  objectFit = "contain",
  className = "",
  hideCenterPlay = false,
  stopClickPropagation = false,
}: SegmentPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const endedRef = useRef(false);
  const isHoveredRef = useRef(isHovered);
  const onSegmentEndRef = useRef(onSegmentEnd);
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(false);

  const segmentDuration = Math.max(endSec - startSec, 0.1);
  const shouldAutoPlay = autoPlay && !playOnHover;

  // Keep refs in sync without re-running effects
  useEffect(() => {
    isHoveredRef.current = isHovered;
  }, [isHovered]);

  useEffect(() => {
    onSegmentEndRef.current = onSegmentEnd;
  }, [onSegmentEnd]);

  const updateProgress = (currentTime: number) => {
    const pct = ((currentTime - startSec) / segmentDuration) * 100;
    setProgress(Math.min(100, Math.max(0, pct)));
  };

  // Single HLS setup effect — only re-runs when src or boundaries change.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !hlsUrl) return;

    let cancelled = false;
    let hls: Hls | null = null;
    let timeUpdateHandler: (() => void) | null = null;
    let playHandler: (() => void) | null = null;
    let pauseHandler: (() => void) | null = null;

    const onTimeUpdate = () => {
      const pct = ((video.currentTime - startSec) / segmentDuration) * 100;
      setProgress(Math.min(100, Math.max(0, pct)));

      if (video.currentTime >= endSec - 0.25 && !endedRef.current) {
        if (playOnHover && isHoveredRef.current && loopWhileHovered) {
          video.currentTime = startSec;
          endedRef.current = false;
          return;
        }
        endedRef.current = true;
        video.pause();
        setPlaying(false);
        setProgress(100);
        onSegmentEndRef.current?.();
      }
    };

    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);

    timeUpdateHandler = onTimeUpdate;
    playHandler = onPlay;
    pauseHandler = onPause;

    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);

    const onReady = () => {
      if (cancelled) return;
      endedRef.current = false;
      try {
        video.currentTime = startSec;
      } catch {
        // ignore — will retry on loadeddata
      }
      setProgress(0);

      if (shouldAutoPlay || (playOnHover && isHoveredRef.current)) {
        void video.play().catch(() => undefined);
      } else {
        try {
          video.pause();
        } catch {
          // ignore
        }
        setPlaying(false);
      }
    };

    const setup = async () => {
      try {
        const { default: HlsCtor } = await import("hls.js");
        if (cancelled) return;

        if (HlsCtor.isSupported()) {
          hls = new HlsCtor({ enableWorker: true, maxBufferLength: 12, maxMaxBufferLength: 20 });
          hls.loadSource(hlsUrl);
          hls.attachMedia(video);
          hls.on(HlsCtor.Events.MANIFEST_PARSED, onReady);
        } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
          video.src = hlsUrl;
          video.addEventListener("loadedmetadata", onReady, { once: true });
        }
      } catch {
        // hls.js failed to load — leave placeholder
      }
    };

    void setup();

    return () => {
      cancelled = true;
      if (timeUpdateHandler) video.removeEventListener("timeupdate", timeUpdateHandler);
      if (playHandler) video.removeEventListener("play", playHandler);
      if (pauseHandler) video.removeEventListener("pause", pauseHandler);
      try {
        video.pause();
        video.removeAttribute("src");
        video.load();
      } catch {
        // ignore
      }
      if (hls) {
        try {
          hls.destroy();
        } catch {
          // ignore
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally stable
  }, [hlsUrl, startSec, endSec]);

  // React to hover changes without restarting HLS
  useEffect(() => {
    if (!playOnHover) return;
    const video = videoRef.current;
    if (!video) return;

    if (isHovered) {
      if (video.currentTime >= endSec - 0.1 || video.currentTime < startSec) {
        try {
          video.currentTime = startSec;
        } catch {
          // ignore
        }
        endedRef.current = false;
      }
      void video.play().catch(() => undefined);
    } else {
      try {
        video.pause();
        video.currentTime = startSec;
      } catch {
        // ignore
      }
      setProgress(0);
      setPlaying(false);
    }
  }, [isHovered, playOnHover, startSec, endSec]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      if (video.currentTime >= endSec - 0.1) {
        endedRef.current = false;
        try {
          video.currentTime = startSec;
        } catch {
          // ignore
        }
        setProgress(0);
      }
      void video.play().catch(() => undefined);
    } else {
      video.pause();
    }
  };

  const seekFromClientX = (clientX: number) => {
    const bar = progressRef.current;
    const video = videoRef.current;
    if (!bar || !video) return;

    const rect = bar.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const nextTime = Math.min(endSec, Math.max(startSec, startSec + ratio * segmentDuration));
    endedRef.current = false;
    try {
      video.currentTime = nextTime;
    } catch {
      // ignore
    }
    updateProgress(nextTime);
    if (video.paused && (playOnHover ? isHovered : true)) {
      void video.play().catch(() => undefined);
    }
  };

  const fitClass = objectFit === "cover" ? "object-cover" : "object-contain";
  const radiusClass = objectFit === "cover" ? "rounded-none" : "rounded-xl";

  const showCenterPlay =
    !hideCenterPlay && !playing && (playOnHover ? isHovered : true);

  return (
    <div
      className={`segment-player relative h-full w-full ${className}`.trim()}
      onClick={stopClickPropagation ? (e) => e.stopPropagation() : undefined}
    >
      <video
        ref={videoRef}
        className={`segment-player__video h-full w-full cursor-pointer bg-brand-charcoal ${fitClass} ${radiusClass}`}
        playsInline
        muted={playOnHover}
        disablePictureInPicture
        disableRemotePlayback
        controlsList="nodownload noplaybackrate nofullscreen noremoteplayback"
        poster={poster ?? undefined}
        onClick={togglePlay}
        onContextMenu={(e) => e.preventDefault()}
      />

      {showCenterPlay && (
        <span
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
          aria-hidden
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm">
            <svg className="ml-1 h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
        </span>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 px-4 pb-3 pt-10">
        <div
          ref={progressRef}
          role="slider"
          aria-label="Clip progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress)}
          className="pointer-events-auto h-1 w-full cursor-pointer rounded-full bg-white/25"
          onClick={(e) => {
            e.stopPropagation();
            seekFromClientX(e.clientX);
          }}
          tabIndex={0}
        >
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-150 ease-linear"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}
