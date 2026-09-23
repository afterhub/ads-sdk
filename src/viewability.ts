/**
 * The billing rule, measured here and re-checked by the server: at least half
 * of the creative on screen for one continuous second.
 */
export const MIN_VISIBLE_RATIO = 0.5;
export const MIN_VISIBLE_MS = 1000;

export interface Clock {
  now(): number;
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

/**
 * Feed it every intersection ratio; it calls back once, when the ratio has
 * stayed at or above the minimum for the minimum duration without a break.
 */
export function viewabilityTimer(onViewable: (ms: number, ratio: number) => void, clock: Clock) {
  let since: number | null = null;
  let lastRatio = 0;
  let handle: unknown = null;
  let done = false;

  const cancel = () => {
    if (handle !== null) clock.clearTimeout(handle);
    handle = null;
    since = null;
  };

  return {
    update(ratio: number): void {
      if (done) return;
      lastRatio = ratio;

      if (ratio < MIN_VISIBLE_RATIO) {
        cancel();
        return;
      }

      if (since !== null) return;

      since = clock.now();
      handle = clock.setTimeout(() => {
        done = true;
        onViewable(Math.round(clock.now() - (since as number)), lastRatio);
      }, MIN_VISIBLE_MS);
    },
    stop(): void {
      done = true;
      cancel();
    },
  };
}
