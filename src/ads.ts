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
}

export interface AfterAds {
  readonly version: string;
  /** Resolves once the SDK is ready. Safe to call before or after load. */
  ready(): Promise<AfterAds>;
  /** Claim a placement. Returns null if the target is missing, has no placement ID, or is already mounted. */
  mount(target: string | Element, options?: MountOptions): Slot | null;
}

type Lookup = (selector: string) => Element | null;

// The host page must never see our exceptions: on any failure the slot stays empty.
function guarded<A extends unknown[], R>(fallback: R, fn: (...args: A) => R): (...args: A) => R {
  return (...args) => {
    try {
      return fn(...args);
    } catch {
      return fallback;
    }
  };
}

export function createAds(lookup: Lookup = (selector) => document.querySelector(selector)): AfterAds {
  const mounted = new WeakSet<Element>();

  const ads: AfterAds = {
    version: typeof __VERSION__ === 'string' ? __VERSION__ : 'dev',

    ready: () => Promise.resolve(ads),

    mount: guarded(null, (target: string | Element, options: MountOptions = {}): Slot | null => {
      const element = typeof target === 'string' ? lookup(target) : target;
      if (!element || mounted.has(element)) return null;

      const placement = options.placement ?? element.getAttribute('data-ads-placement');
      if (!placement) return null;

      mounted.add(element);

      return {
        element,
        placement,
        // ponytail: no ad request yet, the delivery endpoint contract is not published.
        refresh: guarded(undefined, () => {}),
        destroy: guarded(undefined, () => {
          if (mounted.delete(element)) element.replaceChildren();
        }),
      };
    }),
  };

  return ads;
}
