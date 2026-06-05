import { PREFERENCE_PROFILES, PROFILE_LABELS } from "@/lib/profiles";
import {
  SCORE_BASE,
  SCORE_INTENSITY,
  SCORE_JOCKEY,
  SCORE_SUBTAG,
} from "@/lib/scoring";
import { normalizeSubtag } from "@/lib/taxonomy";
import type { IntensityPreference, ProfileId, RankedSegment, ScoreBreakdown } from "@/lib/types";

/** Upper bound for 0–100 match score (base + 3 persona subtags + intensity + jockey). */
export const MATCH_SCORE_CEILING =
  SCORE_BASE + SCORE_SUBTAG * 3 + SCORE_INTENSITY + SCORE_JOCKEY;

export const JOCKEY_PRODUCT_TOOLTIP =
  "Jockey searches your full video inventory through a TwelveLabs Knowledge Store — understanding moments, cast, and storylines across every episode of the show, not just this clip — to surface corpus-level relevance for your persona.";

export function jockeyBoostSummary(showName: string, hasBoost: boolean): string {
  if (!hasBoost) {
    return "Jockey did not add a corpus-level boost for this clip on your current persona.";
  }
  if (showName && showName !== "this series") {
    return (
      `Jockey elevated this moment after ranking it against the entire ${showName} library ` +
      "in your Knowledge Store — storylines that pay off across seasons weigh more than one-off drama."
    );
  }
  return (
    "Jockey elevated this moment after comparing it to your full episode library in the " +
    "Knowledge Store — corpus-wide story importance, not just this isolated clip."
  );
}

export type BreakdownKind = "base" | "persona" | "intensity" | "jockey";

export type BreakdownDisplayItem = {
  key: string;
  kind: BreakdownKind;
  label: string;
  /** Short prose shown on the card (not only in tooltip). */
  summary: string;
  points: number;
  maxPoints: number;
  /** 0–100 how fully this factor aligns (not “did we award full points for one slot”). */
  factorPercent: number;
  sharePercent: number;
  tooltip: string;
  color: string;
  trackColor: string;
  showTwelveLabsMark?: boolean;
};

const BREAKDOWN_STYLES: Record<
  BreakdownKind,
  { color: string; trackColor: string }
> = {
  base: { color: "#6b6966", trackColor: "#ececec" },
  persona: { color: "#7c3aed", trackColor: "#ede9fe" },
  intensity: { color: "#e67e22", trackColor: "#fdebd0" },
  jockey: { color: "#00b86e", trackColor: "#d4f5e4" },
};

function formatLabel(value: string) {
  return value.replace(/_/g, " ");
}

function listLabels(values: string[]) {
  if (values.length === 0) return "none";
  if (values.length === 1) return formatLabel(values[0]!);
  if (values.length === 2) {
    return `${formatLabel(values[0]!)} and ${formatLabel(values[1]!)}`;
  }
  return `${values.slice(0, -1).map(formatLabel).join(", ")}, and ${formatLabel(values.at(-1)!)}`;
}

/** How closely emotional intensity aligns with persona preference (0–100). */
export function intensityFitPercent(
  emotionalIntensity: number,
  preference: IntensityPreference,
): number {
  const n = emotionalIntensity;

  if (preference === "any") {
    return Math.round((n / 10) * 100);
  }

  if (preference === "high") {
    if (n < 8) return Math.round((n / 8) * 45);
    return Math.round(55 + ((n - 8) / 2) * 45);
  }

  if (preference === "medium") {
    if (n < 6) return Math.round((n / 6) * 40);
    if (n > 8) return Math.round(Math.max(35, 100 - (n - 8) * 22));
    const dist = Math.abs(n - 7);
    return Math.round(100 - dist * 18);
  }

  return 0;
}

function intensityPreferencePhrase(preference: IntensityPreference): string {
  if (preference === "high") return "high-intensity moments (8/10 or above)";
  if (preference === "medium") return "medium-intensity moments (around 6–8/10)";
  return "moments at any intensity";
}

function intensitySummary(
  clip: RankedSegment,
  preference: IntensityPreference,
  earned: boolean,
): string {
  const fit = intensityFitPercent(clip.emotional_intensity, preference);
  const pref = intensityPreferencePhrase(preference);

  if (earned) {
    return `This clip rates ${clip.emotional_intensity}/10 emotionally — ${fit}% alignment with your persona’s preference for ${pref}. The threshold was met, so intensity contributes +${SCORE_INTENSITY} to the score.`;
  }

  return `At ${clip.emotional_intensity}/10, this clip is only ${fit}% aligned with your preference for ${pref}. Intensity did not add points because the moment sits outside that band.`;
}

type PersonaBoostAnalysis = {
  earnedPoints: number;
  maxPoints: number;
  factorPercent: number;
  matchedSubtags: string[];
  matchedViaCategory: string[];
  missedBoosts: string[];
  summary: string;
  tooltip: string;
};

function analyzePersonaBoosts(
  clip: RankedSegment,
  profileId: ProfileId,
  breakdown: ScoreBreakdown,
): PersonaBoostAnalysis {
  const profile = PREFERENCE_PROFILES[profileId];
  const slotCount = profile.subtag_boosts.length;
  const maxPoints = slotCount * SCORE_SUBTAG;

  const matchedSubtags: string[] = [];
  const matchedViaCategory: string[] = [];

  for (const key of Object.keys(breakdown)) {
    if (key.startsWith("subtag_")) matchedSubtags.push(key.slice(7));
    if (key.startsWith("category_")) matchedViaCategory.push(key.slice(9));
  }

  const earnedSlots = matchedSubtags.length + matchedViaCategory.length;
  const earnedPoints =
    matchedSubtags.length * SCORE_SUBTAG + matchedViaCategory.length * SCORE_SUBTAG;
  const factorPercent =
    slotCount > 0 ? Math.round((earnedSlots / slotCount) * 100) : 0;

  const onClip = new Set((clip.subtags ?? []).map((t) => normalizeSubtag(t)));
  const presentBoosts = profile.subtag_boosts.filter((b) => onClip.has(b));
  const missedBoosts = profile.subtag_boosts.filter((b) => !presentBoosts.includes(b));

  const personaName = PROFILE_LABELS[profileId];
  const lookingFor = listLabels(profile.subtag_boosts);

  let summary: string;

  if (earnedSlots === 0) {
    summary = `Your ${personaName} persona favors ${lookingFor}. None of those moment types scored a boost on this clip.`;
  } else if (matchedSubtags.length > 0 && matchedViaCategory.length === 0) {
    summary = `${earnedSlots} of ${slotCount} persona moment boosts applied — ${listLabels(matchedSubtags)} matched what you’re looking for. Still missing: ${listLabels(missedBoosts)}.`;
  } else if (matchedViaCategory.length > 0 && matchedSubtags.length === 0) {
    summary = `${earnedSlots} of ${slotCount} persona boosts — no exact moment-type hit, but ${listLabels(matchedViaCategory)} shows up as a related theme on this clip. Missing moment types: ${listLabels(missedBoosts)}.`;
  } else {
    summary = `${earnedSlots} of ${slotCount} persona boosts — ${listLabels(matchedSubtags)} plus related theme ${listLabels(matchedViaCategory)}. Missing: ${listLabels(missedBoosts)}.`;
  }

  const tooltip = [
    `${personaName} prioritizes these moment types: ${lookingFor}.`,
    presentBoosts.length > 0
      ? `Tags on this clip include: ${listLabels(presentBoosts)}.`
      : `This clip’s tags don’t include your top three moment types.`,
    earnedSlots > 0
      ? `Scoring credited ${earnedSlots} alignment slot(s) at +${SCORE_SUBTAG} each.`
      : "No subtag alignment points were awarded.",
  ].join(" ");

  return {
    earnedPoints,
    maxPoints,
    factorPercent,
    matchedSubtags,
    matchedViaCategory,
    missedBoosts,
    summary,
    tooltip,
  };
}

export function normalizeMatchScore(matchScore: number): number {
  return Math.min(100, Math.round((matchScore / MATCH_SCORE_CEILING) * 100));
}

export function matchScoreTier(normalized: number): "low" | "mid" | "high" | "peak" {
  if (normalized >= 85) return "peak";
  if (normalized >= 65) return "high";
  if (normalized >= 40) return "mid";
  return "low";
}

export const MATCH_SCORE_TIER_COLORS: Record<
  ReturnType<typeof matchScoreTier>,
  { text: string; ring: string; bg: string }
> = {
  low: { text: "text-text-tertiary", ring: "stroke-text-tertiary", bg: "bg-card" },
  mid: { text: "text-amber-600", ring: "stroke-amber-500", bg: "bg-amber-50" },
  high: { text: "text-accent", ring: "stroke-accent", bg: "bg-accent-light" },
  peak: { text: "text-emerald-700", ring: "stroke-emerald-600", bg: "bg-emerald-50" },
};

export function getBreakdownDisplayItems(
  clip: RankedSegment,
  profileId: ProfileId,
  options?: { showName?: string },
): BreakdownDisplayItem[] {
  const showName = options?.showName?.trim() || clip.show_name?.trim() || "this series";
  const profile = PREFERENCE_PROFILES[profileId];
  const breakdown = clip.score_breakdown;
  const total = clip.match_score || 1;
  const styles = BREAKDOWN_STYLES;

  const persona = analyzePersonaBoosts(clip, profileId, breakdown);
  const intensityEarned = breakdown.intensity ?? 0;
  const intensityFit = intensityFitPercent(clip.emotional_intensity, profile.intensity_preference);
  const jockeyEarned = breakdown.jockey ?? 0;

  const items: BreakdownDisplayItem[] = [
    {
      key: "base",
      kind: "base",
      label: "Category match",
      summary: `Included because ${formatLabel(clip.primary_category)} is a core category for ${PROFILE_LABELS[profileId]}. Every in-feed clip starts here.`,
      points: breakdown.base ?? SCORE_BASE,
      maxPoints: SCORE_BASE,
      factorPercent: 100,
      sharePercent: Math.min(100, Math.round(((breakdown.base ?? SCORE_BASE) / total) * 100)),
      tooltip: `Primary category “${formatLabel(clip.primary_category)}” is in your persona’s feed categories, so the clip receives the base +${SCORE_BASE} relevance score.`,
      ...styles.base,
    },
    {
      key: "persona",
      kind: "persona",
      label: "Persona moment fit",
      summary: persona.summary,
      points: persona.earnedPoints,
      maxPoints: persona.maxPoints,
      factorPercent: persona.factorPercent,
      sharePercent: Math.min(100, Math.round((persona.earnedPoints / total) * 100)),
      tooltip: persona.tooltip,
      ...styles.persona,
    },
    {
      key: "intensity",
      kind: "intensity",
      label: "Intensity fit",
      summary: intensitySummary(clip, profile.intensity_preference, intensityEarned > 0),
      points: intensityEarned,
      maxPoints: SCORE_INTENSITY,
      factorPercent: intensityFit,
      sharePercent: Math.min(100, Math.round((intensityEarned / total) * 100)),
      tooltip: intensitySummary(clip, profile.intensity_preference, intensityEarned > 0),
      ...styles.intensity,
    },
    {
      key: "jockey",
      kind: "jockey",
      label: "Jockey boost",
      summary: jockeyBoostSummary(showName, Boolean(clip.jockey_boost)),
      points: jockeyEarned,
      maxPoints: SCORE_JOCKEY,
      factorPercent: clip.jockey_boost ? 100 : 0,
      sharePercent: Math.min(100, Math.round((jockeyEarned / total) * 100)),
      tooltip: `${JOCKEY_PRODUCT_TOOLTIP} Show context: ${showName}.`,
      showTwelveLabsMark: true,
      ...styles.jockey,
    },
  ];

  return items;
}
