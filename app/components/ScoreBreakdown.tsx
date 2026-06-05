"use client";

import type { BreakdownDisplayItem } from "@/lib/scoreDisplay";
import {
  getBreakdownDisplayItems,
  MATCH_SCORE_CEILING,
  matchScoreTier,
  MATCH_SCORE_TIER_COLORS,
  normalizeMatchScore,
} from "@/lib/scoreDisplay";
import { InfoTooltip } from "@/components/InfoTooltip";
import { LogoMark } from "@/components/StrandLogo";
import type { ProfileId, RankedSegment } from "@/lib/types";

type ScoreBreakdownProps = {
  clip: RankedSegment;
  profileId: ProfileId;
  showName?: string;
  variant?: "panel" | "compact";
};

function BreakdownRow({
  item,
  variant,
}: {
  item: BreakdownDisplayItem;
  variant: "panel" | "compact";
}) {
  const pointsLabel =
    item.points > 0 ? `+${item.points.toFixed(2)} earned` : "No points";

  return (
    <div
      className={`rounded-xl border border-border-light bg-card ${
        variant === "panel" ? "px-4 py-3" : "px-3 py-2"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: item.color }}
              aria-hidden
            />
            <p className="truncate text-sm font-medium text-text-primary">{item.label}</p>
            {item.showTwelveLabsMark && (
              <LogoMark className="h-3.5 w-auto shrink-0 opacity-80" />
            )}
            <InfoTooltip content={item.tooltip} label={`More about ${item.label}`} />
          </div>
          {variant === "panel" && (
            <p className="mt-1.5 text-xs leading-relaxed text-text-secondary">{item.summary}</p>
          )}
          <p className="mt-1 text-xs text-text-tertiary">
            {pointsLabel}
            {item.points > 0 && ` · ${item.sharePercent}% of total score`}
          </p>
        </div>
        <span
          className="shrink-0 text-xs font-semibold tabular-nums"
          style={{ color: item.color }}
        >
          {item.factorPercent}%
        </span>
      </div>

      <div className="mt-2.5">
        <div
          className="h-1.5 w-full overflow-hidden rounded-full"
          style={{ backgroundColor: item.trackColor }}
          role="progressbar"
          aria-valuenow={item.factorPercent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${item.label} alignment`}
        >
          <div
            className="h-full rounded-full transition-[width] duration-500 ease-out"
            style={{
              width: `${item.factorPercent}%`,
              backgroundColor: item.color,
            }}
          />
        </div>
      </div>
    </div>
  );
}

export function MatchScoreRing({
  normalized,
  size = "lg",
}: {
  normalized: number;
  size?: "sm" | "lg";
}) {
  const tier = matchScoreTier(normalized);
  const colors = MATCH_SCORE_TIER_COLORS[tier];
  const dim = size === "lg" ? 88 : 52;
  const stroke = size === "lg" ? 6 : 4;
  const r = (dim - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (normalized / 100) * circumference;

  return (
    <div
      className={`relative inline-flex items-center justify-center ${colors.bg} rounded-full`}
      style={{ width: dim, height: dim }}
    >
      <svg width={dim} height={dim} className="-rotate-90" aria-hidden>
        <circle
          cx={dim / 2}
          cy={dim / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="stroke-border-light"
        />
        <circle
          cx={dim / 2}
          cy={dim / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className={`${colors.ring} transition-[stroke-dashoffset] duration-500`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className={`font-semibold tabular-nums ${colors.text} ${size === "lg" ? "text-2xl" : "text-sm"}`}
        >
          {normalized}
        </span>
        {size === "lg" && (
          <span className="text-[10px] font-medium uppercase tracking-wider text-text-tertiary">
            match
          </span>
        )}
      </div>
    </div>
  );
}

export function ScoreBreakdown({
  clip,
  profileId,
  showName,
  variant = "panel",
}: ScoreBreakdownProps) {
  const items = getBreakdownDisplayItems(clip, profileId, { showName });
  const normalized = normalizeMatchScore(clip.match_score);

  if (variant === "compact") {
    return (
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <span
            key={item.key}
            className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium"
            style={{
              backgroundColor: item.trackColor,
              color: item.color,
            }}
            title={item.summary}
          >
            {item.label} {item.factorPercent}%
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {items.map((item) => (
        <BreakdownRow key={item.key} item={item} variant={variant} />
      ))}
      <p className="pt-1 text-xs text-text-tertiary">
        Overall {normalized}/100 = {clip.match_score.toFixed(2)} raw ÷ {MATCH_SCORE_CEILING.toFixed(2)}{" "}
        max for your persona.
      </p>
    </div>
  );
}

export { normalizeMatchScore, matchScoreTier, MATCH_SCORE_TIER_COLORS };
