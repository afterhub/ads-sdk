import { DEV, diagnose } from './dev.ts';
import { render } from './render.ts';
import { beacon, decide, type Event, type Fill, type SlotRequest } from './transport.ts';
import { viewabilityTimer, type Clock } from './viewability.ts';

declare const __VERSION__: string;

export const SELECTOR = '[data-ads-placement]';

export interface Slot {
  readonly element: Element;
  readonly placement: string;
  /** Ask for a new ad in this slot. */
  refresh(): void;
  /** Empty the slot and release it, so it can be mounted again. */
  destroy(): void;
}

export interface MountOptions {
  /** Placement ID; defaults to the element's `data-ads-placement`. */
  placement?: string;
  /** Website ID; defaults to the element's `data-ads-website`. */
  website?: string;
}

export interface AfterAds {
  readonly version: string;
  /** Resolves once the SDK is ready. Safe to call before or after load. */
  ready(): Promise<AfterAds>;
  /** Claim a placement. Returns null if the target is missing, has no IDs, or is already mounted. */
  mount(target: string | Element, options?: MountOptions): Slot | null;
  /**
   * Consent for optional tracking features, from the host's consent manager.
   * Off until granted. Nothing the SDK does today needs it: it sets no cookie
   * and sends no identifier, and the events it sends are needed for billing.
   */
  consent(granted: boolean): void;
  /** Whether optional tracking features may run. */
  readonly consented: boolean;
}

export interface Intersection {
  isIntersecting: boolean;
  ratio: number;
}

/** Everything the SDK touches outside itself, so it can run and be tested anywhere. */
export interface Env {
  doc: Document;
  base: string;
  fetch: Parameters<typeof decide>[4];
  sendBeacon: (url: string, data: Blob) => boolean;
  sleep: (ms: number) => Promise<void>;
  clock: Clock;
  /** Observe an element; returns a function that stops observing. */
  observe(element: Element, callback: (entry: Intersection) => void, options: { rootMargin?: string; threshold: number[] }): () => void;
}

/** Start loading an ad this far before the slot scrolls into view. */
const LAZY_MARGIN = '200px';
const VIEWABILITY_THRESHOLDS = [0, 0.25, 0.5, 0.75, 1];

// The host page must never see our exceptions: on any failure the slot stays empty.
function guarded<A extends unknown[], R>(fallback: R, fn: (...args: A) => R): (...args: A) => R {
  return (...args) => {
    try {
      return fn(...args);
    } catch (error) {
      if (DEV) diagnose('swallowed an error so the host page never sees it', error);
      return fallback;
    }
  };
}

interface State {
  element: Element;
  placement: string;
  website: string;
  /** Bumped on refresh/destroy, so a late response for an old request is ignored. */
  generation: number;
  cleanups: Array<() => void>;
}

export function createAds(env: Env): AfterAds {
  const version = typeof __VERSION__ === 'string' ? __VERSION__ : 'dev';
  const mounted = new Map<Element, State>();
  let queue: Array<{ state: State; generation: number }> = [];
  let flushScheduled = false;
  let consented = false;

  const teardown = (state: State) => {
    state.generation++;
    state.cleanups.splice(0).forEach((cleanup) => cleanup());
    state.element.replaceChildren();
  };

  const send = (events: Event[]) => beacon(env.base, events, env.sendBeacon);

  const show = (state: State, fill: Fill) => {
    const image = render(state.element, fill.creative, env.doc);

    image.addEventListener(
      'error',
      () => {
        if (DEV) diagnose(`creative image failed to load for placement ${state.placement}`, fill.creative.image);
        teardown(state);
      },
      { once: true },
    );
    image.addEventListener(
      'load',
      guarded(undefined, () => {
        send([{ t: 'rendered', k: fill.token }]);

        const timer = viewabilityTimer((ms, ratio) => {
          send([{ t: 'viewable', k: fill.token, ms, r: Math.round(ratio * 100) / 100 }]);
          stop();
        }, env.clock);
        const unobserve = env.observe(image, (entry) => timer.update(entry.isIntersecting ? entry.ratio : 0), {
          threshold: VIEWABILITY_THRESHOLDS,
        });
        const stop = () => {
          timer.stop();
          unobserve();
        };

        state.cleanups.push(stop);
      }),
      { once: true },
    );
  };

  // Every slot mounted in the same tick shares one decision request per website.
  const flush = guarded(undefined, () => {
    flushScheduled = false;
    const batch = queue;
    queue = [];

    const byWebsite = new Map<string, typeof batch>();
    for (const item of batch) {
      byWebsite.set(item.state.website, [...(byWebsite.get(item.state.website) ?? []), item]);
    }

    byWebsite.forEach((items, website) => {
      const slots: SlotRequest[] = items.map(({ state }) => ({
        placement: state.placement,
        width: state.element.getBoundingClientRect().width,
      }));

      decide(env.base, website, slots, version, env.fetch, env.sleep)
        .then((decisions) => {
          for (const { state, generation } of items) {
            const decision = decisions.get(state.placement);
            const current = state.generation === generation && mounted.get(state.element) === state;
            if (decision?.fill && current) {
              guarded(undefined, show)(state, decision);
            } else if (DEV && current) {
              diagnose(
                decision
                  ? `no fill for placement ${state.placement}`
                  : `no decision for placement ${state.placement}: request failed, or the placement is not on website ${website}`,
              );
            }
          }
        })
        .catch(() => undefined);
    });
  });

  const request = (state: State) => {
    queue.push({ state, generation: state.generation });

    if (!flushScheduled) {
      flushScheduled = true;
      env.clock.setTimeout(flush, 0);
    }
  };

  // Lazy: ask for an ad only once the slot is near the viewport.
  const requestWhenNear = (state: State) => {
    let stopped = false;
    const unobserve = env.observe(
      state.element,
      (entry) => {
        if (!entry.isIntersecting || stopped) return;
        stopped = true;
        unobserve();
        request(state);
      },
      { rootMargin: LAZY_MARGIN, threshold: [0] },
    );

    state.cleanups.push(() => {
      stopped = true;
      unobserve();
    });
  };

  const ads: AfterAds = {
    version,

    ready: () => Promise.resolve(ads),

    get consented() {
      return consented;
    },

    consent: guarded(undefined, (granted: boolean) => {
      consented = granted === true;
    }),

    mount: guarded(null, (target: string | Element, options: MountOptions = {}): Slot | null => {
      const element = typeof target === 'string' ? env.doc.querySelector(target) : target;
      if (!element) {
        if (DEV) diagnose('mount target not found', target);
        return null;
      }
      if (mounted.has(element)) {
        if (DEV) diagnose('already mounted; destroy() it first to mount again', element);
        return null;
      }

      const placement = options.placement ?? element.getAttribute('data-ads-placement');
      const website = options.website ?? element.getAttribute('data-ads-website');
      if (!placement || !website) {
        if (DEV) diagnose('slot needs both data-ads-website and data-ads-placement', element);
        return null;
      }

      const state: State = { element, placement, website, generation: 0, cleanups: [] };
      mounted.set(element, state);
      requestWhenNear(state);

      return {
        element,
        placement,
        refresh: guarded(undefined, () => {
          if (mounted.get(element) !== state) return;
          teardown(state);
          request(state);
        }),
        destroy: guarded(undefined, () => {
          if (mounted.get(element) !== state) return;
          teardown(state);
          mounted.delete(element);
        }),
      };
    }),
  };

  return ads;
}
