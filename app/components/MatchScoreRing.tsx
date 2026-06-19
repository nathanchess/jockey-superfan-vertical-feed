"use client";

import { useState } from "react";
import { StrandIcon } from "@/components/StrandIcon";
import {
  matchScoreTier,
  MATCH_SCORE_TIER_COLORS,
  normalizeMatchScore,
} from "@/lib/scoreDisplay";

const TIER_STROKE: Record<ReturnType<typeof matchScoreTier>, string> = {
  low: "#9ca3af",
  mid: "#d97706",
  high: "#00b86e",
  peak: "#047857",
};

type MatchScoreRingProps = {
  score: number;
  active?: boolean;
  onClick?: () => void;
  title?: string;
  size?: number;
};

export function MatchScoreRing({
  score,
  active = false,
  onClick,
  title = "View match reasoning",
  size = 44,
}: MatchScoreRingProps) {
  const [hovered, setHovered] = useState(false);
  const normalized = normalizeMatchScore(score);
  const tier = matchScoreTier(normalized);
  const tierColors = MATCH_SCORE_TIER_COLORS[tier];
  const stroke = TIER_STROKE[tier];

  const strokeWidth = 2.5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (normalized / 100) * circumference;
  const center = size / 2;

  const showIcon = hovered || active;

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`group relative flex shrink-0 items-center justify-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
        active ? "bg-accent-light" : "bg-background hover:bg-card"
      }`}
      style={{ width: size, height: size }}
      aria-label={title}
      title={title}
    >
      <svg
        className="absolute inset-0 -rotate-90"
        width={size}
        height={size}
        aria-hidden
      >
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className={active ? "text-accent/30" : "text-border"}
        />
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-500 ease-out"
        />
      </svg>

      <span className="relative flex h-full w-full items-center justify-center">
        <span
          className={`absolute inset-0 flex items-center justify-center transition-opacity duration-200 ease-out ${
            showIcon ? "pointer-events-none opacity-0" : "opacity-100"
          }`}
          aria-hidden={showIcon}
        >
          <span className={`text-xs font-bold tabular-nums leading-none ${tierColors.text}`}>
            {normalized}
          </span>
        </span>
        <span
          className={`absolute inset-0 flex items-center justify-center transition-opacity duration-200 ease-out ${
            showIcon ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
          aria-hidden={!showIcon}
        >
          <StrandIcon
            name="analyze"
            className={`h-5 w-5 transition-colors ${
              active ? "text-accent" : "text-text-primary group-hover:text-accent"
            }`}
          />
        </span>
      </span>
    </button>
  );
}
