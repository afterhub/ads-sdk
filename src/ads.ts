declare const __VERSION__: string;

export const SELECTOR = '[data-ads-placement]';

export interface AfterAds {
  readonly version: string;
  /** Claim a placement element. Returns false if it is already mounted or not a placement. */
  mount(el: Element): boolean;
  /** Ask for a new ad in an already mounted placement. */
  refresh(el: Element): boolean;
  /** Empty the placement and forget it, so it can be mounted again. */
  destroy(el: Element): boolean;
}

// The host page must never see our exceptions: on any failure the slot stays empty.
function guarded<A extends unknown[]>(fn: (...args: A) => boolean): (...args: A) => boolean {
  return (...args) => {
    try {
      return fn(...args);
    } catch {
      return false;
    }
  };
}

export function createAds(): AfterAds {
  const mounted = new WeakSet<Element>();

  return {
    version: typeof __VERSION__ === 'string' ? __VERSION__ : 'dev',

    mount: guarded((el) => {
      if (mounted.has(el) || !el.getAttribute('data-ads-placement')) return false;
      mounted.add(el);
      // ponytail: no ad request yet, the delivery endpoint contract is not published.
      return true;
    }),

    refresh: guarded((el) => mounted.has(el)),

    destroy: guarded((el) => {
      if (!mounted.delete(el)) return false;
      el.replaceChildren();
      return true;
    }),
  };
}
