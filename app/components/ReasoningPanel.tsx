"use client";

import { useState } from "react";
import { MatchScoreRing, ScoreBreakdown } from "@/components/ScoreBreakdown";
import { LogoMark } from "@/components/StrandLogo";
import { StrandIcon } from "@/components/StrandIcon";
import {
  JOCKEY_PRODUCT_TOOLTIP,
  normalizeMatchScore,
  matchScoreTier,
  MATCH_SCORE_TIER_COLORS,
} from "@/lib/scoreDisplay";
import { InfoTooltip } from "@/components/InfoTooltip";
import { jockeyCorpusIntro, resolveShowName } from "@/lib/showContext";
import type { ProfileId, RankedSegment } from "@/lib/types";

type ReasoningPanelProps = {
  clip: RankedSegment | null;
  profileId: ProfileId;
  manifestShowName?: string | null;
  open: boolean;
  onClose: () => void;
};

const TIER_LABELS = {
  low: "Lower match",
  mid: "Moderate match",
  high: "Strong match",
  peak: "Top match",
} as const;

export function ReasoningPanel({
  clip,
  profileId,
  manifestShowName,
  open,
  onClose,
}: ReasoningPanelProps) {
  const [showRawData, setShowRawData] = useState(false);
  if (!open || !clip) return null;

  const normalized = normalizeMatchScore(clip.match_score);
  const tier = matchScoreTier(normalized);
  const tierColors = MATCH_SCORE_TIER_COLORS[tier];
  const showName = resolveShowName(clip, manifestShowName);

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-40 bg-brand-charcoal/20"
        aria-label="Close reasoning panel"
        onClick={onClose}
      />
      <aside
        className="fixed right-0 top-0 z-50 flex h-screen w-full max-w-md flex-col border-l border-border-light bg-surface shadow-xl"
        aria-label="Match reasoning"
      >
        <header className="flex items-center justify-between gap-3 border-b border-border-light px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-light text-accent">
              <StrandIcon name="idea" className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h2 className="text-base font-semibold leading-tight text-text-primary">
                Why this clip
              </h2>
              <p className="text-xs text-text-tertiary">Match reasoning & scoring</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-2 text-text-secondary hover:bg-card hover:text-text-primary"
            aria-label="Close"
          >
            <StrandIcon name="close" className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          <div className="flex items-center gap-5">
            <MatchScoreRing normalized={normalized} size="lg" />
            <div>
              <p className={`text-sm font-semibold ${tierColors.text}`}>{TIER_LABELS[tier]}</p>
              <p className="mt-1 text-xs text-text-tertiary">
                {clip.match_score.toFixed(2)} raw points for this persona
              </p>
            </div>
          </div>

          <section className="mt-8">
            <h3 className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
              Explanation
            </h3>
            {clip.show_name && (
              <p className="mt-1 text-xs font-medium text-text-secondary">{clip.show_name}</p>
            )}
            <p className="mt-2 text-sm leading-relaxed text-text-primary">{clip.explanation}</p>
            {clip.jockey_reasoning && (
              <p className="mt-3 border-l-2 border-accent/40 pl-3 text-sm leading-relaxed text-text-secondary">
                {clip.jockey_reasoning}
              </p>
            )}
          </section>

          <section className="mt-8">
            <h3 className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
              Score breakdown
            </h3>
            <p className="mt-1 text-xs text-text-tertiary">
              Hover the ⓘ on a row for details. Bars show alignment, not just points earned.
            </p>
            <div className="mt-3 space-y-2.5 pb-2">
              <ScoreBreakdown
                clip={clip}
                profileId={profileId}
                showName={showName}
                variant="panel"
              />
            </div>
          </section>

          {(clip.jockey_boost || clip.cross_episode_significance) && (
            <section className="mt-8 rounded-xl border border-border-light bg-accent-light/30 px-4 py-3">
              <div className="flex items-center gap-2">
                <LogoMark className="h-4 w-auto" />
                <h3 className="text-xs font-medium uppercase tracking-wider text-emerald-800">
                  Jockey boost
                </h3>
                <InfoTooltip
                  className="ml-auto"
                  content={JOCKEY_PRODUCT_TOOLTIP}
                  label="What is Jockey?"
                />
              </div>
              <p className="mt-2 text-xs leading-relaxed text-emerald-900/90">
                {jockeyCorpusIntro(clip, showName)}
              </p>
              {clip.cross_episode_significance && (
                <p className="mt-3 text-sm leading-relaxed text-text-primary">
                  {clip.cross_episode_significance}
                </p>
              )}
            </section>
          )}

          <section className="mt-8">
            <button
              type="button"
              onClick={() => setShowRawData((s) => !s)}
              className="rounded-lg border border-border-light bg-card px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:text-text-primary"
            >
              {showRawData ? "Hide Raw Data" : "Show Raw Data"}
            </button>
            {showRawData && (
              <pre className="mt-3 max-h-80 overflow-auto rounded-xl border border-border-light bg-background p-3 text-[11px] leading-relaxed text-text-secondary">
                {JSON.stringify(clip, null, 2)}
              </pre>
            )}
          </section>
        </div>
      </aside>
    </>
  );
}
