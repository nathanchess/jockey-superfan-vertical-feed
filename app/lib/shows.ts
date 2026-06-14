/** Catalog of shows with bundled feed manifests. Add entries as you sync new seasons. */

export const SHOWS = {
  kn: {
    id: "kn",
    label: "Kitchen Nightmares",
    shortLabel: "KN",
    manifestFile: "kn_feed_manifest.json",
    /** Marengo index ID — hardcoded (not a secret; useless without TL_API_KEY) */
    indexId: "6a2dba984c3eea0190eb15d2",
    /** Env var that holds this show's Jockey KS ID */
    ksEnv: "TL_KS_ID_KN",
  },
  tiwbg: {
    id: "tiwbg",
    label: "The Island with Bear Grylls",
    shortLabel: "TIWBG",
    manifestFile: "tiwbg_feed_manifest.json",
    indexId: "6a2db9ab363f9692ab328682",
    ksEnv: "TL_KS_ID_TIWBG",
  },
  rhoslc: {
    id: "rhoslc",
    label: "The Real Housewives of Salt Lake City",
    shortLabel: "RHOSLC",
    manifestFile: "rhoslc_feed_manifest.json",
    indexId: "6a14a5a034a962bb1b63c81f",
    ksEnv: "TL_KS_ID_RHOSLC",
    /** Require a password before switching to this show */
    passwordProtected: true,
  },
} as const;

export type ShowId = keyof typeof SHOWS;

export const DEFAULT_SHOW_ID: ShowId = "kn";

export const SHOW_LIST = Object.values(SHOWS);

export function isShowId(value: string): value is ShowId {
  return value in SHOWS;
}

export function resolveShowId(value: string | null | undefined): ShowId {
  if (value && isShowId(value)) return value;
  return DEFAULT_SHOW_ID;
}

export function getShowConfig(showId: ShowId) {
  return SHOWS[showId];
}

/** Marengo index for a show — read from hardcoded indexId field. */
export function getShowIndexId(showId: ShowId): string {
  return SHOWS[showId].indexId;
}

/** Jockey knowledge store for a show (per-show env name or legacy TL_KS_ID). */
export function getShowKsId(showId: ShowId): string | null {
  const show = SHOWS[showId];
  return process.env[show.ksEnv]?.trim() || process.env.TL_KS_ID?.trim() || null;
}

/** Whether this show requires a password before switching to it. */
export function isPasswordProtected(showId: ShowId): boolean {
  return !!(SHOWS[showId] as { passwordProtected?: boolean }).passwordProtected;
}
