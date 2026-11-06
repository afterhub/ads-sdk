declare const __DEV__: boolean;

/**
 * True only in the development build (`npm run build:dev`). Every diagnostic
 * sits behind `if (DEV)`, so the production build drops it, strings and all.
 */
export const DEV: boolean = typeof __DEV__ !== 'undefined' && __DEV__;

/**
 * Why a slot stayed empty, for whoever is integrating the tag. A no-op in
 * production: tree-shaking runs before `if (DEV)` folds, so the body must
 * depend on DEV itself or it ships unused.
 */
export const diagnose: (message: string, ...detail: unknown[]) => void = DEV
  ? (message, ...detail) => console.warn(`[AfterAds] ${message}`, ...detail)
  : () => undefined;
