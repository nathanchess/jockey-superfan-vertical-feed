/**
 * Module-level HLS.js singleton loader.
 *
 * Calling `loadHls()` always returns the same promise so Turbopack/Webpack
 * compiles the hls.js chunk exactly once per page load — subsequent calls
 * are instant cache hits and never show "Compiling…" in the browser.
 */
import type HlsType from "hls.js";

type HlsConstructor = typeof HlsType;

let _promise: Promise<HlsConstructor> | null = null;

export function loadHls(): Promise<HlsConstructor> {
  if (!_promise) {
    _promise = import("hls.js")
      .then((m) => m.default)
      .catch((err) => {
        // Reset so a retry is possible next time
        _promise = null;
        throw err;
      });
  }
  return _promise;
}

/** Call once at page mount to pre-warm the Turbopack chunk immediately. */
export function preWarmHls(): void {
  if (typeof window === "undefined") return;
  loadHls().catch(() => {/* ignore — will retry on first real use */});
}
